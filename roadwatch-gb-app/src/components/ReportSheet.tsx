import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Crosshair, Image as ImageIcon, MapPin, X } from 'lucide-react-native';
import { HAZARD_TYPES } from '../data/gbCorridors';
import { compressHazardPhoto, MAX_PHOTO_SIZE_KB } from '../services/imageCompressor';
import {
  resolveNearestCorridorSpot,
  reverseGeocodeLocation,
} from '../services/hotspotClustering';
import { computeTrustScore, generateClientUuid } from '../services/spatialAlgorithm';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import {
  ClearanceStatus,
  CorridorId,
  HazardRecord,
  HazardType,
  SeverityLevel,
} from '../types/hazard';
import { PhotoLightbox } from './PhotoLightbox';

export interface GpsFix {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
}

interface ReportSheetProps {
  currentUserId: string;
  isConnected: boolean;
  initialGpsFix: GpsFix | null;
  onGpsLocked: (fix: GpsFix) => void;
  onClose: () => void;
  onSubmitReport: (record: HazardRecord) => Promise<void>;
  onError: (msg: string) => void;
}

const ROAD_STATES: {
  label: string;
  clearance: ClearanceStatus;
  severity: SeverityLevel;
}[] = [
  { label: 'Blocked', clearance: 'BLOCKED', severity: 'CRITICAL' },
  { label: 'Single lane', clearance: 'SINGLE_LANE', severity: 'HIGH' },
  { label: 'Caution', clearance: 'SINGLE_LANE', severity: 'MODERATE' },
];

/**
 * GPS-Only + Photo-Required Hazard Report Sheet.
 * Locks hardware satellite GPS once cleanly without re-render loops.
 */
