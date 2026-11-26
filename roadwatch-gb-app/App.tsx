import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { Session } from '@supabase/supabase-js';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CloudOff,
  Crosshair,
  Layers,
  Plus,
  RefreshCw,
} from 'lucide-react-native';
import { HotspotSheet } from './src/components/HotspotSheet';
import {
  InteractiveGbMap,
  MapLayerMode,
} from './src/components/InteractiveGbMap';
import { GpsFix, ReportSheet } from './src/components/ReportSheet';
import { SyncQueueModal } from './src/components/SyncQueueModal';
import { Toast, ToastMessage } from './src/components/Toast';
import { getSupabaseClient, isSupabaseConfigured } from './src/config/supabaseConfig';
import { GB_CORRIDORS } from './src/data/gbCorridors';
import { AuthScreen } from './src/screens/AuthScreen';
import {
  fetchUserProfile,
  getCurrentSession,
  signOutUser,
  UserProfile,
} from './src/services/authService';
import { buildHotspotZones } from './src/services/hotspotClustering';
import {
  clearSyncedLocalHazards,
  getLocalHazards,
  saveLocalHazard,
} from './src/services/localDatabase';
import {
  cancelOwnHazard,
  confirmHazardActive,
  fetchCloudHazards,
  fetchUserHazardVotes,
  markHazardCleared,
  syncPendingHazardsToSupabase,
} from './src/services/supabaseSync';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from './src/theme/tokens';
import { CorridorId, HazardRecord } from './src/types/hazard';

