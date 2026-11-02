import { useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { strings, type StringKey } from './i18n/strings';
import { useStore, type Lang } from './state/store';
import { dark, light, type Palette } from './theme';

export function usePalette(): Palette {
  const system = useColorScheme();
  const { data } = useStore();
  const pref = data.settings.theme;
  const scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  return scheme === 'dark' ? dark : light;
}

export interface I18n {
  lang: Lang;
  /** UI string in the primary language (English when "both"). */
  t: (k: StringKey) => string;
  /** Secondary-language UI string when "both", else null. */
  t2: (k: StringKey) => string | null;
  /** Pick content text by language preference with fallback. */
  pick: (en?: string | null, hi?: string | null) => string;
  /** Content in both languages when "both", else the chosen one. */
  pickBoth: (en?: string | null, hi?: string | null) => { primary: string; secondary: string | null };
  primary: 'en' | 'hi';
}

export function useI18n(): I18n {
  const { data } = useStore();
  const lang = data.settings.lang;
  const primary: 'en' | 'hi' = lang === 'hi' ? 'hi' : 'en';
  const t = useCallback((k: StringKey) => strings[k][primary], [primary]);
  const t2 = useCallback((k: StringKey) => (lang === 'both' ? strings[k].hi : null), [lang]);
  const pick = useCallback(
    (en?: string | null, hi?: string | null) => (primary === 'hi' ? hi || en || '' : en || hi || ''),
    [primary],
  );
  const pickBoth = useCallback(
    (en?: string | null, hi?: string | null) => {
      if (lang === 'both') return { primary: en || hi || '', secondary: en && hi ? hi : null };
      return { primary: pick(en, hi), secondary: null };
    },
    [lang, pick],
  );
  return useMemo(() => ({ lang, t, t2, pick, pickBoth, primary }), [lang, t, t2, pick, pickBoth, primary]);
}
