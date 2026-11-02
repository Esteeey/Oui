import type { ReactNode } from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { STICKERS, type StickerId } from '@qu1z/shared';

/**
 * Pack de stickers originaux de Qu1z : « Kubi », une petite tuile de quiz à antenne,
 * dessinée ici en vectoriel (aucune image ni fournisseur externe).
 */

const INK = '#0E0B1A';

type Eyes = 'round' | 'happy' | 'closed' | 'stars' | 'hearts' | 'wink' | 'up' | 'wide' | 'determined';
type Mouth = 'smile' | 'grin' | 'open' | 'o' | 'flat' | 'wobbly' | 'tongue' | 'laugh';

interface Look {
  body: string;
  eyes: Eyes;
  mouth: Mouth;
  label: string;
  labelColor: string;
  extra?: ReactNode;
  tilt?: number;
}

function Star({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return `${x + Math.cos(a) * rr},${y + Math.sin(a) * rr}`;
  });
  return <Path d={`M${pts.join('L')}Z`} fill={fill} stroke={INK} strokeWidth={2} strokeLinejoin="round" />;
}

function Heart({ x, y, s, fill }: { x: number; y: number; s: number; fill: string }) {
  return (
    <Path
      d={`M${x} ${y + s * 0.9} C ${x - s * 1.4} ${y}, ${x - s * 0.7} ${y - s * 0.9}, ${x} ${y - s * 0.2} C ${x + s * 0.7} ${y - s * 0.9}, ${x + s * 1.4} ${y}, ${x} ${y + s * 0.9} Z`}
      fill={fill}
      stroke={INK}
      strokeWidth={2}
      strokeLinejoin="round"
    />
  );
}

function EyesShape({ kind }: { kind: Eyes }) {
  const L = 46;
  const R = 74;
  const Y = 56;
  switch (kind) {
    case 'happy':
      return (
        <G stroke={INK} strokeWidth={4.5} strokeLinecap="round" fill="none">
          <Path d={`M${L - 7} ${Y + 3} Q ${L} ${Y - 7} ${L + 7} ${Y + 3}`} />
          <Path d={`M${R - 7} ${Y + 3} Q ${R} ${Y - 7} ${R + 7} ${Y + 3}`} />
        </G>
      );
    case 'closed':
      return (
        <G stroke={INK} strokeWidth={4.5} strokeLinecap="round" fill="none">
          <Path d={`M${L - 7} ${Y} Q ${L} ${Y + 6} ${L + 7} ${Y}`} />
          <Path d={`M${R - 7} ${Y} Q ${R} ${Y + 6} ${R + 7} ${Y}`} />
        </G>
      );
    case 'stars':
      return (
        <G>
          <Star x={L} y={Y} r={10} fill="#FFC94A" />
          <Star x={R} y={Y} r={10} fill="#FFC94A" />
        </G>
      );
    case 'hearts':
      return (
        <G>
          <Heart x={L} y={Y} s={8} fill="#FF4D6D" />
          <Heart x={R} y={Y} s={8} fill="#FF4D6D" />
        </G>
      );
    case 'wink':
      return (
        <G>
          <Circle cx={L} cy={Y} r={6.5} fill={INK} />
          <Circle cx={L + 2} cy={Y - 2} r={2} fill="#fff" />
          <Path d={`M${R - 7} ${Y + 1} Q ${R} ${Y - 6} ${R + 7} ${Y + 1}`} stroke={INK} strokeWidth={4.5} strokeLinecap="round" fill="none" />
        </G>
      );
    case 'up':
      return (
        <G>
          <Circle cx={L} cy={Y} r={8} fill="#fff" stroke={INK} strokeWidth={3} />
          <Circle cx={R} cy={Y} r={8} fill="#fff" stroke={INK} strokeWidth={3} />
          <Circle cx={L + 2} cy={Y - 3} r={4} fill={INK} />
          <Circle cx={R + 2} cy={Y - 3} r={4} fill={INK} />
        </G>
      );
    case 'wide':
      return (
        <G>
          <Circle cx={L} cy={Y} r={9} fill="#fff" stroke={INK} strokeWidth={3} />
          <Circle cx={R} cy={Y} r={9} fill="#fff" stroke={INK} strokeWidth={3} />
          <Circle cx={L} cy={Y} r={3.5} fill={INK} />
          <Circle cx={R} cy={Y} r={3.5} fill={INK} />
        </G>
      );
    case 'determined':
      return (
        <G>
          <Path d={`M${L - 9} ${Y - 11} L ${L + 7} ${Y - 6}`} stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <Path d={`M${R + 9} ${Y - 11} L ${R - 7} ${Y - 6}`} stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <Circle cx={L} cy={Y + 1} r={6} fill={INK} />
          <Circle cx={R} cy={Y + 1} r={6} fill={INK} />
          <Circle cx={L + 2} cy={Y - 1} r={1.8} fill="#fff" />
          <Circle cx={R + 2} cy={Y - 1} r={1.8} fill="#fff" />
        </G>
      );
    default:
      return (
        <G>
          <Circle cx={L} cy={Y} r={6.5} fill={INK} />
          <Circle cx={R} cy={Y} r={6.5} fill={INK} />
          <Circle cx={L + 2} cy={Y - 2} r={2} fill="#fff" />
          <Circle cx={R + 2} cy={Y - 2} r={2} fill="#fff" />
        </G>
      );
  }
}

