/**
 * Matériel de Scythe (jeu de base), relevé sur le plateau, les fiches et le guide officiel des cartes.
 * Les textes d'ambiance des cartes ne sont pas repris : seuls leurs effets le sont.
 */

// ——— Terrains et ressources ————————————————————————————————————————————————

export const RESOURCES = ['food', 'wood', 'metal', 'oil'] as const;
export type Resource = (typeof RESOURCES)[number];

export type Terrain = 'farm' | 'forest' | 'mountain' | 'tundra' | 'village' | 'lake' | 'factory';
/** Types de terrain principaux (objectif « Diversifier la production »). */
export const PRIMARY_TERRAINS: Terrain[] = ['farm', 'forest', 'mountain', 'tundra', 'village'];

/** Ce que produit chaque terrain (« worker » : un ouvrier sur un village). */
export const PRODUCES: Partial<Record<Terrain, Resource | 'worker'>> = {
  farm: 'food',
  forest: 'wood',
  mountain: 'metal',
  tundra: 'oil',
  village: 'worker',
};

// ——— Factions ———————————————————————————————————————————————————————————————

export const FACTIONS = ['nordic', 'rusviet', 'crimea', 'saxony', 'polania'] as const;
export type Faction = (typeof FACTIONS)[number];
/** Bases des factions d'extension : sans joueur, elles sont toujours inactives. */
export type BaseId = Faction | 'albion' | 'togawa';

export type MechAbility =
  | 'riverwalk'
  | 'speed'
  | 'seaworthy'
  | 'artillery'
  | 'township'
  | 'peoplesArmy'
  | 'wayfare'
  | 'scout'
  | 'submerge'
  | 'camaraderie'
  | 'underpass'
  | 'disarm';

export interface FactionDef {
  power: number;
  cards: number;
  /** Les 4 capacités sous les méchas, dans l'ordre de la fiche. */
  mechs: [MechAbility, MechAbility, MechAbility, MechAbility];
  /** Terrains rejoints en traversant une rivière avec « Berge ». */
  riverwalk: [Terrain, Terrain];
}

export const FACTION_DEFS: Record<Faction, FactionDef> = {
  nordic: { power: 4, cards: 1, mechs: ['riverwalk', 'seaworthy', 'artillery', 'speed'], riverwalk: ['forest', 'mountain'] },
  rusviet: { power: 3, cards: 2, mechs: ['riverwalk', 'township', 'peoplesArmy', 'speed'], riverwalk: ['farm', 'village'] },
  crimea: { power: 5, cards: 0, mechs: ['riverwalk', 'wayfare', 'scout', 'speed'], riverwalk: ['farm', 'tundra'] },
  saxony: { power: 1, cards: 4, mechs: ['riverwalk', 'underpass', 'disarm', 'speed'], riverwalk: ['forest', 'mountain'] },
  polania: { power: 2, cards: 3, mechs: ['riverwalk', 'submerge', 'camaraderie', 'speed'], riverwalk: ['village', 'mountain'] },
};

// ——— Plateau ————————————————————————————————————————————————————————————————

export interface HexDef {
  id: number;
  col: number;
  row: number;
  /** null pour une base. */
  terrain: Terrain | null;
  base?: BaseId;
  encounter: boolean;
  tunnel: boolean;
}

/**
 * Cases du plateau, ligne par ligne. Hexagones « pointe en haut » ; les lignes paires sont décalées
 * d'un demi-hexagone vers la droite. E : jeton rencontre, T : tunnel.
 */
