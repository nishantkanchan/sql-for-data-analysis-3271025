import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native';

import { ShlokaText, SpeakButton, VerseBody } from '@/components/verse';
import { Badge, Bi, Button, Card, Chip, Row, Screen, T } from '@/components/ui';
import { getSearchIndex, getVerse, searchVerses, verseLabel, verseRef } from '@/content';
import { useI18n, usePalette } from '@/hooks';
import { ApiError, explainText, scanImage } from '@/lib/api';
import { devanagariToIast, hasDevanagari, type SearchHit } from '@/lib/search';
import { useStore } from '@/state/store';
import type { ScanResult } from '@/types/content';
import { fonts, radius, space } from '@/theme';

type Phase = 'idle' | 'loading' | 'result' | 'offline' | 'error';

function ScanResultView({ r }: { r: ScanResult }) {
  const p = usePalette();
  const { t } = useI18n();
  const [iast, setIast] = useState(false);
  const matched = r.match?.id ? getVerse(r.match.id) : null;
  const deva = r.ocr_text || matched?.verse.devanagari || '';
  const roman = r.iast || (hasDevanagari(deva) ? devanagariToIast(deva) : deva);
  return (
    <View style={{ gap: space.lg }} testID="scan-result">
      {matched ? (
        <Card accent onPress={() => router.push({ pathname: '/verse/[id]', params: { id: matched.verse.id } })} testID="scan-match">
          <Row gap={space.md}>
            <Ionicons name="checkmark-circle" size={26} color={p.success} />
            <View style={{ flex: 1 }}>
              <T variant="label" muted>
                {t('matchedVerse')}
              </T>
              <T variant="heading">{r.match?.source_title ?? verseLabel(matched.verse.id)}</T>
              <T variant="caption" muted>
                {verseRef(matched.verse)} · {Math.round((r.match?.score ?? 0) * 100)}% {t('match')}
              </T>
            </View>
            <T variant="small" color={p.primary} style={{ fontWeight: '600' }}>
              {t('openVerse')}
            </T>
          </Row>
        </Card>
      ) : null}
      {deva ? (
        <View style={{ backgroundColor: p.verseBg, borderRadius: radius.xl, borderWidth: 1, borderColor: p.border, padding: space.lg, gap: space.md }}>
          <T variant="label" muted center>
            {t('readText')}
          </T>
          <ShlokaText devanagari={deva} iast={roman} showIast={iast} size={24} />
          <Row style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <Chip label={iast ? 'देवनागरी' : 'IAST'} icon="swap-horizontal" onPress={() => setIast(!iast)} />
            <SpeakButton devanagari={deva} />
            {r.confidence ? <Badge tone={r.confidence === 'high' ? 'success' : r.confidence === 'low' ? 'danger' : 'accent'} label={`${t('confidence')}: ${r.confidence}`} /> : null}
          </Row>
        </View>
      ) : null}
      <VerseBody v={{ ...r, review_status: 'ai_draft', key_terms: r.key_terms ?? [] }} />
      {r.related_verse_ids?.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="label" muted>
            {t('relatedVerses')}
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {r.related_verse_ids.map((id) => (
              <Chip key={id} label={verseLabel(id)} icon="link-outline" onPress={() => router.push({ pathname: '/verse/[id]', params: { id } })} />
            ))}
          </View>
        </View>
      ) : null}
      <T variant="caption" muted style={{ fontStyle: 'italic' }}>
        {r.disclaimer ?? t('tutorDisclaimer')}
      </T>
    </View>
  );
}

function HitRow({ hit }: { hit: SearchHit }) {
  const p = usePalette();
  const { t } = useI18n();
  const ref = getVerse(hit.id);
  if (!ref) return null;
  const first = ref.verse.devanagari.split('\n')[0];
  return (
    <Pressable
      testID={`hit-${hit.id}`}
      onPress={() => router.push({ pathname: '/verse/[id]', params: { id: hit.id } })}
      style={({ pressed }) => ({
        padding: space.md,
        gap: 4,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: p.border,
        backgroundColor: p.surface,
        opacity: pressed ? 0.85 : 1,
      })}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
          {verseLabel(hit.id)}
        </T>
        <Badge tone={hit.score > 0.8 ? 'success' : hit.score > 0.55 ? 'accent' : 'neutral'} label={`${Math.round(hit.score * 100)}% ${t('match')}`} />
      </Row>
      <Text numberOfLines={2} style={{ fontFamily: fonts.sanskrit, fontSize: 18, lineHeight: 30, color: p.text }}>
        {first}
      </Text>
    </Pressable>
  );
}

