/**
 * BayanSynth Studio — Undo/Redo History
 *
 * Wraps the tracksAtom with a history stack.
 * Uses a custom deep-clone that preserves Float32Array and other typed arrays.
 */

import { atom } from 'jotai';
import { tracksAtom } from './atoms';

const MAX_HISTORY = 100;

/**
 * Deep clone that preserves Float32Array, typed arrays, and other non-JSON types.
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Float32Array) return new Float32Array(obj);
  if (obj instanceof Int32Array) return new Int32Array(obj);
  if (obj instanceof Uint8Array) return new Uint8Array(obj);
  if (obj instanceof ArrayBuffer) return obj.slice(0);
  if (obj instanceof Set) return new Set([...obj].map(deepClone));
  if (obj instanceof Map) return new Map([...obj].map(([k, v]) => [deepClone(k), deepClone(v)]));
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) return obj.map(deepClone);
  const result = {};
  for (const key of Object.keys(obj)) {
    result[key] = deepClone(obj[key]);
  }
  return result;
}

const _historyAtom = atom({
  past: [],
  future: [],
});

export const pushHistoryAtom = atom(null, (get, set) => {
  const current = deepClone(get(tracksAtom));
  const history = get(_historyAtom);
  const past = [...history.past, current];
  if (past.length > MAX_HISTORY) past.shift();
  set(_historyAtom, { past, future: [] });
});

export const undoAtom = atom(null, (get, set) => {
  const history = get(_historyAtom);
  if (history.past.length === 0) return;

  const previous = history.past[history.past.length - 1];
  const current = deepClone(get(tracksAtom));

  set(_historyAtom, {
    past: history.past.slice(0, -1),
    future: [current, ...history.future],
  });
  set(tracksAtom, previous);
});

export const redoAtom = atom(null, (get, set) => {
  const history = get(_historyAtom);
  if (history.future.length === 0) return;

  const next = history.future[0];
  const current = deepClone(get(tracksAtom));

  set(_historyAtom, {
    past: [...history.past, current],
    future: history.future.slice(1),
  });
  set(tracksAtom, next);
});

export const canUndoAtom = atom((get) => get(_historyAtom).past.length > 0);
export const canRedoAtom = atom((get) => get(_historyAtom).future.length > 0);

export const clearHistoryAtom = atom(null, (get, set) => {
  set(_historyAtom, { past: [], future: [] });
});
