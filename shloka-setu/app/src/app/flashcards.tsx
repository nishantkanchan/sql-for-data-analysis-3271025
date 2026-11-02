import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';

import { BiText } from '@/components/verse';
import { AiDraftBadge, Badge, Button, Chip, Empty, Header, Row, Screen, T } from '@/components/ui';
import { verseLabel } from '@/content';
import { cardKind, deckIds, resolveCard, type CardKind, type ResolvedCard } from '@/content/deck';
import { useI18n, usePalette } from '@/hooks';
import type { StringKey } from '@/i18n/strings';
import { buildQueue, formatInterval, newCard, nextIntervals, type Grade } from '@/lib/srs';
import { useStore } from '@/state/store';
import { fonts, radius, space } from '@/theme';

const FILTERS: { value: CardKind | 'all'; label: StringKey }[] = [
  { value: 'all', label: 'allCategories' },
  { value: 'term', label: 'deckTerms' },
  { value: 'verse', label: 'deckVerses' },
  { value: 'question', label: 'deckMistakes' },
];

function Front({ c }: { c: ResolvedCard }) {
  const p = usePalette();
  const { t, pickBoth } = useI18n();
  if (c.kind === 'term')
    return (
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Text style={{ fontFamily: fonts.sanskrit, fontSize: 44, lineHeight: 70, color: p.text, textAlign: 'center' }}>{c.term.devanagari}</Text>
        <T variant="title" muted center style={{ fontStyle: 'italic' }}>
          {c.term.iast}
        </T>
        <T variant="small" muted center>
          {t('recallMeaning')}
        </T>
      </View>
    );
  if (c.kind === 'verse')
    return (
      <View style={{ gap: space.md }}>
        <Text style={{ fontFamily: fonts.sanskrit, fontSize: 22, lineHeight: 38, color: p.text, textAlign: 'center' }}>{c.verse.devanagari}</Text>
        <T variant="caption" muted center>
          {verseLabel(c.verse.id)}
        </T>
      </View>
    );
  const stem = pickBoth(c.question.question_en, c.question.question_hi);
  return (
    <View style={{ gap: space.md }}>
      <T variant="heading" center>
        {stem.primary}
      </T>
      {stem.secondary ? (
        <T variant="small" muted center>
          {stem.secondary}
        </T>
      ) : null}
      {c.question.question_sa ? (
        <Text style={{ fontFamily: fonts.sanskrit, fontSize: 20, lineHeight: 34, color: p.text, textAlign: 'center' }}>{c.question.question_sa}</Text>
      ) : null}
    </View>
  );
}

function Back({ c }: { c: ResolvedCard }) {
  const p = usePalette();
  const { t, pick } = useI18n();
  if (c.kind === 'term')
    return (
      <View style={{ gap: space.md }}>
        <BiText en={c.term.en} hi={c.term.hi} />
        {c.term.modern ? (
          <View style={{ backgroundColor: p.primarySoft, borderRadius: radius.md, padding: space.md, gap: 4 }}>
            <T variant="label" color={p.primary}>
              {t('modernScience')}
            </T>
            <T variant="small">{c.term.modern}</T>
          </View>
        ) : null}
        <AiDraftBadge status={c.term.review_status} />
      </View>
    );
  if (c.kind === 'verse')
    return (
      <View style={{ gap: space.md }}>
        <BiText en={c.verse.english} hi={c.verse.hindi} />
        {c.verse.modern_correlation ? (
          <View style={{ backgroundColor: p.primarySoft, borderRadius: radius.md, padding: space.md, gap: 4 }}>
            <T variant="label" color={p.primary}>
              {t('modernScience')}
            </T>
            <T variant="small">{pick(c.verse.modern_correlation.en, c.verse.modern_correlation.hi)}</T>
          </View>
        ) : null}
        <Pressable onPress={() => router.push({ pathname: '/verse/[id]', params: { id: c.verse.id } })}>
          <T variant="small" color={p.primary} style={{ fontWeight: '600' }}>
            {t('openVerse')} →
          </T>
        </Pressable>
      </View>
    );
  const q = c.question;
  const ans = q.options[q.answer_index];
  return (
    <View style={{ gap: space.md }}>
      <View style={{ backgroundColor: p.successSoft, borderRadius: radius.md, padding: space.md }}>
        <T variant="label" color={p.success}>
          {t('correctAnswer')}
        </T>
        {q.type === 'shloka_completion' ? (
          <Text style={{ fontFamily: fonts.sanskrit, fontSize: 19, lineHeight: 32, color: p.text }}>{ans.hi || ans.en}</Text>
        ) : (
          <T variant="body">{pick(ans.en, ans.hi)}</T>
        )}
      </View>
      <BiText en={q.explanation_en} hi={q.explanation_hi} variant="small" />
    </View>
  );
}

