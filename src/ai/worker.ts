/// <reference lib="webworker" />
import { planTurn, type GameState } from '../engine';

// Calcule le tour de l'IA hors du fil principal, pour que l'écran reste fluide.
self.onmessage = (e: MessageEvent<{ id: number; state: GameState }>) => {
  const { id, state } = e.data;
  self.postMessage({ id, plan: planTurn(state) });
};
