/// <reference types="google.maps" />
import { decodePolyline, walkRadiusMeters } from './geo';
import { BAND_FILLS, FROM_MAP, TO_MAP, type Legend, type MapPatch, type MapPin, type MapState, type ReachLayer } from './map-types';
import { iconSvg } from './ui/icons';

// This file runs in the page's own JavaScript world (a MAIN-world content
// script) because that's the only place the site's google.maps.Map instance is
// reachable. It has no extension APIs; the isolated content script sends it
// state over postMessage and it draws:
//   - Google's transit layer (Metro, rail and bus lines)
//   - the reachable area for one place, as a canvas overlay under the site's pins
//   - a labeled pin per place
//   - a route the user picked in the side panel
//   - a small legend control in the map's corner

const RAD = Math.PI / 180;
const REACH_OPACITY = 0.35;

type GMaps = typeof google.maps;

const gmaps = (): GMaps | null => (window as unknown as { google?: { maps?: GMaps } }).google?.maps ?? null;

// ---------------------------------------------------------------- finding the map
//
// Neither site exposes its map on purpose, so there are three ways to find it:
//   1. Zillow renders it from a React component that holds the instance in
//      state; walking the fiber tree up from .gm-style finds it immediately.
//   2. Redfin keeps it on window (__preloaded_map__ at the time of writing).
//   3. As a fallback, wrap a few Map.prototype methods and remember whichever
//      map the site calls them on. That only works after the first pan/zoom.

const seenByPrototype = new Set<google.maps.Map>();

