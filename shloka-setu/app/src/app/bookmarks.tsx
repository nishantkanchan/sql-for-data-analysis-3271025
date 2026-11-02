import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Empty, Header, Screen, T } from '@/components/ui';
import { getVerse, verseLabel } from '@/content';
import { useI18n, usePalette } from '@/hooks';
import { useStore } from '@/state/store';
import { fonts, radius, space } from '@/theme';

export default function Bookmarks() {
  const p = usePalette();
  const { t, pick } = useI18n();
  const { data } = useStore();
  const refs = data.bookmarks.map((id) => getVerse(id)).filter((r): r is NonNullable<typeof r> => !!r);
  return (
    <Screen header={<Header title={t('bookmarks')} subtitle={`${refs.length}`} />}>
      {refs.length === 0 ? <Empty icon="bookmark-outline" title={t('empty')} body={t('noBookmarks')} /> : null}
      {refs.map((r) => (
        <Pressable
          key={r.verse.id}
          onPress={() => router.push({ pathname: '/verse/[id]', params: { id: r.verse.id } })}
          style={({ pressed }) => ({ padding: space.md, gap: 4, borderRadius: radius.md, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, opacity: pressed ? 0.85 : 1 })}>
          <T variant="caption" muted>
            {verseLabel(r.verse.id)}
          </T>
          <Text numberOfLines={2} style={{ fontFamily: fonts.sanskrit, fontSize: 18, lineHeight: 30, color: p.text }}>
            {r.verse.devanagari.split('\n')[0]}
          </Text>
          {r.verse.english || r.verse.hindi ? (
            <T variant="caption" muted numberOfLines={2}>
              {pick(r.verse.english, r.verse.hindi)}
            </T>
          ) : null}
        </Pressable>
      ))}
      <View />
    </Screen>
  );
}
