import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Redirect } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { T, type IconName } from '@/components/ui';
import { useI18n, usePalette } from '@/hooks';
import type { StringKey } from '@/i18n/strings';
import { useStore } from '@/state/store';

const TABS: Record<string, { label: StringKey; icon: IconName; iconActive: IconName }> = {
  index: { label: 'tabHome', icon: 'home-outline', iconActive: 'home' },
  library: { label: 'tabLibrary', icon: 'library-outline', iconActive: 'library' },
  scan: { label: 'tabScan', icon: 'scan-outline', iconActive: 'scan' },
  practice: { label: 'tabPractice', icon: 'school-outline', iconActive: 'school' },
  more: { label: 'tabMore', icon: 'grid-outline', iconActive: 'grid' },
};

function TabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const p = usePalette();
  const { t } = useI18n();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: p.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: p.border,
        paddingBottom: Math.max(insets.bottom, 6),
        paddingTop: 6,
        paddingHorizontal: 4,
      }}>
      {state.routes.map((route, i) => {
        const cfg = TABS[route.name];
        if (!cfg) return null;
        const focused = state.index === i;
        const onPress = () => {
          if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
          if (!focused) navigateToTab(route.key);
        };
        if (route.name === 'scan') {
          return (
            <View key={route.key} style={{ flex: 1, alignItems: 'center' }}>
              <Pressable
                testID="tab-scan"
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={t(cfg.label)}
                style={({ pressed }) => ({
                  marginTop: -24,
                  width: 62,
                  height: 62,
                  borderRadius: 31,
                  backgroundColor: p.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 4,
                  borderColor: p.bg,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                  ...Platform.select({
                    android: { elevation: 4 },
                    default: { shadowColor: p.accent, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
                  }),
                })}>
                <Ionicons name="scan" size={28} color={p.onAccent} />
              </Pressable>
              <T variant="caption" color={focused ? p.text : p.textMuted} style={{ marginTop: 2, fontSize: 11 }}>
                {t(cfg.label)}
              </T>
            </View>
          );
        }
        return (
          <Pressable
            key={route.key}
            testID={`tab-${route.name}`}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={t(cfg.label)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 52, gap: 2 }}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 14, backgroundColor: focused ? p.accentSoft : 'transparent' }}>
              <Ionicons name={focused ? cfg.iconActive : cfg.icon} size={22} color={focused ? (p.scheme === 'dark' ? p.accent : p.primary) : p.textMuted} />
            </View>
            <T variant="caption" color={focused ? p.text : p.textMuted} style={{ fontSize: 11, fontWeight: focused ? '600' : '400' }} numberOfLines={1}>
              {t(cfg.label)}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { data } = useStore();
  const p = usePalette();
  if (!data.settings.onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: p.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="scan" />
      <Tabs.Screen name="practice" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
