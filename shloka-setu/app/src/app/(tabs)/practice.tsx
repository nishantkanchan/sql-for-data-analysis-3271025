import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';

import { Badge, Bi, Card, Row, Screen, T, type IconName } from '@/components/ui';
import { getQuizSubjects } from '@/content';
import { deckIds } from '@/content/deck';
import { useI18n, usePalette } from '@/hooks';
import type { StringKey } from '@/i18n/strings';
import { countDue } from '@/lib/srs';
import { useStore } from '@/state/store';
import { radius, space } from '@/theme';

function BigCard({ icon, title, body, badge, onPress, tint, testID }: { icon: IconName; title: StringKey; body: StringKey; badge?: string; onPress: () => void; tint: string; testID: string }) {
  const p = usePalette();
  const { t } = useI18n();
  return (
    <Card onPress={onPress} testID={testID}>
      <Row gap={space.lg} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 56, height: 56, borderRadius: radius.lg, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={28} color={p.scheme === 'dark' ? p.text : p.primary} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Bi k={title} variant="title" />
          <T variant="small" muted>
            {t(body)}
          </T>
          {badge ? <Badge tone="primary" label={badge} /> : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={p.textFaint} style={{ marginTop: 16 }} />
      </Row>
    </Card>
  );
}

export default function Practice() {
  const p = usePalette();
  const { t } = useI18n();
  const { data, newAllowance } = useStore();
  const subjects = getQuizSubjects();
  const qCount = subjects.reduce((n, s) => n + s.count, 0);
  const due = useMemo(
    () => countDue(deckIds({ bookmarks: data.bookmarks, mistakes: data.mistakes }), data.srs, { now: Date.now(), newAllowance }),
    [data.bookmarks, data.mistakes, data.srs, newAllowance],
  );
  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Bi k="practiceTitle" variant="display" />
        <T variant="small" muted>
          {t('practiceIntro')}
        </T>
      </View>
      <BigCard testID="practice-quiz" icon="help-circle-outline" title="quizTitle" body="quizCard" tint={p.primarySoft} badge={`${subjects.length} · ${qCount} ${t('questions')}`} onPress={() => router.push('/quiz')} />
      <BigCard testID="practice-flash" icon="layers-outline" title="flashTitle" body="flashCard" tint={p.accentSoft} badge={`${due} ${t('cardsDue')}`} onPress={() => router.push('/flashcards')} />
      <BigCard testID="practice-glossary" icon="book-outline" title="glossaryTitle" body="glossaryCard" tint={p.successSoft} onPress={() => router.push('/glossary')} />
    </Screen>
  );
}
