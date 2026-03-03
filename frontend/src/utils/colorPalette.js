/**
 * BayanSynth Studio — 16-Color Track Palette
 * Inspired by Vocaloid 6 track coloring.
 */

export const TRACK_COLORS = [
  '#00f0ff',  //  0 — Cyan (Lead)
  '#ff2dcc',  //  1 — Magenta (Harmony)
  '#ff6b35',  //  2 — Orange
  '#35ff69',  //  3 — Green
  '#ffd700',  //  4 — Gold
  '#ff4757',  //  5 — Red
  '#7c4dff',  //  6 — Deep Purple
  '#00e5ff',  //  7 — Light Cyan
  '#ff6e40',  //  8 — Deep Orange
  '#64ffda',  //  9 — Teal
  '#ffab40',  // 10 — Amber
  '#e040fb',  // 11 — Pink Purple
  '#448aff',  // 12 — Blue
  '#69f0ae',  // 13 — Light Green
  '#ffc400',  // 14 — Yellow
  '#f50057',  // 15 — Hot Pink
];

/**
 * Get track color by index (wraps around).
 */
export function getTrackColor(index) {
  return TRACK_COLORS[index % TRACK_COLORS.length];
}

/**
 * Get a dimmed version of a track color (for backgrounds, muted tracks).
 */
export function getTrackColorDim(index, opacity = 0.15) {
  const hex = TRACK_COLORS[index % TRACK_COLORS.length];
  return `${hex}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
}

/**
 * Get glow shadow CSS for a track color.
 */
export function getTrackGlow(index) {
  const color = TRACK_COLORS[index % TRACK_COLORS.length];
  return `0 0 12px ${color}88`;
}
