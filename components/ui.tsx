import type { ReactNode } from 'react';
import { bandIndex } from '../lib/estimate';
import type { Estimate, Person, SimpleLeg } from '../lib/types';
import { modeIcon } from '../lib/ui/icons';
import { initials } from '../lib/util';
import { Icon } from './Icon';

export function Avatar({ person, people, size }: { person?: Person; people?: Person[]; size?: 'sm' | 'lg' }) {
  return (
    <span className={`avatar ${size ?? ''}`} style={{ background: person?.color ?? '#475569' }} aria-hidden="true">
      {initials(person, people ?? [])}
    </span>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <span className="mark">
        <Icon name="logo" size={16} strokeWidth={2.4} />
      </span>
      RailtyMaps
    </span>
  );
}

/** A minutes pill colored by band. `exact: false` adds the "~" that marks a quick estimate. */
export function Minutes({
  minutes,
  bands,
  exact = true,
  compact,
  error,
  longWalk,
}: {
  minutes: number | null | undefined;
  bands: readonly number[];
  exact?: boolean;
  compact?: boolean;
  error?: string;
  /** Set when the time only works with a walk past the person's limit. */
  longWalk?: number;
}) {
  const cls = `time ${compact ? 'compact' : ''}`;
  if (error) {
    return (
      <span className={`${cls} bn`} title={error}>
        ?
      </span>
    );
  }
  if (minutes === undefined) return <span className={`${cls} bn`}>…</span>;
  if (minutes === null) return <span className={`${cls} b3`}>{compact ? '90+' : '90+ min'}</span>;
  const note = longWalk ? `Only with a ${longWalk}-minute walk, past the walking limit` : undefined;
  return (
    <span className={`${cls} b${Math.min(bandIndex(minutes, bands), 3)}${longWalk ? ' long' : ''}`} title={note}>
      {exact ? '' : '~'}
      {minutes}
      {compact ? '' : ' min'}
      {note && (
        <>
          <Icon name="alert" size={12} />
          <span className="sr-only">{note}</span>
        </>
      )}
    </span>
  );
}

export function EstimateMinutes({ e, bands, compact }: { e?: Estimate; bands: readonly number[]; compact?: boolean }) {
  return (
    <Minutes minutes={e ? e.minutes : undefined} exact={e?.exact === true} error={e?.error} longWalk={e?.longWalk} bands={bands} compact={compact} />
  );
}

// Riders know agencies by short names, and GTFS feeds use the long legal ones
// ("Southeastern Pennsylvania Transportation Authority"). First match wins, so
// specific patterns come before general ones.
const AGENCY_SHORT: [RegExp, string][] = [
  // Washington, DC area
  [/ride ?on/i, 'Ride On'],
  [/^wmata$|washington metropolitan/i, 'Metrobus'],
  [/fairfax connector/i, 'Fairfax Connector'],
  [/\bcue\b/i, 'CUE'],
  [/arlington transit|^art$/i, 'ART'],
  [/\bdash\b|alexandria transit/i, 'DASH'],
  [/thebus|prince george/i, 'TheBus'],
  [/loudoun/i, 'Loudoun Transit'],
  [/omniride|prtc|potomac and rappahannock/i, 'OmniRide'],
  [/maryland transit administration|mdot mta/i, 'MTA Maryland'],
  // New York and New Jersey
  [/long island rail/i, 'LIRR'],
  [/metro-north/i, 'Metro-North'],
  [/new york city transit|mta new york|\bnyct\b|^mta bus|^mta$/i, 'MTA'],
  [/new jersey transit|nj ?transit/i, 'NJ Transit'],
  [/port authority trans-hudson|^path$/i, 'PATH'],
  // Northeast and Midwest
  [/southeastern pennsylvania|\bsepta\b/i, 'SEPTA'],
  [/massachusetts bay|\bmbta\b/i, 'MBTA'],
  [/rhode island public transit/i, 'RIPTA'],
  [/chicago transit authority|^cta$/i, 'CTA'],
  [/^metra\b/i, 'Metra'],
  [/^pace\b/i, 'Pace'],
  [/allegheny|pittsburgh regional transit/i, 'PRT'],
  [/greater cleveland regional/i, 'RTA'],
  [/milwaukee county transit/i, 'MCTS'],
  // South
  [/metropolitan atlanta rapid|\bmarta\b/i, 'MARTA'],
  [/charlotte area transit/i, 'CATS'],
  [/miami-dade/i, 'Miami-Dade Transit'],
  [/broward county transit/i, 'BCT'],
  [/central florida regional|\blynx\b/i, 'LYNX'],
  [/hillsborough area regional/i, 'HART'],
  [/dallas area rapid|^dart\b/i, 'DART'],
  [/harris county|houston metro/i, 'METRO'],
  [/capital metropolitan|capmetro/i, 'CapMetro'],
  [/via metropolitan/i, 'VIA'],
  // West
  [/regional transportation district|^rtd$/i, 'RTD'],
  [/valley metro/i, 'Valley Metro'],
  [/utah transit/i, 'UTA'],
  [/regional transportation commission of southern nevada/i, 'RTC'],
  [/los angeles county metropolitan|^metro - los angeles|^la metro/i, 'LA Metro'],
  [/metrolink/i, 'Metrolink'],
  [/orange county transportation/i, 'OCTA'],
  [/san diego metropolitan transit|^mts$/i, 'MTS'],
  [/san francisco municipal|\bsfmta\b|^muni$/i, 'Muni'],
  [/bay area rapid transit|^bart$/i, 'BART'],
  [/alameda-contra costa|^ac transit/i, 'AC Transit'],
  [/santa clara valley|^vta$/i, 'VTA'],
  [/sacramento regional transit|^sacrt$/i, 'SacRT'],
  [/king county metro/i, 'King County Metro'],
  [/sound transit/i, 'Sound Transit'],
  [/tri-county metropolitan|trimet/i, 'TriMet'],
  [/honolulu|^thebus$/i, 'TheBus'],
];

