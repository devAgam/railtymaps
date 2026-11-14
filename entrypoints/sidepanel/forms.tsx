import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Avatar, Segmented } from '../../components/ui';
import { WALK_PACE_HINT, WALK_PACE_LABEL, WALK_SPEED } from '../../lib/geo';
import { send } from '../../lib/messages';
import type { DayType, GeocodeResult, Person, Place, WalkPace } from '../../lib/types';
import { newId } from '../../lib/util';

const WALK_LIMITS = [5, 8, 10, 12, 15, 20, 25];
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
}

export function PlaceForm({ people, initial, personId, submitLabel, onSave, onCancel, onDelete, pickPerson }: PlaceFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [query, setQuery] = useState(initial?.address ?? '');
  const [picked, setPicked] = useState<GeocodeResult | null>(
    initial ? { label: initial.address, detail: '', lat: initial.lat, lon: initial.lon, source: 'census' } : null,
  );
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [arriveBy, setArriveBy] = useState(initial?.arriveBy ?? '09:00');
  const [day, setDay] = useState<DayType>(initial?.day ?? 'weekday');
  const [who, setWho] = useState(initial?.personId ?? personId);

  const search = async () => {
    setSearching(true);
    setError('');
    setResults(null);
    try {
      const found = await send({ type: 'geocode', text: query });
      setResults(found);
      if (!found.length) setError('Nothing found in the DC area. Try adding the city, like "Bethesda, MD", or a street address.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const submit = () => {
    if (!picked) {
      setError('Search for the address and pick one of the matches.');
      return;
    }
    onSave({
      id: initial?.id ?? newId(),
      personId: pickPerson ? who : personId,
      label: label.trim() || picked.label,
      address: [picked.label, picked.detail].filter(Boolean).join(', '),
      lat: picked.lat,
      lon: picked.lon,
      arriveBy,
      day,
      enabled: initial?.enabled ?? true,
    });
  };

  return (
    <form
      className="card card-pad stack"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
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
            placeholder="1 Medical Center Dr, Bethesda MD"
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search();
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
        <div className="results" role="listbox" aria-label="Matches">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={picked === r}
              onClick={() => {
                setPicked(r);
                setQuery(r.label);
                setResults(null);
                if (!label.trim()) setLabel(r.label);
              }}
            >
              <b>{r.label}</b>
              <span className="hint">{r.detail}</span>
            </button>
          ))}
        </div>
      )}

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
        <button type="submit" className="btn btn-primary" disabled={!picked}>
          {submitLabel}
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
