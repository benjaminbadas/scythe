import { useState } from 'react';
import { BANNED, FACTIONS, MAT_IDS, type Faction, type MatId } from '../engine';
import { loadNames, saveNames } from '../save';
import { FACTION_COLORS, FACTION_SHORT, MAT_NAMES } from './theme';
import { Rules } from './Rules';
import { OnlinePanel } from './OnlinePanel';
import type { RoomView } from '../online/api';

export interface SetupChoice {
  names: string[];
  ai: boolean[];
  factions: (Faction | null)[];
  mats: (MatId | null)[];
}

interface Props {
  onStart: (c: SetupChoice) => void;
  invite: string | null;
  onOnline: (code: string, room?: RoomView) => void;
}

export function Setup({ onStart, invite, onOnline }: Props) {
  const [names, setNames] = useState<string[]>(() => loadNames() ?? ['Joueur 1', 'Joueur 2', 'Joueur 3']);
  const [ai, setAi] = useState<boolean[]>([false, true, true, true, true]);
  const [factions, setFactions] = useState<(Faction | null)[]>([null, null, null, null, null]);
  const [mats, setMats] = useState<(MatId | null)[]>([null, null, null, null, null]);
  const [rules, setRules] = useState(false);
  const count = names.length;

  const setCount = (n: number) => setNames((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? `Joueur ${i + 1}`));
  const used = factions.slice(0, count);
  const usedMats = mats.slice(0, count);
  const duplicate = used.some((f, i) => f && used.indexOf(f) !== i) || usedMats.some((m, i) => m && usedMats.indexOf(m) !== i);
  const banned = used.some((f, i) => f && usedMats[i] && BANNED.some(([bf, bm]) => bf === f && bm === usedMats[i]));

  return (
    <div className="setup">
      <h1>
        Scythe <small>adaptation web non officielle</small>
      </h1>
      <p className="lead">
        Europa, années 1920 : produisez, construisez, déployez vos méchas et placez vos 6 étoiles avant les autres. De 2 à 5 joueurs sur le même écran, contre
        l’ordinateur ou en ligne.
      </p>
      {invite && <OnlinePanel invite={invite} onEnter={onOnline} />}
      <section className="panel">
        <h2>Sur le même écran</h2>
        <div className="count">
          {[2, 3, 4, 5].map((n) => (
            <button key={n} className={n === count ? 'on' : ''} onClick={() => setCount(n)}>
              {n} joueurs
            </button>
          ))}
        </div>
        {names.map((name, i) => (
          <div key={i} className="seat-row">
            <label className="name-row">
              <span className="dot" style={{ background: factions[i] ? FACTION_COLORS[factions[i]!] : '#777' }} />
              <input value={name} maxLength={20} onChange={(e) => setNames(names.map((x, k) => (k === i ? e.target.value : x)))} aria-label={`Nom du joueur ${i + 1}`} />
              <span className="ai-toggle" title="Joueur tenu par l’ordinateur">
                <input type="checkbox" checked={ai[i]} onChange={(e) => setAi(ai.map((x, k) => (k === i ? e.target.checked : x)))} aria-label={`Joueur ${i + 1} tenu par l’IA`} />
                🤖 IA
              </span>
            </label>
            <div className="row">
              <select value={factions[i] ?? ''} onChange={(e) => setFactions(factions.map((x, k) => (k === i ? ((e.target.value || null) as Faction | null) : x)))} aria-label="Faction">
                <option value="">Faction au hasard</option>
                {FACTIONS.map((f) => (
                  <option key={f} value={f}>
                    {FACTION_SHORT[f]}
                  </option>
                ))}
              </select>
              <select value={mats[i] ?? ''} onChange={(e) => setMats(mats.map((x, k) => (k === i ? ((e.target.value || null) as MatId | null) : x)))} aria-label="Fiche joueur">
                <option value="">Fiche au hasard</option>
                {MAT_IDS.map((m) => (
                  <option key={m} value={m}>
                    {MAT_NAMES[m]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {duplicate && <p className="error">Deux joueurs ont la même faction ou la même fiche.</p>}
        {banned && <p className="muted small">Combinaison normalement interdite (Rusviet + Industrielle, Crimée + Patriotique), acceptée si vous la choisissez.</p>}
        <button
          className="primary big"
          disabled={duplicate}
          onClick={() => {
            const clean = names.map((n, i) => n.trim() || `Joueur ${i + 1}`);
            saveNames(clean);
            onStart({ names: clean, ai: ai.slice(0, count), factions: factions.slice(0, count), mats: mats.slice(0, count) });
          }}
        >
          Lancer la partie
        </button>
      </section>
      {!invite && <OnlinePanel invite={null} onEnter={onOnline} />}
      <button className="ghost" onClick={() => setRules(!rules)}>
        {rules ? 'Masquer' : 'Afficher'} le résumé des règles
      </button>
      {rules && <Rules />}
      <p className="muted small">Scythe est un jeu de Jamey Stegmaier, illustré par Jakub Rozalski et édité par Stonemaier Games. Cette adaptation est destinée à un usage privé.</p>
    </div>
  );
}
