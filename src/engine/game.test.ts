import { describe, expect, it } from 'vitest';
import {
  FACTORY_HEX,
  HEXES,
  RIVERS,
  RuleError,
  apply,
  baseHex,
  controller,
  landNeighbors,
  longestRow,
  neighborAt,
  newGame,
  objectiveMet,
  reachable,
  river,
  scoreOf,
  starCount,
  type Action,
  type GameState,
} from '.';

const hexAt = (col: number, row: number) => HEXES.find((h) => h.col === col && h.row === row)!.id;

function game(factions: ('nordic' | 'rusviet' | 'crimea' | 'saxony' | 'polania')[], mats?: ('industrial' | 'engineering' | 'patriotic' | 'mechanical' | 'agricultural')[]) {
  return newGame(factions.map((f) => f), 42, { factions, mats });
}

function play(s: GameState, ...acts: Action[]): GameState {
  return acts.reduce((x, a) => apply(x, a), s);
}

describe('plateau', () => {
  it('compte les cases du plateau', () => {
    expect(HEXES.filter((h) => h.terrain).length).toBe(47);
    expect(HEXES.filter((h) => h.encounter).length).toBe(11);
    expect(HEXES.filter((h) => h.tunnel).length).toBe(6);
    expect(HEXES.filter((h) => h.terrain === 'lake').length).toBe(7);
  });

  it('les rivières séparent des cases voisines', () => {
    for (const [a, b] of RIVERS) {
      const sides = [0, 1, 2, 3, 4, 5].filter((k) => neighborAt(a, k) === b);
      expect(sides.length).toBe(1);
    }
  });

  it('chaque faction démarre sur deux territoires reliés à sa base par la terre', () => {
    const terrains = (f: 'nordic' | 'rusviet' | 'crimea' | 'saxony' | 'polania') =>
      landNeighbors(baseHex(f))
        .map((h) => HEXES[h].terrain)
        .sort();
    expect(terrains('nordic')).toEqual(['forest', 'tundra']);
    expect(terrains('rusviet')).toEqual(['mountain', 'village']);
    expect(terrains('crimea')).toEqual(['farm', 'village']);
    expect(terrains('saxony')).toEqual(['mountain', 'tundra']);
    expect(terrains('polania')).toEqual(['farm', 'forest']);
    // La ferme au nord de la base rusviet n'est accessible qu'en traversant la rivière.
    expect(river(baseHex('rusviet'), hexAt(6, 2))).toBe(true);
  });

  it('mesure les alignements de structures', () => {
    expect(longestRow(new Set([hexAt(1, 4), hexAt(2, 4), hexAt(3, 4)]))).toBe(3);
    expect(longestRow(new Set([hexAt(1, 4), hexAt(3, 4)]))).toBe(1);
  });
});

describe('mise en place', () => {
  it('suit les fiches faction et joueur', () => {
    const s = game(['nordic', 'saxony'], ['industrial', 'agricultural']);
    const nordic = s.players.find((p) => p.faction === 'nordic')!;
    expect(nordic.power).toBe(4);
    expect(nordic.hand.length).toBe(1);
    expect(nordic.coins).toBe(4);
    expect(nordic.popularity).toBe(2);
    expect(nordic.workers.length).toBe(2);
    expect(nordic.objectives.length).toBe(2);
    expect(s.factoryPool.length).toBe(3);
    // La fiche n° 1 commence.
    expect(s.players[s.turn!.active].mat).toBe('industrial');
  });

  it('refuse les combinaisons interdites au tirage', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = newGame(['a', 'b', 'c', 'd', 'e'], seed);
      for (const p of s.players) {
        expect(p.faction === 'rusviet' && p.mat === 'industrial').toBe(false);
        expect(p.faction === 'crimea' && p.mat === 'patriotic').toBe(false);
      }
    }
  });
});

