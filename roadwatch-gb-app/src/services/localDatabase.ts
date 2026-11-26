import AsyncStorage from '@react-native-async-storage/async-storage';
import { HazardRecord, SyncStatus } from '../types/hazard';

const LOCAL_HAZARDS_KEY = '@roadwatch_gb/local_hazards_v1';
const USER_VOTES_KEY_PREFIX = '@roadwatch_gb/user_votes_v1:';

export type VoteType = 'CONFIRM' | 'CLEAR';

export interface UserVoteLedger {
  confirmed: string[];
  cleared: string[];
}

export async function getLocalUserVotes(userId: string): Promise<UserVoteLedger> {
  const raw = await AsyncStorage.getItem(`${USER_VOTES_KEY_PREFIX}${userId}`);
  if (!raw) return { confirmed: [], cleared: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<UserVoteLedger>;
    return {
      confirmed: Array.isArray(parsed.confirmed) ? parsed.confirmed : [],
      cleared: Array.isArray(parsed.cleared) ? parsed.cleared : [],
    };
  } catch {
    return { confirmed: [], cleared: [] };
  }
}

export async function saveLocalUserVotes(
  userId: string,
  ledger: UserVoteLedger
): Promise<UserVoteLedger> {
  const deduped: UserVoteLedger = {
    confirmed: Array.from(new Set(ledger.confirmed)),
    cleared: Array.from(new Set(ledger.cleared)),
  };
  await AsyncStorage.setItem(
    `${USER_VOTES_KEY_PREFIX}${userId}`,
    JSON.stringify(deduped)
  );
  return deduped;
}

export async function recordLocalUserVote(
  userId: string,
  hazardId: string,
  voteType: VoteType
): Promise<UserVoteLedger> {
  const current = await getLocalUserVotes(userId);
  if (voteType === 'CONFIRM') {
    current.confirmed.push(hazardId);
  } else {
    current.cleared.push(hazardId);
  }
  return saveLocalUserVotes(userId, current);
}

export async function getLocalHazards(): Promise<HazardRecord[]> {
  const raw = await AsyncStorage.getItem(LOCAL_HAZARDS_KEY);
  if (!raw) return [];
  try {
    const parsed: HazardRecord[] = JSON.parse(raw);
    return parsed
      .map((item) => ({
        ...item,
        reporterId: item.reporterId ?? null,
        clearVotes: item.clearVotes ?? 0,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function saveLocalHazard(record: HazardRecord): Promise<HazardRecord[]> {
  const current = await getLocalHazards();
  const idx = current.findIndex((item) => item.id === record.id);
  const updated =
    idx >= 0
      ? current.map((item) => (item.id === record.id ? record : item))
      : [record, ...current];

  await AsyncStorage.setItem(LOCAL_HAZARDS_KEY, JSON.stringify(updated));
  return updated;
}

export async function updateLocalHazardStatus(
  id: string,
  syncStatus: SyncStatus,
  patch: Partial<HazardRecord> = {}
): Promise<HazardRecord[]> {
  const current = await getLocalHazards();
  const updated = current.map((item) =>
    item.id === id
      ? {
          ...item,
          ...patch,
          syncStatus,
          updatedAt: Date.now(),
        }
      : item
  );
  await AsyncStorage.setItem(LOCAL_HAZARDS_KEY, JSON.stringify(updated));
  return updated;
}

export async function removeLocalHazard(id: string): Promise<HazardRecord[]> {
  const current = await getLocalHazards();
  const remaining = current.filter((item) => item.id !== id);
  await AsyncStorage.setItem(LOCAL_HAZARDS_KEY, JSON.stringify(remaining));
  return remaining;
}

export async function getPendingLocalHazards(): Promise<HazardRecord[]> {
  const all = await getLocalHazards();
  return all.filter((item) => item.syncStatus === 'PENDING' || item.syncStatus === 'FAILED');
}

export async function clearSyncedLocalHazards(): Promise<HazardRecord[]> {
  const current = await getLocalHazards();
  const remaining = current.filter((item) => item.syncStatus !== 'SYNCED');
  await AsyncStorage.setItem(LOCAL_HAZARDS_KEY, JSON.stringify(remaining));
  return remaining;
}
