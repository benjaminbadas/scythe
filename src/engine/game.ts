import {
  BANNED,
  BONUS_TILES,
  BOTTOM_ACTIONS,
  BOTTOM_RESOURCE,
  COMBAT_DECK,
  ENCOUNTERS,
  FACTIONS,
  FACTION_DEFS,
  FACTORY_CARDS,
  FACTORY_HEX,
  HEXES,
  MATS,
  MAT_IDS,
  MAX_DIAL,
  MAX_POPULARITY,
  MAX_POWER,
  OBJECTIVES,
  PRODUCES,
  RECRUIT_ONGOING,
  RESOURCES,
  SEATING,
  STARS_TO_END,
  STRUCTURES,
  STRUCTURE_ACTION,
  TOP_BASE,
  TOP_UPGRADES,
  WORKERS,
  baseHex,
  bonusCoins,
  produceCost,
  scoreTier,
  type BonusTile,
  type BottomAction,
  type CardOption,
  type Cost,
  type Faction,
  type Gain,
  type MatId,
  type MechAbility,
  type ObjectiveId,
  type RecruitOnce,
  type Resource,
  type StarKind,
  type Structure,
  type Terrain,
  type TopAction,
  type TopUpgrade,
} from './data';
import { LAKES, NEIGHBORS, inactiveBases, isTerritory, landNeighbors, longestRow, steps, type MoveContext } from './board';
import { randInt, shuffle, type Rng } from './random';

// ——— État ———————————————————————————————————————————————————————————————————

export type ResCounts = Record<Resource, number>;

export interface Player {
  name: string;
  /** Joueur tenu par l'ordinateur. */
  ai?: boolean;
  faction: Faction;
  mat: MatId;
  coins: number;
  popularity: number;
  power: number;
  /** Cartes Combat en main (valeurs). */
  hand: number[];
  /** Case du personnage. */
  character: number;
  /** Cases des méchas déployés. */
  mechs: number[];
  /** Méchas sortis de la fiche faction (capacité débloquée), dans l'ordre de la fiche. */
  mechDeployed: [boolean, boolean, boolean, boolean];
  /** Cases des ouvriers sur le plateau (les autres sont sur la fiche). */
  workers: number[];
  /** Case de chaque structure construite (null : encore sur la fiche). */
  structures: Record<Structure, number | null>;
  /** Cubes encore présents en haut de la fiche (false : case améliorée). */
  topCubes: Record<TopUpgrade, boolean>;
  /** Cubes posés sur les coûts du bas (réductions). */
  bottomCubes: Record<BottomAction, number>;
  /** Recrues enrôlées, par action du bas d'où elles viennent. */
  recruits: Record<BottomAction, boolean>;
  /** Bonus immédiats de recrue déjà pris. */
  recruitBonus: Record<RecruitOnce, boolean>;
  stars: Partial<Record<StarKind, number>>;
  objectives: ObjectiveId[];
  factoryCard: number | null;
  /** Section choisie au tour précédent (4 : carte Usine). */
  lastSection: number | null;
}

export type UnitRef = { k: 'character' } | { k: 'mech'; i: number } | { k: 'worker'; i: number };

export interface CombatChoice {
  power: number;
  /** Indices des cartes jouées dans la main. */
  cards: number[];
}

export type Pending =
  | { k: 'combat'; hex: number; attacker: number; defender: number; started: boolean; att?: CombatChoice; def?: CombatChoice }
  | { k: 'encounter'; card: number }
  | { k: 'factory' };

export interface Turn {
  /** Joueur qui doit agir maintenant (le défenseur pendant son choix de combat). */
  player: number;
  /** Joueur dont c'est le tour. */
  active: number;
  section: number | null;
  stage: 'section' | 'top' | 'moving' | 'resolve' | 'bottom' | 'end';
  /** Déplacements restants de l'action en cours. */
  movesLeft: number;
  /** Déplacement du bas d'une carte Usine (une seule unité, jusqu'à 2 pas). */
  factoryMove: boolean;
  /** Unités déplacées pendant l'action en cours, avec leur case de départ. */
  moved: { unit: UnitRef; from: number }[];
  pending: Pending[];
  /** Où aller une fois les combats, rencontres et Usine réglés. */
  after: 'bottom' | 'end';
  /** Rencontre et Usine déjà examinées pour ce déplacement. */
  checkedVisit: boolean;
  coercionUsed: boolean;
  /** Ouvriers adverses forcés à la retraite ce tour-ci (objectif « Renvoyer quelqu'un… »). */
  forcedRetreat: number;
  /** Dernier combat résolu (pour l'affichage). */
  lastCombat: CombatResult | null;
}

export interface CombatResult {
  hex: number;
  attacker: number;
  defender: number;
  att: { power: number; cards: number[] };
  def: { power: number; cards: number[] };
  winner: number;
}

export interface Board {
  res: ResCounts[];
  encounters: boolean[];
  structures: ({ player: number; kind: Structure } | null)[];
}

export interface FinalScore {
  player: number;
  coins: number;
  stars: number;
  territories: number;
  resources: number;
  bonus: number;
  total: number;
}

export interface LogEntry {
  turn: number;
  player: number | null;
  text: string;
}

export interface GameState {
  version: 1;
  rng: Rng;
  players: Player[];
  board: Board;
  combatDeck: number[];
  combatDiscard: number[];
  encounterDeck: number[];
  objectiveDeck: ObjectiveId[];
  /** Cartes Usine encore disponibles (indices dans FACTORY_CARDS). */
  factoryPool: number[];
  bonusTile: BonusTile;
  /** Joueurs dans l'ordre de la table (sens horaire), qui est l'ordre de jeu. */
  order: number[];
  /** Premier joueur (plus petit numéro de fiche joueur). */
  first: number;
  turnCount: number;
  turn: Turn | null;
  status: 'playing' | 'finished';
  final: FinalScore[] | null;
  log: LogEntry[];
}

export type Choice = {
  res?: Partial<ResCounts>;
  upgrade?: { from: TopUpgrade; to: BottomAction };
  mech?: number;
  structure?: Structure;
  enlist?: { section: BottomAction; bonus: RecruitOnce };
  /** Case choisie quand le gain ne se place pas sur la case du personnage. */
  hex?: number;
};

export type Action =
  | { t: 'section'; i: number }
  | { t: 'skipTop' }
  | { t: 'startMove' }
  | { t: 'gain' }
  | { t: 'move'; unit: UnitRef; path: number[]; workers?: number[]; res?: Partial<ResCounts> }
  | { t: 'endMove' }
  | { t: 'trade'; res: Partial<ResCounts>; hex: number }
  | { t: 'tradePop' }
  | { t: 'produce'; hexes: number[]; noMill?: boolean; workers?: Record<number, number> }
  | { t: 'bolster'; what: 'power' | 'cards' }
  | { t: 'factoryTop'; option: number; choice?: Choice }
  | { t: 'upgrade'; from?: TopUpgrade; to?: BottomAction }
  | { t: 'deploy'; mech?: number; hex?: number }
  | { t: 'build'; structure?: Structure; hex?: number }
  | { t: 'enlist'; section?: BottomAction; bonus?: RecruitOnce }
  | { t: 'factoryMove' }
  | { t: 'combat'; power: number; cards: number[] }
  | { t: 'encounter'; picks: { option: number; choice?: Choice }[] }
  | { t: 'pickFactory'; card: number }
  | { t: 'objective'; i: number }
  | { t: 'endTurn' };

export class RuleError extends Error {}

function fail(msg: string): never {
  throw new RuleError(msg);
}

