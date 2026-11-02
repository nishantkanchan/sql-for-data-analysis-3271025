import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import React, { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Chip, Empty, Header, T } from '@/components/ui';
import { getGlossary, glossaryCategories, searchGlossary } from '@/content';
import { useI18n, usePalette } from '@/hooks';
import { CATEGORY_LABELS } from '@/content/labels';
import { fonts, radius, space } from '@/theme';


export default function GlossaryScreen() {
  const p = usePalette();
  const { t, pick } = useI18n();
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [cat, setCat] = useState<string | null>(null);
  const cats = useMemo(() => glossaryCategories(), []);
  const results = useMemo(() => searchGlossary(dq, cat), [dq, cat]);
  const total = getGlossary().length;

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Header title={t('glossaryTitle')} subtitle={`${total} ${t('terms')}`} />
      <View style={{ padding: space.lg, paddingBottom: space.sm, gap: space.md, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: radius.md, paddingHorizontal: space.md }}>
          <Ionicons name="search" size={18} color={p.textMuted} />
          <TextInput
            testID="glossary-search"
            value={q}
            onChangeText={setQ}
            placeholder={t('glossarySearch')}
            placeholderTextColor={p.textFaint}
            autoCorrect={false}
            autoCapitalize="none"
            style={{ flex: 1, minHeight: 48, color: p.text, fontSize: 16, fontFamily: fonts.hindi }}
          />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel={t('close')}>
              <Ionicons name="close-circle" size={18} color={p.textFaint} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label={t('allCategories')} selected={cat === null} onPress={() => setCat(null)} />
          {cats.map((c) => (
            <Chip key={c} testID={`cat-${c}`} label={CATEGORY_LABELS[c] ? pick(CATEGORY_LABELS[c].en, CATEGORY_LABELS[c].hi) : c} selected={cat === c} onPress={() => setCat(cat === c ? null : c)} />
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={results}
        keyExtractor={(x) => x.id}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={16}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 48, gap: space.sm, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        ListEmptyComponent={<Empty icon="search-outline" title={t('noGlossary')} />}
        renderItem={({ item }) => (
          <Pressable
            testID={`term-${item.id}`}
            onPress={() => router.push({ pathname: '/glossary/[id]', params: { id: item.id } })}
            style={({ pressed }) => ({
              flexDirection: 'row',
              gap: space.md,
              padding: space.md,
              borderRadius: radius.md,
              backgroundColor: p.surface,
              borderWidth: 1,
              borderColor: p.border,
              opacity: pressed ? 0.85 : 1,
            })}>
            <View style={{ width: 96 }}>
              <Text style={{ fontFamily: fonts.sanskrit, fontSize: 21, lineHeight: 34, color: p.text }} numberOfLines={2}>
                {item.devanagari}
              </Text>
              <T variant="caption" muted style={{ fontStyle: 'italic' }} numberOfLines={1}>
                {item.iast}
              </T>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="caption" color={p.accent} style={{ fontWeight: '600' }}>
                {CATEGORY_LABELS[item.category] ? pick(CATEGORY_LABELS[item.category].en, CATEGORY_LABELS[item.category].hi) : item.category}
              </T>
              <T variant="small" numberOfLines={3}>
                {pick(item.en, item.hi)}
              </T>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
