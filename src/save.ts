import type { GameState } from './engine';

const KEY = 'scythe.partie';

/** Partie en passe-et-joue sauvegardée sur cet appareil (absente si le stockage est indisponible). */
export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s?.version === 1 ? s : null;
  } catch {
    return null;
  }
}

export function saveGame(s: GameState | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // Stockage indisponible : la partie continue tant que la page reste ouverte.
  }
}

const NAMES_KEY = 'scythe.noms';

export function loadNames(): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(NAMES_KEY) ?? 'null');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

export function saveNames(names: string[]) {
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(names));
  } catch {
    // ignoré
  }
}