function log(s: GameState, player: number | null, text: string) {
  s.log.push({ turn: s.turnCount, player, text });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

export const RES_NAMES: Record<Resource, string> = { food: 'nourriture', wood: 'bois', metal: 'métal', oil: 'pétrole' };
export const TERRAIN_NAMES: Record<Terrain, string> = {
  farm: 'ferme',
  forest: 'forêt',
  mountain: 'montagne',
  tundra: 'toundra',
  village: 'village',
  lake: 'lac',
  factory: 'Usine',
};
export const STRUCTURE_NAMES: Record<Structure, string> = { mine: 'Mine', monument: 'Monument', mill: 'Moulin', armory: 'Arsenal' };
export const BOTTOM_NAMES: Record<BottomAction, string> = { upgrade: 'Améliorer', deploy: 'Déployer', build: 'Construire', enlist: 'Enrôler' };
export const TOP_NAMES: Record<TopAction, string> = { move: 'Déplacer', trade: 'Échanger', produce: 'Produire', bolster: 'Renforcer' };

export function emptyRes(): ResCounts {
  return { food: 0, wood: 0, metal: 0, oil: 0 };
}

// ——— Mise en place ———————————————————————————————————————————————————————————

export interface SetupOptions {
  ai?: boolean[];
  /** Faction imposée par place (null : tirage). */
  factions?: (Faction | null)[];
  mats?: (MatId | null)[];
}

export function newGame(names: string[], seed: number, opts: SetupOptions = {}): GameState {
  const n = names.length;
  if (n < 2 || n > 5) fail('De 2 à 5 joueurs.');
  const rng: Rng = { seed };

  // Factions : celles imposées, puis tirage parmi les autres.
  const chosenF = opts.factions ?? [];
  const freeF = shuffle(rng, FACTIONS.filter((f) => !chosenF.includes(f)));
  const factions = names.map((_, i) => chosenF[i] ?? freeF.shift()!);
  if (new Set(factions).size !== n) fail('Chaque joueur doit avoir une faction différente.');

  const chosenM = opts.mats ?? [];
  let mats: MatId[] = [];
  for (let attempt = 0; attempt < 200; attempt++) {
    const freeM = shuffle(rng, MAT_IDS.filter((m) => !chosenM.includes(m)));
    mats = names.map((_, i) => chosenM[i] ?? freeM.shift()!);
    const banned = mats.some((m, i) => BANNED.some(([f, bm]) => f === factions[i] && bm === m && !chosenM[i]));
    if (!banned) break;
  }
  if (new Set(mats).size !== n) fail('Chaque joueur doit avoir une fiche différente.');

  const combatDeck = shuffle(rng, [...COMBAT_DECK]);
  const objectiveDeck = shuffle(rng, [...OBJECTIVES]);

  const seats = names.map((name, i) => ({ name, ai: !!opts.ai?.[i], faction: factions[i], mat: mats[i] }));

  const players: Player[] = seats.map(({ name, ai, faction, mat }) => {
    const f = FACTION_DEFS[faction];
    const m = MATS[mat];
    const base = baseHex(faction);
    const hand: number[] = [];
    for (let k = 0; k < f.cards; k++) hand.push(combatDeck.pop()!);
    return {
      name,
      ai: ai || undefined,
      faction,
      mat,
      coins: m.coins,
      popularity: m.popularity,
      power: f.power,
      hand,
      character: base,
      mechs: [],
      mechDeployed: [false, false, false, false],
      workers: landNeighbors(base),
      structures: { mine: null, monument: null, mill: null, armory: null },
      topCubes: { move: true, gain: true, popularity: true, power: true, cards: true, produce: true },
      bottomCubes: { upgrade: 0, deploy: 0, build: 0, enlist: 0 },
      recruits: { upgrade: false, deploy: false, build: false, enlist: false },
      recruitBonus: { power: false, coins: false, popularity: false, cards: false },
      stars: {},
      objectives: [objectiveDeck.pop()!, objectiveDeck.pop()!],
      factoryCard: null,
      lastSection: null,
    };
  });

  let first = 0;
  players.forEach((p, i) => {
    if (MATS[p.mat].number < MATS[players[first].mat].number) first = i;
  });
  // Ordre autour de la table selon les bases (sens horaire).
  const order = players.map((_, i) => i).sort((a, b) => SEATING.indexOf(players[a].faction) - SEATING.indexOf(players[b].faction));

  const s: GameState = {
    version: 1,
    rng,
    players,
    board: {
      res: HEXES.map(() => emptyRes()),
      encounters: HEXES.map((h) => h.encounter),
      structures: HEXES.map(() => null),
    },
    combatDeck,
    combatDiscard: [],
    encounterDeck: shuffle(rng, ENCOUNTERS.map((_, i) => i)),
    objectiveDeck,
    factoryPool: shuffle(rng, FACTORY_CARDS.map((_, i) => i)).slice(0, n + 1),
    bonusTile: BONUS_TILES[randInt(rng, BONUS_TILES.length)],
    order,
    first,
    turnCount: 0,
    turn: null,
    status: 'playing',
    final: null,
    log: [],
  };
  log(s, null, `Bonus de structures : ${BONUS_LABELS[s.bonusTile]}.`);
  startTurn(s, first);
  return s;
}

export const BONUS_LABELS: Record<BonusTile, string> = {
  adjTunnels: 'tunnels adjacents à vos structures',
  adjLakes: 'lacs adjacents à vos structures',
  adjEncounters: 'rencontres adjacentes à vos structures',
  onTunnels: 'structures sur des tunnels',
  inRow: 'structures alignées',
  onFarmTundra: 'structures sur fermes et toundras',
};

function startTurn(s: GameState, player: number) {
  s.turn = {
    player,
    active: player,
    section: null,
    stage: 'section',
    movesLeft: 0,
    factoryMove: false,
    moved: [],
    pending: [],
    after: 'bottom',
    checkedVisit: false,
    coercionUsed: false,
    forcedRetreat: 0,
    lastCombat: null,
  };
}

/** Joueur suivant (à gauche) et précédent (à droite) autour de la table. */
export function seatNeighbor(s: GameState, player: number, dir: 1 | -1): number {
  const n = s.order.length;
  const k = s.order.indexOf(player);
  return s.order[(k + dir + n) % n];
}

// ——— Lecture de l'état ———————————————————————————————————————————————————————

export function abilities(p: Player): Set<MechAbility> {
  const out = new Set<MechAbility>();
  p.mechDeployed.forEach((d, i) => d && out.add(FACTION_DEFS[p.faction].mechs[i]));
  return out;
}

/** Joueurs ayant des unités sur une case. */
export function unitsOn(s: GameState, hex: number): number[] {
  const out: number[] = [];
  s.players.forEach((p, i) => {
    if (p.character === hex || p.mechs.includes(hex) || p.workers.includes(hex)) out.push(i);
  });
  return out;
}

export function combatUnits(p: Player, hex: number): number {
  return (p.character === hex ? 1 : 0) + p.mechs.filter((m) => m === hex).length;
}

export function workersOn(p: Player, hex: number): number {
  return p.workers.filter((w) => w === hex).length;
}

/** Contrôleur d'un territoire : unités présentes, sinon propriétaire de la structure. */
export function controller(s: GameState, hex: number): number | null {
  if (!isTerritory(hex)) return null;
  const here = unitsOn(s, hex);
  if (here.length === 1) return here[0];
  if (here.length > 1) {
    // Combat à venir : le défenseur contrôle encore la case.
    const active = s.turn?.active;
    return here.find((i) => i !== active) ?? here[0];
  }
  return s.board.structures[hex]?.player ?? null;
}

export function controlledHexes(s: GameState, player: number): number[] {
  return HEXES.filter((h) => controller(s, h.id) === player).map((h) => h.id);
}

export function controlledRes(s: GameState, player: number): ResCounts {
  const out = emptyRes();
  for (const h of controlledHexes(s, player)) for (const r of RESOURCES) out[r] += s.board.res[h][r];
  return out;
}

export function totalRes(c: Partial<ResCounts>): number {
  return RESOURCES.reduce((a, r) => a + (c[r] ?? 0), 0);
}

export function starCount(p: Player): number {
  return Object.values(p.stars).reduce((a, b) => a + (b ?? 0), 0);
}

export function upgradesDone(p: Player): number {
  return TOP_UPGRADES.filter((u) => !p.topCubes[u]).length;
}

export function topValue(p: Player, u: TopUpgrade): number {
  return TOP_BASE[u] + (p.topCubes[u] ? 0 : 1);
}

export function bottomCost(p: Player, a: BottomAction): number {
  return MATS[p.mat].bottom[a].cost - p.bottomCubes[a];
}

export function bottomRoom(p: Player, a: BottomAction): number {
  const d = MATS[p.mat].bottom[a];
  return d.cost - d.min - p.bottomCubes[a];
}

export function recruitCount(p: Player): number {
  return BOTTOM_ACTIONS.filter((a) => p.recruits[a]).length;
}

export function structureCount(p: Player): number {
  return STRUCTURES.filter((k) => p.structures[k] !== null).length;
}

/** Section (colonne) d'une action sur la fiche : 0 à 3, ou 4 pour la carte Usine. */
export function sectionActions(p: Player, i: number): { top: TopAction | 'factory'; bottom: BottomAction | 'factoryMove' } {
  if (i === 4) return { top: 'factory', bottom: 'factoryMove' };
  return { top: MATS[p.mat].top[i], bottom: BOTTOM_ACTIONS[i] };
}

export function allowedSections(s: GameState, player: number): number[] {
  const p = s.players[player];
  const out = [0, 1, 2, 3];
  if (p.factoryCard !== null) out.push(4);
  if (p.faction === 'rusviet') return out.filter((i) => !(i === 4 && p.lastSection === 4));
  return out.filter((i) => i !== p.lastSection);
}

function moveContext(s: GameState, player: number): MoveContext {
  const p = s.players[player];
  return {
    faction: p.faction,
    abilities: abilities(p),
    controls: (hex) => controller(s, hex) === player,
    mine: p.structures.mine,
    inactiveBases: inactiveBases(s.players.map((q) => q.faction)),
    ownBase: baseHex(p.faction),
  };
}

function unitHex(p: Player, u: UnitRef): number {
  if (u.k === 'character') return p.character;
  if (u.k === 'mech') return p.mechs[u.i];
  return p.workers[u.i];
}

function setUnitHex(p: Player, u: UnitRef, hex: number) {
  if (u.k === 'character') p.character = hex;
  else if (u.k === 'mech') p.mechs[u.i] = hex;
  else p.workers[u.i] = hex;
}

function sameUnit(a: UnitRef, b: UnitRef): boolean {
  return a.k === b.k && (a.k === 'character' || (b.k !== 'character' && a.i === b.i));
}

function enemyUnits(s: GameState, player: number, hex: number): { combat: boolean; workers: boolean } {
  let combat = false;
  let workers = false;
  s.players.forEach((q, i) => {
    if (i === player) return;
    if (q.character === hex || q.mechs.includes(hex)) combat = true;
    if (q.workers.includes(hex)) workers = true;
  });
  return { combat, workers };
}

/** Longueur maximale d'un déplacement pour cette unité. */
export function maxSteps(s: GameState, player: number, kind: UnitRef['k']): number {
  const t = s.turn!;
  const speed = kind !== 'worker' && abilities(s.players[player]).has('speed') ? 1 : 0;
  return (t.factoryMove ? 2 : 1) + speed;
}

/**
 * Destinations possibles d'une unité pour l'action de déplacement en cours, avec le chemin pour y arriver.
 */
export function reachable(s: GameState, player: number, unit: UnitRef): Map<number, number[]> {
  const p = s.players[player];
  const ctx = moveContext(s, player);
  const from = unitHex(p, unit);
  const limit = maxSteps(s, player, unit.k);
  const out = new Map<number, number[]>();
  // Un ouvrier ne quitte pas seul une case occupée par un personnage ou mécha adverse.
  if (unit.k === 'worker' && enemyUnits(s, player, from).combat) return out;
  const frontier: { hex: number; path: number[] }[] = [{ hex: from, path: [] }];
  while (frontier.length) {
    const { hex, path } = frontier.shift()!;
    if (path.length >= limit) continue;
    for (const n of steps(ctx, unit.k, hex)) {
      if (n === from || out.has(n)) continue;
      const enemy = enemyUnits(s, player, n);
      if (unit.k === 'worker' && (enemy.combat || enemy.workers)) continue;
      if (unit.k === 'worker' && HEXES[n].terrain === 'lake') continue;
      const p2 = [...path, n];
      out.set(n, p2);
      const stops =
        enemy.combat || enemy.workers || (unit.k === 'character' && s.board.encounters[n]) || HEXES[n].base !== undefined;
      if (!stops) frontier.push({ hex: n, path: p2 });
    }
  }
  return out;
}

/** Unités que le joueur peut encore déplacer pendant l'action en cours. */
export function movableUnits(s: GameState, player: number): UnitRef[] {
  const t = s.turn!;
  if (t.stage !== 'moving' || t.movesLeft <= 0) return [];
  const p = s.players[player];
  const units: UnitRef[] = [{ k: 'character' }, ...p.mechs.map((_, i) => ({ k: 'mech' as const, i })), ...p.workers.map((_, i) => ({ k: 'worker' as const, i }))];
  return units.filter((u) => !t.moved.some((m) => sameUnit(m.unit, u)) && reachable(s, player, u).size > 0);
}

// ——— Gains, coûts et paiements ————————————————————————————————————————————————

function clampTracks(p: Player) {
  p.popularity = Math.max(0, Math.min(MAX_POPULARITY, p.popularity));
  p.power = Math.max(0, Math.min(MAX_POWER, p.power));
}

function drawCombat(s: GameState, p: Player, n: number) {
  for (let k = 0; k < n; k++) {
    if (!s.combatDeck.length) {
      if (!s.combatDiscard.length) return;
      s.combatDeck = shuffle(s.rng, s.combatDiscard);
      s.combatDiscard = [];
    }
    p.hand.push(s.combatDeck.pop()!);
  }
}

/** Retire de la main les cartes les plus faibles (paiement de cartes Combat). */
function discardLowest(s: GameState, p: Player, n: number) {
  for (let k = 0; k < n; k++) {
    let lo = 0;
    p.hand.forEach((v, i) => v < p.hand[lo] && (lo = i));
    s.combatDiscard.push(p.hand.splice(lo, 1)[0]);
  }
}

/** Le joueur peut-il payer ces ressources (avec Coercition pour la Crimée) ? */
export function canPayRes(s: GameState, player: number, need: Partial<ResCounts>, any = 0): boolean {
  const have = controlledRes(s, player);
  let missing = 0;
  for (const r of RESOURCES) missing += Math.max(0, (need[r] ?? 0) - have[r]);
  const spare = totalRes(have) - RESOURCES.reduce((a, r) => a + Math.min(need[r] ?? 0, have[r]), 0);
  missing += Math.max(0, any - spare);
  return missing === 0 || (missing === 1 && coercionAvailable(s, player));
}

function coercionAvailable(s: GameState, player: number): boolean {
  const p = s.players[player];
  return p.faction === 'crimea' && p.hand.length > 0 && !s.turn?.coercionUsed;
}

/** Paie des ressources sur les territoires contrôlés (d'abord là où il y en a le plus). */
function payRes(s: GameState, player: number, need: Partial<ResCounts>, any = 0) {
  if (!canPayRes(s, player, need, any)) fail('Ressources insuffisantes.');
  const hexes = controlledHexes(s, player);
  const take = (r: Resource): boolean => {
    let best = -1;
    for (const h of hexes) if (s.board.res[h][r] > 0 && (best < 0 || s.board.res[h][r] > s.board.res[best][r])) best = h;
    if (best < 0) return false;
    s.board.res[best][r]--;
    return true;
  };
  let short = 0;
  for (const r of RESOURCES) for (let k = 0; k < (need[r] ?? 0); k++) if (!take(r)) short++;
  for (let k = 0; k < any; k++) {
    const have = controlledRes(s, player);
    const r = RESOURCES.reduce((a, b) => (have[b] > have[a] ? b : a));
    if (!take(r)) short++;
  }
  if (short) {
    // Coercition : une carte Combat tient lieu d'une ressource.
    discardLowest(s, s.players[player], short);
    s.turn!.coercionUsed = true;
    log(s, player, 'Coercition : une carte Combat paie une ressource.');
  }
}

export function canPayCost(s: GameState, player: number, c: Cost): boolean {
  const p = s.players[player];
  return (
    p.coins >= (c.coins ?? 0) &&
    p.popularity >= (c.popularity ?? 0) &&
    p.power >= (c.power ?? 0) &&
    p.hand.length >= (c.cards ?? 0) &&
    (!c.any || canPayRes(s, player, {}, c.any))
  );
}

function payCost(s: GameState, player: number, c: Cost) {
  if (!canPayCost(s, player, c)) fail('Coût impossible à payer.');
  const p = s.players[player];
  p.coins -= c.coins ?? 0;
  p.popularity -= c.popularity ?? 0;
  p.power -= c.power ?? 0;
  if (c.cards) discardLowest(s, p, c.cards);
  if (c.any) payRes(s, player, {}, c.any);
}

/** Case où peut aller un gain « sur un territoire contrôlé avec un ouvrier ». */
export function workerHexes(s: GameState, player: number): number[] {
  const p = s.players[player];
  return [...new Set(p.workers)].filter((h) => isTerritory(h) && controller(s, h) === player);
}

export function canBuildOn(s: GameState, player: number, hex: number): boolean {
  return isTerritory(hex) && HEXES[hex].terrain !== 'lake' && !s.board.structures[hex] && controller(s, hex) === player;
}

function doUpgrade(p: Player, from: TopUpgrade, to: BottomAction) {
  if (!p.topCubes[from]) fail('Cette case est déjà améliorée.');
  if (bottomRoom(p, to) <= 0) fail('Ce coût ne peut plus baisser.');
  p.topCubes[from] = false;
  p.bottomCubes[to]++;
}

function doDeploy(s: GameState, player: number, mech: number, hex: number) {
  const p = s.players[player];
  if (p.mechDeployed[mech] === undefined || p.mechDeployed[mech]) fail('Ce mécha est déjà déployé.');
  if (!isTerritory(hex) || HEXES[hex].terrain === 'lake') fail('Pas de mécha sur un lac ni sur une base.');
  p.mechDeployed[mech] = true;
  p.mechs.push(hex);
  log(s, player, `déploie un mécha (${MECH_NAMES[FACTION_DEFS[p.faction].mechs[mech]]}).`);
}

function doBuild(s: GameState, player: number, kind: Structure, hex: number) {
  const p = s.players[player];
  if (p.structures[kind] !== null) fail('Structure déjà construite.');
  if (!canBuildOn(s, player, hex)) fail('Impossible de construire ici.');
  p.structures[kind] = hex;
  s.board.structures[hex] = { player, kind };
  log(s, player, `construit : ${STRUCTURE_NAMES[kind]}.`);
}

function gainSimple(s: GameState, p: Player, what: 'power' | 'coins' | 'popularity' | 'cards', n: number) {
  if (what === 'cards') drawCombat(s, p, n);
  else p[what] += n;
  clampTracks(p);
}

function doEnlist(s: GameState, player: number, section: BottomAction, bonus: RecruitOnce) {
  const p = s.players[player];
  if (p.recruits[section]) fail('Recrue déjà enrôlée dans cette colonne.');
  if (p.recruitBonus[bonus]) fail('Bonus déjà pris.');
  p.recruits[section] = true;
  p.recruitBonus[bonus] = true;
  gainSimple(s, p, bonus, 2);
  log(s, player, `enrôle une recrue (${BOTTOM_NAMES[section]}).`);
}

function addWorkers(s: GameState, player: number, hex: number, n: number): number {
  const p = s.players[player];
  const k = Math.max(0, Math.min(n, WORKERS - p.workers.length));
  for (let i = 0; i < k; i++) p.workers.push(hex);
  return k;
}

/**
 * Applique le gain d'une carte. `at` : case du personnage (rencontre) ; sinon la case vient du choix.
 * Ces gains ne rapportent ni pièces de fiche ni bonus de recrue.
 */
function applyGain(s: GameState, player: number, g: Gain, choice: Choice, at: number | null) {
  const p = s.players[player];
  p.coins += g.coins ?? 0;
  p.popularity += g.popularity ?? 0;
  p.power += g.power ?? 0;
  clampTracks(p);
  if (g.cards) drawCombat(s, p, g.cards);
  const resHex = at ?? choice.hex;
  const fixed = RESOURCES.some((r) => g[r]);
  if (fixed || g.any) {
    if (resHex === undefined || (at === null && !workerHexes(s, player).includes(resHex))) fail('Choisissez où placer les ressources.');
    for (const r of RESOURCES) s.board.res[resHex][r] += g[r] ?? 0;
    if (g.any) {
      const pick = choice.res ?? {};
      if (totalRes(pick) > g.any || RESOURCES.some((r) => (pick[r] ?? 0) < 0)) fail(`Choisissez au plus ${g.any} ressources.`);
      for (const r of RESOURCES) s.board.res[resHex][r] += pick[r] ?? 0;
    }
  }
  if (g.workers && at !== null) addWorkers(s, player, at, g.workers);
  if (g.upgrade && choice.upgrade) doUpgrade(p, choice.upgrade.from, choice.upgrade.to);
  if (g.deploy && choice.mech !== undefined) {
    const hex = at ?? choice.hex;
    if (hex === undefined || (at === null && !workerHexes(s, player).includes(hex))) fail('Choisissez où déployer le mécha.');
    doDeploy(s, player, choice.mech, hex);
  }
  if (g.build && choice.structure) {
    const hex = at ?? choice.hex;
    if (hex === undefined || (at === null && !workerHexes(s, player).includes(hex))) fail('Choisissez où construire.');
    doBuild(s, player, choice.structure, hex);
  }
  if (g.enlist && choice.enlist) doEnlist(s, player, choice.enlist.section, choice.enlist.bonus);
}

// ——— Étoiles et fin de partie ——————————————————————————————————————————————————

function placeStar(s: GameState, player: number, kind: StarKind): boolean {
  const p = s.players[player];
  if (s.status !== 'playing' || starCount(p) >= STARS_TO_END) return false;
  p.stars[kind] = (p.stars[kind] ?? 0) + 1;
  log(s, player, `place une étoile : ${STAR_NAMES[kind]}.`);
  if (starCount(p) >= STARS_TO_END) endGame(s, player);
  return true;
}

export const STAR_NAMES: Record<StarKind, string> = {
  upgrades: '6 améliorations',
  mechs: '4 méchas',
  structures: '4 structures',
  recruits: '4 recrues',
  workers: '8 ouvriers',
  objective: 'objectif',
  combat: 'victoire au combat',
  popularity: '18 de popularité',
  power: '16 de puissance',
};

/** Étoiles gagnées par seuil (vérifiées après chaque geste, joueur actif d'abord). */
function checkStars(s: GameState) {
  if (s.status !== 'playing') return;
  const n = s.players.length;
  const active = s.turn?.active ?? 0;
  const order = [active, seatNeighbor(s, active, 1), seatNeighbor(s, active, -1)].filter((v, i, a) => a.indexOf(v) === i);
  for (let k = 0; k < n; k++) if (!order.includes(k)) order.push(k);
  for (const i of order) {
    const p = s.players[i];
    const checks: [StarKind, boolean][] = [
      ['upgrades', upgradesDone(p) >= 6],
      ['mechs', p.mechs.length >= 4],
      ['structures', structureCount(p) >= 4],
      ['recruits', recruitCount(p) >= 4],
      ['workers', p.workers.length >= WORKERS],
      ['popularity', p.popularity >= MAX_POPULARITY],
      ['power', p.power >= MAX_POWER],
    ];
    for (const [kind, ok] of checks) {
      if (ok && !p.stars[kind]) placeStar(s, i, kind);
      if (s.status !== 'playing') return;
    }
  }
}

function endGame(s: GameState, by: number) {
  s.status = 'finished';
  // Combats non résolus : les unités venues attaquer retournent d'où elles venaient.
  const t = s.turn;
  if (t) {
    const p = s.players[t.active];
    for (const c of t.pending) {
      if (c.k !== 'combat') continue;
      for (const m of t.moved) if (unitHex(p, m.unit) === c.hex) setUnitHex(p, m.unit, m.from);
    }
    t.pending = [];
  }
  s.final = finalScoring(s);
  log(s, by, 'place sa 6e étoile : fin de la partie.');
}

/** Pièces de fin de partie pour le bonus de structures. */
export function structureBonus(s: GameState, player: number): number {
  const hexes = STRUCTURES.map((k) => s.players[player].structures[k]).filter((h): h is number => h !== null);
  const adjacent = (pred: (h: number) => boolean) => {
    const set = new Set<number>();
    for (const h of hexes) for (const n of NEIGHBORS[h]) if (pred(n)) set.add(n);
    return set.size;
  };
  let n = 0;
  switch (s.bonusTile) {
    case 'adjTunnels':
      n = adjacent((h) => HEXES[h].tunnel);
      break;
    case 'adjLakes':
      n = adjacent((h) => HEXES[h].terrain === 'lake');
      break;
    case 'adjEncounters':
      n = adjacent((h) => HEXES[h].encounter);
      break;
    case 'onTunnels':
      n = hexes.filter((h) => HEXES[h].tunnel).length;
      break;
    case 'inRow':
      n = longestRow(new Set(hexes));
      break;
    case 'onFarmTundra':
      n = hexes.filter((h) => HEXES[h].terrain === 'farm' || HEXES[h].terrain === 'tundra').length;
      break;
  }
  return bonusCoins(s.bonusTile, n);
}

export function territoryCount(s: GameState, player: number): number {
  return controlledHexes(s, player).reduce((a, h) => a + (h === FACTORY_HEX ? 3 : 1), 0);
}

export function scoreOf(s: GameState, player: number): FinalScore {
  const p = s.players[player];
  const tier = scoreTier(p.popularity);
  const stars = starCount(p) * tier.star;
  const territories = territoryCount(s, player) * tier.territory;
  const resources = Math.floor(totalRes(controlledRes(s, player)) / 2) * tier.resources;
  const bonus = structureBonus(s, player);
  return { player, coins: p.coins, stars, territories, resources, bonus, total: p.coins + stars + territories + resources + bonus };
}

export function finalScoring(s: GameState): FinalScore[] {
  return s.players.map((_, i) => scoreOf(s, i));
}

/** Classement final, départage compris (unités et structures, puissance, popularité, ressources, territoires, étoiles). */
export function ranking(s: GameState): number[] {
  const scores = s.final ?? finalScoring(s);
  const key = (i: number) => {
    const p = s.players[i];
    return [
      scores[i].total,
      p.workers.length + p.mechs.length + structureCount(p),
      p.power,
      p.popularity,
      totalRes(controlledRes(s, i)),
      controlledHexes(s, i).length,
      starCount(p),
    ];
  };
  return s.players
    .map((_, i) => i)
    .sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      for (let k = 0; k < ka.length; k++) if (ka[k] !== kb[k]) return kb[k] - ka[k];
      return 0;
    });
}

