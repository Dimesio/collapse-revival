import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const worker = await readFile(new URL('sw.js', dist), 'utf8');
const files = JSON.parse(worker.match(/const FILES = (\[[^\]]*\]);/)[1]);

test('the offline copy includes every published file', async () => {
  const published = (await readdir(dist)).filter(name => name !== 'sw.js' && !name.startsWith('.')).sort();
  assert.deepEqual(files.filter(file => file !== './').sort(), published);
});

test('the offline copy opens at the start page', () => {
  assert.ok(files.includes('./'));
});

test('every home-screen icon is in the offline copy', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', dist), 'utf8'));
  for (const { src } of manifest.icons) assert.ok(files.includes(src), src);
});

test('publishing can stamp the release on the offline copy', () => {
  assert.match(worker, /^const VERSION = 'dev';$/m);
});
