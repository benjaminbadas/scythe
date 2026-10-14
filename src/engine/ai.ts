import { BOTTOM_ACTIONS, ENCOUNTERS, FACTORY_CARDS, FACTORY_HEX, HEXES, MAX_DIAL, RESOURCES, scoreTier, STRUCTURES, TOP_UPGRADES, type BottomAction, type CardOption, type Gain, type Resource } from './data';
import { NEIGHBORS, isTerritory } from './board';
import {
  RuleError,
  allowedSections,
  apply,
  bottomCost,
  bottomRoom,
  canBuildOn,
  canPayCost,
  canPayRes,
  controlledRes,
  maxCombatCards,
  movableUnits,
  objectiveMet,
  reachable,
  recruitCount,
  scoreOf,
  sectionActions,
  starCount,
  structureCount,
  topValue,
  totalRes,
  upgradesDone,
  workerHexes,
  type Action,
  type Choice,
  type CombatChoice,
  type GameState,
  type Player,
  type ResCounts,
  type UnitRef,
} from './game';

/*
 * IA « gourmande » : pour chaque section possible, des variantes de l'action du haut puis de l'action du bas
 * sont jouées sur une copie de la partie avec le moteur ; l'IA garde la suite dont la position obtenue a la
 * meilleure évaluation. Les combats sont simulés avec la même heuristique pour l'adversaire.
 */

function tryApply(s: GameState, a: Action): GameState | null {
  try {
    return apply(s, a);
  } catch (e) {
    if (e instanceof RuleError) return null;
    throw e;
  }
}

// ——— Évaluation ——————————————————————————————————————————————————————————————

/** Distance (en cases, rivières ignorées) entre deux territoires. */
const DIST: number[][] = HEXES.map((h) => {
  const d = HEXES.map(() => Infinity);
  d[h.id] = 0;
  const q = [h.id];
  while (q.length) {
    const x = q.shift()!;
    for (const n of NEIGHBORS[x]) {
      if (d[n] !== Infinity) continue;
      d[n] = d[x] + 1;
      if (isTerritory(n)) q.push(n);
    }
  }
  return d;
});

/** Force de combat estimée : puissance utilisable plus les meilleures cartes jouables. */
function strength(s: GameState, player: number, hex: number, known: boolean): number {
  const p = s.players[player];
  const k = Math.max(1, maxCombatCards(s, player, hex) || 1);
  const cards = known ? [...p.hand].sort((a, b) => b - a).slice(0, k).reduce((a, b) => a + b, 0) : Math.min(k, p.hand.length) * 3;
  return Math.min(MAX_DIAL, p.power) + cards;
}

/** Utilité des ressources contrôlées : celles qui servent encore aux actions du bas comptent davantage. */
function resourceValue(p: Player, res: ResCounts): number {
  const useful: Record<Resource, boolean> = {
    oil: upgradesDone(p) < 6,
    metal: p.mechs.length < 4,
    wood: structureCount(p) < 4,
    food: recruitCount(p) < 4,
  };
  let v = 0;
  for (const r of RESOURCES) {
    const n = res[r];
    v += useful[r] ? Math.min(n, 8) * 1.1 + Math.max(0, n - 8) * 0.3 : n * 0.25;
  }
  return v;
}

