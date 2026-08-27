/**
 * useDrawArea hook
 *
 * Attaches MapLibre interaction handlers while `drawing` is true:
 * - click adds a vertex (or closes the ring when clicking near the first point)
 * - mousemove updates the rubber-band line directly on the map source
 * - dblclick finishes the polygon
 * - Escape cancels drawing
 *
 * The draft line is updated directly against the MapLibre source instead of
 * through React state, so the rubber band follows the cursor smoothly without
 * re-rendering the component tree on every mousemove.
 */

import { useEffect } from 'react';
import { useStore } from '../../state';

const FIRST_VERTEX_CLOSE_PX = 14;
const CLICK_TIMEOUT_MS = 250;

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function draftData(draftVertices, cursor) {
  if (draftVertices.length === 0 && !cursor) {
    return { type: 'FeatureCollection', features: [] };
  }
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

export default function useDrawArea(map) {
  const drawing = useStore((s) => s.drawing);
  const addDraftVertex = useStore((s) => s.addDraftVertex);
  const closeDraft = useStore((s) => s.closeDraft);
  const cancelDrawing = useStore((s) => s.cancelDrawing);

  useEffect(() => {
    if (!map || !drawing) return;

    const container = map.getContainer();
    container.classList.add('map-draw-crosshair');

    if (!map.getSource('draft-source')) {
      map.addSource('draft-source', {
        type: 'geojson',
        data: draftData(useStore.getState().draftVertices, null),
      });
      map.addLayer({
        id: 'draft-line',
        type: 'line',
        source: 'draft-source',
        paint: {
          'line-color': '#4c9ffe',
          'line-width': 1.5,
          'line-dasharray': [2, 2],
        },
      });
    }

    let clickTimer = null;

    function updateDraft(cursor) {
      const source = map.getSource('draft-source');
      if (source) {
        source.setData(draftData(useStore.getState().draftVertices, cursor));
      }
    }

    function onMouseMove(e) {
      updateDraft([e.lngLat.lng, e.lngLat.lat]);
    }

    function onClick(e) {
      e.preventDefault();
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        closeDraft();
        return;
      }
      clickTimer = setTimeout(() => {
        clickTimer = null;
        const vertices = useStore.getState().draftVertices;
        if (vertices.length > 2) {
          const first = vertices[0];
          const firstPx = map.project(first);
          if (distance(firstPx, e.point) < FIRST_VERTEX_CLOSE_PX) {
            closeDraft();
            return;
          }
        }
        addDraftVertex([e.lngLat.lng, e.lngLat.lat]);
        updateDraft([e.lngLat.lng, e.lngLat.lat]);
      }, CLICK_TIMEOUT_MS);
    }

    function onDblClick(e) {
      e.preventDefault();
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      closeDraft();
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        cancelDrawing();
      }
    }

    map.on('mousemove', onMouseMove);
    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      if (clickTimer) clearTimeout(clickTimer);
      map.off('mousemove', onMouseMove);
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      window.removeEventListener('keydown', onKeyDown);
      container.classList.remove('map-draw-crosshair');

      if (map.getLayer('draft-line')) map.removeLayer('draft-line');
      if (map.getSource('draft-source')) map.removeSource('draft-source');
    };
  }, [map, drawing, addDraftVertex, closeDraft, cancelDrawing]);
}
