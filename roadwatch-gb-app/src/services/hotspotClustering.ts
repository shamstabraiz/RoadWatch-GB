import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { GB_CORRIDORS } from '../data/gbCorridors';
import {
  CorridorId,
  HazardRecord,
  HotspotZone,
  SeverityLevel,
} from '../types/hazard';
import { haversineDistanceMeters } from './spatialAlgorithm';

const HOTSPOT_GROUP_RADIUS_METERS = 850;

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  CRITICAL: 3,
  HIGH: 2,
  MODERATE: 1,
};

/**
 * Groups nearby hazard reports (within 850m on the same corridor) into
 * spatial HotspotZone objects for map heat rings and zone inspection sheets.
 */
export function buildHotspotZones(hazards: HazardRecord[]): HotspotZone[] {
  const sorted = [...hazards].sort((a, b) => b.createdAt - a.createdAt);
  const buckets: HazardRecord[][] = [];

  for (const item of sorted) {
    let placed = false;
    for (const bucket of buckets) {
      const anchor = bucket[0];
      if (anchor.corridor !== item.corridor) continue;
      const dist = haversineDistanceMeters(
        anchor.latitude,
        anchor.longitude,
        item.latitude,
        item.longitude
      );
      if (dist <= HOTSPOT_GROUP_RADIUS_METERS) {
        bucket.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      buckets.push([item]);
    }
  }

  return buckets
    .map((reports) => {
      const activeReports = reports.filter((r) => r.clearanceStatus !== 'CLEARED');
      const primary = activeReports[0] ?? reports[0];
      const totalConfirmations = reports.reduce(
        (sum, r) => sum + (r.confirmations || 1),
        0
      );

      let maxSeverity: SeverityLevel = 'MODERATE';
      for (const r of activeReports.length > 0 ? activeReports : reports) {
        if (SEVERITY_RANK[r.severity] > SEVERITY_RANK[maxSeverity]) {
          maxSeverity = r.severity;
        }
      }

      const centerLat =
        reports.reduce((s, r) => s + r.latitude, 0) / reports.length;
      const centerLng =
        reports.reduce((s, r) => s + r.longitude, 0) / reports.length;

      const isCleared = activeReports.length === 0;
      const radiusMeters = isCleared
        ? 300
        : Math.min(1800, 420 + (reports.length - 1) * 240 + totalConfirmations * 70);

      return {
        id: primary.clusterId || primary.id,
        corridor: primary.corridor,
        title: primary.locationName,
        centerLat,
        centerLng,
        reports,
        primaryHazard: primary,
        totalConfirmations,
        activeCount: activeReports.length,
        isCleared,
        maxSeverity,
        radiusMeters,
      };
    })
    .sort((a, b) => {
      if (a.isCleared !== b.isCleared) return a.isCleared ? 1 : -1;
      return b.totalConfirmations - a.totalConfirmations;
    });
}

/**
 * Finds the nearest known Gilgit-Baltistan corridor and landmark name
 * for any map-tapped or GPS coordinate.
 */
export function resolveNearestCorridorSpot(
  latitude: number,
  longitude: number
): { corridor: CorridorId; landmark: string } {
  let bestCorridor: CorridorId = 'KKH_N35';
  let bestLandmark = 'Karakoram Highway';
  let bestDist = Infinity;

  for (const corridor of GB_CORRIDORS) {
    for (const spot of corridor.hotspots) {
      const dist = haversineDistanceMeters(latitude, longitude, spot.lat, spot.lng);
      if (dist < bestDist) {
        bestDist = dist;
        bestCorridor = corridor.id;
        bestLandmark =
          dist <= 12000 ? spot.name : `Near ${spot.name}`;
      }
    }
  }

  return { corridor: bestCorridor, landmark: bestLandmark };
}

/**
 * Reverse-geocodes GPS coordinates into a real map place/road name
 * (native OS geocoder on Android/iOS, Nominatim on web, offline fallback in dead zones).
 */
export async function reverseGeocodeLocation(
  latitude: number,
  longitude: number
): Promise<{ corridor: CorridorId; placeName: string }> {
  const nearest = resolveNearestCorridorSpot(latitude, longitude);

  // 1. Native reverse geocoding on Android / iOS
  if (Platform.OS !== 'web') {
    try {
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      const first = results?.[0];
      if (first) {
        const parts = [
          first.street || first.name,
          first.district || first.subregion || first.city,
        ].filter(
          (p): p is string =>
            Boolean(p && p.trim().length > 0 && !/^\d+$/.test(p.trim()))
        );
        const unique = Array.from(new Set(parts));
        if (unique.length > 0) {
          return { corridor: nearest.corridor, placeName: unique.slice(0, 2).join(', ') };
        }
      }
    } catch {
      // Fall through to Nominatim / offline fallback
    }
  }

  // 2. OpenStreetMap Nominatim reverse geocode (works on Web & as online fallback)
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=15`,
      { headers: { Accept: 'application/json' } }
    );
    if (res.ok) {
      const data = await res.json();
      const addr = data?.address ?? {};
      const primary =
        addr.road ||
        addr.village ||
        addr.hamlet ||
        addr.town ||
        addr.suburb ||
        addr.neighbourhood ||
        data?.name;
      const secondary = addr.town || addr.city || addr.county || addr.state_district;
      const parts = [primary, secondary].filter(
        (p): p is string => Boolean(p && typeof p === 'string' && p.trim().length > 0)
      );
      const unique = Array.from(new Set(parts));
      if (unique.length > 0) {
        return { corridor: nearest.corridor, placeName: unique.slice(0, 2).join(', ') };
      }
    }
  } catch {
    // Offline cellular dead zone: fall back to nearest corridor landmark or coordinates
  }

  return {
    corridor: nearest.corridor,
    placeName:
      nearest.landmark || `${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E`,
  };
}

