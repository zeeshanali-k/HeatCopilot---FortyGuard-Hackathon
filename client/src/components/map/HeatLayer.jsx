/**
 * HeatLayer component
 *
 * Renders the temperature heat tile GeoJSON as a fill layer on the map.
 * Adds (or updates) a source and two layers: semi-transparent color fill and
 * subtle white outlines. Driven by the heat tiles returned from /api/hotspots.
 */

import { useEffect } from 'react';
import { heatFillExpression } from './mapUtils';

export default function HeatLayer({ map, heatTiles }) {
  useEffect(() => {
    if (!map || !heatTiles) return;

    if (map.getSource('heat-tiles')) {
      map.getSource('heat-tiles').setData(heatTiles);
    } else {
      map.addSource('heat-tiles', {
        type: 'geojson',
        data: heatTiles,
      });
      map.addLayer({
        id: 'heat-tiles-fill',
        type: 'fill',
        source: 'heat-tiles',
        paint: {
          'fill-color': heatFillExpression(),
          'fill-opacity': 0.5,
        },
      });
      map.addLayer({
        id: 'heat-tiles-outline',
        type: 'line',
        source: 'heat-tiles',
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.3,
          'line-opacity': 0.2,
        },
      });
    }
  }, [map, heatTiles]);

  return null;
}
