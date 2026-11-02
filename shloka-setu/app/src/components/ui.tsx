import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n, usePalette } from '../hooks';
import type { StringKey } from '../i18n/strings';
import { cardShadow, fonts, radius, space, type Palette } from '../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

const DEVA = /[ऀ-ॿ]/;

function textOf(children: React.ReactNode): string | null {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children) && children.every((c) => typeof c === 'string' || typeof c === 'number')) return children.join('');
  return null;
}

type Variant = 'display' | 'title' | 'heading' | 'body' | 'small' | 'caption' | 'label' | 'button';

const SIZES: Record<Variant, { size: number; serif?: boolean; bold?: boolean; lh: number }> = {
  display: { size: 30, serif: true, lh: 1.25 },
  title: { size: 23, serif: true, lh: 1.3 },
  heading: { size: 17, bold: true, lh: 1.35 },
  body: { size: 15.5, lh: 1.5 },
  small: { size: 13.5, lh: 1.45 },
  caption: { size: 12, lh: 1.4 },
  label: { size: 11.5, bold: true, lh: 1.3 },
  button: { size: 15, bold: true, lh: 1.3 },
};

export interface TProps extends TextProps {
  variant?: Variant;
  color?: string;
  muted?: boolean;
  center?: boolean;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

/** Text that picks a Devanagari-capable font automatically. */
export function T({ variant = 'body', color, muted, center, style, children, ...rest }: TProps) {
  const p = usePalette();
  const spec = SIZES[variant];
  const raw = textOf(children);
  const deva = raw ? DEVA.test(raw) : false;
  let fontFamily: string | undefined;
  let fontWeight: TextStyle['fontWeight'] | undefined;
  if (spec.serif) fontFamily = fonts.sanskrit;
  else if (deva) fontFamily = spec.bold ? fonts.hindiBold : fonts.hindi;
  else {
    fontFamily = fonts.ui;
    if (spec.bold) fontWeight = '600';
  }
  const lh = deva ? Math.max(spec.lh, 1.6) : spec.lh;
  return (
    <Text
      {...rest}
      style={[
        {
          fontSize: spec.size,
          lineHeight: Math.round(spec.size * lh),
          color: color ?? (muted ? p.textMuted : p.text),
          fontFamily,
          fontWeight,
          textAlign: center ? 'center' : undefined,
          letterSpacing: variant === 'label' ? 0.6 : undefined,
          textTransform: variant === 'label' && !deva ? 'uppercase' : undefined,
        },
        style,
      ]}>
      {children}
    </Text>
  );
}

/** A UI label in the chosen language, with the Hindi underneath when the user picked "both". */
export function Bi({ k, variant = 'heading', color, center, style }: { k: StringKey; variant?: Variant; color?: string; center?: boolean; style?: StyleProp<ViewStyle> }) {
  const { t, t2 } = useI18n();
  const second = t2(k);
  return (
    <View style={style}>
      <T variant={variant} color={color} center={center}>
        {t(k)}
      </T>
      {second && second !== t(k) ? (
        <T variant="caption" muted center={center}>
          {second}
        </T>
      ) : null}
    </View>
  );
}

export function Card({ children, style, onPress, accent, padded = true, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accent?: boolean; padded?: boolean; testID?: string }) {
  const p = usePalette();
  const base: ViewStyle = {
    backgroundColor: p.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: accent ? p.accent : p.border,
    padding: padded ? space.lg : 0,
    ...cardShadow(p),
  };
  if (!onPress)
    return (
      <View style={[base, style]} testID={testID}>
        {children}
      </View>
    );
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      android_ripple={{ color: p.surfaceAlt }}
      style={({ pressed }) => [base, pressed && Platform.OS !== 'android' ? { opacity: 0.85, transform: [{ scale: 0.995 }] } : null, style]}>
      {children}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  style,
  small,
  testID,
}: {
  label: string;
  onPress?: () => void;
  kind?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  testID?: string;
}) {
  const p = usePalette();
  const colors: Record<string, { bg: string; fg: string; border: string }> = {
    primary: { bg: p.primary, fg: p.onPrimary, border: p.primary },
    accent: { bg: p.accent, fg: p.onAccent, border: p.accent },
    secondary: { bg: p.surface, fg: p.text, border: p.border },
    ghost: { bg: 'transparent', fg: p.primary, border: 'transparent' },
    danger: { bg: p.dangerSoft, fg: p.danger, border: p.dangerSoft },
  };
  const c = colors[kind];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: small ? 40 : 50,
          paddingHorizontal: small ? space.md : space.lg,
          borderRadius: radius.md,
          backgroundColor: c.bg,
          borderWidth: 1,
          borderColor: c.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}>
      {loading ? <ActivityIndicator color={c.fg} /> : icon ? <Ionicons name={icon} size={small ? 17 : 19} color={c.fg} /> : null}
      <T variant="button" color={c.fg} numberOfLines={1} style={small ? { fontSize: 14 } : undefined}>
        {label}
      </T>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon, style, testID }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; style?: StyleProp<ViewStyle>; testID?: string }) {
  const p = usePalette();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        {
          minHeight: 38,
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: selected ? p.primary : p.border,
          backgroundColor: selected ? p.primary : p.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}>
      {icon ? <Ionicons name={icon} size={15} color={selected ? p.onPrimary : p.textMuted} /> : null}
      <T variant="small" color={selected ? p.onPrimary : p.text} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

export function Segmented<V extends string | number>({ options, value, onChange, testIDPrefix }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; testIDPrefix?: string }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: p.surfaceAlt, borderRadius: radius.md, padding: 3, gap: 3 }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            testID={testIDPrefix ? `${testIDPrefix}-${o.value}` : undefined}
            accessibilityRole="button"
            accessibilityState={{ selected: sel }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: radius.sm + 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: sel ? p.surface : 'transparent',
              borderWidth: sel ? 1 : 0,
              borderColor: p.border,
              paddingHorizontal: 6,
            }}>
            <T variant="small" color={sel ? p.text : p.textMuted} style={{ fontWeight: sel ? '600' : '400' }} numberOfLines={1}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'primary'; icon?: IconName }) {
  const p = usePalette();
  const tones = {
    neutral: [p.surfaceAlt, p.textMuted],
    accent: [p.accentSoft, p.scheme === 'dark' ? p.accent : '#7A4A00'],
    success: [p.successSoft, p.success],
    danger: [p.dangerSoft, p.danger],
    primary: [p.primarySoft, p.primary],
  } as const;
  const [bg, fg] = tones[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' }}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <T variant="caption" color={fg} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}

export function AiDraftBadge({ status }: { status?: string | null }) {
  const { t } = useI18n();
  if (status === 'expert_reviewed') return null;
  return <Badge tone="accent" icon="sparkles-outline" label={t('aiDraft')} />;
}

export function IconBtn({ icon, onPress, label, active, color, size = 22, testID }: { icon: IconName; onPress?: () => void; label: string; active?: boolean; color?: string; size?: number; testID?: string }) {
  const p = usePalette();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? p.accentSoft : pressed ? p.surfaceAlt : 'transparent',
      })}>
      <Ionicons name={icon} size={size} color={color ?? (active ? p.accent : p.text)} />
    </Pressable>
  );
}

