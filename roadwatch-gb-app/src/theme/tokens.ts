import { Platform } from 'react-native';

/**
 * RoadWatch GB — Mountain Cartographic Two-Color System
 * Primary:   Alpine Pine   (#14332B)
 * Secondary: Highway Amber (#D97706)
 * Warm paper surfaces (#FAF9F6) with stone-tinted neutrals.
 */
export const COLORS = {
  primary: '#14332B',          // Deep Alpine Pine (replaces dark blue)
  primaryMuted: '#1F473C',
  secondary: '#D97706',        // Highway Amber
  secondarySoft: '#FEF3C7',
  secondaryText: '#92400E',

  background: '#FAF9F6',
  surface: '#FFFFFF',
  surfaceSubtle: '#F3F2EE',
  border: '#E5E4DE',
  borderStrong: '#D2D0C8',

  textPrimary: '#1A2421',
  textSecondary: '#4B5954',
  textMuted: '#6B7873',
  textInverse: '#FAF9F6',

  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  success: '#15803D',
  successSoft: '#F0FDF4',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const RADIUS = {
  control: 8,
  sheet: 18,
  pill: 999,
} as const;

export const TYPE = {
  xs: 12,
  sm: 14,
  md: 15,
  lg: 19,
  xl: 26,
} as const;

export const FONTS = {
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  }),
} as const;
