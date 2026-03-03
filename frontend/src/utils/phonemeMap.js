/**
 * BayanSynth Studio — Arabic → Romanized Phoneme Mapping
 *
 * Client-side approximate transliteration for display in note blocks.
 * For production accuracy, use the backend /api/phonemize endpoint.
 */

// Buckwalter-style character map (simplified for display)
const CHAR_MAP = {
  'ء': "'", 'آ': "'aa", 'أ': "'a", 'ؤ': "'u", 'إ': "'i", 'ئ': "'",
  'ا': 'aa', 'ب': 'b', 'ة': 'h', 'ت': 't', 'ث': 'th',
  'ج': 'j', 'ح': 'H', 'خ': 'kh', 'د': 'd', 'ذ': 'dh',
  'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 'S',
  'ض': 'D', 'ط': 'T', 'ظ': 'Z', 'ع': '3', 'غ': 'gh',
  'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm',
  'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y',
  'ى': 'aa',  // alef maqsurah
  // Diacritics (harakat)
  'َ': 'a',     // fathah
  'ُ': 'u',     // dammah
  'ِ': 'i',     // kasrah
  'ً': 'an',    // fathatan (tanween)
  'ٌ': 'un',    // dammatan
  'ٍ': 'in',    // kasratan
  'ْ': '',      // sukun — no vowel
  'ّ': '',      // shaddah — doubling handled separately
  // Common extras
  'ـ': '',      // tatweel (stretch character)
  'لا': 'laa',
};

/**
 * Approximate Arabic text → romanized phoneme string.
 * Not linguistically perfect — meant for UI display.
 * @param {string} text — Arabic text (preferably diacritized)
 * @returns {string} romanized string with hyphens between segments
 */
export function arabicToPhonemes(text) {
  if (!text) return '';

  const segments = [];
  let i = 0;
  const chars = [...text]; // Handle multi-byte correctly

  while (i < chars.length) {
    const ch = chars[i];
    const next = chars[i + 1] || '';

    // Skip whitespace — preserve as space separator
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      if (segments.length > 0 && segments[segments.length - 1] !== ' ') {
        segments.push(' ');
      }
      i++;
      continue;
    }

    // Check for shaddah (doubling next consonant)
    if (next === 'ّ') {
      const base = CHAR_MAP[ch] || ch;
      segments.push(base);
      segments.push(base);
      i += 2;
      continue;
    }

    // "لا" ligature
    if (ch === 'ل' && next === 'ا') {
      segments.push('laa');
      i += 2;
      continue;
    }

    const mapped = CHAR_MAP[ch];
    if (mapped !== undefined) {
      if (mapped !== '') segments.push(mapped);
    } else if (/[\u0600-\u06FF]/.test(ch)) {
      // Unknown Arabic character — pass through
      segments.push(ch);
    }
    // Skip non-Arabic characters (punctuation, digits)

    i++;
  }

  // Join with hyphens, collapsing spaces
  return segments
    .reduce((acc, seg) => {
      if (seg === ' ') {
        acc.push(' ');
      } else if (acc.length === 0 || acc[acc.length - 1] === ' ') {
        acc.push(seg);
      } else {
        acc.push('-' + seg);
      }
      return acc;
    }, [])
    .join('')
    .replace(/^-/, '')
    .replace(/-\s/g, ' ')
    .replace(/\s-/g, ' ');
}

/**
 * Check if a string contains Arabic characters.
 */
export function isArabic(text) {
  return /[\u0600-\u06FF]/.test(text);
}

/**
 * Check if text has diacritics (harakat).
 */
export function hasDiacritics(text) {
  return /[\u064B-\u065F]/.test(text);
}
