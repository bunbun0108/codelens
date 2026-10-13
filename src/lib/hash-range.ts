export interface LineRange {
  start: number;
  end: number;
}

/**
 * Parses a line hash from URL hash strings like "#L42", "#L42-L58", or "L42-L58".
 * Normalizes reversed ranges (e.g., #L58-L42 -> start: 42, end: 58).
 * Returns null if the hash is invalid or malformed.
 */
export function parseLineHash(hash: string): LineRange | null {
  if (!hash) return null;

  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  const match = /^L(\d+)(?:-L?(\d+))?$/.exec(clean);
  if (!match) return null;

  const rawStart = parseInt(match[1]!, 10);
  const rawEnd = match[2] !== undefined ? parseInt(match[2]!, 10) : rawStart;

  if (isNaN(rawStart) || isNaN(rawEnd) || rawStart <= 0 || rawEnd <= 0) {
    return null;
  }

  const start = Math.min(rawStart, rawEnd);
  const end = Math.max(rawStart, rawEnd);

  return { start, end };
}

/**
 * Clamps a line range to the file's line count.
 * Returns null if the file has 0 lines or if clamped start > totalLines.
 */
export function clampLineRange(range: LineRange | null, totalLines: number): LineRange | null {
  if (!range || totalLines <= 0) return null;

  if (range.start > totalLines) {
    // If range starts past the end of the file, clamp to the last line
    return { start: totalLines, end: totalLines };
  }

  const start = Math.max(1, Math.min(range.start, totalLines));
  const end = Math.max(start, Math.min(range.end, totalLines));

  return { start, end };
}

/**
 * Formats a LineRange to a hash string, e.g. "L42" or "L42-L58".
 */
export function formatLineHash(range: LineRange): string {
  if (range.start === range.end) {
    return `L${range.start}`;
  }
  return `L${range.start}-L${range.end}`;
}
