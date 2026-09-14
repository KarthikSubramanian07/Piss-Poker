export const NAME_MAX_GRAPHEMES = 16;
const NAME_MAX_BYTES = 64;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Normalizes a display name. Returns null when nothing usable is left. */
export function cleanName(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 512) return null;
  const name = input
    .normalize('NFKC')
    // Zero width joiner stays so emoji sequences survive; every other format and control char goes.
    .replace(/(?!\u200d)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!name) return null;
  const graphemes = [...segmenter.segment(name)].map((s) => s.segment).slice(0, NAME_MAX_GRAPHEMES);
  const encoder = new TextEncoder();
  while (graphemes.length > 0 && encoder.encode(graphemes.join('')).length > NAME_MAX_BYTES) graphemes.pop();
  const clipped = graphemes.join('').replace(/^\u200d+|\u200d+$/g, '').trim();
  return clipped || null;
}

export const sameName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;