// ——— Objectifs ——————————————————————————————————————————————————————————————

export function objectiveMet(s: GameState, player: number, id: ObjectiveId): boolean {
  const p = s.players[player];
  const ctrl = controlledHexes(s, player);
  const countTerrain = (t: Terrain) => ctrl.filter((h) => HEXES[h].terrain === t).length;
  const res = controlledRes(s, player);
  switch (id) {
    case 'mountains3':
      return countTerrain('mountain') >= 3;
    case 'tunnels3':
      return ctrl.filter((h) => HEXES[h].tunnel).length >= 3;
    case 'farms3':
      return countTerrain('farm') >= 3;
    case 'tundras3':
      return countTerrain('tundra') >= 3;
    case 'forests3':
      return countTerrain('forest') >= 3;
    case 'villages3':
      return countTerrain('village') >= 3;
    case 'kingOfTheHill':
      return controller(s, FACTORY_HEX) === player && s.players.every((q) => q.power <= p.power);
    case 'sendOneBack':
      return (s.turn?.active === player ? s.turn.forcedRetreat : 0) > 0 && p.power >= 7;
    case 'machineOverMuscle':
      return p.factoryCard !== null && p.mechs.length >= 1 && p.workers.length <= 3;
    case 'commonMan':
      return p.coins <= 2 && p.workers.length >= 4 && p.popularity >= 7;
    case 'stockpile':
      return ctrl.some((h) => totalRes(s.board.res[h]) >= 9 && RESOURCES.every((r) => s.board.res[h][r] >= 1));
    case 'rich20':
      return p.coins >= 20;
    case 'foundations':
      return HEXES.some(
        (h) => (p.character === h.id ? 1 : 0) + p.mechs.filter((m) => m === h.id).length + workersOn(p, h.id) + (s.board.structures[h.id]?.player === player ? 1 : 0) >= 6,
      );
    case 'hedgeBets':
      return upgradesDone(p) >= 1 && p.mechs.length >= 1 && structureCount(p) >= 1 && recruitCount(p) >= 1 && RESOURCES.every((r) => res[r] >= 1);
    case 'balancedWorkforce':
      return p.workers.length === recruitCount(p);
    case 'wolfAmongSheep':
      return ctrl.some(
        (h) => p.character === h && p.mechs.filter((m) => m === h).length === 1 && workersOn(p, h) === 1 && totalRes(s.board.res[h]) >= 5,
      );
    case 'divideConquer':
      return p.factoryCard === null && NEIGHBORS[FACTORY_HEX].filter((h) => ctrl.includes(h)).length >= 2;
    case 'pacifist':
      return p.power === 0 && p.popularity >= 13 && p.workers.length >= 5;
    case 'shoreUp':
      return LAKES.some((l) => NEIGHBORS[l].filter((h) => isTerritory(h) && ctrl.includes(h)).length >= 5);
    case 'foothold':
      return structureCount(p) >= 3 && p.popularity >= 7 && p.mechs.length === 0;
    case 'monopolize':
      return RESOURCES.some((r) => res[r] >= 9);
    case 'breakthrough':
      return p.factoryCard !== null && upgradesDone(p) === 0;
    case 'tacticalMastery':
      return p.hand.length >= 8 && (p.stars.combat ?? 0) >= 1;
  }
}

