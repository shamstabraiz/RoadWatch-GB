import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, Info, X } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

export interface ToastMessage {
  text: string;
  tone: 'success' | 'info' | 'error';
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const insets = useSafeAreaInsets();
  if (!toast) return null;

  const isError = toast.tone === 'error';
  const isSuccess = toast.tone === 'success';

  return (
    <View
      style={[styles.anchor, { top: Math.max(insets.top + 66, 78) }]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.toast,
          isError && styles.toastError,
          isSuccess && styles.toastSuccess,
        ]}
        accessibilityRole="alert"
      >
        {isSuccess ? (
          <CheckCircle2 size={16} color="#4ADE80" />
        ) : (
          <Info size={16} color={isError ? '#FCA5A5' : '#FBBF24'} />
        )}
        <Text style={styles.text}>{toast.text}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={15} color="#94A3B8" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    alignItems: 'center',
    zIndex: 100,
  },
  toast: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.control,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.secondary,
  },
  toastSuccess: {
    borderLeftColor: COLORS.success,
  },
  toastError: {
    borderLeftColor: COLORS.danger,
  },
  text: {
    flex: 1,
    fontSize: TYPE.sm,
    color: COLORS.textInverse,
    lineHeight: 19,
  },
});

