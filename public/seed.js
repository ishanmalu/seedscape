// Seed text -> 64-bit seed, the way Minecraft Java does it: whole numbers in
// range are used as-is, anything else goes through String.hashCode.

export function javaHash(s) {
  let h = 0;
  // Java's String.hashCode works on UTF-16 code units.
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

// Unsigned 64-bit seed as a decimal string, or null for empty input.
export function parseSeed(text) {
  const t = text.trim();
  if (t === '') return null;
  if (/^-?\d+$/.test(t)) {
    const n = BigInt(t);
    if (n >= -(2n ** 63n) && n < 2n ** 63n) return BigInt.asUintN(64, n).toString();
  }
  return BigInt.asUintN(64, BigInt(javaHash(t))).toString();
}

export const signed = (u) => BigInt.asIntN(64, BigInt(u)).toString();

export function randomSeed() {
  const a = new BigUint64Array(1);
  crypto.getRandomValues(a);
  return signed(a[0]);
}
