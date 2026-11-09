import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Svg, { ClipPath, Defs, Ellipse, G, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

import type { DecorId } from '@qu1z/shared';

import { AppText } from '@/components/ui';
import { Colors } from '@/constants/theme';

/** Dessin de référence : 554 de large, tout est centré verticalement sur MID. */
const VIEW_WIDTH = 554;
const MID = 68;
const LINE_HEIGHT = 5;
const INK = '#17121F';

const pill = (x0: number, x1: number, h: number) => `M${x0 + h} ${MID - h} H${x1 - h} A${h} ${h} 0 0 1 ${x1 - h} ${MID + h} H${x0 + h} A${h} ${h} 0 0 1 ${x0 + h} ${MID - h} Z`;
const hex = (x0: number, x1: number, h: number, c: number) => `M${x0} ${MID} L${x0 + c} ${MID - h} H${x1 - c} L${x1} ${MID} L${x1 - c} ${MID + h} H${x0 + c} Z`;

function star(cx: number, cy: number, r: number): string {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 ? r * 0.42 : r;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    return `${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  });
  return `M${points.join(' L')} Z`;
}

function Vertical({ id, top, bottom }: { id: string; top: string; bottom: string }) {
  return (
    <SvgGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={top} />
      <Stop offset="1" stopColor={bottom} />
    </SvgGradient>
  );
}

/** Ce qui se répète à droite en miroir. */
const Mirror = ({ children }: { children: ReactNode }) => <G transform={`translate(${VIEW_WIDTH} 0) scale(-1 1)`}>{children}</G>;

/** Reflets obliques aux deux bouts, découpés par la forme. */
function Stripes({ id, d, x0, x1, color }: { id: string; d: string; x0: number; x1: number; color: string }) {
  const top = MID - 34;
  const bottom = MID + 34;
  const slant = 30;
  const band = (x: number, w: number) => `M${x} ${bottom} L${x + slant} ${top} H${x + slant + w} L${x + w} ${bottom} Z`;
  return (
    <>
      <Defs>
        <ClipPath id={id}>
          <Path d={d} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id})`}>
        <Path d={band(x0 - 12, 16)} fill={color} />
        <Path d={band(x0 + 10, 8)} fill={color} />
        <Path d={band(x1 - 48, 8)} fill={color} />
        <Path d={band(x1 - 26, 16)} fill={color} />
      </G>
    </>
  );
}

/** Ailes à trois plumes, posées derrière la plaque ; `shift` les rapproche du centre. */
function Wings({ color, shift }: { color: string; shift: number }) {
  const feathers = (
    <G transform={`translate(${shift} 0)`} fill={color}>
      <Path d={`M75 ${MID - 19} H150 V${MID - 8} H87 Z`} />
      <Path d={`M91 ${MID - 2} H150 V${MID + 9} H102 Z`} />
      <Path d={`M106 ${MID + 15} H150 V${MID + 25} H117 Z`} />
    </G>
  );
  return (
    <>
      {feathers}
      <Mirror>{feathers}</Mirror>
    </>
  );
}

function Crown({ fill, stroke, y }: { fill: string; stroke: string; y: number }) {
  return <Path d={`M246 ${y + 11} L262 ${y + 24} L277 ${y} L292 ${y + 24} L308 ${y + 11} L300 ${y + 35} H254 Z`} fill={fill} stroke={stroke} strokeWidth={3} strokeLinejoin="round" />;
}

/** Feuilles de la branche blanche, de chaque côté de la tige : position et inclinaison. */
const WHITE_LEAVES = [
  [6, 36, -58],
  [1, 25, -22],
  [3, 13, 14],
  [11, 3, 42],
  [20, 36, 62],
  [14, 26, 44],
  [13, 15, 38],
] as const;

function WhiteLaurel({ x }: { x: number }) {
  return (
    <G transform={`translate(${x} ${MID - 24})`}>
      <Path d="M23 47 C 9 40, 3 22, 15 3" stroke={Colors.onAccent} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      {WHITE_LEAVES.map(([cx, cy, angle]) => (
        <Ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx={3.3} ry={7} fill={Colors.onAccent} transform={`rotate(${angle} ${cx} ${cy})`} />
      ))}
    </G>
  );
}

