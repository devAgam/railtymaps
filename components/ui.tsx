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
}: {
  minutes: number | null | undefined;
  bands: readonly number[];
  exact?: boolean;
  compact?: boolean;
  error?: string;
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
  return (
    <span className={`${cls} b${Math.min(bandIndex(minutes, bands), 3)}`}>
      {exact ? '' : '~'}
      {minutes}
      {compact ? '' : ' min'}
    </span>
  );
}

export function EstimateMinutes({ e, bands, compact }: { e?: Estimate; bands: readonly number[]; compact?: boolean }) {
  return <Minutes minutes={e ? e.minutes : undefined} exact={e?.exact === true} error={e?.error} bands={bands} compact={compact} />;
}

// Everyday names for DMV operators, matched against the feed's agency name.
const AGENCY_SHORT: [RegExp, string][] = [
  [/ride ?on/i, 'Ride On'],
  [/^wmata$|washington metropolitan/i, 'Metrobus'],
  [/fairfax connector/i, 'Fairfax Connector'],
  [/\bcue\b/i, 'CUE'],
  [/arlington/i, 'ART'],
  [/\bdash\b|alexandria transit/i, 'DASH'],
  [/thebus|prince george/i, 'TheBus'],
  [/loudoun/i, 'Loudoun Transit'],
  [/omniride|prtc|potomac and rappahannock/i, 'OmniRide'],
  [/maryland transit|\bmta\b/i, 'MTA'],
];

export function shortAgency(agency: string | undefined): string | undefined {
  if (!agency) return undefined;
  return AGENCY_SHORT.find(([re]) => re.test(agency))?.[1] ?? agency;
}

const MODE_NAME: Record<string, string> = {
  SUBWAY: 'Metro',
  METRO: 'Metro',
  BUS: 'Bus',
  TRAM: 'Light rail',
  REGIONAL_RAIL: 'Train',
  REGIONAL_FAST_RAIL: 'Train',
  SUBURBAN: 'Train',
  FERRY: 'Ferry',
};

const isMetroRail = (leg: SimpleLeg) => (leg.mode === 'SUBWAY' || leg.mode === 'METRO') && !!leg.routeLong;

/** Chip text: "Red" for Metro lines (the feed's short name is a bare "R"), the route number for buses. */
export function chipLabel(leg: SimpleLeg): string {
  if (isMetroRail(leg) && (leg.route ?? '').length <= 2) return leg.routeLong!;
  const agency = shortAgency(leg.agency);
  if (leg.mode === 'BUS' && agency && leg.route && agency !== 'Metrobus') return `${agency} ${leg.route}`;
  return leg.route ?? MODE_NAME[leg.mode] ?? '';
}

/** Full line name for sentences: "Red Line", "Ride On 14", "Metrobus 70". */
export function lineName(leg: SimpleLeg): string {
  const route = leg.route ?? '';
  if (isMetroRail(leg)) return `${leg.routeLong!.replace(/\s+line$/i, '')} Line`;
  const agency = shortAgency(leg.agency);
  if (leg.mode === 'BUS' && agency && route && !route.toLowerCase().includes(agency.toLowerCase())) return `${agency} ${route}`;
  return route || leg.routeLong || MODE_NAME[leg.mode] || leg.mode;
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
