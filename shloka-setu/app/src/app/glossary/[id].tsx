import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { SpeakButton } from '@/components/verse';
import { AiDraftBadge, Badge, Card, Chip, Empty, Header, Row, Screen, T } from '@/components/ui';
import { getGlossaryTerm, getVerse, verseLabel } from '@/content';
import { useI18n, usePalette } from '@/hooks';
import { isVerseId } from '@/lib/search';
import { fonts, radius, space } from '@/theme';
import { CATEGORY_LABELS } from '@/content/labels';

export default function TermScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = usePalette();
  const { t, pick, lang } = useI18n();
  const term = getGlossaryTerm(String(id));
  if (!term)
    return (
      <Screen header={<Header title={t('glossaryTitle')} />}>
        <Empty title={t('noGlossary')} />
      </Screen>
    );
  const related = (term.related ?? []).map((r) => getGlossaryTerm(r)).filter((x): x is NonNullable<typeof x> => !!x);
  const cat = CATEGORY_LABELS[term.category];
  return (
    <Screen header={<Header title={term.simple || term.iast} subtitle={t('glossaryTitle')} />}>
      <View style={{ backgroundColor: p.verseBg, borderRadius: radius.xl, borderWidth: 1, borderColor: p.border, padding: space.xl, alignItems: 'center', gap: space.sm }}>
        <Text testID="term-devanagari" style={{ fontFamily: fonts.sanskrit, fontSize: 46, lineHeight: 74, color: p.text, textAlign: 'center' }}>
          {term.devanagari}
        </Text>
        <T variant="title" muted style={{ fontStyle: 'italic' }} center>
          {term.iast}
        </T>
        <Row style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          <Badge tone="accent" label={cat ? pick(cat.en, cat.hi) : term.category} />
          <SpeakButton devanagari={term.devanagari} />
        </Row>
      </View>
      <Card>
        <View style={{ gap: space.md }}>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <T variant="label" muted>
              {t('meaning')}
            </T>
            <AiDraftBadge status={term.review_status} />
          </Row>
          {lang !== 'hi' ? <T variant="body">{term.en}</T> : null}
          {lang !== 'en' ? <T variant="body">{term.hi}</T> : null}
        </View>
      </Card>
      {term.modern ? (
        <View style={{ backgroundColor: p.primarySoft, borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderLeftWidth: 4, borderLeftColor: p.primary }}>
          <T variant="heading" color={p.primary}>
            {t('modernScience')}
          </T>
          <T variant="body">{term.modern}</T>
          <T variant="caption" muted style={{ fontStyle: 'italic' }}>
            {t('modernNote')}
          </T>
        </View>
      ) : null}
      {term.source_refs?.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="label" muted>
            {t('sources')}
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {term.source_refs.map((r) =>
              isVerseId(r) && getVerse(r) ? (
                <Chip key={r} icon="link-outline" label={verseLabel(r)} onPress={() => router.push({ pathname: '/verse/[id]', params: { id: r } })} />
              ) : (
                <Badge key={r} label={r} />
              ),
            )}
          </View>
        </View>
      ) : null}
      {related.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="label" muted>
            {t('related')}
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {related.map((r) => (
              <Chip key={r.id} testID={`related-${r.id}`} label={`${r.devanagari} · ${r.simple}`} onPress={() => router.push({ pathname: '/glossary/[id]', params: { id: r.id } })} />
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
