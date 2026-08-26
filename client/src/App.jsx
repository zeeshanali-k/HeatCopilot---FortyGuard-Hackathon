/**
 * App component
 *
 * Root layout for HeatCopilot: a full-screen map with floating panels for
 * search, feature controls, results, and a theme toggle.
 */

import MapView from './components/MapView';
import SearchBox from './components/SearchBox';
import FeaturePanel from './components/FeaturePanel';
import ResultsPanel from './components/ResultsPanel';
import ThemeToggle from './components/ThemeToggle';

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
      <MapView />
      <SearchBox />
      <FeaturePanel />
      <ResultsPanel />
      <ThemeToggle />
    </div>
  );
}

export default App;