function MouthShape({ kind }: { kind: Mouth }) {
  const Y = 74;
  switch (kind) {
    case 'grin':
      return <Path d={`M48 ${Y - 2} Q60 ${Y + 14} 72 ${Y - 2} Z`} fill={INK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />;
    case 'open':
      return (
        <G>
          <Path d={`M47 ${Y - 3} Q60 ${Y + 18} 73 ${Y - 3} Z`} fill={INK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
          <Path d={`M53 ${Y + 6} Q60 ${Y + 1} 67 ${Y + 6} Q60 ${Y + 11} 53 ${Y + 6}`} fill="#FF7A8A" />
        </G>
      );
    case 'laugh':
      return (
        <G>
          <Path d={`M44 ${Y - 4} Q60 ${Y + 20} 76 ${Y - 4} Z`} fill={INK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
          <Rect x={50} y={Y - 4} width={20} height={5} rx={2} fill="#fff" />
        </G>
      );
    case 'o':
      return <Ellipse cx={60} cy={Y + 2} rx={6} ry={7} fill={INK} />;
    case 'flat':
      return <Path d={`M52 ${Y + 1} L68 ${Y + 1}`} stroke={INK} strokeWidth={4} strokeLinecap="round" />;
    case 'wobbly':
      return <Path d={`M48 ${Y + 2} Q52 ${Y - 3} 56 ${Y + 2} T64 ${Y + 2} T72 ${Y + 2}`} stroke={INK} strokeWidth={4} strokeLinecap="round" fill="none" />;
    case 'tongue':
      return (
        <G>
          <Path d={`M49 ${Y - 1} Q60 ${Y + 9} 71 ${Y - 1}`} stroke={INK} strokeWidth={4} strokeLinecap="round" fill="none" />
          <Path d={`M60 ${Y + 3} Q61 ${Y + 14} 67 ${Y + 11} Q69 ${Y + 6} 66 ${Y + 2}`} fill="#FF7A8A" stroke={INK} strokeWidth={2.5} />
        </G>
      );
    default:
      return <Path d={`M49 ${Y - 1} Q60 ${Y + 10} 71 ${Y - 1}`} stroke={INK} strokeWidth={4.5} strokeLinecap="round" fill="none" />;
  }
}

const LOOKS: Record<StickerId, Look> = {
  gg: {
    body: '#FF6B57',
    eyes: 'happy',
    mouth: 'grin',
    label: 'GG',
    labelColor: '#FFC94A',
    extra: (
      <G>
        <Path d="M8 66 Q2 56 10 50 L18 58 Z" fill="#FF6B57" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <Path d="M112 66 Q118 56 110 50 L102 58 Z" fill="#FF6B57" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      </G>
    ),
  },
  bravo: {
    body: '#3DDC84',
    eyes: 'happy',
    mouth: 'open',
    label: 'BRAVO',
    labelColor: '#FFFFFF',
    extra: (
      <G>
        <Rect x={4} y={44} width={8} height={8} rx={1} fill="#FFC94A" transform="rotate(20 8 48)" />
        <Rect x={106} y={30} width={7} height={7} rx={1} fill="#2BD9C5" transform="rotate(-25 110 34)" />
        <Rect x={104} y={64} width={6} height={6} rx={1} fill="#FF4D6D" transform="rotate(35 107 67)" />
        <Rect x={12} y={18} width={6} height={6} rx={1} fill="#FF6B57" transform="rotate(-15 15 21)" />
      </G>
    ),
  },
  revanche: {
    body: '#2BD9C5',
    eyes: 'determined',
    mouth: 'flat',
    label: 'REVANCHE ?',
    labelColor: '#FF6B57',
    tilt: -4,
  },
  oups: {
    body: '#FFC94A',
    eyes: 'wide',
    mouth: 'wobbly',
    label: 'OUPS',
    labelColor: '#FFFFFF',
    extra: <Path d="M98 30 Q104 40 98 46 Q92 40 98 30 Z" fill="#7FD3FF" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />,
  },
  'en-feu': {
    body: '#FF8A3D',
    eyes: 'determined',
    mouth: 'grin',
    label: 'EN FEU',
    labelColor: '#FFC94A',
    extra: (
      <G>
        <Path d="M30 30 Q24 14 36 4 Q36 16 44 18 Q46 8 54 2 Q56 16 64 14 Q66 6 74 2 Q76 14 84 16 Q90 8 92 4 Q100 18 90 30 Z" fill="#FF4D6D" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <Path d="M42 30 Q40 20 48 14 Q50 22 58 22 Q62 14 68 12 Q70 22 78 22 Q82 18 84 16 Q86 24 80 30 Z" fill="#FFC94A" />
      </G>
    ),
  },
  reflexion: {
    body: '#8C7CFF',
    eyes: 'up',
    mouth: 'o',
    label: 'HMMM…',
    labelColor: '#FFFFFF',
    extra: (
      <G>
        <Circle cx={100} cy={22} r={10} fill="#FFFFFF" stroke={INK} strokeWidth={3} />
        <SvgText x={100} y={28} fontSize={16} fontWeight="900" fill={INK} textAnchor="middle">
          ?
        </SvgText>
        <Circle cx={92} cy={38} r={3} fill="#FFFFFF" stroke={INK} strokeWidth={2} />
      </G>
    ),
  },
  mdr: {
    body: '#FF6B9E',
    eyes: 'closed',
    mouth: 'laugh',
    label: 'MDR',
    labelColor: '#FFFFFF',
    tilt: 6,
    extra: (
      <G>
        <Path d="M30 58 Q24 68 30 72 Q36 68 30 58 Z" fill="#7FD3FF" stroke={INK} strokeWidth={2} />
        <Path d="M90 58 Q84 68 90 72 Q96 68 90 58 Z" fill="#7FD3FF" stroke={INK} strokeWidth={2} />
      </G>
    ),
  },
  champion: {
    body: '#FFC94A',
    eyes: 'stars',
    mouth: 'smile',
    label: 'CHAMPION',
    labelColor: '#FF6B57',
    extra: (
      <Path d="M38 26 L42 8 L52 20 L60 4 L68 20 L78 8 L82 26 Z" fill="#FFE27A" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
    ),
  },
  chrono: {
    body: '#2BD9C5',
    eyes: 'wide',
    mouth: 'o',
    label: 'VITE !',
    labelColor: '#FFC94A',
    extra: (
      <G>
        <Circle cx={100} cy={26} r={14} fill="#FFFFFF" stroke={INK} strokeWidth={3} />
        <Path d="M100 26 L100 17 M100 26 L107 30" stroke={INK} strokeWidth={3} strokeLinecap="round" />
        <Rect x={96} y={7} width={8} height={5} rx={1} fill={INK} />
        <Path d="M4 40 L16 40 M2 50 L14 50 M6 60 L16 60" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      </G>
    ),
  },
  coeur: {
    body: '#FF4D6D',
    eyes: 'hearts',
    mouth: 'smile',
    label: 'MERCI',
    labelColor: '#FFFFFF',
    extra: (
      <G>
        <Heart x={104} y={26} s={7} fill="#FF8FA3" />
        <Heart x={14} y={36} s={5} fill="#FF8FA3" />
      </G>
    ),
  },
  salut: {
    body: '#7FD3FF',
    eyes: 'wink',
    mouth: 'tongue',
    label: 'SALUT',
    labelColor: '#FFFFFF',
    extra: (
      <G>
        <Path d="M104 50 Q116 42 112 30" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />
        <Circle cx={102} cy={58} r={9} fill="#7FD3FF" stroke={INK} strokeWidth={3} />
        <Path d="M112 22 L116 16 M118 30 L124 28" stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
      </G>
    ),
  },
  genie: {
    body: '#B4F05A',
    eyes: 'round',
    mouth: 'grin',
    label: 'GÉNIE',
    labelColor: '#FFC94A',
    extra: (
      <G>
        <Circle cx={100} cy={20} r={11} fill="#FFE27A" stroke={INK} strokeWidth={3} />
        <Rect x={95} y={30} width={10} height={7} rx={2} fill="#9A9AB0" stroke={INK} strokeWidth={2} />
        <Path d="M100 2 L100 -2 M84 10 L80 7 M116 10 L120 7" stroke="#FFC94A" strokeWidth={3} strokeLinecap="round" />
        <Path d="M30 46 L46 46 M74 46 L90 46" stroke={INK} strokeWidth={3} />
        <Rect x={30} y={46} width={18} height={14} rx={6} fill="none" stroke={INK} strokeWidth={3} />
        <Rect x={72} y={46} width={18} height={14} rx={6} fill="none" stroke={INK} strokeWidth={3} />
        <Path d="M48 51 L72 51" stroke={INK} strokeWidth={3} />
      </G>
    ),
  },
};

export function Sticker({ id, size = 120 }: { id: StickerId; size?: number }) {
  const look = LOOKS[id];
  const label = STICKERS.find((s) => s.id === id)?.label ?? '';
  const fontSize = look.label.length > 7 ? 12 : 15;
  return (
    <Svg width={size} height={size} viewBox="-4 -6 128 132" accessibilityLabel={`Sticker ${label}`}>
      <G transform={look.tilt ? `rotate(${look.tilt} 60 60)` : undefined}>
        {/* Ombre */}
        <Ellipse cx={60} cy={108} rx={34} ry={5} fill="#000" opacity={0.25} />
        {/* Contour blanc découpé (lisible sur fond sombre comme clair) */}
        <Path d="M60 26 Q58 16 64 10" stroke="#FFFFFF" strokeWidth={10} strokeLinecap="round" fill="none" />
        <Circle cx={65} cy={9} r={9} fill="#FFFFFF" />
        <Rect x={20} y={24} width={80} height={76} rx={26} fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={12} />
        {/* Antenne */}
        <Path d="M60 26 Q58 16 64 10" stroke={INK} strokeWidth={4} strokeLinecap="round" fill="none" />
        <Circle cx={65} cy={9} r={5} fill={look.labelColor === '#FFFFFF' ? '#FFC94A' : look.labelColor} stroke={INK} strokeWidth={3} />
        {/* Corps : une tuile de quiz arrondie */}
        <Rect x={20} y={24} width={80} height={76} rx={26} fill={look.body} stroke={INK} strokeWidth={4.5} />
        <Path d="M32 34 Q40 28 52 29" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={5} strokeLinecap="round" fill="none" />
        {/* Joues */}
        <Ellipse cx={36} cy={70} rx={6} ry={4} fill="#FFFFFF" opacity={0.35} />
        <Ellipse cx={84} cy={70} rx={6} ry={4} fill="#FFFFFF" opacity={0.35} />
        <EyesShape kind={look.eyes} />
        <MouthShape kind={look.mouth} />
        {look.extra}
      </G>
      {/* Étiquette */}
      <Rect
        x={60 - look.label.length * (fontSize * 0.36) - 10}
        y={98}
        width={look.label.length * fontSize * 0.72 + 20}
        height={22}
        rx={11}
        fill={INK}
        stroke="#FFFFFF"
        strokeWidth={3}
      />
      <SvgText x={60} y={114} fontSize={fontSize} fontWeight="900" fill={look.labelColor} textAnchor="middle" letterSpacing={0.5}>
        {look.label}
      </SvgText>
    </Svg>
  );
}
