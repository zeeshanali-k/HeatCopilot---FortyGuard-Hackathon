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
import { prioritizeZones } from '../../api';
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

  useEffect(() => {
    if (!map) return;

    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    if (!selectedHotspot) return;

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

    function findNearestZone(zones, lon, lat) {
      if (!zones || zones.length === 0) return null;
      return zones
        .map((z) => ({
          zone: z,
          dist: Math.hypot(z.center.lon - lon, z.center.lat - lat),
        }))
        .sort((a, b) => a.dist - b.dist)[0].zone;
    }

    const btn = popupContent.querySelector('.popup-action-btn');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Analyzing…';
      setPrioritizeStatus('processing');
      setPrioritizeError(null);

      try {
        const aoi = bufferPolygon(selectedHotspot.lon, selectedHotspot.lat);
        const data = await prioritizeZones(aoi, { date: DEMO_DATE });
        const ranked = data.zones || [];
        const nearest = findNearestZone(ranked, selectedHotspot.lon, selectedHotspot.lat);
        setPrioritizeZones(ranked);
        setShowResultsPanel(true);
        setSelectedZone(nearest);
        setPrioritizeStatus('completed');
        saveToHistory({
          aoi,
          aoiMode,
          date: DEMO_DATE,
          hotspots,
          duration: durationZones,
          zones: ranked,
          fromCache: data.meta?.fromCache,
        });
        if (nearest && map) {
          map.flyTo({ center: [nearest.center.lon, nearest.center.lat], zoom: 16, essential: true });
        }
        popupRef.current?.remove();
      } catch (err) {
        console.error(err);
        setPrioritizeError(err);
        setPrioritizeStatus('error');
        btn.disabled = false;
        btn.textContent = 'Analyze this zone';
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
  }, [
    map,
    selectedHotspot,
    onClose,
    thresholdC,
    setPrioritizeStatus,
    setPrioritizeError,
    setPrioritizeZones,
    setSelectedZone,
    setShowResultsPanel,
    saveToHistory,
    aoiMode,
    hotspots,
    durationZones,
  ]);

  return null;
}
