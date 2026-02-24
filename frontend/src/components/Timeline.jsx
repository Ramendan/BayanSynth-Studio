import React from 'react';

/**
 * Timeline — visual track with draggable nodes representing text segments.
 */
export default function Timeline({ nodes, selectedId, onSelect, onUpdateNode }) {
  const trackRef = React.useRef(null);
  const pixelsPerSecond = 80;

  // Calculate total timeline width
  const maxEnd = nodes.reduce(
    (max, n) => Math.max(max, n.start_time + Math.max(n.duration, 1)),
    10
  );
  const trackWidth = Math.max(maxEnd * pixelsPerSecond + 200, 800);

  // Simple drag-to-reposition
  const handleDragStart = (e, nodeId) => {
    e.dataTransfer.setData('nodeId', nodeId);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const nodeId = e.dataTransfer.getData('nodeId');
    if (!nodeId || !trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newTime = Math.max(0, x / pixelsPerSecond);

    onUpdateNode(nodeId, { start_time: Math.round(newTime * 10) / 10 });
  };

  const handleDragOver = (e) => e.preventDefault();

  // Time ruler ticks
  const ticks = [];
  for (let t = 0; t <= maxEnd + 2; t++) {
    ticks.push(
      <div
        key={t}
        style={{
          position: 'absolute',
          left: t * pixelsPerSecond,
          top: 0,
          height: '100%',
          borderLeft: '1px solid #2a3a5c',
          fontSize: 9,
          color: '#555',
          paddingLeft: 2,
        }}
      >
        {t}s
      </div>
    );
  }

  return (
    <div>
      <div className="timeline-header">
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          Timeline ({maxEnd.toFixed(1)}s total)
        </span>
      </div>

      {/* Ruler */}
      <div
        style={{
          position: 'relative',
          height: 18,
          width: trackWidth,
          marginBottom: 2,
        }}
      >
        {ticks}
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="timeline-track"
        style={{ width: trackWidth }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {nodes.map((node) => (
          <div
            key={node.id}
            className={`timeline-node ${selectedId === node.id ? 'selected' : ''}`}
            style={{
              left: node.start_time * pixelsPerSecond,
              width: Math.max(node.duration, 0.5) * pixelsPerSecond,
            }}
            draggable
            onDragStart={(e) => handleDragStart(e, node.id)}
            onClick={() => onSelect(node.id)}
            title={node.text}
          >
            <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 2 }}>
              {node.id}
            </div>
            <div style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {node.text.slice(0, 30)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
