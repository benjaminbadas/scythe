import { useState } from 'react';
import {
  BOTTOM_ACTIONS,
  BOTTOM_NAMES,
  BOTTOM_RESOURCE,
  FACTION_DEFS,
  FACTORY_CARDS,
  HEXES,
  MATS,
  MECH_NAMES,
  OBJECTIVE_TEXT,
  RECRUIT_ONCE,
  RESOURCES,
  STAR_NAMES,
  STRUCTURES,
  STRUCTURE_ACTION,
  STRUCTURE_NAMES,
  TERRAIN_NAMES,
  TOP_NAMES,
  TOP_UPGRADES,
  bottomCost,
  bottomRoom,
  describeOption,
  produceCost,
  ranking,
  scoreOf,
  scoreTier,
  starCount,
  topValue,
  totalRes,
  type BottomAction,
  type Choice,
  type Gain,
  type GameState,
  type Player,
  type ResCounts,
  type TopAction,
} from '../engine';
import {
  BOTTOM_ICONS,
  FACTION_ABILITY,
  FACTION_COLORS,
  FACTION_INK,
  FACTION_SHORT,
  MAT_NAMES,
  ONGOING_LABELS,
  RECRUIT_LABELS,
  RES_ICONS,
  RES_LABELS,
  STAR_ICONS,
  STRUCTURE_ICONS,
  STRUCTURE_TEXT,
  TOP_ICONS,
  UPGRADE_LABELS,
} from './theme';

export function hexLabel(id: number): string {
  const h = HEXES[id];
  if (!h.terrain) return `base ${h.base}`;
  return TERRAIN_NAMES[h.terrain];
}

export function FactionDot({ p }: { p: Player }) {
  return <span className="dot" style={{ background: FACTION_COLORS[p.faction] }} title={FACTION_SHORT[p.faction]} />;
}

export function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <span className="stepper">
      <button type="button" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="moins">
        −
      </button>
      <b>{value}</b>
      <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="plus">
        +
      </button>
    </span>
  );
}

/** Sélecteur de ressources (au plus `max` au total). */
export function ResPicker({ value, max, onChange }: { value: Partial<ResCounts>; max: number; onChange: (v: Partial<ResCounts>) => void }) {
  const sum = totalRes(value);
  return (
    <div className="res-picker">
      {RESOURCES.map((r) => (
        <label key={r} title={RES_LABELS[r]}>
          <span>{RES_ICONS[r]}</span>
          <Stepper value={value[r] ?? 0} min={0} max={(value[r] ?? 0) + (max - sum)} onChange={(n) => onChange({ ...value, [r]: n })} />
        </label>
      ))}
    </div>
  );
}

/** Texte court d'une action du haut avec ses valeurs actuelles. */
export function topText(p: Player, top: TopAction | 'factory'): string {
  switch (top) {
    case 'move':
      return `${topValue(p, 'move')} unités ou +${topValue(p, 'gain')} $`;
    case 'trade':
      return `1 $ → 2 ressources ou +${topValue(p, 'popularity')} ❤`;
    case 'produce':
      return `${topValue(p, 'produce')} territoires`;
    case 'bolster':
      return `1 $ → +${topValue(p, 'power')} 💪 ou ${topValue(p, 'cards')} carte${topValue(p, 'cards') > 1 ? 's' : ''}`;
    case 'factory':
      return p.factoryCard === null ? '' : FACTORY_CARDS[p.factoryCard].map(describeOption).join(' / ');
  }
}

export function bottomText(p: Player, a: BottomAction | 'factoryMove'): string {
  if (a === 'factoryMove') return '1 unité, jusqu’à 2 cases';
  const coins = MATS[p.mat].bottom[a].coins;
  return `${bottomCost(p, a)} ${RES_ICONS[BOTTOM_RESOURCE[a]]}${coins ? ` → +${coins} $` : ''}`;
}

