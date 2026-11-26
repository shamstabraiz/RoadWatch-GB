export type CorridorId =
  | 'KKH_N35'
  | 'S1_SKARDU'
  | 'BABUSAR_N15'
  | 'GHIZER_CHITRAL'
  | 'ASTORE_DEOSAI';

export type HazardType =
  | 'LANDSLIDE'
  | 'ROCKFALL'
  | 'GLOF'
  | 'SNOW_BLOCKAGE'
  | 'BRIDGE_WASHOUT';

export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MODERATE';

export type SyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';

export type VerificationStatus = 'UNVERIFIED' | 'VERIFIED';

export type ClearanceStatus = 'BLOCKED' | 'SINGLE_LANE' | 'CLEARED';

export interface HazardRecord {
  id: string;
  reporterId: string | null;
  corridor: CorridorId;
  locationName: string;
  hazardType: HazardType;
  severity: SeverityLevel;
  description: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  localPhotoUri: string | null;
  photoUrl: string | null;
  photoSizeKb: number;
  syncStatus: SyncStatus;
  verificationStatus: VerificationStatus;
  clearanceStatus: ClearanceStatus;
  confirmations: number;
  clearVotes: number;
  trustScore: number;
  clusterId: string | null;
  createdAt: number;
  updatedAt: number;
  syncError?: string;
}

export interface HotspotZone {
  id: string;
  corridor: CorridorId;
  title: string;
  centerLat: number;
  centerLng: number;
  reports: HazardRecord[];
  primaryHazard: HazardRecord;
  totalConfirmations: number;
  activeCount: number;
  isCleared: boolean;
  maxSeverity: SeverityLevel;
  radiusMeters: number;
}

export interface CorridorMeta {
  id: CorridorId;
  code: string;
  name: string;
  hotspots: { name: string; lat: number; lng: number }[];
  svgPath: string;
  labelPos: { x: number; y: number };
}
