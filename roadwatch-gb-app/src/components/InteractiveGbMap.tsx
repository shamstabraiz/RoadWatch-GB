import React, { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
import { GB_CORRIDORS, projectGbCoordinate } from '../data/gbCorridors';
import { COLORS, FONTS, SPACING, TYPE } from '../theme/tokens';
import { CorridorId, HotspotZone } from '../types/hazard';

export type MapLayerMode = 'terrain' | 'satellite';

interface InteractiveGbMapProps {
  hotspots: HotspotZone[];
  selectedCorridor: CorridorId | 'ALL';
  selectedHotspotId: string | null;
  isConnected: boolean;
  mapLayer: MapLayerMode;
  userLocation: { latitude: number; longitude: number; accuracy?: number | null } | null;
  onSelectHotspot: (hotspotId: string) => void;
}

// Key highway anchor points (start -> key towns -> end) fed to OSRM
// to fetch exact road-snapped GeoJSON geometry following every mountain curve.
const CORRIDOR_ANCHORS: Record<CorridorId, [number, number][]> = {
  KKH_N35: [
    [35.4215, 74.0956], // Chilas
    [35.4926, 74.5944], // Raikot Bridge
    [35.6769, 74.6164], // Jaglot
    [35.9208, 74.3089], // Gilgit
    [36.3167, 74.6502], // Karimabad (Hunza)
    [36.6872, 74.8195], // Sost
  ],
  S1_SKARDU: [
    [35.7584, 74.5912], // Alam Bridge (KKH Junction)
    [35.6894, 74.9182], // Astak
    [35.6122, 75.0419], // Rondu
    [35.2971, 75.6333], // Skardu
  ],
  BABUSAR_N15: [
    [34.9093, 73.6507], // Naran
    [35.1462, 74.0483], // Babusar Top
    [35.4215, 74.0956], // Chilas Zero Point
  ],
  GHIZER_CHITRAL: [
    [35.9208, 74.3089], // Gilgit
    [36.1768, 73.7638], // Gahkuch
    [36.2285, 73.4412], // Gupis
    [36.1725, 72.9428], // Phander
    [36.0852, 72.5514], // Shandur Pass
  ],
  ASTORE_DEOSAI: [
    [35.6769, 74.6164], // Jaglot
    [35.3665, 74.8558], // Astore
    [35.0442, 75.1065], // Chillum Chowki
  ],
};

function buildGoogleMapHtml(params: {
  hotspots: HotspotZone[];
  selectedCorridor: CorridorId | 'ALL';
  selectedHotspotId: string | null;
  mapLayer: MapLayerMode;
  userLocation: { latitude: number; longitude: number; accuracy?: number | null } | null;
}): string {
  const payload = JSON.stringify({
    hotspots: params.hotspots.map((z) => ({
      id: z.id,
      lat: z.centerLat,
      lng: z.centerLng,
      title: z.title,
      count: z.reports.length,
      confirmations: z.totalConfirmations,
      isCleared: z.isCleared,
      severity: z.maxSeverity,
      radius: z.radiusMeters,
      selected: z.id === params.selectedHotspotId,
    })),
    corridors: CORRIDOR_ANCHORS,
    selectedCorridor: params.selectedCorridor,
    mapLayer: params.mapLayer,
    userLocation: params.userLocation,
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: #E8ECEF;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .leaflet-control-attribution { display: none; }
    .hotspot-badge {
      display: flex; align-items: center; justify-content: center;
      border-radius: 999px;
      color: #FFFFFF;
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      border: 2.5px solid #FFFFFF;
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.34);
      cursor: pointer;
    }
    .hotspot-badge.selected {
      transform: scale(1.18);
      border-color: #14332B;
    }
    .user-dot-wrap {
      position: relative; width: 20px; height: 20px;
      display: flex; align-items: center; justify-content: center;
    }
    .user-dot-ring {
      position: absolute; width: 20px; height: 20px; border-radius: 999px;
      background: rgba(37, 99, 235, 0.25);
    }
    .user-dot-core {
      width: 11px; height: 11px; border-radius: 999px;
      background: #2563EB; border: 2.5px solid #FFFFFF;
      box-shadow: 0 1px 6px rgba(15, 23, 42, 0.35);
      z-index: 2;
    }
    .pick-pin {
      width: 24px; height: 24px; border-radius: 999px;
      background: #D97706; border: 3px solid #0F172A;
      box-shadow: 0 3px 12px rgba(15, 23, 42, 0.4);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const DATA = ${payload};
    const defaultCenter = DATA.userLocation
      ? [DATA.userLocation.latitude, DATA.userLocation.longitude]
      : [35.62, 74.55];

    const map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView(defaultCenter, DATA.userLocation ? 10 : 8);

    // Google Maps tiles: 'p' = Terrain with roads/labels, 'y' = Hybrid Satellite with labels
    const lyrs = DATA.mapLayer === 'satellite' ? 'y' : 'p';
    L.tileLayer('https://{s}.google.com/vt/lyrs=' + lyrs + '&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(map);

    function postToApp(msg) {
      const str = JSON.stringify(msg);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(str);
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(str, '*');
      }
    }

    // Snap selected corridor to the real highway network using OSRM road GeoJSON
    // (cached in localStorage so subsequent selections render instantaneously).
    function renderRoadGeoJson(geojson) {
      const outer = L.geoJSON(geojson, {
        style: {
          color: DATA.mapLayer === 'satellite' ? '#14332B' : '#FFFFFF',
          weight: 8,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round'
        },
        interactive: false
      }).addTo(map);

      const inner = L.geoJSON(geojson, {
        style: {
          color: DATA.mapLayer === 'satellite' ? '#FBBF24' : '#D97706',
          weight: 4,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round'
        },
        interactive: false
      }).addTo(map);

      map.fitBounds(inner.getBounds(), { padding: [64, 96] });
      return outer;
    }

    if (DATA.selectedCorridor !== 'ALL' && DATA.corridors[DATA.selectedCorridor]) {
      const anchors = DATA.corridors[DATA.selectedCorridor];
      const cacheKey = 'rw_gb_road_geojson_v1_' + DATA.selectedCorridor;

      map.fitBounds(anchors, { padding: [64, 96] });

      let cached = null;
      try {
        const raw = window.localStorage.getItem(cacheKey);
        if (raw) cached = JSON.parse(raw);
      } catch (e) {}

      if (cached) {
        renderRoadGeoJson(cached);
      } else {
        // OSRM expects lon,lat semicolon-separated pairs
        const coordStr = anchors.map((p) => p[1] + ',' + p[0]).join(';');
        const url =
          'https://router.project-osrm.org/route/v1/driving/' +
          coordStr +
          '?overview=full&geometries=geojson';

        fetch(url)
          .then((res) => res.json())
          .then((json) => {
            if (json && json.routes && json.routes[0] && json.routes[0].geometry) {
              const geo = {
                type: 'Feature',
                geometry: json.routes[0].geometry,
                properties: {}
              };
              try {
                window.localStorage.setItem(cacheKey, JSON.stringify(geo));
              } catch (e) {}
              renderRoadGeoJson(geo);
            }
          })
          .catch(() => {
            // If routing server is unreachable, leave native Google Maps road clean
          });
      }
    }

    // Live User GPS Location Dot
    if (DATA.userLocation) {
      const userIcon = L.divIcon({
        className: '',
        html: '<div class="user-dot-wrap"><div class="user-dot-ring"></div><div class="user-dot-core"></div></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      L.marker([DATA.userLocation.latitude, DATA.userLocation.longitude], {
        icon: userIcon,
        interactive: false
      }).addTo(map);
    }

    // Dynamic Spatial Hotspot Halos & Cluster Count Badges
    DATA.hotspots.forEach((z) => {
      const color = z.isCleared
        ? '#15803D'
        : z.severity === 'CRITICAL' && (z.count > 1 || z.confirmations >= 3)
        ? '#DC2626'
        : '#D97706';

      if (!z.isCleared) {
        L.circle([z.lat, z.lng], {
          radius: z.radius * 3.2,
          color: color,
          weight: z.selected ? 2 : 1.2,
          opacity: 0.55,
          fillColor: color,
          fillOpacity: z.count > 1 ? 0.24 : 0.16
        })
          .addTo(map)
          .on('click', () => postToApp({ type: 'SELECT_HOTSPOT', id: z.id }));
      }

      const size = z.count > 1 ? 34 : 26;
      const icon = L.divIcon({
        className: '',
        html:
          '<div class="hotspot-badge ' +
          (z.selected ? 'selected' : '') +
          '" style="width:' +
          size +
          'px;height:' +
          size +
          'px;font-size:' +
          (z.count > 1 ? 13 : 11) +
          'px;background:' +
          color +
          ';">' +
          z.count +
          '</div>',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });

      L.marker([z.lat, z.lng], { icon })
        .addTo(map)
        .on('click', () => postToApp({ type: 'SELECT_HOTSPOT', id: z.id }));
    });
  </script>
</body>
</html>`;
}

export function InteractiveGbMap({
  hotspots,
  selectedCorridor,
  selectedHotspotId,
  isConnected,
  mapLayer,
  userLocation,
  onSelectHotspot,
}: InteractiveGbMapProps) {
  const visibleHotspots = useMemo(
    () =>
      selectedCorridor === 'ALL'
        ? hotspots
        : hotspots.filter((z) => z.corridor === selectedCorridor),
    [hotspots, selectedCorridor]
  );

  const html = useMemo(
    () =>
      buildGoogleMapHtml({
        hotspots: visibleHotspots,
        selectedCorridor,
        selectedHotspotId,
        mapLayer,
        userLocation,
      }),
    [visibleHotspots, selectedCorridor, selectedHotspotId, mapLayer, userLocation]
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SELECT_HOTSPOT' && msg.id) {
          onSelectHotspot(msg.id);
        }
      } catch {
        // Ignore unrelated window messages
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSelectHotspot]);

  function handleNativeMessage(event: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'SELECT_HOTSPOT' && msg.id) {
        onSelectHotspot(msg.id);
      }
    } catch {
      // Ignore malformed bridge messages
    }
  }

  if (!isConnected) {
    return (
      <View style={styles.offlineCanvas}>
        <Svg viewBox="0 0 360 260" width="100%" height="100%">
          <Rect x="0" y="0" width="360" height="260" fill={COLORS.primary} />
          <Path
            d="M 0 65 H 360 M 0 130 H 360 M 0 195 H 360 M 90 0 V 260 M 180 0 V 260 M 270 0 V 260"
            stroke="#1F473C"
            strokeWidth="0.75"
          />
          {GB_CORRIDORS.map((c) => {
            const active = selectedCorridor === 'ALL' || selectedCorridor === c.id;
            return (
              <React.Fragment key={c.id}>
                <Path
                  d={c.svgPath}
                  fill="none"
                  stroke={active ? '#94A3B8' : '#334155'}
                  strokeWidth={active ? 2.6 : 1.3}
                  strokeLinecap="round"
                />
                <SvgText
                  x={c.labelPos.x}
                  y={c.labelPos.y}
                  fill={active ? '#F8FAFC' : '#475569'}
                  fontSize="8.5"
                  fontFamily="monospace"
                >
                  {c.code}
                </SvgText>
              </React.Fragment>
            );
          })}
          {userLocation && (() => {
            const u = projectGbCoordinate(
              userLocation.latitude,
              userLocation.longitude
            );
            return (
              <Circle
                cx={u.x}
                cy={u.y}
                r="5"
                fill="#2563EB"
                stroke={COLORS.surface}
                strokeWidth="1.8"
              />
            );
          })()}
          {visibleHotspots.map((z) => {
            const pos = projectGbCoordinate(z.centerLat, z.centerLng);
            const fill = z.isCleared ? COLORS.success : COLORS.secondary;
            return (
              <React.Fragment key={z.id}>
                <Circle
                  cx={pos.x}
                  cy={pos.y}
                  r={z.reports.length > 1 ? 16 : 10}
                  fill={fill}
                  fillOpacity={0.24}
                />
                <Circle
                  cx={pos.x}
                  cy={pos.y}
                  r={z.reports.length > 1 ? 8 : 6}
                  fill={fill}
                  stroke={COLORS.surface}
                  strokeWidth="1.5"
                />
                <SvgText
                  x={pos.x}
                  y={pos.y + 3}
                  fill={COLORS.surface}
                  fontSize="8"
                  fontWeight="700"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {z.reports.length}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
        <View style={styles.offlineTag}>
          <Text style={styles.offlineTagText}>
            Offline map, {visibleHotspots.length} hotspot
            {visibleHotspots.length === 1 ? '' : 's'}
          </Text>
          {visibleHotspots[0] && (
            <TouchableOpacity onPress={() => onSelectHotspot(visibleHotspots[0].id)}>
              <Text style={styles.offlineInspect}>Inspect</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {Platform.OS === 'web' ? (
        <iframe
          title="RoadWatch GB Google Map"
          srcDoc={html}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
          }}
        />
      ) : (
        <WebView
          originWhitelist={['*']}
          source={{ html }}
          onMessage={handleNativeMessage}
          scrollEnabled={false}
          style={styles.fill}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#E8ECEF',
  },
  offlineCanvas: {
    flex: 1,
    backgroundColor: COLORS.primary,
    position: 'relative',
  },
  offlineTag: {
    position: 'absolute',
    bottom: 164,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: 'rgba(20, 51, 43, 0.92)',
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: 999,
  },
  offlineTagText: {
    fontFamily: FONTS.mono,
    fontSize: TYPE.xs,
    color: COLORS.textInverse,
  },
  offlineInspect: {
    fontSize: TYPE.xs,
    fontWeight: '700',
    color: '#FBBF24',
  },
});
