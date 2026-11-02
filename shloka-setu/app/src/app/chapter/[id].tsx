import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { BiText } from '@/components/verse';
import { AiDraftBadge, Badge, Card, Chip, Empty, Header, Row, T } from '@/components/ui';
import { getChapter, getChapterSummary, getText, isTranslated, parseId } from '@/content';
import { useI18n, usePalette } from '@/hooks';
import { useStore } from '@/state/store';
import type { BundleVerse } from '@/types/content';
import { fonts, radius, space } from '@/theme';

function ChapterHeader({ chapterId }: { chapterId: string }) {
  const p = usePalette();
  const { t, lang, pick } = useI18n();
  const ch = getChapter(chapterId)!;
  const summary = getChapterSummary(chapterId);
  const m = ch.meta;
  const [showAllFocus, setShowAllFocus] = useState(false);
  const focus = m ? (lang === 'hi' ? m.exam_focus_hi : m.exam_focus_en) ?? [] : [];
  const focus2 = m && lang === 'both' ? m.exam_focus_hi ?? [] : [];

  return (
    <View style={{ gap: space.lg, marginBottom: space.lg }}>
      <View style={{ alignItems: 'center', gap: 4, paddingVertical: space.sm }}>
        <T variant="label" muted>
          {t('chapter')} {ch.chapter}
        </T>
        {m?.title_devanagari ? (
          <Text style={{ fontFamily: fonts.sanskrit, fontSize: 26, lineHeight: 42, color: p.text, textAlign: 'center' }}>{m.title_devanagari}</Text>
        ) : null}
        <T variant="title" center>
          {m?.title_iast ?? summary?.title_iast ?? `${t('chapter')} ${ch.chapter}`}
        </T>
        {m ? (
          <T variant="small" muted center>
            {pick(m.title_en, m.title_hi)}
          </T>
        ) : null}
        <Row style={{ marginTop: 6 }}>
          <Badge label={`${ch.verses.length} ${t('verses')}`} />
          {m ? <AiDraftBadge status={m.review_status} /> : <Badge label={t('sanskritOnly')} />}
        </Row>
      </View>

      {m ? (
        <>
          <Card>
            <View style={{ gap: space.md }}>
              <T variant="label" muted>
                {t('summary')}
              </T>
              <BiText en={m.summary_en} hi={m.summary_hi} />
            </View>
          </Card>
          {m.key_concepts?.length ? (
            <View style={{ gap: space.sm }}>
              <T variant="label" muted>
                {t('keyConcepts')}
              </T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {m.key_concepts.map((k) => (
                  <Chip key={k} label={k} />
                ))}
              </View>
            </View>
          ) : null}
          {focus.length ? (
            <Card accent>
              <View style={{ gap: space.sm }}>
                <Row>
                  <Ionicons name="ribbon-outline" size={18} color={p.accent} />
                  <T variant="label" muted>
                    {t('examFocus')}
                  </T>
                </Row>
                {(showAllFocus ? focus : focus.slice(0, 3)).map((f, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                    <T variant="body" color={p.accent}>
                      •
                    </T>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T variant="small">{f}</T>
                      {focus2[i] ? (
                        <T variant="small" muted>
                          {focus2[i]}
                        </T>
                      ) : null}
                    </View>
                  </View>
                ))}
                {focus.length > 3 ? (
                  <Pressable onPress={() => setShowAllFocus(!showAllFocus)} style={{ paddingVertical: 6 }}>
                    <T variant="small" color={p.primary} style={{ fontWeight: '600' }}>
                      {showAllFocus ? '−' : `+${focus.length - 3}`}
                    </T>
                  </Pressable>
                ) : null}
              </View>
            </Card>
          ) : null}
        </>
      ) : (
        <Card>
          <Row gap={space.md}>
            <Ionicons name="hourglass-outline" size={20} color={p.textMuted} />
            <T variant="small" muted style={{ flex: 1 }}>
              {t('sanskritOnlyNote')}
            </T>
          </Row>
        </Card>
      )}
      <T variant="label" muted>
        {t('verseList')}
      </T>
    </View>
  );
}

function VerseRow({ v, index, studied }: { v: BundleVerse; index: number; studied: boolean }) {
  const p = usePalette();
  const { pick } = useI18n();
  const first = v.devanagari.split('\n')[0].replace(/[।॥|]\s*$/, '').trim();
  return (
    <Pressable
      testID={`verse-row-${v.id}`}
      onPress={() => router.push({ pathname: '/verse/[id]', params: { id: v.id, i: String(index) } })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: space.md,
        padding: space.md,
        borderRadius: radius.md,
        backgroundColor: p.surface,
        borderWidth: 1,
        borderColor: p.border,
        marginBottom: space.sm,
        opacity: pressed ? 0.85 : 1,
      })}>
      <View style={{ width: 34, alignItems: 'center', paddingTop: 4, gap: 4 }}>
        <T variant="small" muted style={{ fontWeight: '600' }}>
          {v.verse}
        </T>
        {v.importance === 'high' ? <Ionicons name="star" size={13} color={p.accent} /> : null}
        {studied ? <Ionicons name="checkmark-circle" size={13} color={p.success} /> : null}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={2} style={{ fontFamily: fonts.sanskrit, fontSize: 18, lineHeight: 30, color: p.text }}>
          {first}
        </Text>
        {isTranslated(v) ? (
          <T variant="caption" muted numberOfLines={2}>
            {pick(v.english, v.hindi)}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ChapterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chapterId = String(id);
  const p = usePalette();
  const { t } = useI18n();
  const { data } = useStore();
  const ch = getChapter(chapterId);
  const parsed = parseId(chapterId);
  const text = parsed ? getText(parsed.text) : undefined;
  const sthana = text?.sthanas.find((s) => s.key === parsed?.sthana);
  const header = useMemo(() => (ch ? <ChapterHeader chapterId={chapterId} /> : null), [ch, chapterId]);
  if (!ch) return <Empty title={t('empty')} />;
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Header title={`${sthana?.iast ?? ''} ${ch.chapter}`} subtitle={text?.title} />
      <FlatList
        data={ch.verses}
        keyExtractor={(v, i) => `${v.id}-${i}`}
        ListHeaderComponent={header}
        initialNumToRender={12}
        windowSize={7}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        renderItem={({ item, index }) => <VerseRow v={item} index={index} studied={!!data.studied[item.id]} />}
      />
    </View>
  );
}
