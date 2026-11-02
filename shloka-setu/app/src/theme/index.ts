import { Platform } from 'react-native';

export interface Palette {
  scheme: 'light' | 'dark';
  bg: string;
  surface: string;
  surfaceAlt: string;
  verseBg: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  shadow: string;
  overlay: string;
}

/** Parchment, ink and turmeric. */
export const light: Palette = {
  scheme: 'light',
  bg: '#F6F0E2',
  surface: '#FFFBF2',
  surfaceAlt: '#EFE5CF',
  verseBg: '#FCF6E8',
  text: '#221E3A',
  textMuted: '#635C78',
  textFaint: '#8F889F',
  border: '#E2D5B9',
  primary: '#2B2870',
  primarySoft: '#E4E2F4',
  onPrimary: '#FFFBF2',
  accent: '#D9890F',
  accentSoft: '#F7E3B5',
  onAccent: '#221E3A',
  success: '#2D7A4E',
  successSoft: '#DCEEE1',
  danger: '#B23E37',
  dangerSoft: '#F6DCD8',
  shadow: '#5A4A2A',
  overlay: 'rgba(34,30,58,0.45)',
};

/** Night study: deep indigo ink with warm saffron. */
export const dark: Palette = {
  scheme: 'dark',
  bg: '#13112A',
  surface: '#1C1937',
  surfaceAlt: '#272347',
  verseBg: '#191633',
  text: '#EFE8D8',
  textMuted: '#ABA4C0',
  textFaint: '#7E7898',
  border: '#332E58',
  primary: '#B9B3F5',
  primarySoft: '#2B2756',
  onPrimary: '#13112A',
  accent: '#F2B64E',
  accentSoft: '#3B301C',
  onAccent: '#13112A',
  success: '#71C493',
  successSoft: '#1D3A2A',
  danger: '#EB8E86',
  dangerSoft: '#422325',
  shadow: '#000000',
  overlay: 'rgba(0,0,0,0.6)',
};

export const fonts = {
  /** Shlokas and scholarly headings (serif, Devanagari + Latin with IAST diacritics). */
  sanskrit: 'TiroDevanagariSanskrit_400Regular',
  /** Hindi UI text. */
  hindi: 'NotoSansDevanagari_400Regular',
  hindiBold: 'NotoSansDevanagari_600SemiBold',
  /** Latin UI text: platform font. */
  ui: Platform.select({ web: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', default: undefined }) as
    | string
    | undefined,
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 } as const;

export function cardShadow(p: Palette) {
  return Platform.select({
    android: { elevation: p.scheme === 'dark' ? 0 : 1 },
    default: {
      shadowColor: p.shadow,
      shadowOpacity: p.scheme === 'dark' ? 0 : 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
    },
  });
}

