import { useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { Switch } from '../../components/ui';
import { ISSUES_URL, PRIVACY_URL, REPO_URL } from '../../lib/app';
import { BAND_FILLS } from '../../lib/map-types';
import { send, type Usage } from '../../lib/messages';
import { exportData, importData, resetAll, saveSettings, TRANSITOUS_URL } from '../../lib/storage';
import type { Person, Place, Settings } from '../../lib/types';

const BAND_NAMES = ['Short', 'Medium', 'Long'];

export function SettingsView({ settings: s, usage, places, people }: { settings: Settings; usage: Usage | null; places: Place[]; people: Person[] }) {
  const [router, setRouter] = useState(s.routerUrl);
  const [bands, setBands] = useState(s.bands.map(String));
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const flash = (text: string, error = false) => {
    setNote({ text, error });
    setTimeout(() => setNote(null), 3000);
  };

  const saveBand = (i: number, value: string) => {
    const next = [...bands];
    next[i] = value;
    setBands(next);
    const nums = next.map(Number) as Settings['bands'];
    if (nums.every((n) => n >= 5 && n <= 90) && nums[0] < nums[1] && nums[1] < nums[2]) void saveSettings({ bands: nums });
  };

  const doExport = async () => {
    const data = await exportData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `railtymaps-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (file: File) => {
    try {
      await importData(JSON.parse(await file.text()));
      flash('Imported.');
    } catch (e) {
      flash(e instanceof SyntaxError ? "That file isn't valid JSON." : (e as Error).message, true);
    }
  };

  const doReset = async () => {
    if (!confirm('Delete all people, places, saved homes and cached routes? This cannot be undone.')) return;
    await resetAll();
  };

  const isTransitous = s.routerUrl === TRANSITOUS_URL;
  const shadable = places.filter((p) => p.enabled && p.mode !== 'drive');
  const pct = usage ? Math.min(100, (usage.count / usage.limit) * 100) : 0;

  return (
    <>
      <section className="section">
        <h2 className="eyebrow">Map</h2>
        <div className="settings-group">
          <div className="settings-item">
            <div className="main">
              Transit lines
              <div className="hint">Metro, rail and bus lines on the listing map</div>
            </div>
            <Switch label="Transit lines" checked={s.showTransitLines} onChange={(v) => void saveSettings({ showTransitLines: v })} />
          </div>
          <div className="settings-item">
            <div className="main">Pins for your places</div>
            <Switch label="Pins for your places" checked={s.showPins} onChange={(v) => void saveSettings({ showPins: v })} />
          </div>
          <div className="settings-item col">
            <div className="row">
              <div className="main">
                Reach shading
                <div className="hint">Shade where you can live and still get to a place in time</div>
              </div>
              <Switch
                label="Reach shading"
                checked={s.showShading && !!shadable.length}
                onChange={(v) => void saveSettings({ showShading: v, shadePlaceId: s.shadePlaceId ?? shadable[0]?.id ?? null })}
              />
            </div>
            {s.showShading && shadable.length > 1 && (
              <label>
                <span className="sr-only">Place to shade</span>
                <select className="input" value={s.shadePlaceId ?? ''} onChange={(e) => void saveSettings({ shadePlaceId: e.target.value })}>
                  {shadable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {people.find((x) => x.id === p.personId)?.name ?? ''} · {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="settings-item col">
            <div>
              Time bands
              <div className="hint">Colors on badges, the saved table and the map shading</div>
            </div>
            <div className="grid-3">
              {BAND_NAMES.map((name, i) => (
                <label key={name}>
                  <span className="label row" style={{ gap: 6 }}>
                    <span className="swatch" style={{ background: BAND_FILLS[i] }} />
                    {name}
                  </span>
                  <input
                    className="input"
                    type="number"
                    min={5}
                    max={90}
                    step={5}
                    value={bands[i]}
                    aria-label={`${name} band, minutes`}
                    onChange={(e) => saveBand(i, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="eyebrow">Trip planning</h2>
        <div className="settings-group">
          {isTransitous && usage && (
            <div className="settings-item col">
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                <span>Trip searches, last 24 hours</span>
                <b>
                  {usage.count} of {usage.limit}
                </b>
              </div>
              <div className={`meter ${usage.count >= usage.limit ? 'full' : ''}`}>
                <div style={{ width: `${pct}%` }} />
              </div>
              <p className="hint">
                Transitous is a free, volunteer-run service. RailtyMaps caches results for a week and pauses itself at {usage.limit}{' '}
                searches a day.
              </p>
            </div>
          )}
          <div className="settings-item col">
            <label htmlFor="router" style={{ fontSize: 13 }}>
              Routing server
            </label>
            <div className="input-row">
              <input id="router" className="input" value={router} placeholder={TRANSITOUS_URL} onChange={(e) => setRouter(e.target.value)} />
              <button
                type="button"
                className="btn"
                disabled={router.trim().replace(/\/+$/, '') === s.routerUrl}
                onClick={() => void saveSettings({ routerUrl: router.trim().replace(/\/+$/, '') || TRANSITOUS_URL })}
              >
                Save
              </button>
            </div>
            <p className="hint">Any MOTIS 2 server works, including one you run yourself.</p>
          </div>
          <div className="settings-item">
            <div className="main">
              Saved routes
              <div className="hint">Clear to fetch fresh schedules now</div>
            </div>
            <button type="button" className="btn" onClick={() => void send({ type: 'clearCache' }).then(() => flash('Cleared saved routes.'))}>
              Clear
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="eyebrow">Your data</h2>
        <div className="settings-group">
          <div className="settings-item">
            <div className="main">
              Export
              <div className="hint">People, places and saved homes as one file</div>
            </div>
            <button type="button" className="btn" onClick={() => void doExport()}>
              Export
            </button>
          </div>
          <div className="settings-item">
            <div className="main">
              Import
              <div className="hint">Replace everything with an exported file</div>
            </div>
            <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
              Import
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void doImport(f);
                e.target.value = '';
              }}
            />
          </div>
          <div className="settings-item">
            <div className="main">
              Reset
              <div className="hint">Delete everything RailtyMaps has stored</div>
            </div>
            <button type="button" className="btn btn-danger" onClick={() => void doReset()}>
              Reset
            </button>
          </div>
        </div>
        {note && (
          <p className="hint" role="status" style={note.error ? { color: 'var(--danger)' } : undefined}>
            {note.text}
          </p>
        )}
      </section>

      <section className="section">
        <h2 className="eyebrow">About</h2>
        <div className="settings-group">
          <div className="settings-item">
            <span className="main">Version</span>
            <span className="hint">{browser.runtime.getManifest().version}</span>
          </div>
          <a className="settings-item" href={REPO_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--text)', textDecoration: 'none' }}>
            <span className="main">Source code</span>
            <span className="hint">GitHub</span>
          </a>
          <a className="settings-item" href={ISSUES_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--text)', textDecoration: 'none' }}>
            <span className="main">Report a problem</span>
            <span className="hint">GitHub issues</span>
          </a>
          <a className="settings-item" href={PRIVACY_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--text)', textDecoration: 'none' }}>
            <span className="main">Privacy</span>
            <span className="hint">What leaves your browser</span>
          </a>
          <div className="settings-item fine">
            <span>
              Trips by{' '}
              <a href="https://transitous.org" target="_blank" rel="noreferrer">
                Transitous
              </a>{' '}
              using{' '}
              <a href="https://transitous.org/sources/" target="_blank" rel="noreferrer">
                each agency's schedules
              </a>
              . Map data ©{' '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                OpenStreetMap
              </a>{' '}
              contributors. Not affiliated with Zillow or Redfin.
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
