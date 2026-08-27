/**
 * ThemeToggle component
 *
 * Floating button that switches between dark and light modes. Persists the
 * choice in localStorage and updates the document data-theme attribute for
 * CSS variable-driven theming.
 */

import { useEffect } from 'react';
import { useStore } from '../state';

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <button
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        width: 40,
        height: 40,
        borderRadius: '50%',
        border: '1px solid var(--glass-border)',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: 'var(--text-m)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
        boxShadow: 'var(--shadow-sm)',
        transition: 'background 0.2s, color 0.2s, transform 0.15s',
        animation: `fadeIn var(--dur-slow) var(--ease-out) both`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--glass-bg-hover)';
        e.currentTarget.style.color = 'var(--text-h)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--glass-bg)';
        e.currentTarget.style.color = 'var(--text-m)';
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
