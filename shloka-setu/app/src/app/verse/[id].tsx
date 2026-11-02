import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShlokaText, SpeakButton, VerseBody, type MaskMode } from '@/components/verse';
import { AiDraftBadge, Badge, Button, Card, Chip, Empty, Header, IconBtn, Row, Screen, Segmented, T } from '@/components/ui';
import { getText, getVerse, isTranslated, neighbours, parseId } from '@/content';
import { useI18n, usePalette } from '@/hooks';
import type { StringKey } from '@/i18n/strings';
import { useStore } from '@/state/store';
import { radius, space } from '@/theme';

const MODES: { value: MaskMode; label: StringKey }[] = [
  { value: 'full', label: 'memFull' },
  { value: 'some', label: 'memSome' },
  { value: 'most', label: 'memMost' },
  { value: 'first', label: 'memFirst' },
  { value: 'lines', label: 'memLines' },
];

export default function VerseScreen() {
  const params = useLocalSearchParams<{ id: string; i?: string }>();
  const id = String(params.id);
  const idx = params.i !== undefined ? Number(params.i) : undefined;
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { data, markStudied, toggleBookmark, setSettings } = useStore();
  const ref = getVerse(id, idx);
  const [memorise, setMemorise] = useState(false);
  const [mode, setMode] = useState<MaskMode>('full');
  const [lines, setLines] = useState(0);
  const showIast = data.settings.showIast;

  useEffect(() => {
    if (ref) markStudied(ref.verse.id);
    setMemorise(false);
    setMode('full');
    setLines(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, idx]);

  if (!ref)
    return (
      <Screen header={<Header title={id} />}>
        <Empty icon="search-outline" title={t('verseNotFound')} />
      </Screen>
    );

  const v = ref.verse;
  const parsed = parseId(v.id)!;
  const text = getText(parsed.text);
  const sthana = text?.sthanas.find((s) => s.key === parsed.sthana);
  const { prev, next } = neighbours(ref);
  const saved = data.bookmarks.includes(v.id);
  const totalLines = v.devanagari.split('\n').filter((l) => l.trim()).length;
  const go = (n: { id: string; index: number }) => router.replace({ pathname: '/verse/[id]', params: { id: n.id, i: String(n.index) } });

  const footer = (
    <View
      style={{
        flexDirection: 'row',
        gap: space.sm,
        paddingHorizontal: space.lg,
        paddingTop: space.sm,
        paddingBottom: Math.max(insets.bottom, space.sm),
        backgroundColor: p.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: p.border,
      }}>
      <Button testID="verse-prev" kind="secondary" small icon="chevron-back" label={t('previous')} disabled={!prev} onPress={() => prev && go(prev)} style={{ flex: 1 }} />
      <Button testID="verse-next" kind="primary" small label={t('nextVerse')} disabled={!next} onPress={() => next && go(next)} style={{ flex: 1 }} />
    </View>
  );

  return (
    <Screen
      header={
        <Header
          title={v.ref ?? `${sthana?.iast ?? parsed.sthana} ${parsed.chapter}.${v.verse}`}
          subtitle={v.ref ? `${text?.title ?? ''} · ${sthana?.iast ?? ''}` : text?.title}
          right={
            <IconBtn
              testID="bookmark-btn"
              icon={saved ? 'bookmark' : 'bookmark-outline'}
              active={saved}
              label={saved ? t('bookmarked') : t('bookmark')}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                toggleBookmark(v.id);
              }}
            />
          }
        />
      }
      footer={footer}>
      <View
        style={{
          backgroundColor: p.verseBg,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: p.border,
          paddingVertical: space.xl,
          paddingHorizontal: space.lg,
          gap: space.lg,
        }}>
        <View style={{ height: 3, width: 48, borderRadius: 2, backgroundColor: p.accent, alignSelf: 'center', marginTop: -space.sm }} />
        <ShlokaText devanagari={v.devanagari} iast={v.iast} showIast={showIast} mode={memorise ? mode : 'full'} revealedLines={lines} />
        <Row style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <View style={{ width: 170 }}>
            <Segmented
              testIDPrefix="script"
              value={showIast ? 'iast' : 'deva'}
              onChange={(s) => setSettings({ showIast: s === 'iast' })}
              options={[
                { value: 'deva', label: 'देवनागरी' },
                { value: 'iast', label: 'IAST' },
              ]}
            />
          </View>
          <SpeakButton devanagari={v.devanagari} testID="speak-btn" />
          <Pressable
            testID="memorise-btn"
            onPress={() => setMemorise(!memorise)}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              minHeight: 40,
              borderRadius: radius.pill,
              backgroundColor: memorise ? p.primary : p.primarySoft,
            }}>
            <Ionicons name="eye-off-outline" size={17} color={memorise ? p.onPrimary : p.primary} />
            <T variant="small" color={memorise ? p.onPrimary : p.primary} style={{ fontWeight: '600' }}>
              {t('memorise')}
            </T>
          </Pressable>
        </Row>
        <Row style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          {v.importance === 'high' ? <Badge tone="accent" icon="star" label={t('importance_high')} /> : null}
          {isTranslated(v) ? <AiDraftBadge status={v.review_status} /> : null}
        </Row>
      </View>

      {memorise ? (
        <Card testID="memorise-panel">
          <View style={{ gap: space.md }}>
            <T variant="small" muted>
              {t('memoriseHint')}
            </T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {MODES.map((m) => (
                <Chip
                  key={m.value}
                  testID={`mem-${m.value}`}
                  label={t(m.label)}
                  selected={mode === m.value}
                  onPress={() => {
                    setMode(m.value);
                    setLines(0);
                  }}
                />
              ))}
            </View>
            {mode === 'lines' ? (
              <Row>
                <Button
                  small
                  kind="accent"
                  icon="eye-outline"
                  label={lines >= totalLines ? t('done') : t('revealNext')}
                  disabled={lines >= totalLines}
                  onPress={() => setLines(lines + 1)}
                  style={{ flex: 2 }}
                />
                <Button small kind="secondary" icon="refresh" label={t('restart')} onPress={() => setLines(0)} style={{ flex: 1 }} />
              </Row>
            ) : null}
          </View>
        </Card>
      ) : null}

      {isTranslated(v) ? (
        <VerseBody v={v} />
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

      <Button
        testID="ask-tutor"
        kind="secondary"
        icon="chatbubbles-outline"
        label={t('askTutor')}
        onPress={() => router.push({ pathname: '/tutor', params: { verseId: v.id } })}
      />
    </Screen>
  );
}
