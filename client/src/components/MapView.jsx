/**
 * MapView component
 *
 * Main map canvas for HeatCopilot. Orchestrates map initialization, heat tile
 * overlay, duration streak overlay, hotspot markers, and the selected hotspot
 * popup by composing focused map sub-components. Locks map navigation and shows
 * a loading overlay while any analysis (hotspots, duration, or zone prioritize) is running.
 */

import useMap from './map/useMap';
import useDrawArea from './map/useDrawArea';
import AoiLayer from './map/AoiLayer';
import HeatLayer from './map/HeatLayer';
import DurationLayer from './map/DurationLayer';
import DurationLegend from './map/DurationLegend';
import HotspotMarkers from './map/HotspotMarkers';
import HotspotPopup from './map/HotspotPopup';
import ZoneLayer from './map/ZoneLayer';
import FundedZonesLayer from './map/FundedZonesLayer';
import HistoryLayer from './map/HistoryLayer';
import { useEffect } from 'react';
import { useStore } from '../state';

export default function MapView() {
  const { containerRef, map } = useMap();
  useDrawArea(map);

  const hotspots = useStore((s) => s.hotspots);
  const heatTiles = useStore((s) => s.heatTiles);
  const selectedHotspot = useStore((s) => s.selectedHotspot);
  const durationTiles = useStore((s) => s.durationTiles);
  const showDurationLayer = useStore((s) => s.showDurationLayer);
  const durationThresholdC = useStore((s) => s.durationThresholdC);
  const selectedZone = useStore((s) => s.selectedZone);
  const allocation = useStore((s) => s.allocation);
  const setSelectedHotspot = useStore((s) => s.setSelectedHotspot);
  const prioritizeStatus = useStore((s) => s.prioritizeStatus);
  const analysisStatus = useStore((s) => s.analysisStatus);
  const durationStatus = useStore((s) => s.durationStatus);

  const isAnalyzing =
    prioritizeStatus === 'submitted' ||
    prioritizeStatus === 'processing' ||
    analysisStatus === 'submitted' ||
    analysisStatus === 'processing' ||
    durationStatus === 'submitted' ||
    durationStatus === 'processing';

  useEffect(() => {
    if (!map) return;
    if (isAnalyzing) {
      map.scrollZoom.disable();
      map.dragPan.disable();
      map.dragRotate.disable();
      map.keyboard.disable();
      map.doubleClickZoom.disable();
      map.touchZoomRotate.disable();
      map.boxZoom.disable();
    } else {
      map.scrollZoom.enable();
      map.dragPan.enable();
      map.dragRotate.enable();
      map.keyboard.enable();
      map.doubleClickZoom.enable();
      map.touchZoomRotate.enable();
      map.boxZoom.enable();
    }
  }, [map, isAnalyzing]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      {map && (
        <>
          <AoiLayer map={map} />
          <HeatLayer map={map} heatTiles={heatTiles} />
          <DurationLayer
            map={map}
            durationTiles={durationTiles}
            showDurationLayer={showDurationLayer}
          />
          <HotspotMarkers
            map={map}
            hotspots={hotspots}
            selectedHotspot={selectedHotspot}
            onSelect={setSelectedHotspot}
          />
          <HotspotPopup
            map={map}
            selectedHotspot={selectedHotspot}
            onClose={() => setSelectedHotspot(null)}
            thresholdC={durationThresholdC}
          />
          <ZoneLayer map={map} selectedZone={selectedZone} />
          <FundedZonesLayer map={map} fundedZones={allocation?.funded} />
          <HistoryLayer map={map} />
        </>
      )}
      {showDurationLayer && <DurationLegend />}

      {isAnalyzing && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.25)',
            pointerEvents: 'auto',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 20px',
              borderRadius: 12,
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid var(--glass-border)',
              boxShadow: 'var(--glass-shadow)',
              color: 'var(--text-h)',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <span className="map-loading-spinner" />
            Analyzing…
          </div>
        </div>
      )}
    </div>
  );
}
