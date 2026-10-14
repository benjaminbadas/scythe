import { FACTION_DEFS, FACTORY_HEX, HEXES, RIVERS, type BaseId, type Faction, type MechAbility } from './data';

/**
 * Voisins géométriques d'une case, par côté : 0 haut droite, 1 droite, 2 bas droite, 3 bas gauche, 4 gauche,
 * 5 haut gauche. Les lignes paires sont décalées d'un demi-hexagone vers la droite.
 */
const EVEN = [[-1, 1], [0, 1], [1, 1], [1, 0], [0, -1], [-1, 0]];
const ODD = [[-1, 0], [0, 1], [1, 0], [1, -1], [0, -1], [-1, -1]];

const byPos = new Map(HEXES.map((h) => [`${h.col},${h.row}`, h.id]));

export function neighborAt(id: number, side: number): number | null {
  const h = HEXES[id];
  const [dr, dc] = (h.row % 2 === 0 ? EVEN : ODD)[side];
  return byPos.get(`${h.col + dc},${h.row + dr}`) ?? null;
}

/** Cases voisines (bases comprises), sans tenir compte des rivières. */
export const NEIGHBORS: number[][] = HEXES.map((h) => {
  const out: number[] = [];
  for (let side = 0; side < 6; side++) {
    const n = neighborAt(h.id, side);
    if (n !== null) out.push(n);
  }
  return out;
});

const riverSet = new Set(RIVERS.flatMap(([a, b]) => [`${a}-${b}`, `${b}-${a}`]));
export function river(a: number, b: number): boolean {
  return riverSet.has(`${a}-${b}`);
}

export const TUNNELS = HEXES.filter((h) => h.tunnel).map((h) => h.id);
export const LAKES = HEXES.filter((h) => h.terrain === 'lake').map((h) => h.id);

export function isTerritory(id: number): boolean {
  return HEXES[id].terrain !== null;
}

/** Territoires reliés à une base par la terre (sans rivière ni lac) : cases de départ des ouvriers. */
export function landNeighbors(id: number): number[] {
  return NEIGHBORS[id].filter((n) => isTerritory(n) && HEXES[n].terrain !== 'lake' && !river(id, n));
}

/** Ce que le calcul des déplacements doit savoir du joueur et du plateau. */
export interface MoveContext {
  faction: Faction;
  abilities: Set<MechAbility>;
  /** Cases que le joueur contrôle (pour Canton et Passage souterrain). */
  controls: (hex: number) => boolean;
  /** Case de la Mine du joueur, s'il l'a construite. */
  mine: number | null;
  /** Bases des factions absentes de la partie (Droit chemin). */
  inactiveBases: number[];
  ownBase: number;
}

/**
 * Cases atteignables en un pas par une unité. Les règles d'arrêt (ennemis, rencontres) et d'accès
 * réservé aux ouvriers sont appliquées par l'appelant.
 */
export function steps(ctx: MoveContext, kind: 'character' | 'mech' | 'worker', from: number): number[] {
  const combat = kind !== 'worker';
  const ab = combat ? ctx.abilities : new Set<MechAbility>();
  const out = new Set<number>();
  const fromLake = HEXES[from].terrain === 'lake';
  const lakeMover = ab.has('seaworthy') || ab.has('submerge');
  const riverwalk = ab.has('riverwalk') ? FACTION_DEFS[ctx.faction].riverwalk : null;

  for (const n of NEIGHBORS[from]) {
    const h = HEXES[n];
    if (!isTerritory(n)) continue;
    if (h.terrain === 'lake') {
      if (lakeMover) out.add(n);
      continue;
    }
    if (fromLake) {
      // Le lac s'étend jusqu'aux rives : pas de rivière entre un lac et la terre.
      out.add(n);
      continue;
    }
    if (river(from, n)) {
      const swim = kind === 'worker' && ctx.faction === 'nordic';
      if (!swim && !(riverwalk && riverwalk.includes(h.terrain!))) continue;
    }
    out.add(n);
  }

  // Tunnels (et la Mine du joueur) : tous adjacents entre eux.
  const tunnelLike = (x: number) => HEXES[x].tunnel || x === ctx.mine;
  if (tunnelLike(from)) {
    for (const t of TUNNELS) out.add(t);
    if (ctx.mine !== null) out.add(ctx.mine);
  }
  if (combat) {
    if (ab.has('submerge') && fromLake) for (const l of LAKES) out.add(l);
    if (ab.has('township')) {
      const villages = HEXES.filter((h) => h.terrain === 'village' && ctx.controls(h.id)).map((h) => h.id);
      if (from === FACTORY_HEX) villages.forEach((v) => out.add(v));
      if (villages.includes(from)) out.add(FACTORY_HEX);
    }
    if (ab.has('underpass')) {
      const mountains = HEXES.filter((h) => h.terrain === 'mountain' && ctx.controls(h.id)).map((h) => h.id);
      if (mountains.includes(from) || tunnelLike(from)) {
        mountains.forEach((m) => out.add(m));
        TUNNELS.forEach((t) => out.add(t));
        if (ctx.mine !== null) out.add(ctx.mine);
      }
    }
    if (ab.has('wayfare')) {
      for (const b of ctx.inactiveBases) out.add(b);
      out.add(ctx.ownBase);
    }
  }
  out.delete(from);
  return [...out];
}

/** Bases des factions qui ne jouent pas (Albion et Togawa sont toujours absentes). */
export function inactiveBases(active: Faction[]): number[] {
  return HEXES.filter((h) => h.base && !active.includes(h.base as Faction)).map((h) => h.id);
}

export function baseOf(id: number): BaseId | undefined {
  return HEXES[id].base;
}

/** Longueur de la plus longue ligne droite continue de cases d'un ensemble. */
export function longestRow(cells: Set<number>): number {
  let best = cells.size ? 1 : 0;
  for (const start of cells) {
    for (const side of [0, 1, 2]) {
      const back = neighborAt(start, side + 3);
      if (back !== null && cells.has(back)) continue; // pas le début de la ligne
      let len = 1;
      let cur: number | null = neighborAt(start, side);
      while (cur !== null && cells.has(cur)) {
        len++;
        cur = neighborAt(cur, side);
      }
      best = Math.max(best, len);
    }
  }
  return best;
}