// ——— Combat ——————————————————————————————————————————————————————————————————

/** Nombre maximal de cartes Combat jouables par ce joueur sur cette case. */
export function maxCombatCards(s: GameState, player: number, hex: number): number {
  const p = s.players[player];
  const extra = abilities(p).has('peoplesArmy') && workersOn(p, hex) > 0 ? 1 : 0;
  return combatUnits(p, hex) + extra;
}

/** Capacités qui jouent avant le combat : l'attaquant d'abord, puis le défenseur. */
function startCombat(s: GameState, c: Extract<Pending, { k: 'combat' }>) {
  c.started = true;
  for (const [me, opp] of [
    [c.attacker, c.defender],
    [c.defender, c.attacker],
  ]) {
    const p = s.players[me];
    const q = s.players[opp];
    const ab = abilities(p);
    if (ab.has('scout') && q.hand.length) {
      const k = randInt(s.rng, q.hand.length);
      p.hand.push(q.hand.splice(k, 1)[0]);
      log(s, me, 'Éclaireur : vole une carte Combat.');
    }
    if (ab.has('artillery') && p.power >= 1) {
      p.power -= 1;
      q.power = Math.max(0, q.power - 2);
      log(s, me, 'Artillerie : paie 1 puissance, l’adversaire en perd 2.');
    }
    if (ab.has('disarm') && (HEXES[c.hex].tunnel || p.structures.mine === c.hex)) {
      q.power = Math.max(0, q.power - 2);
      log(s, me, 'Désarmement : l’adversaire perd 2 puissance.');
    }
  }
  s.turn!.player = c.attacker;
}

