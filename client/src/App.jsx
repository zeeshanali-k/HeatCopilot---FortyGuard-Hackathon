/**
 * App component
 *
 * Root layout for HeatCopilot. The FeaturePanel is a fixed-width docked
 * sidebar on the left; the map sits in the remaining width so the two never
 * overlap. Other panels float above the map on the right.
 */

import MapView from './components/MapView';
import SearchBox from './components/SearchBox';
import FeaturePanel from './components/FeaturePanel';
import ResultsPanel from './components/ResultsPanel';
import ThemeToggle from './components/ThemeToggle';
import CompareView from './components/CompareView';

const SIDEBAR_WIDTH = 280;

function App() {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: SIDEBAR_WIDTH,
          right: 0,
          bottom: 0,
        }}
      >
        <MapView />
        <SearchBox />
      </div>
      <FeaturePanel />
      <ResultsPanel />
      <ThemeToggle />
      <CompareView />
    </div>
  );
}

export default App;
