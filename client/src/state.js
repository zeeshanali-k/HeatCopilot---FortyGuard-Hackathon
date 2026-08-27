/**
 * Global application state
 *
 * Single zustand store holding map, search, hotspot, and heat-duration state.
 * Keeps UI components decoupled from prop drilling.
 */

import { create } from 'zustand';
import { reverseGeocode } from './api';

const STORAGE_KEY = 'fortyguard-theme';
const HISTORY_STORAGE_KEY = 'heatcopilot:history:v1';
const COSTS_STORAGE_KEY = 'heatcopilot:costs:v1';
const HISTORY_MAX_ENTRIES = 20;
export const HISTORY_PALETTE = ['#4c9ffe', '#22c55e', '#f59e0b', '#a855f7'];
const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const storedTheme = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
})();
const initialTheme = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : prefersDark ? 'dark' : 'light';

const AOI_AREA_CAP_MI2 = 50;
const VIEWPORT_INSET_RATIO = 0.15;

function aoiFromMap(map) {
  if (!map) return null;
  const bounds = map.getBounds();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const dx = (east - west) * VIEWPORT_INSET_RATIO;
  const dy = (north - south) * VIEWPORT_INSET_RATIO;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west + dx, south + dy],
        [east - dx, south + dy],
        [east - dx, north - dy],
        [west + dx, north - dy],
        [west + dx, south + dy],
      ],
    ],
  };
}

function polygonBBoxAreaMi2(polygon) {
  const ring = polygon.coordinates[0];
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let latSum = 0;
  for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    latSum += lat;
  }
  const centerLatRad = (latSum / ring.length) * (Math.PI / 180);
  const deg2 = (maxLon - minLon) * (maxLat - minLat);
  const km2PerDeg2 = 111 * 111 * Math.cos(centerLatRad);
  return deg2 * km2PerDeg2 * 0.386102;
}

function polygonCentroid(polygon) {
  if (!polygon || polygon.type !== 'Polygon') return [0, 0];
  const ring = polygon.coordinates[0];
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

function polygonBBox(polygon) {
  const ring = polygon.coordinates[0];
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return { minLon, maxLon, minLat, maxLat };
}

function aoiHash(aoi) {
  if (!aoi || aoi.type !== 'Polygon') return '';
  return JSON.stringify(aoi.coordinates[0].map(([lon, lat]) => [Number(lon.toFixed(6)), Number(lat.toFixed(6))]));
}

function formatLatLonLabel(lat, lon) {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

function stripRuntimeHistoryFields(entry) {
  const { rerunStatus: _rerunStatus, rerunError: _rerunError, flashScores: _flashScores, ...rest } = entry;
  return rest;
}

function persistHistory(history) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.map(stripRuntimeHistoryFields)));
  } catch {
    // ignore storage errors
  }
}

function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // ignore
  }
  return [];
}

