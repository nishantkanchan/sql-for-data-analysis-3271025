import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Chip, Empty, Header, Row, Screen, SectionTitle, T } from '@/components/ui';
import { subjectsByProf } from '@/content';
import { useI18n, usePalette } from '@/hooks';
import type { StringKey } from '@/i18n/strings';
import { useStore } from '@/state/store';
import { radius, space } from '@/theme';

export default function QuizHome() {
  const p = usePalette();
  const { t, pick, lang } = useI18n();
  const { data } = useStore();
  const groups = subjectsByProf(`prof${data.settings.year}`);
  const [subject, setSubject] = useState<string | null>(groups[0]?.subjects[0]?.id ?? null);
  const [topic, setTopic] = useState<string | null>(null);
  const [timer, setTimer] = useState(false);

  const profLabel = (prof: string | null): string => (prof && ['prof1', 'prof2', 'prof3'].includes(prof) ? t(prof as StringKey) : t('profOther'));

  if (!groups.length)
    return (
      <Screen header={<Header title={t('quizTitle')} />}>
        <Empty icon="help-circle-outline" title={t('noQuiz')} />
      </Screen>
    );

  return (
    <Screen
      header={<Header title={t('quizTitle')} subtitle={t('chooseSubject')} />}
      footer={
        <View style={{ padding: space.lg, backgroundColor: p.surface, borderTopWidth: 1, borderTopColor: p.border, gap: space.sm }}>
          <Button
            testID="quiz-start"
            kind="accent"
            icon="play"
            label={t('startQuiz')}
            disabled={!subject}
            onPress={() => router.push({ pathname: '/quiz/session', params: { subject: subject!, topic: topic ?? '', timer: timer ? '1' : '0' } })}
          />
        </View>
      }>
      {groups.map((g) => (
        <View key={g.prof ?? 'other'} style={{ gap: space.sm }}>
          <SectionTitle text={profLabel(g.prof)} />
          {g.subjects.map((s) => {
            const sel = subject === s.id;
            const stats = data.quiz[s.id];
            return (
              <View key={s.id} style={{ gap: space.sm }}>
                <Pressable
                  testID={`subject-${s.id}`}
                  onPress={() => {
                    setSubject(s.id);
                    setTopic(null);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    padding: space.md,
                    minHeight: 64,
                    borderRadius: radius.lg,
                    borderWidth: 2,
                    borderColor: sel ? p.accent : p.border,
                    backgroundColor: sel ? p.accentSoft : p.surface,
                    opacity: pressed ? 0.9 : 1,
                  })}>
                  <View style={{ flex: 1 }}>
                    <T variant="heading">{pick(s.name_en, s.name_hi)}</T>
                    {lang === 'both' && s.name_hi !== s.name_en ? (
                      <T variant="caption" muted>
                        {s.name_hi}
                      </T>
                    ) : null}
                    <T variant="caption" muted>
                      {s.id} · {s.count} {t('questions')}
                      {stats ? ` · ${Math.round((stats.correct / Math.max(1, stats.answered)) * 100)}%` : ''}
                    </T>
                  </View>
                  <Ionicons name={sel ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={sel ? p.accent : p.textFaint} />
                </Pressable>
                {sel && s.topics.length > 1 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: space.sm }}>
                    <Chip label={t('allTopics')} selected={topic === null} onPress={() => setTopic(null)} />
                    {s.topics.map((tp) => (
                      <Chip key={tp.id} testID={`topic-${tp.id}`} label={`${pick(tp.name_en, tp.name_hi)} (${tp.count})`} selected={topic === tp.id} onPress={() => setTopic(tp.id)} />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
      <Row>
        <Chip testID="timer-toggle" icon={timer ? 'timer' : 'timer-outline'} label={t('timer')} selected={timer} onPress={() => setTimer(!timer)} />
      </Row>
    </Screen>
  );
}
