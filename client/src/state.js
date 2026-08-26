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

export const useStore = create((set) => ({
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
  setMapRef: (mapRef) => set({ mapRef }),
  setAoi: (aoi) => set({ aoi }),

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
    actionPlanStatus: 'idle',
    actionPlanError: null,
    actionPlanNarrative: '',
    actionPlanEvidencePdfUrl: null,
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
