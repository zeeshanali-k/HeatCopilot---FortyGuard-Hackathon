/**
 * useDrawArea hook
 *
 * Attaches MapLibre interaction handlers while `drawing` is true:
 * - click adds a vertex (or closes the ring when clicking near the first point)
 * - mousemove updates the rubber-band line
 * - dblclick finishes the polygon
 * - Escape cancels drawing
 *
 * Click/dblclick are debounced so a double-click finishes the ring without
 * adding extra vertices and without the rubber-band flickering on every click.
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

export default function useDrawArea(map) {
  const drawing = useStore((s) => s.drawing);
  const addDraftVertex = useStore((s) => s.addDraftVertex);
  const setDraftCursor = useStore((s) => s.setDraftCursor);
  const closeDraft = useStore((s) => s.closeDraft);
  const cancelDrawing = useStore((s) => s.cancelDrawing);

  useEffect(() => {
    if (!map || !drawing) return;

    const container = map.getContainer();
    container.classList.add('map-draw-crosshair');

    let clickTimer = null;

    function onMouseMove(e) {
      setDraftCursor([e.lngLat.lng, e.lngLat.lat]);
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
      setDraftCursor(null);
    };
  }, [map, drawing, addDraftVertex, setDraftCursor, closeDraft, cancelDrawing]);
}
