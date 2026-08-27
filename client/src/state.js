/**
 * Global application state
 *
 * Single zustand store holding map, search, hotspot, and heat-duration state.
 * Keeps UI components decoupled from prop drilling.
 */

import { create } from 'zustand';

const STORAGE_KEY = 'fortyguard-theme';
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
  draftCursor: null,
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
  setDraftCursor: (draftCursor) => set({ draftCursor }),
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
  setSearchResults: (searchResults) => set({ searchResults }),

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
  allocation: null, // { funded, unfunded, totalSpent, budgetUsd, impact }
  setAllocateStatus: (allocateStatus) => set({ allocateStatus }),
  setAllocateError: (allocateError) => set({ allocateError }),
  setAllocation: (allocation) => set({ allocation }),
  resetAllocate: () => set({
    allocateStatus: 'idle',
    allocateError: null,
    allocation: null,
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
}));
