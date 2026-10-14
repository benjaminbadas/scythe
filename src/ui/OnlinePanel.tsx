import { useState } from 'react';
import { CODE_PATTERN, type RoomView, api, onlineMemory } from '../online/api';
import { describeError } from './OnlineRoom';

/** Créer ou rejoindre une partie en ligne. */
export function OnlinePanel({ invite, onEnter }: { invite: string | null; onEnter: (code: string, room?: RoomView) => void }) {
  const [name, setName] = useState(() => onlineMemory.name());
  const [code, setCode] = useState(invite ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = onlineMemory.room();

  async function run(fn: () => Promise<RoomView>) {
    const clean = name.trim();
    if (!clean) {
      setError('Indiquez votre nom.');
      return;
    }
    onlineMemory.setName(clean);
    setBusy(true);
    setError(null);
    try {
      const room = await fn();
      onlineMemory.setRoom(room.code);
      onEnter(room.code, room);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const upper = code.trim().toUpperCase();
  return (
    <section className="panel">
      <h2>Jouer en ligne</h2>
      <p className="muted small">Chacun sur son téléphone, même à distance.</p>
      <label className="name-row">
        <input value={name} maxLength={20} placeholder="Votre nom" onChange={(e) => setName(e.target.value)} aria-label="Votre nom" />
      </label>
      <div className="row">
        <button className="primary" disabled={busy} onClick={() => run(() => api.create(name.trim()))}>
          Créer une partie
        </button>
        <input className="code-input" value={code} maxLength={5} placeholder="CODE" onChange={(e) => setCode(e.target.value)} aria-label="Code de la partie" />
        <button disabled={busy || !CODE_PATTERN.test(upper)} onClick={() => run(() => api.join(upper, name.trim()))}>
          Rejoindre
        </button>
      </div>
      {last && last !== upper && (
        <button className="ghost" onClick={() => onEnter(last)}>
          Reprendre la partie {last}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
