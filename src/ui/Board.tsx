import type { ReactElement } from 'react';
import { HEXES, RESOURCES, RIVERS, neighborAt, type GameState } from '../engine';
import { BASE_LABELS, FACTION_COLORS, FACTION_INK, RES_COLORS, RES_ICONS, STRUCTURE_ICONS, TERRAIN_COLORS, TERRAIN_ICONS } from './theme';

const R = 40;
const W = Math.sqrt(3) * R;
const M = 10;
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
      <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={14} fill="#26303a" />
      {HEXES.map((h) => {
        const [cx, cy] = center(h.id);
        const cls = ['hex', targets?.has(h.id) ? 'target' : '', picked?.has(h.id) ? 'picked' : '', selected === h.id ? 'selected' : '', movable?.has(h.id) ? 'movable' : '']
          .filter(Boolean)
          .join(' ');
        const click = onHex && (targets?.has(h.id) || movable?.has(h.id) || picked?.has(h.id)) ? () => onHex(h.id) : undefined;
        if (h.base) {
          const active = s.players.some((p) => p.faction === h.base);
          return (
            <g key={h.id} className={cls} onClick={click}>
              <polygon points={hexPoints(cx, cy, R - 6)} className="hex-bg" fill={FACTION_COLORS[h.base]} opacity={active ? 0.85 : 0.3} stroke="#111" strokeWidth={2} />
              <text x={cx} y={cy - 18} textAnchor="middle" className="base-label" fill={FACTION_INK[h.base]}>
                {BASE_LABELS[h.base]}
              </text>
              <Units s={s} hex={h.id} cx={cx} cy={cy + 2} />
            </g>
          );
        }
        const terrain = h.terrain!;
        const st = s.board.structures[h.id];
        const res = s.board.res[h.id];
        const resList = RESOURCES.filter((r) => res[r] > 0);
        return (
          <g key={h.id} className={cls} onClick={click}>
            <polygon points={hexPoints(cx, cy)} className="hex-bg" fill={TERRAIN_COLORS[terrain]} />
            <text x={cx} y={cy - 20} textAnchor="middle" className="terrain-icon">
              {TERRAIN_ICONS[terrain]}
            </text>
            {h.tunnel && (
              <g transform={`translate(${cx - 24},${cy - 10})`}>
                <title>Tunnel</title>
                <path d="M-7 5 A7 7 0 0 1 7 5 Z" fill="#2a2018" stroke="#d8c7a0" strokeWidth={1.2} />
              </g>
            )}
            {s.board.encounters[h.id] && (
              <g transform={`translate(${cx + 22},${cy - 12})`}>
                <title>Rencontre</title>
                <circle r={7} fill="#5aa04a" stroke="#e9f5d0" strokeWidth={1.5} />
                <text y={3.5} textAnchor="middle" className="enc-mark">
                  ✦
                </text>
              </g>
            )}
            {st && (
              <g transform={`translate(${cx - 22},${cy + 10})`}>
                <title>Structure</title>
                <rect x={-8} y={-8} width={16} height={16} rx={3} fill={FACTION_COLORS[s.players[st.player].faction]} stroke="#111" />
                <text y={4.5} textAnchor="middle" className="struct-mark">
                  {STRUCTURE_ICONS[st.kind]}
                </text>
              </g>
            )}
            {resList.length > 0 && (
              <g transform={`translate(${cx - (resList.length - 1) * 9},${cy + 26})`}>
                {resList.map((r, k) => (
                  <g key={r} transform={`translate(${k * 18},0)`}>
                    <rect x={-8} y={-7} width={16} height={13} rx={3} fill={RES_COLORS[r]} stroke="#111" strokeWidth={0.8} />
                    <text y={4} textAnchor="middle" className="res-n" fill={r === 'food' || r === 'metal' ? '#111' : '#fff'}>
                      {res[r]}
                    </text>
                    <title>{`${res[r]} ${RES_ICONS[r]}`}</title>
                  </g>
                ))}
              </g>
            )}
            <Units s={s} hex={h.id} cx={cx} cy={cy + 2} />
          </g>
        );
      })}
      {RIVERS.map(([a, b]) => {
        const seg = riverSegment(a, b);
        if (!seg) return null;
        return <line key={`${a}-${b}`} className="river" x1={seg[0]} y1={seg[1]} x2={seg[2]} y2={seg[3]} />;
      })}
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
  const width = (g: (typeof groups)[number]) => (g.char ? 20 : 0) + (g.mechs ? 20 : 0) + (g.workers ? 16 : 0);
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
            <g key="c" transform={`translate(${x + 10},${cy})`}>
              <title>{`Personnage de ${g.p.name}`}</title>
              <circle r={9.5} fill={color} stroke="#fff" strokeWidth={2} />
              <text y={4} textAnchor="middle" className="unit-mark" fill={ink}>
                ★
              </text>
            </g>,
          );
          x += 20;
        }
        if (g.mechs) {
          items.push(
            <g key="m" transform={`translate(${x + 10},${cy})`}>
              <title>{`${g.mechs} mécha${g.mechs > 1 ? 's' : ''} de ${g.p.name}`}</title>
              <rect x={-9} y={-9} width={18} height={18} rx={4} fill={color} stroke="#111" strokeWidth={1.5} />
              <text y={4} textAnchor="middle" className="unit-mark" fill={ink}>
                {g.mechs > 1 ? g.mechs : '⚙'}
              </text>
            </g>,
          );
          x += 20;
        }
        if (g.workers) {
          items.push(
            <g key="w" transform={`translate(${x + 8},${cy})`}>
              <title>{`${g.workers} ouvrier${g.workers > 1 ? 's' : ''} de ${g.p.name}`}</title>
              <circle r={7} fill={color} stroke="#111" strokeWidth={1.2} />
              <text y={3.5} textAnchor="middle" className="unit-n" fill={ink}>
                {g.workers}
              </text>
            </g>,
          );
          x += 16;
        }
        x += 4;
        return <g key={g.p.faction}>{items}</g>;
      })}
    </g>
  );
}
