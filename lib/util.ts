/** Short stable hash (FNV-1a, 32-bit) for storage keys. */
export function hashKey(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Many bus feeds name stops in capitals: "COLESVILLE RD & NOYES DR" becomes
 * "Colesville Rd & Noyes Dr". Names that already use lowercase are left alone.
 */
export function prettyName(name: string): string {
  if (!name || name.length < 4 || /[a-z]/.test(name)) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s\-/&(.])([a-z])/g, (_, before: string, c: string) => before + c.toUpperCase())
    .replace(/\b(Nw|Ne|Sw|Se|Dc|Md|Va|Us)\b/g, (w) => w.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, c: string) => `Mc${c.toUpperCase()}`);
}

/**
 * Avatar text. One letter normally, two when someone else's name starts with
 * the same letter: "Me" and "Mom" are a very common pair.
 */
export function initials(person: { id: string; name: string } | undefined, people: { id: string; name: string }[]): string {
  const name = person?.name.trim() ?? '';
  if (!name) return '?';
  const first = name[0].toUpperCase();
  const clash = people.some((p) => p.id !== person!.id && p.name.trim()[0]?.toUpperCase() === first);
  return clash && name.length > 1 ? first + name[1].toLowerCase() : first;
}

/** "13222 Ewood Ln, Silver Spring, MD 20906" → "13222 Ewood Ln". */
export function shortAddress(address: string): string {
  return address.split(',')[0]?.trim() || address;
}
