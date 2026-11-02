import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { findGlossaryTerm } from '../content';
import { useI18n, usePalette } from '../hooks';
import type { Bilingual, WordMeaning } from '../types/content';
import { fonts, radius, space } from '../theme';
import { AiDraftBadge, Card, Chip, Row, Segmented, T } from './ui';

export type MaskMode = 'full' | 'some' | 'most' | 'first' | 'lines';

const MARKS = /[ऀ-ःऺ-ॏ॑-ॗॢॣ]/;
const PUNCT = /^[।॥|\d०-९()\[\]\-–—.,;:'"\u00A0]+$/;

/** First akṣara of a Devanagari (or Latin) word, for "first letters" memorisation. */
export function firstAkshara(word: string): string {
  const chars = Array.from(word);
  if (chars.length === 0) return '';
  let out = chars[0];
  for (let i = 1; i < chars.length; i++) {
    const c = chars[i];
    const prev = chars[i - 1];
    if (MARKS.test(c) || prev === '्') out += c;
    else break;
  }
  return out;
}

export function cleanForSpeech(devanagari: string): string {
  return devanagari.replace(/[॥।|]/g, ' ').replace(/[०-९\d]+/g, ' ').replace(/\s+/g, ' ').trim();
}

interface ShlokaProps {
  devanagari: string;
  iast: string;
  showIast: boolean;
  mode?: MaskMode;
  revealedLines?: number;
  size?: number;
}

export function ShlokaText({ devanagari, iast, showIast, mode = 'full', revealedLines = 0, size = 26 }: ShlokaProps) {
  const p = usePalette();
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  useEffect(() => setRevealed(new Set()), [mode, devanagari]);
  const text = showIast ? iast : devanagari;
  const lines = useMemo(() => text.split('\n').filter((l) => l.trim().length > 0).map(glueMarks), [text]);
  const fontSize = showIast ? Math.round(size * 0.72) : size;
  const lineHeight = Math.round(fontSize * (showIast ? 1.55 : 1.75));

  return (
    <View style={{ gap: 8 }} testID="shloka-text">
      {lines.map((line, li) => {
        const lineHidden = mode === 'lines' && li >= revealedLines;
        const words = line.split(/( +)/);
        let wi = 0;
        return (
          <Text key={li} style={{ fontFamily: fonts.sanskrit, fontSize, lineHeight, color: p.text, textAlign: 'center' }}>
            {words.map((w, k) => {
              if (w.length === 0 || /^ +$/.test(w)) return w;
              const idx = wi++;
              const key = `${li}:${idx}`;
              // split off trailing dandas / verse number so they are never hidden
              const m = /^(.*?)((?:\u00A0)?[।॥|].*)?$/.exec(w)!;
              const core = m[1];
              const tail = m[2] ?? '';
              if (!core || PUNCT.test(core) || revealed.has(key) || mode === 'full' || (mode === 'lines' && !lineHidden)) {
                return <Text key={k}>{w}</Text>;
              }
              const reveal = () => setRevealed((s) => new Set(s).add(key));
              let hide = lineHidden;
              if (!hide && mode === 'some') hide = idx % 3 === 1;
              if (!hide && mode === 'most') hide = idx % 3 !== 0;
              if (hide) {
                return (
                  <Text key={k}>
                    <Text onPress={reveal} style={{ color: 'transparent', backgroundColor: p.surfaceAlt, borderRadius: 6 }}>
                      {core}
                    </Text>
                    {tail}
                  </Text>
                );
              }
              if (mode === 'first') {
                return (
                  <Text key={k}>
                    <Text onPress={reveal} style={{ color: p.textMuted }}>
                      {firstAkshara(core) + '…'}
                    </Text>
                    {tail}
                  </Text>
                );
              }
              return <Text key={k}>{w}</Text>;
            })}
          </Text>
        );
      })}
    </View>
  );
}

/** Keep dandas and "॥ ६ ॥" verse numbers attached to the preceding word so they never wrap alone. */
export function glueMarks(line: string): string {
  return line
    .replace(/ *([।॥|]+) *([०-९\d]+) *([।॥|]+)/g, '\u00A0$1\u00A0$2\u00A0$3')
    .replace(/ +([।॥|]+)/g, '\u00A0$1');
}

export function SpeakButton({ devanagari, testID }: { devanagari: string; testID?: string }) {
  const p = usePalette();
  const { t } = useI18n();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => void Speech.stop(), []);
  const toggle = async () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(cleanForSpeech(devanagari), {
      language: 'hi-IN',
      rate: 0.78,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };
  return (
    <Pressable
      testID={testID}
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={speaking ? t('stop') : t('listen')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        minHeight: 40,
        borderRadius: radius.pill,
        backgroundColor: speaking ? p.accent : p.accentSoft,
        opacity: pressed ? 0.85 : 1,
      })}>
      <Ionicons name={speaking ? 'stop' : 'volume-high-outline'} size={18} color={speaking ? p.onAccent : p.scheme === 'dark' ? p.accent : '#7A4A00'} />
      <T variant="small" color={speaking ? p.onAccent : p.scheme === 'dark' ? p.accent : '#7A4A00'} style={{ fontWeight: '600' }}>
        {speaking ? t('stop') : t('listen')}
      </T>
    </Pressable>
  );
}

