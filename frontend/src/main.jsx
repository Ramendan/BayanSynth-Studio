/**
 * BayanSynth Studio — Entry Point
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider as JotaiProvider } from 'jotai';
import App from './App';
import './styles.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[BayanSynth] Render error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', background: '#0b0b0b',
          color: '#ff2dcc', fontFamily: 'monospace', padding: 32, gap: 16,
        }}>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>BayanSynth Studio — Startup Error</div>
          <div style={{ color: '#ff6b6b', fontSize: 13, maxWidth: 700, wordBreak: 'break-word' }}>
            {this.state.error.message}
          </div>
          <pre style={{ color: '#888', fontSize: 11, maxWidth: 700, overflow: 'auto', maxHeight: 300 }}>
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: '8px 24px', background: '#00f0ff22',
              border: '1px solid #00f0ff', color: '#00f0ff', cursor: 'pointer', borderRadius: 4 }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <JotaiProvider>
        <App />
      </JotaiProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
