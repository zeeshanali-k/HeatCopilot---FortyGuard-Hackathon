/**
 * HotspotPopup component
 *
 * Displays a MapLibre popup for the currently selected hotspot. Shows the
 * area label, mean/max temperature, peak hour, and dangerous heat duration,
 * plus an "Analyze this zone" button that triggers the prioritize pipeline.
 */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useStore } from '../../state';
import { usePrioritizePipeline } from '../../hooks/usePrioritizePipeline';
import { formatHour } from './mapUtils';

const DEMO_DATE = '2026-07-15';
const DEMO_HOUR = '14:00';
const ANALYSIS_BUFFER_KM = 0.4; // ~400 m around the clicked marker

function bufferPolygon(lon, lat, radiusKm = ANALYSIS_BUFFER_KM) {
  // Approximate degrees per km at this latitude.
  const latKmPerDeg = 111;
  const lonKmPerDeg = 111 * Math.cos((lat * Math.PI) / 180);
  const dLat = radiusKm / latKmPerDeg;
  const dLon = radiusKm / lonKmPerDeg;

  return {
    type: 'Polygon',
    coordinates: [
      [
        [lon - dLon, lat - dLat],
        [lon + dLon, lat - dLat],
        [lon + dLon, lat + dLat],
        [lon - dLon, lat + dLat],
        [lon - dLon, lat - dLat],
      ],
    ],
  };
}

export default function HotspotPopup({ map, selectedHotspot, onClose, thresholdC }) {
  const popupRef = useRef(null);

  const setPrioritizeStatus = useStore((s) => s.setPrioritizeStatus);
  const setPrioritizeError = useStore((s) => s.setPrioritizeError);
  const setPrioritizeZones = useStore((s) => s.setPrioritizeZones);
  const setSelectedZone = useStore((s) => s.setSelectedZone);
  const setShowResultsPanel = useStore((s) => s.setShowResultsPanel);
  const saveToHistory = useStore((s) => s.saveToHistory);
  const aoiMode = useStore((s) => s.aoiMode);
  const hotspots = useStore((s) => s.hotspots);
  const durationZones = useStore((s) => s.durationZones);

  // Stash values that change often in refs so the popup DOM isn't recreated
  // every time the surrounding store updates.
  const selectedHotspotRef = useRef(selectedHotspot);
  const mapRef = useRef(map);
  const hotspotsRef = useRef(hotspots);
  const durationZonesRef = useRef(durationZones);

  const { run } = usePrioritizePipeline({
    onCompleted: ({ zones }) => {
      const hotspot = selectedHotspotRef.current;
      if (!hotspot) return;
      const ranked = zones || [];
      const nearest = ranked.length > 0
        ? ranked
          .map((z) => ({
            zone: z,
            dist: Math.hypot(z.center.lon - hotspot.lon, z.center.lat - hotspot.lat),
          }))
          .sort((a, b) => a.dist - b.dist)[0].zone
        : null;
      setPrioritizeZones(ranked);
      setShowResultsPanel(true);
      setSelectedZone(nearest);
      setPrioritizeStatus('completed');
      saveToHistory({
        aoi: bufferPolygon(hotspot.lon, hotspot.lat),
        aoiMode,
        date: DEMO_DATE,
        hotspots: hotspotsRef.current,
        duration: durationZonesRef.current,
        zones: ranked,
        fromCache: false,
      });
      if (nearest && mapRef.current) {
        mapRef.current.flyTo({ center: [nearest.center.lon, nearest.center.lat], zoom: 16, essential: true });
      }
      popupRef.current?.remove();
    },
    onFailed: (err) => {
      console.error(err);
      setPrioritizeError(err);
      setPrioritizeStatus('error');
      const btn = popupRef.current?.getElement()?.querySelector('.popup-action-btn');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Analyze this zone';
      }
    },
  });

  // Keep the latest run function in a ref so the effect doesn't re-run when
  // the pipeline callbacks change identity.
  const runRef = useRef(run);

  useEffect(() => {
    selectedHotspotRef.current = selectedHotspot;
    mapRef.current = map;
    hotspotsRef.current = hotspots;
    durationZonesRef.current = durationZones;
    runRef.current = run;
  });

  useEffect(() => {
    if (!map || !selectedHotspot) {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      return;
    }

    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    const thresholdLabel = `${thresholdC}°C`;
    const popupContent = document.createElement('div');
    popupContent.className = 'hotspot-popup';
    popupContent.innerHTML = `
      <div style="font-weight:600;font-size:15px;margin-bottom:8px;color:var(--text-h);">${selectedHotspot.label}</div>
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px 16px;font-size:13px;color:var(--text-m);">
        <div>Mean temp</div><div style="text-align:right;color:var(--text-h);font-weight:600;">${selectedHotspot.tempMean}°C</div>
        <div>Max temp</div><div style="text-align:right;color:var(--text-h);font-weight:600;">${selectedHotspot.tempMax}°C</div>
        <div>Peak hour</div><div style="text-align:right;color:var(--text-h);">${formatHour(selectedHotspot.peakHour)}</div>
        <div>Danger duration (hrs)</div><div style="text-align:right;color:var(--text-h);">${selectedHotspot.durationHrs ?? '--'}</div>
      </div>
      <button class="popup-action-btn" style="margin-top:12px;width:100%;">Analyze this zone</button>
      <div style="margin-top:6px;font-size:11px;color:var(--text-l);text-align:center;" title="FortyGuard heatmap, ${DEMO_DATE} ${DEMO_HOUR}, 100m, threshold ${thresholdLabel}">Source: FortyGuard heatmap · threshold ${thresholdLabel}</div>
    `;

    const btn = popupContent.querySelector('.popup-action-btn');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Analyzing…';
      setPrioritizeStatus('processing');
      setPrioritizeError(null);

      try {
        const aoi = bufferPolygon(selectedHotspot.lon, selectedHotspot.lat);
        await runRef.current(aoi, DEMO_DATE);
      } catch {
        // Error handling is done in onFailed callback.
      }
    });

    popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '300px' })
      .setLngLat([selectedHotspot.lon, selectedHotspot.lat])
      .setDOMContent(popupContent)
      .addTo(map);

    popupRef.current.on('close', () => {
      onClose();
    });

    return () => {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };
  }, [map, selectedHotspot, onClose, thresholdC, setPrioritizeStatus, setPrioritizeError]);

  return null;
}
