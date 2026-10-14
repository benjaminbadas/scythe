import type { ReactNode } from 'react';
import {
  BOTTOM_ACTIONS,
  BOTTOM_NAMES,
  BOTTOM_RESOURCE,
  FACTION_DEFS,
  FACTORY_CARDS,
  MATS,
  MECH_NAMES,
  OBJECTIVE_TEXT,
  RECRUIT_ONCE,
  STRUCTURES,
  STRUCTURE_ACTION,
  STRUCTURE_NAMES,
  TOP_NAMES,
  WORKERS,
  bottomRoom,
  describeOption,
  starCount,
  topValue,
  type BottomAction,
  type Player,
  type RecruitOnce,
  type Structure,
  type TopAction,
  type TopUpgrade,
} from '../engine';
import { Emblem, MechPiece, ResourcePiece, StructurePiece, WorkerPiece } from './art';
import { MECH_TEXT } from './Panels';
import { FACTION_ABILITY, FACTION_COLORS, FACTION_INK, FACTION_NAMES, MAT_NAMES, ONGOING_LABELS, RECRUIT_LABELS, STAR_ICONS, STRUCTURE_TEXT } from './theme';

function Svg({ children, w = 22, h = 22, vb = '-11 -11 22 22' }: { children: ReactNode; w?: number; h?: number; vb?: string }) {
  return (
    <svg width={w} height={h} viewBox={vb} aria-hidden className="pm-svg">
      {children}
    </svg>
  );
}

const TERRAIN_FR: Record<string, string> = { farm: 'fermes', forest: 'forêts', mountain: 'montagnes', tundra: 'toundras', village: 'villages' };

function riverwalkText(p: Player): string {
  const [a, b] = FACTION_DEFS[p.faction].riverwalk;
  return `personnage et méchas traversent les rivières vers les ${TERRAIN_FR[a]} et les ${TERRAIN_FR[b]}.`;
}

/** Options de l'action du haut, cliquables sur le plateau. */
export type TopChoice = 'move' | 'gain' | 'trade' | 'tradePop' | 'produce' | 'power' | 'cards';

/** Ce que le joueur peut faire en cliquant sur son plateau pendant son tour. */
export interface MatUI {
  /** Choix d'une option de l'action du haut (colonne en cours), avec celles qui sont jouables. */
  onTop?: (c: TopChoice) => void;
  topEnabled?: Partial<Record<TopChoice, boolean>>;
  /** Libellé du bouton de production (nombre de territoires choisis). */
  produceLabel?: string;
  /** Améliorer : cube choisi en haut, puis coût du bas. */
  upgradeFrom?: TopUpgrade | null;
  onUpgradeFrom?: (u: TopUpgrade) => void;
  onUpgradeTo?: (a: BottomAction) => void;
  /** Déployer : mécha choisi. */
  mech?: number | null;
  onMech?: (i: number) => void;
  /** Construire : structure choisie. */
  structure?: Structure | null;
  onStructure?: (k: Structure) => void;
  /** Enrôler : colonne de la recrue, puis bonus immédiat. */
  enlistSection?: BottomAction | null;
  onEnlistSection?: (a: BottomAction) => void;
  onEnlistBonus?: (b: RecruitOnce) => void;
  /** Action du bas à faire maintenant (mise en évidence). */
  bottomReady?: boolean;
}

