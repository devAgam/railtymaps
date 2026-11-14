import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { Icon } from '../../components/Icon';
import { Avatar, Banner, LegChips, lineName, metersToMiles, Minutes } from '../../components/ui';
import { send, type TabMessage } from '../../lib/messages';
import { listingKey, toggleSaved, walkingFor } from '../../lib/storage';
import { DAY_LABEL, DMV_TZ, formatClock, formatHhmm } from '../../lib/time';
import type { Listing, Person, Place, PlanResult, Settings, SimpleItinerary } from '../../lib/types';

type PlanState = { status: 'loading' } | { status: 'done'; plan: PlanResult } | { status: 'error'; message: string };

interface Props {
  listing: Listing | null;
  people: Person[];
  places: Place[];
  settings: Settings;
  saved: boolean;
  tabId: number | null;
  onGoPeople(): void;
}

const SITE_NAME = { zillow: 'Zillow', redfin: 'Redfin' } as const;

export function ThisHome({ listing, people, places, settings, saved, tabId, onGoPeople }: Props) {
  const visible = places.filter((p) => p.enabled);
  const [plans, setPlans] = useState<Record<string, PlanState>>({});
  const [onMap, setOnMap] = useState<string | null>(null); // `${placeId}:${index}`
  const [retry, setRetry] = useState(0);

  // Re-plan when the home, a place, or someone's walking changes.
  const inputs = JSON.stringify([
    listing && listingKey(listing),
    listing?.lat,
    listing?.lon,
    visible.map((p) => [p.id, p.lat, p.lon, p.arriveBy, p.day, walkingFor(p, people)]),
    settings.routerUrl,
    retry,
  ]);

  useEffect(() => {
    if (!listing) return;
    let alive = true;
    setOnMap(null);
    setPlans(Object.fromEntries(visible.map((p) => [p.id, { status: 'loading' }])));
    for (const place of visible) {
      send({ type: 'plan', home: { id: listing.id, lat: listing.lat, lon: listing.lon }, placeId: place.id })
        .then((plan) => {
          if (!alive) return;
          setPlans((prev) => ({
            ...prev,
            [place.id]: plan ? { status: 'done', plan } : { status: 'error', message: 'No answer from the routing server.' },
          }));
        })
        .catch((e: Error) => alive && setPlans((prev) => ({ ...prev, [place.id]: { status: 'error', message: e.message } })));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs]);

  if (!listing) {
    return (
      <div className="empty">
        <Icon name="home" size={40} strokeWidth={1.6} />
        <h2>Open a listing to see routes</h2>
        <p>Click any transit badge on Zillow or Redfin, or open a home's own page. Routes for everyone show up here.</p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => void browser.tabs.create({ url: 'https://www.zillow.com/washington-dc/' })}>
            Zillow
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void browser.tabs.create({ url: 'https://www.redfin.com/city/12839/DC/Washington-DC' })}>
            Redfin
          </button>
        </div>
      </div>
    );
  }

  const showOnMap = (it: SimpleItinerary, key: string) => {
    if (tabId == null) return;
    const msg: TabMessage = onMap === key ? { type: 'clearRoute' } : { type: 'showRoute', itinerary: it };
    browser.tabs.sendMessage(tabId, msg).then(
      () => setOnMap(onMap === key ? null : key),
      () => setOnMap(null), // the tab isn't a listing site anymore
    );
  };

  const [street, ...rest] = listing.address.split(',');
  const facts = [
    listing.price ? `$${listing.price.toLocaleString()}` : null,
    listing.beds != null ? `${listing.beds} bd` : null,
    listing.baths != null ? `${listing.baths} ba` : null,
  ].filter(Boolean);
  const dates = [...new Set(Object.values(plans).flatMap((s) => (s.status === 'done' ? [s.plan.deadlineIso] : [])))];

  return (
    <>
      <div className="card card-pad surface stack" style={{ gap: 10 }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="spacer" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>{street}</div>
            {rest.length > 0 && <div className="hint">{rest.join(',').trim()}</div>}
            {facts.length > 0 && <div style={{ fontSize: 13, marginTop: 4 }}>{facts.join(' · ')}</div>}
          </div>
          <span className="chip-site">{SITE_NAME[listing.site]}</span>
        </div>
        <div className="row">
          <button type="button" className={`btn ${saved ? 'btn-saved' : ''}`} aria-pressed={saved} onClick={() => void toggleSaved(listing)}>
            <Icon name="star" size={16} />
            {saved ? 'Saved' : 'Save'}
          </button>
          {listing.url && (
            <a className="btn" href={listing.url} target="_blank" rel="noreferrer">
              Open listing
              <Icon name="external" size={14} />
            </a>
          )}
        </div>
      </div>

      {!visible.length ? (
        <div className="empty" style={{ padding: '16px 8px' }}>
          <p>Add the places your household goes to see routes from this home.</p>
          <button type="button" className="btn btn-primary" onClick={onGoPeople}>
            Add places
          </button>
        </div>
      ) : (
        <>
          <section className="section" aria-labelledby="glance">
            <h2 id="glance" className="section-title">
              At a glance
            </h2>
            <div className="list">
              {visible.map((place) => {
                const person = people.find((p) => p.id === place.personId);
                const state = plans[place.id];
                const best = state?.status === 'done' ? state.plan.itineraries[0] : undefined;
                return (
                  <div key={place.id} className="list-row">
                    <Avatar person={person} people={people} />
                    <div className="main">
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{place.label}</div>
                      <div className="hint truncate">
                        {person?.name ?? 'Someone'} · by {formatHhmm(place.arriveBy)} {DAY_LABEL[place.day]}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {state?.status === 'loading' || !state ? (
                        <span className="skeleton" style={{ display: 'inline-block', width: 54, height: 20, borderRadius: 999 }} />
                      ) : state.status === 'error' ? (
                        <Minutes minutes={null} error={state.message} bands={settings.bands} />
                      ) : (
                        <>
                          <Minutes minutes={best ? best.leadMinutes : null} bands={settings.bands} />
                          {best && <div className="hint">leave {formatClock(best.departIso).replace(/ [AP]M$/, '')}</div>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {visible.map((place) => (
            <PlaceRoutes
              key={place.id}
              place={place}
              person={people.find((p) => p.id === place.personId)}
              people={people}
              state={plans[place.id]}
              bands={settings.bands}
              onMapKey={onMap}
              onShow={showOnMap}
              onRetry={() => setRetry((n) => n + 1)}
            />
          ))}

          {dates.length > 0 && (
            <p className="fine" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              Schedules for{' '}
              {[...new Set(dates.sort().map((d) => new Date(d).toLocaleDateString('en-US', { timeZone: DMV_TZ, weekday: 'short', month: 'short', day: 'numeric' })))].join(' and ')}
              . Each person walks at their own pace. Published timetables, not live delays.
            </p>
          )}
        </>
      )}
    </>
  );
}

function PlaceRoutes({
  place,
  person,
  people,
  state,
  bands,
  onMapKey,
  onShow,
  onRetry,
}: {
  place: Place;
  person?: Person;
  people: Person[];
  state?: PlanState;
  bands: readonly number[];
  onMapKey: string | null;
  onShow(it: SimpleItinerary, key: string): void;
  onRetry(): void;
}) {
  const [showAll, setShowAll] = useState(false);
  const options = state?.status === 'done' ? state.plan.itineraries : [];

  return (
    <section className="section" aria-label={`Routes to ${place.label}`}>
      <h2 className="section-title">
        <Avatar person={person} people={people} />
        {place.label}
        <span className="hint">
          by {formatHhmm(place.arriveBy)} {DAY_LABEL[place.day]}
        </span>
      </h2>

      {(!state || state.status === 'loading') && (
        <div className="option" aria-busy="true">
          <span className="skeleton" style={{ width: '55%', height: 14 }} />
          <span className="skeleton" style={{ width: '85%', height: 20 }} />
          <span className="skeleton" style={{ width: '40%', height: 12 }} />
        </div>
      )}

      {state?.status === 'error' && (
        <Banner kind="warn" icon="alert">
          {state.message}{' '}
          <button type="button" className="btn btn-ghost" style={{ padding: '0 4px', minHeight: 0 }} onClick={onRetry}>
            Try again
          </button>
        </Banner>
      )}

      {state?.status === 'done' && options.length === 0 && (
        <Banner kind="plain" icon="map">
          <b>No transit gets {person?.name ?? 'them'} there in time.</b> Nothing reaches {place.label} by {formatHhmm(place.arriveBy)} within a{' '}
          {person?.maxWalkMinutes ?? 15}-minute walk. A longer walking limit under People may help.
        </Banner>
      )}

      {options.slice(0, showAll ? options.length : 2).map((it, i) => (
        <RouteOption
          key={it.signature + it.departIso}
          it={it}
          best={i === 0}
          placeLabel={place.label}
          person={person}
          bands={bands}
          onMap={onMapKey === `${place.id}:${i}`}
          onShow={() => onShow(it, `${place.id}:${i}`)}
        />
      ))}
      {options.length > 2 && !showAll && (
        <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll(true)}>
          {options.length - 2} more option{options.length - 2 > 1 ? 's' : ''}
        </button>
      )}
    </section>
  );
}

function RouteOption({
  it,
  best,
  placeLabel,
  person,
  bands,
  onMap,
  onShow,
}: {
  it: SimpleItinerary;
  best: boolean;
  placeLabel: string;
  person?: Person;
  bands: readonly number[];
  onMap: boolean;
  onShow(): void;
}) {
  const [open, setOpen] = useState(false);
  const rides = it.legs.filter((l) => l.mode !== 'WALK');
  const next = it.alsoDepartsIso.filter((t) => t > it.departIso);
  const earlier = it.alsoDepartsIso.filter((t) => t < it.departIso);
  const facts = [
    rides.length === 0 ? 'Walk the whole way' : it.transfers === 0 ? 'No transfers' : `${it.transfers} transfer${it.transfers > 1 ? 's' : ''}`,
    `${it.walkMinutes} min walking (${metersToMiles(it.walkMeters)})`,
  ];
  if (earlier.length) facts.push(`earlier: ${earlier.slice(-2).map((t) => formatClock(t)).join(', ')}`);
  if (next.length) facts.push(`next leaves ${formatClock(next[0])}`);
  const tooFar = person && it.longestWalkMinutes > person.maxWalkMinutes;

  return (
    <div className={`option ${best ? 'best' : ''}`}>
      <div className="option-top">
        <Minutes minutes={it.leadMinutes} bands={bands} />
        <span>
          Leave <b>{formatClock(it.departIso)}</b> · arrive {formatClock(it.arriveIso)}
        </span>
      </div>
      <LegChips legs={it.legs} />
      <div className="facts">{facts.join(' · ')}</div>
      {tooFar && (
        <div className="warn-note">
          One walk is {it.longestWalkMinutes} min, longer than {person.name}'s {person.maxWalkMinutes}-minute limit.
        </div>
      )}
      {open && (
        <ol className="steps" aria-label="Step by step">
          {it.legs.map((leg, i) => (
            <li key={i} className="step" style={{ listStyle: 'none' }}>
              <span className="step-time">{formatClock(leg.startIso)}</span>
              <span className="step-dot" style={leg.mode === 'WALK' ? undefined : { background: leg.color ?? 'var(--text)' }} />
              <span>
                {leg.mode === 'WALK' ? (
                  <>
                    Walk {leg.minutes} min{leg.meters ? ` (${metersToMiles(leg.meters)})` : ''} to{' '}
                    <b>{leg.to === 'Destination' ? placeLabel : leg.to}</b>
                  </>
                ) : (
                  <>
                    <b>{lineName(leg)}</b>
                    {leg.headsign ? ` toward ${leg.headsign}` : ''}
                    <br />
                    <span className="hint">
                      {leg.stops ? `${leg.stops} stop${leg.stops > 1 ? 's' : ''} · ` : ''}off at {leg.to} at {formatClock(leg.endIso)}
                    </span>
                  </>
                )}
              </span>
            </li>
          ))}
          <li className="step" style={{ listStyle: 'none' }}>
            <span className="step-time">{formatClock(it.arriveIso)}</span>
            <span className="step-dot" style={{ background: 'var(--text)' }} />
            <span>
              Arrive at <b>{placeLabel}</b>
            </span>
          </li>
        </ol>
      )}
      <div className="row">
        <button type="button" className={`btn ${onMap ? 'btn-on' : ''}`} aria-pressed={onMap} onClick={onShow}>
          <Icon name="map" size={14} />
          {onMap ? 'On the map' : 'Show on map'}
        </button>
        <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide steps' : 'Steps'}
        </button>
      </div>
    </div>
  );
}
