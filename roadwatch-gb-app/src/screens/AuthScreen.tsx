import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { signInWithEmail, signUpWithEmail } from '../services/authService';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

interface AuthScreenProps {
  onAuthenticated: () => Promise<void>;
}

/**
 * Quiet, utilitarian Auth screen — no marketing bullet lists, no fake badges,
 * no agency role toggles. Warm paper canvas + subtle contour linework.
 */
export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function validate(): boolean {
    const next: { fullName?: string; email?: string; password?: string } = {};
    if (mode === 'signup' && !fullName.trim()) {
      next.fullName = 'Enter your name.';
    }
    if (!email.trim() || !email.includes('@')) {
      next.email = 'Enter a valid email address.';
    }
    if (password.length < 6) {
      next.password = 'Use at least 6 characters.';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    setFormError(null);
    setNotice(null);
    if (!validate()) return;

    setLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
        await onAuthenticated();
      } else {
        const res = await signUpWithEmail({ fullName, email, password });
        if (res.needsEmailConfirmation) {
          setNotice(
            'Account created. Confirm your email from your inbox, then sign in.'
          );
          setMode('signin');
        } else {
          await onAuthenticated();
        }
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Unable to sign in. Try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <View style={styles.wordmark}>
            <Text style={styles.title}>RoadWatch GB</Text>
            <Text style={styles.subtitle}>
              Highway hazard reports across Gilgit-Baltistan. Works offline in dead zones.
            </Text>
          </View>

          <View style={styles.tabRow}>
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'signin' }}
              style={[styles.tab, mode === 'signin' && styles.tabActive]}
              onPress={() => {
                setMode('signin');
                setFieldErrors({});
                setFormError(null);
              }}
            >
              <Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>
                Sign in
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'signup' }}
              style={[styles.tab, mode === 'signup' && styles.tabActive]}
              onPress={() => {
                setMode('signup');
                setFieldErrors({});
                setFormError(null);
              }}
            >
              <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>
                Create account
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            {mode === 'signup' && (
              <View style={styles.field}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  style={[styles.input, Boolean(fieldErrors.fullName) && styles.inputError]}
                  value={fullName}
                  onChangeText={(v) => {
                    setFullName(v);
                    if (fieldErrors.fullName) {
                      setFieldErrors((p) => ({ ...p, fullName: undefined }));
                    }
                  }}
                  placeholder="Your name"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="words"
                />
                {Boolean(fieldErrors.fullName) && (
                  <Text style={styles.fieldError}>{fieldErrors.fullName}</Text>
                )}
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, Boolean(fieldErrors.email) && styles.inputError]}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (fieldErrors.email) {
                    setFieldErrors((p) => ({ ...p, email: undefined }));
                  }
                }}
                placeholder="name@example.com"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {Boolean(fieldErrors.email) && (
                <Text style={styles.fieldError}>{fieldErrors.email}</Text>
              )}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View
                style={[
                  styles.passwordWrap,
                  Boolean(fieldErrors.password) && styles.inputError,
                ]}
              >
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    if (fieldErrors.password) {
                      setFieldErrors((p) => ({ ...p, password: undefined }));
                    }
                  }}
                  placeholder="At least 6 characters"
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? (
                    <EyeOff size={17} color={COLORS.textMuted} />
                  ) : (
                    <Eye size={17} color={COLORS.textMuted} />
                  )}
                </TouchableOpacity>
              </View>
              {Boolean(fieldErrors.password) && (
                <Text style={styles.fieldError}>{fieldErrors.password}</Text>
              )}
            </View>

            {formError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            )}

            {notice && (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            )}

            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.submitBtn, loading && styles.disabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.surface} />
              ) : (
                <Text style={styles.submitText}>
                  {mode === 'signin' ? 'Open map' : 'Create account'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.xxxl,
  },
  column: {
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    gap: SPACING.xxl,
  },
  wordmark: { gap: 6 },
  title: {
    fontSize: TYPE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: TYPE.sm,
    color: COLORS.textSecondary,
    lineHeight: 21,
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.xl,
  },
  tab: {
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: COLORS.primary },
  tabText: { fontSize: TYPE.sm, fontWeight: '600', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.textPrimary },
  form: { gap: SPACING.lg },
  field: { gap: 6 },
  label: { fontSize: TYPE.sm, fontWeight: '600', color: COLORS.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADIUS.control,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: TYPE.md,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.surface,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: TYPE.md,
    color: COLORS.textPrimary,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  inputError: { borderColor: COLORS.danger },
  fieldError: { fontSize: TYPE.xs, color: COLORS.danger },
  errorBox: {
    backgroundColor: COLORS.dangerSoft,
    borderRadius: RADIUS.control,
    padding: SPACING.md,
  },
  errorText: { fontSize: TYPE.sm, color: COLORS.danger, lineHeight: 20 },
  noticeBox: {
    backgroundColor: COLORS.secondarySoft,
    borderRadius: RADIUS.control,
    padding: SPACING.md,
  },
  noticeText: { fontSize: TYPE.sm, color: COLORS.secondaryText, lineHeight: 20 },
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.control,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitText: { fontSize: TYPE.md, fontWeight: '600', color: COLORS.surface },
  disabled: { opacity: 0.6 },
});
