/**
 * AoiLayer component
 *
 * Renders the current AOI on the map. In auto mode the viewport-derived polygon
 * is shown as a dashed outline with a small label. In manual mode it is shown as
 * a solid outline with a translucent fill and draggable vertex handles.
 *
 * The draft polyline while drawing is managed by useDrawArea directly against
 * the map source for smooth performance.
 */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
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
        id: 'aoi',
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
    features: ring.map(([lon, lat], idx) => ({
      type: 'Feature',
      id: `vertex_${idx}`,
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

function polygonWithMovedVertex(aoi, index, [lon, lat]) {
  const ring = aoi.coordinates[0].map((pt, i) => (i === index ? [lon, lat] : pt));
  if (index === 0) ring[ring.length - 1] = [lon, lat];
  if (index === ring.length - 1) ring[0] = [lon, lat];
  return { ...aoi, coordinates: [ring] };
}

function createVertexElement() {
  const el = document.createElement('div');
  el.className = 'aoi-vertex-handle';
  return el;
}

export default function AoiLayer({ map }) {
  const aoi = useStore((s) => s.aoi);
  const aoiMode = useStore((s) => s.aoiMode);
  const updateAoiVertex = useStore((s) => s.updateAoiVertex);
  const markersRef = useRef([]);

  // Render/update AOI sources and layers.
  useEffect(() => {
    if (!map) return;

    const aoiData = toFeatureCollection(aoi);
    const vertexData = verticesFromPolygon(aoi);
    const labelData = labelPointFromPolygon(aoi);

    const aoiExists = map.getSource('aoi-source');
    if (aoiExists) {
      map.getSource('aoi-source').setData(aoiData);
      map.getSource('aoi-vertices').setData(vertexData);
      map.getSource('aoi-label').setData(labelData);

      map.setPaintProperty('aoi-fill', 'fill-opacity', aoiMode === 'manual' ? FILL_OPACITY : 0);
      map.setPaintProperty('aoi-outline', 'line-dasharray', aoiMode === 'auto' ? [2, 2] : [1, 0]);
      map.setLayoutProperty('aoi-label', 'visibility', aoiMode === 'auto' ? 'visible' : 'none');
      map.setLayoutProperty('aoi-vertices', 'visibility', aoiMode === 'auto' ? 'visible' : 'none');
      return;
    }

    map.addSource('aoi-source', { type: 'geojson', data: aoiData });
    map.addSource('aoi-vertices', { type: 'geojson', data: vertexData });
    map.addSource('aoi-label', { type: 'geojson', data: labelData });

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
      layout: {
        visibility: aoiMode === 'auto' ? 'visible' : 'none',
      },
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffffff',
        'circle-stroke-color': ACCENT,
        'circle-stroke-width': 2,
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
        visibility: aoiMode === 'auto' ? 'visible' : 'none',
      },
      paint: {
        'text-color': ACCENT,
        'text-halo-color': 'rgba(0,0,0,0.5)',
        'text-halo-width': 1,
      },
    });

    return () => {
      const layers = ['aoi-fill', 'aoi-outline', 'aoi-vertices', 'aoi-label'];
      layers.forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      const sources = ['aoi-source', 'aoi-vertices', 'aoi-label'];
      sources.forEach((id) => {
        if (map.getSource(id)) map.removeSource(id);
      });
    };
  }, [map, aoi, aoiMode]);

  // Draggable vertex handles for manual AOIs.
  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!map) return;

    if (aoiMode !== 'manual' || !aoi || aoi.type !== 'Polygon') {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      return;
    }

    const ring = aoi.coordinates[0];
    // Exclude the closing duplicate vertex.
    const editableCount = ring.length - 1;

    if (markersRef.current.length === editableCount) {
      markersRef.current.forEach((marker, i) => marker.setLngLat(ring[i]));
      return;
    }

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (let i = 0; i < editableCount; i += 1) {
      const [lon, lat] = ring[i];
      const marker = new maplibregl.Marker({
        element: createVertexElement(),
        anchor: 'center',
        draggable: true,
      })
        .setLngLat([lon, lat])
        .addTo(map);

      marker.on('drag', () => {
        const { lng, lat: newLat } = marker.getLngLat();
        const updated = polygonWithMovedVertex(aoi, i, [lng, newLat]);
        const aoiSource = map.getSource('aoi-source');
        if (aoiSource) aoiSource.setData(toFeatureCollection(updated));
      });

      marker.on('dragend', () => {
        const { lng, lat: newLat } = marker.getLngLat();
        updateAoiVertex(i, [lng, newLat]);
      });

      markersRef.current.push(marker);
    }
  }, [map, aoi, aoiMode, updateAoiVertex]);

  return null;
}
