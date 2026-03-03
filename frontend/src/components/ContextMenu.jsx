/**
 * BayanSynth Studio — Context Menu
 *
 * Floating right-click-style context menu for notes.
 * Reads from contextMenuAtom { x, y, nodeId }.
 * Actions: Duplicate, Delete, Move to Track ▸ (submenu).
 */

import React from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  Copy, Trash2, ArrowRightLeft, Scissors,
} from 'lucide-react';
import {
  contextMenuAtom,
  tracksAtom,
  duplicateSelectedAtom,
  removeNodeAtom,
  moveNodeToTrackAtom,
  selectedNodeIdAtom,
  splitNodeAtom,
  settingsAtom,
} from '../store/atoms';
import { pushHistoryAtom } from '../store/history';

const ICO = { size: 13, strokeWidth: 1.5 };

export default function ContextMenu() {
  const [menu, setMenu] = useAtom(contextMenuAtom);
  const tracks = useAtomValue(tracksAtom);
  const duplicateSelected = useSetAtom(duplicateSelectedAtom);
  const removeNode = useSetAtom(removeNodeAtom);
  const moveNodeToTrack = useSetAtom(moveNodeToTrackAtom);
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom);
  const pushHistory = useSetAtom(pushHistoryAtom);
  const settings = useAtomValue(settingsAtom);

  if (!menu) return null;

  const close = () => setMenu(null);

  const handleDuplicate = () => {
    pushHistory();
    duplicateSelected();
    close();
  };

  const handleDelete = () => {
    if (menu.nodeId) {
      if (settings.confirmDelete !== false) {
        if (!window.confirm('Delete this node?')) return;
      }
      pushHistory();
      removeNode(menu.nodeId);
    }
    close();
  };

  const handleMoveToTrack = (targetTrackId) => {
    if (menu.nodeId) {
      pushHistory();
      moveNodeToTrack({ nodeId: menu.nodeId, targetTrackId });
    }
    close();
  };

  // Find which track the node belongs to
  const currentTrackId = (() => {
    for (const t of tracks) {
      if (t.nodes.some(n => n.id === menu.nodeId)) return t.id;
    }
    return null;
  })();

  return (
    <>
      {/* Backdrop to close */}
      <div className="context-backdrop" onClick={close} />
      <div
        className="context-menu"
        style={{ left: menu.x, top: menu.y }}
      >
        <button className="context-item" onClick={handleDuplicate}>
          <Copy {...ICO} /> Duplicate
        </button>
        <button className="context-item danger" onClick={handleDelete}>
          <Trash2 {...ICO} /> Delete
        </button>

        {/* Move to track sub-items */}
        {tracks.length > 1 && (
          <>
            <div className="context-sep" />
            <div className="context-label">
              <ArrowRightLeft {...ICO} /> Move to Track
            </div>
            {tracks
              .filter(t => t.id !== currentTrackId)
              .map(t => (
                <button
                  key={t.id}
                  className="context-item sub"
                  onClick={() => handleMoveToTrack(t.id)}
                >
                  <span className="ctx-color" style={{ background: t.color || '#00f0ff' }} />
                  {t.name}
                </button>
              ))
            }
          </>
        )}
      </div>
    </>
  );
}
