/**
 * BayanSynth Studio — Konva Theme Color Bridge
 *
 * Konva canvas components cannot read CSS custom properties (--bg-primary etc.)
 * because they render to <canvas>, not DOM elements.  This module provides a
 * simple lookup that maps the theme name ('dark'|'light') to concrete hex
 * values, mirroring the CSS variables defined in styles.css.
 */

const COLORS = {
  dark: {
    // Piano keys
    pianoBg:          '#0e0e12',
    pianoKeyBlack:    '#0a0a0e',
    pianoKeyWhite:    '#1a1a22',
    pianoBorderLight: '#1e1e28',
    pianoBorderAccent:'#2a2a3c',
    pianoLabel:       '#888898',
    pianoLabelDim:    '#4a4a58',

    // Grid
    gridBg:           '#0d0d12',
    gridRowBlack:     '#0c0c10',
    gridRowWhite:     '#12121a',
    gridLineLight:    '#161620',
    gridLineBeat:     '#1a1a28',
    gridLineSub:      '#141420',
    gridLineBar:      '#2a2a3c',
    gridLineOctave:   '#2a2a3c',

    // Time ruler
    rulerBg:          '#111115',
    rulerTickMajor:   '#4a4a5c',
    rulerTickMinor:   '#2a2a3c',
    rulerText:        '#888898',
    rulerTextDim:     '#4a4a58',
    rulerBorder:      '#2a2a3c',

    // Ghost note overlay
    ghostFill:        '#ffffff14',
    ghostStroke:      '#ffffff66',
  },

  light: {
    // Piano keys — matches [data-theme="light"] CSS vars
    pianoBg:          '#c8c8d4',   // --bg-elevated
    pianoKeyBlack:    '#b0b0c0',   // --black-key
    pianoKeyWhite:    '#e4e4ec',   // --white-key
    pianoBorderLight: '#c8c8d8',   // --border-light
    pianoBorderAccent:'#b8b8c8',   // --border
    pianoLabel:       '#6a6a80',   // --piano-label
    pianoLabelDim:    '#8a8aa0',

    // Grid
    gridBg:           '#d4d4de',   // --bg-surface
    gridRowBlack:     '#c8c8d8',   // slightly darker than white rows
    gridRowWhite:     '#dddde6',   // --bg-panel
    gridLineLight:    '#c0c0d0',
    gridLineBeat:     '#b8b8ca',   // --grid-line-beat
    gridLineSub:      '#cacad8',   // --grid-line
    gridLineBar:      '#a0a0b8',   // --grid-line-bar
    gridLineOctave:   '#a0a0b8',

    // Time ruler
    rulerBg:          '#dddde6',   // --bg-panel
    rulerTickMajor:   '#6a6a80',
    rulerTickMinor:   '#a0a0b8',
    rulerText:        '#5a5a70',   // --text-dim (slightly darker for readability)
    rulerTextDim:     '#8a8aa0',
    rulerBorder:      '#b8b8c8',   // --border

    // Ghost note overlay — darker outline so it remains visible on light tiles
    ghostFill:        '#0099bb1a',
    ghostStroke:      '#0b4f72cc',
  },
};

/**
 * Return the Konva color set for the given theme.
 * Falls back to dark theme for any unknown theme name.
 *
 * @param {string} theme  'dark' | 'light'
 * @returns {typeof COLORS.dark}
 */
export function getThemeColors(theme) {
  return COLORS[theme] || COLORS.dark;
}
