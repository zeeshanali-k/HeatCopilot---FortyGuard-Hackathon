/**
 * HistoryLayer component
 *
 * Renders zone polygons for each selected history entry in a distinct palette
 * color. Sources and layers are created per entry so selections can fade in and
 * out independently.
 */

import { useEffect } from 'react';
import { useStore, HISTORY_PALETTE } from '../../state';

function toFeatureCollection(zones) {
  if (!zones || zones.length === 0) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: zones
      .filter((z) => z.geometry)
      .map((z) => ({
        type: 'Feature',
        properties: { id: z.id, score: z.score },
        geometry: z.geometry,
      })),
  };
}

export default function HistoryLayer({ map }) {
  const history = useStore((s) => s.history);
  const selectedIds = useStore((s) => s.selectedHistoryIds);

  useEffect(() => {
    if (!map) return;

    const selected = selectedIds
      .map((id) => history.find((h) => h.id === id))
      .filter(Boolean);

    const desiredIds = new Set(selected.map((_, idx) => `history-layer-${idx}`));

    // Remove layers/sources that are no longer selected.
    const existingSources = map.getStyle().sources;
    Object.keys(existingSources || {}).forEach((sourceId) => {
      if (!sourceId.startsWith('history-layer-')) return;
      if (!desiredIds.has(sourceId)) {
        if (map.getLayer(`${sourceId}-fill`)) map.removeLayer(`${sourceId}-fill`);
        if (map.getLayer(`${sourceId}-outline`)) map.removeLayer(`${sourceId}-outline`);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
    });

    selected.forEach((entry, idx) => {
      const sourceId = `history-layer-${idx}`;
      const color = HISTORY_PALETTE[idx % HISTORY_PALETTE.length];
      const data = toFeatureCollection(entry.zones);

      if (map.getSource(sourceId)) {
        map.getSource(sourceId).setData(data);
        map.setPaintProperty(`${sourceId}-fill`, 'fill-color', color);
        map.setPaintProperty(`${sourceId}-outline`, 'line-color', color);
      } else {
        map.addSource(sourceId, { type: 'geojson', data });
        map.addLayer({
          id: `${sourceId}-fill`,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': color,
            'fill-opacity': 0.18,
          },
        });
        map.addLayer({
          id: `${sourceId}-outline`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': color,
            'line-width': 2,
          },
        });
      }
    });

    return () => {
      for (let i = 0; i < 4; i += 1) {
        const sourceId = `history-layer-${i}`;
        if (map.getLayer(`${sourceId}-fill`)) map.removeLayer(`${sourceId}-fill`);
        if (map.getLayer(`${sourceId}-outline`)) map.removeLayer(`${sourceId}-outline`);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
    };
  }, [map, history, selectedIds]);

  return null;
}
