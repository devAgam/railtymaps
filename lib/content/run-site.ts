import { browser } from 'wxt/browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { FROM_MAP, TO_MAP, type MapPatch } from '../map-types';
import { send, type TabMessage } from '../messages';
import type { SiteAdapter } from '../sites/types';
import { DEFAULT_SETTINGS, getPeople, getPlaces, getSaved, getSettings, listingKey, saveSettings, toggleSaved } from '../storage';
import type { Estimate, Listing, Person, Place, Settings } from '../types';
import { createHost, HOST_ATTR, placeAsOverlay, renderCardBadge, renderDetailCard, type BadgeHandlers, type BadgeModel } from '../ui/badges';
import { debounce, initials } from '../util';

// The isolated-world half of the extension on a listing site. It
//   - finds search-result cards and asks the background for times,
//   - renders a badge row into each card and a floating card on home pages,
//   - tells the page-world map script (map.content.ts) what to draw,
//   - reports what it found so the side panel can explain an empty page.
// Zillow and Redfin share all of this; the differences are in lib/sites/.

interface Entry {
  root: ShadowRoot;
  id: string;
  overlay?: boolean;
}

/** The nearest positioned box around a card's first photo, to float badges over. */
function photoBox(card: Element): Element | null {
  for (let el = card.querySelector('img')?.parentElement ?? null; el && el !== card; el = el.parentElement) {
    if (getComputedStyle(el).position !== 'static') return el;
  }
  return null;
}

export function runSite(ctx: ContentScriptContext, site: SiteAdapter): void {
  void start(ctx, site);
}

