/**
 * HotspotMarkers component
 *
 * Renders clickable hotspot markers on the map. Marker color reflects the
 * maximum temperature of the hotspot, and the selected marker is highlighted
 * with a larger size and accent-color ring.
 */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { heatColorForTemp } from './mapUtils';

export default function HotspotMarkers({ map, hotspots, selectedHotspot, onSelect }) {
  const markersRef = useRef([]);

  useEffect(() => {
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    hotspots.forEach((hs) => {
      const el = document.createElement('div');
      el.className = 'hotspot-marker';
      const selected = selectedHotspot?.id === hs.id;
      el.style.cssText = `
        width: ${selected ? '18px' : '14px'};
        height: ${selected ? '18px' : '14px'};
        border-radius: 50%;
        background: ${heatColorForTemp(hs.tempMax)};
        border: 2px solid ${selected ? '#4c9ffe' : '#ffffff'};
        box-shadow: 0 2px 4px rgba(0,0,0,0.5);
        cursor: pointer;
      `;

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([hs.lon, hs.lat])
        .addTo(map);

      marker.getElement().addEventListener('click', (e) => {
        e.stopPropagation();
        onSelect(hs);
      });

      markersRef.current.push(marker);
    });
  }, [map, hotspots, selectedHotspot, onSelect]);

  return null;
}
