import { useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { Icon } from '../../components/Icon';
import { Avatar, EstimateMinutes, Segmented } from '../../components/ui';
import { send, type Usage } from '../../lib/messages';
import { currentListingKey, listingKey, saveSaved } from '../../lib/storage';
import type { Estimate, Person, Place, SavedHome, Settings } from '../../lib/types';
import { shortAddress } from '../../lib/util';
import { usePlanCacheVersion } from './hooks';

type Sort = 'average' | 'worst' | 'price';

interface Props {
  saved: SavedHome[];
  people: Person[];
  places: Place[];
  settings: Settings;
  usage: Usage | null;
  tabId: number | null;
  onOpenHome(): void;
}

// Out-of-range trips count as two hours when ranking, so one impossible commute
// sinks a home instead of being ignored.
const UNREACHABLE = 120;

export function Saved({ saved, people, places, settings, usage, tabId, onOpenHome }: Props) {
  const visible = places.filter((p) => p.enabled);
  const [estimates, setEstimates] = useState<Record<string, Estimate[]>>({});
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('average');
  const [copied, setCopied] = useState(false);
  const planVersion = usePlanCacheVersion();

  const inputs = JSON.stringify([saved.map(listingKey), visible.map((p) => [p.id, p.lat, p.lon, p.arriveBy, p.day, p.personId]), people, settings.routerUrl]);

  useEffect(() => {
    if (!saved.length || !visible.length) return;
    let alive = true;
    send({ type: 'estimate', homes: saved.map((h) => ({ id: h.id, lat: h.lat, lon: h.lon })) })
      .then((r) => {
        if (!alive) return;
        setEstimates(r.results);
        setError(Object.values(r.errors)[0] ?? '');
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, planVersion]);

  const rows = useMemo(() => {
    const scored = saved.map((home) => {
      const est = estimates[home.id];
      const mins = visible.map((p) => est?.find((e) => e.placeId === p.id)?.minutes ?? UNREACHABLE);
      return {
        home,
        est,
        average: est ? mins.reduce((a, b) => a + b, 0) / Math.max(1, mins.length) : Infinity,
        worst: est ? Math.max(...mins) : Infinity,
      };
    });
    const by: Record<Sort, (a: (typeof scored)[0], b: (typeof scored)[0]) => number> = {
      average: (a, b) => a.average - b.average,
      worst: (a, b) => a.worst - b.worst || a.average - b.average,
      price: (a, b) => (a.home.price ?? Infinity) - (b.home.price ?? Infinity),
    };
    return scored.sort(by[sort]);
  }, [saved, estimates, visible, sort]);

  if (!saved.length) {
    return (
      <div className="empty">
        <Icon name="star" size={40} strokeWidth={1.6} />
        <h2>No saved homes yet</h2>
        <p>Tap the star next to a listing's transit times, or Save on This home, to compare homes side by side here.</p>
      </div>
    );
  }

  const inexact = rows.flatMap(({ home, est }) =>
    visible.filter((p) => !est?.find((e) => e.placeId === p.id)?.exact).map((place) => ({ home, place })),
  );
  const remaining = usage ? Math.max(0, usage.limit - usage.count) : null;
  const anyLongWalk = rows.some(({ est }) => est?.some((e) => e.longWalk));

  const getExact = async () => {
    setError('');
    try {
      for (let i = 0; i < inexact.length; i++) {
        setProgress(`${i + 1} of ${inexact.length}`);
        const { home, place } = inexact[i];
        await send({ type: 'plan', home: { id: home.id, lat: home.lat, lon: home.lon }, placeId: place.id });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const copySummary = async () => {
    const how = { transit: '', drive: ' (car)', walk: ' (on foot)' } as const;
    const header = ['Home', 'Price', ...visible.map((p) => `${people.find((x) => x.id === p.personId)?.name ?? ''} ${p.label}${how[p.mode]}`.trim())];
    const lines = rows.map(({ home, est }) => [
      shortAddress(home.address),
      home.price ? `$${Math.round(home.price / 1000)}k` : '',
      ...visible.map((p) => {
        const e = est?.find((x) => x.placeId === p.id);
        if (!e || e.error) return '?';
        if (e.minutes == null) return '90+ min';
        return `${e.exact ? '' : '~'}${e.minutes} min${e.longWalk ? ` (${e.longWalk} min walk)` : ''}`;
      }),
    ]);
    const text = [header, ...lines].map((cols) => cols.join('\t')).join('\n');
    await navigator.clipboard.writeText(`${text}\n\nMinutes to leave before each deadline, by transit unless marked. From RailtyMaps.`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const remove = (home: SavedHome) => void saveSaved(saved.filter((h) => listingKey(h) !== listingKey(home)));

  const show = async (home: SavedHome) => {
    if (tabId == null) return;
    await browser.storage.session.set({ [currentListingKey(tabId)]: home });
    onOpenHome();
  };

  return (
    <>
      <div className="row">
        <span className="hint" style={{ fontWeight: 600 }}>
          Sort by
        </span>
        <div className="spacer">
          <Segmented<Sort>
            label="Sort saved homes"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'average', label: 'Average' },
              { value: 'worst', label: 'Worst trip' },
              { value: 'price', label: 'Price' },
            ]}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="hint">Add places under People to compare these homes.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="compare">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', width: '38%' }}>Home</th>
                {visible.map((p) => (
                  <th key={p.id} title={p.label}>
                    <Avatar person={people.find((x) => x.id === p.personId)} people={people} size="sm" />
                    <span className="th-label">{p.label}</span>
                  </th>
                ))}
                <th style={{ width: 32 }}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ home, est }, i) => (
                <tr key={listingKey(home)}>
                  <td className="home">
                    <button type="button" className="home-name" onClick={() => void show(home)} title="Show routes for this home">
                      {shortAddress(home.address)}
                    </button>
                    <div className="hint truncate">
                      {[home.address.split(',')[1]?.trim(), home.price ? `$${Math.round(home.price / 1000)}k` : null].filter(Boolean).join(' · ')}
                    </div>
                    {i === 0 && sort === 'average' && rows.length > 1 && est && <span className="tag-best">Best overall</span>}
                  </td>
                  {visible.map((p) => (
                    <td key={p.id}>
                      <EstimateMinutes e={est?.find((e) => e.placeId === p.id)} bands={settings.bands} compact />
                    </td>
                  ))}
                  <td>
                    <RowMenu home={home} onShow={() => void show(home)} onRemove={() => remove(home)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <p className="hint" role="alert" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {inexact.length > 0 && visible.length > 0 && (
        <div className="card card-pad surface stack" style={{ gap: 10 }}>
          <p style={{ fontSize: 13 }}>
            {inexact.length === 1 ? 'One time is' : `${inexact.length} times are`} still a quick estimate (marked ~). Exact times use{' '}
            <b>
              {inexact.length} trip search{inexact.length > 1 ? 'es' : ''}
            </b>
            {remaining != null ? ` of today's remaining ${remaining}` : ''}.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={progress != null || (remaining != null && remaining < inexact.length)}
            onClick={() => void getExact()}
          >
            {progress ? `Planning trips… ${progress}` : 'Get exact times'}
          </button>
        </div>
      )}

      {visible.length > 0 && (
        <button type="button" className="btn" onClick={() => void copySummary()}>
          <Icon name={copied ? 'check' : 'copy'} size={15} />
          {copied ? 'Copied' : 'Copy summary'}
        </button>
      )}

      <p className="fine">
        Minutes before each deadline the person has to leave home. "~" is a quick estimate, usually within a couple of minutes of the
        full plan.
        {anyLongWalk && (
          <>
            {' '}
            A dashed outline with <Icon name="alert" size={11} /> means the trip only works with a longer walk than that person's limit.
          </>
        )}
      </p>
    </>
  );
}

function RowMenu({ home, onShow, onRemove }: { home: SavedHome; onShow(): void; onRemove(): void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className="btn icon-btn"
        style={{ width: 28 }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More for ${shortAddress(home.address)}`}
        onClick={() => setOpen(!open)}
      >
        <Icon name="more" size={16} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <button type="button" role="menuitem" onClick={() => (setOpen(false), onShow())}>
            Show routes
          </button>
          {home.url && (
            <a role="menuitem" href={home.url} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
              Open listing
            </a>
          )}
          <button type="button" role="menuitem" className="danger" onClick={() => (setOpen(false), onRemove())}>
            Remove from saved
          </button>
        </div>
      )}
    </div>
  );
}