export function WordChips({ words }: { words: WordMeaning[] }) {
  const p = usePalette();
  const { t, lang } = useI18n();
  const [sel, setSel] = useState<number | null>(null);
  if (!words.length) return null;
  const w = sel !== null ? words[sel] : null;
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {words.map((wm, i) => {
          const on = sel === i;
          return (
            <Pressable
              key={i}
              testID={`word-chip-${i}`}
              onPress={() => setSel(on ? null : i)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 6,
                minHeight: 40,
                justifyContent: 'center',
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: on ? p.accent : p.border,
                backgroundColor: on ? p.accentSoft : p.verseBg,
                opacity: pressed ? 0.8 : 1,
              })}>
              <Text style={{ fontFamily: fonts.sanskrit, fontSize: 18, lineHeight: 28, color: p.text }}>{wm.sa}</Text>
            </Pressable>
          );
        })}
      </View>
      {w ? (
        <View testID="word-meaning" style={{ backgroundColor: p.accentSoft, borderRadius: radius.md, padding: space.md, gap: 4 }}>
          <Row style={{ flexWrap: 'wrap' }}>
            <Text style={{ fontFamily: fonts.sanskrit, fontSize: 20, lineHeight: 30, color: p.text }}>{w.sa}</Text>
            <T variant="small" muted style={{ fontStyle: 'italic' }}>
              {w.iast}
            </T>
          </Row>
          {lang !== 'hi' ? <T variant="body">{w.en}</T> : null}
          {lang !== 'en' ? <T variant="body">{w.hi}</T> : null}
        </View>
      ) : (
        <T variant="caption" muted>
          {t('tapWord')}
        </T>
      )}
    </View>
  );
}

export function TranslationTabs({ english, hindi }: { english?: string; hindi?: string }) {
  const p = usePalette();
  const { t, primary } = useI18n();
  const [tab, setTab] = useState<'en' | 'hi'>(primary);
  useEffect(() => setTab(primary), [primary]);
  if (!english && !hindi) return null;
  const text = tab === 'en' ? english || hindi : hindi || english;
  return (
    <View style={{ gap: space.md }}>
      <Segmented
        testIDPrefix="tr-tab"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'en', label: t('english') },
          { value: 'hi', label: t('hindi') },
        ]}
      />
      <T variant="body" style={{ fontSize: 17, lineHeight: tab === 'hi' ? 30 : 27, color: p.text }} testID="translation-text">
        {text}
      </T>
    </View>
  );
}