export default function Scan() {
  const p = usePalette();
  const { t, lang } = useI18n();
  const { data } = useStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [explaining, setExplaining] = useState(false);

  // build the offline index in the background so the first search is instant
  useEffect(() => {
    const timer = setTimeout(() => getSearchIndex(), 600);
    return () => clearTimeout(timer);
  }, []);

  const pick = async (source: 'camera' | 'gallery') => {
    setError(null);
    try {
      const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(t('permissionDenied'));
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], base64: true, quality: 0.6, allowsEditing: true };
      const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setImage(a.uri);
      if (!a.base64) {
        setPhase('error');
        setError(t('error'));
        return;
      }
      setPhase('loading');
      setResult(null);
      const r = await scanImage(data.settings.apiUrl, a.base64, a.mimeType ?? 'image/jpeg', lang);
      setResult(r);
      setPhase('result');
    } catch (e) {
      if (e instanceof ApiError && !e.offline) {
        setError(e.message);
        setPhase('error');
      } else {
        setPhase('offline');
      }
    }
  };

  const runSearch = () => {
    if (!query.trim()) return;
    setSearching(true);
    setTimeout(() => {
      setHits(searchVerses(query, 8));
      setSearching(false);
    }, 16);
  };

  const explain = async () => {
    if (!query.trim()) return;
    setExplaining(true);
    setError(null);
    try {
      const r = await explainText(data.settings.apiUrl, query.trim(), lang);
      setResult(r);
      setPhase('result');
    } catch (e) {
      if (e instanceof ApiError && !e.offline) setError(e.message);
      else setPhase('offline');
    } finally {
      setExplaining(false);
    }
  };

  const reset = () => {
    setPhase('idle');
    setImage(null);
    setResult(null);
    setError(null);
  };

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Bi k="scanTitle" variant="display" />
        <T variant="small" muted>
          {t('scanIntro')}
        </T>
      </View>

      {phase === 'idle' || phase === 'offline' || phase === 'error' ? (
        <View style={{ gap: space.md }}>
          <Pressable
            testID="scan-camera"
            onPress={() => pick('camera')}
            style={({ pressed }) => ({
              borderRadius: radius.xl,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: p.accent,
              backgroundColor: p.accentSoft,
              paddingVertical: space.xl,
              alignItems: 'center',
              gap: space.sm,
              opacity: pressed ? 0.85 : 1,
            })}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="camera" size={30} color={p.onAccent} />
            </View>
            <T variant="heading">{t('takePhoto')}</T>
          </Pressable>
          <Button testID="scan-gallery" kind="secondary" icon="images-outline" label={t('pickGallery')} onPress={() => pick('gallery')} />
        </View>
      ) : null}

      {image && phase !== 'idle' ? (
        <Image source={{ uri: image }} style={{ width: '100%', height: 160, borderRadius: radius.lg, backgroundColor: p.surfaceAlt }} resizeMode="cover" />
      ) : null}

      {phase === 'loading' ? (
        <Card>
          <Row gap={space.md}>
            <ActivityIndicator color={p.accent} />
            <T variant="body">{t('scanning')}</T>
          </Row>
        </Card>
      ) : null}

      {phase === 'offline' ? (
        <View testID="offline-card" style={{ backgroundColor: p.dangerSoft, borderRadius: radius.lg, padding: space.lg, gap: space.sm }}>
          <Row>
            <Ionicons name="cloud-offline-outline" size={20} color={p.danger} />
            <T variant="heading" color={p.danger} style={{ flex: 1 }}>
              {t('offlineTitle')}
            </T>
          </Row>
          <T variant="small">{t('offlineBody')}</T>
        </View>
      ) : null}

      {error ? (
        <T variant="small" color={p.danger}>
          {error}
        </T>
      ) : null}

      {phase === 'result' && result ? (
        <>
          <ScanResultView r={result} />
          <Button kind="secondary" icon="refresh" label={t('scanAgain')} onPress={reset} />
        </>
      ) : null}

      <Card>
        <View style={{ gap: space.md }}>
          <Row>
            <Ionicons name="create-outline" size={18} color={p.primary} />
            <T variant="heading">{t('typeOrPaste')}</T>
          </Row>
          <TextInput
            testID="paste-input"
            value={query}
            onChangeText={setQuery}
            multiline
            placeholder={t('typeHint')}
            placeholderTextColor={p.textFaint}
            style={{
              minHeight: 96,
              borderWidth: 1,
              borderColor: p.border,
              borderRadius: radius.md,
              padding: space.md,
              backgroundColor: p.verseBg,
              color: p.text,
              fontFamily: fonts.sanskrit,
              fontSize: 18,
              lineHeight: 30,
              textAlignVertical: 'top',
            }}
          />
          <Row>
            <Button testID="paste-search" kind="primary" icon="search" label={t('searchOffline')} onPress={runSearch} loading={searching} style={{ flex: 1 }} disabled={!query.trim()} />
            <Button testID="paste-explain" kind="secondary" icon="sparkles-outline" label={t('explainOnline')} onPress={explain} loading={explaining} style={{ flex: 1 }} disabled={!query.trim()} />
          </Row>
        </View>
      </Card>

      {hits ? (
        <View style={{ gap: space.sm }} testID="search-results">
          <T variant="label" muted>
            {hits.length ? t('matches') : t('noMatches')}
          </T>
          {hits.map((h) => (
            <HitRow key={h.id} hit={h} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