function persistCostOverrides(overrides) {
  try {
    localStorage.setItem(COSTS_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore storage errors
  }
}

function readCostOverrides() {
  try {
    const raw = localStorage.getItem(COSTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // ignore
  }
  return {};
}

function clearAnalysisResults() {
  return {
    analysisStatus: 'idle',
    analysisError: null,
    analysisElapsed: 0,
    hotspots: [],
    heatTiles: null,
    selectedHotspot: null,
    durationStatus: 'idle',
    durationError: null,
    durationZones: [],
    durationTiles: null,
    showDurationLayer: false,
    durationThresholdC: 38,
    prioritizeStatus: 'idle',
    prioritizeError: null,
    prioritizeZones: [],
    selectedZone: null,
    showResultsPanel: false,
    allocateStatus: 'idle',
    allocateError: null,
    allocation: null,
    actionPlanStatus: 'idle',
    actionPlanError: null,
    actionPlanNarrative: '',
    actionPlanEvidencePdfUrl: null,
  };
}

export const useStore = create((set, get) => ({
  // Theme state
  theme: initialTheme,
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore storage errors
      }
      return { theme: next };
    }),

  // Map state
  mapRef: null,
  aoi: null,
  aoiMode: 'auto',
  draftVertices: [],
  drawing: false,
  drawError: null,
  setMapRef: (mapRef) => set({ mapRef }),
  setAoi: (aoi) => set({ aoi }),
  setAoiMode: (aoiMode) =>
    set((state) => {
      if (aoiMode === 'auto') {
        return {
          aoiMode: 'auto',
          aoi: aoiFromMap(state.mapRef),
          draftVertices: [],
          drawing: false,
          drawError: null,
          ...clearAnalysisResults(),
        };
      }
      return { aoiMode, drawError: null };
    }),
  startDrawing: () =>
    set({
      aoiMode: 'manual',
      aoi: null,
      drawing: true,
      draftVertices: [],
      drawError: null,
      ...clearAnalysisResults(),
    }),
  addDraftVertex: (pt) =>
    set((state) => ({
      draftVertices: [...state.draftVertices, pt],
      drawError: null,
    })),
  closeDraft: () => {
    const state = get();
    if (state.draftVertices.length < 3) {
      set({ drawError: 'A polygon needs at least 3 points.' });
      return false;
    }
    const closed = [...state.draftVertices, state.draftVertices[0]];
    const polygon = { type: 'Polygon', coordinates: [closed] };
    const areaMi2 = polygonBBoxAreaMi2(polygon);
    if (areaMi2 > AOI_AREA_CAP_MI2) {
      set({
        drawError: `Drawn area (${areaMi2.toFixed(1)} mi²) exceeds the ${AOI_AREA_CAP_MI2} mi² cap.`,
      });
      return false;
    }
    set({
      aoi: polygon,
      aoiMode: 'manual',
      draftVertices: [],
      drawing: false,
      drawError: null,
      ...clearAnalysisResults(),
    });
    return true;
  },
  cancelDrawing: () =>
    set((state) => ({
      aoiMode: 'auto',
      aoi: aoiFromMap(state.mapRef),
      drawing: false,
      draftVertices: [],
      drawError: null,
    })),
  clearCustomArea: () =>
    set((state) => ({
      aoiMode: 'auto',
      aoi: aoiFromMap(state.mapRef),
      draftVertices: [],
      drawing: false,
      drawError: null,
      ...clearAnalysisResults(),
    })),
  setDrawError: (drawError) => set({ drawError }),
  updateAoiVertex: (index, [lon, lat]) =>
    set((state) => {
      if (!state.aoi || state.aoi.type !== 'Polygon') return {};
      const ring = state.aoi.coordinates[0].map((pt, i) => (i === index ? [lon, lat] : pt));
      if (index === 0) ring[ring.length - 1] = [lon, lat];
      if (index === ring.length - 1) ring[0] = [lon, lat];
      return { aoi: { ...state.aoi, coordinates: [ring] } };
    }),

  // Search state
  searchResults: [],
  areaLabel: null,
  analysisDate: '2026-07-15',
  setSearchResults: (searchResults) => set({ searchResults }),
  setAreaLabel: (areaLabel) => set({ areaLabel }),

  // Analysis state
  analysisStatus: 'idle', // idle | submitted | processing | completed | error
  analysisError: null,
  analysisElapsed: 0,
  hotspots: [],
  heatTiles: null,
  selectedHotspot: null,
  setAnalysisStatus: (analysisStatus) => set({ analysisStatus }),
  setAnalysisError: (analysisError) => set({ analysisError }),
  setAnalysisElapsed: (analysisElapsed) => set({ analysisElapsed }),
  setHotspots: (hotspots) => set({ hotspots }),
  setHeatTiles: (heatTiles) => set({ heatTiles }),
  setSelectedHotspot: (selectedHotspot) => set({ selectedHotspot }),
  resetAnalysis: () => set({
    analysisStatus: 'idle',
    analysisError: null,
    analysisElapsed: 0,
    hotspots: [],
    heatTiles: null,
    selectedHotspot: null,
    durationZones: [],
    durationTiles: null,
    showDurationLayer: false,
    durationThresholdC: 38,
    prioritizeStatus: 'idle',
    prioritizeError: null,
    prioritizeZones: [],
    selectedZone: null,
    showResultsPanel: false,
    allocateStatus: 'idle',
    allocateError: null,
    allocation: null,
    actionPlanStatus: 'idle',
    actionPlanError: null,
    actionPlanNarrative: '',
    actionPlanEvidencePdfUrl: null,
  }),

  // Heat Duration state
  durationStatus: 'idle',
  durationError: null,
  durationZones: [],
  durationTiles: null,
  durationThresholdC: 38,
  showDurationLayer: false,
  setDurationStatus: (durationStatus) => set({ durationStatus }),
  setDurationError: (durationError) => set({ durationError }),
  setDurationZones: (durationZones) => set({ durationZones }),
  setDurationTiles: (durationTiles) => set({ durationTiles }),
  setDurationThresholdC: (durationThresholdC) => set({ durationThresholdC }),
  setShowDurationLayer: (showDurationLayer) => set({ showDurationLayer }),
  resetDuration: () => set({
    durationStatus: 'idle',
    durationError: null,
    durationZones: [],
    durationTiles: null,
    showDurationLayer: false,
    durationThresholdC: 38,
  }),

  // Prioritize Zones state
  prioritizeStatus: 'idle',
  prioritizeError: null,
  prioritizeZones: [],
  selectedZone: null,
  showResultsPanel: false,
  setPrioritizeStatus: (prioritizeStatus) => set({ prioritizeStatus }),
  setPrioritizeError: (prioritizeError) => set({ prioritizeError }),
  setPrioritizeZones: (prioritizeZones) => set({ prioritizeZones }),
  setSelectedZone: (selectedZone) => set({ selectedZone }),
  setShowResultsPanel: (showResultsPanel) => set({ showResultsPanel }),
  resetPrioritize: () => set({
    prioritizeStatus: 'idle',
    prioritizeError: null,
    prioritizeZones: [],
    selectedZone: null,
    showResultsPanel: false,
    allocateStatus: 'idle',
    allocateError: null,
    allocation: null,
    actionPlanStatus: 'idle',
    actionPlanError: null,
    actionPlanNarrative: '',
    actionPlanEvidencePdfUrl: null,
  }),

  // Budget Optimizer state
  allocateStatus: 'idle', // idle | processing | completed | error
  allocateError: null,
  allocation: null, // { funded, unfunded, totalSpent, budgetUsd, impact, meta }
  costOverrides: readCostOverrides(), // user-editable cost assumptions
  effectiveCosts: null, // cost table echoed from the last /api/allocate response
  setAllocateStatus: (allocateStatus) => set({ allocateStatus }),
  setAllocateError: (allocateError) => set({ allocateError }),
  setAllocation: (allocation) => set({
    allocation,
    effectiveCosts: allocation?.meta?.effectiveCosts || null,
  }),
  setCostOverrides: (costOverrides) => {
    persistCostOverrides(costOverrides);
    set({ costOverrides });
  },
  resetCostOverrides: () => {
    persistCostOverrides({});
    set({ costOverrides: {}, effectiveCosts: null });
  },
  resetAllocate: () => set({
    allocateStatus: 'idle',
    allocateError: null,
    allocation: null,
    effectiveCosts: null,
  }),

  // Action Plan state
  actionPlanStatus: 'idle', // idle | loading | error | done
  actionPlanError: null,
  actionPlanNarrative: '',
  actionPlanEvidencePdfUrl: null,
  setActionPlanStatus: (actionPlanStatus) => set({ actionPlanStatus }),
  setActionPlanError: (actionPlanError) => set({ actionPlanError }),
  setActionPlanNarrative: (actionPlanNarrative) => set({ actionPlanNarrative }),
  setActionPlanEvidencePdfUrl: (actionPlanEvidencePdfUrl) => set({ actionPlanEvidencePdfUrl }),
  resetActionPlan: () => set({
    actionPlanStatus: 'idle',
    actionPlanError: null,
    actionPlanNarrative: '',
    actionPlanEvidencePdfUrl: null,
  }),

  // History state
  history: readHistory(),
  selectedHistoryIds: [],
  activeHistoryId: null,
  saveToHistory: async ({ aoi, aoiMode, date, hotspots, duration, zones, fromCache }) => {
    if (!aoi) return;
    const [lon, lat] = polygonCentroid(aoi);
    let label;
    try {
      label = await reverseGeocode(lat, lon);
    } catch {
      label = null;
    }
    if (!label) label = formatLatLonLabel(lat, lon);

    const hash = aoiHash(aoi);
    const createdAt = new Date().toISOString();
    const state = get();
    const existingIndex = state.history.findIndex((h) => aoiHash(h.aoi) === hash);

    const entry = {
      id: existingIndex >= 0 ? state.history[existingIndex].id : `run_${createdAt}`,
      createdAt,
      label,
      aoi,
      aoiMode: aoiMode || 'auto',
      date: date || '2026-07-15',
      hotspots: hotspots || [],
      duration: duration || [],
      zones: zones || [],
      fromCache: !!fromCache,
    };

    let next;
    if (existingIndex >= 0) {
      next = [...state.history];
      next[existingIndex] = entry;
    } else {
      next = [...state.history, entry];
      if (next.length > HISTORY_MAX_ENTRIES) {
        next = next.slice(next.length - HISTORY_MAX_ENTRIES);
      }
    }

    persistHistory(next);
    set({ history: next, activeHistoryId: entry.id });
  },
  loadHistoryEntry: (id) => {
    const state = get();
    const entry = state.history.find((h) => h.id === id);
    if (!entry) return;
    set({
      aoi: entry.aoi,
      aoiMode: entry.aoiMode,
      hotspots: entry.hotspots,
      heatTiles: null,
      selectedHotspot: null,
      durationZones: entry.duration,
      durationTiles: null,
      showDurationLayer: entry.duration.length > 0,
      prioritizeZones: entry.zones,
      selectedZone: null,
      showResultsPanel: true,
      activeHistoryId: id,
      allocateStatus: 'idle',
      allocateError: null,
      allocation: null,
      actionPlanStatus: 'idle',
      actionPlanError: null,
      actionPlanNarrative: '',
      actionPlanEvidencePdfUrl: null,
    });
    if (state.mapRef) {
      const box = polygonBBox(entry.aoi);
      state.mapRef.fitBounds(
        [
          [box.minLon, box.minLat],
          [box.maxLon, box.maxLat],
        ],
        { padding: 40, essential: true }
      );
    }
  },
  toggleHistorySelection: (id) =>
    set((state) => {
      const index = state.selectedHistoryIds.indexOf(id);
      if (index >= 0) {
        return { selectedHistoryIds: state.selectedHistoryIds.filter((i) => i !== id) };
      }
      if (state.selectedHistoryIds.length >= HISTORY_PALETTE.length) {
        return state;
      }
      return { selectedHistoryIds: [...state.selectedHistoryIds, id] };
    }),
  clearHistorySelection: () => set({ selectedHistoryIds: [] }),
  deleteHistoryEntry: (id) =>
    set((state) => {
      const next = state.history.filter((h) => h.id !== id);
      persistHistory(next);
      return {
        history: next,
        selectedHistoryIds: state.selectedHistoryIds.filter((i) => i !== id),
        activeHistoryId: state.activeHistoryId === id ? null : state.activeHistoryId,
      };
    }),
  clearHistory: () => {
    persistHistory([]);
    set({ history: [], selectedHistoryIds: [], activeHistoryId: null });
  },
  setHistoryEntryRerun: (id, { status, error = null }) =>
    set((state) => ({
      history: state.history.map((h) =>
        h.id === id ? { ...h, rerunStatus: status, rerunError: error || undefined } : h
      ),
    })),
  clearHistoryRerun: (id) =>
    set((state) => ({
      history: state.history.map((h) =>
        h.id === id ? { ...h, rerunStatus: undefined, rerunError: undefined } : h
      ),
    })),
  flashHistoryScores: (id) =>
    set((state) => ({
      history: state.history.map((h) => (h.id === id ? { ...h, flashScores: Date.now() } : h)),
    })),
}));