async function start(ctx: ContentScriptContext, site: SiteAdapter): Promise<void> {
  let people: Person[] = [];
  let places: Place[] = [];
  let settings: Settings = DEFAULT_SETTINGS;
  let savedKeys = new Set<string>();

  const listings = new Map<string, Listing>();
  const estimates = new Map<string, Estimate[]>();
  const entries = new Map<HTMLElement, Entry>();
  const pending = new Set<string>();
  let inflight = false;
  let detail: (Entry & { host: HTMLElement; listing: Listing | null; note?: string }) | null = null;

  const visiblePlaces = () => places.filter((p) => p.enabled);

  async function loadConfig() {
    const [pp, pl, s, saved] = await Promise.all([getPeople(), getPlaces(), getSettings(), getSaved()]);
    people = pp;
    places = pl;
    settings = s;
    savedKeys = new Set(saved.map(listingKey));
  }

  /** Everything that changes the numbers, as opposed to how they're drawn. */
  const estimateInputs = () =>
    JSON.stringify([
      visiblePlaces().map((p) => [p.id, p.lat, p.lon, p.arriveBy, p.day, p.tz, p.mode, p.personId]),
      people.map((p) => [p.id, p.walkPace, p.maxWalkMinutes, p.stepFree]),
      settings.routerUrl,
    ]);

  function model(id: string): BadgeModel {
    const shown = visiblePlaces();
    const found = estimates.get(id);
    return {
      items: shown.map((place) => {
        const person = people.find((p) => p.id === place.personId);
        return { place, person, initials: initials(person, people), estimate: found?.find((e) => e.placeId === place.id) };
      }),
      bands: settings.bands,
      saved: savedKeys.has(`${site.site}:${id}`),
    };
  }

  // ------------------------------------------------------------ actions

  let toastHost: HTMLElement | null = null;
  function toast(text: string) {
    toastHost?.remove();
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<div role="status" style="position:fixed;right:16px;bottom:16px;z-index:2147483001;max-width:320px;
      background:#0f172a;color:#fff;font:13px/1.4 system-ui,sans-serif;padding:10px 14px;border-radius:10px;
      box-shadow:0 6px 24px rgba(0,0,0,.3)"></div>`;
    root.querySelector('div')!.textContent = text;
    document.body.appendChild(host);
    toastHost = host;
    setTimeout(() => host.remove(), 5000);
  }

  function openPanel(listing?: Listing) {
    // Has to go out synchronously from the click handler: Chrome only lets the
    // background open the side panel while the user gesture is still live.
    send({ type: 'openPanel', listing })
      .then(({ opened }) => {
        if (!opened) toast('Click the RailtyMaps button in the toolbar to see routes.');
      })
      .catch(() => toast('RailtyMaps was updated. Reload the page to keep using it.'));
  }

  const handlersFor = (id: string): BadgeHandlers => ({
    onOpen: () => openPanel(listings.get(id)),
    onToggleSave: () => {
      const l = listings.get(id);
      if (l) void toggleSaved(l);
    },
    onSetup: () => openPanel(),
  });

  // ------------------------------------------------------------ badges

  function renderAll() {
    for (const [host, e] of entries) {
      if (!host.isConnected) entries.delete(host);
      else renderCardBadge(e.root, model(e.id), e.overlay);
    }
    renderDetail();
  }

  /** Puts a rendered badge host into a card. Returns true if it ended up floating over the photo. */
  function insert(card: Element, host: HTMLElement): boolean {
    const slot = site.badgeSlot(card);
    if ('overlay' in slot) {
      placeAsOverlay(host, slot.overlay);
      return true;
    }
    if ('after' in slot) slot.after.after(host);
    else slot.appendTo.appendChild(host);
    // If the card has a fixed height, our row just pushed the site's own text
    // out of view. Float over the photo instead; never hide the site's content.
    const style = getComputedStyle(card);
    if (/hidden|clip/.test(`${style.overflow} ${style.overflowY}`) && card.scrollHeight > card.clientHeight + 1) {
      const photo = photoBox(card);
      if (photo) {
        placeAsOverlay(host, photo);
        return true;
      }
    }
    return false;
  }

  async function flush() {
    if (inflight || !pending.size) return;
    if (!visiblePlaces().length) {
      pending.clear();
      return;
    }
    inflight = true;
    const ids = [...pending].filter((id) => listings.has(id));
    pending.clear();
    try {
      const homes = ids.map((id) => ({ id, lat: listings.get(id)!.lat, lon: listings.get(id)!.lon }));
      const res = await send({ type: 'estimate', homes });
      for (const id of ids) estimates.set(id, res.results[id] ?? []);
      if (Object.keys(res.errors).length) scheduleRetry();
    } catch (e) {
      if (ctx.isInvalid) return;
      const error = (e as Error).message;
      for (const id of ids) estimates.set(id, visiblePlaces().map((p) => ({ placeId: p.id, minutes: null, error })));
      scheduleRetry();
    } finally {
      inflight = false;
    }
    renderAll();
    if (pending.size) void flush();
  }

  function scan() {
    if (ctx.isInvalid) return;
    let cards = 0;
    for (const card of document.querySelectorAll(site.cards)) {
      const listing = site.parseCard(card, document);
      if (!listing) continue;
      cards++;
      listings.set(listing.id, listing);
      const existing = card.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
      if (existing && existing.dataset.listing === listing.id && entries.has(existing)) {
        if (!estimates.has(listing.id)) pending.add(listing.id);
        continue;
      }
      // New card, or the site re-rendered it (or recycled it for another home).
      existing?.remove();
      const { host, root } = createHost(handlersFor(listing.id));
      host.dataset.listing = listing.id;
      // Render before inserting so the clipping check in insert() measures the real row.
      renderCardBadge(root, model(listing.id));
      const overlay = insert(card, host);
      if (overlay) renderCardBadge(root, model(listing.id), true);
      entries.set(host, { root, id: listing.id, overlay });
      if (!estimates.has(listing.id)) pending.add(listing.id);
    }
    reportStatus(cards);
    void flush();
    void checkDetailPage();
  }

  /** Re-price what's on screen (e.g. a full plan was just cached) without blanking badges. */
  const refreshAll = debounce(() => {
    for (const e of entries.values()) pending.add(e.id);
    if (detail?.listing) pending.add(detail.listing.id);
    void flush();
  }, 400);

  // A failed request retries once a minute, not on every DOM change.
  let retryScheduled = false;
  function scheduleRetry() {
    if (retryScheduled) return;
    retryScheduled = true;
    ctx.setTimeout(() => {
      retryScheduled = false;
      refreshAll();
    }, 60_000);
  }

  let lastStatus = '';
  const reportStatus = debounce((cards: number) => {
    const url = new URL(location.href);
    const status = { site: site.site, url: url.origin + url.pathname, searchPage: site.isSearchPage(url), cards, checkedAt: Date.now() };
    const sig = `${status.url}|${status.searchPage}|${cards > 0}`;
    if (sig === lastStatus) return;
    lastStatus = sig;
    void send({ type: 'pageStatus', status }).catch(() => {});
  }, 1500);

  // ------------------------------------------------------------ home details page

  function renderDetail() {
    if (!detail) return;
    const m = model(detail.listing?.id ?? detail.id);
    renderDetailCard(detail.root, {
      ...m,
      // Spinners until we know where the home is.
      items: detail.listing ? m.items : m.items.map((i) => ({ ...i, estimate: undefined })),
      address: detail.listing?.address ?? site.detailAddress(document),
      note: detail.note,
    });
  }

  async function resolveDetailListing(id: string): Promise<Listing | null> {
    const url = location.href.split('?')[0];
    const known = listings.get(id);
    if (known) return { ...known, url };
    // Both sites fill the page in after client-side navigation; give it a few seconds.
    for (let i = 0; i < 8; i++) {
      const ll = site.detailLatLng(id, document);
      if (ll) return { site: site.site, id, lat: ll[0], lon: ll[1], address: site.detailAddress(document), url };
      await new Promise((r) => setTimeout(r, 500));
      if (site.detailId(new URL(location.href)) !== id) return null;
    }
    const address = site.detailAddress(document);
    try {
      const [hit] = await send({ type: 'geocode', text: address });
      if (hit) return { site: site.site, id, lat: hit.lat, lon: hit.lon, address, url };
    } catch {
      // Fall through to "couldn't find".
    }
    return null;
  }

  async function checkDetailPage() {
    const id = site.detailId(new URL(location.href));
    if (!id) {
      detail?.host.remove();
      detail = null;
      return;
    }
    if (detail?.id === id) {
      if (!detail.host.isConnected) document.body.appendChild(detail.host);
      return;
    }
    detail?.host.remove();
    const { host, root } = createHost({
      onOpen: () => openPanel(detail?.listing ?? undefined),
      onToggleSave: () => {
        if (detail?.listing) void toggleSaved(detail.listing);
      },
      onSetup: () => openPanel(),
    });
    document.body.appendChild(host);
    detail = { host, root, id, listing: null };
    renderDetail();

    const listing = await resolveDetailListing(id);
    if (!detail || detail.id !== id) return;
    if (!listing) {
      detail.note = "Couldn't find this home's location on the page.";
      renderDetail();
      return;
    }
    detail.listing = listing;
    listings.set(id, listing);
    void send({ type: 'setCurrent', listing }).catch(() => {});
    if (estimates.has(id)) renderDetail();
    else {
      pending.add(id);
      void flush();
    }
  }

  // ------------------------------------------------------------ map

  const postMap = (patch: MapPatch) => window.postMessage({ channel: TO_MAP, patch }, location.origin);

  async function syncMap() {
    const shown = visiblePlaces();
    const personOf = (place: Place) => people.find((p) => p.id === place.personId);
    postMap({
      transitLines: settings.showTransitLines,
      pins: settings.showPins
        ? shown.map((p) => ({ lat: p.lat, lon: p.lon, label: p.label, color: personOf(p)?.color ?? '#475569' }))
        : [],
    });
    // Shading works for transit and walking; there's no free isochrone data for cars.
    const shadable = shown.filter((p) => p.mode !== 'drive');
    const shaded = settings.showShading ? shadable.find((p) => p.id === settings.shadePlaceId) : undefined;
    const legend = {
      activeId: shaded?.id ?? null,
      options: shadable.map((p) => ({ id: p.id, label: `${personOf(p)?.name ?? ''} · ${p.label}`.replace(/^ · /, '') })),
      bands: [...settings.bands],
    };
    if (!shaded) {
      postMap({ reach: null, legend });
      return;
    }
    try {
      const r = await send({ type: 'reachForMap', placeId: shaded.id });
      postMap({
        legend,
        reach: r && {
          lat: r.lat,
          lon: r.lon,
          dur: r.dur,
          bands: [...settings.bands],
          walkSpeed: r.walkSpeed,
          maxWalk: r.maxWalk,
          placeLat: shaded.lat,
          placeLon: shaded.lon,
        },
      });
    } catch {
      postMap({ reach: null, legend });
    }
  }

  ctx.addEventListener(window, 'message', (ev: MessageEvent) => {
    if (ev.source !== window || ev.data?.channel !== FROM_MAP) return;
    if (ev.data.type === 'ready') void syncMap();
    else if (ev.data.type === 'shade') {
      // The legend runs in the page world, so don't trust the id blindly.
      // Its x turns shading off but remembers the place for next time.
      const id = ev.data.placeId;
      if (id === null) void saveSettings({ showShading: false });
      else if (places.some((p) => p.id === id)) void saveSettings({ shadePlaceId: id, showShading: true });
    }
  });

  // ------------------------------------------------------------ wiring

  const onStorage = (changes: Record<string, unknown>, area: string) => {
    if (area !== 'local' || ctx.isInvalid) return;
    if ('places' in changes || 'people' in changes || 'settings' in changes) {
      const before = estimateInputs();
      void loadConfig().then(() => {
        if (estimateInputs() !== before) estimates.clear();
        renderAll();
        scan();
        void syncMap();
      });
    } else if ('saved' in changes) {
      void loadConfig().then(renderAll);
    } else if (Object.keys(changes).some((k) => k.startsWith('plan:'))) {
      refreshAll();
    }
  };
  browser.storage.onChanged.addListener(onStorage);

  const onTabMessage = (msg: TabMessage) => {
    if (msg?.type === 'showRoute') {
      const legs = msg.itinerary.legs
        .filter((l) => l.polyline)
        .map((l) => ({ mode: l.mode, polyline: l.polyline!, precision: l.precision ?? 5, color: l.color }));
      postMap({ route: { legs } });
    } else if (msg?.type === 'clearRoute') {
      postMap({ route: null });
    }
    return undefined;
  };
  browser.runtime.onMessage.addListener(onTabMessage);

  const observer = new MutationObserver(debounce(scan, 200));
  observer.observe(document.body, { childList: true, subtree: true });
  ctx.addEventListener(window, 'wxt:locationchange', () => void checkDetailPage());
  ctx.onInvalidated(() => {
    observer.disconnect();
    browser.storage.onChanged.removeListener(onStorage);
    browser.runtime.onMessage.removeListener(onTabMessage);
    for (const host of entries.keys()) host.remove();
    detail?.host.remove();
  });

  await loadConfig();
  scan();
  void syncMap();
}
