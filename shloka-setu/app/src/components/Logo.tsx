import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { usePalette } from '../hooks';

/** Emblem: a bridge arch (setu) rising over palm-leaf manuscript lines, with the sun of knowledge. */
export function Logo({ size = 72 }: { size?: number }) {
  const p = usePalette();
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x="4" y="4" width="92" height="92" rx="26" fill={p.scheme === 'dark' ? '#221E45' : '#2B2870'} />
      <Circle cx="50" cy="40" r="9" fill="#F2B64E" />
      <Path d="M16 66 Q50 18 84 66" stroke="#F2B64E" strokeWidth="6" fill="none" strokeLinecap="round" />
      <Path d="M28 66 V58 M40 66 V50 M60 66 V50 M72 66 V58" stroke="#F2B64E" strokeWidth="3.5" strokeLinecap="round" />
      <Rect x="14" y="70" width="72" height="5" rx="2.5" fill="#FFFBF2" />
      <Rect x="22" y="80" width="56" height="4" rx="2" fill="#FFFBF2" opacity="0.6" />
    </Svg>
  );
}
