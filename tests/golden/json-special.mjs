// JSON nie zna NaN, Infinity ani -0. Wzorce zapisują je jako { "$n": "NaN" | "Inf" | "-Inf" | "-0" }.
export function encode(v) {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return { $n: 'NaN' };
    if (v === Infinity) return { $n: 'Inf' };
    if (v === -Infinity) return { $n: '-Inf' };
    if (Object.is(v, -0)) return { $n: '-0' };
    return v;
  }
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
}
const SPECIAL = { NaN: NaN, Inf: Infinity, '-Inf': -Infinity, '-0': -0 };
export function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === '$n') return SPECIAL[v.$n];
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  }
  return v;
}
