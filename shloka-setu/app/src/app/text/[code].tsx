import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { Badge, Card, Empty, Header, ProgressBar, Row, Screen, T } from '@/components/ui';
import { getText } from '@/content';
import { useI18n, usePalette } from '@/hooks';
import { fonts, space } from '@/theme';

export default function TextScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const p = usePalette();
  const { t } = useI18n();
  const text = getText(String(code));
  if (!text)
    return (
      <Screen header={<Header title="" />}>
        <Empty title={t('empty')} />
      </Screen>
    );
  return (
    <Screen header={<Header title={text.title} subtitle={text.title_devanagari} />}>
      {text.sthanas.map((s) => {
        const tr = s.chapters.filter((c) => c.translated).length;
        const verses = s.chapters.reduce((n, c) => n + c.verse_count, 0);
        return (
          <Card key={s.key} testID={`sthana-${s.key}`} onPress={() => router.push({ pathname: '/sthana/[key]', params: { key: `${text.code}.${s.key}` } })}>
            <View style={{ gap: space.sm }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.sanskrit, fontSize: 22, lineHeight: 34, color: p.text }}>{s.devanagari}</Text>
                  <T variant="small" muted>
                    {s.iast}
                  </T>
                </View>
                {tr > 0 ? <Badge tone="success" label={`${tr}/${s.chapters.length} ${t('translated')}`} /> : null}
              </Row>
              <T variant="caption" muted>
                {s.chapters.length} {t('chapters')} · {verses.toLocaleString('en-IN')} {t('verses')}
              </T>
              {tr > 0 ? <ProgressBar value={tr / s.chapters.length} color={p.success} height={4} /> : null}
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
