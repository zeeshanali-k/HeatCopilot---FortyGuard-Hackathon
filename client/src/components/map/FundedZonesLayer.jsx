/**
 * FundedZonesLayer component
 *
 * Outlines budget-funded zones on the map in green (#22c55e) after the
 * budget optimizer runs. Unfunded zones are simply not drawn here.
 */

import { useEffect } from 'react';

export default function FundedZonesLayer({ map, fundedZones }) {
  useEffect(() => {
    if (!map) return;

    const data = {
      type: 'FeatureCollection',
      features: (fundedZones || [])
        .filter((z) => z.geometry)
        .map((z) => ({ type: 'Feature', geometry: z.geometry, properties: { id: z.id } })),
    };

    if (map.getSource('funded-zones')) {
      map.getSource('funded-zones').setData(data);
    } else {
      map.addSource('funded-zones', { type: 'geojson', data });
      map.addLayer({
        id: 'funded-zones-fill',
        type: 'fill',
        source: 'funded-zones',
        paint: {
          'fill-color': '#22c55e',
          'fill-opacity': 0.08,
        },
      });
      map.addLayer({
        id: 'funded-zones-outline',
        type: 'line',
        source: 'funded-zones',
        paint: {
          'line-color': '#22c55e',
          'line-width': 2,
        },
      });
    }
  }, [map, fundedZones]);

  return null;
}
