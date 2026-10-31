// Keeps the game playable without a connection once it has been opened.
// Publishing replaces 'dev' with the commit, so every release installs a fresh copy.
const VERSION = 'dev';
const CACHE = `collapse-${VERSION}`;
const FONTS = 'collapse-fonts';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;650;700&family=Space+Grotesk:wght@400;500;600;700&display=swap';
// Every file in dist/ except this one; test/offline.test.js keeps the list complete.
const FILES = ["./", "index.html", "manifest.webmanifest", "favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "styles.css", "journey.css", "round-tally.css", "block-effects.css", "classic-stars.css", "gold.css", "puzzle.css", "celebrations.css", "challenges.css", "app.js", "engine.js", "board-hit.js", "block-danger.js", "celebrations.js", "challenge-panel.js", "challenges.js", "classic-progress.js", "classic-stars.js", "gold-picker.js", "gold.js", "journey.js", "modifiers.js", "objectives.js", "puzzle-hints.js", "puzzle-progress.js", "puzzle-stars.js", "puzzles.js", "round-tally.js"];

/** Stores the fonts up front so the first offline launch already looks right. A failure only means system fonts. */
async function cacheFonts() {
  const cache = await caches.open(FONTS);
  const response = await fetch(FONT_CSS);
  const css = await response.clone().text();
  await cache.put(FONT_CSS, response);
  await cache.addAll(css.match(/https:\/\/fonts\.gstatic\.com\/[^)'"\s]+/g) || []);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Skip the browser's own cache so a release never mixes in files from the one before.
    await cache.addAll(FILES.map(file => new Request(file, { cache: 'reload' })));
    await cacheFonts().catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Other sites can share this origin, so only this game's old copies are removed.
    for (const key of await caches.keys()) if (key.startsWith('collapse-') && key !== CACHE && key !== FONTS) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === location.origin) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(request.mode === 'navigate' ? './' : request, { ignoreSearch: true })).then(hit => hit || fetch(request)));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(caches.open(FONTS).then(async cache => (await cache.match(request, { ignoreVary: true })) || fetch(request).then(response => {
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    })));
  }
});
