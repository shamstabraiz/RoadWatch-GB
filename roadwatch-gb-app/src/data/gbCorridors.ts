import { CorridorMeta, HazardType, SeverityLevel } from '../types/hazard';

/**
 * Offline vector corridor definitions for Gilgit-Baltistan highways.
 * Allows map rendering without external tile servers inside cellular dead zones.
 */
export const GB_CORRIDORS: CorridorMeta[] = [
  {
    id: 'KKH_N35',
    code: 'N-35',
    name: 'Karakoram Highway (KKH)',
    hotspots: [
      { name: 'Tata Pani (KM-412)', lat: 35.4218, lng: 74.5961 },
      { name: 'Kohistan Gorge', lat: 35.2914, lng: 73.9422 },
      { name: 'Hunza - Attabad', lat: 36.3167, lng: 74.8204 },
    ],
    svgPath: 'M 44 198 L 96 168 L 154 128 L 210 86 L 260 36',
    labelPos: { x: 168, y: 74 },
  },
  {
    id: 'S1_SKARDU',
    code: 'S-1',
    name: 'Jaglot–Skardu Road',
    hotspots: [
      { name: 'Rondu Canyon', lat: 35.6122, lng: 75.0419 },
      { name: 'Astak Nallah', lat: 35.6894, lng: 74.9182 },
    ],
    svgPath: 'M 154 128 L 222 134 L 290 124 L 336 112',
    labelPos: { x: 256, y: 112 },
  },
  {
    id: 'BABUSAR_N15',
    code: 'N-15',
    name: 'Babusar Pass Route',
    hotspots: [
      { name: 'Babusar Top (4,173m)', lat: 35.1462, lng: 74.0483 },
      { name: 'Chilas Zero Point', lat: 35.4128, lng: 74.0956 },
    ],
    svgPath: 'M 124 206 L 138 172 L 154 128',
    labelPos: { x: 128, y: 194 },
  },
  {
    id: 'GHIZER_CHITRAL',
    code: 'GB-G',
    name: 'Gilgit–Ghizer Road',
    hotspots: [
      { name: 'Gahkuch Valley', lat: 36.1768, lng: 73.7638 },
      { name: 'Shandur Approach', lat: 36.0852, lng: 72.5514 },
    ],
    svgPath: 'M 154 128 L 104 94 L 46 72',
    labelPos: { x: 64, y: 64 },
  },
  {
    id: 'ASTORE_DEOSAI',
    code: 'GB-A',
    name: 'Astore–Deosai Corridor',
    hotspots: [
      { name: 'Astore Valley Slide Zone', lat: 35.3665, lng: 74.8558 },
      { name: 'Chillum Chowki', lat: 35.0442, lng: 75.1065 },
    ],
    svgPath: 'M 154 128 L 194 166 L 264 186',
    labelPos: { x: 214, y: 184 },
  },
];

export const HAZARD_TYPES: { value: HazardType; label: string }[] = [
  { value: 'LANDSLIDE', label: 'Landslide' },
  { value: 'ROCKFALL', label: 'Rockfall / Shooting Stones' },
  { value: 'GLOF', label: 'GLOF / Flood' },
  { value: 'SNOW_BLOCKAGE', label: 'Snow / Avalanche' },
  { value: 'BRIDGE_WASHOUT', label: 'Bridge Washout' },
];

export const SEVERITY_LEVELS: { value: SeverityLevel; label: string }[] = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MODERATE', label: 'Moderate' },
];

/**
 * Projects a real Gilgit-Baltistan GPS coordinate (lat 34.8..36.6, lng 72.4..76.2)
 * onto the 360x220 offline corridor vector canvas.
 */
export function projectGbCoordinate(lat: number, lng: number): { x: number; y: number } {
  const minLat = 34.8;
  const maxLat = 36.6;
  const minLng = 72.4;
  const maxLng = 76.0;

  const clampedLat = Math.max(minLat, Math.min(maxLat, lat));
  const clampedLng = Math.max(minLng, Math.min(maxLng, lng));

  const x = 24 + ((clampedLng - minLng) / (maxLng - minLng)) * 312;
  const y = 200 - ((clampedLat - minLat) / (maxLat - minLat)) * 172;
  return { x, y };
}

