import type { ReactElement } from 'react';
import type { BaseId, Resource, Structure, Terrain } from '../engine';

/*
 * Illustrations vectorielles du plateau, dans l'esprit de l'Europa des années 1920 de Scythe : campagnes
 * paisibles, usines éteintes et carcasses de méchas de la Grande Guerre. Tout est dessiné ici (aucune image
 * du jeu n'est reprise).
 */

/** Contour des pièces : clair pour les factions sombres, pour qu'elles restent visibles. */
export function edge(color: string): string {
  const n = parseInt(color.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum < 70 ? '#d9cdb2' : '#1a140e';
}

/** Petit générateur déterministe pour varier les dessins d'une case à l'autre. */
function rand(seed: number) {
  let x = (seed * 9301 + 49297) % 233280;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

export const TERRAIN_BASE: Record<Terrain, [string, string]> = {
  farm: ['#c9a85a', '#8f7535'],
  forest: ['#556b3e', '#2f3f24'],
  mountain: ['#8a7d70', '#4f463e'],
  tundra: ['#b7c2bb', '#76847f'],
  village: ['#a8805a', '#6b4b32'],
  lake: ['#5d8798', '#2f5262'],
  factory: ['#6a4a4c', '#352325'],
};

/** Définitions partagées : dégradés des terrains, grain du papier, symboles des pièces. */
export function BoardDefs() {
  return (
    <defs>
      {(Object.keys(TERRAIN_BASE) as Terrain[]).map((t) => (
        <radialGradient key={t} id={`g-${t}`} cx="45%" cy="35%" r="75%">
          <stop offset="0%" stopColor={TERRAIN_BASE[t][0]} />
          <stop offset="100%" stopColor={TERRAIN_BASE[t][1]} />
        </radialGradient>
      ))}
      <filter id="paper" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.25  0 0 0 0 0.18  0 0 0 0 0.1  0 0 0 0.55 0" />
      </filter>
      <filter id="grain" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="3" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.22 0" result="g" />
        <feComposite in="g" in2="SourceGraphic" operator="in" />
      </filter>
      <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
        <stop offset="60%" stopColor="#000" stopOpacity="0" />
        <stop offset="100%" stopColor="#1a0f05" stopOpacity="0.55" />
      </radialGradient>
      <linearGradient id="smoke" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#d8d0c0" stopOpacity="0.7" />
        <stop offset="1" stopColor="#d8d0c0" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

/** Dessin d'un terrain, centré sur (0, 0), à découper dans l'hexagone. */
export function TerrainArt({ terrain, seed }: { terrain: Terrain; seed: number }): ReactElement {
  const r = rand(seed + 1);
  const flip = r() < 0.5 ? -1 : 1;
  switch (terrain) {
    case 'farm':
      return (
        <g>
          {Array.from({ length: 9 }, (_, k) => (
            <path key={k} d={`M${-60 + k * 14} 40 Q ${-40 + k * 14} 0 ${-20 + k * 14} -40`} stroke="#7d6328" strokeWidth={2.2} fill="none" opacity={0.55} />
          ))}
          <g transform={`translate(${14 * flip},6)`}>
            <ellipse cx={0} cy={9} rx={11} ry={3} fill="#5e4a1e" opacity={0.5} />
            <path d="M-10 9 Q-9 -6 0 -9 Q9 -6 10 9 Z" fill="#e2c66d" stroke="#7d6328" strokeWidth={1} />
            <path d="M-6 0 H6 M-8 5 H8" stroke="#a88b3c" strokeWidth={0.8} />
          </g>
          <path d={`M${-28 * flip} 14 h14 M${-28 * flip} 10 h14 M${-26 * flip} 8 v9 M${-17 * flip} 8 v9`} stroke="#5b4320" strokeWidth={1.2} />
        </g>
      );
    case 'forest': {
      const trees = Array.from({ length: 7 }, () => [(r() - 0.5) * 52, (r() - 0.5) * 40, 0.75 + r() * 0.5] as const).sort((a, b) => a[1] - b[1]);
      return (
        <g>
          {trees.map(([x, y, k], i) => (
            <g key={i} transform={`translate(${x},${y}) scale(${k})`}>
              <rect x={-1.2} y={6} width={2.4} height={5} fill="#3b2a1a" />
              <path d="M0 -14 L8 0 H4 L10 8 H-10 L-4 0 H-8 Z" fill={i % 2 ? '#2c3d22' : '#3a4f2b'} stroke="#1d2916" strokeWidth={0.8} />
            </g>
          ))}
        </g>
      );
    }
    case 'mountain':
      return (
        <g transform={`scale(${flip},1)`}>
          <path d="M-46 22 L-18 -18 L-6 -2 L6 -24 L40 22 Z" fill="#6c625a" stroke="#3a332d" strokeWidth={1.2} />
          <path d="M-18 -18 L-12 -9 L-16 -8 L-22 -12 Z M6 -24 L14 -12 L8 -12 L3 -16 Z" fill="#e8e4dc" />
          <path d="M6 -24 L2 0 L-6 -2 M-18 -18 L-20 4" stroke="#4a423b" strokeWidth={1} fill="none" />
          <path d="M-40 26 L-22 6 L-10 26 Z" fill="#5a524a" />
          <path d="M14 22 L24 8 L34 22 Z" fill="#5f564d" />
        </g>
      );
    case 'tundra':
      return (
        <g>
          {Array.from({ length: 14 }, (_, i) => (
            <circle key={i} cx={(r() - 0.5) * 70} cy={(r() - 0.5) * 60} r={0.8 + r() * 1.2} fill="#f4f7f5" opacity={0.8} />
          ))}
          <path d="M-40 18 Q-20 10 0 16 T40 14" stroke="#eef3f0" strokeWidth={3} fill="none" opacity={0.7} />
          {/* Derrick pétrolier */}
          <g transform={`translate(${12 * flip},-2)`}>
            <path d="M-7 16 L0 -16 L7 16 M-5 6 H5 M-3.5 -2 H3.5 M-6 16 L5 6 M6 16 L-5 6" stroke="#2b2622" strokeWidth={1.4} fill="none" />
            <rect x={-2} y={-19} width={4} height={4} fill="#2b2622" />
            <ellipse cx={0} cy={17} rx={9} ry={2.5} fill="#1b1714" opacity={0.6} />
          </g>
        </g>
      );
    case 'village':
      return (
        <g>
          {[
            [-14, 2, 1],
            [8, -6, 0.9],
            [12 * flip, 12, 0.8],
          ].map(([x, y, k], i) => (
            <g key={i} transform={`translate(${x},${y}) scale(${k})`}>
              <rect x={-9} y={-4} width={18} height={12} fill="#d8c4a0" stroke="#4d3624" strokeWidth={1} />
              <path d="M-11 -4 L0 -13 L11 -4 Z" fill={i === 1 ? '#7a3b2a' : '#5b3a28'} stroke="#3a2618" strokeWidth={1} />
              <rect x={-2} y={2} width={4} height={6} fill="#4d3624" />
              <rect x={4} y={-12} width={3} height={6} fill="#4d3624" />
              {i === 0 && <path d="M5.5 -13 q3 -6 -1 -10 q4 -3 1 -8" stroke="url(#smoke)" strokeWidth={3} fill="none" />}
            </g>
          ))}
        </g>
      );
    case 'lake':
      return (
        <g>
          {Array.from({ length: 6 }, (_, k) => (
            <path key={k} d={`M${-26 + (k % 2) * 10} ${-22 + k * 9} q5 -3 10 0 t10 0 t10 0`} stroke="#a9cbd6" strokeWidth={1.3} fill="none" opacity={0.75} />
          ))}
          <path d={`M${-24 * flip} 22 v-12 M${-21 * flip} 22 v-9 M${-27 * flip} 22 v-7`} stroke="#3b4a2a" strokeWidth={1.2} />
        </g>
      );
    case 'factory':
      return (
        <g>
          <path d="M-26 22 V0 L-16 -8 V0 L-6 -8 V0 L4 -8 V0 L14 -8 V22 Z" fill="#3a2a2b" stroke="#1d1415" strokeWidth={1.2} />
          <rect x={16} y={-26} width={6} height={48} fill="#2b1f20" stroke="#1d1415" />
          <rect x={-22} y={-20} width={5} height={20} fill="#2b1f20" />
          <path d="M19 -28 q-4 -8 2 -12 q-5 -6 1 -10" stroke="url(#smoke)" strokeWidth={5} fill="none" />
          {[-20, -10, 0].map((x) => (
            <rect key={x} x={x} y={6} width={5} height={6} fill="#e0a64b" opacity={0.75} />
          ))}
          <g transform="translate(-2,-20)">
            <circle r={6} fill="none" stroke="#b08a4a" strokeWidth={2.5} strokeDasharray="2.5 1.6" />
            <circle r={2.2} fill="#b08a4a" />
          </g>
        </g>
      );
  }
}

/** Carcasse de mécha de la Grande Guerre, posée sur certaines cases pour le décor. */
export function Wreck({ seed }: { seed: number }) {
  const flip = seed % 2 ? -1 : 1;
  return (
    <g transform={`scale(${flip * 0.55},0.55) rotate(-18)`} opacity={0.55}>
      <path d="M-14 6 L-8 -8 H10 L14 4 Z" fill="#4a3a2c" stroke="#24190f" strokeWidth={1.4} />
      <path d="M-8 -8 L-4 -14 H6 L10 -8" fill="#5a4634" stroke="#24190f" />
      <path d="M-10 6 L-18 16 M10 4 L20 12" stroke="#24190f" strokeWidth={3} />
      <circle cx={2} cy={-11} r={1.6} fill="#c96c2a" />
    </g>
  );
}

/** Emblèmes des factions (formes simples). */
export function Emblem({ base, size = 14, color = '#fff' }: { base: BaseId; size?: number; color?: string }) {
  const s = size / 14;
  const common = { fill: color, stroke: 'none' } as const;
  let shape: ReactElement;
  switch (base) {
    case 'nordic': // hache et vague
      shape = <path d="M-2 -12 V12 M-2 -10 Q8 -10 9 -2 Q8 6 -2 4" {...common} stroke={color} strokeWidth={2.4} fill="none" />;
      break;
    case 'rusviet': // étoile
      shape = <path d="M0 -12 L3.5 -3.7 L12 -3.7 L5.2 1.6 L7.6 10 L0 5 L-7.6 10 L-5.2 1.6 L-12 -3.7 L-3.5 -3.7 Z" {...common} />;
      break;
    case 'crimea': // croissant
      shape = <path d="M4 -11 A11 11 0 1 0 4 11 A8 8 0 1 1 4 -11 Z" {...common} />;
      break;
    case 'saxony': // croix de fer
      shape = <path d="M-3 -12 H3 L2 -4 L4 -2 L12 -3 V3 L4 2 L2 4 L3 12 H-3 L-2 4 L-4 2 L-12 3 V-3 L-4 -2 L-2 -4 Z" {...common} />;
      break;
    case 'polania': // aigle stylisé
      shape = <path d="M0 -10 L3 -4 L12 -8 L7 0 L11 4 L3 3 L2 11 L0 7 L-2 11 L-3 3 L-11 4 L-7 0 L-12 -8 L-3 -4 Z" {...common} />;
      break;
    case 'albion':
      shape = <path d="M-10 10 L0 -12 L10 10 Z" {...common} />;
      break;
    case 'togawa':
      shape = <circle r={9} {...common} />;
      break;
  }
  return <g transform={`scale(${s})`}>{shape}</g>;
}

/** Personnage : héros et son compagnon animal, sur un socle aux couleurs de la faction. */
export function CharacterPiece({ color, ink, base }: { color: string; ink: string; base: BaseId }) {
  return (
    <g>
      <ellipse cx={0} cy={11} rx={11} ry={3.2} fill="#000" opacity={0.4} />
      <circle r={11} fill={color} stroke="#f4d58a" strokeWidth={2} />
      <circle r={11} fill="none" stroke="#1a140e" strokeWidth={0.8} />
      {/* Animal (dos et tête) puis cavalier */}
      <path d="M-8 5 Q-7 -1 -1 -1 L5 -2 L8 -6 L9 -3 L7 0 L7 5 Z" fill={ink} opacity={0.9} />
      <path d="M-2 -1 L-1 -6 a2.3 2.3 0 1 1 3 0 L3 -1 Z" fill={ink} />
      <path d="M-1 -7 L-1 -10 L4 -9 L-1 -8" fill={ink} />
      <title>{base}</title>
    </g>
  );
}

/** Mécha : marcheur à deux jambes. */
export function MechPiece({ color, ink, n }: { color: string; ink: string; n: number }) {
  return (
    <g>
      <ellipse cx={0} cy={11} rx={10} ry={3} fill="#000" opacity={0.35} />
      <path d="M-5 3 L-8 11 M5 3 L8 11" stroke="#1a140e" strokeWidth={3} strokeLinecap="round" />
      <path d="M-10 -6 L-7 -11 H7 L10 -6 L8 4 H-8 Z" fill={color} stroke={edge(color)} strokeWidth={1.4} />
      <rect x={-11} y={-4} width={3} height={6} fill="#1a140e" />
      <rect x={8} y={-4} width={3} height={6} fill="#1a140e" />
      <circle cx={0} cy={-6} r={2} fill="#e8a33b" />
      {n > 1 && (
        <text y={3} textAnchor="middle" className="unit-mark" fill={ink}>
          {n}
        </text>
      )}
    </g>
  );
}

/** Ouvrier : silhouette de meeple. */
export function WorkerPiece({ color, n }: { color: string; n: number }) {
  return (
    <g>
      <ellipse cx={0} cy={8} rx={7} ry={2.2} fill="#000" opacity={0.35} />
      <path d="M0 -9 a3.4 3.4 0 1 1 0.01 0 Z M-7 -1 Q-7 -4 -3 -4 H3 Q7 -4 7 -1 L4 0 L5 8 H1 L0 4 L-1 8 H-5 L-4 0 Z" fill={color} stroke={edge(color)} strokeWidth={1.1} />
      {n > 1 && (
        <g transform="translate(6,-7)">
          <circle r={5} fill="#1a140e" stroke="#f4e6c4" strokeWidth={0.8} />
          <text y={2.8} textAnchor="middle" className="unit-n" fill="#f4e6c4">
            {n}
          </text>
        </g>
      )}
    </g>
  );
}

/** Structures : silhouettes de bâtiments. */
export function StructurePiece({ kind, color }: { kind: Structure; color: string }) {
  const st = { fill: color, stroke: edge(color), strokeWidth: 1.2 } as const;
  switch (kind) {
    case 'mine': // chevalement
      return (
        <g>
          <path d="M-7 8 L-3 -8 H3 L7 8" {...st} fill="none" strokeWidth={2} stroke={color} />
          <circle cx={0} cy={-8} r={3} {...st} />
          <rect x={-8} y={6} width={16} height={4} {...st} />
        </g>
      );
    case 'monument': // obélisque
      return (
        <g>
          <path d="M-3 7 L-2 -9 L0 -12 L2 -9 L3 7 Z" {...st} />
          <rect x={-7} y={6} width={14} height={4} {...st} />
        </g>
      );
    case 'mill': // moulin
      return (
        <g>
          <path d="M-5 10 L-3 -3 H3 L5 10 Z" {...st} />
          <path d="M0 -4 L-9 -12 M0 -4 L9 -12 M0 -4 L-8 5 M0 -4 L8 5" stroke="#1a140e" strokeWidth={2.4} />
          <path d="M0 -4 L-9 -12 M0 -4 L9 -12 M0 -4 L-8 5 M0 -4 L8 5" stroke={color} strokeWidth={1.2} />
        </g>
      );
    case 'armory': // fortin
      return (
        <g>
          <path d="M-9 10 V-4 H-6 V-7 H-3 V-4 H3 V-7 H6 V-4 H9 V10 Z" {...st} />
          <rect x={-2} y={3} width={4} height={7} fill="#1a140e" />
        </g>
      );
  }
}

/** Jetons de ressources. */
export function ResourcePiece({ r }: { r: Resource }) {
  switch (r) {
    case 'food': // sac de grain
      return <path d="M-5 6 Q-7 -1 -3 -4 L-4 -6 H4 L3 -4 Q7 -1 5 6 Z" fill="#e3c35c" stroke="#5e4a1e" strokeWidth={1} />;
    case 'wood': // rondin
      return (
        <g>
          <rect x={-7} y={-3.5} width={12} height={7} rx={3.5} fill="#8a5a2e" stroke="#3b2414" strokeWidth={1} />
          <ellipse cx={5} cy={0} rx={2.4} ry={3.5} fill="#c9925a" stroke="#3b2414" strokeWidth={0.8} />
        </g>
      );
    case 'metal': // lingot
      return <path d="M-7 4 L-4 -4 H4 L7 4 Z" fill="#b8c0c6" stroke="#3a4248" strokeWidth={1} />;
    case 'oil': // baril
      return (
        <g>
          <rect x={-4.5} y={-6} width={9} height={12} rx={2} fill="#262321" stroke="#000" strokeWidth={1} />
          <path d="M-4.5 -2 H4.5 M-4.5 2 H4.5" stroke="#8a7a5a" strokeWidth={0.9} />
        </g>
      );
  }
}

/** Jeton rencontre : rose des vents verte. */
export function EncounterToken() {
  return (
    <g>
      <circle r={8} fill="#4d7d3a" stroke="#e8ddb8" strokeWidth={1.6} />
      <path d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z" fill="#f1e9c8" />
    </g>
  );
}

/** Entrée de tunnel. */
export function TunnelMark() {
  return (
    <g>
      <path d="M-9 6 V0 A9 9 0 0 1 9 0 V6 Z" fill="#6d5a44" stroke="#2a2018" strokeWidth={1.2} />
      <path d="M-5.5 6 V1 A5.5 5.5 0 0 1 5.5 1 V6 Z" fill="#120d08" />
      <path d="M-9 0 L-5.5 1 M9 0 L5.5 1 M0 -9 V-5.5" stroke="#2a2018" strokeWidth={0.8} />
    </g>
  );
}

/** Rose des vents décorative. */
export function Compass() {
  return (
    <g opacity={0.55}>
      <circle r={24} fill="none" stroke="#5a4426" strokeWidth={1} />
      <circle r={19} fill="none" stroke="#5a4426" strokeWidth={0.6} strokeDasharray="2 2" />
      <path d="M0 -30 L4 -4 L30 0 L4 4 L0 30 L-4 4 L-30 0 L-4 -4 Z" fill="#5a4426" />
      <path d="M0 -30 L4 -4 L0 0 Z M30 0 L4 4 L0 0 Z M0 30 L-4 4 L0 0 Z M-30 0 L-4 -4 L0 0 Z" fill="#c8ad78" />
      <text y={-34} textAnchor="middle" className="compass-n">
        N
      </text>
    </g>
  );
}
