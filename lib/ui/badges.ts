import { bandIndex } from '../estimate';
import { DAY_LABEL, formatHhmm } from '../time';
import type { Estimate, Person, Place } from '../types';
import { possessive } from '../util';
import { iconSvg } from './icons';

// The pills that go on listing cards, and the floating card on a home's own
// page. Both render into shadow roots so the host site's CSS can't restyle them
// and ours can't leak into the site.

export const HOST_ATTR = 'data-railtymaps';
const MAX_PILLS = 3;

const CSS = `
:host { all: initial; display: block; }
.wrap { font: 12px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; }
.row { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; margin: 8px 0 2px; padding-top: 8px; border-top: 1px dashed #cbd5e1; }
button { font: inherit; cursor: pointer; }
button:focus-visible { outline: 2px solid #1d4ed8; outline-offset: 2px; }
.pill { display: inline-flex; align-items: center; gap: 5px; border: 1px solid; border-radius: 999px;
  padding: 2px 9px 2px 3px; max-width: 100%; white-space: nowrap; }
.pill:hover { filter: brightness(0.96); }
.av { width: 18px; height: 18px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  color: #fff; font-size: 10px; font-weight: 700; flex: none; }
.min { font-weight: 800; }
.lbl { font-weight: 600; overflow: hidden; text-overflow: ellipsis; max-width: 110px; }
.b0 { background: #d1fae5; border-color: #6ee7b7; color: #065f46; }
.b1 { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
.b2 { background: #ffedd5; border-color: #fdba74; color: #9a3412; }
.b3 { background: #ffe4e6; border-color: #fda4af; color: #9f1239; }
.bn { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }
.long { border-style: dashed; }
.warn { display: inline-flex; margin-left: -2px; }
.more { padding: 2px 9px; }
.row.overlay { margin: 0; padding: 0; border-top: 0; }
.overlay .pill, .overlay .save { box-shadow: 0 1px 4px rgba(15,23,42,.35); }
.overlay .bn { background: #fff; }
.setup { border: 1px dashed #94a3b8; background: #fff; color: #334155; border-radius: 999px; padding: 3px 10px; font-weight: 600; }
.save { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 24px; padding: 0;
  border: 1px solid #cbd5e1; background: #fff; border-radius: 999px; color: #475569; }
.save.on { color: #b45309; border-color: #fcd34d; background: #fffbeb; }
.save.on svg { fill: #f59e0b; }
.spin { width: 10px; height: 10px; margin: 0 2px 0 4px; border: 2px solid #cbd5e1; border-top-color: #475569; border-radius: 50%;
  animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
.card { position: fixed; left: 16px; bottom: 16px; z-index: 2147483000; width: 300px; box-sizing: border-box; background: #fff;
  border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 8px 28px rgba(15,23,42,.22); padding: 10px 12px; }
.card .row { border-top: 0; padding-top: 0; }
.head { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; }
.mark { width: 16px; height: 16px; border-radius: 4px; background: #1d4ed8; color: #fff; display: inline-flex;
  align-items: center; justify-content: center; }
.x { margin-left: auto; border: 0; background: none; color: #475569; padding: 2px; display: inline-flex; }
.addr { color: #475569; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; gap: 6px; margin-top: 8px; }
.primary { border: 0; background: #1d4ed8; color: #fff; border-radius: 8px; padding: 7px 10px; font-weight: 700; }
.secondary { border: 1px solid #cbd5e1; background: #fff; color: #0f172a; border-radius: 8px; padding: 7px 10px; font-weight: 600; }
.note { color: #475569; margin-top: 6px; }
`;

export interface BadgeItem {
  place: Place;
  person?: Person;
  /** Avatar text; see initials() in lib/util. */
  initials: string;
  /** Missing while the place's times are loading. */
  estimate?: Estimate;
}

export interface BadgeModel {
  items: BadgeItem[];
  bands: readonly number[];
  saved: boolean;
}

