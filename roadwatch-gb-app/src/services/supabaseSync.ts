import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import {
  getSupabaseClient,
  isSupabaseConfigured,
  supabaseConfig,
} from '../config/supabaseConfig';
import {
  ClearanceStatus,
  CorridorId,
  HazardRecord,
  HazardType,
  SeverityLevel,
  VerificationStatus,
} from '../types/hazard';
import {
  getLocalUserVotes,
  getPendingLocalHazards,
  recordLocalUserVote,
  removeLocalHazard,
  saveLocalUserVotes,
  updateLocalHazardStatus,
  UserVoteLedger,
  VoteType,
} from './localDatabase';
import { computeTrustScore, VERIFICATION_TRUST_THRESHOLD } from './spatialAlgorithm';

const HAZARDS_TABLE = 'hazards';
const HAZARD_VOTES_TABLE = 'hazard_votes';
const PHOTOS_BUCKET = 'hazard-photos';
export const CLEAR_VOTES_THRESHOLD = 2;

export interface SyncBatchReport {
  attempted: number;
  synced: number;
  failed: number;
  lastError: string | null;
}

interface SupabaseHazardRow {
  id: string;
  reporter_id?: string | null;
  corridor: CorridorId;
  location_name: string;
  hazard_type: HazardType;
  severity: SeverityLevel;
  description: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  photo_url: string | null;
  photo_size_kb: number;
  verification_status: VerificationStatus;
  clearance_status: ClearanceStatus;
  confirmations: number;
  clear_votes?: number;
  trust_score: number;
  cluster_id: string | null;
  created_at: number;
  updated_at: number;
}

function mapRowToHazard(row: SupabaseHazardRow): HazardRecord {
  return {
    id: row.id,
    reporterId: row.reporter_id ?? null,
    corridor: row.corridor,
    locationName: row.location_name,
    hazardType: row.hazard_type,
    severity: row.severity,
    description: row.description ?? '',
    latitude: row.latitude,
    longitude: row.longitude,
    altitude: row.altitude,
    localPhotoUri: null,
    photoUrl: row.photo_url,
    photoSizeKb: row.photo_size_kb ?? 0,
    syncStatus: 'SYNCED',
    verificationStatus: row.verification_status,
    clearanceStatus: row.clearance_status,
    confirmations: row.confirmations,
    clearVotes: row.clear_votes ?? 0,
    trustScore: row.trust_score,
    clusterId: row.cluster_id,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function fetchCloudHazards(): Promise<HazardRecord[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(HAZARDS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as SupabaseHazardRow[]).map(mapRowToHazard);
}

function isValidImageBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 100) return false;
  const header = new Uint8Array(buffer, 0, 4);
  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isPng =
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47;
  const isWebp =
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46;
  return isJpeg || isPng || isWebp;
}