const MAP: [number, number, Terrain | BaseId, string?][] = [
  [1, 0, 'albion'],
  [4, 0, 'nordic'],
  [1, 1, 'mountain'],
  [2, 1, 'farm'],
  [3, 1, 'village', 'E'],
  [4, 1, 'forest'],
  [5, 1, 'tundra'],
  [6, 1, 'village'],
  [0, 2, 'lake'],
  [1, 2, 'tundra', 'E'],
  [2, 2, 'lake'],
  [3, 2, 'tundra', 'T'],
  [4, 2, 'mountain', 'E'],
  [5, 2, 'farm'],
  [6, 2, 'farm', 'E'],
  [0, 3, 'polania'],
  [1, 3, 'forest'],
  [2, 3, 'mountain', 'T'],
  [3, 3, 'forest'],
  [4, 3, 'lake'],
  [5, 3, 'forest', 'T'],
  [6, 3, 'village'],
  [7, 3, 'rusviet'],
  [0, 4, 'farm'],
  [1, 4, 'village', 'E'],
  [2, 4, 'lake'],
  [3, 4, 'factory'],
  [4, 4, 'mountain'],
  [5, 4, 'tundra', 'E'],
  [6, 4, 'mountain'],
  [0, 5, 'forest', 'E'],
  [1, 5, 'forest'],
  [2, 5, 'farm', 'T'],
  [3, 5, 'tundra'],
  [4, 5, 'lake'],
  [5, 5, 'village', 'T'],
  [6, 5, 'lake'],
  [0, 6, 'mountain'],
  [1, 6, 'village', 'E'],
  [2, 6, 'village', 'E'],
  [3, 6, 'tundra', 'T'],
  [4, 6, 'forest'],
  [5, 6, 'mountain', 'E'],
  [6, 6, 'tundra'],
  [0, 7, 'saxony'],
  [1, 7, 'tundra'],
  [2, 7, 'lake'],
  [3, 7, 'farm'],
  [4, 7, 'mountain', 'E'],
  [5, 7, 'village'],
  [6, 7, 'farm'],
  [7, 7, 'togawa'],
  [2, 8, 'crimea'],
  [3, 8, 'village'],
];

const BASE_IDS: readonly string[] = [...FACTIONS, 'albion', 'togawa'];

export const HEXES: HexDef[] = MAP.map(([col, row, kind, flags = ''], id) => ({
  id,
  col,
  row,
  terrain: BASE_IDS.includes(kind) ? null : (kind as Terrain),
  base: BASE_IDS.includes(kind) ? (kind as BaseId) : undefined,
  encounter: flags.includes('E'),
  tunnel: flags.includes('T'),
}));

/** Rivières : paires de cases voisines séparées par une rivière. */
export const RIVERS: [number, number][] = [
  [4, 5], [4, 11], [5, 11], [6, 7], [6, 13], [9, 16], [11, 12], [12, 13], [12, 20], [13, 21], [14, 22],
  [14, 21], [16, 17], [17, 24], [20, 21], [20, 28], [23, 31], [23, 30], [24, 32], [24, 31], [27, 28],
  [28, 35], [30, 37], [31, 38], [31, 37], [32, 38], [38, 39], [39, 47], [40, 48], [40, 47], [41, 48], [48, 49],
];

export const FACTORY_HEX = HEXES.find((h) => h.terrain === 'factory')!.id;

export function baseHex(base: BaseId): number {
  return HEXES.find((h) => h.base === base)!.id;
}

/** Ordre des places autour de la table (sens horaire, en partant du haut). */
export const SEATING: Faction[] = ['nordic', 'rusviet', 'crimea', 'saxony', 'polania'];

// ——— Plateaux joueur ————————————————————————————————————————————————————————

export const TOP_ACTIONS = ['move', 'trade', 'produce', 'bolster'] as const;
export type TopAction = (typeof TOP_ACTIONS)[number];
export const BOTTOM_ACTIONS = ['upgrade', 'deploy', 'build', 'enlist'] as const;
export type BottomAction = (typeof BOTTOM_ACTIONS)[number];

/** Ressource payée pour chaque action du bas. */
export const BOTTOM_RESOURCE: Record<BottomAction, Resource> = {
  upgrade: 'oil',
  deploy: 'metal',
  build: 'wood',
  enlist: 'food',
};

export const MAT_IDS = ['industrial', 'engineering', 'patriotic', 'mechanical', 'agricultural'] as const;
export type MatId = (typeof MAT_IDS)[number];

export interface BottomDef {
  /** Coût de départ. */
  cost: number;
  /** Coût minimal, une fois toutes les améliorations faites. */
  min: number;
  coins: number;
}

export interface MatDef {
  /** Numéro de la fiche : le plus petit commence. */
  number: number;
  /** Actions du haut, de gauche à droite (les actions du bas sont toujours dans l'ordre BOTTOM_ACTIONS). */
  top: [TopAction, TopAction, TopAction, TopAction];
  popularity: number;
  coins: number;
  bottom: Record<BottomAction, BottomDef>;
}