/** Fiche joueur : sections, structures, recrues, méchas. */
export function MatView({ p }: { p: Player }) {
  const m = MATS[p.mat];
  const ab = FACTION_ABILITY[p.faction];
  return (
    <div className="mat">
      <div className="mat-grid">
        {m.top.map((top, i) => {
          const bottom = BOTTOM_ACTIONS[i];
          const structure = STRUCTURES.find((k) => STRUCTURE_ACTION[k] === top)!;
          return (
            <div key={i} className={`mat-col${p.lastSection === i ? ' last' : ''}`}>
              <div className="mat-top">
                <b>
                  {TOP_ICONS[top]} {TOP_NAMES[top]}
                </b>
                <small>{topText(p, top)}</small>
                <small className={p.structures[structure] !== null ? 'on' : 'muted'} title={STRUCTURE_TEXT[structure]}>
                  {STRUCTURE_ICONS[structure]} {STRUCTURE_NAMES[structure]} {p.structures[structure] !== null ? '✓' : ''}
                </small>
              </div>
              <div className="mat-bottom">
                <b>
                  {BOTTOM_ICONS[bottom]} {BOTTOM_NAMES[bottom]}
                </b>
                <small>{bottomText(p, bottom)}</small>
                <small className={p.recruits[bottom] ? 'on' : 'muted'}>🎖 {ONGOING_LABELS[bottom]} {p.recruits[bottom] ? '✓' : ''}</small>
              </div>
            </div>
          );
        })}
      </div>
      <p className="small">
        <b>{ab.name}</b> — {ab.text}
      </p>
      <div className="mechs small">
        {FACTION_DEFS[p.faction].mechs.map((k, i) => (
          <span key={k} className={p.mechDeployed[i] ? 'on' : 'muted'} title={MECH_TEXT[k]}>
            🤖 {MECH_NAMES[k]}
            {p.mechDeployed[i] ? ' ✓' : ''}
          </span>
        ))}
      </div>
      <div className="small muted">
        Recrues (bonus immédiat) : {RECRUIT_ONCE.map((b) => `${RECRUIT_LABELS[b]}${p.recruitBonus[b] ? ' ✓' : ''}`).join(' · ')}
      </div>
      <div className="small muted">
        Coût de Produire : {describeProduceCost(p)} · {8 - p.workers.length} ouvrier{8 - p.workers.length > 1 ? 's' : ''} sur la fiche
      </div>
    </div>
  );
}

export function describeProduceCost(p: Player): string {
  const c = produceCost(p.workers.length);
  const parts = [c.power && '1 💪', c.popularity && '1 ❤', c.coins && '1 $'].filter(Boolean);
  return parts.join(' + ') || 'gratuit';
}

export const MECH_TEXT: Record<string, string> = {
  riverwalk: 'Berge : personnage et méchas traversent les rivières vers deux types de terrain.',
  speed: 'Rapidité : personnage et méchas se déplacent d’une case de plus.',
  seaworthy: 'Navigation : personnage et méchas vont sur les lacs et en reviennent.',
  artillery: 'Artillerie : avant un combat, payez 1 puissance pour que l’adversaire en perde 2.',
  township: 'Canton : les villages que vous contrôlez et l’Usine sont adjacents.',
  peoplesArmy: 'Armée du peuple : +1 carte Combat si vous avez un ouvrier dans le combat.',
  wayfare: 'Droit chemin : aller vers votre base ou celle d’une faction absente, quelle que soit la distance.',
  scout: 'Éclaireur : avant un combat, volez une carte Combat au hasard à l’adversaire.',
  submerge: 'Plongée : aller sur les lacs, et d’un lac à n’importe quel autre.',
  camaraderie: 'Camaraderie : pas de perte de popularité quand vous chassez des ouvriers après un combat.',
  underpass: 'Passage souterrain : vos montagnes et tous les tunnels sont adjacents.',
  disarm: 'Désarmement : avant un combat sur un tunnel ou votre Mine, l’adversaire perd 2 puissance.',
};