interface Art {
  /** Haut utile du dessin : plus petit pour les décors surmontés d'une couronne. */
  top: number;
  line: string;
  /** Fin du trait gauche et début du trait droit. */
  lineEnds: [number, number];
  textColor: string;
  /** Zone du texte (début, fin). */
  text: [number, number];
  draw: () => ReactNode;
}

const PLAIN_TOP = 32;

const ART: Record<DecorId, Art> = {
  gris: {
    top: PLAIN_TOP, line: '#D6D6DC', lineEnds: [119, 436], textColor: INK, text: [145, 409],
    draw: () => (
      <>
        <Defs><Vertical id="dGris" top="#CFCED5" bottom="#B3B2BB" /></Defs>
        <Path d={pill(129, 425, 28)} fill="url(#dGris)" stroke="#DEDDE3" strokeWidth={3} />
      </>
    ),
  },
  jaune: {
    top: PLAIN_TOP, line: '#F3C418', lineEnds: [119, 436], textColor: INK, text: [145, 409],
    draw: () => (
      <>
        <Defs>
          <SvgGradient id="dJaune" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFCF00" />
            <Stop offset="0.5" stopColor="#FFE04A" />
            <Stop offset="1" stopColor="#FFCF00" />
          </SvgGradient>
        </Defs>
        <Path d={pill(128, 426, 28)} fill="url(#dJaune)" />
      </>
    ),
  },
  vert: {
    top: PLAIN_TOP, line: '#5FE65F', lineEnds: [114, 441], textColor: Colors.onAccent, text: [176, 378],
    draw: () => (
      <>
        <Defs><Vertical id="dVert" top="#2BA640" bottom="#1F8F35" /></Defs>
        <Path d={pill(121, 433, 30)} fill="url(#dVert)" />
        <Stripes id="cVert" d={pill(121, 433, 30)} x0={121} x1={433} color="#55DD5A" />
        <Path d={pill(121, 433, 30)} fill="none" stroke="#5FE65F" strokeWidth={4} />
      </>
    ),
  },
  bleu: {
    top: PLAIN_TOP, line: '#2F95F0', lineEnds: [109, 446], textColor: Colors.onAccent, text: [172, 382],
    draw: () => (
      <>
        <Defs><Vertical id="dBleu" top="#0B62D8" bottom="#0650C0" /></Defs>
        <Path d={hex(117, 438, 30, 27)} fill="url(#dBleu)" />
        <Stripes id="cBleu" d={hex(117, 438, 30, 27)} x0={124} x1={431} color="#5AA6F2" />
        <Path d={hex(117, 438, 30, 27)} fill="none" stroke={Colors.onAccent} strokeWidth={4} strokeLinejoin="round" />
      </>
    ),
  },
  etoiles: {
    top: PLAIN_TOP, line: '#B85CE8', lineEnds: [106, 448], textColor: Colors.onAccent, text: [190, 364],
    draw: () => (
      <>
        <Path d={hex(114, 441, 30, 27)} fill="#6C22BC" stroke="#C65EF2" strokeWidth={4} strokeLinejoin="round" />
        <Path d={star(169, MID, 16)} fill={Colors.onAccent} />
        <Path d={star(385, MID, 16)} fill={Colors.onAccent} />
      </>
    ),
  },
  lauriers: {
    top: PLAIN_TOP, line: '#E62E92', lineEnds: [106, 449], textColor: Colors.onAccent, text: [190, 364],
    draw: () => (
      <>
        <Path d={hex(113, 441, 30, 27)} fill="#A50A5A" stroke="#F0349A" strokeWidth={4} strokeLinejoin="round" />
        <WhiteLaurel x={138} />
        <Mirror><WhiteLaurel x={138} /></Mirror>
      </>
    ),
  },
  'couronne-or': {
    top: 8, line: '#F2B51D', lineEnds: [115, 441], textColor: INK, text: [176, 378],
    draw: () => {
      const tail = <Path d={`M113 ${MID - 13} H180 V${MID + 26} H116 L128 ${MID + 7} Z`} fill="#F2A900" />;
      return (
        <>
          <Defs><Vertical id="dOr" top="#FFCB25" bottom="#FFAE00" /></Defs>
          {tail}
          <Mirror>{tail}</Mirror>
          <Path d={`M168 ${MID - 26} H386 Q400 ${MID - 26} 397 ${MID - 13} L390 ${MID + 16} Q387 ${MID + 26} 376 ${MID + 26} H178 Q167 ${MID + 26} 164 ${MID + 16} L157 ${MID - 13} Q154 ${MID - 26} 168 ${MID - 26} Z`} fill="url(#dOr)" stroke="#D88F00" strokeWidth={2} />
          <Crown y={8} fill="#FFC21A" stroke={INK} />
        </>
      );
    },
  },
  'couronne-rouge': {
    top: 0, line: '#F5203C', lineEnds: [81, 476], textColor: Colors.onAccent, text: [160, 394],
    draw: () => (
      <>
        <Wings color="#F5203C" shift={0} />
        <Path d={hex(126, 428, 30, 24)} fill="#A81028" stroke="#F5203C" strokeWidth={4} strokeLinejoin="round" />
        <Crown y={2} fill={Colors.onAccent} stroke="#F5203C" />
      </>
    ),
  },
  ailes: {
    top: PLAIN_TOP, line: '#B85CE8', lineEnds: [97, 459], textColor: Colors.onAccent, text: [176, 378],
    draw: () => (
      <>
        <Wings color="#B458F2" shift={13} />
        <Path d={hex(146, 409, 30, 24)} fill="#6C22BC" stroke="#C468F2" strokeWidth={4} strokeLinejoin="round" />
      </>
    ),
  },
  diamant: {
    top: 6, line: '#F5C518', lineEnds: [102, 456], textColor: '#FFD21F', text: [180, 374],
    draw: () => (
      <>
        <Wings color="#F5C518" shift={21} />
        <Path d={hex(150, 406, 29, 24)} fill="#0B0F22" stroke="#FFD21F" strokeWidth={4} strokeLinejoin="round" />
        <Path d="M258 9 H296 L308 22 L277 55 L246 22 Z" fill="#F5C518" stroke="#A97F00" strokeWidth={2} strokeLinejoin="round" />
        <Path d="M246 22 H308 M266 9 L260 22 L277 55 L294 22 L288 9 M277 9 L260 22 M277 9 L294 22" fill="none" stroke="#A97F00" strokeWidth={1.5} strokeLinejoin="round" />
      </>
    ),
  },
};

