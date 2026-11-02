import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { Badge, Bi, Card, Row, Screen, T } from '@/components/ui';
import { getTexts } from '@/content';
import { useI18n, usePalette } from '@/hooks';
import { fonts, space } from '@/theme';

const AUTHORS: Record<string, string> = { AH: 'Vāgbhaṭa', CS: 'Agniveśa · Caraka · Dṛḍhabala', SS: 'Suśruta' };

export default function Library() {
  const p = usePalette();
  const { t } = useI18n();
  const texts = getTexts();
  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Bi k="library" variant="display" />
        <T variant="small" muted>
          {t('libraryIntro')}
        </T>
      </View>
      {texts.map((tx) => {
        const chapters = tx.sthanas.reduce((n, s) => n + s.chapters.length, 0);
        return (
          <Card key={tx.code} testID={`text-${tx.code}`} onPress={() => router.push({ pathname: '/text/[code]', params: { code: tx.code } })}>
            <View style={{ gap: space.sm }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.sanskrit, fontSize: 28, lineHeight: 44, color: p.text }}>{tx.title_devanagari}</Text>
                  <T variant="heading">{tx.title}</T>
                  <T variant="caption" muted>
                    {AUTHORS[tx.code] ?? ''}
                  </T>
                </View>
                <Ionicons name="chevron-forward" size={20} color={p.textFaint} style={{ marginTop: 12 }} />
              </Row>
              <Row style={{ flexWrap: 'wrap' }}>
                <Badge label={`${tx.sthanas.length} sthāna`} />
                <Badge label={`${chapters} ${t('chapters')}`} />
                <Badge label={`${tx.verse_count.toLocaleString('en-IN')} ${t('verses')}`} />
                {tx.translated_chapters > 0 ? (
                  <Badge tone="success" icon="checkmark-circle" label={`${tx.translated_chapters} ${t('translated')}`} />
                ) : null}
              </Row>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