export interface BadgeHandlers {
  onOpen(): void;
  onToggleSave(): void;
  onSetup(): void;
  /** The floating card's ×, called after the card is off the page. */
  onClose?(): void;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

const BY = { transit: '', drive: ' by car', walk: ' on foot' } as const;

function spoken(item: BadgeItem): string {
  const who = `${item.person?.name ?? 'Someone'}, ${item.place.label}${BY[item.place.mode]}`;
  const e = item.estimate;
  if (!e) return `${who}: loading`;
  if (e.error) return `${who}: couldn't load`;
  if (e.minutes == null) return `${who}: no trip within 90 minutes`;
  const walk = e.longWalk ? `, with a ${e.longWalk} minute walk, past the walking limit` : '';
  return `${who}: ${e.exact ? '' : 'about '}${e.minutes} minutes${walk}`;
}

function tooltip(item: BadgeItem): string {
  const { place, estimate: e } = item;
  const when = `${formatHhmm(place.arriveBy)} ${DAY_LABEL[place.day]}`;
  if (!e) return 'Loading';
  if (e.error) return e.error;
  if (place.mode !== 'transit') {
    if (e.minutes == null) return `More than 90 minutes${BY[place.mode]} to ${place.label}.`;
    const how = place.mode === 'drive' ? 'Drive' : 'Walk';
    const traffic = place.mode === 'drive' ? ', without traffic' : '';
    return `${how} ${e.exact ? '' : 'about '}${e.minutes} min to ${place.label}${traffic}, arriving by ${when}.`;
  }
  if (e.minutes == null) return `Nothing reaches ${place.label} by ${when} within 90 minutes, even with up to an hour's walk to a stop.`;
  const lines = [`Leave ${e.exact ? '' : 'about '}${e.minutes} min before ${when}.`];
  if (e.longWalk) {
    const limit = item.person ? `${possessive(item.person.name)} ${item.person.maxWalkMinutes}-minute limit` : 'the walking limit';
    lines.push(`Needs a ${e.longWalk}-minute walk, past ${limit}.`);
  }
  if (e.walkOnly) lines.push('Walkable the whole way.');
  else {
    if (e.stopName) lines.push(`Walk ${e.walkMinutes ?? '?'} min to ${e.stopName}.`);
    if (e.transfers != null) lines.push(e.transfers === 0 ? 'No transfers.' : `${e.transfers} transfer${e.transfers > 1 ? 's' : ''}.`);
  }
  lines.push(e.exact ? 'From a full trip plan.' : 'Quick estimate. Click for exact routes.');
  return lines.join(' ');
}

function pill(item: BadgeItem, bands: readonly number[]): string {
  const e = item.estimate;
  const avatar = `<span class="av" style="background:${esc(item.person?.color ?? '#475569')}">${esc(item.initials)}</span>`;
  const label = `<span class="lbl">${esc(item.place.label)}</span>`;
  // Transit is the default and goes unmarked; driving and walking get a small icon.
  const mode = item.place.mode === 'drive' ? iconSvg('car', 12, 2.2) : item.place.mode === 'walk' ? iconSvg('walk', 12, 2.2) : '';
  const attrs = `data-act="open" aria-label="${esc(spoken(item))}" title="${esc(tooltip(item))}"`;
  if (!e) return `<button class="pill bn" ${attrs}><span class="spin"></span>${label}</button>`;
  if (e.error) return `<button class="pill bn" ${attrs}>${avatar}<span class="min">?</span>${label}</button>`;
  const band = e.minutes == null ? 3 : Math.min(bandIndex(e.minutes, bands), 3);
  const text = e.minutes == null ? '90+' : `${e.exact ? '' : '~'}${e.minutes}`;
  // Only works with a walk past the person's limit: dashed, with a warning mark.
  const long = e.longWalk ? ' long' : '';
  const warn = e.longWalk ? `<span class="warn">${iconSvg('alert', 11, 2.4)}</span>` : '';
  return `<button class="pill b${band}${long}" ${attrs}>${avatar}${mode}<span class="min">${text}</span>${warn}${label}</button>`;
}

/** Up to three pills; beyond that, the three slowest trips (in place order) plus "+N". */
function pills(m: BadgeModel): string {
  if (!m.items.length) {
    return `<button class="setup" data-act="setup">+ Add places for transit times</button>`;
  }
  let shown = m.items;
  if (m.items.length > MAX_PILLS) {
    const worst = [...m.items]
      .sort((a, b) => (b.estimate?.minutes ?? Infinity) - (a.estimate?.minutes ?? Infinity))
      .slice(0, MAX_PILLS);
    shown = m.items.filter((i) => worst.includes(i));
  }
  const extra = m.items.length - shown.length;
  const more = extra > 0 ? `<button class="pill bn more" data-act="open" aria-label="${extra} more places">+${extra}</button>` : '';
  return shown.map((i) => pill(i, m.bands)).join('') + more;
}

function saveButton(saved: boolean, compact: boolean): string {
  const label = saved ? 'Saved' : 'Save';
  const aria = saved ? 'Remove from saved homes' : 'Save this home';
  if (compact) {
    return `<button class="save ${saved ? 'on' : ''}" data-act="save" aria-pressed="${saved}" aria-label="${aria}" title="${aria}">${iconSvg('star', 13)}</button>`;
  }
  return `<button class="secondary" data-act="save" aria-pressed="${saved}">${label}</button>`;
}

function wire(root: ShadowRoot, h: BadgeHandlers): void {
  root.addEventListener('click', (ev) => {
    const act = (ev.target as Element).closest?.('[data-act]')?.getAttribute('data-act');
    if (act === 'open') h.onOpen();
    else if (act === 'save') h.onToggleSave();
    else if (act === 'setup') h.onSetup();
    else if (act === 'close') {
      (root.host as HTMLElement).remove();
      h.onClose?.();
    }
  });
}

// Cards on both sites are links or have click handlers that open the listing.
// Swallow events at our host so clicking a pill doesn't also navigate.
function isolateEvents(host: HTMLElement): void {
  for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown']) {
    host.addEventListener(type, (ev) => {
      ev.stopPropagation();
      if (type === 'click') ev.preventDefault();
    });
  }
}

