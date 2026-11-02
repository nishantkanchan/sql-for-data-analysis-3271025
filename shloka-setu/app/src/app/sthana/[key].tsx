import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { Badge, Chip, Empty, Header, Row, T } from '@/components/ui';
import { getSthana, getText } from '@/content';
import { useI18n, usePalette } from '@/hooks';
import { useStore } from '@/state/store';
import { radius, space } from '@/theme';

export default function SthanaScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const [code, sthanaKey] = String(key).split('.');
  const p = usePalette();
  const { t, pick } = useI18n();
  const { data } = useStore();
  const text = getText(code);
  const sthana = getSthana(code, sthanaKey);
  const hasTranslated = !!sthana?.chapters.some((c) => c.translated);
  const [onlyTr, setOnlyTr] = useState(false);
  if (!text || !sthana) return <Empty title={t('empty')} />;
  const chapters = onlyTr ? sthana.chapters.filter((c) => c.translated) : sthana.chapters;

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Header title={sthana.iast} subtitle={`${text.title} · ${sthana.devanagari}`} />
      <FlatList
        data={chapters}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={
          hasTranslated ? (
            <Row style={{ marginBottom: space.sm }}>
              <Chip label={t('onlyTranslated')} icon="checkmark-circle-outline" selected={onlyTr} onPress={() => setOnlyTr(!onlyTr)} />
            </Row>
          ) : null
        }
        renderItem={({ item: c }) => {
          const studied = Object.keys(data.studied).filter((id) => id.startsWith(c.id + '.')).length;
          const title = c.title_en || c.title_hi ? pick(c.title_en, c.title_hi) : null;
          return (
            <Pressable
              testID={`chapter-${c.id}`}
              onPress={() => router.push({ pathname: '/chapter/[id]', params: { id: c.id } })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                padding: space.md,
                minHeight: 64,
                borderRadius: radius.md,
                backgroundColor: p.surface,
                borderWidth: 1,
                borderColor: c.translated ? p.border : p.border,
                opacity: pressed ? 0.85 : 1,
              })}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c.translated ? p.accentSoft : p.surfaceAlt,
                }}>
                <T variant="heading" style={{ fontSize: 15 }}>
                  {c.chapter}
                </T>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="body" numberOfLines={1} style={{ fontWeight: '600' }}>
                  {c.title_iast ?? `${t('chapter')} ${c.chapter}`}
                </T>
                {title ? (
                  <T variant="caption" muted numberOfLines={2}>
                    {title}
                  </T>
                ) : null}
                <Row gap={6} style={{ marginTop: 2 }}>
                  {c.translated ? <Badge tone="success" label={t('translatedBadge')} /> : <Badge label={t('sanskritOnly')} />}
                  <T variant="caption" muted>
                    {c.verse_count} {t('verses')}
                    {studied ? ` · ${studied} ✓` : ''}
                  </T>
                </Row>
              </View>
              <Ionicons name="chevron-forward" size={18} color={p.textFaint} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}
