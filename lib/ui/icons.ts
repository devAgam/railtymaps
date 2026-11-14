// A small hand-drawn icon set on a 24px grid, stroked, round caps. Emoji were
// the first try and they render differently on every OS, which made the badges
// look like a different product on Windows.

type Attrs = Record<string, string | number>;
export type Shape = ['path' | 'circle' | 'rect', Attrs];

const p = (d: string): Shape => ['path', { d }];
const c = (cx: number, cy: number, r: number, fill = false): Shape => ['circle', fill ? { cx, cy, r, fill: 'currentColor', stroke: 'none' } : { cx, cy, r }];
const r = (x: number, y: number, w: number, h: number, rx: number): Shape => ['rect', { x, y, width: w, height: h, rx }];

export const ICONS = {
  logo: [p('M4 11.5 12 5l8 6.5'), p('M6.5 10v5.5h11V10'), p('M3 19.5h18')],
  walk: [c(13, 4.5, 2), p('M12 8.5 10.5 14l2.5 2.5V21'), p('M10.5 14 8 21'), p('M12 8.5 8.5 10l-1 3'), p('m12 9 1.5 3 3 1')],
  bus: [r(5, 3, 14, 15, 2.5), p('M5 11h14'), p('M8 18v2.5'), p('M16 18v2.5'), c(8.5, 14.5, 0.9, true), c(15.5, 14.5, 0.9, true)],
  metro: [r(5, 3, 14, 14, 4), p('M5 10.5h14'), p('m9 21 1.5-4'), p('m15 21-1.5-4'), c(9, 13.5, 0.9, true), c(15, 13.5, 0.9, true)],
  rail: [r(5, 4, 14, 12, 2), p('M5 9.5h14'), p('m8 21 2-5'), p('m16 21-2-5'), p('M7 19h10')],
  tram: [r(6, 6, 12, 11, 2), p('M9 3h6'), p('M12 3v3'), p('M6 11.5h12'), p('m9 21 1.5-4'), p('m15 21-1.5-4')],
  ferry: [p('m4 15 2-6h12l2 6'), p('M12 9V5'), p('M3 19c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0')],
  star: [p('m12 3.2 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z')],
  x: [p('m6 6 12 12'), p('M18 6 6 18')],
  plus: [p('M12 5v14'), p('M5 12h14')],
  check: [p('m5 12.5 4.5 4.5L19 7.5')],
  chevronLeft: [p('m15 18-6-6 6-6')],
  chevronRight: [p('m9 6 6 6-6 6')],
  chevronDown: [p('m6 9 6 6 6-6')],
  search: [c(11, 11, 7), p('M16.5 16.5 21 21')],
  external: [p('M14 4h6v6'), p('m20 4-9 9'), p('M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5')],
  map: [p('M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z'), p('M9 4v13.5'), p('M15 6.5V20')],
  layers: [p('m12 3 9 4.5-9 4.5-9-4.5z'), p('m3 12 9 4.5 9-4.5'), p('m3 16.5 9 4.5 9-4.5')],
  settings: [p('M4 6h9'), p('M17 6h3'), c(15, 6, 2), p('M4 12h3'), p('M11 12h9'), c(9, 12, 2), p('M4 18h11'), p('M19 18h1'), c(17, 18, 2)],
  stepFree: [c(12, 4.5, 1.5), p('M10 8.5h5'), p('M12 8.5v5h5l2 5'), p('M8.5 11.6A5 5 0 1 0 15 17.5')],
  copy: [r(9, 9, 11, 11, 2), p('M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1')],
  alert: [p('M12 3.5 21.5 20h-19z'), p('M12 10v4'), p('M12 17h.01')],
  info: [c(12, 12, 9), p('M12 11v5'), p('M12 8h.01')],
  home: [p('M4 10.5 12 4l8 6.5'), p('M6 9v11h12V9'), p('M10 20v-6h4v6')],
  eye: [p('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z'), c(12, 12, 3)],
  eyeOff: [p('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z'), c(12, 12, 3), p('m4 4 16 16')],
  download: [p('M12 4v11'), p('m7 10 5 5 5-5'), p('M4 19h16')],
  upload: [p('M12 15V4'), p('m7 9 5-5 5 5'), p('M4 19h16')],
  trash: [p('M4 7h16'), p('M9 7V4h6v3'), p('m6 7 1 13h10l1-13')],
  more: [c(12, 5, 1.4, true), c(12, 12, 1.4, true), c(12, 19, 1.4, true)],
  clock: [c(12, 12, 9), p('M12 7v5l3 2')],
  users: [c(9, 8, 3), p('M3.5 20a5.5 5.5 0 0 1 11 0'), c(17, 9, 2.5), p('M16 14a4.5 4.5 0 0 1 5 6')],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

/** Icon for a transit mode as MOTIS names it. */
export function modeIcon(mode: string | undefined): IconName {
  if (!mode || mode === 'WALK') return 'walk';
  if (mode === 'SUBWAY' || mode === 'METRO') return 'metro';
  if (mode === 'TRAM') return 'tram';
  if (mode === 'FERRY') return 'ferry';
  if (/RAIL|SUBURBAN/.test(mode)) return 'rail';
  return 'bus';
}

const attrString = (attrs: Attrs) =>
  Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');

/** SVG markup for places that build HTML strings (badges, map legend). */
export function iconSvg(name: IconName, size = 16, strokeWidth = 2): string {
  const shapes = ICONS[name].map(([tag, attrs]) => `<${tag} ${attrString(attrs)}></${tag}>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes}</svg>`;
}
