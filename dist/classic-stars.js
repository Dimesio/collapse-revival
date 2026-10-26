// Approved 2026-10-26. Derived from 5,400 reference runs; provisional targets are flagged.
export const CLASSIC_SCORING_VERSION = 'classic-stars-v1';
export const CLASSIC_DIFFICULTY_MULTIPLIERS = Object.freeze({ easy: 1, normal: 2.1, hard: 3.55 });
const TARGETS = {"easy":[[19600,30150,0],[22850,35100,0],[26100,40150,0],[29250,45000,0],[34100,52450,0],[38800,59650,0],[43300,66550,0],[47650,73300,0],[52400,80550,0],[57950,89150,0],[64000,98400,0],[71050,109300,0],[78750,121150,0],[84800,130400,0],[91550,140800,0],[99750,153400,0],[109300,168150,0],[117300,180400,0],[128150,197150,0],[135300,208100,0],[141350,217450,0],[147050,226200,0],[150600,231650,0],[156500,240750,0],[159850,245900,0],[165900,255200,0],[169800,261200,0],[173750,267250,0],[179600,276250,0],[183400,282150,0]],"normal":[[25300,38850,0],[28550,43850,1],[32650,50200,1],[36600,56250,1],[40250,61900,0],[48500,74550,1],[54100,83200,1],[59600,91650,1],[65500,100700,1],[75900,116750,0],[79950,123000,1],[88850,136650,1],[98450,151450,1],[105950,163000,1],[114400,176000,1],[124650,191750,1],[136600,210150,1],[146550,225450,1],[160200,246450,1],[169100,260100,1],[176700,271800,1],[183800,282750,1],[188250,289600,1],[195650,300950,1],[199800,307350,1],[207350,319000,1],[212250,326500,1],[217200,334100,1],[224450,345300,1],[229300,352700,1]],"hard":[[29350,45150,0],[34200,52600,1],[39150,60200,1],[43900,67500,1],[52000,79950,0],[58150,89450,1],[64950,99850,1],[71500,109950,1],[78600,120850,1],[86950,133750,1],[95950,147600,1],[106600,163950,1],[118150,181750,1],[127150,195600,1],[137250,211150,1],[149600,230100,1],[163950,252200,1],[175900,270550,1],[192250,295750,1],[202900,312150,1],[212000,326150,1],[220550,339300,1],[225900,347500,1],[234750,361150,1],[239800,368850,1],[248850,382800,1],[254700,391800,1],[260600,400900,1],[269400,414400,1],[275150,423250,1]]};
const levelNumber = value => Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
export const classicLevelMultiplier = level => Math.min(200, 100 + 5 * (levelNumber(level) - 1)) / 100;
export const classicBonusRowBudget = interval => Math.max(0, Math.ceil(5000 / interval + 5 - 1e-10) - 1);

export function getClassicTargets(level, difficulty = 'easy') {
  level = levelNumber(level);
  difficulty = Object.hasOwn(CLASSIC_DIFFICULTY_MULTIPLIERS, difficulty) ? difficulty : 'easy';
  let entry = TARGETS[difficulty][level - 1];
  if (!entry) {
    const easyReference = Math.max(313483, Math.round(112.13966049382717 * (324 + 36 * level) * classicLevelMultiplier(level)) - 620);
    const reference = easyReference * ({ easy: 1, normal: 1.25, hard: 1.5 }[difficulty]);
    const three = Math.ceil(reference * .9 / 50) * 50;
    entry = [Math.ceil(three * .65 / 50) * 50, three, 1];
  }
  return { version: CLASSIC_SCORING_VERSION, level, difficulty, twoStars: entry[0], threeStars: entry[1], provisional: Boolean(entry[2]), difficultyMultiplier: CLASSIC_DIFFICULTY_MULTIPLIERS[difficulty], levelMultiplier: classicLevelMultiplier(level) };
}

export function classicStarsForScore(points, completed, targets) {
  if (!completed) return 0;
  return points >= targets.threeStars ? 3 : points >= targets.twoStars ? 2 : 1;
}