async function uploadEvidencePhoto(hazardId: string, localUri: string): Promise<string> {
  const supabase = getSupabaseClient();
  const path = `${hazardId}.jpg`;

  if (Platform.OS !== 'web') {
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists || (typeof info.size === 'number' && info.size < 100)) {
      throw new Error('Local photo file is missing or empty. Please retake the photo.');
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new Error('Sign in required to upload hazard photo.');
    }

    const uploadUrl = `${supabaseConfig.url}/storage/v1/object/${PHOTOS_BUCKET}/${path}`;
    const result = await FileSystem.uploadAsync(uploadUrl, localUri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        apikey: supabaseConfig.anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true',
      },
    });

    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Photo upload failed (${result.status}): ${result.body || 'Storage error'}`);
    }

    const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error(`Could not read photo (${response.status}).`);
  }
  const arrayBuffer = await response.arrayBuffer();
  if (!isValidImageBuffer(arrayBuffer)) {
    throw new Error('Selected photo file is empty or unreadable.');
  }

  const { error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(path, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function syncPendingHazardsToSupabase(): Promise<SyncBatchReport> {
  if (!isSupabaseConfigured()) {
    return {
      attempted: 0,
      synced: 0,
      failed: 0,
      lastError:
        'Supabase config missing. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.',
    };
  }

  const pending = await getPendingLocalHazards();
  if (pending.length === 0) {
    return { attempted: 0, synced: 0, failed: 0, lastError: null };
  }

  const supabase = getSupabaseClient();
  const { data: authData } = await supabase.auth.getUser();
  const currentUserId = authData.user?.id ?? null;

  if (!currentUserId) {
    return {
      attempted: pending.length,
      synced: 0,
      failed: pending.length,
      lastError: 'Sign in required before syncing local reports.',
    };
  }

  let synced = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const record of pending) {
    try {
      await updateLocalHazardStatus(record.id, 'SYNCING', { syncError: undefined });

      let photoUrl = record.photoUrl;
      if (record.localPhotoUri && !photoUrl) {
        photoUrl = await uploadEvidencePhoto(record.id, record.localPhotoUri);
      }

      const rowPayload: SupabaseHazardRow = {
        id: record.id,
        reporter_id: currentUserId,
        corridor: record.corridor,
        location_name: record.locationName,
        hazard_type: record.hazardType,
        severity: record.severity,
        description: record.description,
        latitude: record.latitude,
        longitude: record.longitude,
        altitude: record.altitude,
        photo_url: photoUrl ?? null,
        photo_size_kb: Math.max(1, Math.min(150, record.photoSizeKb || 1)),
        verification_status: record.verificationStatus,
        clearance_status: record.clearanceStatus,
        confirmations: record.confirmations,
        clear_votes: record.clearVotes ?? 0,
        trust_score: record.trustScore,
        cluster_id: record.clusterId,
        created_at: record.createdAt,
        updated_at: Date.now(),
      };

      const { error } = await supabase
        .from(HAZARDS_TABLE)
        .upsert(rowPayload, { onConflict: 'id' });

      if (error) {
        throw new Error(error.message);
      }

      await updateLocalHazardStatus(record.id, 'SYNCED', {
        reporterId: currentUserId,
        photoUrl: photoUrl ?? null,
        syncError: undefined,
      });
      synced += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : 'Sync failed';
      lastError = message;
      await updateLocalHazardStatus(record.id, 'FAILED', { syncError: message });
    }
  }

  return { attempted: pending.length, synced, failed, lastError };
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    Boolean(error.message?.includes('hazard_votes'))
  );
}

export async function fetchUserHazardVotes(userId: string): Promise<UserVoteLedger> {
  const local = await getLocalUserVotes(userId);
  if (!isSupabaseConfigured()) return local;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(HAZARD_VOTES_TABLE)
    .select('hazard_id, vote_type')
    .eq('user_id', userId);

  if (error) {
    // Gracefully keep local votes if hazard_votes table hasn't been migrated yet
    return local;
  }

  const confirmed = new Set(local.confirmed);
  const cleared = new Set(local.cleared);
  for (const row of (data ?? []) as { hazard_id: string; vote_type: VoteType }[]) {
    if (row.vote_type === 'CONFIRM') confirmed.add(row.hazard_id);
    if (row.vote_type === 'CLEAR') cleared.add(row.hazard_id);
  }

  return saveLocalUserVotes(userId, {
    confirmed: Array.from(confirmed),
    cleared: Array.from(cleared),
  });
}

async function claimUniqueVote(
  hazardId: string,
  userId: string,
  voteType: VoteType
): Promise<void> {
  const local = await getLocalUserVotes(userId);
  const alreadyLocal =
    voteType === 'CONFIRM'
      ? local.confirmed.includes(hazardId)
      : local.cleared.includes(hazardId);

  if (alreadyLocal) {
    throw new Error(
      voteType === 'CONFIRM'
        ? 'You have already confirmed this report.'
        : 'You have already voted to clear this report.'
    );
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.from(HAZARD_VOTES_TABLE).insert({
    hazard_id: hazardId,
    user_id: userId,
    vote_type: voteType,
  });

  if (error) {
    if (error.code === '23505') {
      await recordLocalUserVote(userId, hazardId, voteType);
      throw new Error(
        voteType === 'CONFIRM'
          ? 'You have already confirmed this report.'
          : 'You have already voted to clear this report.'
      );
    }
    if (!isMissingTableError(error)) {
      throw new Error(error.message);
    }
  }
}

export async function confirmHazardActive(
  hazard: HazardRecord,
  currentUserId: string
): Promise<void> {
  if (hazard.reporterId && hazard.reporterId === currentUserId) {
    throw new Error('You cannot confirm your own report.');
  }

  await claimUniqueVote(hazard.id, currentUserId, 'CONFIRM');

  const supabase = getSupabaseClient();
  const nextConfirmations = hazard.confirmations + 1;
  const nextTrustScore = computeTrustScore(nextConfirmations, true);
  const nextVerification =
    nextTrustScore >= VERIFICATION_TRUST_THRESHOLD ? 'VERIFIED' : hazard.verificationStatus;

  const { error } = await supabase
    .from(HAZARDS_TABLE)
    .update({
      confirmations: nextConfirmations,
      trust_score: nextTrustScore,
      verification_status: nextVerification,
      updated_at: Date.now(),
    })
    .eq('id', hazard.id);

  if (error) {
    throw new Error(error.message);
  }

  await recordLocalUserVote(currentUserId, hazard.id, 'CONFIRM');
}

export async function markHazardCleared(
  hazard: HazardRecord,
  currentUserId: string
): Promise<'CLEARED' | 'VOTED'> {
  const supabase = getSupabaseClient();
  const isOwner = Boolean(hazard.reporterId && hazard.reporterId === currentUserId);

  if (!isOwner) {
    await claimUniqueVote(hazard.id, currentUserId, 'CLEAR');
  }

  const nextVotes = (hazard.clearVotes ?? 0) + 1;
  const shouldClear = isOwner || nextVotes >= CLEAR_VOTES_THRESHOLD;

  const { error } = await supabase
    .from(HAZARDS_TABLE)
    .update({
      clear_votes: nextVotes,
      clearance_status: shouldClear ? 'CLEARED' : hazard.clearanceStatus,
      updated_at: Date.now(),
    })
    .eq('id', hazard.id);

  if (error) {
    throw new Error(error.message);
  }

  await recordLocalUserVote(currentUserId, hazard.id, 'CLEAR');
  return shouldClear ? 'CLEARED' : 'VOTED';
}

export async function cancelOwnHazard(hazard: HazardRecord): Promise<void> {
  if (hazard.syncStatus === 'SYNCED' && isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from(HAZARDS_TABLE)
      .delete()
      .eq('id', hazard.id);
    if (error) {
      throw new Error(error.message);
    }
  }
  await removeLocalHazard(hazard.id);
}
