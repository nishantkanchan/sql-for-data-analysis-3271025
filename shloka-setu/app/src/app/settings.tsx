import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import React, { useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';

import { Badge, Button, Card, Header, Row, Screen, Segmented, SectionTitle, T } from '@/components/ui';
import { getContentMeta } from '@/content';
import { useI18n, usePalette } from '@/hooks';
import { ping } from '@/lib/api';
import { DEFAULT_API_URL, useStore, type Lang, type ThemePref } from '@/state/store';
import { fonts, radius, space } from '@/theme';

export default function Settings() {
  const p = usePalette();
  const { t } = useI18n();
  const { data, setSettings, resetProgress } = useStore();
  const s = data.settings;
  const [url, setUrl] = useState(s.apiUrl);
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [confirmReset, setConfirmReset] = useState(false);
  const meta = getContentMeta();

  const test = async () => {
    setStatus('testing');
    const clean = url.trim().replace(/\/+$/, '');
    setSettings({ apiUrl: clean });
    setStatus((await ping(clean)) ? 'ok' : 'fail');
  };

  return (
    <Screen header={<Header title={t('settingsTitle')} />}>
      <SectionTitle k="language" />
      <Segmented<Lang>
        testIDPrefix="set-lang"
        value={s.lang}
        onChange={(v) => setSettings({ lang: v })}
        options={[
          { value: 'en', label: 'English' },
          { value: 'hi', label: 'हिन्दी' },
          { value: 'both', label: t('langBoth') },
        ]}
      />

      <SectionTitle k="bamsYear" />
      <Segmented<1 | 2 | 3>
        value={s.year}
        onChange={(v) => setSettings({ year: v })}
        options={[
          { value: 1, label: t('prof1') },
          { value: 2, label: t('prof2') },
          { value: 3, label: t('prof3') },
        ]}
      />

      <SectionTitle k="dailyGoal" />
      <Segmented<number>
        value={s.dailyGoal}
        onChange={(v) => setSettings({ dailyGoal: v })}
        options={[
          { value: 10, label: `10 ${t('perDay')}` },
          { value: 20, label: `20 ${t('perDay')}` },
          { value: 40, label: `40 ${t('perDay')}` },
        ]}
      />

      <SectionTitle k="appearance" />
      <Segmented<ThemePref>
        testIDPrefix="set-theme"
        value={s.theme}
        onChange={(v) => setSettings({ theme: v })}
        options={[
          { value: 'system', label: t('themeSystem') },
          { value: 'light', label: t('themeLight') },
          { value: 'dark', label: t('themeDark') },
        ]}
      />

      <SectionTitle k="apiUrl" />
      <Card>
        <View style={{ gap: space.md }}>
          <T variant="small" muted>
            {t('apiUrlHint')}
          </T>
          <TextInput
            testID="api-url"
            value={url}
            onChangeText={(v) => {
              setUrl(v);
              setStatus('idle');
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder={DEFAULT_API_URL}
            placeholderTextColor={p.textFaint}
            style={{ minHeight: 48, borderWidth: 1, borderColor: p.border, borderRadius: radius.md, paddingHorizontal: space.md, color: p.text, backgroundColor: p.bg, fontSize: 15 }}
          />
          <Row>
            <Button small kind="primary" icon="pulse-outline" label={t('testConnection')} loading={status === 'testing'} onPress={test} style={{ flex: 2 }} />
            <Button
              small
              kind="secondary"
              label={t('reset')}
              onPress={() => {
                setUrl(DEFAULT_API_URL);
                setSettings({ apiUrl: DEFAULT_API_URL });
                setStatus('idle');
              }}
              style={{ flex: 1 }}
            />
          </Row>
          {status === 'ok' ? <Badge tone="success" icon="checkmark-circle" label={t('connected')} /> : null}
          {status === 'fail' ? <Badge tone="danger" icon="cloud-offline-outline" label={t('notConnected')} /> : null}
        </View>
      </Card>

      <SectionTitle k="contentStats" />
      <Card>
        <View style={{ gap: 6 }}>
          <T variant="small">
            {meta.stats.texts} texts · {meta.stats.verses.toLocaleString('en-IN')} {t('verses')}
          </T>
          <T variant="small">
            {meta.stats.translated_chapters} {t('chapters')} {t('translated')} ({meta.stats.translated_verses} {t('verses')})
          </T>
          <T variant="small">
            {meta.stats.quiz_questions} {t('questions')} · {meta.stats.glossary_terms} {t('terms')}
          </T>
          <T variant="caption" muted>
            {t('generated')}: {meta.stats.generated_at.slice(0, 10)}
          </T>
        </View>
      </Card>

      <SectionTitle k="about" />
      <Card>
        <View style={{ gap: space.sm }}>
          <T style={{ fontFamily: fonts.sanskrit, fontSize: 20, lineHeight: 32, color: p.accent }}>श्लोकसेतुः · {t('appName')}</T>
          <T variant="small">{t('aboutBody')}</T>
          <T variant="caption" muted>
            {t('version')} {Constants.expoConfig?.version ?? '1.0.0'}
          </T>
        </View>
      </Card>

      <SectionTitle k="dataSources" />
      {meta.sources.map((src) => (
        <Card key={src.code} testID={`source-${src.code}`}>
          <View style={{ gap: 6 }}>
            <T variant="heading">{src.title}</T>
            {src.source ? (
              <T variant="caption" muted>
                {src.source}
              </T>
            ) : null}
            {src.transcription ? (
              <T variant="caption" muted>
                {src.transcription}
              </T>
            ) : null}
            {src.license_note ? <T variant="small">{src.license_note}</T> : null}
            {src.source_url ? (
              <Pressable onPress={() => Linking.openURL(src.source_url!)} accessibilityRole="link">
                <T variant="caption" color={p.primary} numberOfLines={1}>
                  {src.source_url}
                </T>
              </Pressable>
            ) : null}
          </View>
        </Card>
      ))}
      <Card>
        <T variant="caption" muted>
          Fonts: Tiro Devanagari Sanskrit and Noto Sans Devanagari (SIL Open Font License). Icons: Ionicons (MIT). Translations, explanations, quiz items and glossary: AI drafts pending expert review.
        </T>
      </Card>

      <SectionTitle k="disclaimer" />
      <View style={{ flexDirection: 'row', gap: 8, backgroundColor: p.accentSoft, borderRadius: radius.md, padding: space.md }}>
        <Ionicons name="medkit-outline" size={18} color={p.scheme === 'dark' ? p.accent : '#7A4A00'} />
        <T variant="small" style={{ flex: 1 }}>
          {t('disclaimerBody')}
        </T>
      </View>

      <Button
        kind="danger"
        icon="trash-outline"
        label={confirmReset ? t('resetConfirm') : t('resetProgress')}
        onPress={() => {
          if (confirmReset) {
            resetProgress();
            setConfirmReset(false);
          } else setConfirmReset(true);
        }}
      />
    </Screen>
  );
}
