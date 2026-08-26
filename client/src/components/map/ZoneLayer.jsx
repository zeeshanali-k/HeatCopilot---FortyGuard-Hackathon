/**
 * ZoneLayer component
 *
 * Highlights the currently selected prioritized zone on the map with a
 * semi-transparent fill and an accent-color outline (#4c9ffe).
 */

import { useEffect } from 'react';

export default function ZoneLayer({ map, selectedZone }) {
  useEffect(() => {
    if (!map) return;

    if (map.getSource('selected-zone')) {
      map.getSource('selected-zone').setData(
        selectedZone?.geometry || { type: 'FeatureCollection', features: [] }
      );
    } else {
      map.addSource('selected-zone', {
        type: 'geojson',
        data: selectedZone?.geometry || { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'selected-zone-fill',
        type: 'fill',
        source: 'selected-zone',
        paint: {
          'fill-color': '#4c9ffe',
          'fill-opacity': 0.15,
        },
      });
      map.addLayer({
        id: 'selected-zone-outline',
        type: 'line',
        source: 'selected-zone',
        paint: {
          'line-color': '#4c9ffe',
          'line-width': 2,
        },
      });
    }
  }, [map, selectedZone]);

  return null;
}
