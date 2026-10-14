import { useEffect, useMemo, useState } from 'react';
import {
  BOTTOM_NAMES,
  BOTTOM_RESOURCE,
  BONUS_LABELS,
  ENCOUNTERS,
  FACTION_DEFS,
  FACTORY_CARDS,
  HEXES,
  MAX_DIAL,
  MECH_NAMES,
  OBJECTIVE_TEXT,
  RESOURCES,
  RuleError,
  STRUCTURES,
  STRUCTURE_NAMES,
  TERRAIN_NAMES,
  TOP_NAMES,
  allowedSections,
  apply,
  bottomCost,
  canBuildOn,
  canPayCost,
  canPayRes,
  controlledRes,
  describeOption,
  maxCombatCards,
  movableUnits,
  objectiveMet,
  reachable,
  sectionActions,
  starCount,
  topValue,
  totalRes,
  workerHexes,
  type Action,
  type BottomAction,
  type Choice,
  type GameState,
  type Gain,
  type ResCounts,
  type Structure,
  type UnitRef,
} from '../engine';
import { Board, Legend } from './Board';
import { PlayerBoard } from './PlayerBoard';
import { ChoiceForm, EnlistSelect, FactionDot, FinalPanel, Log, PlayerCard, ResPicker, Stepper, UpgradeSelect, bottomText, describeProduceCost, hexLabel, topText } from './Panels';
import { BOTTOM_ICONS, FACTION_COLORS, FACTION_SHORT, RES_ICONS, TOP_ICONS } from './theme';

interface Props {
  game: GameState;
  /** Place de ce joueur en ligne (null en passe-et-joue : tout le monde joue sur cet écran). */
  seat: number | null;
  onPlay: (next: GameState) => void;
  onQuit: () => void;
  /** Annule le tour en cours (retour à l'état du début de tour), si disponible. */
  onUndo?: () => void;
}

/** Clé de la main en cours : change quand un autre joueur doit agir (fin de tour, défense d'un combat). */
export function turnKey(s: GameState): string {
  return `${s.turnCount}-${s.turn?.player ?? -1}-${s.status}`;
}

type UnitKind = UnitRef['k'];