function retreatAll(s: GameState, player: number, hex: number): number {
  const p = s.players[player];
  const base = baseHex(p.faction);
  if (p.character === hex) p.character = base;
  p.mechs = p.mechs.map((m) => (m === hex ? base : m));
  let n = 0;
  p.workers = p.workers.map((w) => {
    if (w !== hex) return w;
    n++;
    return base;
  });
  return n;
}

function resolveCombat(s: GameState, c: Extract<Pending, { k: 'combat' }>) {
  const a = s.players[c.attacker];
  const d = s.players[c.defender];
  const att = c.att!;
  const def = c.def!;
  const attCards = att.cards.map((i) => a.hand[i]);
  const defCards = def.cards.map((i) => d.hand[i]);
  const attTotal = att.power + attCards.reduce((x, y) => x + y, 0);
  const defTotal = def.power + defCards.reduce((x, y) => x + y, 0);
  const attackerWins = attTotal >= defTotal;
  const winner = attackerWins ? c.attacker : c.defender;
  const loser = attackerWins ? c.defender : c.attacker;

  a.power = Math.max(0, a.power - att.power);
  d.power = Math.max(0, d.power - def.power);
  for (const [p, idx] of [
    [a, att.cards],
    [d, def.cards],
  ] as const) {
    for (const i of [...idx].sort((x, y) => y - x)) s.combatDiscard.push(p.hand.splice(i, 1)[0]);
  }
  s.turn!.lastCombat = {
    hex: c.hex,
    attacker: c.attacker,
    defender: c.defender,
    att: { power: att.power, cards: attCards },
    def: { power: def.power, cards: defCards },
    winner,
  };
  log(
    s,
    winner,
    `remporte le combat (${attTotal} contre ${defTotal}) face à ${s.players[loser].name} en ${TERRAIN_NAMES[HEXES[c.hex].terrain!]}.`,
  );

  const loserRevealed = attackerWins ? def.power > 0 || def.cards.length > 0 : att.power > 0 || att.cards.length > 0;
  const workers = retreatAll(s, loser, c.hex);
  if (attackerWins && workers > 0) {
    s.turn!.forcedRetreat += workers;
    if (!abilities(a).has('camaraderie')) {
      a.popularity = Math.max(0, a.popularity - workers);
      log(s, c.attacker, `perd ${workers} popularité (ouvriers forcés à la retraite).`);
    }
  }
  if (loserRevealed) drawCombat(s, s.players[loser], 1);

  const w = s.players[winner];
  const limit = w.faction === 'saxony' ? Infinity : 2;
  if ((w.stars.combat ?? 0) < limit) placeStar(s, winner, 'combat');
}