/** Valeur d'une position pour un joueur : score de fin estimé plus la progression vers les étoiles. */
export function evaluate(s: GameState, me: number): number {
  const p = s.players[me];
  if (s.status === 'finished') {
    const mine = scoreOf(s, me).total;
    const best = Math.max(...s.players.map((_, i) => (i === me ? -Infinity : scoreOf(s, i).total)));
    return mine * 2 + (mine > best ? 60 : 0);
  }
  const sc = scoreOf(s, me);
  const tier = scoreTier(p.popularity);
  let v = sc.total;
  v += starCount(p) * 7;
  v += upgradesDone(p) * 3.2;
  v += p.mechs.length * 4.5;
  v += structureCount(p) * 3.2;
  v += recruitCount(p) * 4;
  v += Math.min(p.workers.length, 8) * 1.6;
  v += Math.min(p.power, 16) * 0.45;
  v += Math.min(p.hand.length, 6) * 0.9;
  v += p.popularity * 0.35 + (tier.star - 3) * 2;
  v += resourceValue(p, controlledRes(s, me));
  if (p.factoryCard !== null) v += 5;
  // Le personnage va vers les rencontres et l'Usine.
  const targets = HEXES.filter((h) => s.board.encounters[h.id]).map((h) => h.id);
  if (p.factoryCard === null && s.factoryPool.length) targets.push(FACTORY_HEX);
  if (targets.length) {
    const d = Math.min(...targets.map((h) => DIST[p.character][h]));
    if (d !== Infinity) v -= Math.min(d, 6) * 0.6;
  }
  // Objectifs réalisables.
  for (const o of p.objectives) if (objectiveMet(s, me, o)) v += 4;
  // Menace : unités de combat adverses sur la même case (combat à venir).
  for (const h of new Set([p.character, ...p.mechs])) {
    const enemy = s.players.findIndex((q, i) => i !== me && (q.character === h || q.mechs.includes(h)));
    if (enemy < 0) continue;
    v += strength(s, me, h, true) > strength(s, enemy, h, false) + 1 ? 4 : -10;
  }
  // Une part du meilleur adversaire.
  let rival = 0;
  s.players.forEach((_, i) => {
    if (i !== me) rival = Math.max(rival, scoreOf(s, i).total + starCount(s.players[i]) * 5);
  });
  return v - rival * 0.2;
}

// ——— Choix ponctuels ————————————————————————————————————————————————————————

/** Mise secrète au combat. */
export function combatDecision(s: GameState): CombatChoice {
  const t = s.turn!;
  const c = t.pending[0];
  if (!c || c.k !== 'combat') return { power: 0, cards: [] };
  const me = t.player;
  const opp = me === c.attacker ? c.defender : c.attacker;
  const p = s.players[me];
  const k = maxCombatCards(s, me, c.hex);
  const order = p.hand.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const dialMax = Math.min(MAX_DIAL, p.power);
  const myMax = dialMax + order.slice(0, k).reduce((a, b) => a + b.v, 0);
  const oppEst = strength(s, opp, c.hex, false);
  // L'attaquant gagne les égalités : le défenseur doit dépasser.
  const target = me === c.attacker ? oppEst : oppEst + 1;
  if (myMax < target) {
    // Combat perdu d'avance : révéler 1 puissance permet de piocher une carte en se retirant.
    return { power: Math.min(1, dialMax), cards: [] };
  }
  // Atteindre la cible au moindre coût : d'abord les cartes (sans valeur en fin de partie), puis la puissance.
  const cards: number[] = [];
  let sum = 0;
  for (const c2 of [...order].reverse()) {
    if (cards.length >= k || sum >= target) break;
    cards.push(c2.i);
    sum += c2.v;
  }
  while (sum < target - dialMax && cards.length < k) {
    const next = order.find((o) => !cards.includes(o.i));
    if (!next) break;
    cards.push(next.i);
    sum += next.v;
  }
  return { power: Math.max(0, Math.min(dialMax, target - sum)), cards };
}

function neededResource(s: GameState, me: number): Resource {
  const p = s.players[me];
  const res = controlledRes(s, me);
  const map: Record<BottomAction, Resource> = { upgrade: 'oil', deploy: 'metal', build: 'wood', enlist: 'food' };
  const open: BottomAction[] = [];
  if (upgradesDone(p) < 6) open.push('upgrade');
  if (p.mechs.length < 4) open.push('deploy');
  if (structureCount(p) < 4) open.push('build');
  if (recruitCount(p) < 4) open.push('enlist');
  if (!open.length) return 'food';
  open.sort((a, b) => res[map[a]] - bottomCost(p, a) - (res[map[b]] - bottomCost(p, b)));
  return map[open[0]];
}

const MECH_ORDER = [3, 0, 1, 2];