export const MATS: Record<MatId, MatDef> = {
  industrial: {
    number: 1,
    top: ['bolster', 'produce', 'move', 'trade'],
    popularity: 2,
    coins: 4,
    bottom: { upgrade: { cost: 3, min: 2, coins: 3 }, deploy: { cost: 3, min: 1, coins: 2 }, build: { cost: 3, min: 2, coins: 1 }, enlist: { cost: 4, min: 2, coins: 0 } },
  },
  engineering: {
    number: 2,
    top: ['produce', 'trade', 'bolster', 'move'],
    popularity: 2,
    coins: 5,
    bottom: { upgrade: { cost: 3, min: 2, coins: 2 }, deploy: { cost: 4, min: 2, coins: 0 }, build: { cost: 3, min: 1, coins: 3 }, enlist: { cost: 3, min: 2, coins: 1 } },
  },
  patriotic: {
    number: 3,
    top: ['move', 'bolster', 'trade', 'produce'],
    popularity: 2,
    coins: 6,
    bottom: { upgrade: { cost: 2, min: 2, coins: 1 }, deploy: { cost: 4, min: 1, coins: 3 }, build: { cost: 4, min: 2, coins: 0 }, enlist: { cost: 3, min: 2, coins: 2 } },
  },
  mechanical: {
    number: 4,
    top: ['trade', 'bolster', 'move', 'produce'],
    popularity: 3,
    coins: 6,
    bottom: { upgrade: { cost: 3, min: 2, coins: 0 }, deploy: { cost: 3, min: 1, coins: 2 }, build: { cost: 3, min: 2, coins: 2 }, enlist: { cost: 4, min: 2, coins: 2 } },
  },
  agricultural: {
    number: 5,
    top: ['move', 'trade', 'produce', 'bolster'],
    popularity: 4,
    coins: 7,
    bottom: { upgrade: { cost: 2, min: 2, coins: 1 }, deploy: { cost: 4, min: 2, coins: 0 }, build: { cost: 4, min: 2, coins: 2 }, enlist: { cost: 3, min: 1, coins: 3 } },
  },
};

/** Combinaisons interdites par la règle. */
export const BANNED: [Faction, MatId][] = [
  ['rusviet', 'industrial'],
  ['crimea', 'patriotic'],
];

/** Cases améliorables du haut de la fiche (un cube chacune au départ). */
export const TOP_UPGRADES = ['move', 'gain', 'popularity', 'power', 'cards', 'produce'] as const;
export type TopUpgrade = (typeof TOP_UPGRADES)[number];

/** Valeur de base de chaque case améliorable, et bonus une fois le cube retiré. */
export const TOP_BASE: Record<TopUpgrade, number> = { move: 2, gain: 1, popularity: 1, power: 2, cards: 1, produce: 2 };

/** Structure placée au-dessus de chaque action du haut (bonus quand on prend l'action). */
export const STRUCTURES = ['mine', 'monument', 'mill', 'armory'] as const;
export type Structure = (typeof STRUCTURES)[number];
export const STRUCTURE_ACTION: Record<Structure, TopAction> = {
  mine: 'move',
  armory: 'trade',
  mill: 'produce',
  monument: 'bolster',
};

/** Bonus permanent de recrue pour chaque action du bas. */
export const RECRUIT_ONGOING: Record<BottomAction, 'power' | 'coins' | 'popularity' | 'cards'> = {
  upgrade: 'power',
  deploy: 'coins',
  build: 'popularity',
  enlist: 'cards',
};
/** Bonus immédiats de recrue (fiche faction). */
export const RECRUIT_ONCE = ['power', 'coins', 'popularity', 'cards'] as const;
export type RecruitOnce = (typeof RECRUIT_ONCE)[number];

/**
 * Coût de l'action Produire selon le nombre d'ouvriers sur le plateau : cases révélées sous les ouvriers de
 * la fiche (4e ouvrier : 1 puissance, 6e : 1 popularité, 8e : 1 pièce).
 */
export function produceCost(workersOnBoard: number): { power: number; popularity: number; coins: number } {
  return {
    power: workersOnBoard >= 4 ? 1 : 0,
    popularity: workersOnBoard >= 6 ? 1 : 0,
    coins: workersOnBoard >= 8 ? 1 : 0,
  };
}

export const WORKERS = 8;
export const MAX_POWER = 16;
export const MAX_POPULARITY = 18;
export const MAX_DIAL = 7;
export const STARS_TO_END = 6;

// ——— Triomphes et décompte ————————————————————————————————————————————————————

export const STAR_KINDS = ['upgrades', 'mechs', 'structures', 'recruits', 'workers', 'objective', 'combat', 'popularity', 'power'] as const;
export type StarKind = (typeof STAR_KINDS)[number];

/** Gains de fin de partie selon la popularité : par étoile, par territoire, par 2 ressources. */
export function scoreTier(popularity: number): { star: number; territory: number; resources: number } {
  if (popularity >= 13) return { star: 5, territory: 4, resources: 3 };
  if (popularity >= 7) return { star: 4, territory: 3, resources: 2 };
  return { star: 3, territory: 2, resources: 1 };
}