export function shortAgency(agency: string | undefined): string | undefined {
  if (!agency) return undefined;
  const known = AGENCY_SHORT.find(([re]) => re.test(agency))?.[1];
  if (known) return known;
  // "Some Transit Authority (STA)" → "STA"
  return agency.match(/\(([A-Z][A-Za-z&-]{1,9})\)\s*$/)?.[1] ?? agency;
}

// Systems where riders say "the 15", not "SEPTA 15", because there's one main operator.
const BUS_PREFIX_SKIP = new Set(['Metrobus', 'MTA', 'CTA', 'MBTA', 'Muni', 'SEPTA', 'LA Metro', 'King County Metro', 'TriMet']);

const MODE_NAME: Record<string, string> = {
  SUBWAY: 'Subway',
  METRO: 'Metro',
  BUS: 'Bus',
  TRAM: 'Light rail',
  REGIONAL_RAIL: 'Train',
  REGIONAL_FAST_RAIL: 'Train',
  SUBURBAN: 'Train',
  RAIL: 'Train',
  FERRY: 'Ferry',
  CAR: 'Drive',
  WALK: 'Walk',
};

const RAIL_MODES = new Set(['SUBWAY', 'METRO', 'TRAM', 'REGIONAL_RAIL', 'REGIONAL_FAST_RAIL', 'SUBURBAN', 'RAIL']);
// WMATA-style: the long name is just a color ("Red") and the short name a bare code ("R").
const isColorName = (leg: SimpleLeg) => !!leg.routeLong && /^[A-Za-z]{3,10}$/.test(leg.routeLong.trim()) && (leg.route ?? '').length <= 2;

/** Chip text: "Red", "A", "Ride On 14", "M15". */
export function chipLabel(leg: SimpleLeg): string {
  const route = leg.route ?? '';
  if (RAIL_MODES.has(leg.mode)) {
    if (isColorName(leg)) return leg.routeLong!.trim();
    return route || leg.routeLong || MODE_NAME[leg.mode] || '';
  }
  if (leg.mode === 'BUS') {
    const agency = shortAgency(leg.agency);
    const prefix = agency && agency.length <= 12 && !BUS_PREFIX_SKIP.has(agency) && !route.toLowerCase().includes(agency.toLowerCase());
    if (route) return prefix ? `${agency} ${route}` : route;
  }
  return route || leg.routeLong || MODE_NAME[leg.mode] || '';
}

/** Line name for sentences: "Red Line", "A train (8 Avenue Express)", "Ride On 14". */
export function lineName(leg: SimpleLeg): string {
  const route = leg.route ?? '';
  const long = leg.routeLong?.trim() ?? '';
  if (RAIL_MODES.has(leg.mode)) {
    if (isColorName(leg)) return `${long} Line`;
    if (/\bline\b|\bbranch\b/i.test(long)) return long;
    if (route && long && route.length <= 3) return `${route} train (${long})`;
    return route || long || MODE_NAME[leg.mode] || leg.mode;
  }
  const agency = shortAgency(leg.agency);
  if (leg.mode === 'BUS' && agency && route && !route.toLowerCase().includes(agency.toLowerCase())) return `${agency} ${route}`;
  return route || long || MODE_NAME[leg.mode] || leg.mode;
}

export function LegChips({ legs }: { legs: SimpleLeg[] }) {
  return (
    <div className="chips">
      {legs.map((leg, i) => (
        <span key={i} className="row" style={{ gap: 4 }}>
          {i > 0 && (
            <span className="chip-sep" aria-hidden="true">
              ›
            </span>
          )}
          {leg.mode === 'WALK' ? (
            <span className="chip walk" title={`Walk ${leg.minutes} min`}>
              <Icon name="walk" size={12} strokeWidth={2.2} />
              {leg.minutes}
              <span className="sr-only"> minute walk</span>
            </span>
          ) : (
            <span
              className="chip"
              style={{ background: leg.color ?? '#334155', color: leg.textColor ?? '#ffffff' }}
              title={`${lineName(leg)}${leg.headsign ? ` toward ${leg.headsign}` : ''}`}
            >
              <Icon name={modeIcon(leg.mode)} size={12} strokeWidth={2.2} />
              {chipLabel(leg)}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return <button type="button" className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange(v: T): void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Banner({ kind, icon, children }: { kind: 'warn' | 'info' | 'plain'; icon: 'alert' | 'info' | 'map'; children: ReactNode }) {
  return (
    <div className={`banner ${kind}`} role={kind === 'warn' ? 'alert' : 'status'}>
      <Icon name={icon} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function metersToMiles(m: number): string {
  const mi = m / 1609.34;
  return mi < 0.1 ? 'under 0.1 mi' : `${mi.toFixed(1)} mi`;
}
