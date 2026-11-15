import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Avatar, Segmented } from '../../components/ui';
import { WALK_PACE_HINT, WALK_PACE_LABEL, WALK_SPEED } from '../../lib/geo';
import { send } from '../../lib/messages';
import type { DayType, GeocodeResult, Person, Place, TravelMode, WalkPace } from '../../lib/types';
import { browserTimeZone } from '../../lib/time';
import { newId } from '../../lib/util';

const WALK_LIMITS = [5, 8, 10, 12, 15, 20, 25];

const MODES: { value: TravelMode; label: string }[] = [
  { value: 'transit', label: 'Transit' },
  { value: 'drive', label: 'Drive' },
  { value: 'walk', label: 'Walk' },
];

const MODE_HINT: Record<TravelMode, string> = {
  transit: 'Bus, subway and train, with walking at each end.',
  drive: 'Driving times are without traffic.',
  walk: "At this person's walking pace.",
};
const PACES: WalkPace[] = ['slow', 'relaxed', 'brisk'];

const miles = (minutes: number, pace: WalkPace) => ((minutes * 60 * WALK_SPEED[pace]) / 1609.34).toFixed(1);

export function PersonFields({
  person,
  people = [],
  onChange,
  onRemove,
}: {
  person: Person;
  people?: Person[];
  onChange(p: Person): void;
  onRemove?: () => void;
}) {
  return (
    <div className="card card-pad stack">
      <div className="row">
        <Avatar person={person} people={people} size="lg" />
        <label style={{ flex: 1 }}>
          <span className="sr-only">Name</span>
          <input
            className="input"
            value={person.name}
            maxLength={24}
            placeholder="Name, like Mom"
            onChange={(e) => onChange({ ...person, name: e.target.value })}
          />
        </label>
        {onRemove && (
          <button type="button" className="btn icon-btn" aria-label={`Remove ${person.name || 'this person'}`} onClick={onRemove}>
            <Icon name="x" size={18} />
          </button>
        )}
      </div>
      <div>
        <span className="label">Walking pace</span>
        <Segmented
          label="Walking pace"
          value={person.walkPace}
          options={PACES.map((p) => ({ value: p, label: WALK_PACE_LABEL[p] }))}
          onChange={(walkPace) => onChange({ ...person, walkPace })}
        />
        <span className="hint">{WALK_PACE_HINT[person.walkPace]}</span>
      </div>
      <label>
        <span className="label">Longest walk to or from a stop</span>
        <select
          className="input"
          value={person.maxWalkMinutes}
          onChange={(e) => onChange({ ...person, maxWalkMinutes: Number(e.target.value) })}
        >
          {WALK_LIMITS.map((m) => (
            <option key={m} value={m}>
              {m} min (about {miles(m, person.walkPace)} mi)
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={person.stepFree} onChange={(e) => onChange({ ...person, stepFree: e.target.checked })} />
        Needs step-free routes (elevators, no stairs)
      </label>
    </div>
  );
}

interface PlaceFormProps {
  people: Person[];
  initial?: Place;
  personId: string;
  submitLabel: string;
  onSave(place: Place): void;
  onCancel?: () => void;
  onDelete?: () => void;
  /** Show the "who goes here" picker. Onboarding picks the person with chips instead. */
  pickPerson?: boolean;
  /** Bias address search toward here (the home being looked at, or an existing place). */
  near?: { lat: number; lon: number };
}

export function PlaceForm({ people, initial, personId, submitLabel, onSave, onCancel, onDelete, pickPerson, near }: PlaceFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [query, setQuery] = useState(initial?.address ?? '');
  const [picked, setPicked] = useState<GeocodeResult | null>(
    initial ? { label: initial.address, detail: '', lat: initial.lat, lon: initial.lon, source: 'census', tz: initial.tz } : null,
  );
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [arriveBy, setArriveBy] = useState(initial?.arriveBy ?? '09:00');
  const [day, setDay] = useState<DayType>(initial?.day ?? 'weekday');
  const [who, setWho] = useState(initial?.personId ?? personId);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<TravelMode>(initial?.mode ?? 'transit');
  // Typeahead: only after the person types, newest request wins, answers cached per text.
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(-1);
  const latest = useRef(0);
  const suggestions = useRef(new Map<string, GeocodeResult[]>());

  useEffect(() => {
    const q = query.trim();
    if (!typed || picked) return;
    if (q.length < 3) {
      setResults(null);
      return;
    }
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      let found = suggestions.current.get(q);
      if (!found) {
        found = await send({ type: 'suggest', text: q, near }).catch(() => []);
        suggestions.current.set(q, found);
      }
      if (id !== latest.current) return; // a newer keystroke already asked
      setResults(found.length ? found : null);
      setActive(-1);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, typed, picked]);

  const pick = (r: GeocodeResult) => {
    latest.current++; // drop any suggestion request still in flight
    setPicked(r);
    setQuery(r.label);
    setTyped(false);
    setResults(null);
    setActive(-1);
    setError('');
    if (!label.trim()) setLabel(r.label);
  };

  const search = async () => {
    latest.current++;
    setSearching(true);
    setError('');
    setResults(null);
    try {
      const found = await send({ type: 'geocode', text: query, near });
      setResults(found);
      if (!found.length) setError('Nothing found. Try a street address with the city and state, like "100 Main St, Austin, TX".');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    if (!picked) {
      setError('Search for the address and pick one of the matches.');
      return;
    }
    // Deadlines are local wall-clock times, so every place needs its time zone.
    // Router results come with one; Census matches need a lookup.
    setSaving(true);
    let tz = picked.tz;
    if (!tz) tz = (await send({ type: 'timezone', lat: picked.lat, lon: picked.lon }).catch(() => null)) ?? browserTimeZone();
    setSaving(false);
    onSave({
      id: initial?.id ?? newId(),
      personId: pickPerson ? who : personId,
      label: label.trim() || picked.label,
      address: [picked.label, picked.detail].filter(Boolean).join(', '),
      lat: picked.lat,
      lon: picked.lon,
      arriveBy,
      day,
      tz,
      mode,
      enabled: initial?.enabled ?? true,
    });
  };

  return (
    <form
      className="card card-pad stack"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label>
        <span className="label">Name</span>
        <input className="input" value={label} maxLength={30} placeholder="Work, Clinic, Church…" onChange={(e) => setLabel(e.target.value)} />
      </label>

      <label>
        <span className="label">Address or place</span>
        <span className="input-row">
          <input
            className="input"
            value={query}
            placeholder="Start typing an address or a place"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={!!results?.length}
            aria-controls="place-matches"
            aria-activedescendant={active >= 0 ? `place-match-${active}` : undefined}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
              setTyped(true);
            }}
            onKeyDown={(e) => {
              const n = results?.length ?? 0;
              if (e.key === 'ArrowDown' && n) {
                e.preventDefault();
                setActive((a) => (a + 1) % n);
              } else if (e.key === 'ArrowUp' && n) {
                e.preventDefault();
                setActive((a) => (a <= 0 ? n - 1 : a - 1));
              } else if (e.key === 'Escape' && n) {
                e.preventDefault();
                setResults(null);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (results && active >= 0) pick(results[active]);
                else void search();
              }
            }}
          />
          <button type="button" className="btn" disabled={searching || query.trim().length < 3} onClick={() => void search()}>
            {searching ? 'Finding…' : 'Find'}
          </button>
        </span>
      </label>

      {picked && !results && (
        <div className="picked">
          <Icon name="check" size={14} strokeWidth={2.6} />
          <span className="truncate">{[picked.label, picked.detail].filter(Boolean).join(', ')}</span>
        </div>
      )}
      {results && results.length > 0 && (
        <div className="results" role="listbox" id="place-matches" aria-label="Matches">
          {results.map((r, i) => (
            <button
              key={i}
              id={`place-match-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              data-active={i === active}
              // Keep focus in the text box so arrow keys keep working after a hover.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
            >
              <b>{r.label}</b>
              <span className="hint">{r.detail}</span>
            </button>
          ))}
        </div>
      )}

      <div>
        <span className="label">Getting there</span>
        <Segmented<TravelMode> label="Getting there" value={mode} options={MODES} onChange={setMode} />
        <span className="hint">{MODE_HINT[mode]}</span>
      </div>

      <div className="grid-2">
        <label>
          <span className="label">Arrive by</span>
          <input className="input" type="time" required value={arriveBy} onChange={(e) => setArriveBy(e.target.value)} />
        </label>
        <label>
          <span className="label">On</span>
          <select className="input" value={day} onChange={(e) => setDay(e.target.value as DayType)}>
            <option value="weekday">Weekdays</option>
            <option value="saturday">Saturdays</option>
            <option value="sunday">Sundays</option>
          </select>
        </label>
      </div>

      {pickPerson && people.length > 1 && (
        <label>
          <span className="label">Who goes here</span>
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <p className="hint" role="alert" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={!picked || saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <span className="spacer" />
        {onDelete && (
          <button type="button" className="btn btn-danger" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
