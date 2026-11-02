import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, Header, Row, T } from '@/components/ui';
import { getVerse, verseLabel } from '@/content';
import { useI18n, usePalette } from '@/hooks';
import type { StringKey } from '@/i18n/strings';
import { ApiError, askTutor } from '@/lib/api';
import { extractVerseIds } from '@/lib/search';
import { useStore } from '@/state/store';
import type { TutorMessage } from '@/types/content';
import { fonts, radius, space } from '@/theme';

interface Msg extends TutorMessage {
  citations?: string[];
  error?: boolean;
}

/** Light markdown clean-up for plain-text rendering. */
function plain(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '').replace(/`/g, '');
}

export default function Tutor() {
  const { verseId } = useLocalSearchParams<{ verseId?: string }>();
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { data } = useStore();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const ctx = verseId ? getVerse(String(verseId)) : null;

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    const next: Msg[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setBusy(true);
    try {
      const history = next.filter((m) => !m.error).map(({ role, content: c }) => ({ role, content: c }));
      const res = await askTutor(data.settings.apiUrl, history, ctx ? ctx.verse.id : undefined);
      const cites = Array.from(new Set([...(res.citations ?? []), ...extractVerseIds(res.reply)])).filter((id) => !!getVerse(id));
      setMessages((m) => [...m, { role: 'assistant', content: res.reply, citations: cites }]);
    } catch (e) {
      const msg = e instanceof ApiError && !e.offline ? `${t('error')}: ${e.message}` : t('tutorOffline');
      setMessages((m) => [...m, { role: 'assistant', content: msg, error: true }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const suggestions: StringKey[] = ctx ? ['tutorSuggest3', 'tutorSuggest1'] : ['tutorSuggest1', 'tutorSuggest2'];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={t('tutorTitle')} subtitle={ctx ? verseLabel(ctx.verse.id) : null} />
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        <View testID="tutor-disclaimer" style={{ flexDirection: 'row', gap: 8, backgroundColor: p.accentSoft, borderRadius: radius.md, padding: space.md }}>
          <Ionicons name="medkit-outline" size={18} color={p.scheme === 'dark' ? p.accent : '#7A4A00'} />
          <T variant="caption" style={{ flex: 1 }}>
            {t('tutorDisclaimer')}
          </T>
        </View>
        {ctx ? (
          <Pressable
            onPress={() => router.push({ pathname: '/verse/[id]', params: { id: ctx.verse.id } })}
            style={{ backgroundColor: p.verseBg, borderRadius: radius.md, borderWidth: 1, borderColor: p.border, padding: space.md, gap: 4 }}>
            <T variant="label" muted>
              {t('tutorAbout')} · {verseLabel(ctx.verse.id)}
            </T>
            <Text numberOfLines={2} style={{ fontFamily: fonts.sanskrit, fontSize: 18, lineHeight: 30, color: p.text }}>
              {ctx.verse.devanagari.split('\n')[0]}
            </Text>
          </Pressable>
        ) : null}
        {messages.length === 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {suggestions.map((k) => (
              <Chip key={k} icon="sparkles-outline" label={t(k)} onPress={() => send(t(k))} />
            ))}
          </View>
        ) : null}
        {messages.map((m, i) => {
          const mine = m.role === 'user';
          return (
            <View key={i} style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 6 }} testID={mine ? undefined : 'tutor-reply'}>
              <View
                style={{
                  maxWidth: '88%',
                  backgroundColor: mine ? p.primary : m.error ? p.dangerSoft : p.surface,
                  borderRadius: radius.lg,
                  borderBottomRightRadius: mine ? 4 : radius.lg,
                  borderBottomLeftRadius: mine ? radius.lg : 4,
                  borderWidth: mine ? 0 : 1,
                  borderColor: p.border,
                  paddingHorizontal: space.md,
                  paddingVertical: space.sm + 2,
                }}>
                <T variant="body" color={mine ? p.onPrimary : m.error ? p.danger : p.text} selectable>
                  {plain(m.content)}
                </T>
              </View>
              {m.citations?.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxWidth: '92%' }}>
                  {m.citations.map((c) => (
                    <Chip key={c} testID={`cite-${c}`} icon="link-outline" label={verseLabel(c)} onPress={() => router.push({ pathname: '/verse/[id]', params: { id: c } })} />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        {busy ? (
          <Row>
            <ActivityIndicator color={p.accent} />
            <T variant="small" muted>
              {t('thinking')}
            </T>
          </Row>
        ) : null}
      </ScrollView>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: space.sm,
          padding: space.md,
          paddingBottom: Math.max(insets.bottom, space.md),
          backgroundColor: p.surface,
          borderTopWidth: 1,
          borderTopColor: p.border,
        }}>
        <TextInput
          testID="tutor-input"
          value={input}
          onChangeText={setInput}
          placeholder={t('tutorPlaceholder')}
          placeholderTextColor={p.textFaint}
          multiline
          style={{
            flex: 1,
            minHeight: 46,
            maxHeight: 120,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: p.border,
            backgroundColor: p.bg,
            color: p.text,
            paddingHorizontal: space.md,
            paddingTop: 12,
            fontSize: 16,
            fontFamily: fonts.hindi,
          }}
        />
        <Pressable
          testID="tutor-send"
          onPress={() => send()}
          disabled={!input.trim() || busy}
          accessibilityRole="button"
          accessibilityLabel={t('send')}
          style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: input.trim() && !busy ? p.accent : p.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="send" size={20} color={input.trim() && !busy ? p.onAccent : p.textFaint} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
