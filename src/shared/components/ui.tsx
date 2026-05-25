import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import {
  Pressable,
  Modal,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";

import { palette, radius, shadows, spacing, typography } from "@/shared/theme";

interface ScreenProps {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Screen({ children, contentStyle, scroll = true, style }: ScreenProps) {
  if (!scroll) {
    return <View style={[styles.screen, style]}>{children}</View>;
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.screenContent, contentStyle]}
      showsVerticalScrollIndicator={false}
      style={[styles.screen, style]}
    >
      {children}
    </ScrollView>
  );
}

interface CardProps {
  children: ReactNode;
  enteringDelay?: number;
  soft?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, enteringDelay = 0, soft = false, style }: CardProps) {
  return (
    <Animated.View
      entering={FadeInUp.delay(enteringDelay).duration(380).springify().damping(18)}
      style={[styles.card, soft ? styles.softCard : null, style]}
    >
      {children}
    </Animated.View>
  );
}

interface SectionHeaderProps {
  action?: ReactNode;
  subtitle?: string;
  title: string;
}

export function SectionHeader({ action, subtitle, title }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

type ButtonVariant = "danger" | "primary" | "secondary" | "success";

interface ButtonProps extends Pick<PressableProps, "disabled" | "onPress"> {
  children: ReactNode;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  variant?: ButtonVariant;
}

export function Button({
  children,
  disabled,
  icon,
  onPress,
  style,
  textStyle,
  variant = "primary",
}: ButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={(event) => {
        void Haptics.selectionAsync();
        onPress?.(event);
      }}
      style={({ pressed }) => [
        styles.button,
        styles[`${variant}Button`],
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {icon}
      <Text style={[styles.buttonText, styles[`${variant}ButtonText`], textStyle]}>{children}</Text>
    </Pressable>
  );
}

interface ChipProps extends Pick<PressableProps, "disabled" | "onPress"> {
  children: ReactNode;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ children, disabled, onPress, selected = false, style }: ChipProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={(event) => {
        void Haptics.selectionAsync();
        onPress?.(event);
      }}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{children}</Text>
    </Pressable>
  );
}

interface AmountPillProps {
  label: string;
  tone?: "danger" | "default" | "success";
  value: string;
}

export function AmountPill({ label, tone = "default", value }: AmountPillProps) {
  return (
    <View style={[styles.amountPill, styles[`${tone}AmountPill`]]}>
      <Text style={styles.amountPillLabel}>{label}</Text>
      <Text style={[styles.amountPillValue, styles[`${tone}AmountPillValue`]]}>{value}</Text>
    </View>
  );
}

export function MotionBlock({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(320).springify().damping(18)}>
      {children}
    </Animated.View>
  );
}

interface BottomSheetProps {
  children: ReactNode;
  keyboardAvoiding?: boolean;
  onClose: () => void;
  title?: string;
  visible: boolean;
}

export function BottomSheet({
  children,
  keyboardAvoiding = false,
  onClose,
  title,
  visible,
}: BottomSheetProps) {
  const content = (
    <Animated.View entering={FadeInDown.duration(240)} style={styles.bottomSheet}>
      {title ? <Text style={styles.bottomSheetTitle}>{title}</Text> : null}
      {children}
    </Animated.View>
  );

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <Pressable onPress={onClose} style={styles.modalBackdropPressable} />
        {keyboardAvoiding ? (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            {content}
          </KeyboardAvoidingView>
        ) : (
          content
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bottomSheet: {
    backgroundColor: palette.backgroundElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "88%",
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  bottomSheetTitle: {
    color: palette.text,
    fontSize: typography.title.fontSize,
    fontWeight: "800",
    lineHeight: typography.title.lineHeight,
    marginBottom: spacing.md,
  },
  amountPill: {
    backgroundColor: palette.mutedSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  amountPillLabel: {
    color: palette.muted,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    marginBottom: 2,
  },
  amountPillValue: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  button: {
    alignItems: "center",
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  card: {
    backgroundColor: palette.backgroundElevated,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    ...shadows.card,
  },
  modalBackdrop: {
    backgroundColor: "rgba(17, 24, 39, 0.24)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdropPressable: {
    flex: 1,
  },
  chip: {
    backgroundColor: palette.backgroundElevated,
    borderColor: palette.border,
    borderRadius: radius.round,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  chipSelected: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  chipText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  chipTextSelected: {
    color: palette.white,
  },
  dangerAmountPill: {
    backgroundColor: palette.dangerSoft,
  },
  dangerAmountPillValue: {
    color: palette.danger,
  },
  dangerButton: {
    backgroundColor: palette.danger,
  },
  dangerButtonText: {
    color: palette.white,
  },
  defaultAmountPill: {
    backgroundColor: palette.mutedSoft,
  },
  defaultAmountPillValue: {
    color: palette.text,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  primaryButton: {
    backgroundColor: palette.primary,
  },
  primaryButtonText: {
    color: palette.white,
  },
  screen: {
    backgroundColor: palette.background,
    flex: 1,
  },
  screenContent: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  secondaryButton: {
    backgroundColor: palette.primarySoft,
  },
  secondaryButtonText: {
    color: palette.primary,
  },
  sectionHeader: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  sectionSubtitle: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: typography.title.fontSize,
    fontWeight: "800",
    lineHeight: typography.title.lineHeight,
  },
  softCard: {
    backgroundColor: palette.primarySoft,
    borderColor: palette.borderStrong,
  },
  successAmountPill: {
    backgroundColor: palette.successSoft,
  },
  successAmountPillValue: {
    color: palette.success,
  },
  successButton: {
    backgroundColor: palette.success,
  },
  successButtonText: {
    color: palette.white,
  },
});
