/**
 * A run record's hash: 32-bit FNV-1a over the UTF-16 code units of its JSON text, as 8 hex digits. The CLI, the app's
 * Web Workers and the tests hash the same `JSON.stringify(record)`, so the same bundle, overlay and seed give the same
 * hash in Node and in the browser (Plan 4 Global Constraints, "Same seed, same result, everywhere").
 */
export function hashRecord(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
