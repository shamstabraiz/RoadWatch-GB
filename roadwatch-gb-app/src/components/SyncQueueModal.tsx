import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOut, RefreshCw, Trash2, X } from 'lucide-react-native';
import { UserProfile } from '../services/authService';
import { COLORS, FONTS, RADIUS, SPACING, TYPE } from '../theme/tokens';
import { HazardRecord } from '../types/hazard';

interface SyncQueueModalProps {
  visible: boolean;
  profile: UserProfile | null;
  localRecords: HazardRecord[];
  isConnected: boolean;
  isSyncing: boolean;
  onClose: () => void;
  onSyncNow: () => void;
  onClearSynced: () => void;
  onSignOut: () => void;
}

export function SyncQueueModal({
  visible,
  profile,
  localRecords,
  isConnected,
  isSyncing,
  onClose,
  onSyncNow,
  onClearSynced,
  onSignOut,
}: SyncQueueModalProps) {
  const insets = useSafeAreaInsets();
  const pendingCount = localRecords.filter(
    (r) => r.syncStatus === 'PENDING' || r.syncStatus === 'FAILED'
  ).length;
  const syncedCount = localRecords.filter((r) => r.syncStatus === 'SYNCED').length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { paddingBottom: Math.max(insets.bottom + 12, SPACING.xl) },
          ]}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{profile?.fullName || 'Account'}</Text>
              <Text style={styles.email}>{profile?.email}</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              style={styles.closeBtn}
              onPress={onClose}
            >
              <X size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>Offline queue</Text>
              <Text style={styles.statusMono}>
                {isConnected ? 'Online' : 'Offline'}, {pendingCount} pending
              </Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                accessibilityRole="button"
                style={[
                  styles.syncBtn,
                  (!isConnected || isSyncing || pendingCount === 0) &&
                  styles.disabled,
                ]}
                onPress={onSyncNow}
                disabled={!isConnected || isSyncing || pendingCount === 0}
              >
                <RefreshCw size={14} color={COLORS.surface} />
                <Text style={styles.syncBtnText}>
                  {isSyncing ? 'Syncing...' : 'Sync queued reports'}
                </Text>
              </TouchableOpacity>

              {syncedCount > 0 && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Clear synced cache"
                  style={styles.iconBtn}
                  onPress={onClearSynced}
                >
                  <Trash2 size={15} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {localRecords.length > 0 && (
              <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {localRecords.map((item) => (
                  <View key={item.id} style={styles.queueRow}>
                    <Text style={styles.queueTitle} numberOfLines={1}>
                      {item.locationName}
                    </Text>
                    <Text
                      style={[
                        styles.queueStatus,
                        item.syncStatus === 'SYNCED'
                          ? { color: COLORS.success }
                          : item.syncStatus === 'FAILED'
                            ? { color: COLORS.danger }
                            : { color: COLORS.secondaryText },
                      ]}
                    >
                      {item.syncStatus}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            style={styles.signOutBtn}
            onPress={() => {
              onClose();
              onSignOut();
            }}
          >
            <LogOut size={15} color={COLORS.danger} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 51, 43, 0.42)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    padding: SPACING.xl,
    gap: SPACING.lg,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: TYPE.lg, fontWeight: '700', color: COLORS.textPrimary },
  email: { fontSize: TYPE.xs, color: COLORS.textMuted, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: SPACING.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.lg,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: { fontSize: TYPE.sm, fontWeight: '700', color: COLORS.textPrimary },
  statusMono: { fontFamily: FONTS.mono, fontSize: TYPE.xs, color: COLORS.textMuted },
  actionRow: { flexDirection: 'row', gap: 8 },
  syncBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.control,
    minHeight: 44,
  },
  syncBtnText: { fontSize: TYPE.sm, fontWeight: '600', color: COLORS.surface },
  iconBtn: {
    width: 44,
    minHeight: 44,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  list: { maxHeight: 160 },
  queueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceSubtle,
  },
  queueTitle: { flex: 1, fontSize: TYPE.sm, color: COLORS.textPrimary, marginRight: 8 },
  queueStatus: { fontFamily: FONTS.mono, fontSize: 11, fontWeight: '700' },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    borderRadius: RADIUS.control,
    backgroundColor: COLORS.dangerSoft,
  },
  signOutText: { fontSize: TYPE.sm, fontWeight: '600', color: COLORS.danger },
});

