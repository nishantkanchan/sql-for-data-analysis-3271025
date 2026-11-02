import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';

import { AiDraftBadge, Button, Card, Chip, Empty, Header, ProgressBar, Row, Screen, T } from '@/components/ui';
import { getQuestions, getQuizSubjects, verseLabel } from '@/content';
import { useI18n, usePalette } from '@/hooks';
import { answer as makeAnswer, buildSession, scoreSession, verdict, type AnswerRecord } from '@/lib/quiz';
import { isVerseId } from '@/lib/search';
import { useStore } from '@/state/store';
import type { QuizQuestion } from '@/types/content';
import { fonts, radius, space } from '@/theme';

const TIME_LIMIT = 45;

function Stem({ q }: { q: QuizQuestion }) {
  const p = usePalette();
  const { pickBoth, t } = useI18n();
  const { primary, secondary } = pickBoth(q.question_en, q.question_hi);
  return (
    <View style={{ gap: space.md }}>
      {q.type === 'shloka_completion' ? (
        <T variant="label" color={p.accent}>
          {t('completeShloka')}
        </T>
      ) : null}
      <T variant="heading" style={{ fontSize: 18, lineHeight: 27 }} testID="question-text">
        {primary}
      </T>
      {secondary ? (
        <T variant="body" muted>
          {secondary}
        </T>
      ) : null}
      {q.question_sa ? (
        <View style={{ backgroundColor: p.verseBg, borderRadius: radius.md, padding: space.md, borderLeftWidth: 3, borderLeftColor: p.accent }}>
          <Text style={{ fontFamily: fonts.sanskrit, fontSize: 21, lineHeight: 36, color: p.text, textAlign: 'center' }}>{q.question_sa}</Text>
        </View>
      ) : null}
    </View>
  );
}

function OptionButton({ q, i, chosen, revealed, onPress }: { q: QuizQuestion; i: number; chosen: number | null; revealed: boolean; onPress: () => void }) {
  const p = usePalette();
  const { pick, lang } = useI18n();
  const o = q.options[i];
  const isAnswer = i === q.answer_index;
  const isChosen = chosen === i;
  let border = p.border;
  let bg = p.surface;
  let icon: React.ComponentProps<typeof Ionicons>['name'] | null = null;
  let iconColor = p.textFaint;
  if (revealed && isAnswer) {
    border = p.success;
    bg = p.successSoft;
    icon = 'checkmark-circle';
    iconColor = p.success;
  } else if (revealed && isChosen) {
    border = p.danger;
    bg = p.dangerSoft;
    icon = 'close-circle';
    iconColor = p.danger;
  }
  const letter = String.fromCharCode(65 + i);
  const sanskrit = q.type === 'shloka_completion';
  return (
    <Pressable
      testID={`option-${i}`}
      disabled={revealed}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md,
        minHeight: 58,
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: border,
        backgroundColor: bg,
        opacity: pressed ? 0.85 : revealed && !isAnswer && !isChosen ? 0.6 : 1,
      })}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: p.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <T variant="small" style={{ fontWeight: '700' }}>
          {letter}
        </T>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {sanskrit ? (
          <>
            <Text style={{ fontFamily: fonts.sanskrit, fontSize: 18, lineHeight: 30, color: p.text }}>{o.hi || o.en}</Text>
            {o.hi && o.en ? (
              <T variant="caption" muted style={{ fontStyle: 'italic' }}>
                {o.en}
              </T>
            ) : null}
          </>
        ) : (
          <>
            <T variant="body">{pick(o.en, o.hi)}</T>
            {lang === 'both' && o.hi && o.hi !== o.en ? (
              <T variant="small" muted>
                {o.hi}
              </T>
            ) : null}
          </>
        )}
      </View>
      {icon ? <Ionicons name={icon} size={24} color={iconColor} /> : null}
    </Pressable>
  );
}

function Reference({ reference }: { reference?: string }) {
  const { t } = useI18n();
  if (!reference) return null;
  if (isVerseId(reference))
    return (
      <Row style={{ flexWrap: 'wrap' }}>
        <T variant="caption" muted>
          {t('reference')}:
        </T>
        <Chip testID="ref-link" icon="link-outline" label={verseLabel(reference)} onPress={() => router.push({ pathname: '/verse/[id]', params: { id: reference } })} />
      </Row>
    );
  return (
    <T variant="caption" muted>
      {t('reference')}: {reference}
    </T>
  );
}

