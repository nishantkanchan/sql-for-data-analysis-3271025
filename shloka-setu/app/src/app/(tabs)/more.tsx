import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { Logo } from '@/components/Logo';
import { Bi, Card, Divider, ListRow, Row, Screen, T, type IconName } from '@/components/ui';
import { useI18n } from '@/hooks';
import type { StringKey } from '@/i18n/strings';
import { space } from '@/theme';

const ITEMS: { icon: IconName; title: StringKey; sub: StringKey; href: string }[] = [
  { icon: 'book-outline', title: 'glossary', sub: 'glossaryCard', href: '/glossary' },
  { icon: 'chatbubbles-outline', title: 'tutor', sub: 'tutorCard', href: '/tutor' },
  { icon: 'stats-chart-outline', title: 'progress', sub: 'progressCard', href: '/progress' },
  { icon: 'bookmark-outline', title: 'bookmarks', sub: 'bookmarksCard', href: '/bookmarks' },
  { icon: 'settings-outline', title: 'settings', sub: 'settingsCard', href: '/settings' },
];

export default function More() {
  const { t } = useI18n();
  return (
    <Screen>
      <Bi k="moreTitle" variant="display" />
      <Card padded={false}>
        {ITEMS.map((it, i) => (
          <View key={it.href}>
            {i > 0 ? <Divider inset={space.lg + 50} /> : null}
            <ListRow testID={`more-${it.title}`} icon={it.icon} title={t(it.title)} subtitle={t(it.sub)} onPress={() => router.push(it.href as never)} />
          </View>
        ))}
      </Card>
      <Row gap={space.md} style={{ justifyContent: 'center', marginTop: space.lg }}>
        <Logo size={32} />
        <View>
          <T variant="heading">{t('appName')}</T>
          <T variant="caption" muted>
            {t('tagline')}
          </T>
        </View>
      </Row>
    </Screen>
  );
}