/** Choix par défaut pour les gains d'une carte (ressources au choix, mécha, structure, recrue, amélioration). */
function autoChoice(s: GameState, me: number, g: Gain, at: number | null): Choice | null {
  const p = s.players[me];
  const choice: Choice = {};
  if (g.any) {
    const r = neededResource(s, me);
    choice.res = { [r]: g.any };
  }
  const needsHex = at === null && (g.any || RESOURCES.some((r) => g[r]) || g.deploy || g.build);
  if (needsHex) {
    const hexes = workerHexes(s, me).filter((h) => !g.build || canBuildOn(s, me, h));
    if (!hexes.length) return null;
    choice.hex = hexes[0];
  }
  if (g.deploy) {
    const m = MECH_ORDER.find((i) => !p.mechDeployed[i]);
    if (m === undefined) return null;
    choice.mech = m;
  }
  if (g.build) {
    const k = STRUCTURES.find((x) => p.structures[x] === null);
    const hex = at ?? choice.hex!;
    if (!k || !canBuildOn(s, me, hex)) return null;
    choice.structure = k;
  }
  if (g.enlist) {
    const section = (['enlist', 'build', 'deploy', 'upgrade'] as BottomAction[]).find((a) => !p.recruits[a]);
    const bonus = (['coins', 'power', 'popularity', 'cards'] as const).find((b) => !p.recruitBonus[b]);
    if (!section || !bonus) return null;
    choice.enlist = { section, bonus };
  }
  if (g.upgrade) {
    const from = (['produce', 'move', 'power', 'popularity', 'cards', 'gain'] as const).find((u) => p.topCubes[u]);
    const to = [...BOTTOM_ACTIONS].filter((a) => bottomRoom(p, a) > 0).sort((a, b) => bottomCost(p, b) - bottomCost(p, a))[0];
    if (!from || !to) return null;
    choice.upgrade = { from, to };
  }
  return choice;
}

function encounterActions(s: GameState): Action[] {
  const t = s.turn!;
  const e = t.pending[0];
  if (!e || e.k !== 'encounter') return [];
  const me = t.active;
  const p = s.players[me];
  const card = ENCOUNTERS[e.card];
  const pick = (i: number) => ({ option: i, choice: autoChoice(s, me, card[i].gain, p.character) ?? {} });
  const out: Action[] = card.map((_, i) => ({ t: 'encounter', picks: [pick(i)] }) as Action);
  if (p.faction === 'polania') {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) out.push({ t: 'encounter', picks: [pick(i), pick(j)] });
  }
  return out;
}

function worth(o: CardOption): number {
  const g = o.gain;
  const c = o.cost;
  const gain =
    (g.coins ?? 0) + (g.popularity ?? 0) * 1.2 + (g.power ?? 0) * 0.6 + (g.cards ?? 0) * 0.9 + RESOURCES.reduce((a, r) => a + (g[r] ?? 0), 0) +
    (g.any ?? 0) * 1.2 + (g.workers ?? 0) * 2 + (g.upgrade ?? 0) * 5 + (g.deploy ?? 0) * 6 + (g.build ?? 0) * 4.5 + (g.enlist ?? 0) * 6;
  const cost = (c.coins ?? 0) + (c.popularity ?? 0) * 1.3 + (c.power ?? 0) * 0.6 + (c.cards ?? 0) * 0.9 + (c.any ?? 0) * 1.1;
  return gain - cost;
}

// ——— Variantes d'actions ——————————————————————————————————————————————————————

