// Injected into a real Redfin search page by shoot.mjs. It does what the
// extension's content script does (read cards, draw badges, tell the map script
// what to draw), but with reach data handed in instead of fetched through the
// background, because there's no extension running in the headless browser.
import { estimateOne } from '../../lib/estimate';
import { GridIndex, WALK_SPEED } from '../../lib/geo';
import { TO_MAP, type RouteLeg } from '../../lib/map-types';
import { redfin } from '../../lib/sites/redfin';
import type { CompactReach, Person, Place } from '../../lib/types';
import { createHost, HOST_ATTR, placeAsOverlay, renderCardBadge } from '../../lib/ui/badges';
import { initials } from '../../lib/util';

interface Input {
  people: Person[];
  places: Place[];
  reach: Record<string, CompactReach>;
  bands: number[];
  shade: string;
}

const personOf = (input: Input, place: Place) => input.people.find((p) => p.id === place.personId)!;

function badges(input: Input): number {
  const grids = Object.fromEntries(Object.entries(input.reach).map(([id, r]) => [id, new GridIndex(r.lat, r.lon)]));
  document.querySelectorAll(`[${HOST_ATTR}]`).forEach((el) => el.remove());
  let count = 0;
  for (const card of document.querySelectorAll(redfin.cards)) {
    const listing = redfin.parseCard(card, document);
    if (!listing) continue;
    const items = input.places.map((place) => {
      const person = personOf(input, place);
      const walking = { walkPace: person.walkPace, maxWalkMinutes: person.maxWalkMinutes, stepFree: person.stepFree };
      return {
        place,
        person,
        initials: initials(person, input.people),
        estimate: estimateOne(listing, place, input.reach[place.id], grids[place.id], walking),
      };
    });
    const { host, root } = createHost({ onOpen() {}, onToggleSave() {}, onSetup() {} });
    const slot = redfin.badgeSlot(card);
    if ('overlay' in slot) placeAsOverlay(host, slot.overlay);
    else if ('after' in slot) slot.after.after(host);
    else slot.appendTo.appendChild(host);
    renderCardBadge(root, { items, bands: input.bands, saved: count === 0 }, 'overlay' in slot);
    count++;
  }
  return count;
}

function map(input: Input, route: RouteLeg[] | null = null): void {
  const shaded = input.places.find((p) => p.id === input.shade)!;
  const person = personOf(input, shaded);
  const r = input.reach[shaded.id];
  const limit = input.bands[input.bands.length - 1];
  const keep = r.dur.flatMap((d, i) => (d < limit ? [i] : []));
  const patch = {
    transitLines: true,
    pins: input.places.map((p) => ({ lat: p.lat, lon: p.lon, label: p.label, color: personOf(input, p).color })),
    legend: {
      activeId: shaded.id,
      options: input.places.map((p) => ({ id: p.id, label: `${personOf(input, p).name} · ${p.label}` })),
      bands: input.bands,
    },
    reach: {
      lat: keep.map((i) => r.lat[i]),
      lon: keep.map((i) => r.lon[i]),
      dur: keep.map((i) => r.dur[i]),
      bands: input.bands,
      walkSpeed: WALK_SPEED[person.walkPace],
      maxWalk: person.maxWalkMinutes,
      placeLat: shaded.lat,
      placeLon: shaded.lon,
    },
    route: route && { legs: route },
  };
  window.postMessage({ channel: TO_MAP, patch }, location.origin);
}

(window as unknown as { __railtymapsShots: unknown }).__railtymapsShots = { badges, map };