/** Formulaire des choix d'un gain de carte (ressources au choix, mécha, structure, recrue, amélioration). */
export function ChoiceForm({ p, gain, value, onChange }: { p: Player; gain: Gain; value: Choice; onChange: (c: Choice) => void }) {
  return (
    <div className="choice-form">
      {gain.any ? (
        <div>
          <small>Ressources au choix ({gain.any}) :</small>
          <ResPicker value={value.res ?? {}} max={gain.any} onChange={(res) => onChange({ ...value, res })} />
        </div>
      ) : null}
      {gain.deploy ? (
        <label>
          Mécha :{' '}
          <select value={value.mech ?? ''} onChange={(e) => onChange({ ...value, mech: e.target.value === '' ? undefined : +e.target.value })}>
            <option value="">— aucun —</option>
            {FACTION_DEFS[p.faction].mechs.map((k, i) =>
              p.mechDeployed[i] ? null : (
                <option key={k} value={i}>
                  {MECH_NAMES[k]}
                </option>
              ),
            )}
          </select>
        </label>
      ) : null}
      {gain.build ? (
        <label>
          Structure :{' '}
          <select value={value.structure ?? ''} onChange={(e) => onChange({ ...value, structure: (e.target.value || undefined) as Choice['structure'] })}>
            <option value="">— aucune —</option>
            {STRUCTURES.filter((k) => p.structures[k] === null).map((k) => (
              <option key={k} value={k}>
                {STRUCTURE_NAMES[k]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {gain.enlist ? <EnlistSelect p={p} value={value.enlist} onChange={(enlist) => onChange({ ...value, enlist })} /> : null}
      {gain.upgrade ? <UpgradeSelect p={p} value={value.upgrade} onChange={(upgrade) => onChange({ ...value, upgrade })} /> : null}
    </div>
  );
}

export function EnlistSelect({ p, value, onChange }: { p: Player; value?: Choice['enlist']; onChange: (v: Choice['enlist']) => void }) {
  const [section, setSection] = useState<BottomAction | ''>(value?.section ?? '');
  const [bonus, setBonus] = useState<string>(value?.bonus ?? '');
  const update = (sct: string, b: string) => {
    setSection(sct as BottomAction | '');
    setBonus(b);
    onChange(sct && b ? { section: sct as BottomAction, bonus: b as (typeof RECRUIT_ONCE)[number] } : undefined);
  };
  return (
    <div className="row wrap">
      <label>
        Recrue de la colonne{' '}
        <select value={section} onChange={(e) => update(e.target.value, bonus)}>
          <option value="">—</option>
          {BOTTOM_ACTIONS.filter((a) => !p.recruits[a]).map((a) => (
            <option key={a} value={a}>
              {BOTTOM_NAMES[a]} ({ONGOING_LABELS[a]})
            </option>
          ))}
        </select>
      </label>
      <label>
        Bonus{' '}
        <select value={bonus} onChange={(e) => update(section, e.target.value)}>
          <option value="">—</option>
          {RECRUIT_ONCE.filter((b) => !p.recruitBonus[b]).map((b) => (
            <option key={b} value={b}>
              {RECRUIT_LABELS[b]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function UpgradeSelect({ p, value, onChange }: { p: Player; value?: Choice['upgrade']; onChange: (v: Choice['upgrade']) => void }) {
  const [from, setFrom] = useState<string>(value?.from ?? '');
  const [to, setTo] = useState<string>(value?.to ?? '');
  const update = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
    onChange(f && t ? { from: f as (typeof TOP_UPGRADES)[number], to: t as BottomAction } : undefined);
  };
  return (
    <div className="row wrap">
      <label>
        Cube pris sur{' '}
        <select value={from} onChange={(e) => update(e.target.value, to)}>
          <option value="">—</option>
          {TOP_UPGRADES.filter((u) => p.topCubes[u]).map((u) => (
            <option key={u} value={u}>
              {UPGRADE_LABELS[u]}
            </option>
          ))}
        </select>
      </label>
      <label>
        posé sur le coût de{' '}
        <select value={to} onChange={(e) => update(from, e.target.value)}>
          <option value="">—</option>
          {BOTTOM_ACTIONS.filter((a) => bottomRoom(p, a) > 0).map((a) => (
            <option key={a} value={a}>
              {BOTTOM_NAMES[a]} ({bottomCost(p, a)} → {bottomCost(p, a) - 1})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function PlayerCard({ s, i, visible, active }: { s: GameState; i: number; visible: boolean; active: boolean }) {
  const p = s.players[i];
  const [open, setOpen] = useState(false);
  return (
    <div className={`pcard${active ? ' active' : ''}`} style={{ borderLeftColor: FACTION_COLORS[p.faction] }}>
      <div className="pcard-head" onClick={() => setOpen(!open)} role="button" tabIndex={0}>
        <FactionDot p={p} />
        <b>{p.name}</b>
        {p.ai && <span title="Ordinateur">🤖</span>}
        <small className="muted">
          {FACTION_SHORT[p.faction]} · {MAT_NAMES[p.mat]}
        </small>
        <span className="stars-mini" title="Étoiles">
          {'★'.repeat(starCount(p))}
          <span className="muted">{'☆'.repeat(6 - starCount(p))}</span>
        </span>
      </div>
      <div className="stats">
        <span title="Pièces">💰 {p.coins}</span>
        <span title="Puissance">💪 {p.power}</span>
        <span title="Popularité">❤ {p.popularity}</span>
        <span title="Cartes Combat">🃏 {p.hand.length}</span>
        <span title="Ouvriers sur le plateau">👷 {p.workers.length}</span>
        <span title="Méchas">🤖 {p.mechs.length}</span>
        <span title="Structures">🏗 {STRUCTURES.filter((k) => p.structures[k] !== null).length}</span>
        <span title="Recrues">🎖 {BOTTOM_ACTIONS.filter((a) => p.recruits[a]).length}</span>
        {p.factoryCard !== null && <span title="Carte Usine">🏭 n° {p.factoryCard + 1}</span>}
      </div>
      {Object.keys(p.stars).length > 0 && (
        <div className="small">
          {Object.entries(p.stars).map(([k, n]) => (
            <span key={k} className="star-chip" title={STAR_NAMES[k as keyof typeof STAR_NAMES]}>
              {STAR_ICONS[k as keyof typeof STAR_ICONS]}
              {n! > 1 ? `×${n}` : ''}
            </span>
          ))}
        </div>
      )}
      {visible && (
        <div className="secret small">
          <div>
            🃏 Main : {p.hand.length ? [...p.hand].sort((a, b) => a - b).join(', ') : 'aucune carte'}
          </div>
          {p.objectives.map((o) => (
            <div key={o}>
              📜 <b>{OBJECTIVE_TEXT[o].title}</b> — {OBJECTIVE_TEXT[o].text}
            </div>
          ))}
        </div>
      )}
      {open && <MatView p={p} />}
    </div>
  );
}

export function FinalPanel({ s }: { s: GameState }) {
  const order = ranking(s);
  const scores = s.final ?? s.players.map((_, i) => scoreOf(s, i));
  return (
    <section className="panel final">
      <h2>Fin de la partie</h2>
      <p>
        Victoire de <b>{s.players[order[0]].name}</b> ({FACTION_SHORT[s.players[order[0]].faction]}) avec {scores[order[0]].total} $.
      </p>
      <table>
        <thead>
          <tr>
            <th />
            <td>Pièces</td>
            <td>Étoiles</td>
            <td>Territoires</td>
            <td>Ressources</td>
            <td>Structures</td>
            <td>Total</td>
          </tr>
        </thead>
        <tbody>
          {order.map((i) => {
            const sc = scores[i];
            const p = s.players[i];
            const tier = scoreTier(p.popularity);
            return (
              <tr key={i}>
                <th>
                  <FactionDot p={p} /> {p.name}
                  <small className="muted"> ❤ {p.popularity}</small>
                </th>
                <td>{sc.coins}</td>
                <td title={`${starCount(p)} × ${tier.star}`}>{sc.stars}</td>
                <td title={`× ${tier.territory}`}>{sc.territories}</td>
                <td title={`par 2 × ${tier.resources}`}>{sc.resources}</td>
                <td>{sc.bonus}</td>
                <td>
                  <b>{sc.total}</b>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function Log({ s }: { s: GameState }) {
  return (
    <ol className="log" reversed>
      {[...s.log].reverse().slice(0, 120).map((e, k) => (
        <li key={k}>
          {e.player !== null && (
            <span className="tag" style={{ background: FACTION_COLORS[s.players[e.player].faction], color: FACTION_INK[s.players[e.player].faction] }}>
              {s.players[e.player].name}
            </span>
          )}{' '}
          {e.text}
        </li>
      ))}
    </ol>
  );
}