// ——— Enchaînement des étapes du tour ——————————————————————————————————————————

/** Règle ce qui suit un déplacement : combats, puis rencontre et Usine. */
function advance(s: GameState) {
  const t = s.turn!;
  while (s.status === 'playing') {
    const head = t.pending[0];
    if (head) {
      if (head.k === 'combat') {
        if (!head.started) startCombat(s, head);
        if (!head.att) {
          t.player = head.attacker;
          return;
        }
        if (!head.def) {
          t.player = head.defender;
          return;
        }
        t.player = t.active;
        resolveCombat(s, head);
        t.pending.shift();
        checkStars(s);
        continue;
      }
      t.player = t.active;
      return; // rencontre ou choix d'une carte Usine
    }
    t.player = t.active;
    if (!t.checkedVisit) {
      t.checkedVisit = true;
      const p = s.players[t.active];
      if (isTerritory(p.character) && s.board.encounters[p.character]) {
        s.board.encounters[p.character] = false;
        const card = s.encounterDeck.shift()!;
        t.pending.push({ k: 'encounter', card });
        log(s, t.active, `fait une rencontre (carte ${card + 1}).`);
      }
      if (p.character === FACTORY_HEX && p.factoryCard === null && s.factoryPool.length) t.pending.push({ k: 'factory' });
      if (t.pending.length) continue;
    }
    t.stage = t.after;
    return;
  }
}

function finishMove(s: GameState) {
  const t = s.turn!;
  const me = t.active;
  const p = s.players[me];
  t.movesLeft = 0;
  t.stage = 'resolve';
  // Combats : là où le personnage ou un mécha partage une case avec un personnage ou mécha adverse.
  const hexes = [...new Set([p.character, ...p.mechs])];
  for (const h of hexes) {
    if (!isTerritory(h)) continue;
    const enemy = s.players.findIndex((q, i) => i !== me && (q.character === h || q.mechs.includes(h)));
    if (enemy >= 0) t.pending.push({ k: 'combat', hex: h, attacker: me, defender: enemy, started: false });
  }
  t.checkedVisit = false;
  advance(s);
}

// ——— Application d'une action ——————————————————————————————————————————————————