export function BiText({ en, hi, variant = 'body' }: { en?: string | null; hi?: string | null; variant?: 'body' | 'small' }) {
  const { pickBoth } = useI18n();
  const { primary, secondary } = pickBoth(en, hi);
  if (!primary) return null;
  return (
    <View style={{ gap: 6 }}>
      <T variant={variant}>{primary}</T>
      {secondary ? (
        <T variant={variant} muted>
          {secondary}
        </T>
      ) : null}
    </View>
  );
}

export function ModernCard({ mc }: { mc: Bilingual | null | undefined }) {
  const p = usePalette();
  const { t } = useI18n();
  if (!mc || (!mc.en && !mc.hi)) return null;
  return (
    <View
      testID="modern-card"
      style={{ backgroundColor: p.primarySoft, borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderLeftWidth: 4, borderLeftColor: p.primary }}>
      <Row>
        <Ionicons name="flask-outline" size={18} color={p.primary} />
        <T variant="heading" color={p.primary}>
          {t('modernScience')}
        </T>
      </Row>
      <BiText en={mc.en} hi={mc.hi} />
      <T variant="caption" muted style={{ fontStyle: 'italic' }}>
        {t('modernNote')}
      </T>
    </View>
  );
}

export function KeyTerms({ terms }: { terms: string[] }) {
  const p = usePalette();
  if (!terms.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {terms.map((k) => {
        const g = findGlossaryTerm(k);
        return (
          <Chip
            key={k}
            label={g ? `${k} · ${g.devanagari}` : k}
            icon={g ? 'book-outline' : undefined}
            onPress={g ? () => router.push({ pathname: '/glossary/[id]', params: { id: g.id } }) : undefined}
            style={!g ? { borderStyle: 'dashed', backgroundColor: p.bg } : undefined}
          />
        );
      })}
    </View>
  );
}

/** Everything below the Sanskrit: shared by verse detail and scan results. */
export interface VerseContent {
  word_meanings?: WordMeaning[];
  english?: string;
  hindi?: string;
  explanation_en?: string;
  explanation_hi?: string;
  modern_correlation?: Bilingual | null;
  key_terms?: string[];
  mnemonic?: string;
  anvaya?: string;
  review_status?: string;
}

export function VerseBody({ v }: { v: VerseContent }) {
  const { t } = useI18n();
  const hasExpl = !!(v.explanation_en || v.explanation_hi);
  return (
    <View style={{ gap: space.lg }}>
      {v.word_meanings && v.word_meanings.length > 0 ? (
        <Card>
          <View style={{ gap: space.md }}>
            <T variant="label" muted>
              {t('wordMeanings')}
            </T>
            <WordChips words={v.word_meanings} />
          </View>
        </Card>
      ) : null}
      {v.english || v.hindi ? (
        <Card>
          <View style={{ gap: space.md }}>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <T variant="label" muted>
                {t('translation')}
              </T>
              <AiDraftBadge status={v.review_status} />
            </Row>
            <TranslationTabs english={v.english} hindi={v.hindi} />
          </View>
        </Card>
      ) : null}
      {hasExpl ? (
        <Card>
          <View style={{ gap: space.md }}>
            <T variant="label" muted>
              {t('explanation')}
            </T>
            <BiText en={v.explanation_en} hi={v.explanation_hi} />
          </View>
        </Card>
      ) : null}
      {v.mnemonic ? (
        <Card accent>
          <View style={{ gap: 6 }}>
            <T variant="label" muted>
              {t('mnemonic')}
            </T>
            <T variant="body">{v.mnemonic}</T>
          </View>
        </Card>
      ) : null}
      <ModernCard mc={v.modern_correlation} />
      {v.key_terms && v.key_terms.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <T variant="label" muted>
            {t('keyTerms')}
          </T>
          <KeyTerms terms={v.key_terms} />
        </View>
      ) : null}
      {v.anvaya ? (
        <View style={{ gap: 4 }}>
          <T variant="label" muted>
            {t('anvaya')}
          </T>
          <T variant="small" muted style={{ fontStyle: 'italic' }}>
            {v.anvaya}
          </T>
        </View>
      ) : null}
    </View>
  );
}