function formatShortAge(ts: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function getInitials(name?: string | null, email?: string | null): string {
  const src = (name || email || 'U').trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

function RoadWatchApp() {
  const insets = useSafeAreaInsets();
  const [authChecking, setAuthChecking] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [selectedCorridor, setSelectedCorridor] = useState<CorridorId | 'ALL'>('ALL');
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [mapLayer, setMapLayer] = useState<MapLayerMode>('terrain');
  const [userLocation, setUserLocation] = useState<GpsFix | null>(null);
  const [locating, setLocating] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [queueModalOpen, setQueueModalOpen] = useState(false);

  const [isConnected, setIsConnected] = useState(true);
  const [localRecords, setLocalRecords] = useState<HazardRecord[]>([]);
  const [cloudRecords, setCloudRecords] = useState<HazardRecord[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [busyHazardId, setBusyHazardId] = useState<string | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [clearVotedIds, setClearVotedIds] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const isSyncingRef = useRef(false);
  const isConnectedRef = useRef(true);
  const sessionRef = useRef<Session | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supabaseReady = isSupabaseConfigured();

  const showToast = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    setToast({ text, tone });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const acquireUserLocation = useCallback(
    async (silent = false) => {
      setLocating(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!silent) {
            showToast('Enable location permission to use GPS.', 'info');
          }
          return null;
        }
        const fix = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const next: GpsFix = {
          latitude: Number(fix.coords.latitude.toFixed(5)),
          longitude: Number(fix.coords.longitude.toFixed(5)),
          altitude: fix.coords.altitude,
          accuracy: fix.coords.accuracy,
        };
        setUserLocation(next);
        return next;
      } catch {
        if (!silent) {
          showToast('Unable to acquire GPS signal right now.', 'error');
        }
        return null;
      } finally {
        setLocating(false);
      }
    },
    [showToast]
  );

  const refreshAuth = useCallback(async () => {
    try {
      const current = await getCurrentSession();
      sessionRef.current = current;
      setSession(current);
      if (current?.user) {
        const userProfile = await fetchUserProfile(current.user);
        setProfile(userProfile);
      } else {
        setProfile(null);
      }
    } finally {
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
    if (!supabaseReady) return;
    const supabase = getSupabaseClient();
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      sessionRef.current = nextSession;
      setSession(nextSession);
      if (nextSession?.user) {
        fetchUserProfile(nextSession.user).then(setProfile).catch(() => {});
      } else {
        setProfile(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [refreshAuth, supabaseReady]);

  const loadLocal = useCallback(async () => {
    const items = await getLocalHazards();
    setLocalRecords(items);
  }, []);

  const loadCloud = useCallback(async () => {
    if (!supabaseReady) return;
    setIsLoadingCloud(true);
    try {
      const remote = await fetchCloudHazards();
      setCloudRecords(remote);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Unable to load map reports.',
        'error'
      );
    } finally {
      setIsLoadingCloud(false);
    }
  }, [supabaseReady, showToast]);

  const handlePullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadLocal(),
        loadCloud(),
        sessionRef.current?.user?.id
          ? fetchUserHazardVotes(sessionRef.current.user.id)
              .then((votes) => {
                setConfirmedIds(votes.confirmed);
                setClearVotedIds(votes.cleared);
              })
              .catch(() => {})
          : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadLocal, loadCloud]);

  const runSync = useCallback(
    async (quiet = false) => {
      if (!isConnectedRef.current || isSyncingRef.current || !sessionRef.current) {
        return;
      }
      isSyncingRef.current = true;
      setIsSyncing(true);
      try {
        const report = await syncPendingHazardsToSupabase();
        await loadLocal();
        if (report.synced > 0) {
          await loadCloud();
        }
        if (report.lastError) {
          if (!quiet) showToast(report.lastError, 'error');
        } else if (report.attempted > 0) {
          showToast(`Synced ${report.synced} queued report(s).`, 'success');
        }
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    },
    [loadCloud, loadLocal, showToast]
  );

  useEffect(() => {
    if (!session) {
      setConfirmedIds([]);
      setClearVotedIds([]);
      return;
    }
    loadLocal();
    loadCloud();
    fetchUserHazardVotes(session.user.id)
      .then((votes) => {
        setConfirmedIds(votes.confirmed);
        setClearVotedIds(votes.cleared);
      })
      .catch(() => {});
    acquireUserLocation(true);

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      const wasOffline = !isConnectedRef.current;
      isConnectedRef.current = online;
      setIsConnected(online);
      if (online && wasOffline && isSupabaseConfigured()) {
        runSync(true);
      }
    });

    return () => unsubscribe();
  }, [session?.user?.id, loadCloud, loadLocal, runSync, acquireUserLocation]);

  const mergedHazards = useMemo(() => {
    const byId = new Map<string, HazardRecord>();
    cloudRecords.forEach((item) => byId.set(item.id, item));
    localRecords.forEach((item) => {
      if (!byId.has(item.id) || item.syncStatus !== 'SYNCED') {
        byId.set(item.id, item);
      }
    });
    return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [cloudRecords, localRecords]);

  const hotspots = useMemo(() => buildHotspotZones(mergedHazards), [mergedHazards]);

  const visibleHotspots = useMemo(
    () =>
      selectedCorridor === 'ALL'
        ? hotspots
        : hotspots.filter((z) => z.corridor === selectedCorridor),
    [hotspots, selectedCorridor]
  );

  const activeHotspotCount = useMemo(
    () => visibleHotspots.filter((z) => !z.isCleared).length,
    [visibleHotspots]
  );

  const selectedHotspot = useMemo(
    () => hotspots.find((z) => z.id === selectedHotspotId) ?? null,
    [hotspots, selectedHotspotId]
  );

  const pendingCount = useMemo(
    () =>
      localRecords.filter(
        (r) => r.syncStatus === 'PENDING' || r.syncStatus === 'FAILED'
      ).length,
    [localRecords]
  );

  function openNewReport() {
    setSelectedHotspotId(null);
    setDrawerExpanded(false);
    setReportOpen(true);
  }

  async function handleSubmitReport(record: HazardRecord) {
    const updated = await saveLocalHazard(record);
    setLocalRecords(updated);
    setReportOpen(false);

    if (isConnectedRef.current && supabaseReady && sessionRef.current) {
      await runSync(false);
    } else {
      showToast('Saved offline. Will sync automatically once signal returns.', 'info');
    }
  }

  async function handleConfirmActive(hazard: HazardRecord) {
    if (!session?.user?.id || busyHazardId) return;
    setBusyHazardId(hazard.id);
    try {
      await confirmHazardActive(hazard, session.user.id);
      setConfirmedIds((prev) => (prev.includes(hazard.id) ? prev : [...prev, hazard.id]));
      await loadCloud();
      showToast(`Confirmed blockage at ${hazard.locationName}.`, 'success');
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('already')) {
        setConfirmedIds((prev) => (prev.includes(hazard.id) ? prev : [...prev, hazard.id]));
      }
      showToast(
        err instanceof Error ? err.message : 'Unable to confirm report.',
        'error'
      );
    } finally {
      setBusyHazardId(null);
    }
  }

  async function handleMarkCleared(hazard: HazardRecord) {
    if (!session?.user?.id || busyHazardId) return;
    setBusyHazardId(hazard.id);
    try {
      const result = await markHazardCleared(hazard, session.user.id);
      setClearVotedIds((prev) => (prev.includes(hazard.id) ? prev : [...prev, hazard.id]));
      await loadCloud();
      showToast(
        result === 'CLEARED'
          ? `${hazard.locationName} marked road cleared.`
          : 'Clear vote recorded. One more traveler confirmation will clear this road.',
        'success'
      );
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('already')) {
        setClearVotedIds((prev) => (prev.includes(hazard.id) ? prev : [...prev, hazard.id]));
      }
      showToast(
        err instanceof Error ? err.message : 'Unable to update road status.',
        'error'
      );
    } finally {
      setBusyHazardId(null);
    }
  }

  async function handleCancelOwn(hazard: HazardRecord) {
    if (busyHazardId) return;
    setBusyHazardId(hazard.id);
    try {
      await cancelOwnHazard(hazard);
      await loadLocal();
      await loadCloud();
      setSelectedHotspotId(null);
      showToast('Report cancelled and removed.', 'info');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Unable to cancel report.',
        'error'
      );
    } finally {
      setBusyHazardId(null);
    }
  }

  async function handleClearSynced() {
    const remaining = await clearSyncedLocalHazards();
    setLocalRecords(remaining);
    showToast('Cleared synced local cache.', 'info');
  }

  async function handleSignOut() {
    await signOutUser();
    sessionRef.current = null;
    setSession(null);
    setProfile(null);
    setSelectedHotspotId(null);
    setReportOpen(false);
  }

  if (authChecking) {
    return (
      <SafeAreaView style={styles.splash}>
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.authSafe} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <AuthScreen onAuthenticated={refreshAuth} />
      </SafeAreaView>
    );
  }

  const safeBottom = Math.max(insets.bottom, 12);
  const safeSide = Math.max(insets.left, insets.right, 16);
  const selectedCorridorName =
    selectedCorridor === 'ALL'
      ? 'Gilgit-Baltistan'
      : GB_CORRIDORS.find((c) => c.id === selectedCorridor)?.name ?? 'Corridor';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {/* Solid Full-Width App Header */}
      <View
        style={[
          styles.appHeader,
          {
            paddingTop: Math.max(insets.top + 8, 12),
            paddingLeft: safeSide,
            paddingRight: safeSide,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.brandGroup}>
            <Text style={styles.brandTitle} numberOfLines={1}>
              RoadWatch GB
            </Text>
            <Text style={styles.brandSub} numberOfLines={1}>
              {selectedCorridorName}
            </Text>
          </View>

          <View style={styles.headerRight}>
            {(!isConnected || pendingCount > 0) && (
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.queueChip}
                onPress={() => setQueueModalOpen(true)}
              >
                <CloudOff size={12} color={COLORS.secondaryText} />
                <Text style={styles.queueChipText}>{pendingCount}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Account and offline queue"
              style={styles.avatarBtn}
              onPress={() => setQueueModalOpen(true)}
            >
              <Text style={styles.avatarText}>
                {getInitials(profile?.fullName, session.user.email)}
              </Text>
              {pendingCount > 0 && <View style={styles.avatarBadge} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Corridor Filter Row inside Header */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillStrip}
        >
          <TouchableOpacity
            accessibilityRole="button"
            style={[
              styles.corridorPill,
              selectedCorridor === 'ALL' && styles.corridorPillActive,
            ]}
            onPress={() => {
              setSelectedCorridor('ALL');
              setSelectedHotspotId(null);
            }}
          >
            <Text
              style={[
                styles.pillText,
                selectedCorridor === 'ALL' && styles.pillTextActive,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>

          {GB_CORRIDORS.map((c) => {
            const active = selectedCorridor === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                accessibilityRole="button"
                style={[styles.corridorPill, active && styles.corridorPillActive]}
                onPress={() => {
                  setSelectedCorridor(c.id);
                  setSelectedHotspotId(null);
                }}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {c.code} {c.name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Map Workspace Below Header */}
      <View style={styles.mapWorkspace}>
        <View style={styles.mapLayer}>
          <InteractiveGbMap
            hotspots={hotspots}
            selectedCorridor={selectedCorridor}
            selectedHotspotId={selectedHotspotId}
            isConnected={isConnected}
            mapLayer={mapLayer}
            userLocation={userLocation}
            onSelectHotspot={(id) => {
              setReportOpen(false);
              setDrawerExpanded(false);
              setSelectedHotspotId(id);
            }}
          />
        </View>

      {/* Unified Vertical Map Control Rail (Right Edge) */}
      {!selectedHotspot && !reportOpen && !drawerExpanded && (
        <View
          style={[
            styles.mapRail,
            {
              right: safeSide,
              bottom: safeBottom + 158,
            },
          ]}
        >
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Switch Terrain and Satellite map"
            style={styles.railBtn}
            onPress={() =>
              setMapLayer((prev) => (prev === 'terrain' ? 'satellite' : 'terrain'))
            }
          >
            <Layers
              size={17}
              color={mapLayer === 'satellite' ? COLORS.secondary : COLORS.primary}
            />
          </TouchableOpacity>

          <View style={styles.railDivider} />

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Locate my GPS position"
            style={styles.railBtn}
            onPress={() => acquireUserLocation(false)}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Crosshair
                size={17}
                color={userLocation ? '#2563EB' : COLORS.primary}
              />
            )}
          </TouchableOpacity>

          <View style={styles.railDivider} />

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Refresh road reports"
            style={styles.railBtn}
            onPress={loadCloud}
          >
            <RefreshCw
              size={16}
              color={isLoadingCloud ? COLORS.secondary : COLORS.primary}
            />
          </TouchableOpacity>
        </View>
      )}

      {/* Anchored Expandable Bottom Sheet (Apple/Google Maps style) */}
      {!selectedHotspot && !reportOpen && (
        <View
          style={[
            styles.homeSheet,
            drawerExpanded && styles.homeSheetExpanded,
            { paddingBottom: safeBottom },
          ]}
        >
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              drawerExpanded ? 'Collapse hotspot list' : 'Expand hotspot list'
            }
            style={styles.handleZone}
            onPress={() => setDrawerExpanded((prev) => !prev)}
          >
            <View style={styles.handleBar} />
          </TouchableOpacity>

          {/* Primary Action Bar */}
          <View style={styles.sheetTopBar}>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.summaryTap}
              onPress={() => setDrawerExpanded((prev) => !prev)}
            >
              <View style={styles.summaryTitleRow}>
                <Text style={styles.sheetTitle}>
                  {activeHotspotCount === 0
                    ? 'Routes clear'
                    : `${activeHotspotCount} active hotspot${
                        activeHotspotCount === 1 ? '' : 's'
                      }`}
                </Text>
                {visibleHotspots.length > 0 &&
                  (drawerExpanded ? (
                    <ChevronDown size={16} color={COLORS.textMuted} />
                  ) : (
                    <ChevronUp size={16} color={COLORS.textMuted} />
                  ))}
              </View>
              <Text style={styles.sheetSub} numberOfLines={1}>
                {userLocation
                  ? `GPS locked (${userLocation.latitude.toFixed(3)}°N, ${userLocation.longitude.toFixed(3)}°E)`
                  : 'Tap a hotspot on map to inspect or confirm'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              style={styles.reportBtn}
              onPress={openNewReport}
            >
              <Plus size={16} color={COLORS.surface} />
              <Text style={styles.reportBtnText}>Report</Text>
            </TouchableOpacity>
          </View>

          {/* Hotspot Rows: 1 preview row when collapsed, full scrollable ledger when expanded */}
          {visibleHotspots.length > 0 && (
            <ScrollView
              style={drawerExpanded ? styles.expandedList : styles.peekList}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handlePullRefresh}
                  tintColor={COLORS.primary}
                  colors={[COLORS.primary]}
                />
              }
            >
              {(drawerExpanded ? visibleHotspots : visibleHotspots.slice(0, 1)).map(
                (zone) => (
                  <TouchableOpacity
                    key={zone.id}
                    accessibilityRole="button"
                    style={styles.hotspotRow}
                    onPress={() => {
                      setDrawerExpanded(false);
                      setSelectedHotspotId(zone.id);
                    }}
                  >
                    <View
                      style={[
                        styles.rowStatusDot,
                        {
                          backgroundColor: zone.isCleared
                            ? COLORS.success
                            : zone.maxSeverity === 'CRITICAL'
                            ? COLORS.danger
                            : COLORS.secondary,
                        },
                      ]}
                    />
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {zone.title}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {zone.isCleared
                          ? 'Road cleared'
                          : `${zone.reports.length} report${
                              zone.reports.length === 1 ? '' : 's'
                            }, ${zone.totalConfirmations} confirmed`}
                      </Text>
                    </View>
                    <Text style={styles.rowAge}>
                      {formatShortAge(zone.primaryHazard.createdAt)}
                    </Text>
                    <ChevronRight size={15} color={COLORS.textMuted} />
                  </TouchableOpacity>
                )
              )}

              {!drawerExpanded && visibleHotspots.length > 1 && (
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.moreLinkRow}
                  onPress={() => setDrawerExpanded(true)}
                >
                  <Text style={styles.moreLinkText}>
                    View all {visibleHotspots.length} areas
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      )}

      {/* Selected Hotspot Detail Sheet */}
      {selectedHotspot && !reportOpen && (
        <HotspotSheet
          hotspot={selectedHotspot}
          currentUserId={session.user.id}
          busyHazardId={busyHazardId}
          confirmedIds={confirmedIds}
          clearVotedIds={clearVotedIds}
          refreshing={refreshing}
          onRefresh={handlePullRefresh}
          onClose={() => setSelectedHotspotId(null)}
          onConfirmActive={handleConfirmActive}
          onMarkCleared={handleMarkCleared}
          onCancelOwn={handleCancelOwn}
          onAddReportHere={openNewReport}
        />
      )}

      {/* Report Hazard Sheet (GPS-Only + Photo Required) */}
      {reportOpen && (
        <ReportSheet
          currentUserId={session.user.id}
          isConnected={isConnected}
          initialGpsFix={userLocation}
          onGpsLocked={setUserLocation}
          onClose={() => setReportOpen(false)}
          onSubmitReport={handleSubmitReport}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* Account & Offline Queue Modal */}
      </View>

      <SyncQueueModal
        visible={queueModalOpen}
        profile={profile}
        localRecords={localRecords}
        isConnected={isConnected}
        isSyncing={isSyncing}
        onClose={() => setQueueModalOpen(false)}
        onSyncNow={() => runSync(false)}
        onClearSynced={handleClearSynced}
        onSignOut={handleSignOut}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <RoadWatchApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authSafe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  root: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  appHeader: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
    zIndex: 20,
  },
  mapWorkspace: {
    flex: 1,
    position: 'relative',
    backgroundColor: COLORS.primary,
  },
  mapLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  brandGroup: {
    flex: 1,
    minWidth: 0,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  brandSub: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  queueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.secondarySoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: RADIUS.control,
  },
  queueChipText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.secondaryText,
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: FONTS.mono,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.surface,
  },
  avatarBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.secondary,
    borderWidth: 1.5,
    borderColor: COLORS.surface,
  },
  pillStrip: {
    gap: 18,
    paddingRight: 8,
  },
  corridorPill: {
    paddingVertical: 9,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  corridorPillActive: {
    borderBottomColor: COLORS.primary,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  pillTextActive: {
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  mapRail: {
    position: 'absolute',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    zIndex: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  railBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  homeSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 10,
  },
  homeSheetExpanded: {
    maxHeight: '62%',
  },
  handleZone: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.borderStrong,
  },
  sheetTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: 12,
  },
  summaryTap: {
    flex: 1,
    minWidth: 0,
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sheetTitle: {
    fontSize: TYPE.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  sheetSub: {
    fontSize: TYPE.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.secondary,
    borderRadius: RADIUS.control,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  reportBtnText: {
    fontSize: TYPE.sm,
    fontWeight: '700',
    color: COLORS.surface,
  },
  peekList: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  expandedList: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    maxHeight: 320,
  },
  hotspotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceSubtle,
  },
  rowStatusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    fontSize: TYPE.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  rowMeta: {
    fontSize: TYPE.xs,
    color: COLORS.textMuted,
  },
  rowAge: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  moreLinkRow: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  moreLinkText: {
    fontSize: TYPE.xs,
    fontWeight: '600',
    color: COLORS.secondaryText,
  },
});
