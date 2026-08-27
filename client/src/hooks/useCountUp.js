import { useEffect, useRef, useState } from 'react';

function getReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * rAF-based numeric tween.
 *
 * Under reduced-motion the target value is returned instantly.
 *
 * @param {number} target - value to animate toward
 * @param {object} options
 * @param {number} [options.duration=800] - animation duration in ms
 * @param {number} [options.decimals=0] - decimal places to round to
 * @param {boolean} [options.enabled=true] - whether to run the tween
 * @returns {number} current tweened value
 */
export function useCountUp(target, { duration = 800, decimals = 0, enabled = true } = {}) {
  const [value, setValue] = useState(target);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const fromRef = useRef(target);
  const valueRef = useRef(target);

  useEffect(() => {
    if (!enabled || getReducedMotion()) {
      valueRef.current = target;
      return;
    }

    fromRef.current = valueRef.current;
    startRef.current = null;

    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    const tick = (now) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOut(progress);
      const next = fromRef.current + (target - fromRef.current) * eased;
      const rounded = Number(next.toFixed(decimals));
      valueRef.current = rounded;
      setValue(rounded);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, decimals, enabled]);

  if (!enabled || getReducedMotion()) {
    return target;
  }

  return value;
}