function topVariants(s: GameState): Action[][] {
  const t = s.turn!;
  const me = t.active;
  const p = s.players[me];
  const sa = sectionActions(p, t.section!);
  const out: Action[][] = [[{ t: 'skipTop' }]];
  switch (sa.top) {
    case 'move':
      out.push([{ t: 'gain' }], [{ t: 'startMove' }]);
      break;
    case 'trade': {
      if (p.coins < 1) break;
      out.push([{ t: 'tradePop' }]);
      const hexes = workerHexes(s, me);
      if (hexes.length) {
        const hex = hexes.sort((a, b) => p.workers.filter((w) => w === b).length - p.workers.filter((w) => w === a).length)[0];
        for (let i = 0; i < 4; i++)
          for (let j = i; j < 4; j++) {
            const res: Partial<ResCounts> = {};
            res[RESOURCES[i]] = (res[RESOURCES[i]] ?? 0) + 1;
            res[RESOURCES[j]] = (res[RESOURCES[j]] ?? 0) + 1;
            out.push([{ t: 'trade', res, hex }]);
          }
      }
      break;
    }
    case 'produce': {
      const hexes = workerHexes(s, me)
        .filter((h) => h !== p.structures.mill)
        .sort((a, b) => p.workers.filter((w) => w === b).length - p.workers.filter((w) => w === a).length)
        .slice(0, 6);
      const limit = topValue(p, 'produce');
      const combos: number[][] = [];
      const rec = (start: number, cur: number[]) => {
        if (cur.length) combos.push([...cur]);
        if (cur.length >= limit) return;
        for (let i = start; i < hexes.length; i++) rec(i + 1, [...cur, hexes[i]]);
      };
      rec(0, []);
      if (p.structures.mill !== null) combos.push([]);
      for (const c of combos) {
        out.push([{ t: 'produce', hexes: c }]);
        // Variante sans nouveaux ouvriers (ils augmentent le coût de production).
        if (c.some((h) => HEXES[h].terrain === 'village')) out.push([{ t: 'produce', hexes: c, workers: Object.fromEntries(c.map((h) => [h, 0])) }]);
      }
      break;
    }
    case 'bolster':
      if (p.coins >= 1) out.push([{ t: 'bolster', what: 'power' }], [{ t: 'bolster', what: 'cards' }]);
      break;
    case 'factory': {
      const card = FACTORY_CARDS[p.factoryCard!];
      card.forEach((o, i) => {
        if (!canPayCost(s, me, o.cost)) return;
        const choice = autoChoice(s, me, o.gain, null);
        if (choice) out.push([{ t: 'factoryTop', option: i, choice }]);
      });
      break;
    }
  }
  return out;
}

function bottomVariants(s: GameState): Action[] {
  const t = s.turn!;
  const me = t.active;
  const p = s.players[me];
  const sa = sectionActions(p, t.section!);
  if (sa.bottom === 'factoryMove') return [{ t: 'factoryMove' }];
  const a = sa.bottom;
  if (!canPayRes(s, me, { [{ upgrade: 'oil', deploy: 'metal', build: 'wood', enlist: 'food' }[a]]: bottomCost(p, a) })) return [];
  const out: Action[] = [{ t: a } as Action];
  switch (a) {
    case 'upgrade':
      for (const from of TOP_UPGRADES) if (p.topCubes[from]) for (const to of BOTTOM_ACTIONS) if (bottomRoom(p, to) > 0) out.push({ t: 'upgrade', from, to });
      break;
    case 'deploy':
      for (let m = 0; m < 4; m++) if (!p.mechDeployed[m]) for (const hex of workerHexes(s, me)) if (HEXES[hex].terrain !== 'lake') out.push({ t: 'deploy', mech: m, hex });
      break;
    case 'build':
      for (const k of STRUCTURES) if (p.structures[k] === null) for (const hex of workerHexes(s, me)) if (canBuildOn(s, me, hex)) out.push({ t: 'build', structure: k, hex });
      break;
    case 'enlist':
      for (const section of BOTTOM_ACTIONS)
        if (!p.recruits[section]) for (const bonus of ['power', 'coins', 'popularity', 'cards'] as const) if (!p.recruitBonus[bonus]) out.push({ t: 'enlist', section, bonus });
      break;
  }
  return out;
}

