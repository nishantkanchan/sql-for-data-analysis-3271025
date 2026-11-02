/**
 * App state: settings, reading progress, bookmarks, quiz stats and SRS cards.
 * One React context, persisted to AsyncStorage (debounced).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { dayKey } from '../lib/dates';
import { newCard, review, type CardState, type Grade } from '../lib/srs';

export type Lang = 'en' | 'hi' | 'both';
export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  onboarded: boolean;
  lang: Lang;
  year: 1 | 2 | 3;
  dailyGoal: number;
  apiUrl: string;
  theme: ThemePref;
  showIast: boolean;
}

export interface SubjectStats {
  answered: number;
  correct: number;
}

export interface AppData {
  settings: Settings;
  studied: Record<string, number>;
  lastVerse: { id: string; at: number } | null;
  activeDays: Record<string, number>;
  quiz: Record<string, SubjectStats>;
  mistakes: string[];
  bookmarks: string[];
  srs: Record<string, CardState>;
  newToday: { day: string; count: number };
  reviewsTotal: number;
}

export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8787';

export const defaultData: AppData = {
  settings: {
    onboarded: false,
    lang: 'both',
    year: 1,
    dailyGoal: 20,
    apiUrl: DEFAULT_API_URL,
    theme: 'system',
    showIast: false,
  },
  studied: {},
  lastVerse: null,
  activeDays: {},
  quiz: {},
  mistakes: [],
  bookmarks: [],
  srs: {},
  newToday: { day: '', count: 0 },
  reviewsTotal: 0,
};

const STORAGE_KEY = 'shloka-setu/v1';

interface Store {
  data: AppData;
  hydrated: boolean;
  setSettings: (patch: Partial<Settings>) => void;
  markStudied: (verseId: string) => void;
  toggleBookmark: (verseId: string) => void;
  recordQuiz: (subjectId: string, total: number, correct: number, mistakes: string[], fixed: string[]) => void;
  reviewCard: (cardId: string, grade: Grade) => void;
  resetProgress: () => void;
  todayCount: number;
  newAllowance: number;
}

const Ctx = createContext<Store | null>(null);

function bumpDay(days: Record<string, number>, n = 1): Record<string, number> {
  const k = dayKey();
  return { ...days, [k]: (days[k] ?? 0) + n };
}

function merge(stored: Partial<AppData> | null): AppData {
  if (!stored) return defaultData;
  return {
    ...defaultData,
    ...stored,
    settings: { ...defaultData.settings, ...(stored.settings ?? {}) },
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(defaultData);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (alive && raw) setData(merge(JSON.parse(raw)));
      } catch {
        // corrupted or unavailable storage: start fresh
      } finally {
        if (alive) setHydrated(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
    }, 400);
  }, [data, hydrated]);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }, []);

  const markStudied = useCallback((verseId: string) => {
    setData((d) => {
      const first = !d.studied[verseId];
      return {
        ...d,
        studied: first ? { ...d.studied, [verseId]: Date.now() } : d.studied,
        lastVerse: { id: verseId, at: Date.now() },
        activeDays: first ? bumpDay(d.activeDays) : d.activeDays,
      };
    });
  }, []);

  const toggleBookmark = useCallback((verseId: string) => {
    setData((d) => ({
      ...d,
      bookmarks: d.bookmarks.includes(verseId) ? d.bookmarks.filter((b) => b !== verseId) : [verseId, ...d.bookmarks],
    }));
  }, []);

  const recordQuiz = useCallback(
    (subjectId: string, total: number, correct: number, mistakes: string[], fixed: string[]) => {
      setData((d) => {
        const prev = d.quiz[subjectId] ?? { answered: 0, correct: 0 };
        const set = new Set(d.mistakes);
        for (const f of fixed) set.delete(f);
        for (const m of mistakes) set.add(m);
        return {
          ...d,
          quiz: { ...d.quiz, [subjectId]: { answered: prev.answered + total, correct: prev.correct + correct } },
          mistakes: Array.from(set),
          activeDays: bumpDay(d.activeDays, total),
        };
      });
    },
    [],
  );

  const reviewCard = useCallback((cardId: string, grade: Grade) => {
    setData((d) => {
      const now = Date.now();
      const existing = d.srs[cardId];
      const today = dayKey();
      const newToday = d.newToday.day === today ? d.newToday : { day: today, count: 0 };
      return {
        ...d,
        srs: { ...d.srs, [cardId]: review(existing ?? newCard(now), grade, now) },
        newToday: existing ? newToday : { day: today, count: newToday.count + 1 },
        activeDays: bumpDay(d.activeDays),
        reviewsTotal: d.reviewsTotal + 1,
      };
    });
  }, []);

  const resetProgress = useCallback(() => {
    setData((d) => ({ ...defaultData, settings: d.settings }));
  }, []);

  const todayCount = data.activeDays[dayKey()] ?? 0;
  const newAllowance = Math.max(
    0,
    Math.ceil(data.settings.dailyGoal / 2) - (data.newToday.day === dayKey() ? data.newToday.count : 0),
  );

  const value = useMemo<Store>(
    () => ({ data, hydrated, setSettings, markStudied, toggleBookmark, recordQuiz, reviewCard, resetProgress, todayCount, newAllowance }),
    [data, hydrated, setSettings, markStudied, toggleBookmark, recordQuiz, reviewCard, resetProgress, todayCount, newAllowance],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
