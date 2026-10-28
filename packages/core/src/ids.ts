/** Short random ids for scene objects. Not security-sensitive. */
export function createId(prefix = ''): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  let s = '';
  for (const b of bytes) s += b.toString(36).padStart(2, '0');
  return prefix ? `${prefix}_${s}` : s;
}