/** Suites de déplacements (recherche en faisceau, unité par unité). */
function moveSequences(s: GameState, me: number): { s: GameState; acts: Action[] }[] {
  const BEAM = 4;
  let beam: { s: GameState; acts: Action[]; v: number }[] = [{ s, acts: [], v: evaluate(s, me) }];
  const done: { s: GameState; acts: Action[]; v: number }[] = [...beam];
  for (let depth = 0; depth < 3; depth++) {
    const next: { s: GameState; acts: Action[]; v: number }[] = [];
    for (const b of beam) {
      if (b.s.turn?.stage !== 'moving') continue;
      const p = b.s.players[me];
      const seen = new Set<string>();
      for (const u of movableUnits(b.s, me)) {
        const from = u.k === 'character' ? p.character : u.k === 'mech' ? p.mechs[u.i] : p.workers[u.i];
        const id = `${u.k}-${from}`;
        if (u.k === 'worker' && seen.has(id)) continue;
        seen.add(id);
        for (const [dest, path] of reachable(b.s, me, u)) {
          const variants: { workers?: number[]; res?: Partial<ResCounts> }[] = [{}];
          const workersHere = p.workers.map((w, i) => (w === from ? i : -1)).filter((i) => i >= 0);
          const resHere = b.s.board.res[from];
          const lake = HEXES[dest].terrain === 'lake';
          if (!lake) {
            if (u.k === 'mech' && workersHere.length) variants.push({ workers: workersHere });
            if (totalRes(resHere)) {
              variants.push({ res: { ...resHere } });
              if (u.k === 'mech' && workersHere.length) variants.push({ workers: workersHere, res: { ...resHere } });
            }
          }
          for (const v of variants) {
            const a: Action = { t: 'move', unit: u as UnitRef, path, ...v };
            const s2 = tryApply(b.s, a);
            if (!s2) continue;
            next.push({ s: s2, acts: [...b.acts, a], v: evaluate(s2, me) });
          }
        }
      }
    }
    next.sort((x, y) => y.v - x.v);
    beam = next.slice(0, BEAM);
    done.push(...beam);
  }
  done.sort((x, y) => y.v - x.v);
  return done.slice(0, BEAM + 2);
}

// ——— Planification ———————————————————————————————————————————————————————————

interface Line {
  s: GameState;
  acts: Action[];
}

/** Règle combats (des deux côtés), rencontres et choix d'Usine jusqu'au retour à l'étape suivante. */
function resolveAll(line: Line, me: number): Line[] {
  let lines: Line[] = [line];
  for (let guard = 0; guard < 12; guard++) {
    const out: Line[] = [];
    let changed = false;
    for (const l of lines) {
      const t = l.s.turn;
      if (l.s.status !== 'playing' || !t || t.stage !== 'resolve') {
        out.push(l);
        continue;
      }
      changed = true;
      const head = t.pending[0];
      let options: Action[] = [];
      if (head?.k === 'combat') {
        const d = combatDecision(l.s);
        options = [{ t: 'combat', power: d.power, cards: d.cards }];
      } else if (head?.k === 'encounter') options = encounterActions(l.s);
      else if (head?.k === 'factory') {
        const best = [...l.s.factoryPool].sort((a, b) => Math.max(...FACTORY_CARDS[b].map(worth)) - Math.max(...FACTORY_CARDS[a].map(worth)))[0];
        options = [{ t: 'pickFactory', card: best }];
      }
      for (const a of options) {
        const s2 = tryApply(l.s, a);
        if (s2) out.push({ s: s2, acts: [...l.acts, a] });
      }
      if (!options.length) out.push(l);
    }
    lines = out;
    if (!changed) break;
  }
  // Les rencontres multiplient les variantes : on garde les meilleures.
  if (lines.length > 4) lines = lines.map((l) => ({ l, v: evaluate(l.s, me) })).sort((a, b) => b.v - a.v).slice(0, 4).map((x) => x.l);
  return lines;
}

/** Révèle un objectif rempli dès que possible. */
function withObjectives(line: Line, me: number): Line {
  const p = line.s.players[me];
  for (let i = 0; i < p.objectives.length; i++) {
    if (!objectiveMet(line.s, me, p.objectives[i])) continue;
    const a: Action = { t: 'objective', i };
    const s2 = tryApply(line.s, a);
    if (s2) return { s: s2, acts: [...line.acts, a] };
  }
  return line;
}

