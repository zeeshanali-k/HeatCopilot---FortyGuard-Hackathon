/**
 * DurationLayer component
 *
 * Renders the heat-duration streak overlay on the map. Each tile is colored
 * by its longest consecutive dangerous streak (yellow → deep red). Layer
 * opacity is toggled on/off via the showDurationLayer control.
 */

import { useEffect } from 'react';
import { durationFillExpression } from './mapUtils';

export default function DurationLayer({ map, durationTiles, showDurationLayer }) {
  useEffect(() => {
    if (!map || !durationTiles) return;

    if (map.getSource('duration-tiles')) {
      map.getSource('duration-tiles').setData(durationTiles);
    } else {
      map.addSource('duration-tiles', {
        type: 'geojson',
        data: durationTiles,
      });
      map.addLayer({
        id: 'duration-tiles-fill',
        type: 'fill',
        source: 'duration-tiles',
        paint: {
          'fill-color': durationFillExpression(),
          'fill-opacity': showDurationLayer ? 0.65 : 0,
        },
      });
      map.addLayer({
        id: 'duration-tiles-outline',
        type: 'line',
        source: 'duration-tiles',
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.3,
          'line-opacity': showDurationLayer ? 0.2 : 0,
        },
      });
    }
  }, [map, durationTiles, showDurationLayer]);

  useEffect(() => {
    if (!map) return;
    if (map.getLayer('duration-tiles-fill')) {
      map.setPaintProperty('duration-tiles-fill', 'fill-opacity', showDurationLayer ? 0.65 : 0);
    }
    if (map.getLayer('duration-tiles-outline')) {
      map.setPaintProperty('duration-tiles-outline', 'line-opacity', showDurationLayer ? 0.2 : 0);
    }
  }, [map, showDurationLayer]);

  return null;
}
