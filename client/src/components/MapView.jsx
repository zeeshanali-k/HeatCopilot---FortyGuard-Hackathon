/**
 * MapView component
 *
 * Main map canvas for HeatCopilot. Orchestrates map initialization, heat tile
 * overlay, duration streak overlay, hotspot markers, and the selected hotspot
 * popup by composing focused map sub-components.
 */

import useMap from './map/useMap';
import HeatLayer from './map/HeatLayer';
import DurationLayer from './map/DurationLayer';
import HotspotMarkers from './map/HotspotMarkers';
import HotspotPopup from './map/HotspotPopup';
import ZoneLayer from './map/ZoneLayer';
import { useStore } from '../state';

export default function MapView() {
  const { containerRef, map } = useMap();

  const hotspots = useStore((s) => s.hotspots);
  const heatTiles = useStore((s) => s.heatTiles);
  const selectedHotspot = useStore((s) => s.selectedHotspot);
  const durationTiles = useStore((s) => s.durationTiles);
  const showDurationLayer = useStore((s) => s.showDurationLayer);
  const durationThresholdC = useStore((s) => s.durationThresholdC);
  const selectedZone = useStore((s) => s.selectedZone);
  const setSelectedHotspot = useStore((s) => s.setSelectedHotspot);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      {map && (
        <>
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
        </>
      )}
    </div>
  );
}
