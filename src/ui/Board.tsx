import type { ReactElement } from 'react';
import { HEXES, RESOURCES, RIVERS, TERRAIN_NAMES, neighborAt, type GameState, type Terrain } from '../engine';
import { CharacterPiece, BoardDefs, Compass, Emblem, EncounterToken, MechPiece, ResourcePiece, StructurePiece, TerrainArt, TunnelMark, WorkerPiece, Wreck } from './art';
import { BASE_LABELS, FACTION_COLORS, FACTION_INK, RES_LABELS } from './theme';

const R = 40;
const W = Math.sqrt(3) * R;
const M = 14;
export const BOARD_W = 2 * M + 8.5 * W;
export const BOARD_H = 2 * M + 2 * R + 8 * 1.5 * R;

export function center(id: number): [number, number] {
  const h = HEXES[id];
  return [M + W / 2 + h.col * W + (h.row % 2 === 0 ? W / 2 : 0), M + R + h.row * 1.5 * R];
}

function corner(cx: number, cy: number, k: number, r = R): [number, number] {
  const a = ((-90 + 60 * k) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function hexPoints(cx: number, cy: number, r = R - 1): string {
  return [0, 1, 2, 3, 4, 5].map((k) => corner(cx, cy, k, r).join(',')).join(' ');
}

/** Segment de rivière : le côté commun aux deux cases. */
function riverSegment(a: number, b: number): [number, number, number, number] | null {
  for (let side = 0; side < 6; side++) {
    if (neighborAt(a, side) !== b) continue;
    const [cx, cy] = center(a);
    const [x1, y1] = corner(cx, cy, side);
    const [x2, y2] = corner(cx, cy, side + 1);
    return [x1, y1, x2, y2];
  }
  return null;
}

/** Tracé sinueux d'une rivière le long d'un côté. */
function riverPath([x1, y1, x2, y2]: [number, number, number, number], seed: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const nx = -(y2 - y1) / 10;
  const ny = (x2 - x1) / 10;
  const k = seed % 2 ? 1 : -1;
  return `M${x1} ${y1} Q${(x1 + mx) / 2 + nx * k} ${(y1 + my) / 2 + ny * k} ${mx} ${my} T${x2} ${y2}`;
}

/** Cases avec une carcasse de mécha (décor). */
const WRECKS = new Set(HEXES.filter((h) => h.terrain && h.terrain !== 'lake' && h.terrain !== 'factory' && (h.id * 7) % 11 === 3).map((h) => h.id));

interface Props {
  s: GameState;
  /** Cases cliquables (destinations, territoires à choisir). */
  targets?: Set<number>;
  /** Cases déjà choisies (production…). */
  picked?: Set<number>;
  /** Case sélectionnée (origine d'un déplacement). */
  selected?: number | null;
  /** Cases où le joueur a des unités déplaçables. */
  movable?: Set<number>;
  onHex?: (id: number) => void;
}

export function Board({ s, targets, picked, selected, movable, onHex }: Props) {
  return (
    <svg className="board" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} role="img" aria-label="Plateau de jeu">
      <BoardDefs />
      <clipPath id="hexclip">
        <polygon points={hexPoints(0, 0, R - 1)} />
      </clipPath>
      {/* Carte sur papier vieilli */}
      <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={14} fill="#cdb689" />
      <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={14} filter="url(#paper)" />
      <rect x={5} y={5} width={BOARD_W - 10} height={BOARD_H - 10} rx={10} fill="none" stroke="#5a4426" strokeWidth={1.5} />
      <g transform={`translate(${BOARD_W - 78},${54})`} className="cartouche">
        <rect x={-58} y={-24} width={116} height={42} rx={4} fill="#e6d4ab" stroke="#5a4426" strokeWidth={1.2} />
        <text y={-4} textAnchor="middle" className="carto-title">
          EUROPA
        </text>
        <text y={11} textAnchor="middle" className="carto-sub">
          — 1920 —
        </text>
      </g>
      <g transform={`translate(${BOARD_W - 70},${BOARD_H - 62})`}>
        <Compass />
      </g>

      {HEXES.map((h) => {
        const [cx, cy] = center(h.id);
        const cls = ['hex', targets?.has(h.id) ? 'target' : '', picked?.has(h.id) ? 'picked' : '', selected === h.id ? 'selected' : '', movable?.has(h.id) ? 'movable' : '']
          .filter(Boolean)
          .join(' ');
        const click = onHex && (targets?.has(h.id) || movable?.has(h.id) || picked?.has(h.id)) ? () => onHex(h.id) : undefined;
        if (h.base) {
          const active = s.players.some((p) => p.faction === h.base);
          const color = FACTION_COLORS[h.base];
          return (
            <g key={h.id} className={cls} onClick={click}>
              <title>{`Base : ${BASE_LABELS[h.base]}${active ? '' : ' (faction absente)'}`}</title>
              <g transform={`translate(${cx},${cy})`} opacity={active ? 1 : 0.4}>
                <polygon points={hexPoints(0, 0, R - 5)} className="hex-bg" fill={color} stroke="#2a1c0e" strokeWidth={2.5} />
                <polygon points={hexPoints(0, 0, R - 10)} fill="none" stroke={FACTION_INK[h.base]} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="3 2" />
                <g opacity={0.35}>
                  <Emblem base={h.base} size={34} color={FACTION_INK[h.base]} />
                </g>
                <text y={-19} textAnchor="middle" className="base-label" fill={FACTION_INK[h.base]}>
                  {BASE_LABELS[h.base].toUpperCase()}
                </text>
              </g>
              <Units s={s} hex={h.id} cx={cx} cy={cy + 4} />
            </g>
          );
        }
        const terrain = h.terrain!;
        const st = s.board.structures[h.id];
        const res = s.board.res[h.id];
        const resList = RESOURCES.filter((r) => res[r] > 0);
        return (
          <g key={h.id} className={cls} onClick={click}>
            <title>{TERRAIN_NAMES[terrain] + (h.tunnel ? ' — tunnel' : '') + (s.board.encounters[h.id] ? ' — rencontre' : '')}</title>
            <g transform={`translate(${cx},${cy})`}>
              <g clipPath="url(#hexclip)">
                <polygon points={hexPoints(0, 0, R)} className="hex-bg" fill={`url(#g-${terrain})`} />
                <g className="terrain-art">
                  <TerrainArt terrain={terrain} seed={h.id} />
                </g>
                {WRECKS.has(h.id) && (
                  <g transform="translate(-20,18)">
                    <Wreck seed={h.id} />
                  </g>
                )}
                <polygon points={hexPoints(0, 0, R)} fill="#000" opacity={0.08} filter="url(#grain)" />
              </g>
              <polygon points={hexPoints(0, 0, R - 1)} className="hex-rim" />
              <polygon points={hexPoints(0, 0, R - 3.5)} className="hex-bevel" />
              {h.tunnel && (
                <g transform="translate(-23,-12)">
                  <TunnelMark />
                </g>
              )}
              {s.board.encounters[h.id] && (
                <g transform="translate(22,-14)">
                  <EncounterToken />
                </g>
              )}
              {st && (
                <g transform="translate(-21,12)">
                  <title>Structure</title>
                  <StructurePiece kind={st.kind} color={FACTION_COLORS[s.players[st.player].faction]} />
                </g>
              )}
              {resList.length > 0 && (
                <g transform={`translate(${-(resList.length - 1) * 10},26)`}>
                  {resList.map((r, k) => (
                    <g key={r} transform={`translate(${k * 20},0)`}>
                      <title>{`${res[r]} × ${RES_LABELS[r]}`}</title>
                      <rect x={-9.5} y={-8} width={19} height={15} rx={4} fill="#f1e4c3" stroke="#3a2a18" strokeWidth={0.8} opacity={0.9} />
                      <g transform="translate(-3,0) scale(0.8)">
                        <ResourcePiece r={r} />
                      </g>
                      <text x={5.5} y={3.5} textAnchor="middle" className="res-n">
                        {res[r]}
                      </text>
                    </g>
                  ))}
                </g>
              )}
            </g>
            <Units s={s} hex={h.id} cx={cx} cy={cy + 2} />
          </g>
        );
      })}
      {RIVERS.map(([a, b]) => {
        const seg = riverSegment(a, b);
        if (!seg) return null;
        const d = riverPath(seg, a + b);
        return (
          <g key={`${a}-${b}`} className="river">
            <path d={d} className="river-bank" />
            <path d={d} className="river-water" />
          </g>
        );
      })}
      <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={14} fill="url(#vignette)" pointerEvents="none" />
      {/* Contours des cases cliquables par-dessus les rivières. */}
      {HEXES.filter((h) => targets?.has(h.id) || selected === h.id).map((h) => {
        const [cx, cy] = center(h.id);
        return <polygon key={`o${h.id}`} points={hexPoints(cx, cy, R - 3)} className={selected === h.id ? 'hex-outline sel' : 'hex-outline'} />;
      })}
    </svg>
  );
}

/** Pions présents sur une case, groupés par joueur. */
function Units({ s, hex, cx, cy }: { s: GameState; hex: number; cx: number; cy: number }) {
  const groups = s.players
    .map((p) => ({
      p,
      char: p.character === hex,
      mechs: p.mechs.filter((m) => m === hex).length,
      workers: p.workers.filter((w) => w === hex).length,
    }))
    .filter((g) => g.char || g.mechs || g.workers);
  if (!groups.length) return null;
  const width = (g: (typeof groups)[number]) => (g.char ? 20 : 0) + (g.mechs ? 22 : 0) + (g.workers ? 17 : 0);
  const total = groups.reduce((a, g) => a + width(g) + 4, -4);
  let x = cx - total / 2;
  return (
    <g className="units">
      {groups.map((g) => {
        const color = FACTION_COLORS[g.p.faction];
        const ink = FACTION_INK[g.p.faction];
        const items: ReactElement[] = [];
        if (g.char) {
          items.push(
            <g key="c" transform={`translate(${x + 10},${cy - 2})`}>
              <title>{`Personnage de ${g.p.name}`}</title>
              <CharacterPiece color={color} ink={ink} base={g.p.faction} />
            </g>,
          );
          x += 20;
        }
        if (g.mechs) {
          items.push(
            <g key="m" transform={`translate(${x + 11},${cy - 2})`}>
              <title>{`${g.mechs} mécha${g.mechs > 1 ? 's' : ''} de ${g.p.name}`}</title>
              <MechPiece color={color} ink={ink} n={g.mechs} />
            </g>,
          );
          x += 22;
        }
        if (g.workers) {
          items.push(
            <g key="w" transform={`translate(${x + 8},${cy})`}>
              <title>{`${g.workers} ouvrier${g.workers > 1 ? 's' : ''} de ${g.p.name}`}</title>
              <WorkerPiece color={color} n={g.workers} />
            </g>,
          );
          x += 17;
        }
        x += 4;
        return <g key={g.p.faction}>{items}</g>;
      })}
    </g>
  );
}

const LEGEND: { t: Terrain; label: string; gives: string }[] = [
  { t: 'farm', label: 'Ferme', gives: 'nourriture' },
  { t: 'forest', label: 'Forêt', gives: 'bois' },
  { t: 'mountain', label: 'Montagne', gives: 'métal' },
  { t: 'tundra', label: 'Toundra', gives: 'pétrole' },
  { t: 'village', label: 'Village', gives: 'ouvriers' },
  { t: 'lake', label: 'Lac', gives: 'infranchissable' },
  { t: 'factory', label: 'Usine', gives: 'carte Usine, vaut 3 territoires' },
];

/** Légende : ce que produit chaque terrain, et les symboles du plateau. */
export function Legend() {
  const mini = (child: ReactElement) => (
    <svg width={22} height={22} viewBox="-12 -12 24 24" aria-hidden>
      {child}
    </svg>
  );
  return (
    <div className="legend">
      {LEGEND.map(({ t, label, gives }) => (
        <span key={t}>
          {mini(
            <g transform="scale(0.28)">
              <polygon points={hexPoints(0, 0, R)} fill={`url(#g-${t})`} stroke="#2a1c0e" strokeWidth={4} />
              <TerrainArt terrain={t} seed={3} />
            </g>,
          )}
          <b>{label}</b> {gives}
        </span>
      ))}
      <span>
        {mini(<g transform="scale(0.9)"><TunnelMark /></g>)}
        <b>Tunnel</b> tous reliés
      </span>
      <span>
        {mini(<g transform="scale(0.9)"><EncounterToken /></g>)}
        <b>Rencontre</b> pour le personnage
      </span>
      <span>
        {mini(<path d="M-10 -6 Q0 0 -2 6 T10 8" fill="none" stroke="#79b4c8" strokeWidth={3} />)}
        <b>Rivière</b> infranchissable sans Berge
      </span>
    </div>
  );
}
