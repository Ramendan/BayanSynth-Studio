/**
 * BayanSynth Studio — Parameter Editor
 *
 * Collapsible bottom drawer with DYN / PIT / VIB tabs.
 * Syncs to the selected node's automation arrays.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { parameterDrawerOpenAtom } from '../../store/atoms';

import DynLane from './DynLane';
import PitLane from './PitLane';
import VibLane from './VibLane';
import EffectsLane from './EffectsLane';
import TransitionsLane from './TransitionsLane';

const TABS = [
  { id: 'dyn', label: 'Dynamics', color: '#00f0ff' },
  { id: 'pit', label: 'Pitch', color: '#ff2dcc' },
  { id: 'vib', label: 'Vibrato', color: '#a855f7' },
  { id: 'fx',  label: 'Effects', color: '#ffd700' },
  { id: 'tr',  label: 'Transitions', color: '#35ff69' },
];

const MIN_HEIGHT = 30;
const DEFAULT_HEIGHT = 160;
const MAX_HEIGHT = 350;

export default function ParameterEditor({ zoom = 1, panX = 0 }) {
  const [isOpen, setIsOpen] = useAtom(parameterDrawerOpenAtom);
  const [activeTab, setActiveTab] = useState('dyn');
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const containerRef = useRef(null);
  const isResizing = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // Width from container
  const [laneWidth, setLaneWidth] = useState(800);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setLaneWidth(entry.contentRect.width - 60); // minus tab bar
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Resize handle drag
  const handleResizeStart = useCallback((e) => {
    isResizing.current = true;
    startY.current = e.clientY;
    startHeight.current = height;
    document.body.style.cursor = 'ns-resize';

    const handleMove = (e) => {
      if (!isResizing.current) return;
      const delta = startY.current - e.clientY;
      setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeight.current + delta)));
    };

    const handleUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [height]);

  const toggleOpen = () => setIsOpen(!isOpen);

  return (
    <div
      className={`parameter-editor ${isOpen ? 'open' : 'closed'}`}
      ref={containerRef}
      style={{ height: isOpen ? height : MIN_HEIGHT }}
    >
      {/* Resize handle */}
      {isOpen && (
        <div className="param-resize-handle" onMouseDown={handleResizeStart}>
          <div className="param-resize-grip" />
        </div>
      )}

      {/* Header bar with toggle + tabs */}
      <div className="param-header">
        <button className="param-toggle" onClick={toggleOpen} title={isOpen ? 'Collapse' : 'Expand'}>
          {isOpen ? '▼' : '▲'} Parameters
        </button>

        {isOpen && (
          <div className="param-tabs">
            {TABS.map(tab => (
              <button
                key={tab.id}
                className={`param-tab ${activeTab === tab.id ? 'active' : ''}`}
                style={{
                  '--tab-color': tab.color,
                  borderBottomColor: activeTab === tab.id ? tab.color : 'transparent',
                  color: activeTab === tab.id ? tab.color : '#666',
                }}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lane content */}
      {isOpen && (
        <div className="param-content">
          {activeTab === 'dyn' && <DynLane width={laneWidth} zoom={zoom} panX={panX} />}
          {activeTab === 'pit' && <PitLane width={laneWidth} zoom={zoom} panX={panX} />}
          {activeTab === 'vib' && <VibLane width={laneWidth} />}
          {activeTab === 'fx'  && <EffectsLane width={laneWidth} />}
          {activeTab === 'tr'  && <TransitionsLane width={laneWidth} />}
        </div>
      )}
    </div>
  );
}
