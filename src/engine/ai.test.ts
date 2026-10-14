import { describe, expect, it } from 'vitest';
import { apply, newGame, planTurn, ranking, starCount, type GameState } from '.';

function playOut(n: number, seed: number) {
  let s: GameState = newGame(Array.from({ length: n }, (_, i) => `IA ${i + 1}`), seed, { ai: Array(n).fill(true) });
  let steps = 0;
  const t0 = Date.now();
  let maxPlan = 0;
  while (s.status === 'playing' && steps < 4000) {
    const a = Date.now();
    const plan = planTurn(s);
    maxPlan = Math.max(maxPlan, Date.now() - a);
    expect(plan.length).toBeGreaterThan(0);
    for (const act of plan) {
      s = apply(s, act);
      steps++;
    }
  }
  return { s, steps, ms: Date.now() - t0, maxPlan };
}

describe('parties entre IA', () => {
  for (const n of [2, 4]) {
    it(`${n} joueurs vont jusqu'au bout`, () => {
      const { s, ms, maxPlan } = playOut(n, 1234 + n);
      expect(s.status).toBe('finished');
      console.log(n, 'joueurs', s.turnCount, 'tours', ms, 'ms, max', maxPlan, 'ms',
        s.players.map((p) => `${p.faction}/${p.mat} ★${starCount(p)} ${JSON.stringify(p.stars)}`).join(' | '),
        ranking(s).map((i) => s.final![i].total));
    }, 300000);
  }
});