export default function Flashcards() {
  const p = usePalette();
  const { t } = useI18n();
  const { data, reviewCard, newAllowance } = useStore();
  const [filter, setFilter] = useState<CardKind | 'all'>('all');
  const [sessionKey, setSessionKey] = useState(0);
  const [queue, setQueue] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const flip = useRef(new Animated.Value(0)).current;

  const allIds = useMemo(() => deckIds({ bookmarks: data.bookmarks, mistakes: data.mistakes }), [data.bookmarks, data.mistakes]);
  const counts = useMemo(() => {
    const q = buildQueue(allIds, data.srs, { now: Date.now(), newAllowance });
    return { due: q.due.length, fresh: q.fresh.length };
    // counts only refresh when a session starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allIds, sessionKey]);

  // Build the session queue once per filter/session (not on every review).
  useEffect(() => {
    const ids = filter === 'all' ? allIds : allIds.filter((id) => cardKind(id) === filter);
    const q = buildQueue(ids, data.srs, { now: Date.now(), newAllowance });
    setQueue([...q.due, ...q.fresh].filter((id) => resolveCard(id) !== null));
    setPos(0);
    setDone(0);
    setFlipped(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sessionKey]);

  const id = queue[pos];
  const card = id ? resolveCard(id) : null;
  const state = id ? data.srs[id] ?? newCard(Date.now()) : null;
  const iv = state ? nextIntervals(state) : null;

  const show = () => {
    setFlipped(true);
    flip.setValue(0);
    Animated.timing(flip, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start();
  };

  const grade = (g: Grade) => {
    if (!id) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    reviewCard(id, g);
    setDone((d) => d + 1);
    setFlipped(false);
    if (g === 'again') setQueue((q) => [...q, id]);
    setPos((x) => x + 1);
  };

  const GRADE_STYLE: Record<Grade, { bg: string; fg: string; label: StringKey }> = {
    again: { bg: p.dangerSoft, fg: p.danger, label: 'again' },
    hard: { bg: p.surfaceAlt, fg: p.text, label: 'hard' },
    good: { bg: p.successSoft, fg: p.success, label: 'good' },
    easy: { bg: p.primarySoft, fg: p.primary, label: 'easy' },
  };

  const kindLabel: Record<CardKind, StringKey> = { term: 'cardTerm', verse: 'cardVerse', question: 'cardQuestion' };

  return (
    <Screen
      header={<Header title={t('flashTitle')} subtitle={`${counts.due} ${t('due')} · ${counts.fresh} ${t('newCards')}`} />}
      footer={
        card ? (
          <View style={{ padding: space.lg, backgroundColor: p.surface, borderTopWidth: 1, borderTopColor: p.border }}>
            {!flipped ? (
              <Button testID="show-answer" kind="primary" icon="eye-outline" label={t('showAnswer')} onPress={show} />
            ) : (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {(['again', 'hard', 'good', 'easy'] as Grade[]).map((g) => (
                  <Pressable
                    key={g}
                    testID={`grade-${g}`}
                    onPress={() => grade(g)}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      flex: 1,
                      minHeight: 58,
                      borderRadius: radius.md,
                      backgroundColor: GRADE_STYLE[g].bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.8 : 1,
                    })}>
                    <T variant="small" color={GRADE_STYLE[g].fg} style={{ fontWeight: '700' }}>
                      {t(GRADE_STYLE[g].label)}
                    </T>
                    <T variant="caption" color={GRADE_STYLE[g].fg}>
                      {iv ? formatInterval(iv[g]) : ''}
                    </T>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : null
      }>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {FILTERS.map((f) => (
          <Chip key={f.value} testID={`deck-${f.value}`} label={t(f.label)} selected={filter === f.value} onPress={() => setFilter(f.value)} />
        ))}
      </View>

      {card ? (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <Badge tone={card.kind === 'question' ? 'danger' : card.kind === 'verse' ? 'accent' : 'primary'} label={t(kindLabel[card.kind])} />
            <T variant="caption" muted>
              {pos + 1} / {queue.length}
            </T>
          </Row>
          <View
            testID="flashcard"
            style={{
              backgroundColor: p.verseBg,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: p.border,
              padding: space.xl,
              minHeight: 260,
              justifyContent: 'center',
              gap: space.lg,
            }}>
            <Front c={card} />
            {flipped ? (
              <Animated.View style={{ opacity: flip, gap: space.md, transform: [{ translateY: flip.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
                <View style={{ height: 1, backgroundColor: p.border }} />
                <Back c={card} />
              </Animated.View>
            ) : null}
          </View>
        </>
      ) : (
        <Empty
          icon="checkmark-done-outline"
          title={t('allDone')}
          body={`${done ? `${done} ${t('reviewed')}. ` : ''}${t('allDoneBody')}`}
          action={<Button kind="secondary" small icon="refresh" label={t('restart')} onPress={() => setSessionKey((k) => k + 1)} />}
        />
      )}
      <Row style={{ justifyContent: 'center' }}>
        <Ionicons name="information-circle-outline" size={14} color={p.textFaint} />
        <T variant="caption" muted>
          {t('flashIntro')}
        </T>
      </Row>
    </Screen>
  );
}