describe('actions', () => {
  it('interdit de reprendre la même section, sauf pour Rusviet', () => {
    let s = game(['nordic', 'saxony'], ['industrial', 'agricultural']);
    const me = s.turn!.active;
    s = play(s, { t: 'section', i: 0 }, { t: 'endTurn' }, { t: 'section', i: 0 }, { t: 'endTurn' });
    expect(s.turn!.active).toBe(me);
    expect(() => apply(s, { t: 'section', i: 0 })).toThrow(RuleError);

    let r = game(['rusviet', 'saxony'], ['engineering', 'agricultural']);
    const rus = r.players.findIndex((p) => p.faction === 'rusviet');
    expect(r.turn!.active).toBe(rus);
    r = play(r, { t: 'section', i: 1 }, { t: 'endTurn' }, { t: 'section', i: 0 }, { t: 'endTurn' });
    expect(() => apply(r, { t: 'section', i: 1 })).not.toThrow();
  });

  it('produit sur les territoires des ouvriers, puis paie le coût de production', () => {
    let s = game(['nordic', 'saxony'], ['industrial', 'agricultural']);
    const me = s.turn!.active;
    const p = s.players[me];
    const hexes = [...p.workers];
    // Industriel : Produire est la 2e section.
    s = play(s, { t: 'section', i: 1 }, { t: 'produce', hexes });
    const total = hexes.reduce((a, h) => a + Object.values(s.board.res[h]).reduce((x, y) => x + y, 0), 0);
    expect(total).toBe(2);
    expect(s.turn!.stage).toBe('bottom');
  });

  it('les ouvriers ne traversent pas les rivières, sauf les Nordiques', () => {
    // Rusviet : l'ouvrier du village voisin de la base ne passe pas la rivière vers la forêt tunnel.
    const s = game(['rusviet', 'nordic'], ['patriotic', 'agricultural']);
    const me = s.turn!.active;
    expect(s.players[me].faction).toBe('rusviet');
    const moving = play(s, { t: 'section', i: 0 }, { t: 'startMove' });
    const village = hexAt(6, 3);
    const w = moving.players[me].workers.indexOf(village);
    const reach = reachable(moving, me, { k: 'worker', i: w });
    expect(reach.has(hexAt(5, 3))).toBe(false); // rivière
    expect(reach.has(hexAt(6, 4))).toBe(true);
  });

  it('les tunnels sont adjacents entre eux', () => {
    const s = game(['nordic', 'saxony'], ['patriotic', 'agricultural']);
    const me = s.turn!.active;
    const moving = play(s, { t: 'section', i: 0 }, { t: 'startMove' });
    // Simule un ouvrier sur le tunnel de la toundra (3,2).
    moving.players[me].workers[0] = hexAt(3, 2);
    const reach = reachable(moving, me, { k: 'worker', i: 0 });
    for (const h of HEXES.filter((x) => x.tunnel && x.id !== hexAt(3, 2))) expect(reach.has(h.id)).toBe(true);
  });

  it('un personnage qui entre sur une rencontre la résout', () => {
    let s = game(['crimea', 'saxony'], ['industrial', 'agricultural']);
    const me = s.turn!.active;
    s.players[me].character = hexAt(3, 7);
    s = play(s, { t: 'section', i: 2 }, { t: 'startMove' });
    const reach = reachable(s, me, { k: 'character' });
    expect(reach.has(hexAt(2, 6))).toBe(false); // rivière entre la ferme et le village
    const enc = hexAt(1, 6); // village avec rencontre
    s.players[me].character = hexAt(1, 7);
    s = play(s, { t: 'move', unit: { k: 'character' }, path: [enc] }, { t: 'endMove' });
    expect(s.turn!.stage).toBe('resolve');
    expect(s.turn!.pending[0].k).toBe('encounter');
    const before = s.players[me].coins;
    s = play(s, { t: 'encounter', picks: [{ option: 0 }] });
    expect(s.board.encounters[enc]).toBe(false);
    expect(s.turn!.stage).toBe('bottom');
    expect(s.players[me].coins + s.players[me].popularity).toBeGreaterThan(before);
  });

  it('combat : l’attaquant gagne les égalités, le perdant se retire et pioche', () => {
    let s = game(['crimea', 'saxony'], ['industrial', 'agricultural']);
    const me = s.turn!.active;
    const opp = 1 - me;
    const target = hexAt(3, 5);
    s.players[opp].character = target;
    s.players[opp].workers[0] = target;
    s.players[me].character = hexAt(3, 6);
    s.players[me].power = 5;
    s.players[opp].power = 5;
    s.players[opp].hand = [];
    s = play(s, { t: 'section', i: 2 }, { t: 'startMove' }, { t: 'move', unit: { k: 'character' }, path: [target] });
    if (s.turn!.stage === 'moving') s = apply(s, { t: 'endMove' });
    expect(s.turn!.player).toBe(me);
    s = play(s, { t: 'combat', power: 3, cards: [] });
    expect(s.turn!.player).toBe(opp);
    s = play(s, { t: 'combat', power: 3, cards: [] });
    expect(controller(s, target)).toBe(me);
    expect(s.players[opp].character).toBe(baseHex(s.players[opp].faction));
    expect(s.players[me].stars.combat).toBe(1);
    expect(s.players[opp].hand.length).toBe(1);
    expect(s.players[me].power).toBe(2);
  });

  it('enrôler donne le bonus immédiat puis le bonus permanent', () => {
    let s = game(['nordic', 'saxony'], ['industrial', 'agricultural']);
    const me = s.turn!.active;
    s.board.res[s.players[me].workers[0]].food = 8;
    // Industriel : section 3 = Échanger / Enrôler (coût 4 nourriture).
    s = play(s, { t: 'section', i: 3 }, { t: 'skipTop' }, { t: 'enlist', section: 'enlist', bonus: 'coins' });
    const p = s.players[me];
    expect(p.recruits.enlist).toBe(true);
    expect(p.coins).toBe(4 + 2);
    // Le bonus permanent d'Enrôler (1 carte) arrive immédiatement pour soi.
    expect(p.hand.length).toBe(2);
    expect(s.board.res[p.workers[0]].food).toBe(4);
  });

  it('la 6e étoile termine la partie et lance le décompte', () => {
    let s = game(['nordic', 'saxony'], ['industrial', 'agricultural']);
    const me = s.turn!.active;
    s.players[me].stars = { mechs: 1, structures: 1, recruits: 1, workers: 1, combat: 1 };
    s.players[me].power = 15;
    // Renforcer (section 0 d'Industriel) : +2 puissance → 16 → étoile.
    s = play(s, { t: 'section', i: 0 }, { t: 'bolster', what: 'power' });
    expect(s.status).toBe('finished');
    expect(starCount(s.players[me])).toBe(6);
    expect(s.final!.length).toBe(2);
    expect(s.final![me].stars).toBe(6 * 3);
  });

  it('l’Usine compte pour 3 territoires', () => {
    const s = game(['nordic', 'saxony'], ['industrial', 'agricultural']);
    const me = s.turn!.active;
    const before = scoreOf(s, me).territories;
    s.players[me].character = FACTORY_HEX;
    expect(scoreOf(s, me).territories).toBe(before + 3 * 2);
  });

  it('vérifie les objectifs', () => {
    const s = game(['nordic', 'saxony'], ['industrial', 'agricultural']);
    const me = s.turn!.active;
    s.players[me].coins = 25;
    expect(objectiveMet(s, me, 'rich20')).toBe(true);
    expect(objectiveMet(s, me, 'mountains3')).toBe(false);
  });
});
