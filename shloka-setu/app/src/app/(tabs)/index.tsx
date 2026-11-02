import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Logo } from '@/components/Logo';
import { glueMarks } from '@/components/verse';
import { Card, ProgressBar, Row, Screen, SectionTitle, T, type IconName } from '@/components/ui';
import { verseLabel, getVerse, shlokaOfTheDay, isTranslated } from '@/content';
import { deckIds } from '@/content/deck';
import { useI18n, usePalette } from '@/hooks';
import type { StringKey } from '@/i18n/strings';
import { computeStreak } from '@/lib/dates';
import { countDue } from '@/lib/srs';
import { useStore } from '@/state/store';
import { fonts, radius, space } from '@/theme';

function firstLines(text: string, n = 2) {
  return text.split('\n').slice(0, n).map(glueMarks).join('\n');
}

function QuickAction({ icon, label, onPress, tint, testID }: { icon: IconName; label: string; onPress: () => void; tint: string; testID: string }) {
  const p = usePalette();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexBasis: '47%',
        flexGrow: 1,
        minHeight: 84,
        borderRadius: radius.lg,
        backgroundColor: p.surface,
        borderWidth: 1,
        borderColor: p.border,
        padding: space.md,
        gap: space.sm,
        justifyContent: 'space-between',
        opacity: pressed ? 0.85 : 1,
      })}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={20} color={p.scheme === 'dark' ? p.text : p.primary} />
      </View>
      <T variant="heading" style={{ fontSize: 15 }}>
        {label}
      </T>
    </Pressable>
  );
}

export default function Home() {
  const p = usePalette();
  const { t, pick } = useI18n();
  const { data, todayCount, newAllowance } = useStore();
  const hour = new Date().getHours();
  const greet: StringKey = hour < 12 ? 'greetMorning' : hour < 17 ? 'greetAfternoon' : 'greetEvening';
  const streak = computeStreak(data.activeDays);
  const sotd = useMemo(() => shlokaOfTheDay(), []);
  const last = data.lastVerse ? getVerse(data.lastVerse.id) : null;
  const due = useMemo(
    () => countDue(deckIds({ bookmarks: data.bookmarks, mistakes: data.mistakes }), data.srs, { now: Date.now(), newAllowance }),
    [data.bookmarks, data.mistakes, data.srs, newAllowance],
  );
  const goal = data.settings.dailyGoal;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={space.md} style={{ flex: 1 }}>
          <Logo size={44} />
          <View style={{ flex: 1 }}>
            <T variant="small" muted>
              {t(greet)}
            </T>
            <T variant="title" testID="home-title">
              {t('appName')}
            </T>
          </View>
        </Row>
        <View
          testID="streak-pill"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: p.accentSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill }}>
          <Ionicons name="flame" size={18} color={p.accent} />
          <T variant="heading">{streak}</T>
        </View>
      </Row>

      <Card>
        <View style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="label" muted>
              {t('todayGoal')}
            </T>
            <T variant="small" muted>
              {Math.min(todayCount, goal)} / {goal} · {streak} {t('streak')}
            </T>
          </Row>
          <ProgressBar value={todayCount / goal} />
        </View>
      </Card>

      {sotd ? (
        <Pressable
          testID="sotd-card"
          onPress={() => router.push({ pathname: '/verse/[id]', params: { id: sotd.verse.id } })}
          style={({ pressed }) => ({
            borderRadius: radius.xl,
            backgroundColor: p.scheme === 'dark' ? p.surfaceAlt : p.primary,
            padding: space.xl,
            gap: space.md,
            opacity: pressed ? 0.92 : 1,
            overflow: 'hidden',
          })}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={6}>
              <Ionicons name="sunny" size={16} color="#F2B64E" />
              <T variant="label" color="#F2B64E">
                {t('shlokaOfDay')}
              </T>
            </Row>
            <T variant="caption" color="#D9D4F5">
              {verseLabel(sotd.verse.id)}
            </T>
          </Row>
          <Text style={{ fontFamily: fonts.sanskrit, fontSize: 22, lineHeight: 38, color: '#FFFBF2', textAlign: 'center' }}>
            {firstLines(sotd.verse.devanagari)}
          </Text>
          {isTranslated(sotd.verse) ? (
            <T variant="small" color="#E6E2FA" numberOfLines={3}>
              {pick(sotd.verse.english, sotd.verse.hindi)}
            </T>
          ) : null}
          <Row gap={6} style={{ alignSelf: 'flex-end' }}>
            <T variant="small" color="#F2B64E" style={{ fontWeight: '600' }}>
              {t('readVerse')}
            </T>
            <Ionicons name="arrow-forward" size={16} color="#F2B64E" />
          </Row>
        </Pressable>
      ) : null}

      <Card testID="continue-card" onPress={() => router.push({ pathname: '/verse/[id]', params: { id: last?.verse.id ?? 'AH.sutra.1.1' } })}>
        <Row gap={space.md}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: p.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="book-outline" size={22} color={p.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <T variant="heading">{last ? t('continueReading') : t('startReading')}</T>
            <T variant="caption" muted numberOfLines={1}>
              {last ? verseLabel(last.verse.id) : verseLabel('AH.sutra.1.1')}
            </T>
          </View>
          <Ionicons name="chevron-forward" size={18} color={p.textFaint} />
        </Row>
      </Card>

      <Card testID="due-card" onPress={() => router.push('/flashcards')}>
        <Row gap={space.md}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: p.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="layers-outline" size={22} color={p.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <T variant="heading">
              {due} {t('cardsDue')}
            </T>
            <T variant="caption" muted>
              {t('flashIntro')}
            </T>
          </View>
          <T variant="small" color={p.primary} style={{ fontWeight: '600' }}>
            {t('reviewNow')}
          </T>
        </Row>
      </Card>

      <SectionTitle k="quickActions" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <QuickAction testID="qa-scan" icon="scan-outline" label={t('scan')} tint={p.accentSoft} onPress={() => router.push('/scan')} />
        <QuickAction testID="qa-quiz" icon="help-circle-outline" label={t('quiz')} tint={p.primarySoft} onPress={() => router.push('/quiz')} />
        <QuickAction testID="qa-flash" icon="layers-outline" label={t('flashcards')} tint={p.primarySoft} onPress={() => router.push('/flashcards')} />
        <QuickAction testID="qa-tutor" icon="chatbubbles-outline" label={t('tutor')} tint={p.accentSoft} onPress={() => router.push('/tutor')} />
      </View>
    </Screen>
  );
}