export function apply(state: GameState, action: Action): GameState {
  if (state.status !== 'playing' || !state.turn) fail('La partie est terminée.');
  const s: GameState = structuredClone(state);
  const t = s.turn!;
  const me = t.active;
  const p = s.players[me];

  const requireStage = (...stages: Turn['stage'][]) => {
    if (!stages.includes(t.stage)) fail('Ce n’est pas le moment.');
  };
  const section = () => sectionActions(p, t.section!);
  const structureBonusFor = (top: TopAction) =>
    STRUCTURES.some((k) => STRUCTURE_ACTION[k] === top && p.structures[k] !== null && k !== 'mine' && k !== 'mill');

  switch (action.t) {
    case 'section': {
      requireStage('section');
      if (!allowedSections(s, me).includes(action.i)) fail('Choisissez une autre section que celle du tour précédent.');
      t.section = action.i;
      t.stage = 'top';
      const sa = section();
      log(s, me, `choisit ${sa.top === 'factory' ? 'sa carte Usine' : `${TOP_NAMES[sa.top]} / ${BOTTOM_NAMES[sa.bottom as BottomAction]}`}.`);
      break;
    }

    case 'skipTop':
      requireStage('top', 'moving');
      if (t.stage === 'moving') {
        if (t.moved.length) fail('Terminez le déplacement.');
        t.movesLeft = 0;
      }
      t.stage = t.factoryMove ? 'end' : 'bottom';
      break;

    case 'startMove':
      requireStage('top');
      if (section().top !== 'move') fail('Ce n’est pas l’action Déplacer.');
      t.stage = 'moving';
      t.movesLeft = topValue(p, 'move');
      t.moved = [];
      t.after = 'bottom';
      t.factoryMove = false;
      break;

    case 'gain': {
      requireStage('top');
      if (section().top !== 'move') fail('Ce n’est pas l’action Déplacer.');
      const n = topValue(p, 'gain');
      p.coins += n;
      log(s, me, `gagne ${n} $.`);
      t.stage = 'bottom';
      break;
    }

    case 'move': {
      requireStage('moving');
      if (t.movesLeft <= 0) fail('Plus de déplacement disponible.');
      const u = action.unit;
      if (u.k !== 'character' && (u.i < 0 || u.i >= (u.k === 'mech' ? p.mechs.length : p.workers.length))) fail('Unité inconnue.');
      if (t.moved.some((m) => sameUnit(m.unit, u))) fail('Cette unité s’est déjà déplacée.');
      const from = unitHex(p, u);
      const reach = reachable(s, me, u);
      const dest = action.path[action.path.length - 1];
      const path = reach.get(dest);
      if (dest === undefined || !path) fail('Destination impossible.');
      if (HEXES[dest].terrain === 'lake' && (action.workers?.length || totalRes(action.res ?? {}))) fail('On ne transporte rien sur un lac.');
      // Ouvriers transportés par un mécha.
      const carried = action.workers ?? [];
      if (carried.length && u.k !== 'mech') fail('Seuls les méchas transportent des ouvriers.');
      for (const w of carried) if (p.workers[w] !== from) fail('Ouvrier absent de la case de départ.');
      // Ressources transportées.
      const res = action.res ?? {};
      for (const r of RESOURCES) if ((res[r] ?? 0) < 0 || (res[r] ?? 0) > s.board.res[from][r]) fail('Ressources absentes de la case de départ.');
      for (const r of RESOURCES) {
        s.board.res[from][r] -= res[r] ?? 0;
        s.board.res[dest][r] += res[r] ?? 0;
      }
      setUnitHex(p, u, dest);
      for (const w of new Set(carried)) p.workers[w] = dest;
      t.moved.push({ unit: u, from });
      t.movesLeft--;
      // Ouvriers adverses seuls : ils retournent à leur base.
      if (u.k !== 'worker') {
        const enemy = enemyUnits(s, me, dest);
        if (enemy.workers && !enemy.combat) {
          let n = 0;
          s.players.forEach((q, i) => {
            if (i === me) return;
            const k = workersOn(q, dest);
            if (k) {
              retreatAll(s, i, dest);
              n += k;
            }
          });
          p.popularity = Math.max(0, p.popularity - n);
          t.forcedRetreat += n;
          log(s, me, `force ${n} ouvrier${n > 1 ? 's' : ''} à la retraite et perd ${n} popularité.`);
        }
      }
      if (t.movesLeft <= 0 || movableUnits(s, me).length === 0) finishMove(s);
      break;
    }

    case 'endMove':
      requireStage('moving');
      finishMove(s);
      break;

    case 'trade': {
      requireStage('top');
      if (section().top !== 'trade') fail('Ce n’est pas l’action Échanger.');
      if (p.coins < 1) fail('Il faut 1 $.');
      if (totalRes(action.res) > 2 || RESOURCES.some((r) => (action.res[r] ?? 0) < 0)) fail('Choisissez 2 ressources.');
      if (!workerHexes(s, me).includes(action.hex)) fail('Placez-les sur un territoire contrôlé avec un ouvrier.');
      p.coins -= 1;
      for (const r of RESOURCES) s.board.res[action.hex][r] += action.res[r] ?? 0;
      if (structureBonusFor('trade')) p.power++;
      clampTracks(p);
      log(s, me, `échange 1 $ contre ${describeRes(action.res)}.`);
      t.stage = 'bottom';
      break;
    }

    case 'tradePop': {
      requireStage('top');
      if (section().top !== 'trade') fail('Ce n’est pas l’action Échanger.');
      if (p.coins < 1) fail('Il faut 1 $.');
      p.coins -= 1;
      const n = topValue(p, 'popularity');
      p.popularity += n;
      if (structureBonusFor('trade')) p.power++;
      clampTracks(p);
      log(s, me, `échange 1 $ contre ${n} popularité.`);
      t.stage = 'bottom';
      break;
    }

    case 'produce': {
      requireStage('top');
      if (section().top !== 'produce') fail('Ce n’est pas l’action Produire.');
      const hexes = [...new Set(action.hexes)];
      const mill = p.structures.mill;
      const millOk = !action.noMill && mill !== null && controller(s, mill) === me;
      const chosen = hexes.filter((h) => h !== mill || !millOk);
      if (chosen.length > topValue(p, 'produce')) fail(`Au plus ${topValue(p, 'produce')} territoires.`);
      for (const h of chosen) if (!workerHexes(s, me).includes(h)) fail('Produisez sur des territoires contrôlés avec des ouvriers.');
      const cost = produceCost(p.workers.length);
      if (p.power < cost.power || p.popularity < cost.popularity || p.coins < cost.coins) fail('Coût de production impossible à payer.');
      p.power -= cost.power;
      p.popularity -= cost.popularity;
      p.coins -= cost.coins;
      const all = millOk ? [...chosen, mill!] : chosen;
      const parts: string[] = [];
      for (const h of all) {
        const kind = PRODUCES[HEXES[h].terrain!];
        if (!kind) continue;
        let n = workersOn(p, h) + (millOk && h === mill ? 1 : 0);
        if (kind === 'worker') {
          n = Math.min(n, action.workers?.[h] ?? n);
          const k = addWorkers(s, me, h, n);
          if (k) parts.push(`${k} ouvrier${k > 1 ? 's' : ''}`);
        } else if (n > 0) {
          s.board.res[h][kind] += n;
          parts.push(`${n} ${RES_NAMES[kind]}`);
        }
      }
      log(s, me, `produit ${parts.join(', ') || 'rien'}.`);
      t.stage = 'bottom';
      break;
    }

    case 'bolster': {
      requireStage('top');
      if (section().top !== 'bolster') fail('Ce n’est pas l’action Renforcer.');
      if (p.coins < 1) fail('Il faut 1 $.');
      p.coins -= 1;
      if (action.what === 'power') p.power += topValue(p, 'power');
      else drawCombat(s, p, topValue(p, 'cards'));
      if (structureBonusFor('bolster')) p.popularity++;
      clampTracks(p);
      log(s, me, action.what === 'power' ? `gagne ${topValue(p, 'power')} puissance.` : `pioche ${topValue(p, 'cards')} carte${topValue(p, 'cards') > 1 ? 's' : ''} Combat.`);
      t.stage = 'bottom';
      break;
    }

    case 'factoryTop': {
      requireStage('top');
      if (section().top !== 'factory' || p.factoryCard === null) fail('Pas de carte Usine.');
      const opt = FACTORY_CARDS[p.factoryCard][action.option];
      if (!opt) fail('Option inconnue.');
      payCost(s, me, opt.cost);
      applyGain(s, me, opt.gain, action.choice ?? {}, null);
      log(s, me, `utilise sa carte Usine : ${describeOption(opt)}.`);
      t.stage = 'bottom';
      break;
    }

    case 'factoryMove':
      requireStage('top', 'bottom');
      if (section().bottom !== 'factoryMove') fail('Ce n’est pas la carte Usine.');
      t.stage = 'moving';
      t.factoryMove = true;
      t.movesLeft = 1;
      t.moved = [];
      t.after = 'end';
      break;

    case 'upgrade':
    case 'deploy':
    case 'build':
    case 'enlist': {
      requireStage('top', 'bottom');
      const a = action.t;
      if (section().bottom !== a) fail('Ce n’est pas l’action du bas de cette section.');
      payRes(s, me, { [BOTTOM_RESOURCE[a]]: bottomCost(p, a) });
      p.coins += MATS[p.mat].bottom[a].coins;
      // Effet principal (facultatif : on peut payer seulement pour les pièces et bonus).
      if (action.t === 'upgrade' && action.from && action.to) {
        doUpgrade(p, action.from, action.to);
        log(s, me, 'améliore sa fiche.');
      } else if (action.t === 'deploy' && action.mech !== undefined) {
        if (action.hex === undefined || !workerHexes(s, me).includes(action.hex)) fail('Déployez sur un territoire contrôlé avec un ouvrier.');
        doDeploy(s, me, action.mech, action.hex);
      } else if (action.t === 'build' && action.structure) {
        if (action.hex === undefined || !workerHexes(s, me).includes(action.hex)) fail('Construisez sur un territoire contrôlé avec un ouvrier.');
        doBuild(s, me, action.structure, action.hex);
      } else if (action.t === 'enlist' && action.section && action.bonus) {
        doEnlist(s, me, action.section, action.bonus);
      } else {
        log(s, me, `prend l’action ${BOTTOM_NAMES[a]} pour ses pièces.`);
      }
      // Bonus permanents de recrue : soi-même, puis les voisins de gauche et de droite.
      const who = [me, seatNeighbor(s, me, 1), seatNeighbor(s, me, -1)].filter((v, i, arr) => arr.indexOf(v) === i);
      for (const i of who) if (s.players[i].recruits[a]) gainSimple(s, s.players[i], RECRUIT_ONGOING[a], 1);
      t.stage = 'end';
      break;
    }

    case 'combat': {
      requireStage('resolve');
      const c = t.pending[0];
      if (!c || c.k !== 'combat') fail('Pas de combat en cours.');
      const who = t.player;
      const q = s.players[who];
      if (action.power < 0 || action.power > Math.min(MAX_DIAL, q.power)) fail(`Puissance entre 0 et ${Math.min(MAX_DIAL, q.power)}.`);
      const cards = [...new Set(action.cards)];
      if (cards.length > maxCombatCards(s, who, c.hex)) fail('Trop de cartes Combat.');
      if (cards.some((i) => i < 0 || i >= q.hand.length)) fail('Carte inconnue.');
      if (who === c.attacker && !c.att) c.att = { power: action.power, cards };
      else if (who === c.defender && c.att && !c.def) c.def = { power: action.power, cards };
      else fail('Ce n’est pas à vous de choisir.');
      advance(s);
      break;
    }

    case 'encounter': {
      requireStage('resolve');
      const e = t.pending[0];
      if (!e || e.k !== 'encounter') fail('Pas de rencontre en cours.');
      const card = ENCOUNTERS[e.card];
      const maxPicks = p.faction === 'polania' ? 2 : 1;
      const picks = action.picks;
      if (picks.length < 1 || picks.length > maxPicks) fail(maxPicks === 2 ? 'Choisissez 1 ou 2 options.' : 'Choisissez une option.');
      if (new Set(picks.map((x) => x.option)).size !== picks.length) fail('Options différentes.');
      for (const pick of picks) {
        const opt = card[pick.option];
        if (!opt) fail('Option inconnue.');
        payCost(s, me, opt.cost);
        applyGain(s, me, opt.gain, pick.choice ?? {}, p.character);
        log(s, me, `rencontre : ${describeOption(opt)}.`);
      }
      s.encounterDeck.push(e.card);
      t.pending.shift();
      checkStars(s);
      advance(s);
      break;
    }

    case 'pickFactory': {
      requireStage('resolve');
      const f = t.pending[0];
      if (!f || f.k !== 'factory') fail('Pas de carte Usine à choisir.');
      const k = s.factoryPool.indexOf(action.card);
      if (k < 0) fail('Carte indisponible.');
      s.factoryPool.splice(k, 1);
      p.factoryCard = action.card;
      log(s, me, `prend la carte Usine n° ${action.card + 1}.`);
      t.pending.shift();
      advance(s);
      break;
    }

    case 'objective': {
      if (t.stage === 'resolve' || t.player !== me) fail('Pas pendant un combat ou une rencontre.');
      const id = p.objectives[action.i];
      if (!id) fail('Objectif inconnu.');
      if (!objectiveMet(s, me, id)) fail('Objectif non rempli.');
      const limit = p.faction === 'saxony' ? 2 : 1;
      if ((p.stars.objective ?? 0) >= limit) fail('Vous avez déjà réalisé un objectif.');
      if (p.faction === 'saxony') {
        s.objectiveDeck.unshift(...p.objectives.splice(action.i, 1));
      } else {
        s.objectiveDeck.unshift(...p.objectives);
        p.objectives = [];
      }
      log(s, me, `révèle un objectif réalisé : ${OBJECTIVE_TEXT[id].title}.`);
      placeStar(s, me, 'objective');
      break;
    }

    case 'endTurn': {
      if (t.stage === 'section') fail('Choisissez d’abord une section.');
      if (t.stage === 'resolve') fail('Terminez d’abord le combat ou la rencontre.');
      if (t.stage === 'moving') fail('Terminez d’abord le déplacement.');
      p.lastSection = t.section;
      s.turnCount++;
      startTurn(s, seatNeighbor(s, me, 1));
      break;
    }
  }
  checkStars(s);
  return s;
}

