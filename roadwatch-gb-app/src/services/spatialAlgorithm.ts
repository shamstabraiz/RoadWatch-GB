const EARTH_RADIUS_METERS = 6371000;
export const CLUSTER_RADIUS_METERS = 500;
export const VERIFICATION_TRUST_THRESHOLD = 0.75;

/**
 * Haversine great-circle distance in meters between two GPS coordinates.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Computes crowdsourced trust score (0.00 - 1.00).
 * Mirrors supabase-backend/schema.sql trigger.
 */
export function computeTrustScore(
  confirmations: number,
  hasCompressedPhoto: boolean
): number {
  const baseScore = 0.35;
  const photoBonus = hasCompressedPhoto ? 0.2 : 0;
  const confirmationBonus = Math.max(0, confirmations - 1) * 0.2;
  return Number(Math.min(1.0, baseScore + photoBonus + confirmationBonus).toFixed(2));
}

/**
 * Generates an RFC-4122-style client UUID v4 for 1:1 idempotent
 * Local DB <-> Supabase PostgreSQL synchronization (zero duplicates).
 */
export function generateClientUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