function Feedback({ q, a }: { q: QuizQuestion; a: AnswerRecord }) {
  const p = usePalette();
  const { t, pickBoth } = useI18n();
  const ex = pickBoth(q.explanation_en, q.explanation_hi);
  const ok = a.correct;
  return (
    <View testID="quiz-feedback" style={{ backgroundColor: ok ? p.successSoft : p.dangerSoft, borderRadius: radius.lg, padding: space.lg, gap: space.sm }}>
      <Row>
        <Ionicons name={ok ? 'checkmark-circle' : a.choice === null ? 'timer-outline' : 'alert-circle'} size={22} color={ok ? p.success : p.danger} />
        <T variant="heading" color={ok ? p.success : p.danger}>
          {ok ? t('correct') : a.choice === null ? t('timeUp') : t('incorrect')}
        </T>
      </Row>
      {ex.primary ? <T variant="small">{ex.primary}</T> : null}
      {ex.secondary ? (
        <T variant="small" muted>
          {ex.secondary}
        </T>
      ) : null}
      <Reference reference={q.reference} />
      <AiDraftBadge status={q.review_status} />
    </View>
  );
}

export default function QuizSession() {
  const params = useLocalSearchParams<{ subject: string; topic?: string; timer?: string }>();
  const subjectId = String(params.subject);
  const topicId = params.topic ? String(params.topic) : null;
  const timed = params.timer === '1';
  const p = usePalette();
  const { t, pick, pickBoth } = useI18n();
  const { recordQuiz } = useStore();
  const subject = getQuizSubjects().find((s) => s.id === subjectId);
  const [seed, setSeed] = useState(() => Date.now());
  const questions = useMemo(
    () => buildSession(getQuestions(subjectId), { count: 10, topicId, seed }),
    [subjectId, topicId, seed],
  );
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [phase, setPhase] = useState<'q' | 'results' | 'review'>('q');
  const [left, setLeft] = useState(TIME_LIMIT);
  const startedAt = useRef(Date.now());
  const recorded = useRef(false);
  const fade = useRef(new Animated.Value(1)).current;

  const q = questions[i];
  const current = answers.find((a) => a.questionId === q?.id) ?? null;

  useEffect(() => {
    startedAt.current = Date.now();
    setLeft(TIME_LIMIT);
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [i, seed, fade]);

  useEffect(() => {
    if (!timed || phase !== 'q' || current || !q) return;
    if (left <= 0) {
      setAnswers((as) => [...as, makeAnswer(q, null, TIME_LIMIT * 1000)]);
      return;
    }
    const id = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(id);
  }, [timed, phase, current, left, q]);

  const score = useMemo(() => scoreSession(questions, answers), [questions, answers]);

  useEffect(() => {
    if (phase === 'results' && !recorded.current) {
      recorded.current = true;
      const fixed = questions.filter((x) => !score.mistakes.includes(x.id)).map((x) => x.id);
      recordQuiz(subjectId, score.total, score.correct, score.mistakes, fixed);
    }
  }, [phase, questions, score, recordQuiz, subjectId]);

  if (!q && phase === 'q')
    return (
      <Screen header={<Header title={t('quizTitle')} />}>
        <Empty icon="help-circle-outline" title={t('noQuiz')} />
      </Screen>
    );

  const title = subject ? pick(subject.name_en, subject.name_hi) : subjectId;

  if (phase === 'results' || phase === 'review') {
    const v = verdict(score.percent);
    const wrong = questions.filter((x) => score.mistakes.includes(x.id));
    return (
      <Screen header={<Header title={t('results')} subtitle={title} />}>
        {phase === 'results' ? (
          <>
            <View testID="quiz-results" style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.lg }}>
              <View style={{ width: 132, height: 132, borderRadius: 66, borderWidth: 10, borderColor: score.percent >= 70 ? p.success : score.percent >= 50 ? p.accent : p.danger, alignItems: 'center', justifyContent: 'center', backgroundColor: p.surface }}>
                <T variant="display">{score.percent}%</T>
              </View>
              <T variant="title" center>
                {t(`verdict_${v}`)}
              </T>
              <T variant="body" muted center>
                {score.correct} / {score.total} {t('correct').toLowerCase()}
                {score.averageMs ? ` · ${Math.round(score.averageMs / 1000)} s ${t('avgTime')}` : ''}
              </T>
            </View>
            {score.mistakes.length ? (
              <Card>
                <Row>
                  <Ionicons name="layers-outline" size={18} color={p.accent} />
                  <T variant="small" style={{ flex: 1 }}>
                    {t('mistakesToCards')}
                  </T>
                </Row>
              </Card>
            ) : null}
            {score.mistakes.length ? <Button testID="review-mistakes" kind="primary" icon="eye-outline" label={`${t('reviewMistakes')} (${score.mistakes.length})`} onPress={() => setPhase('review')} /> : null}
            <Button
              testID="quiz-again"
              kind="accent"
              icon="refresh"
              label={t('tryAgain')}
              onPress={() => {
                recorded.current = false;
                setAnswers([]);
                setI(0);
                setPhase('q');
                setSeed(Date.now());
              }}
            />
            <Button kind="secondary" icon="list-outline" label={t('backToSubjects')} onPress={() => router.back()} />
          </>
        ) : (
          <>
            {wrong.map((x, n) => {
              const a = answers.find((y) => y.questionId === x.id);
              const stem = pickBoth(x.question_en, x.question_hi);
              return (
                <Card key={x.id}>
                  <View style={{ gap: space.sm }}>
                    <T variant="label" muted>
                      {t('question')} {n + 1}
                    </T>
                    <T variant="heading">{stem.primary}</T>
                    {x.question_sa ? <Text style={{ fontFamily: fonts.sanskrit, fontSize: 18, lineHeight: 30, color: p.text }}>{x.question_sa}</Text> : null}
                    <T variant="small" color={p.danger}>
                      {t('yourAnswer')}: {a?.choice !== null && a?.choice !== undefined ? pick(x.options[a.choice].en, x.options[a.choice].hi) : '—'}
                    </T>
                    <T variant="small" color={p.success}>
                      {t('correctAnswer')}: {pick(x.options[x.answer_index].en, x.options[x.answer_index].hi)}
                    </T>
                    <T variant="small" muted>
                      {pick(x.explanation_en, x.explanation_hi)}
                    </T>
                    <Reference reference={x.reference} />
                  </View>
                </Card>
              );
            })}
            <Button kind="secondary" icon="arrow-back" label={t('results')} onPress={() => setPhase('results')} />
          </>
        )}
      </Screen>
    );
  }

  const choose = (choice: number) => {
    if (current) return;
    const rec = makeAnswer(q, choice, Date.now() - startedAt.current);
    if (Platform.OS !== 'web') Haptics.notificationAsync(rec.correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    setAnswers((as) => [...as, rec]);
  };
  const last = i === questions.length - 1;

  return (
    <Screen
      header={<Header title={title} subtitle={`${t('question')} ${i + 1} ${t('of')} ${questions.length}`} />}
      footer={
        current ? (
          <View style={{ padding: space.lg, backgroundColor: p.surface, borderTopWidth: 1, borderTopColor: p.border }}>
            <Button testID="quiz-next" kind={last ? 'accent' : 'primary'} icon={last ? 'trophy-outline' : 'arrow-forward'} label={last ? t('seeResults') : t('nextQuestion')} onPress={() => (last ? setPhase('results') : setI(i + 1))} />
          </View>
        ) : null
      }>
      <View style={{ gap: space.sm }}>
        <ProgressBar value={(i + (current ? 1 : 0)) / questions.length} />
        {timed && !current ? (
          <Row style={{ justifyContent: 'flex-end' }}>
            <Ionicons name="timer-outline" size={16} color={left <= 10 ? p.danger : p.textMuted} />
            <T variant="small" color={left <= 10 ? p.danger : p.textMuted} testID="quiz-timer">
              {left}s
            </T>
          </Row>
        ) : null}
      </View>
      <Animated.View style={{ opacity: fade, gap: space.lg }}>
        <Stem q={q} />
        <View style={{ gap: space.sm }}>
          {q.options.map((_, k) => (
            <OptionButton key={k} q={q} i={k} chosen={current?.choice ?? null} revealed={!!current} onPress={() => choose(k)} />
          ))}
        </View>
        {current ? <Feedback q={q} a={current} /> : null}
      </Animated.View>
    </Screen>
  );
}