export function Header({ title, subtitle, back = true, right }: { title: string; subtitle?: string | null; back?: boolean; right?: React.ReactNode }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + 4,
        paddingBottom: 6,
        paddingHorizontal: space.sm,
        backgroundColor: p.bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: p.border,
      }}>
      {back ? (
        <IconBtn
          icon="chevron-back"
          label="Back"
          testID="header-back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      ) : (
        <View style={{ width: space.sm }} />
      )}
      <View style={{ flex: 1, paddingVertical: 4 }}>
        <T variant="heading" numberOfLines={1}>
          {title}
        </T>
        {subtitle ? (
          <T variant="caption" muted numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Screen({ children, scroll = true, contentStyle, header, footer, ...rest }: { children: React.ReactNode; scroll?: boolean; contentStyle?: StyleProp<ViewStyle>; header?: React.ReactNode; footer?: React.ReactNode } & ScrollViewProps) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const padTop = header ? space.lg : insets.top + space.lg;
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      {header}
      {scroll ? (
        <ScrollView
          {...rest}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ padding: space.lg, paddingTop: padTop, paddingBottom: space.xxl + 24, gap: space.lg, maxWidth: 720, width: '100%', alignSelf: 'center' }, contentStyle]}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, padding: space.lg, paddingTop: padTop }, contentStyle]}>{children}</View>
      )}
      {footer}
    </View>
  );
}

export function SectionTitle({ k, text, right }: { k?: StringKey; text?: string; right?: React.ReactNode }) {
  const p = usePalette();
  const { t } = useI18n();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: p.accent }} />
        <T variant="label" muted>
          {text ?? (k ? t(k) : '')}
        </T>
      </View>
      {right}
    </View>
  );
}

export function Empty({ icon = 'leaf-outline', title, body, action }: { icon?: IconName; title: string; body?: string; action?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ alignItems: 'center', padding: space.xl, gap: space.sm }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: p.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={30} color={p.accent} />
      </View>
      <T variant="heading" center>
        {title}
      </T>
      {body ? (
        <T variant="small" muted center>
          {body}
        </T>
      ) : null}
      {action}
    </View>
  );
}

export function Row({ children, style, gap = space.sm }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function ListRow({ title, subtitle, icon, right, onPress, testID }: { title: string; subtitle?: string | null; icon?: IconName; right?: React.ReactNode; onPress?: () => void; testID?: string } & Omit<PressableProps, 'children'>) {
  const p = usePalette();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      android_ripple={{ color: p.surfaceAlt }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, paddingHorizontal: space.lg, minHeight: 56, opacity: pressed && Platform.OS !== 'android' ? 0.7 : 1 })}>
      {icon ? (
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: p.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={20} color={p.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T variant="body" numberOfLines={2} style={{ fontWeight: '500' }}>
          {title}
        </T>
        {subtitle ? (
          <T variant="caption" muted numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={p.textFaint} /> : null)}
    </Pressable>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const p = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.border, marginLeft: inset }} />;
}

export function ProgressBar({ value, color, height = 6 }: { value: number; color?: string; height?: number }) {
  const p = usePalette();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: p.surfaceAlt, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%', backgroundColor: color ?? p.accent, borderRadius: height }} />
    </View>
  );
}

export function usePal(): Palette {
  return usePalette();
}
