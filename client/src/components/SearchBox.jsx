/**
 * SearchBox component
 *
 * Top-center Nominatim search input. Lets the user type a US place name,
 * shows a dropdown of geocoding results, and flies the map to the selected
 * location.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '../state';
import { searchNominatim } from '../api';

export default function SearchBox() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const mapRef = useStore((s) => s.mapRef);

  const handleSearch = useCallback(async (raw) => {
    const q = raw.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await searchNominatim(q);
      setResults(data);
      setOpen(true);
    } catch (err) {
      console.error(err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => handleSearch(query), 350);
    return () => clearTimeout(handler);
  }, [query, handleSearch]);

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function flyTo(place) {
    const lon = parseFloat(place.lon);
    const lat = parseFloat(place.lat);
    if (mapRef) {
      mapRef.flyTo({ center: [lon, lat], zoom: 13, essential: true });
    }
    setQuery(place.display_name);
    setOpen(false);
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 360,
        zIndex: 10,
      }}
    >
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a US city (e.g. Phoenix)"
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 14,
          border: '1px solid var(--glass-border)',
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          color: 'var(--text-h)',
          fontSize: 14,
          outline: 'none',
          boxShadow: 'var(--glass-shadow)',
          transition: 'background 0.2s, border-color 0.2s',
        }}
        onFocus={(e) => {
          e.currentTarget.style.background = 'var(--glass-bg-hover)';
          e.currentTarget.style.borderColor = 'var(--border-strong)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.background = 'var(--glass-bg)';
          e.currentTarget.style.borderColor = 'var(--glass-border)';
        }}
      />
      {open && results.length > 0 && (
        <div
          style={{
            marginTop: 8,
            borderRadius: 14,
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid var(--glass-border)',
            overflow: 'hidden',
            boxShadow: 'var(--glass-shadow)',
          }}
        >
          {results.map((place) => (
            <button
              key={place.place_id}
              onClick={() => flyTo(place)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                color: 'var(--text-h)',
                cursor: 'pointer',
                fontSize: 13,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {place.display_name}
            </button>
          ))}
        </div>
      )}
      {loading && open && (
        <div style={{ padding: 8, color: 'var(--text-l)', fontSize: 12, textAlign: 'center' }}>Searching…</div>
      )}
    </div>
  );
}
