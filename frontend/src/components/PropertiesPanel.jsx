import React, { useState, useRef } from 'react';

export default function PropertiesPanel({ node, voices, onUpdate, onTashkeel, onUploadVoice }) {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  if (!node) {
    return (
      <div className="properties-panel">
        <h3>Properties</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          Select a node to edit its properties
        </p>
      </div>
    );
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `rec_${Date.now()}.webm`, { type: 'audio/webm' });
        await onUploadVoice(file);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorderRef.current.start();
      setRecording(true);
    } catch (err) {
      alert('Microphone access denied or failed.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  return (
    <div className="properties-panel">
      <h3>Properties — {node.id}</h3>

      <div className="form-group">
        <label>Arabic Text</label>
        <textarea
          rows={4}
          value={node.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          placeholder="اكتب النص العربي هنا..."
        />
        <button
          className="btn btn-sm"
          style={{ marginTop: 4 }}
          onClick={onTashkeel}
        >
          Apply Tashkeel
        </button>
      </div>

      <div className="form-group">
        <label>Voice</label>
        <select
          value={node.voice || ''}
          onChange={(e) => onUpdate({ voice: e.target.value || null })}
        >
          <option value="">Default</option>
          {voices.map((v) => (
            <option key={v} value={v}>
              {v.split(/[\\/]/).pop()}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          <label className="btn btn-sm" style={{ flex: 1, textAlign: 'center' }}>
            Upload
            <input
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                if (e.target.files[0]) onUploadVoice(e.target.files[0]);
              }}
            />
          </label>
          <button
            className={`btn btn-sm ${recording ? 'btn-primary' : ''}`}
            style={{ flex: 1, background: recording ? 'var(--accent)' : '' }}
            onClick={recording ? stopRecording : startRecording}
          >
            {recording ? 'Stop Rec' : 'Record'}
          </button>
        </div>
      </div>

      <div className="form-group">
        <label>Seed: {node.seed}</label>
        <input
          type="number"
          value={node.seed}
          onChange={(e) => onUpdate({ seed: parseInt(e.target.value) || 42 })}
        />
      </div>

      <div className="form-group">
        <label>Pitch Offset: {node.pitch_shift} semitones</label>
        <input
          type="range"
          min="-12"
          max="12"
          step="1"
          value={node.pitch_shift}
          onChange={(e) => onUpdate({ pitch_shift: parseInt(e.target.value) })}
        />
      </div>

      <div className="form-group">
        <label>Volume: {node.volume.toFixed(2)}</label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.05"
          value={node.volume}
          onChange={(e) => onUpdate({ volume: parseFloat(e.target.value) })}
        />
      </div>

      <div className="form-group">
        <label>Speed: {node.speed.toFixed(2)}x</label>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.05"
          value={node.speed}
          onChange={(e) => onUpdate({ speed: parseFloat(e.target.value) })}
        />
      </div>

      <div className="form-group">
        <label>Start Time: {node.start_time.toFixed(1)}s</label>
        <input
          type="range"
          min="0"
          max="120"
          step="0.1"
          value={node.start_time}
          onChange={(e) => onUpdate({ start_time: parseFloat(e.target.value) })}
        />
      </div>

      <div className="form-group">
        <label>Fade In: {node.fade_in.toFixed(1)}s</label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={node.fade_in}
          onChange={(e) => onUpdate({ fade_in: parseFloat(e.target.value) })}
        />
      </div>

      <div className="form-group">
        <label>Fade Out: {node.fade_out.toFixed(1)}s</label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={node.fade_out}
          onChange={(e) => onUpdate({ fade_out: parseFloat(e.target.value) })}
        />
      </div>
    </div>
  );
}