export function createHost(handlers: BadgeHandlers): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement('div');
  host.setAttribute(HOST_ATTR, '');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style><div class="wrap"></div>`;
  wire(root, handlers);
  isolateEvents(host);
  return { host, root };
}

export function renderCardBadge(root: ShadowRoot, m: BadgeModel, overlay = false): void {
  const save = m.items.length ? saveButton(m.saved, true) : '';
  root.querySelector('.wrap')!.innerHTML = `<div class="row ${overlay ? 'overlay' : ''}">${pills(m)}${save}</div>`;
}

/** Positions a badge host over the bottom edge of a card's photo. */
export function placeAsOverlay(host: HTMLElement, over: Element): void {
  host.style.cssText = 'position:absolute;left:8px;right:8px;bottom:8px;z-index:3;';
  over.appendChild(host);
}

export function renderDetailCard(root: ShadowRoot, m: BadgeModel & { address: string; note?: string }): void {
  root.querySelector('.wrap')!.innerHTML = `<div class="card" role="region" aria-label="Transit from this home">
    <div class="head"><span class="mark">${iconSvg('logo', 12, 2.6)}</span>Transit from this home
      <button class="x" data-act="close" aria-label="Hide">${iconSvg('x', 14, 2.4)}</button></div>
    <div class="addr">${esc(m.address)}</div>
    <div class="row">${pills(m)}</div>
    ${m.items.length ? `<div class="actions"><button class="primary" data-act="open">See routes</button>${saveButton(m.saved, false)}</div>` : ''}
    ${m.note ? `<div class="note">${esc(m.note)}</div>` : ''}
  </div>`;
}
