import { NotoSansDevanagari_400Regular, NotoSansDevanagari_600SemiBold } from '@expo-google-fonts/noto-sans-devanagari';
import { TiroDevanagariSanskrit_400Regular } from '@expo-google-fonts/tiro-devanagari-sanskrit';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { usePalette } from '@/hooks';
import { StoreProvider, useStore } from '@/state/store';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Shell() {
  const p = usePalette();
  const { hydrated } = useStore();
  const [fontsLoaded, fontError] = useFonts({
    TiroDevanagariSanskrit_400Regular,
    NotoSansDevanagari_400Regular,
    NotoSansDevanagari_600SemiBold,
  });
  const ready = hydrated && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  const base = p.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: p.bg, card: p.surface, text: p.text, border: p.border, primary: p.accent },
  };

  if (!ready) return <View style={{ flex: 1, backgroundColor: p.bg }} />;
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={p.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