/** Case améliorable : valeur actuelle, et le cube tant qu'il n'a pas été déplacé. */
function Cube({ p, u, ui, inert }: { p: Player; u: TopUpgrade; ui?: MatUI; inert?: boolean }) {
  const on = p.topCubes[u];
  const pick = !inert && on && !!ui?.onUpgradeFrom;
  const content = (
    <>
      <b>{topValue(p, u)}</b>
      {on ? <span className="pm-cube" /> : <span className="pm-plus">+1</span>}
    </>
  );
  if (pick)
    return (
      <button
        type="button"
        className={`pm-up pick${ui?.upgradeFrom === u ? ' sel' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          ui!.onUpgradeFrom!(u);
        }}
        title="Prendre ce cube : cette valeur gagnera +1"
      >
        {content}
      </button>
    );
  return (
    <span className={`pm-up${on ? '' : ' done'}`} title={on ? 'Cube d’amélioration : en le déplaçant, cette valeur gagne +1' : 'Amélioré'}>
      {content}
    </span>
  );
}

/** Ligne d'option : bouton quand on peut la choisir, simple texte sinon. */
function Opt({ ui, c, children }: { ui?: MatUI; c: TopChoice; children: ReactNode }) {
  if (!ui?.onTop) return <div className="pm-line">{children}</div>;
  return (
    <button type="button" className="pm-opt" disabled={!ui.topEnabled?.[c]} onClick={() => ui.onTop!(c)}>
      {children}
    </button>
  );
}

function TopBlock({ p, top, ui }: { p: Player; top: TopAction; ui?: MatUI }) {
  const opts = !!ui?.onTop;
  switch (top) {
    case 'move':
      return (
        <>
          <Opt ui={ui} c="move">
            Déplacer <Cube p={p} u="move" ui={ui} inert={opts} /> unités
          </Opt>
          <div className="pm-or">ou</div>
          <Opt ui={ui} c="gain">
            Gagner <Cube p={p} u="gain" ui={ui} inert={opts} /> $
          </Opt>
        </>
      );
    case 'trade':
      return (
        <>
          <div className="pm-cost">Payer 1 $</div>
          <Opt ui={ui} c="trade">
            2 ressources au choix
          </Opt>
          <div className="pm-or">ou</div>
          <Opt ui={ui} c="tradePop">
            <Cube p={p} u="popularity" ui={ui} inert={opts} /> popularité
          </Opt>
        </>
      );
    case 'bolster':
      return (
        <>
          <div className="pm-cost">Payer 1 $</div>
          <Opt ui={ui} c="power">
            <Cube p={p} u="power" ui={ui} inert={opts} /> puissance
          </Opt>
          <div className="pm-or">ou</div>
          <Opt ui={ui} c="cards">
            <Cube p={p} u="cards" ui={ui} inert={opts} /> carte{topValue(p, 'cards') > 1 ? 's' : ''} Combat
          </Opt>
        </>
      );
    case 'produce': {
      const onMat = WORKERS - p.workers.length;
      // 6 emplacements d'ouvriers ; sous les 2e, 4e et 6e : 1 puissance, 1 popularité, 1 $.
      const costs = ['', '💪', '', '❤', '', '$'];
      return (
        <>
          <div className="pm-workers" title="Ouvriers encore sur la fiche : en les produisant, on révèle le coût de Produire">
            {costs.map((c, k) => {
              const filled = k >= 6 - onMat;
              return (
                <span key={k} className={`pm-wslot${filled ? ' full' : ''}`}>
                  {filled ? (
                    <Svg w={14} h={16} vb="-8 -10 16 19">
                      <WorkerPiece color={FACTION_COLORS[p.faction]} n={1} />
                    </Svg>
                  ) : (
                    <small>{c}</small>
                  )}
                </span>
              );
            })}
          </div>
          <Opt ui={ui} c="produce">
            {opts && ui?.produceLabel ? (
              ui.produceLabel
            ) : (
              <>
                Produire sur <Cube p={p} u="produce" ui={ui} inert={opts} /> territoires
              </>
            )}
          </Opt>
        </>
      );
    }
  }
}

function BottomBlock({ p, a, ui }: { p: Player; a: BottomAction; ui?: MatUI }) {
  const d = MATS[p.mat].bottom[a];
  const res = BOTTOM_RESOURCE[a];
  // Améliorer : la prochaine case de coût à recouvrir devient une cible.
  const target = !!ui?.upgradeFrom && !!ui.onUpgradeTo && bottomRoom(p, a) > 0;
  const nextCovered = d.cost - p.bottomCubes[a] - 1;
  const recruitPick = !!ui?.onEnlistSection && !p.recruits[a];
  const boxes = Array.from({ length: d.cost }, (_, k) => {
    const covered = k > nextCovered;
    const fixed = k < d.min;
    return (
      <span key={k} className={`pm-box${fixed ? ' fixed' : ''}${covered ? ' covered' : ''}${target && k === nextCovered ? ' target' : ''}`}>
        {covered ? (
          <span className="pm-cube" />
        ) : (
          <Svg w={14} h={14} vb="-8 -8 16 16">
            <ResourcePiece r={res} />
          </Svg>
        )}
      </span>
    );
  });
  return (
    <>
      {target ? (
        <button type="button" className="pm-boxes pick" onClick={() => ui!.onUpgradeTo!(a)} title={`Poser le cube ici : ${BOTTOM_NAMES[a]} coûtera 1 de moins`}>
          {boxes}
        </button>
      ) : (
        <div className="pm-boxes" title={`Coût : ${d.cost - p.bottomCubes[a]} (minimum ${d.min})`}>
          {boxes}
        </div>
      )}
      <div className="pm-gain">{d.coins ? `+${d.coins} $` : '—'}</div>
      {recruitPick ? (
        <button type="button" className={`pm-recruit pick${ui?.enlistSection === a ? ' sel' : ''}`} onClick={() => ui!.onEnlistSection!(a)} title="Enrôler la recrue de cette colonne">
          <span className="pm-cyl" />
          <small>{ONGOING_LABELS[a]}</small>
        </button>
      ) : (
        <div className={`pm-recruit${p.recruits[a] ? ' out' : ''}`} title="Bonus permanent de recrue : pour vous et vos voisins quand cette action est prise">
          <span className="pm-cyl" />
          <small>{p.recruits[a] ? `🎖 ${ONGOING_LABELS[a]}` : ONGOING_LABELS[a]}</small>
        </div>
      )}
    </>
  );
}

const TOP_HELP: Record<TopAction, string> = {
  move: 'Déplacer : chaque unité choisie (personnage, mécha, ouvrier) avance d’une case. Un mécha peut emmener des ouvriers. Ou bien : gagner des pièces.',
  trade: 'Échanger : payer 1 $ pour 2 ressources au choix (sur un territoire où vous avez un ouvrier), ou pour de la popularité.',
  produce: 'Produire : sur les territoires choisis, chaque ouvrier produit 1 ressource du terrain (un village produit des ouvriers). Le coût augmente avec le nombre d’ouvriers sur le plateau.',
  bolster: 'Renforcer : payer 1 $ pour de la puissance ou des cartes Combat.',
};

const BOTTOM_HELP: Record<BottomAction, string> = {
  upgrade: 'Améliorer (pétrole) : déplacer un cube du haut de la fiche vers un coût du bas. L’action du haut gagne +1, le coût du bas baisse de 1.',
  deploy: 'Déployer (métal) : poser un mécha sur un territoire avec un ouvrier. Sa capacité est débloquée pour le personnage et tous les méchas.',
  build: 'Construire (bois) : poser une structure sur un territoire avec un ouvrier. Elle libère un bonus sur l’action du haut au-dessus d’elle.',
  enlist: 'Enrôler (nourriture) : prendre une recrue dans une colonne (bonus permanent pour vous et vos voisins) et gagner un bonus immédiat.',
};

const BOTTOM_EFFECT: Record<BottomAction, string> = {
  upgrade: 'déplacer 1 cube',
  deploy: '1 mécha',
  build: '1 structure',
  enlist: '1 recrue',
};

interface Props {
  p: Player;
  /** Section où se trouve le jeton d'action du tour en cours. */
  current?: number | null;
  /** Sections cliquables (choix de la section du tour). */
  allowed?: number[];
  onSection?: (i: number) => void;
  /** Afficher la main et les objectifs (plateau de celui qui regarde). */
  secret?: boolean;
  /** Version resserrée : descriptions des méchas en infobulle. */
  compact?: boolean;
  /** Actions faites en cliquant sur le plateau. */
  ui?: MatUI;
}

/** Plateau du joueur, disposé comme les fiches du jeu : fiche faction en haut, fiche joueur dessous. */
export function PlayerBoard({ p, current, allowed, onSection, secret, compact, ui }: Props) {
  const m = MATS[p.mat];
  const ab = FACTION_ABILITY[p.faction];
  const color = FACTION_COLORS[p.faction];
  const ink = FACTION_INK[p.faction];
  const sections = p.factoryCard !== null ? [0, 1, 2, 3, 4] : [0, 1, 2, 3];
  const bonusPick = !!ui?.onEnlistBonus && !!ui.enlistSection;
  return (
    <div className={`pmat${compact ? ' compact' : ''}`} style={{ ['--fc' as string]: color, ['--fi' as string]: ink }}>
      {/* Fiche faction */}
      <div className="pm-faction">
        <div className="pm-crest">
          <Svg w={42} h={42} vb="-15 -15 30 30">
            <circle r={14} fill={color} stroke="#2a1c0e" strokeWidth={1.5} />
            <Emblem base={p.faction} size={16} color={ink} />
          </Svg>
          <div>
            <b>{FACTION_NAMES[p.faction]}</b>
            <small>
              {p.name} · fiche {MAT_NAMES[p.mat]}
            </small>
            <span className="pm-tracks">
              <span title="Pièces">💰 {p.coins}</span>
              <span title="Puissance (16 = étoile)">💪 {p.power}</span>
              <span title="Popularité (18 = étoile)">❤ {p.popularity}</span>
              <span title="Cartes Combat">🃏 {p.hand.length}</span>
            </span>
          </div>
        </div>
        <div className="pm-ability" title={ab.text}>
          <b>{ab.name}</b> {ab.text}
        </div>
        <div className="pm-stars" title={`${starCount(p)} étoile(s) sur 6`}>
          {Array.from({ length: 6 }, (_, k) => {
            const kinds = Object.entries(p.stars).flatMap(([kind, n]) => Array<string>(n ?? 0).fill(kind));
            const kind = kinds[k];
            return (
              <span key={k} className={`pm-star${kind ? ' on' : ''}`}>
                {kind ? STAR_ICONS[kind as keyof typeof STAR_ICONS] : '★'}
              </span>
            );
          })}
        </div>
        <div className="pm-mechs">
          {FACTION_DEFS[p.faction].mechs.map((k, i) => {
            const pick = !!ui?.onMech && !p.mechDeployed[i];
            const Tag = pick ? 'button' : 'div';
            return (
              <Tag
                key={k}
                type={pick ? 'button' : undefined}
                className={`pm-mech${p.mechDeployed[i] ? ' unlocked' : ''}${pick ? ' pick' : ''}${ui?.mech === i ? ' sel' : ''}`}
                onClick={pick ? () => ui!.onMech!(i) : undefined}
                title={k === 'riverwalk' ? `Berge : ${riverwalkText(p)}` : MECH_TEXT[k]}
              >
                {p.mechDeployed[i] ? (
                  <span className="pm-mech-free">débloquée</span>
                ) : (
                  <Svg w={34} h={34} vb="-13 -14 26 27">
                    <MechPiece color={color} ink={ink} n={1} />
                  </Svg>
                )}
                <b>{MECH_NAMES[k]}</b>
                {!compact && <small>{k === 'riverwalk' ? riverwalkText(p) : MECH_TEXT[k].split(' : ')[1]}</small>}
              </Tag>
            );
          })}
        </div>
        <div className="pm-once" title="Bonus immédiats de recrue (Enrôler)">
          {RECRUIT_ONCE.map((b) =>
            bonusPick && !p.recruitBonus[b] ? (
              <button key={b} type="button" className="pm-once-slot pick" onClick={() => ui!.onEnlistBonus!(b)} title="Prendre ce bonus immédiat">
                <small>{RECRUIT_LABELS[b]}</small>
              </button>
            ) : (
              <span key={b} className={`pm-once-slot${p.recruitBonus[b] ? ' used' : ''}`}>
                {p.recruitBonus[b] && <span className="pm-cyl" />}
                <small>{RECRUIT_LABELS[b]}</small>
              </span>
            ),
          )}
        </div>
      </div>

      {secret && (
        <div className="pm-secret">
          <span title="Vos cartes Combat (secrètes)">
            🃏 {p.hand.length ? [...p.hand].sort((a, b) => a - b).join(' · ') : 'aucune carte'}
          </span>
          {p.objectives.map((o) => (
            <span key={o} title={OBJECTIVE_TEXT[o].text}>
              📜 <b>{OBJECTIVE_TEXT[o].title}</b> <small>{OBJECTIVE_TEXT[o].text}</small>
            </span>
          ))}
        </div>
      )}

      {/* Fiche joueur */}
      <div className={`pm-grid cols-${sections.length}`}>
        {sections.map((i) => {
          const clickable = !!onSection && !!allowed?.includes(i);
          const isCurrent = current === i;
          const cls = `pm-col${isCurrent ? ' current' : ''}${p.lastSection === i && !isCurrent ? ' last' : ''}${clickable ? ' clickable' : ''}${onSection && !clickable ? ' locked' : ''}`;
          const body =
            i === 4 ? (
              <>
                <div className="pm-top">
                  <div className="pm-head">🏭 Usine n° {p.factoryCard! + 1}</div>
                  {FACTORY_CARDS[p.factoryCard!].map((o, k) => (
                    <div key={k} className="pm-line">
                      {describeOption(o)}
                    </div>
                  ))}
                </div>
                <div className="pm-bottom">
                  <div className="pm-head">Déplacer</div>
                  <div className="pm-line">1 unité, jusqu’à 2 fois</div>
                </div>
              </>
            ) : (
              (() => {
                const top = m.top[i];
                const a = BOTTOM_ACTIONS[i];
                const structure = STRUCTURES.find((k) => STRUCTURE_ACTION[k] === top)!;
                const built = p.structures[structure] !== null;
                const structPick = !!ui?.onStructure && !built;
                const structureBody = built ? (
                  <small>✓ {STRUCTURE_TEXT[structure].split(' : ')[1]}</small>
                ) : (
                  <>
                    <Svg w={20} h={20} vb="-11 -13 22 24">
                      <StructurePiece kind={structure} color={color} />
                    </Svg>
                    <small>{STRUCTURE_NAMES[structure]}</small>
                  </>
                );
                return (
                  <>
                    {structPick ? (
                      <button type="button" className={`pm-structure pick${ui?.structure === structure ? ' sel' : ''}`} onClick={() => ui!.onStructure!(structure)} title={STRUCTURE_TEXT[structure]}>
                        {structureBody}
                      </button>
                    ) : (
                      <div className={`pm-structure${built ? ' built' : ''}`} title={STRUCTURE_TEXT[structure]}>
                        {structureBody}
                      </div>
                    )}
                    <div className={`pm-top${isCurrent && ui?.onTop ? ' live' : ''}`} title={TOP_HELP[top]}>
                      <div className="pm-head">{TOP_NAMES[top]}</div>
                      <TopBlock p={p} top={top} ui={isCurrent ? ui : ui && { ...ui, onTop: undefined }} />
                    </div>
                    <div className={`pm-bottom${isCurrent && ui?.bottomReady ? ' live' : ''}`} title={BOTTOM_HELP[a]}>
                      <div className="pm-head">
                        {BOTTOM_NAMES[a]} <small>{BOTTOM_EFFECT[a]}</small>
                      </div>
                      <BottomBlock p={p} a={a} ui={ui} />
                    </div>
                  </>
                );
              })()
            );
          return (
            <div key={i} className={cls} onClick={clickable ? () => onSection!(i) : undefined} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}>
              {isCurrent && <span className="pm-token" title="Jeton d’action" />}
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
