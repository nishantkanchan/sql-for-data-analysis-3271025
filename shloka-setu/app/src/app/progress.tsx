import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { View } from 'react-native';

import { Card, Header, ProgressBar, Row, Screen, SectionTitle, T, type IconName } from '@/components/ui';
import { getQuizSubjects, getTexts } from '@/content';
import { deckIds } from '@/content/deck';
import { useI18n, usePalette } from '@/hooks';
import { addDays, computeStreak, dayKey } from '@/lib/dates';
import { countDue } from '@/lib/srs';
import { useStore } from '@/state/store';
import { radius, space } from '@/theme';

function Stat({ icon, value, label, tint }: { icon: IconName; value: string; label: string; tint: string }) {
  const p = usePalette();
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: p.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: p.border, padding: space.md, gap: 6 }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={p.scheme === 'dark' ? p.text : p.primary} />
      </View>
      <T variant="title">{value}</T>
      <T variant="caption" muted>
        {label}
      </T>
    </View>
  );
}

export default function Progress() {
  const p = usePalette();
  const { t, pick } = useI18n();
  const { data, newAllowance } = useStore();
  const studied = Object.keys(data.studied).length;
  const totalVerses = getTexts().reduce((n, x) => n + x.verse_count, 0);
  const quizTotals = Object.values(data.quiz).reduce((a, s) => ({ answered: a.answered + s.answered, correct: a.correct + s.correct }), { answered: 0, correct: 0 });
  const accuracy = quizTotals.answered ? Math.round((quizTotals.correct / quizTotals.answered) * 100) : null;
  const streak = computeStreak(data.activeDays);
  const due = useMemo(
    () => countDue(deckIds({ bookmarks: data.bookmarks, mistakes: data.mistakes }), data.srs, { now: Date.now(), newAllowance }),
    [data.bookmarks, data.mistakes, data.srs, newAllowance],
  );
  const subjects = getQuizSubjects();

  // 8-week calendar: columns are weeks (oldest left), rows are weekdays.
  const today = new Date();
  const start = addDays(today, -((today.getDay() + 6) % 7) - 7 * 7); // Monday, 7 weeks before this week
  const weeks: string[][] = [];
  for (let w = 0; w < 8; w++) {
    const col: string[] = [];
    for (let d = 0; d < 7; d++) col.push(dayKey(addDays(start, w * 7 + d)));
    weeks.push(col);
  }
  const goal = data.settings.dailyGoal;
  const shade = (n: number) => (n <= 0 ? p.surfaceAlt : n < goal / 3 ? p.accentSoft : n < goal ? '#E9B95A' : p.accent);
  const todayKey = dayKey(today);

  return (
    <Screen header={<Header title={t('progressTitle')} />}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <Stat icon="flame-outline" value={`${streak}`} label={`${t('longest')} (${t('days')})`} tint={p.accentSoft} />
        <Stat icon="book-outline" value={`${studied}`} label={t('versesStudied')} tint={p.primarySoft} />
        <Stat icon="checkmark-done-outline" value={accuracy === null ? '—' : `${accuracy}%`} label={t('quizAccuracy')} tint={p.successSoft} />
        <Stat icon="layers-outline" value={`${due}`} label={t('cardsDue')} tint={p.accentSoft} />
      </View>

      <Card>
        <View style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="label" muted>
              {t('versesStudied')}
            </T>
            <T variant="caption" muted>
              {studied} / {totalVerses.toLocaleString('en-IN')}
            </T>
          </Row>
          <ProgressBar value={studied / Math.max(1, totalVerses)} />
          <T variant="caption" muted>
            {data.reviewsTotal} {t('reviewed')}
          </T>
        </View>
      </Card>

      <SectionTitle text={t('last8Weeks')} />
      <Card testID="streak-calendar">
        <View style={{ flexDirection: 'row', gap: 5, justifyContent: 'center' }}>
          {weeks.map((col, w) => (
            <View key={w} style={{ gap: 5 }}>
              {col.map((k) => (
                <View
                  key={k}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    backgroundColor: k > todayKey ? 'transparent' : shade(data.activeDays[k] ?? 0),
                    borderWidth: k === todayKey ? 2 : 0,
                    borderColor: p.primary,
                  }}
                />
              ))}
            </View>
          ))}
        </View>
      </Card>

      <SectionTitle text={t('bySubject')} />
      <Card>
        {quizTotals.answered === 0 ? (
          <T variant="small" muted>
            {t('noQuizYet')}
          </T>
        ) : (
          <View style={{ gap: space.md }}>
            {subjects
              .filter((s) => data.quiz[s.id])
              .map((s) => {
                const st = data.quiz[s.id];
                const acc = st.correct / Math.max(1, st.answered);
                return (
                  <View key={s.id} style={{ gap: 4 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <T variant="small" style={{ flex: 1 }} numberOfLines={1}>
                        {pick(s.name_en, s.name_hi)}
                      </T>
                      <T variant="small" muted>
                        {Math.round(acc * 100)}% · {st.answered} {t('answered')}
                      </T>
                    </Row>
                    <ProgressBar value={acc} color={acc >= 0.7 ? p.success : acc >= 0.5 ? p.accent : p.danger} />
                  </View>
                );
              })}
          </View>
        )}
      </Card>
    </Screen>
  );
}
