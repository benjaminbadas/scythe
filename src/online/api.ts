import type { GameState } from '../engine';

/** Salle telle que renvoyée par le serveur (api/room.php). */
export interface RoomView {
  code: string;
  status: 'lobby' | 'playing';
  version: number;
  seats: { name: string }[];
  state: GameState | null;
  /** Place de ce téléphone dans la salle, -1 s'il n'y est pas assis. */
  you: number;
}

/** Erreur renvoyée par le serveur (code traduit par l'interface) ou erreur réseau. */
export class OnlineError extends Error {
  constructor(
    readonly code: string,
    /** État à jour de la salle, renvoyé quand quelqu'un a joué entre-temps. */
    readonly room?: RoomView,
  ) {
    super(code);
  }
}

const URL = `${import.meta.env.BASE_URL}api/room.php`;
export const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible : la partie en ligne reste jouable tant que la page est ouverte.
  }
}

let memoryToken: string | null = null;

/** Identifiant secret de ce téléphone, créé une fois puis conservé. */
export function deviceToken(): string {
  const saved = storageGet('scythe.jeton');
  if (saved && /^[a-f0-9]{32}$/.test(saved)) return saved;
  if (!memoryToken) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    memoryToken = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  storageSet('scythe.jeton', memoryToken);
  return memoryToken;
}

/** Dernière salle en ligne ouverte sur ce téléphone, pour pouvoir y revenir. */
export const onlineMemory = {
  room: () => storageGet('scythe.enLigne'),
  setRoom: (code: string | null) => storageSet('scythe.enLigne', code),
  name: () => storageGet('scythe.nom') ?? '',
  setName: (name: string) => storageSet('scythe.nom', name),
};

async function request(init: RequestInit, query = ''): Promise<RoomView | { unchanged: true; version: number }> {
  let response: Response;
  try {
    response = await fetch(URL + query, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-Scythe-Token': deviceToken(), ...init.headers },
      cache: 'no-store',
    });
  } catch {
    throw new OnlineError('network');
  }
  let data: { error?: string; room?: RoomView } & Record<string, unknown>;
  try {
    data = await response.json();
  } catch {
    throw new OnlineError(response.ok ? 'invalid' : 'network');
  }
  if (!response.ok || data.error) throw new OnlineError(data.error ?? 'network', data.room);
  return data as unknown as RoomView;
}

function post(body: Record<string, unknown>): Promise<RoomView> {
  return request({ method: 'POST', body: JSON.stringify({ ...body, token: deviceToken() }) }) as Promise<RoomView>;
}

export const api = {
  create: (name: string) => post({ op: 'create', name }),
  join: (code: string, name: string) => post({ op: 'join', code, name }),
  leave: (code: string) => post({ op: 'leave', code }),
  start: (code: string, state: GameState) => post({ op: 'start', code, state }),
  act: (code: string, version: number, state: GameState) => post({ op: 'action', code, version, state }),
  /** Renvoie null si rien n'a changé depuis `version`. */
  async poll(code: string, version?: number): Promise<RoomView | null> {
    const query = `?code=${code}${version === undefined ? '' : `&v=${version}`}`;
    const data = await request({ method: 'GET' }, query);
    return 'unchanged' in data ? null : data;
  },
};

/** Lien à partager pour rejoindre une salle. */
export function shareUrl(code: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}#${code}`;
}
