import type { BaseId, BottomAction, Faction, MatId, RecruitOnce, Resource, StarKind, Structure, Terrain, TopAction, TopUpgrade } from '../engine';

export const FACTION_NAMES: Record<BaseId, string> = {
  nordic: 'Royaume nordique',
  rusviet: 'Union rusviet',
  crimea: 'Khanat de Crimée',
  saxony: 'Empire saxon',
  polania: 'République de Polania',
  albion: 'Albion',
  togawa: 'Togawa',
};

export const BASE_LABELS: Record<BaseId, string> = {
  nordic: 'Nordique',
  rusviet: 'Rusviet',
  crimea: 'Crimée',
  saxony: 'Saxe',
  polania: 'Polania',
  albion: 'Albion',
  togawa: 'Togawa',
};

export const FACTION_SHORT: Record<Faction, string> = {
  nordic: 'Nordique',
  rusviet: 'Rusviet',
  crimea: 'Crimée',
  saxony: 'Saxe',
  polania: 'Polania',
};

/** Couleurs des factions (celles des pièces). */
export const FACTION_COLORS: Record<BaseId, string> = {
  nordic: '#3b78c4',
  rusviet: '#c8392f',
  crimea: '#e2b42b',
  saxony: '#2b2b2e',
  polania: '#ece8dc',
  albion: '#4f8a3b',
  togawa: '#7c4fa0',
};
export const FACTION_INK: Record<BaseId, string> = {
  nordic: '#fff',
  rusviet: '#fff',
  crimea: '#2a2205',
  saxony: '#f2f2f2',
  polania: '#222',
  albion: '#fff',
  togawa: '#fff',
};

export const FACTION_ABILITY: Record<Faction, { name: string; text: string }> = {
  nordic: { name: 'Nage', text: 'Vos ouvriers peuvent traverser les rivières.' },
  rusviet: { name: 'Implacable', text: 'Vous pouvez choisir la même section de votre fiche qu’au tour précédent.' },
  crimea: { name: 'Coercition', text: 'Une fois par tour, une carte Combat peut payer 1 ressource au choix.' },
  saxony: { name: 'Domination', text: 'Pas de limite d’étoiles pour les objectifs (2) et les victoires au combat.' },
  polania: { name: 'Serpente', text: 'Choisissez jusqu’à 2 options par carte Rencontre.' },
};

export const MAT_NAMES: Record<MatId, string> = {
  industrial: 'Industrielle (1)',
  engineering: 'Ingénierie (2)',
  patriotic: 'Patriotique (3)',
  mechanical: 'Mécanique (4)',
  agricultural: 'Agricole (5)',
};

export const TERRAIN_COLORS: Record<Terrain, string> = {
  farm: '#c9b04f',
  forest: '#3f6b33',
  mountain: '#8b8076',
  tundra: '#8fae9e',
  village: '#b9774a',
  lake: '#3d7fa8',
  factory: '#6b3d52',
};

export const TERRAIN_ICONS: Record<Terrain, string> = {
  farm: '🌾',
  forest: '🌲',
  mountain: '⛰',
  tundra: '❄',
  village: '🏘',
  lake: '〰',
  factory: '🏭',
};

export const RES_ICONS: Record<Resource, string> = { food: '🌾', wood: '🪵', metal: '⚙', oil: '🛢' };
export const RES_COLORS: Record<Resource, string> = { food: '#e8c547', wood: '#8a5a2e', metal: '#a9b3bb', oil: '#202020' };
export const RES_LABELS: Record<Resource, string> = { food: 'Nourriture', wood: 'Bois', metal: 'Métal', oil: 'Pétrole' };

export const STRUCTURE_ICONS: Record<Structure, string> = { mine: '⛏', monument: '🗽', mill: '🌀', armory: '🛡' };
export const STRUCTURE_TEXT: Record<Structure, string> = {
  mine: 'Mine : tunnel réservé à vous.',
  monument: 'Monument : +1 popularité à chaque Renforcer.',
  mill: 'Moulin : son territoire produit comme un ouvrier de plus, en bonus.',
  armory: 'Arsenal : +1 puissance à chaque Échanger.',
};

export const TOP_ICONS: Record<TopAction | 'factory', string> = { move: '🥾', trade: '⚖', produce: '⚒', bolster: '💪', factory: '🏭' };
export const BOTTOM_ICONS: Record<BottomAction | 'factoryMove', string> = { upgrade: '🔧', deploy: '🤖', build: '🏗', enlist: '🎖', factoryMove: '🥾' };

export const UPGRADE_LABELS: Record<TopUpgrade, string> = {
  move: 'Déplacer : unités',
  gain: 'Déplacer : pièces',
  popularity: 'Échanger : popularité',
  power: 'Renforcer : puissance',
  cards: 'Renforcer : cartes',
  produce: 'Produire : territoires',
};

export const RECRUIT_LABELS: Record<RecruitOnce, string> = {
  power: '2 puissance',
  coins: '2 $',
  popularity: '2 popularité',
  cards: '2 cartes Combat',
};
export const ONGOING_LABELS: Record<BottomAction, string> = {
  upgrade: '+1 puissance',
  deploy: '+1 $',
  build: '+1 popularité',
  enlist: '+1 carte',
};

export const STAR_ICONS: Record<StarKind, string> = {
  upgrades: '🔧',
  mechs: '🤖',
  structures: '🏗',
  recruits: '🎖',
  workers: '👷',
  objective: '📜',
  combat: '⚔',
  popularity: '❤',
  power: '💪',
};
