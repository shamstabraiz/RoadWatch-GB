import React, { useEffect, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckCircle2,
  Clock,
  ImageOff,
  Plus,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react-native';
import { CLEAR_VOTES_THRESHOLD } from '../services/supabaseSync';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { HazardRecord, HotspotZone } from '../types/hazard';
import { PhotoLightbox } from './PhotoLightbox';

interface HotspotSheetProps {
  hotspot: HotspotZone;
  currentUserId: string;
  busyHazardId: string | null;
  confirmedIds: string[];
  clearVotedIds: string[];
  refreshing: boolean;
  onRefresh: () => void;
  onClose: () => void;
  onConfirmActive: (hazard: HazardRecord) => void;
  onMarkCleared: (hazard: HazardRecord) => void;
  onCancelOwn: (hazard: HazardRecord) => void;
  onAddReportHere: () => void;
}

function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatAge(ts: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function HazardPhoto({
  photoUrl,
  localPhotoUri,
  onPress,
}: {
  photoUrl: string | null;
  localPhotoUri: string | null;
  onPress: (resolvedUri: string) => void;
}) {
  const primary = photoUrl || localPhotoUri;
  const fallback = photoUrl && localPhotoUri ? localPhotoUri : null;
  const [uri, setUri] = useState<string | null>(primary);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUri(primary);
    setFailed(false);
  }, [primary]);

  if (!uri) return null;

  if (failed) {
    return (
      <View style={styles.photoFallback}>
        <ImageOff size={18} color={COLORS.textMuted} />
        <Text style={styles.photoFallbackText}>Photo unavailable</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="View full hazard photo"
      activeOpacity={0.9}
      onPress={() => onPress(uri)}
    >
      <Image
        source={{ uri }}
        style={styles.photo}
        resizeMode="cover"
        onError={() => {
          if (fallback && uri !== fallback) {
            setUri(fallback);
          } else {
            setFailed(true);
          }
        }}
      />
    </TouchableOpacity>
  );
}

export function HotspotSheet({
  hotspot,
  currentUserId,
  busyHazardId,
  confirmedIds,
  clearVotedIds,
  refreshing,
  onRefresh,
  onClose,
  onConfirmActive,
  onMarkCleared,
  onCancelOwn,
  onAddReportHere,
}: HotspotSheetProps) {
  const insets = useSafeAreaInsets();
  const [lightbox, setLightbox] = useState<{ uri: string; caption: string } | null>(null);
  return (
    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.handle} />

      {/* Hotspot Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {hotspot.title}
            </Text>
            <View
              style={[
                styles.countPill,
                hotspot.isCleared && styles.countPillCleared,
              ]}
            >
              <Text
                style={[
                  styles.countPillText,
                  hotspot.isCleared && styles.countPillTextCleared,
                ]}
              >
                {hotspot.isCleared
                  ? 'Cleared'
                  : `${hotspot.reports.length} report${hotspot.reports.length === 1 ? '' : 's'}`}
              </Text>
            </View>
          </View>
          <Text style={styles.coords}>
            {hotspot.corridor.replace('_', ' ')}  {hotspot.centerLat.toFixed(4)}°N,{' '}
            {hotspot.centerLng.toFixed(4)}°E
          </Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Close hotspot details"
          style={styles.closeBtn}
          onPress={onClose}
        >
          <X size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {hotspot.reports.map((hazard) => {
          const isOwner = Boolean(
            hazard.reporterId && hazard.reporterId === currentUserId
          );
          const isPending =
            hazard.syncStatus === 'PENDING' || hazard.syncStatus === 'FAILED';
          const isCleared = hazard.clearanceStatus === 'CLEARED';
          const isBusy = busyHazardId === hazard.id;

          return (
            <View key={hazard.id} style={styles.reportBlock}>
              <View style={styles.reportTop}>
                <View style={styles.badgeRow}>
                  <Text style={styles.hazardName}>
                    {titleCase(hazard.hazardType)}
                  </Text>
                  <Text style={styles.severityLabel}>
                    {titleCase(hazard.severity)}
                  </Text>
                  {isOwner && <Text style={styles.ownerBadge}>Your report</Text>}
                </View>
                <Text style={styles.ageText}>{formatAge(hazard.createdAt)}</Text>
              </View>

              {Boolean(hazard.description) && (
                <Text style={styles.description}>{hazard.description}</Text>
              )}

              <HazardPhoto
                photoUrl={hazard.photoUrl}
                localPhotoUri={hazard.localPhotoUri}
                onPress={(resolvedUri) =>
                  setLightbox({
                    uri: resolvedUri,
                    caption: `${titleCase(hazard.hazardType)} — ${hotspot.title}`,
                  })
                }
              />

              <View style={styles.metaRow}>
                {isPending ? (
                  <View style={styles.metaItem}>
                    <Clock size={13} color={COLORS.secondary} />
                    <Text style={styles.metaText}>Queued offline</Text>
                  </View>
                ) : (
                  <View style={styles.metaItem}>
                    <CheckCircle2
                      size={13}
                      color={isCleared ? COLORS.success : COLORS.primary}
                    />
                    <Text style={styles.metaText}>
                      {isCleared
                        ? 'Road marked clear'
                        : `${hazard.confirmations} confirmed`}
                    </Text>
                  </View>
                )}

                {!isCleared && hazard.clearVotes > 0 && (
                  <Text style={styles.clearVoteHint}>
                    {hazard.clearVotes}/{CLEAR_VOTES_THRESHOLD} clear votes
                  </Text>
                )}
              </View>

              {/* Contextual Actions: Creator vs Other Travelers */}
              {!isCleared && (
                <View style={styles.actionRow}>
                  {isOwner ? (
                    <>
                      <TouchableOpacity
                        accessibilityRole="button"
                        style={[styles.primaryAction, isBusy && styles.disabled]}
                        onPress={() => onMarkCleared(hazard)}
                        disabled={isBusy || isPending}
                      >
                        <CheckCircle2 size={14} color={COLORS.surface} />
                        <Text style={styles.primaryActionText}>
                          Mark road cleared
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        accessibilityRole="button"
                        style={[styles.dangerBtn, isBusy && styles.disabled]}
                        onPress={() => onCancelOwn(hazard)}
                        disabled={isBusy}
                      >
                        <Trash2 size={14} color={COLORS.danger} />
                        <Text style={styles.dangerBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    </>
                  ) : !isPending ? (
                    <>
                      {(() => {
                        const hasConfirmed = confirmedIds.includes(hazard.id);
                        const hasVotedClear = clearVotedIds.includes(hazard.id);
                        return (
                          <>
                            <TouchableOpacity
                              accessibilityRole="button"
                              style={[
                                styles.primaryAction,
                                (isBusy || hasConfirmed) && styles.disabled,
                              ]}
                              onPress={() => onConfirmActive(hazard)}
                              disabled={isBusy || hasConfirmed}
                            >
                              {hasConfirmed ? (
                                <CheckCircle2 size={14} color={COLORS.surface} />
                              ) : (
                                <ThumbsUp size={14} color={COLORS.surface} />
                              )}
                              <Text style={styles.primaryActionText}>
                                {hasConfirmed
                                  ? `Confirmed (${hazard.confirmations})`
                                  : `Still blocked (${hazard.confirmations})`}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              accessibilityRole="button"
                              style={[
                                styles.secondaryAction,
                                (isBusy || hasVotedClear) && styles.disabled,
                              ]}
                              onPress={() => onMarkCleared(hazard)}
                              disabled={isBusy || hasVotedClear}
                            >
                              <Text style={styles.secondaryActionText}>
                                {hasVotedClear ? 'Voted clear' : 'Road is clear'}
                              </Text>
                            </TouchableOpacity>
                          </>
                        );
                      })()}
                    </>
                  ) : null}
                </View>
              )}

              {isCleared && isOwner && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={[styles.dangerBtn, isBusy && styles.disabled]}
                    onPress={() => onCancelOwn(hazard)}
                    disabled={isBusy}
                  >
                    <Trash2 size={14} color={COLORS.danger} />
                    <Text style={styles.dangerBtnText}>Delete report</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Footer: Add another report at this location */}
      <View style={styles.footer}>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.addHereBtn}
          onPress={onAddReportHere}
        >
          <Plus size={15} color={COLORS.primary} />
          <Text style={styles.addHereText}>Add report from my GPS</Text>
        </TouchableOpacity>
      </View>

      <PhotoLightbox
        uri={lightbox?.uri ?? null}
        caption={lightbox?.caption}
        onClose={() => setLightbox(null)}
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
    maxHeight: '72%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 12,
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  headerLeft: { flex: 1, gap: 3, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    fontSize: TYPE.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  countPill: {
    backgroundColor: COLORS.secondarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  countPillCleared: { backgroundColor: COLORS.successSoft },
  countPillText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.secondaryText,
  },
  countPillTextCleared: { color: COLORS.success },
  coords: {
    fontFamily: FONTS.mono,
    fontSize: TYPE.xs,
    color: COLORS.textMuted,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flexGrow: 0 },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  reportBlock: {
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  reportTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hazardName: {
    fontSize: TYPE.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  severityLabel: {
    fontSize: TYPE.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  ownerBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
    backgroundColor: COLORS.surfaceSubtle,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ageText: { fontSize: TYPE.xs, color: COLORS.textMuted },
  description: {
    fontSize: TYPE.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  photo: {
    width: '100%',
    height: 156,
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.surfaceSubtle,
  },
  photoFallback: {
    width: '100%',
    height: 112,
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoFallbackText: {
    fontSize: TYPE.xs,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: TYPE.xs, fontWeight: '500', color: COLORS.textSecondary },
  clearVoteHint: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: COLORS.success,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.control,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  primaryActionText: {
    fontSize: TYPE.sm,
    fontWeight: '600',
    color: COLORS.surface,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.control,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  secondaryActionText: {
    fontSize: TYPE.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: COLORS.dangerSoft,
    borderRadius: RADIUS.control,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  dangerBtnText: {
    fontSize: TYPE.sm,
    fontWeight: '600',
    color: COLORS.danger,
  },
  disabled: { opacity: 0.55 },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  addHereBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.control,
    minHeight: 44,
  },
  addHereText: {
    fontSize: TYPE.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },
});