function afterTop(line: Line, me: number): Line[] {
  const t = line.s.turn;
  if (!t || line.s.status !== 'playing') return [line];
  if (t.stage === 'moving') {
    const out: Line[] = [];
    for (const m of moveSequences(line.s, me)) {
      let s2: GameState | null = m.s;
      const acts = [...line.acts, ...m.acts];
      if (s2.turn?.stage === 'moving') {
        s2 = tryApply(s2, { t: 'endMove' });
        acts.push({ t: 'endMove' });
      }
      if (s2) out.push(...resolveAll({ s: s2, acts }, me));
    }
    return out;
  }
  return resolveAll(line, me);
}

function finishTurn(line: Line, me: number): Line[] {
  const t = line.s.turn;
  if (!t || line.s.status !== 'playing' || t.active !== me) return [line];
  let lines: Line[] = [withObjectives(line, me)];
  if (t.stage === 'bottom' || t.stage === 'top') {
    const out: Line[] = [...lines];
    for (const a of bottomVariants(lines[0].s)) {
      const s2 = tryApply(lines[0].s, a);
      if (!s2) continue;
      out.push(...afterTop({ s: s2, acts: [...lines[0].acts, a] }, me));
    }
    lines = out.map((l) => withObjectives(l, me));
  }
  return lines;
}

/** Suite d'actions de l'IA pour le joueur qui doit agir, jusqu'à la fin du tour ou au passage de la main. */
export function planTurn(s0: GameState): Action[] {
  const t0 = s0.turn;
  if (!t0 || s0.status !== 'playing') return [];
  const me = t0.player;
  // Défense : seulement la mise secrète.
  if (me !== t0.active) {
    const d = combatDecision(s0);
    return [{ t: 'combat', power: d.power, cards: d.cards }];
  }

  let starts: Line[] = [{ s: s0, acts: [] }];
  if (t0.stage === 'section') {
    starts = [];
    for (const i of allowedSections(s0, me)) {
      const a: Action = { t: 'section', i };
      const s1 = tryApply(s0, a);
      if (s1) starts.push({ s: s1, acts: [a] });
    }
  }

  let best: { line: Line; v: number } | null = null;
  const consider = (l: Line) => {
    const v = evaluate(l.s, me);
    if (!best || v > best.v) best = { line: l, v };
  };
  for (const start of starts) {
    const st = start.s.turn!;
    let tops: Line[];
    if (st.stage === 'top') {
      tops = [];
      for (const variant of topVariants(start.s)) {
        let s2: GameState | null = start.s;
        for (const a of variant) s2 = s2 && tryApply(s2, a);
        if (s2) tops.push(...afterTop({ s: s2, acts: [...start.acts, ...variant] }, me));
      }
      // On ne garde que les meilleures actions du haut avant d'essayer celles du bas.
      tops = tops.map((l) => ({ l, v: evaluate(l.s, me) })).sort((a, b) => b.v - a.v).slice(0, 6).map((x) => x.l);
    } else tops = afterTop(start, me);
    for (const l of tops) for (const f of finishTurn(l, me)) consider(f);
  }
  const chosen = (best as { line: Line; v: number } | null)?.line ?? { s: s0, acts: [] };
  // On s'arrête quand la main passe à un autre joueur (défense d'un combat).
  const acts: Action[] = [];
  let cur = s0;
  for (const a of chosen.acts) {
    if (cur.turn?.player !== me) break;
    const next = tryApply(cur, a);
    if (!next) break;
    acts.push(a);
    cur = next;
  }
  if (cur.status === 'playing' && cur.turn?.player === me && cur.turn.active === me && cur.turn.stage !== 'resolve' && cur.turn.stage !== 'moving') {
    if (cur.turn.stage === 'section') {
      const i = allowedSections(cur, me)[0];
      acts.push({ t: 'section', i });
    }
    acts.push({ t: 'endTurn' });
  }
  return acts;
}
