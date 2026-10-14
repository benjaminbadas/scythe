import { planTurn, type Action, type GameState } from '../engine';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (plan: Action[]) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; plan: Action[] }>) => {
      pending.get(e.data.id)?.(e.data.plan);
      pending.delete(e.data.id);
    };
    return worker;
  } catch {
    return null;
  }
}

/** Tour complet de l'IA pour le joueur actif. */
export function requestPlan(state: GameState): Promise<Action[]> {
  const w = getWorker();
  if (!w) return new Promise((resolve) => setTimeout(() => resolve(planTurn(state)), 0));
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ id, state });
  });
}

/** Pause avant chaque geste de l'IA, pour qu'on puisse suivre ce qu'elle fait. */
export function stepDelay(a: Action): number {
  switch (a.t) {
    case 'section':
      return 700;
    case 'move':
      return 450;
    case 'startMove':
    case 'endMove':
    case 'skipTop':
      return 200;
    case 'combat':
      return 600;
    case 'endTurn':
      return 600;
    default:
      return 650;
  }
}