function patchPrototypeOnce(g: GMaps): void {
  const proto = g.Map.prototype as unknown as Record<string, unknown> & { __railtymaps?: boolean };
  if (proto.__railtymaps) return;
  proto.__railtymaps = true;
  for (const name of ['getBounds', 'getZoom', 'getCenter', 'fitBounds', 'panTo', 'setCenter', 'setZoom']) {
    const original = proto[name];
    if (typeof original !== 'function') continue;
    proto[name] = function (this: google.maps.Map, ...args: unknown[]) {
      seenByPrototype.add(this);
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}

function searchFiber(fiber: unknown, MapCtor: GMaps['Map']): google.maps.Map | null {
  const seen = new Set<object>();
  const scan = (obj: unknown): google.maps.Map | null => {
    if (!obj || typeof obj !== 'object' || seen.has(obj)) return null;
    seen.add(obj);
    if (obj instanceof MapCtor) return obj;
    if (obj instanceof Node) return null;
    for (const key of Object.keys(obj)) {
      try {
        const v = (obj as Record<string, unknown>)[key];
        if (v instanceof MapCtor) return v;
        const current = v && typeof v === 'object' && 'current' in v ? (v as { current: unknown }).current : null;
        if (current instanceof MapCtor) return current;
      } catch {
        // Some props are getters that throw.
      }
    }
    return null;
  };
  type Fiber = { return?: Fiber; stateNode?: unknown; memoizedProps?: unknown; memoizedState?: unknown; ref?: { current?: unknown } };
  let f = fiber as Fiber | undefined;
  for (let depth = 0; f && depth < 40; depth++, f = f.return) {
    const hit = scan(f.stateNode) ?? scan(f.memoizedProps) ?? scan(f.ref?.current);
    if (hit) return hit;
    // Function components keep hooks in a linked list of memoizedState entries.
    let hook = f.memoizedState as { memoizedState?: unknown; next?: unknown } | undefined;
    for (let n = 0; hook && typeof hook === 'object' && n < 60; n++) {
      const st = hook.memoizedState;
      const found = scan(st) ?? (st && typeof st === 'object' && 'current' in st ? scan((st as { current: unknown }).current) : null);
      if (found) return found;
      hook = hook.next as typeof hook;
    }
  }
  return null;
}

function mapsOnWindow(MapCtor: GMaps['Map']): google.maps.Map[] {
  const out: google.maps.Map[] = [];
  for (const key of Object.keys(window)) {
    if (!/map/i.test(key)) continue;
    try {
      const v = (window as unknown as Record<string, unknown>)[key];
      if (v instanceof MapCtor) out.push(v);
      else if (v && typeof v === 'object' && (v as { map?: unknown }).map instanceof MapCtor) out.push((v as { map: google.maps.Map }).map);
    } catch {
      // Cross-origin frames and the like throw on access.
    }
  }
  return out;
}

const visibleArea = (m: google.maps.Map) => {
  const div = m.getDiv();
  return div.isConnected ? div.offsetWidth * div.offsetHeight : 0;
};

/** The biggest visible Google Map on the page, or null. */
export function findGoogleMap(): google.maps.Map | null {
  const g = gmaps();
  if (!g?.Map) return null;
  patchPrototypeOnce(g);
  const found = new Set<google.maps.Map>(mapsOnWindow(g.Map));
  for (const el of document.querySelectorAll('.gm-style')) {
    let node: Element | null = el;
    for (let up = 0; up < 8 && node; up++, node = node.parentElement) {
      const fiberKey = Object.keys(node).find((k) => k.startsWith('__reactFiber$'));
      if (!fiberKey) continue;
      const m = searchFiber((node as unknown as Record<string, unknown>)[fiberKey], g.Map);
      if (m) {
        found.add(m);
        break;
      }
    }
  }
  for (const m of seenByPrototype) {
    if (m.getDiv().isConnected) found.add(m);
    else seenByPrototype.delete(m);
  }
  return [...found].filter((m) => visibleArea(m) > 0).sort((a, b) => visibleArea(b) - visibleArea(a))[0] ?? null;
}

// ---------------------------------------------------------------- drawing

interface Layers {
  setTransit(on: boolean): void;
  setReach(r: ReachLayer | null): void;
  setPins(pins: MapPin[]): void;
  setRoute(route: MapState['route'], fit: boolean): void;
  setLegend(legend: Legend | null): void;
  detach(): void;
}

// Web Mercator, in the same pixel space Google uses at a given zoom.
const worldX = (lon: number, scale: number) => ((lon + 180) / 360) * scale;
function worldY(lat: number, scale: number): number {
  const s = Math.min(Math.max(Math.sin(lat * RAD), -0.9999), 0.9999);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
}
const pxPerMeter = (lat: number, zoom: number) => 2 ** zoom / (156543.03392 * Math.cos(lat * RAD));

const LEGEND_CSS = `
:host { all: initial; }
.box { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; max-width: 420px; background: #fff; color: #0f172a;
  border-radius: 12px; box-shadow: 0 2px 10px rgba(15,23,42,.18); padding: 6px 8px;
  font: 600 12px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.mark { width: 18px; height: 18px; border-radius: 5px; background: #1d4ed8; color: #fff; display: inline-flex;
  align-items: center; justify-content: center; flex: none; }
select { font: inherit; color: inherit; border: 1px solid #cbd5e1; border-radius: 8px; padding: 3px 6px; background: #fff; max-width: 170px; }
.sw { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; color: #334155; }
.sw i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
button { border: 0; background: none; color: #475569; cursor: pointer; padding: 2px; display: inline-flex; border-radius: 6px; }
button:focus-visible, select:focus-visible { outline: 2px solid #1d4ed8; outline-offset: 1px; }
`;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

function createLayers(map: google.maps.Map, g: GMaps, onShade: (placeId: string | null) => void): Layers {
  class ReachOverlay extends g.OverlayView {
    private canvas = document.createElement('canvas');
    // Each band is painted opaque into this buffer and composited once, so
    // overlapping circles don't stack up into darker blotches.
    private buffer = document.createElement('canvas');
    data: ReachLayer | null = null;

    constructor() {
      super();
      Object.assign(this.canvas.style, { position: 'absolute', pointerEvents: 'none' });
    }

    override onAdd() {
      // overlayLayer sits under the site's own markers, so prices stay clickable.
      this.getPanes()?.overlayLayer.appendChild(this.canvas);
    }

    override onRemove() {
      this.canvas.remove();
    }

    override draw() {
      const canvas = this.canvas;
      const proj = this.getProjection();
      const m = this.getMap() as google.maps.Map | null;
      const center = m?.getCenter();
      const zoom = m?.getZoom();
      if (!this.data || !proj || !m || !center || zoom == null) {
        canvas.style.display = 'none';
        return;
      }
      const div = m.getDiv();
      const w = div.offsetWidth;
      const h = div.offsetHeight;
      const cpx = proj.fromLatLngToDivPixel(center);
      if (!w || !h || !cpx) return;
      canvas.style.display = '';

      // Draw a canvas twice the size of the map so a drag has something to show
      // until 'idle' fires and we redraw.
      const cw = w * 2;
      const ch = h * 2;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const cv of [canvas, this.buffer]) {
        if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
          cv.width = Math.round(cw * dpr);
          cv.height = Math.round(ch * dpr);
        }
      }
      Object.assign(canvas.style, { left: `${cpx.x - w}px`, top: `${cpx.y - h}px`, width: `${cw}px`, height: `${ch}px` });

      const scale = 256 * 2 ** zoom;
      const cx = worldX(center.lng(), scale);
      const cy = worldY(center.lat(), scale);
      const { lat, lon, dur, bands, walkSpeed, maxWalk, placeLat, placeLon } = this.data;
      const maxR = walkRadiusMeters(maxWalk, walkSpeed) * pxPerMeter(center.lat(), zoom);

      const buf = this.buffer.getContext('2d');
      const out = canvas.getContext('2d');
      if (!buf || !out) return;
      buf.setTransform(dpr, 0, 0, dpr, 0, 0);
      buf.clearRect(0, 0, cw, ch);

      const xs = new Float32Array(lat.length);
      const ys = new Float32Array(lat.length);
      const onScreen: number[] = [];
      for (let i = 0; i < lat.length; i++) {
        const x = worldX(lon[i], scale) - cx + w;
        const y = worldY(lat[i], scale) - cy + h;
        if (x < -maxR || y < -maxR || x > cw + maxR || y > ch + maxR) continue;
        xs[i] = x;
        ys[i] = y;
        onScreen.push(i);
      }
      const px = worldX(placeLon, scale) - cx + w;
      const py = worldY(placeLat, scale) - cy + h;

      // Longest band first; shorter bands paint over it.
      for (let b = Math.min(bands.length, BAND_FILLS.length) - 1; b >= 0; b--) {
        const limit = bands[b];
        buf.fillStyle = BAND_FILLS[b];
        buf.beginPath();
        // The place itself: anywhere within walking distance of it counts.
        const rPlace = walkRadiusMeters(Math.min(maxWalk, limit), walkSpeed) * pxPerMeter(placeLat, zoom);
        buf.moveTo(px + rPlace, py);
        buf.arc(px, py, rPlace, 0, Math.PI * 2);
        // Each stop: whatever time is left after the ride, spent walking to the stop.
        for (const i of onScreen) {
          const spare = limit - dur[i];
          if (spare <= 0) continue;
          const radius = walkRadiusMeters(Math.min(maxWalk, spare), walkSpeed) * pxPerMeter(lat[i], zoom);
          if (radius < 0.75) continue;
          buf.moveTo(xs[i] + radius, ys[i]);
          buf.arc(xs[i], ys[i], radius, 0, Math.PI * 2);
        }
        buf.fill();
      }
      out.setTransform(1, 0, 0, 1, 0, 0);
      out.clearRect(0, 0, canvas.width, canvas.height);
      out.globalAlpha = REACH_OPACITY;
      out.drawImage(this.buffer, 0, 0);
    }
  }

  class PinOverlay extends g.OverlayView {
    private container = document.createElement('div');
    private pins: MapPin[] = [];
    private els: HTMLElement[] = [];

    override onAdd() {
      this.getPanes()?.floatPane.appendChild(this.container);
    }

    override onRemove() {
      this.container.remove();
    }

    setPins(pins: MapPin[]) {
      this.pins = pins;
      this.els = pins.map((pin) => {
        const el = document.createElement('div');
        el.title = pin.label;
        el.style.cssText =
          'position:absolute;left:0;top:0;display:flex;align-items:center;gap:4px;pointer-events:none;white-space:nowrap;' +
          'font:700 11px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif';
        const label = pin.label.length > 22 ? `${pin.label.slice(0, 21)}…` : pin.label;
        el.innerHTML =
          `<span style="width:14px;height:14px;border-radius:50%;background:${esc(pin.color)};border:3px solid #fff;` +
          `box-shadow:0 1px 4px rgba(0,0,0,.4);margin:-10px 0 0 -10px"></span>` +
          `<span style="background:${esc(pin.color)};color:#fff;padding:2px 6px;border-radius:6px;margin-top:-10px;` +
          `box-shadow:0 1px 3px rgba(0,0,0,.3)">${esc(label)}</span>`;
        return el;
      });
      this.container.replaceChildren(...this.els);
      this.draw();
    }

    override draw() {
      const proj = this.getProjection();
      if (!proj) return;
      this.pins.forEach((pin, i) => {
        const pt = proj.fromLatLngToDivPixel(new g.LatLng(pin.lat, pin.lon));
        if (pt) this.els[i].style.transform = `translate(${pt.x}px, ${pt.y}px)`;
      });
    }
  }

  // The legend lives in Google's own control slots, so it moves with the map's
  // other controls instead of floating over listing pins.
  const legendHost = document.createElement('div');
  legendHost.style.margin = '0 0 10px 10px';
  const legendRoot = legendHost.attachShadow({ mode: 'open' });
  legendRoot.innerHTML = `<style>${LEGEND_CSS}</style><div class="box" role="group" aria-label="RailtyMaps shading"></div>`;
  const legendBox = legendRoot.querySelector('.box')!;
  legendRoot.addEventListener('change', (ev) => onShade((ev.target as HTMLSelectElement).value || null));
  legendRoot.addEventListener('click', (ev) => {
    if ((ev.target as Element).closest?.('[data-act="off"]')) onShade(null);
  });
  // Don't let clicks and scrolls on the legend pan or zoom the map underneath.
  for (const type of ['mousedown', 'pointerdown', 'dblclick', 'wheel', 'touchstart']) {
    legendHost.addEventListener(type, (ev) => ev.stopPropagation());
  }
  const corner = map.controls[g.ControlPosition.LEFT_BOTTOM];
  corner.push(legendHost);

  const reach = new ReachOverlay();
  const pins = new PinOverlay();
  reach.setMap(map);
  pins.setMap(map);
  const idle = map.addListener('idle', () => reach.draw());
  let transit: google.maps.TransitLayer | null = null;
  let routeLines: google.maps.Polyline[] = [];

  return {
    setTransit(on) {
      if (on && !transit) {
        transit = new g.TransitLayer();
        transit.setMap(map);
      } else if (!on && transit) {
        transit.setMap(null);
        transit = null;
      }
    },
    setReach(r) {
      reach.data = r;
      reach.draw();
    },
    setPins(list) {
      pins.setPins(list);
    },
    setLegend(legend) {
      if (!legend?.activeId) {
        legendHost.style.display = 'none';
        return;
      }
      legendHost.style.display = '';
      const options = legend.options
        .map((o) => `<option value="${esc(o.id)}"${o.id === legend.activeId ? ' selected' : ''}>${esc(o.label)}</option>`)
        .join('');
      const swatches = legend.bands
        .map((b, i) => `<span class="sw"><i style="background:${BAND_FILLS[i]}"></i>${b}${i === legend.bands.length - 1 ? ' min' : ''}</span>`)
        .join('');
      legendBox.innerHTML =
        `<span class="mark">${iconSvg('logo', 12, 2.6)}</span>` +
        `<select aria-label="Place whose reach is shaded">${options}</select>${swatches}` +
        `<button data-act="off" aria-label="Turn off shading" title="Turn off shading">${iconSvg('x', 14, 2.4)}</button>`;
    },
    setRoute(route, fit) {
      routeLines.forEach((l) => l.setMap(null));
      routeLines = [];
      if (!route) return;
      const bounds = new g.LatLngBounds();
      for (const leg of route.legs) {
        const path = decodePolyline(leg.polyline, leg.precision).map(([la, lo]) => ({ lat: la, lng: lo }));
        if (path.length < 2) continue;
        path.forEach((pt) => bounds.extend(pt));
        if (leg.mode === 'WALK') {
          // Dotted line: an invisible stroke with a repeating dash symbol.
          const dash = { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#1f2937', scale: 3 };
          routeLines.push(new g.Polyline({ map, path, strokeOpacity: 0, zIndex: 1002, icons: [{ icon: dash, offset: '0', repeat: '10px' }] }));
        } else {
          routeLines.push(new g.Polyline({ map, path, strokeColor: '#ffffff', strokeOpacity: 1, strokeWeight: 9, zIndex: 1000 }));
          routeLines.push(new g.Polyline({ map, path, strokeColor: leg.color || '#0f766e', strokeOpacity: 1, strokeWeight: 5, zIndex: 1001 }));
        }
      }
      // Only move the map if the route doesn't already fit. Moving it makes the
      // site re-run its search for the new area, which is disruptive.
      const view = map.getBounds();
      if (fit && !bounds.isEmpty() && !(view?.contains(bounds.getNorthEast()) && view?.contains(bounds.getSouthWest()))) {
        map.fitBounds(bounds, 60);
      }
    },
    detach() {
      idle.remove();
      reach.setMap(null);
      pins.setMap(null);
      transit?.setMap(null);
      routeLines.forEach((l) => l.setMap(null));
      const i = corner.getArray().indexOf(legendHost);
      if (i >= 0) corner.removeAt(i);
    },
  };
}

// ---------------------------------------------------------------- wiring

export function startMapOverlay(findMap: () => google.maps.Map | null = findGoogleMap): void {
  const state: MapState = { transitLines: false, reach: null, pins: [], route: null, legend: null };
  let map: google.maps.Map | null = null;
  let layers: Layers | null = null;

  const announce = (msg: Record<string, unknown>) => window.postMessage({ channel: FROM_MAP, ...msg }, location.origin);
  const onShade = (placeId: string | null) => announce({ type: 'shade', placeId });

  function attach() {
    const g = gmaps();
    const found = g ? findMap() : null;
    if (found === map) return;
    layers?.detach();
    map = found;
    layers = map && g ? createLayers(map, g, onShade) : null;
    if (layers) {
      layers.setTransit(state.transitLines);
      layers.setReach(state.reach);
      layers.setPins(state.pins);
      layers.setRoute(state.route, false);
      layers.setLegend(state.legend);
    }
    announce({ type: 'status', mapFound: !!map });
  }

  window.addEventListener('message', (ev: MessageEvent) => {
    if (ev.source !== window || ev.data?.channel !== TO_MAP) return;
    const patch = ev.data.patch as MapPatch;
    Object.assign(state, patch);
    if (!layers) attach();
    if (!layers) return;
    if ('transitLines' in patch) layers.setTransit(state.transitLines);
    if ('reach' in patch) layers.setReach(state.reach);
    if ('pins' in patch) layers.setPins(state.pins);
    if ('route' in patch) layers.setRoute(state.route, true);
    if ('legend' in patch) layers.setLegend(state.legend);
  });

  attach();
  // Maps are created late and replaced on client-side navigation. Checking once
  // a second is cheap once a map is found: it's just an isConnected test.
  setInterval(() => {
    if (!map || !map.getDiv().isConnected) attach();
  }, 1000);
  announce({ type: 'ready' });
}
