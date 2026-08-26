/**
 * useMap hook
 *
 * Initializes the MapLibre map (theme-aware Carto basemap, US-bounded) and
 * keeps the global zustand map reference and viewport AOI in sync as the user
 * pans/zooms.
 */

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '../../state';

const US_BOUNDS = [
  [-125, 24],
  [-66, 50],
];

const BASEMAP_STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

export default function useMap() {
  const containerRef = useRef(null);
  const [map, setMap] = useState(null);
  const setMapRef = useStore((s) => s.setMapRef);
  const setAoi = useStore((s) => s.setAoi);
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    const instance = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLES[theme],
      center: [-112.074, 33.448],
      zoom: 10,
      minZoom: 3,
      maxBounds: US_BOUNDS,
    });
    setMapRef(instance);

    function updateAoiFromViewport() {
      if (useStore.getState().aoiMode !== 'auto') return;
      const bounds = instance.getBounds();
      const polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [bounds.getWest(), bounds.getSouth()],
            [bounds.getEast(), bounds.getSouth()],
            [bounds.getEast(), bounds.getNorth()],
            [bounds.getWest(), bounds.getNorth()],
            [bounds.getWest(), bounds.getSouth()],
          ],
        ],
      };
      setAoi(polygon);
    }

    instance.on('load', () => {
      updateAoiFromViewport();
      setMap(instance);
    });
    instance.on('moveend', updateAoiFromViewport);

    return () => {
      instance.remove();
    };
  }, [setMapRef, setAoi, theme]);

  return { containerRef, map };
}