/** Titre du joueur posé sur son décor, avec les traits de chaque côté. */
export function TitleDecor({ decor, label, width }: { decor: DecorId; label: string; width?: number }) {
  const screen = useWindowDimensions().width;
  const w = width ?? Math.min(screen - 32, 330);
  const art = ART[decor];
  const scale = w / VIEW_WIDTH;
  const viewHeight = 104 - art.top;
  const [lineLeft, lineRight] = art.lineEnds;
  const textWidth = (art.text[1] - art.text[0]) * scale;
  // Calculé plutôt que confié à adjustsFontSizeToFit, qui n'existe pas sur le site.
  const fontSize = Math.max(8, Math.min(13, textWidth / (label.length * 0.6)));
  return (
    <View style={{ width: w, height: viewHeight * scale }} accessibilityRole="text" accessibilityLabel={`Titre : ${label}`}>
      <Svg width={w} height={viewHeight * scale} viewBox={`0 ${art.top} ${VIEW_WIDTH} ${viewHeight}`}>
        <Rect x={0} y={MID - LINE_HEIGHT / 2} width={lineLeft} height={LINE_HEIGHT} fill={art.line} />
        <Rect x={lineRight} y={MID - LINE_HEIGHT / 2} width={VIEW_WIDTH - lineRight} height={LINE_HEIGHT} fill={art.line} />
        {art.draw()}
      </Svg>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: art.text[0] * scale, width: textWidth, top: (MID - art.top - 26) * scale, height: 52 * scale, alignItems: 'center', justifyContent: 'center' }}>
        <AppText color={art.textColor} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize, lineHeight: 18, fontWeight: '700' }}>
          {label}
        </AppText>
      </View>
    </View>
  );
}