export const BONUS_TILES = ['adjTunnels', 'adjLakes', 'adjEncounters', 'onTunnels', 'inRow', 'onFarmTundra'] as const;
export type BonusTile = (typeof BONUS_TILES)[number];

/** Pièces gagnées selon le nombre atteint (indice = nombre, plafonné à la dernière valeur). */
export const BONUS_VALUES: Record<BonusTile, number[]> = {
  adjTunnels: [0, 2, 2, 4, 4, 6],
  adjLakes: [0, 2, 4, 4, 6],
  adjEncounters: [0, 2, 4, 4, 6],
  onTunnels: [0, 2, 4, 6],
  inRow: [0, 0, 2, 4, 6],
  onFarmTundra: [0, 2, 4, 4, 6],
};

export function bonusCoins(tile: BonusTile, n: number): number {
  const v = BONUS_VALUES[tile];
  return v[Math.min(n, v.length - 1)];
}

// ——— Cartes Combat —————————————————————————————————————————————————————————————

/** 42 cartes : 16 × 2, 12 × 3, 8 × 4, 6 × 5. */
export const COMBAT_DECK: number[] = [
  ...Array<number>(16).fill(2),
  ...Array<number>(12).fill(3),
  ...Array<number>(8).fill(4),
  ...Array<number>(6).fill(5),
];

// ——— Gains et coûts des cartes ————————————————————————————————————————————————

/** Gain d'une option de carte (rencontre ou Usine). */
export interface Gain {
  coins?: number;
  popularity?: number;
  power?: number;
  cards?: number;
  food?: number;
  wood?: number;
  metal?: number;
  oil?: number;
  /** Ressources au choix. */
  any?: number;
  workers?: number;
  upgrade?: number;
  deploy?: number;
  build?: number;
  enlist?: number;
}

export interface Cost {
  coins?: number;
  popularity?: number;
  power?: number;
  cards?: number;
  /** Ressources au choix, prises sur des territoires contrôlés. */
  any?: number;
}

export interface CardOption {
  cost: Cost;
  gain: Gain;
}

/** 28 cartes Rencontre du jeu de base (numéros 1 à 28), chacune avec 3 options. */
export const ENCOUNTERS: CardOption[][] = [
  [o({}, { coins: 2, popularity: 1 }), o({ coins: 2 }, { food: 4 }), o({ popularity: 2 }, { build: 1 })],
  [o({}, { cards: 1, popularity: 1 }), o({ coins: 2 }, { wood: 4 }), o({ popularity: 2 }, { enlist: 1 })],
  [o({}, { food: 2, popularity: 1 }), o({ coins: 2 }, { workers: 1, food: 3 }), o({ popularity: 3 }, { deploy: 1 })],
  [o({}, { metal: 2, popularity: 1 }), o({ coins: 3 }, { enlist: 1 }), o({ popularity: 2 }, { metal: 4 })],
  [o({}, { food: 2, popularity: 1 }), o({ coins: 4 }, { deploy: 1 }), o({ popularity: 2 }, { food: 2, metal: 2 })],
  [o({}, { coins: 2, popularity: 1 }), o({ coins: 3 }, { enlist: 1 }), o({ popularity: 2 }, { food: 4 })],
  [o({}, { oil: 2, popularity: 1 }), o({ coins: 2 }, { upgrade: 1 }), o({ popularity: 2 }, { oil: 4 })],
  [o({}, { coins: 2, popularity: 1 }), o({ coins: 2 }, { oil: 4 }), o({ popularity: 2 }, { enlist: 1 })],
  [o({}, { oil: 2, popularity: 1 }), o({ coins: 3 }, { build: 1 }), o({ popularity: 2 }, { oil: 4 })],
  [o({}, { oil: 2, popularity: 1 }), o({ coins: 4 }, { deploy: 1 }), o({ popularity: 2 }, { coins: 2, any: 2 })],
  [o({}, { food: 2, popularity: 1 }), o({ coins: 2 }, { workers: 1, food: 3 }), o({ popularity: 2 }, { build: 1 })],
  [o({}, { wood: 2, popularity: 1 }), o({ coins: 3 }, { build: 1 }), o({ popularity: 2 }, { workers: 1, wood: 3 })],
  [o({}, { coins: 2, popularity: 1 }), o({ coins: 2 }, { power: 2, popularity: 2 }), o({ popularity: 3 }, { any: 5 })],
  [o({}, { food: 2, popularity: 1 }), o({ coins: 2 }, { any: 3 }), o({ popularity: 2 }, { workers: 1, metal: 3 })],
  [o({}, { popularity: 2 }), o({ coins: 2 }, { any: 3 }), o({ popularity: 3 }, { any: 5 })],
  [o({}, { food: 2, popularity: 1 }), o({ coins: 2 }, { workers: 1, any: 2 }), o({ popularity: 2 }, { enlist: 1 })],
  [o({}, { cards: 1, popularity: 1 }), o({ coins: 2 }, { power: 2, cards: 2 }), o({ popularity: 3 }, { deploy: 1 })],
  [o({}, { food: 2, popularity: 1 }), o({ coins: 2 }, { any: 3 }), o({ popularity: 2 }, { workers: 1, wood: 3 })],
  [o({}, { coins: 2, popularity: 1 }), o({ coins: 2 }, { food: 4 }), o({ popularity: 2 }, { cards: 2, power: 3 })],
  [o({}, { cards: 1, popularity: 1 }), o({ coins: 2 }, { popularity: 3 }), o({ popularity: 2 }, { wood: 4 })],
  [o({}, { popularity: 2 }), o({ coins: 4 }, { deploy: 1 }), o({ popularity: 2 }, { cards: 2, power: 3 })],
  [o({}, { coins: 2, popularity: 1 }), o({ coins: 2 }, { metal: 4 }), o({ popularity: 2 }, { build: 1 })],
  [o({}, { coins: 2, popularity: 1 }), o({ coins: 3 }, { enlist: 1 }), o({ popularity: 2 }, { workers: 1, food: 3 })],
  [o({}, { cards: 1, popularity: 1 }), o({ coins: 2 }, { any: 3 }), o({ popularity: 3 }, { deploy: 1 })],
  [o({}, { power: 2, popularity: 1 }), o({ coins: 2 }, { power: 4 }), o({ popularity: 2 }, { upgrade: 1, any: 2 })],
  [o({}, { power: 2, popularity: 1 }), o({ coins: 2 }, { popularity: 3 }), o({ popularity: 2 }, { build: 1 })],
  [o({}, { coins: 2, popularity: 1 }), o({ coins: 2 }, { metal: 4 }), o({ popularity: 3 }, { deploy: 1 })],
  [o({}, { coins: 2, popularity: 1 }), o({ coins: 2 }, { workers: 1, any: 2 }), o({ popularity: 2 }, { build: 1 })],
];