// ——— Textes —————————————————————————————————————————————————————————————————

export function describeRes(r: Partial<ResCounts>): string {
  const parts = RESOURCES.filter((k) => (r[k] ?? 0) > 0).map((k) => `${r[k]} ${RES_NAMES[k]}`);
  return parts.join(', ') || 'rien';
}

export function describeCost(c: Cost): string {
  const parts: string[] = [];
  if (c.coins) parts.push(`${c.coins} $`);
  if (c.popularity) parts.push(`${c.popularity} popularité`);
  if (c.power) parts.push(`${c.power} puissance`);
  if (c.cards) parts.push(`${c.cards} carte${c.cards > 1 ? 's' : ''} Combat`);
  if (c.any) parts.push(`${c.any} ressources au choix`);
  return parts.join(' + ');
}

export function describeGain(g: Gain): string {
  const parts: string[] = [];
  if (g.coins) parts.push(`${g.coins} $`);
  if (g.popularity) parts.push(`${g.popularity} popularité`);
  if (g.power) parts.push(`${g.power} puissance`);
  if (g.cards) parts.push(`${g.cards} carte${g.cards > 1 ? 's' : ''} Combat`);
  for (const r of RESOURCES) if (g[r]) parts.push(`${g[r]} ${RES_NAMES[r]}`);
  if (g.any) parts.push(`${g.any} ressources au choix`);
  if (g.workers) parts.push(`${g.workers} ouvrier`);
  if (g.upgrade) parts.push('1 amélioration');
  if (g.deploy) parts.push('déployer 1 mécha');
  if (g.build) parts.push('construire 1 structure');
  if (g.enlist) parts.push('enrôler 1 recrue');
  return parts.join(' + ');
}

export function describeOption(o: CardOption): string {
  const cost = describeCost(o.cost);
  return cost ? `payer ${cost} → ${describeGain(o.gain)}` : describeGain(o.gain);
}

export const MECH_NAMES: Record<MechAbility, string> = {
  riverwalk: 'Berge',
  speed: 'Rapidité',
  seaworthy: 'Navigation',
  artillery: 'Artillerie',
  township: 'Canton',
  peoplesArmy: 'Armée du peuple',
  wayfare: 'Droit chemin',
  scout: 'Éclaireur',
  submerge: 'Plongée',
  camaraderie: 'Camaraderie',
  underpass: 'Passage souterrain',
  disarm: 'Désarmement',
};

export const OBJECTIVE_TEXT: Record<ObjectiveId, { title: string; text: string }> = {
  mountains3: { title: 'Avantage des hauteurs', text: 'Contrôler au moins 3 montagnes.' },
  tunnels3: { title: 'Avantage souterrain', text: 'Contrôler au moins 3 tunnels.' },
  farms3: { title: 'Avantage de la récolte', text: 'Contrôler au moins 3 fermes.' },
  tundras3: { title: 'Avantage du Nord', text: 'Contrôler au moins 3 toundras.' },
  kingOfTheHill: { title: 'Roi de la colline', text: 'Contrôler l’Usine et avoir la plus grande puissance (égalités acceptées).' },
  sendOneBack: { title: 'Renvoyer quelqu’un en guise d’avertissement', text: 'Forcer la retraite d’un ouvrier adverse ce tour-ci et avoir au moins 7 puissance.' },
  machineOverMuscle: { title: 'La machine plus forte que l’homme', text: 'Avoir 1 carte Usine, au moins 1 mécha et au plus 3 ouvriers.' },
  commonMan: { title: 'Retrousser ses manches avec les gens', text: 'Avoir 2 $ ou moins, au moins 4 ouvriers et au moins 7 popularité.' },
  stockpile: { title: 'Réserves pour l’hiver', text: 'Contrôler un territoire avec au moins 9 ressources, dont au moins 1 de chaque type.' },
  forests3: { title: 'Avantage des forêts', text: 'Contrôler au moins 3 forêts.' },
  villages3: { title: 'Avantage de la population', text: 'Contrôler au moins 3 villages.' },
  rich20: { title: 'Devenir riche ou pleurer en essayant', text: 'Avoir au moins 20 $.' },
  foundations: { title: 'Les fondations d’un empire', text: 'Avoir au moins 6 de ses pions (personnage, ouvriers, méchas, structures) sur 1 territoire.' },
  hedgeBets: { title: 'Couvrir vos paris', text: 'Avoir au moins 1 amélioration, 1 mécha, 1 structure, 1 recrue et 1 ressource de chaque type.' },
  balancedWorkforce: { title: 'Main-d’œuvre équilibrée', text: 'Avoir autant d’ouvriers que de recrues.' },
  wolfAmongSheep: { title: 'Un loup dans la bergerie', text: 'Contrôler un territoire avec son personnage, exactement 1 mécha, exactement 1 ouvrier et au moins 5 ressources.' },
  divideConquer: { title: 'Diviser pour régner', text: 'Avoir 0 carte Usine et contrôler au moins 2 territoires adjacents à l’Usine.' },
  pacifist: { title: 'Devenir un pacifiste aimé', text: 'Avoir 0 puissance, au moins 13 popularité et au moins 5 ouvriers.' },
  shoreUp: { title: 'Consolider la rive', text: 'Contrôler au moins 5 territoires autour d’un même lac.' },
  foothold: { title: 'Créer un point d’appui permanent', text: 'Avoir construit au moins 3 structures, avoir au moins 7 popularité et 0 mécha.' },
  monopolize: { title: 'Monopoliser le marché', text: 'Contrôler au moins 9 jetons d’une même ressource.' },
  breakthrough: { title: 'Percée technologique', text: 'Avoir 1 carte Usine et 0 amélioration.' },
  tacticalMastery: { title: 'Atteindre la maîtrise tactique', text: 'Avoir au moins 8 cartes Combat en main et au moins 1 étoile de victoire au combat.' },
};