export function ReportSheet({
  currentUserId,
  isConnected,
  initialGpsFix,
  onGpsLocked,
  onClose,
  onSubmitReport,
  onError,
}: ReportSheetProps) {
  const insets = useSafeAreaInsets();
  const [gpsFix, setGpsFix] = useState<GpsFix | null>(initialGpsFix);
  const [gpsLoading, setGpsLoading] = useState(!initialGpsFix);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const initialSpot = initialGpsFix
    ? resolveNearestCorridorSpot(initialGpsFix.latitude, initialGpsFix.longitude)
    : null;

  const [corridor, setCorridor] = useState<CorridorId>(
    initialSpot?.corridor ?? 'KKH_N35'
  );
  const [locationName, setLocationName] = useState(initialSpot?.landmark ?? '');
  const [nameEdited, setNameEdited] = useState(false);
  const [hazardType, setHazardType] = useState<HazardType>('LANDSLIDE');
  const [stateIdx, setStateIdx] = useState(0);
  const [description, setDescription] = useState('');

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoSizeKb, setPhotoSizeKb] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Refs keep callbacks stable so GPS never re-triggers in an infinite loop
  const onGpsLockedRef = useRef(onGpsLocked);
  onGpsLockedRef.current = onGpsLocked;
  const nameEditedRef = useRef(nameEdited);
  nameEditedRef.current = nameEdited;
  const hasAttemptedInitialGps = useRef(false);

  const acquireGps = useCallback(async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsError('Location permission denied. Enable GPS to submit a report.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const nextFix: GpsFix = {
        latitude: Number(pos.coords.latitude.toFixed(5)),
        longitude: Number(pos.coords.longitude.toFixed(5)),
        altitude: pos.coords.altitude,
        accuracy: pos.coords.accuracy,
      };
      setGpsFix(nextFix);
      onGpsLockedRef.current(nextFix);

      const resolved = await reverseGeocodeLocation(
        nextFix.latitude,
        nextFix.longitude
      );
      setCorridor(resolved.corridor);
      if (!nameEditedRef.current) {
        setLocationName(resolved.placeName);
      }
    } catch (err) {
      setGpsError(
        err instanceof Error
          ? err.message
          : 'Could not lock GPS signal. Tap Retry GPS.'
      );
    } finally {
      setGpsLoading(false);
    }
  }, []);

  // Run exactly once on mount: lock GPS if missing, or reverse-geocode existing fix
  useEffect(() => {
    if (hasAttemptedInitialGps.current) return;
    hasAttemptedInitialGps.current = true;
    if (!initialGpsFix) {
      acquireGps();
    } else {
      reverseGeocodeLocation(initialGpsFix.latitude, initialGpsFix.longitude).then(
        (resolved) => {
          setCorridor(resolved.corridor);
          if (!nameEditedRef.current) {
            setLocationName(resolved.placeName);
          }
        }
      );
    }
  }, [initialGpsFix, acquireGps]);

  async function handlePhoto(useCamera: boolean) {
    try {
      const perm = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        onError('Allow camera or photo library access to attach evidence.');
        return;
      }
      const res = useCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.9,
          });
      if (res.canceled || !res.assets?.[0]?.uri) return;

      setCompressing(true);
      setPhotoError(null);
      const compressed = await compressHazardPhoto(res.assets[0].uri);
      setPhotoUri(compressed.uri);
      setPhotoSizeKb(Math.max(1, compressed.sizeKb));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Photo compression failed.');
    } finally {
      setCompressing(false);
    }
  }

  async function handleSubmit() {
    let valid = true;

    if (!gpsFix) {
      setGpsError('GPS location is required. Tap Retry GPS.');
      valid = false;
    }
    if (!locationName.trim()) {
      setNameError('Enter the area or landmark name.');
      valid = false;
    }
    if (!photoUri || photoSizeKb <= 0) {
      setPhotoError('Photo evidence is required to report a hazard.');
      valid = false;
    }
    if (!valid || !gpsFix || !photoUri) return;

    setNameError(null);
    setPhotoError(null);
    setSubmitting(true);
    try {
      const roadState = ROAD_STATES[stateIdx];
      const now = Date.now();
      const record: HazardRecord = {
        id: generateClientUuid(),
        reporterId: currentUserId,
        corridor,
        locationName: locationName.trim(),
        hazardType,
        severity: roadState.severity,
        description: description.trim(),
        latitude: gpsFix.latitude,
        longitude: gpsFix.longitude,
        altitude: gpsFix.altitude,
        localPhotoUri: photoUri,
        photoUrl: null,
        photoSizeKb,
        syncStatus: 'PENDING',
        verificationStatus: 'UNVERIFIED',
        clearanceStatus: roadState.clearance,
        confirmations: 1,
        clearVotes: 0,
        trustScore: computeTrustScore(1, true),
        clusterId: null,
        createdAt: now,
        updatedAt: now,
      };
      await onSubmitReport(record);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = Boolean(gpsFix && photoUri && !compressing && !submitting);

  return (
    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.handle} />

      <View style={styles.header}>
        <Text style={styles.title}>Report hazard</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Close report form"
          style={styles.closeBtn}
          onPress={onClose}
        >
          <X size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Strict GPS-Only Location Status */}
        <View style={styles.field}>
          <Text style={styles.label}>GPS location</Text>
          <View style={[styles.gpsBar, Boolean(gpsError) && styles.inputError]}>
            <View style={styles.gpsLeft}>
              <MapPin
                size={15}
                color={gpsFix ? COLORS.success : COLORS.secondary}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                {gpsLoading ? (
                  <Text style={styles.gpsPending}>Acquiring satellite GPS...</Text>
                ) : gpsFix ? (
                  <>
                    <Text style={styles.coordsText} numberOfLines={1}>
                      {gpsFix.latitude.toFixed(5)}°N, {gpsFix.longitude.toFixed(5)}°E
                    </Text>
                    <Text style={styles.gpsMeta}>
                      Hardware GPS locked
                      {gpsFix.accuracy ? ` (±${Math.round(gpsFix.accuracy)}m)` : ''}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.gpsMissing}>Waiting for GPS lock</Text>
                )}
              </View>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.gpsBtn}
              onPress={acquireGps}
              disabled={gpsLoading}
            >
              {gpsLoading ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Crosshair size={13} color={COLORS.primary} />
              )}
              <Text style={styles.gpsBtnText}>
                {gpsFix ? 'Refresh' : 'Retry GPS'}
              </Text>
            </TouchableOpacity>
          </View>
          {Boolean(gpsError) && <Text style={styles.errorText}>{gpsError}</Text>}
        </View>

        {/* Required Photo Evidence */}
        <View style={styles.field}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Photo evidence</Text>
            <Text style={styles.limitText}>Max {MAX_PHOTO_SIZE_KB} KB</Text>
          </View>

          {!photoUri ? (
            <View style={styles.photoRow}>
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.photoBtn, Boolean(photoError) && styles.inputError]}
                onPress={() => handlePhoto(true)}
                disabled={compressing}
              >
                <Camera size={15} color={COLORS.primary} />
                <Text style={styles.photoText}>Take photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.photoBtn, Boolean(photoError) && styles.inputError]}
                onPress={() => handlePhoto(false)}
                disabled={compressing}
              >
                <ImageIcon size={15} color={COLORS.primary} />
                <Text style={styles.photoText}>Choose photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.previewRow}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Preview attached photo full screen"
                activeOpacity={0.85}
                onPress={() => setLightboxOpen(true)}
              >
                <Image source={{ uri: photoUri }} style={styles.thumb} />
              </TouchableOpacity>
              <Text style={styles.thumbMeta}>{photoSizeKb} KB JPEG ready</Text>
              <TouchableOpacity
                onPress={() => {
                  setPhotoUri(null);
                  setPhotoSizeKb(0);
                }}
              >
                <Text style={styles.removeText}>Replace</Text>
              </TouchableOpacity>
            </View>
          )}

          {compressing && (
            <View style={styles.compressRow}>
              <ActivityIndicator size="small" color={COLORS.secondary} />
              <Text style={styles.limitText}>Compressing under 150 KB...</Text>
            </View>
          )}
          {Boolean(photoError) && (
            <Text style={styles.errorText}>{photoError}</Text>
          )}
        </View>

        {/* Hazard Type */}
        <View style={styles.field}>
          <Text style={styles.label}>Hazard type</Text>
          <View style={styles.chipRow}>
            {HAZARD_TYPES.map((t) => {
              const active = hazardType === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  accessibilityRole="button"
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setHazardType(t.value)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Road Condition */}
        <View style={styles.field}>
          <Text style={styles.label}>Road status</Text>
          <View style={styles.segmented}>
            {ROAD_STATES.map((opt, idx) => {
              const active = stateIdx === idx;
              return (
                <TouchableOpacity
                  key={opt.label}
                  accessibilityRole="button"
                  style={[styles.segBtn, active && styles.segBtnActive]}
                  onPress={() => setStateIdx(idx)}
                >
                  <Text style={[styles.segText, active && styles.segTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Landmark */}
        <View style={styles.field}>
          <Text style={styles.label}>Area or landmark</Text>
          <TextInput
            style={[styles.input, Boolean(nameError) && styles.inputError]}
            value={locationName}
            onChangeText={(v) => {
              setLocationName(v);
              setNameEdited(true);
              if (nameError) setNameError(null);
            }}
            placeholder="e.g., Tata Pani KM-412"
            placeholderTextColor={COLORS.textMuted}
          />
          {Boolean(nameError) && (
            <Text style={styles.errorText}>{nameError}</Text>
          )}
        </View>

        {/* Optional Note */}
        <View style={styles.field}>
          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="Boulders blocking both lanes..."
            placeholderTextColor={COLORS.textMuted}
          />
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.submitBtn, !canSubmit && styles.disabled]}
          onPress={handleSubmit}
          disabled={submitting || compressing}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.surface} />
          ) : (
            <Text style={styles.submitText}>
              {isConnected ? 'Post report' : 'Save offline'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <PhotoLightbox
        uri={lightboxOpen ? photoUri : null}
        caption={locationName.trim() || 'Attached photo preview'}
        onClose={() => setLightboxOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '76%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.borderStrong,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: TYPE.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  sub: { fontSize: TYPE.xs, color: COLORS.textMuted, marginTop: 1 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flexGrow: 0 },
  body: {
    padding: SPACING.lg,
    gap: 14,
    paddingBottom: 16,
  },
  field: { gap: 6 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { fontSize: TYPE.xs, fontWeight: '600', color: COLORS.textSecondary },
  limitText: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textMuted },
  gpsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  gpsLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  coordsText: {
    fontFamily: FONTS.mono,
    fontSize: TYPE.xs,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  gpsMeta: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: '600',
    marginTop: 1,
  },
  gpsPending: {
    fontSize: TYPE.xs,
    color: COLORS.secondaryText,
    fontWeight: '600',
  },
  gpsMissing: {
    fontSize: TYPE.xs,
    color: COLORS.textMuted,
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADIUS.control,
    paddingHorizontal: 10,
    minHeight: 34,
  },
  gpsBtnText: { fontSize: TYPE.xs, fontWeight: '600', color: COLORS.primary },
  photoRow: { flexDirection: 'row', gap: 8 },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.control,
    minHeight: 46,
  },
  photoText: { fontSize: TYPE.xs, fontWeight: '600', color: COLORS.primary },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.control,
    padding: 8,
  },
  thumb: { width: 48, height: 48, borderRadius: 6, backgroundColor: COLORS.primary },
  thumbMeta: {
    flex: 1,
    fontFamily: FONTS.mono,
    fontSize: TYPE.xs,
    color: COLORS.success,
    fontWeight: '600',
  },
  removeText: { fontSize: TYPE.xs, fontWeight: '600', color: COLORS.primary },
  compressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.control,
    paddingHorizontal: 11,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: TYPE.xs, fontWeight: '500', color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.surface, fontWeight: '600' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceSubtle,
    padding: 3,
    borderRadius: RADIUS.control,
  },
  segBtn: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  segBtnActive: { backgroundColor: COLORS.surface },
  segText: { fontSize: TYPE.xs, fontWeight: '600', color: COLORS.textSecondary },
  segTextActive: { color: COLORS.primary },
  input: {
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADIUS.control,
    paddingHorizontal: 12,
    minHeight: 44,
    fontSize: TYPE.sm,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.background,
  },
  inputError: { borderColor: COLORS.danger },
  errorText: { fontSize: TYPE.xs, color: COLORS.danger },
  submitBtn: {
    backgroundColor: COLORS.secondary,
    borderRadius: RADIUS.control,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  submitText: { fontSize: TYPE.md, fontWeight: '700', color: COLORS.surface },
  disabled: { opacity: 0.55 },
});