/**
 * Cartes Usine : action du haut (une option au choix), l'action du bas étant toujours « déplacer une unité
 * jusqu'à deux fois ». Le guide officiel des cartes ne les détaille pas : contenu provisoire, à vérifier sur
 * les cartes (seules les n° 1 à 3 sont confirmées par la règle et la version numérique).
 */
export const FACTORY_CARDS: CardOption[][] = [
  [o({ popularity: 1 }, { upgrade: 1 }), o({ popularity: 1 }, { enlist: 1 })],
  [o({ coins: 2 }, { build: 1, popularity: 1 })],
  [o({ cards: 1 }, { upgrade: 1, power: 1 })],
  [o({ power: 2 }, { deploy: 1 })],
  [o({ coins: 1 }, { power: 3, cards: 1 })],
  [o({ popularity: 1 }, { any: 2, coins: 1 })],
  [o({ power: 2 }, { popularity: 2, coins: 2 })],
  [o({}, { power: 1, popularity: 1, coins: 1 })],
  [o({ coins: 3 }, { enlist: 1, cards: 1 })],
  [o({ power: 1 }, { any: 3 })],
  [o({ any: 2 }, { upgrade: 1, coins: 1 })],
  [o({ coins: 1 }, { popularity: 2, power: 1 })],
];

function o(cost: Cost, gain: Gain): CardOption {
  return { cost, gain };
}

// ——— Objectifs ——————————————————————————————————————————————————————————————

/** 23 cartes Objectif du jeu de base (numéros 1 à 23). */
export const OBJECTIVES = [
  'mountains3',
  'tunnels3',
  'farms3',
  'tundras3',
  'kingOfTheHill',
  'sendOneBack',
  'machineOverMuscle',
  'commonMan',
  'stockpile',
  'forests3',
  'villages3',
  'rich20',
  'foundations',
  'hedgeBets',
  'balancedWorkforce',
  'wolfAmongSheep',
  'divideConquer',
  'pacifist',
  'shoreUp',
  'foothold',
  'monopolize',
  'breakthrough',
  'tacticalMastery',
] as const;
export type ObjectiveId = (typeof OBJECTIVES)[number];