export function GameScreen({ game: s, seat, onPlay, onQuit, onUndo }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'joueurs' | 'journal'>('joueurs');
  const [zoom, setZoom] = useState(false);
  const [matView, setMatView] = useState<number | null>(null);
  const [layout, setLayoutState] = useState<Layout>(loadLayout);
  const setLayout = (l: Layout) => {
    setLayoutState(l);
    saveLayout(l);
  };
  const [infoOpen, setInfoOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  // Au changement de joueur actif, le plateau affiché suit le nouveau joueur.
  useEffect(() => setMatView(null), [s.turn?.active]);
  // Déplacement
  const [origin, setOrigin] = useState<number | null>(null);
  const [kind, setKind] = useState<UnitKind | null>(null);
  const [carryWorkers, setCarryWorkers] = useState(0);
  const [carryRes, setCarryRes] = useState(false);
  // Choix de cases et de ressources
  const [picked, setPicked] = useState<number[]>([]);
  const [tradeRes, setTradeRes] = useState<Partial<ResCounts>>({});
  // Actions du bas
  const [mech, setMech] = useState<number | null>(null);
  const [structure, setStructure] = useState<Structure | null>(null);
  const [enlist, setEnlist] = useState<Choice['enlist']>();
  const [upgrade, setUpgrade] = useState<Choice['upgrade']>();
  // Cartes
  const [factoryOption, setFactoryOption] = useState<number | null>(null);
  const [cardChoice, setCardChoice] = useState<Choice>({});
  const [encPicks, setEncPicks] = useState<{ option: number; choice: Choice }[]>([]);
  // Combat
  const [dial, setDial] = useState(0);
  const [cards, setCards] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<string>('');

  const t = s.turn;
  const actor = t?.player ?? -1;
  const active = t?.active ?? -1;
  const aiTurn = t !== null && !!s.players[actor]?.ai;
  const myTurn = t !== null && s.status === 'playing' && !aiTurn && (seat === null || seat === actor);
  const p = actor >= 0 ? s.players[actor] : null;
  const ap = active >= 0 ? s.players[active] : null;
  const humans = s.players.filter((x) => !x.ai).length;
  const head = t?.pending[0];

  const reset = () => {
    setOrigin(null);
    setKind(null);
    setCarryWorkers(0);
    setCarryRes(false);
    setPicked([]);
    setTradeRes({});
    setMech(null);
    setStructure(null);
    setEnlist(undefined);
    setUpgrade(undefined);
    setFactoryOption(null);
    setCardChoice({});
    setEncPicks([]);
    setDial(0);
    setCards([]);
  };

  const play = (a: Action) => {
    try {
      const next = apply(s, a);
      setError(null);
      if (a.t !== 'move') reset();
      else {
        setOrigin(null);
        setKind(null);
        setCarryWorkers(0);
        setCarryRes(false);
      }
      onPlay(next);
    } catch (e) {
      if (e instanceof RuleError) setError(e.message);
      else throw e;
    }
  };

  // ——— Ce que le plateau propose de cliquer
  const sa = t && ap && t.section !== null ? sectionActions(ap, t.section) : null;
  const moving = myTurn && t?.stage === 'moving';
  const movable = useMemo(() => (moving ? movableUnits(s, active) : []), [s, moving, active]);
  const movableHexes = useMemo(() => {
    if (!ap) return new Set<number>();
    return new Set(movable.map((u) => (u.k === 'character' ? ap.character : u.k === 'mech' ? ap.mechs[u.i] : ap.workers[u.i])));
  }, [movable, ap]);
  const unitAt = (k: UnitKind, hex: number): UnitRef | null =>
    movable.find((u) => u.k === k && (u.k === 'character' ? ap!.character : u.k === 'mech' ? ap!.mechs[u.i] : ap!.workers[u.i]) === hex) ?? null;
  const selectedUnit = origin !== null && kind ? unitAt(kind, origin) : null;
  const reach = useMemo(() => (selectedUnit ? reachable(s, active, selectedUnit) : new Map<number, number[]>()), [s, active, selectedUnit]);

  const needsHex =
    myTurn &&
    t &&
    ((t.stage === 'top' && (sa?.top === 'trade' || sa?.top === 'produce')) ||
      ((t.stage === 'top' || t.stage === 'bottom') && (sa?.bottom === 'deploy' || sa?.bottom === 'build')) ||
      (t.stage === 'top' && sa?.top === 'factory' && factoryOption !== null));
  let targets: Set<number> | undefined;
  if (moving) targets = new Set(reach.keys());
  else if (needsHex && ap) {
    let hexes = workerHexes(s, active);
    if (t!.stage === 'top' && sa?.top === 'produce') hexes = hexes.filter((h) => h !== ap.structures.mill);
    if (structure || (t!.stage === 'top' && sa?.top === 'factory' && FACTORY_CARDS[ap.factoryCard!][factoryOption!]?.gain.build)) hexes = hexes.filter((h) => canBuildOn(s, active, h));
    if (sa?.bottom === 'deploy') hexes = hexes.filter((h) => HEXES[h].terrain !== 'lake');
    targets = new Set(hexes);
  }

  const onHex = (h: number) => {
    if (moving) {
      if (selectedUnit && reach.has(h)) {
        const u = selectedUnit;
        const from = origin!;
        const workers = u.k === 'mech' ? ap!.workers.map((w, i) => (w === from ? i : -1)).filter((i) => i >= 0).slice(0, carryWorkers) : [];
        play({ t: 'move', unit: u, path: reach.get(h)!, workers, res: carryRes ? { ...s.board.res[from] } : undefined });
        return;
      }
      if (movableHexes.has(h)) {
        setOrigin(h);
        const k = (['character', 'mech', 'worker'] as UnitKind[]).find((x) => unitAt(x, h));
        setKind(k ?? null);
        setCarryWorkers(0);
        setCarryRes(false);
      }
      return;
    }
    if (!targets?.has(h)) return;
    if (t?.stage === 'top' && sa?.top === 'produce') {
      const limit = topValue(ap!, 'produce');
      setPicked((cur) => (cur.includes(h) ? cur.filter((x) => x !== h) : cur.length >= limit ? [...cur.slice(1), h] : [...cur, h]));
    } else setPicked([h]);
  };

  // Secret du combat en passe-et-joue : on passe l'appareil avant d'afficher la main.
  const combatGate =
    myTurn && seat === null && humans > 1 && head?.k === 'combat' && revealed !== turnKey(s) ? s.players[actor] : null;
  const viewer = seat ?? (myTurn && !combatGate ? actor : null);
  // Plateau joueur affiché : celui choisi, sinon le sien (en ligne) ou celui du joueur actif.
  const matOf = matView ?? seat ?? Math.max(0, active);

  return (
    <div className="game">
      <header className="topbar">
        <div>
          Tour <b>{Math.floor(s.turnCount / s.players.length) + 1}</b>
          <small>{BONUS_LABELS[s.bonusTile]}</small>
        </div>
        <div title="Cartes Usine restantes">🏭 {s.factoryPool.length}</div>
        <div title="Jetons rencontre restants">✦ {s.board.encounters.filter(Boolean).length}</div>
        <div className="tb-players">
          {s.order.map((i) => {
            const q = s.players[i];
            return (
              <button
                key={i}
                className={`tb-chip${i === active ? ' active' : ''}${i === matOf ? ' viewed' : ''}`}
                onClick={() => setMatView(i)}
                title={`${q.name} — ${FACTION_SHORT[q.faction]} : ${q.coins} $, ${q.power} puissance, ${q.popularity} popularité. Cliquez pour voir son plateau.`}
              >
                <FactionDot p={q} />
                <span className="tb-name">{q.name}</span>
                <span className="tb-stars">★{starCount(q)}</span>
              </button>
            );
          })}
        </div>
        <div className="tb-right">
          <div className="layout-switch" role="group" aria-label="Disposition">
            {LAYOUTS.map((l) => (
              <button key={l.id} className={layout === l.id ? 'on' : ''} onClick={() => setLayout(l.id)} title={l.title}>
                {l.icon}
              </button>
            ))}
          </div>
          {layout !== 'classic' && (
            <button className={infoOpen ? 'on' : ''} onClick={() => setInfoOpen(!infoOpen)} title="Joueurs et journal">
              📜
            </button>
          )}
          <button className="ghost" onClick={onQuit}>
            Quitter
          </button>
        </div>
      </header>

      <main className={`layout layout-${layout}`}>
        <section className={`board-wrap${zoom ? ' zoomed' : ''}`}>
          <button className="zoom" onClick={() => setZoom(!zoom)} aria-label={zoom ? 'Dézoomer' : 'Zoomer'} title={zoom ? 'Dézoomer' : 'Zoomer'}>
            {zoom ? '−' : '🔍'}
          </button>
          <Board s={s} targets={targets} picked={new Set(picked)} selected={moving ? origin : null} movable={moving ? movableHexes : undefined} onHex={myTurn ? onHex : undefined} />
          {layout !== 'classic' && (
            <button className={`legend-btn${legendOpen ? ' on' : ''}`} onClick={() => setLegendOpen(!legendOpen)} title="Légende des terrains" aria-label="Légende">
              🗺
            </button>
          )}
          {(layout === 'classic' || legendOpen) && <Legend />}
        </section>

        <section className="panel mat-panel">
          <div className="tabs">
            {s.players.map((q, i) => (
              <button key={i} className={matOf === i ? 'on' : ''} onClick={() => setMatView(i)}>
                <FactionDot p={q} /> {q.name}
              </button>
            ))}
          </div>
          <PlayerBoard
            p={s.players[matOf]}
            current={matOf === active && t && t.stage !== 'section' ? t.section : null}
            allowed={matOf === active && myTurn && actor === active && t?.stage === 'section' ? allowedSections(s, active) : undefined}
            onSection={matOf === active && myTurn && actor === active && t?.stage === 'section' ? (i) => play({ t: 'section', i }) : undefined}
            secret={viewer === matOf && layout !== 'classic'}
            compact={layout !== 'classic'}
          />
        </section>

        <div className="turn-area">
          {s.status === 'finished' ? (
            <FinalPanel s={s} />
          ) : t && p && ap ? (
            <section className="panel turn" style={{ borderColor: FACTION_COLORS[p.faction] }}>
              <h2>
                <FactionDot p={p} />
                {p.name}
                <small>
                  {FACTION_SHORT[p.faction]}
                  {actor !== active ? ' — défense' : ''}
                </small>
              </h2>
              {t.lastCombat && <CombatSummary s={s} />}
              {aiTurn ? (
                <p className="ai-thinking">🤖 {p.name} réfléchit…</p>
              ) : !myTurn ? (
                <p className="muted">En attente de {p.name}…</p>
              ) : combatGate ? (
                <div className="gate">
                  <p>
                    Combat ! Passez l’appareil à <b>{combatGate.name}</b> : sa mise est secrète.
                  </p>
                  <button className="primary big" onClick={() => setRevealed(turnKey(s))}>
                    Je suis {combatGate.name}
                  </button>
                </div>
              ) : t.stage === 'section' ? (
                layout === 'classic' ? (
                  <SectionChoice s={s} play={play} />
                ) : (
                  <p className="hint">👉 Cliquez une colonne de votre plateau joueur (pas celle du tour précédent).</p>
                )
              ) : t.stage === 'top' ? (
                <TopControls
                  s={s}
                  play={play}
                  picked={picked}
                  tradeRes={tradeRes}
                  setTradeRes={setTradeRes}
                  factoryOption={factoryOption}
                  setFactoryOption={(o) => {
                    setFactoryOption(o);
                    setCardChoice({});
                    setPicked([]);
                  }}
                  cardChoice={cardChoice}
                  setCardChoice={setCardChoice}
                />
              ) : t.stage === 'moving' ? (
                <MoveControls
                  s={s}
                  play={play}
                  origin={origin}
                  kind={kind}
                  setKind={setKind}
                  unitAt={unitAt}
                  carryWorkers={carryWorkers}
                  setCarryWorkers={setCarryWorkers}
                  carryRes={carryRes}
                  setCarryRes={setCarryRes}
                />
              ) : t.stage === 'resolve' && head?.k === 'combat' ? (
                <CombatControls s={s} play={play} dial={dial} setDial={setDial} cards={cards} setCards={setCards} />
              ) : t.stage === 'resolve' && head?.k === 'encounter' ? (
                <EncounterControls s={s} play={play} picks={encPicks} setPicks={setEncPicks} />
              ) : t.stage === 'resolve' && head?.k === 'factory' ? (
                <FactoryPick s={s} play={play} />
              ) : t.stage === 'bottom' || t.stage === 'end' ? (
                <BottomControls
                  s={s}
                  play={play}
                  picked={picked}
                  mech={mech}
                  setMech={setMech}
                  structure={structure}
                  setStructure={setStructure}
                  enlist={enlist}
                  setEnlist={setEnlist}
                  upgrade={upgrade}
                  setUpgrade={setUpgrade}
                />
              ) : null}
              {myTurn && !combatGate && actor === active && t.stage !== 'resolve' && <Objectives s={s} play={play} />}
              {myTurn && !combatGate && (
                <div className="turn-foot">
                  {onUndo && (
                    <button className="ghost" onClick={onUndo}>
                      Annuler
                    </button>
                  )}
                  {actor === active && (t.stage === 'bottom' || t.stage === 'end' || t.stage === 'top') && (
                    <button className={t.stage === 'end' ? 'primary' : ''} onClick={() => play({ t: 'endTurn' })}>
                      Fin du tour
                    </button>
                  )}
                </div>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </section>
          ) : null}
        </div>

        <aside className={`info${infoOpen ? ' open' : ''}`}>
          <section className="panel">
            <div className="tabs">
              {layout !== 'classic' && (
                <button className="ghost info-close" onClick={() => setInfoOpen(false)} aria-label="Fermer">
                  ✕
                </button>
              )}
              <button className={tab === 'joueurs' ? 'on' : ''} onClick={() => setTab('joueurs')}>
                Joueurs
              </button>
              <button className={tab === 'journal' ? 'on' : ''} onClick={() => setTab('journal')}>
                Journal
              </button>
            </div>
            {tab === 'joueurs' ? (
              <div className="players">
                {s.players.map((_, i) => (
                  <PlayerCard key={i} s={s} i={i} visible={viewer === i || s.status === 'finished'} active={i === active} />
                ))}
              </div>
            ) : (
              <Log s={s} />
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}

type Play = (a: Action) => void;

type Layout = 'side' | 'stack' | 'classic';
const LAYOUTS: { id: Layout; icon: string; title: string }[] = [
  { id: 'side', icon: '◧', title: 'Côte à côte : la carte à gauche, plateau joueur et actions à droite' },
  { id: 'stack', icon: '⬒', title: 'Superposé : la carte et les actions en haut, le plateau joueur en bas' },
  { id: 'classic', icon: '☰', title: 'Classique : tout à la suite, avec défilement' },
];

function loadLayout(): Layout {
  try {
    const v = localStorage.getItem('scythe.disposition');
    if (v === 'side' || v === 'stack' || v === 'classic') return v;
  } catch {
    // stockage indisponible
  }
  return typeof window !== 'undefined' && window.innerWidth < 900 ? 'classic' : 'side';
}

function saveLayout(l: Layout) {
  try {
    localStorage.setItem('scythe.disposition', l);
  } catch {
    // ignoré
  }
}

function SectionChoice({ s, play }: { s: GameState; play: Play }) {
  const t = s.turn!;
  const p = s.players[t.active];
  const allowed = allowedSections(s, t.active);
  const sections = p.factoryCard !== null ? [0, 1, 2, 3, 4] : [0, 1, 2, 3];
  return (
    <div className="choices">
      <p className="hint">Choisissez une section ici ou directement sur votre plateau joueur, différente de celle du tour précédent.</p>
      {sections.map((i) => {
        const sa = sectionActions(p, i);
        const top = sa.top;
        const bottom = sa.bottom;
        return (
          <button key={i} className="section-btn" disabled={!allowed.includes(i)} onClick={() => play({ t: 'section', i })}>
            <span className="sec-top">
              {TOP_ICONS[top]} <b>{top === 'factory' ? `Usine n° ${p.factoryCard! + 1}` : TOP_NAMES[top]}</b>
              <small>{topText(p, top)}</small>
            </span>
            <span className="sec-bottom">
              {BOTTOM_ICONS[bottom]} <b>{bottom === 'factoryMove' ? 'Déplacer ×2' : BOTTOM_NAMES[bottom]}</b>
              <small>{bottomText(p, bottom)}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface TopProps {
  s: GameState;
  play: Play;
  picked: number[];
  tradeRes: Partial<ResCounts>;
  setTradeRes: (r: Partial<ResCounts>) => void;
  factoryOption: number | null;
  setFactoryOption: (o: number | null) => void;
  cardChoice: Choice;
  setCardChoice: (c: Choice) => void;
}

function needsPlacement(g: Gain): boolean {
  return !!(g.any || RESOURCES.some((r) => g[r]) || g.deploy || g.build);
}

function TopControls({ s, play, picked, tradeRes, setTradeRes, factoryOption, setFactoryOption, cardChoice, setCardChoice }: TopProps) {
  const t = s.turn!;
  const me = t.active;
  const p = s.players[me];
  const sa = sectionActions(p, t.section!);
  const skip = (
    <button className="ghost" onClick={() => play({ t: 'skipTop' })}>
      Passer l’action du haut
    </button>
  );
  switch (sa.top) {
    case 'move':
      return (
        <div className="controls">
          <h3>{TOP_ICONS.move} Déplacer</h3>
          <div className="row wrap">
            <button className="primary" onClick={() => play({ t: 'startMove' })}>
              Déplacer jusqu’à {topValue(p, 'move')} unités
            </button>
            <button onClick={() => play({ t: 'gain' })}>Gagner {topValue(p, 'gain')} $</button>
            {skip}
          </div>
        </div>
      );
    case 'trade':
      return (
        <div className="controls">
          <h3>{TOP_ICONS.trade} Échanger (1 $)</h3>
          <p className="hint">2 ressources au choix, placées sur un territoire contrôlé avec un ouvrier (cliquez-le sur le plateau).</p>
          <ResPicker value={tradeRes} max={2} onChange={setTradeRes} />
          <div className="row wrap">
            <button className="primary" disabled={p.coins < 1 || totalRes(tradeRes) === 0 || picked.length !== 1} onClick={() => play({ t: 'trade', res: tradeRes, hex: picked[0] })}>
              Prendre {picked.length === 1 ? `sur ${hexLabel(picked[0])}` : 'les ressources'}
            </button>
            <button disabled={p.coins < 1} onClick={() => play({ t: 'tradePop' })}>
              +{topValue(p, 'popularity')} popularité
            </button>
            {skip}
          </div>
        </div>
      );
    case 'produce': {
      const mill = p.structures.mill;
      return (
        <div className="controls">
          <h3>{TOP_ICONS.produce} Produire</h3>
          <p className="hint">
            Cliquez jusqu’à {topValue(p, 'produce')} territoires où vous avez des ouvriers. Coût : {describeProduceCost(p)}.
            {mill !== null && ' Le Moulin produit en plus sur son territoire.'}
          </p>
          <p className="small">{picked.length ? picked.map(hexLabel).join(', ') : 'Aucun territoire choisi.'}</p>
          <div className="row wrap">
            <button className="primary" disabled={!picked.length && mill === null} onClick={() => play({ t: 'produce', hexes: picked })}>
              Produire
            </button>
            {skip}
          </div>
        </div>
      );
    }
    case 'bolster':
      return (
        <div className="controls">
          <h3>{TOP_ICONS.bolster} Renforcer (1 $)</h3>
          <div className="row wrap">
            <button className="primary" disabled={p.coins < 1} onClick={() => play({ t: 'bolster', what: 'power' })}>
              +{topValue(p, 'power')} puissance
            </button>
            <button disabled={p.coins < 1} onClick={() => play({ t: 'bolster', what: 'cards' })}>
              +{topValue(p, 'cards')} carte{topValue(p, 'cards') > 1 ? 's' : ''} Combat
            </button>
            {skip}
          </div>
        </div>
      );
    case 'factory': {
      const card = FACTORY_CARDS[p.factoryCard!];
      const opt = factoryOption !== null ? card[factoryOption] : null;
      return (
        <div className="controls">
          <h3>🏭 Carte Usine n° {p.factoryCard! + 1}</h3>
          <div className="choices">
            {card.map((o, i) => (
              <button key={i} className={`choice-line${factoryOption === i ? ' on' : ''}`} disabled={!canPayCost(s, me, o.cost)} onClick={() => setFactoryOption(i)}>
                {describeOption(o)}
              </button>
            ))}
          </div>
          {opt && (
            <>
              <ChoiceForm p={p} gain={opt.gain} value={cardChoice} onChange={setCardChoice} />
              {needsPlacement(opt.gain) && <p className="hint">Cliquez le territoire (contrôlé, avec un ouvrier) où placer le gain.</p>}
              <button
                className="primary"
                disabled={needsPlacement(opt.gain) && picked.length !== 1}
                onClick={() => play({ t: 'factoryTop', option: factoryOption!, choice: { ...cardChoice, hex: picked[0] } })}
              >
                Valider
              </button>
            </>
          )}
          {skip}
        </div>
      );
    }
  }
}

interface MoveProps {
  s: GameState;
  play: Play;
  origin: number | null;
  kind: UnitKind | null;
  setKind: (k: UnitKind) => void;
  unitAt: (k: UnitKind, hex: number) => UnitRef | null;
  carryWorkers: number;
  setCarryWorkers: (n: number) => void;
  carryRes: boolean;
  setCarryRes: (b: boolean) => void;
}

const KIND_LABELS: Record<UnitKind, string> = { character: '★ Personnage', mech: '⚙ Mécha', worker: '👷 Ouvrier' };

function MoveControls({ s, play, origin, kind, setKind, unitAt, carryWorkers, setCarryWorkers, carryRes, setCarryRes }: MoveProps) {
  const t = s.turn!;
  const p = s.players[t.active];
  const workersHere = origin === null ? 0 : p.workers.filter((w) => w === origin).length;
  const resHere = origin === null ? 0 : totalRes(s.board.res[origin]);
  return (
    <div className="controls">
      <h3>
        🥾 {t.factoryMove ? 'Déplacer une unité jusqu’à 2 fois (Usine)' : `Déplacer — encore ${t.movesLeft} unité${t.movesLeft > 1 ? 's' : ''}`}
      </h3>
      <p className="hint">Cliquez une case où vous avez une unité, puis sa destination (en surbrillance).</p>
      {origin !== null && (
        <>
          <div className="row wrap">
            {(['character', 'mech', 'worker'] as UnitKind[]).map((k) =>
              unitAt(k, origin) ? (
                <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                  {KIND_LABELS[k]}
                </button>
              ) : null,
            )}
          </div>
          {kind === 'mech' && workersHere > 0 && (
            <label className="row">
              Ouvriers transportés <Stepper value={carryWorkers} min={0} max={workersHere} onChange={setCarryWorkers} />
            </label>
          )}
          {resHere > 0 && (
            <label className="row">
              <input type="checkbox" checked={carryRes} onChange={(e) => setCarryRes(e.target.checked)} /> Emporter les ressources de la case ({resHere})
            </label>
          )}
        </>
      )}
      <div className="row wrap">
        <button className="primary" onClick={() => play({ t: 'endMove' })}>
          Terminer le déplacement
        </button>
        {t.moved.length === 0 && (
          <button className="ghost" onClick={() => play({ t: 'skipTop' })}>
            Ne pas se déplacer
          </button>
        )}
      </div>
    </div>
  );
}

interface BottomProps {
  s: GameState;
  play: Play;
  picked: number[];
  mech: number | null;
  setMech: (m: number | null) => void;
  structure: Structure | null;
  setStructure: (k: Structure | null) => void;
  enlist: Choice['enlist'];
  setEnlist: (e: Choice['enlist']) => void;
  upgrade: Choice['upgrade'];
  setUpgrade: (u: Choice['upgrade']) => void;
}

function BottomControls({ s, play, picked, mech, setMech, structure, setStructure, enlist, setEnlist, upgrade, setUpgrade }: BottomProps) {
  const t = s.turn!;
  const me = t.active;
  const p = s.players[me];
  const sa = sectionActions(p, t.section!);
  if (t.stage === 'end') return <p className="hint">Action terminée. Révélez un objectif si vous le pouvez, puis finissez le tour.</p>;
  if (sa.bottom === 'factoryMove')
    return (
      <div className="controls">
        <h3>🥾 Déplacement de la carte Usine</h3>
        <button className="primary" onClick={() => play({ t: 'factoryMove' })}>
          Déplacer une unité jusqu’à 2 fois
        </button>
      </div>
    );
  const a: BottomAction = sa.bottom;
  const cost = bottomCost(p, a);
  const res = BOTTOM_RESOURCE[a];
  const affordable = canPayRes(s, me, { [res]: cost });
  const have = controlledRes(s, me)[res];
  const header = (
    <>
      <h3>
        {BOTTOM_ICONS[a]} {BOTTOM_NAMES[a]} — {cost} {RES_ICONS[res]} <small className="muted">(vous en contrôlez {have})</small>
      </h3>
      {!affordable && <p className="muted small">Pas assez de ressources : finissez le tour.</p>}
    </>
  );
  const only = (
    <button disabled={!affordable} className="ghost" onClick={() => play({ t: a } as Action)}>
      Payer seulement pour les pièces
    </button>
  );
  switch (a) {
    case 'upgrade':
      return (
        <div className="controls">
          {header}
          <UpgradeSelect p={p} value={upgrade} onChange={setUpgrade} />
          <div className="row wrap">
            <button className="primary" disabled={!affordable || !upgrade} onClick={() => play({ t: 'upgrade', from: upgrade!.from, to: upgrade!.to })}>
              Améliorer
            </button>
            {only}
          </div>
        </div>
      );
    case 'deploy':
      return (
        <div className="controls">
          {header}
          <div className="choices">
            {FACTION_DEFS[p.faction].mechs.map((k, i) => (
              <button key={k} className={`choice-line${mech === i ? ' on' : ''}`} disabled={p.mechDeployed[i]} onClick={() => setMech(i)}>
                🤖 {MECH_NAMES[k]}
              </button>
            ))}
          </div>
          <p className="hint">Puis cliquez un territoire contrôlé avec un ouvrier.</p>
          <div className="row wrap">
            <button className="primary" disabled={!affordable || mech === null || picked.length !== 1} onClick={() => play({ t: 'deploy', mech: mech!, hex: picked[0] })}>
              Déployer {picked.length === 1 ? `sur ${hexLabel(picked[0])}` : ''}
            </button>
            {only}
          </div>
        </div>
      );
    case 'build':
      return (
        <div className="controls">
          {header}
          <div className="choices">
            {STRUCTURES.map((k) => (
              <button key={k} className={`choice-line${structure === k ? ' on' : ''}`} disabled={p.structures[k] !== null} onClick={() => setStructure(k)}>
                {STRUCTURE_NAMES[k]}
              </button>
            ))}
          </div>
          <p className="hint">Puis cliquez un territoire contrôlé avec un ouvrier, sans structure.</p>
          <div className="row wrap">
            <button className="primary" disabled={!affordable || !structure || picked.length !== 1} onClick={() => play({ t: 'build', structure: structure!, hex: picked[0] })}>
              Construire {picked.length === 1 ? `sur ${hexLabel(picked[0])}` : ''}
            </button>
            {only}
          </div>
        </div>
      );
    case 'enlist':
      return (
        <div className="controls">
          {header}
          <EnlistSelect p={p} value={enlist} onChange={setEnlist} />
          <div className="row wrap">
            <button className="primary" disabled={!affordable || !enlist} onClick={() => play({ t: 'enlist', section: enlist!.section, bonus: enlist!.bonus })}>
              Enrôler
            </button>
            {only}
          </div>
        </div>
      );
  }
}

function CombatControls({ s, play, dial, setDial, cards, setCards }: { s: GameState; play: Play; dial: number; setDial: (n: number) => void; cards: number[]; setCards: (c: number[]) => void }) {
  const t = s.turn!;
  const c = t.pending[0];
  if (!c || c.k !== 'combat') return null;
  const me = t.player;
  const p = s.players[me];
  const opp = s.players[me === c.attacker ? c.defender : c.attacker];
  const max = Math.min(MAX_DIAL, p.power);
  const maxCards = maxCombatCards(s, me, c.hex);
  const total = dial + cards.reduce((a, i) => a + p.hand[i], 0);
  return (
    <div className="controls combat">
      <h3>
        ⚔ Combat en {TERRAIN_NAMES[HEXES[c.hex].terrain!]} — vous {me === c.attacker ? 'attaquez' : 'défendez'}
      </h3>
      <p className="small">
        {opp.name} : {opp.power} puissance, {opp.hand.length} carte{opp.hand.length > 1 ? 's' : ''} Combat. L’attaquant gagne les égalités.
      </p>
      <label className="row">
        Puissance engagée <Stepper value={Math.min(dial, max)} min={0} max={max} onChange={setDial} /> <small className="muted">/ {p.power}</small>
      </label>
      <div>
        <small>
          Cartes Combat (jusqu’à {maxCards}) :
        </small>
        <div className="row wrap">
          {p.hand.map((v, i) => (
            <button
              key={i}
              className={`ccard${cards.includes(i) ? ' on' : ''}`}
              disabled={!cards.includes(i) && cards.length >= maxCards}
              onClick={() => setCards(cards.includes(i) ? cards.filter((x) => x !== i) : [...cards, i])}
            >
              {v}
            </button>
          ))}
          {!p.hand.length && <span className="muted small">aucune</span>}
        </div>
      </div>
      <button className="primary big" onClick={() => play({ t: 'combat', power: Math.min(dial, max), cards })}>
        Engager {total} au total
      </button>
    </div>
  );
}

function CombatSummary({ s }: { s: GameState }) {
  const r = s.turn!.lastCombat!;
  const a = s.players[r.attacker];
  const d = s.players[r.defender];
  const sum = (x: { power: number; cards: number[] }) => x.power + x.cards.reduce((u, v) => u + v, 0);
  return (
    <div className="callout">
      ⚔ {a.name} {sum(r.att)} ({r.att.power}
      {r.att.cards.length ? ` + ${r.att.cards.join(' + ')}` : ''}) contre {d.name} {sum(r.def)} ({r.def.power}
      {r.def.cards.length ? ` + ${r.def.cards.join(' + ')}` : ''}) : victoire de <b>{s.players[r.winner].name}</b>.
    </div>
  );
}

function EncounterControls({ s, play, picks, setPicks }: { s: GameState; play: Play; picks: { option: number; choice: Choice }[]; setPicks: (p: { option: number; choice: Choice }[]) => void }) {
  const t = s.turn!;
  const e = t.pending[0];
  if (!e || e.k !== 'encounter') return null;
  const me = t.active;
  const p = s.players[me];
  const card = ENCOUNTERS[e.card];
  const max = p.faction === 'polania' ? 2 : 1;
  const toggle = (i: number) => {
    if (picks.some((x) => x.option === i)) setPicks(picks.filter((x) => x.option !== i));
    else setPicks(max === 1 ? [{ option: i, choice: {} }] : [...picks.slice(-(max - 1)), { option: i, choice: {} }]);
  };
  return (
    <div className="controls">
      <h3>✦ Rencontre n° {e.card + 1}</h3>
      <p className="hint">{max === 2 ? 'Serpente : choisissez jusqu’à 2 options (dans l’ordre des clics).' : 'Choisissez une option. Les gains vont sur la case de votre personnage.'}</p>
      <div className="choices">
        {card.map((o, i) => (
          <button key={i} className={`choice-line${picks.some((x) => x.option === i) ? ' on' : ''}`} disabled={!canPayCost(s, me, o.cost) && !picks.some((x) => x.option === i)} onClick={() => toggle(i)}>
            {describeOption(o)}
          </button>
        ))}
      </div>
      {picks.map((pk, k) => (
        <ChoiceForm key={pk.option} p={p} gain={card[pk.option].gain} value={pk.choice} onChange={(c) => setPicks(picks.map((x, j) => (j === k ? { ...x, choice: c } : x)))} />
      ))}
      <button className="primary" disabled={!picks.length} onClick={() => play({ t: 'encounter', picks })}>
        Valider
      </button>
    </div>
  );
}

function FactoryPick({ s, play }: { s: GameState; play: Play }) {
  return (
    <div className="controls">
      <h3>🏭 L’Usine : choisissez une carte</h3>
      <p className="hint">Elle devient une 5e section de votre fiche (action du haut, puis déplacement d’une unité jusqu’à 2 fois).</p>
      <div className="choices">
        {s.factoryPool.map((c) => (
          <button key={c} className="choice-line" onClick={() => play({ t: 'pickFactory', card: c })}>
            <b>n° {c + 1}</b> — {FACTORY_CARDS[c].map(describeOption).join(' ou ')}
          </button>
        ))}
      </div>
    </div>
  );
}

function Objectives({ s, play }: { s: GameState; play: Play }) {
  const me = s.turn!.active;
  const p = s.players[me];
  const ready = p.objectives.map((o, i) => ({ o, i })).filter(({ o }) => objectiveMet(s, me, o));
  if (!ready.length) return null;
  return (
    <div className="callout">
      {ready.map(({ o, i }) => (
        <button key={o} className="primary" onClick={() => play({ t: 'objective', i })}>
          📜 Révéler « {OBJECTIVE_TEXT[o].title} » (+1 étoile)
        </button>
      ))}
    </div>
  );
}
