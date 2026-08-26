/**
 * useDrawArea hook
 *
 * Attaches MapLibre interaction handlers while `drawing` is true:
 * - click adds a vertex (or closes the ring when clicking near the first point)
 * - mousemove updates the rubber-band line
 * - dblclick finishes the polygon
 * - Escape cancels drawing
 */

import { useEffect } from 'react';
import { useStore } from '../../state';

const FIRST_VERTEX_CLOSE_PX = 14;

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export default function useDrawArea(map) {
  const drawing = useStore((s) => s.drawing);
  const draftVertices = useStore((s) => s.draftVertices);
  const addDraftVertex = useStore((s) => s.addDraftVertex);
  const setDraftCursor = useStore((s) => s.setDraftCursor);
  const closeDraft = useStore((s) => s.closeDraft);
  const cancelDrawing = useStore((s) => s.cancelDrawing);

  useEffect(() => {
    if (!map || !drawing) return;

    const container = map.getContainer();
    container.classList.add('map-draw-crosshair');

    function onMouseMove(e) {
      setDraftCursor([e.lngLat.lng, e.lngLat.lat]);
    }

    function onClick(e) {
      e.preventDefault();
      if (draftVertices.length > 2) {
        const first = draftVertices[0];
        const firstPx = map.project(first);
        if (distance(firstPx, e.point) < FIRST_VERTEX_CLOSE_PX) {
          closeDraft();
          return;
        }
      }
      addDraftVertex([e.lngLat.lng, e.lngLat.lat]);
    }

    function onDblClick(e) {
      e.preventDefault();
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
      map.off('mousemove', onMouseMove);
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      window.removeEventListener('keydown', onKeyDown);
      container.classList.remove('map-draw-crosshair');
      setDraftCursor(null);
    };
  }, [map, drawing, draftVertices, addDraftVertex, setDraftCursor, closeDraft, cancelDrawing]);
}
