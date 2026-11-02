import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/Logo';
import { Button, T, type IconName } from '@/components/ui';
import { useI18n, usePalette } from '@/hooks';
import type { StringKey } from '@/i18n/strings';
import { useStore, type Lang } from '@/state/store';
import { fonts, radius, space } from '@/theme';

function Option({ selected, onPress, title, subtitle, icon, testID }: { selected: boolean; onPress: () => void; title: string; subtitle?: string; icon?: IconName; testID?: string }) {
  const p = usePalette();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.lg,
        minHeight: 64,
        borderRadius: radius.lg,
        borderWidth: 2,
        borderColor: selected ? p.accent : p.border,
        backgroundColor: selected ? p.accentSoft : p.surface,
        opacity: pressed ? 0.9 : 1,
      })}>
      {icon ? <Ionicons name={icon} size={22} color={selected ? p.text : p.textMuted} /> : null}
      <View style={{ flex: 1 }}>
        <T variant="heading">{title}</T>
        {subtitle ? (
          <T variant="small" muted>
            {subtitle}
          </T>
        ) : null}
      </View>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? p.accent : p.textFaint} />
    </Pressable>
  );
}

export default function Onboarding() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { data, setSettings } = useStore();
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const s = data.settings;

  const steps: StringKey[] = ['obLanguage', 'obYear', 'obGoal'];
  const finish = () => {
    setSettings({ onboarded: true });
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + space.xl, gap: space.xl, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <Logo size={84} />
          <T variant="display" center testID="ob-title">
            {t('appName')}
          </T>
          <T style={{ fontFamily: fonts.sanskrit, fontSize: 22, lineHeight: 34, color: p.accent }} center>
            श्लोकसेतुः
          </T>
          {step === 0 ? (
            <T variant="body" muted center>
              {t('obIntro')}
            </T>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
          {steps.map((_, i) => (
            <View key={i} style={{ height: 6, width: i === step ? 28 : 10, borderRadius: 3, backgroundColor: i <= step ? p.accent : p.border }} />
          ))}
        </View>

        <View style={{ gap: space.md }}>
          <T variant="title">{t(steps[step])}</T>
          {step === 1 ? null : step === 2 ? (
            <T variant="small" muted>
              {t('obGoalHint')}
            </T>
          ) : null}

          {step === 0 &&
            ([
              ['en', 'English', 'Explanations in English'],
              ['hi', 'हिन्दी', 'सरल हिन्दी में व्याख्या'],
              ['both', 'English + हिन्दी', 'Both side by side · दोनों साथ-साथ'],
            ] as [Lang, string, string][]).map(([v, title, sub]) => (
              <Option key={v} testID={`ob-lang-${v}`} selected={s.lang === v} onPress={() => setSettings({ lang: v })} title={title} subtitle={sub} icon="language-outline" />
            ))}

          {step === 1 &&
            ([
              [1, 'prof1', 'Padārtha Vijñāna, Kriyā & Racanā Śārīra, Saṃhitā'],
              [2, 'prof2', 'Dravyaguṇa, Rasaśāstra, Roga Nidāna'],
              [3, 'prof3', 'Kāyacikitsā, Pañcakarma, Śalya, Śālākya'],
            ] as [1 | 2 | 3, StringKey, string][]).map(([v, k, sub]) => (
              <Option key={v} testID={`ob-year-${v}`} selected={s.year === v} onPress={() => setSettings({ year: v })} title={t(k)} subtitle={sub} icon="school-outline" />
            ))}

          {step === 2 &&
            ([
              [10, 'goalLight'],
              [20, 'goalSteady'],
              [40, 'goalIntense'],
            ] as [number, StringKey][]).map(([v, k]) => (
              <Option key={v} testID={`ob-goal-${v}`} selected={s.dailyGoal === v} onPress={() => setSettings({ dailyGoal: v })} title={`${t(k)} · ${v} ${t('perDay')}`} icon="flame-outline" />
            ))}
        </View>

        <View style={{ flexDirection: 'row', gap: space.md }}>
          {step > 0 ? <Button kind="secondary" label={t('back')} onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
          {step < steps.length - 1 ? (
            <Button testID="ob-next" kind="primary" label={t('next')} icon="arrow-forward" onPress={() => setStep(step + 1)} style={{ flex: 2 }} />
          ) : (
            <Button testID="ob-start" kind="accent" label={t('obStart')} icon="book-outline" onPress={finish} style={{ flex: 2 }} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
