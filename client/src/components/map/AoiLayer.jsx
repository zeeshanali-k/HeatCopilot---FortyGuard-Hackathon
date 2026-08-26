/**
 * AoiLayer component
 *
 * Renders the current AOI on the map. In auto mode the viewport-derived polygon
 * is shown as a dashed outline with a small label. In manual mode it is shown as
 * a solid outline with a translucent fill and vertex handles. While drawing, it
 * also renders the draft polyline and a rubber-band segment to the cursor.
 */

import { useEffect } from 'react';
import { useStore } from '../../state';

const ACCENT = '#4c9ffe';
const FILL_OPACITY = 0.08;

function polygonCentroid(ring) {
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

function toFeatureCollection(geometry) {
  if (!geometry) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry,
      },
    ],
  };
}

function verticesFromPolygon(aoi) {
  if (!aoi || aoi.type !== 'Polygon') return { type: 'FeatureCollection', features: [] };
  const ring = aoi.coordinates[0];
  return {
    type: 'FeatureCollection',
    features: ring.map(([lon, lat]) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [lon, lat] },
    })),
  };
}

function labelPointFromPolygon(aoi) {
  if (!aoi || aoi.type !== 'Polygon') return { type: 'FeatureCollection', features: [] };
  const [lon, lat] = polygonCentroid(aoi.coordinates[0]);
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { label: 'Area: current map view' },
        geometry: { type: 'Point', coordinates: [lon, lat] },
      },
    ],
  };
}

function draftFeature(draftVertices, cursor) {
  if (draftVertices.length === 0) return { type: 'FeatureCollection', features: [] };
  const coords = [...draftVertices];
  if (cursor) coords.push(cursor);
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords },
      },
    ],
  };
}

export default function AoiLayer({ map }) {
  const aoi = useStore((s) => s.aoi);
  const aoiMode = useStore((s) => s.aoiMode);
  const draftVertices = useStore((s) => s.draftVertices);
  const draftCursor = useStore((s) => s.draftCursor);
  const drawing = useStore((s) => s.drawing);

  useEffect(() => {
    if (!map) return;

    const aoiData = toFeatureCollection(aoi);
    const vertexData = verticesFromPolygon(aoi);
    const labelData = labelPointFromPolygon(aoi);
    const draftData = draftFeature(draftVertices, draftCursor);

    const aoiExists = map.getSource('aoi-source');
    if (aoiExists) {
      map.getSource('aoi-source').setData(aoiData);
      map.getSource('aoi-vertices').setData(vertexData);
      map.getSource('aoi-label').setData(labelData);
      map.getSource('draft-source').setData(draftData);
      return;
    }

    map.addSource('aoi-source', { type: 'geojson', data: aoiData });
    map.addSource('aoi-vertices', { type: 'geojson', data: vertexData });
    map.addSource('aoi-label', { type: 'geojson', data: labelData });
    map.addSource('draft-source', { type: 'geojson', data: draftData });

    map.addLayer({
      id: 'aoi-fill',
      type: 'fill',
      source: 'aoi-source',
      paint: {
        'fill-color': ACCENT,
        'fill-opacity': aoiMode === 'manual' ? FILL_OPACITY : 0,
      },
    });

    map.addLayer({
      id: 'aoi-outline',
      type: 'line',
      source: 'aoi-source',
      paint: {
        'line-color': ACCENT,
        'line-width': 2,
        'line-dasharray': aoiMode === 'auto' ? [2, 2] : [1, 0],
      },
    });

    map.addLayer({
      id: 'aoi-vertices',
      type: 'circle',
      source: 'aoi-vertices',
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffffff',
        'circle-stroke-color': ACCENT,
        'circle-stroke-width': 2,
      },
    });

    map.addLayer({
      id: 'draft-line',
      type: 'line',
      source: 'draft-source',
      paint: {
        'line-color': ACCENT,
        'line-width': 1.5,
        'line-dasharray': [2, 2],
      },
    });

    map.addLayer({
      id: 'aoi-label',
      type: 'symbol',
      source: 'aoi-label',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-offset': [0, -1],
        'text-anchor': 'bottom',
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': ACCENT,
        'text-halo-color': 'rgba(0,0,0,0.5)',
        'text-halo-width': 1,
      },
    });

    return () => {
      const layers = ['aoi-fill', 'aoi-outline', 'aoi-vertices', 'draft-line', 'aoi-label'];
      layers.forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      const sources = ['aoi-source', 'aoi-vertices', 'aoi-label', 'draft-source'];
      sources.forEach((id) => {
        if (map.getSource(id)) map.removeSource(id);
      });
    };
  }, [map, aoi, aoiMode, draftVertices, draftCursor, drawing]);

  return null;
}
