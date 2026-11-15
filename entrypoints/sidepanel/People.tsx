import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Avatar } from '../../components/ui';
import { WALK_PACE_LABEL } from '../../lib/geo';
import { newPerson, savePeople, savePlaces, saveSettings } from '../../lib/storage';
import { DAY_LABEL, formatHhmm } from '../../lib/time';
import type { Person, Place, Settings } from '../../lib/types';
import { PersonFields, PlaceForm } from './forms';

/** Where to bias address search: the place itself, this person's other places, then anyone's. */
function nearFor(place: Place | undefined, personId: string, places: Place[]) {
  const ref = place ?? places.find((p) => p.personId === personId) ?? places[0];
  return ref ? { lat: ref.lat, lon: ref.lon } : undefined;
}

const MODE_LABEL = { transit: 'Transit', drive: 'Drive', walk: 'Walk' } as const;

type Editing = { kind: 'person'; person: Person; isNew: boolean } | { kind: 'place'; place?: Place; personId: string } | null;

export function People({ people, places, settings }: { people: Person[]; places: Place[]; settings: Settings }) {
  const [editing, setEditing] = useState<Editing>(null);

  if (editing?.kind === 'person') {
    return (
      <PersonEditor
        person={editing.person}
        people={people}
        isNew={editing.isNew}
        placeCount={places.filter((p) => p.personId === editing.person.id).length}
        onCancel={() => setEditing(null)}
        onSave={async (person) => {
          await savePeople(editing.isNew ? [...people, person] : people.map((p) => (p.id === person.id ? person : p)));
          setEditing(null);
        }}
        onDelete={async () => {
          const theirs = new Set(places.filter((p) => p.personId === editing.person.id).map((p) => p.id));
          await savePlaces(places.filter((p) => !theirs.has(p.id)));
          await savePeople(people.filter((p) => p.id !== editing.person.id));
          if (settings.shadePlaceId && theirs.has(settings.shadePlaceId)) await saveSettings({ shadePlaceId: null });
          setEditing(null);
        }}
      />
    );
  }

  if (editing?.kind === 'place') {
    const isNew = !editing.place;
    return (
      <div className="stack">
        <h1 className="page-title">{isNew ? `New place for ${people.find((p) => p.id === editing.personId)?.name ?? 'someone'}` : 'Edit place'}</h1>
        <PlaceForm
          people={people}
          near={nearFor(editing.place, editing.personId, places)}
          initial={editing.place}
          personId={editing.personId}
          pickPerson={!isNew}
          submitLabel="Save"
          onCancel={() => setEditing(null)}
          onSave={async (place) => {
            await savePlaces(isNew ? [...places, place] : places.map((p) => (p.id === place.id ? place : p)));
            if (!settings.shadePlaceId) await saveSettings({ shadePlaceId: place.id, showShading: true });
            setEditing(null);
          }}
          onDelete={
            isNew
              ? undefined
              : async () => {
                  if (!confirm(`Delete "${editing.place!.label}"?`)) return;
                  await savePlaces(places.filter((p) => p.id !== editing.place!.id));
                  if (settings.shadePlaceId === editing.place!.id) await saveSettings({ shadePlaceId: null });
                  setEditing(null);
                }
          }
        />
      </div>
    );
  }

  const isShaded = (place: Place) => settings.showShading && settings.shadePlaceId === place.id;
  const toggleShade = (place: Place) =>
    void saveSettings(isShaded(place) ? { showShading: false } : { shadePlaceId: place.id, showShading: true });
  const toggleVisible = (place: Place) => void savePlaces(places.map((p) => (p.id === place.id ? { ...p, enabled: !p.enabled } : p)));

  return (
    <>
      {people.map((person) => {
        const theirs = places.filter((p) => p.personId === person.id);
        return (
          <section key={person.id} className="card" aria-label={person.name} style={{ overflow: 'hidden' }}>
            <div className="list-row surface" style={{ borderBottom: '1px solid var(--line)' }}>
              <Avatar person={person} people={people} size="lg" />
              <div className="main">
                <div style={{ fontSize: 15, fontWeight: 700 }}>{person.name}</div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  <span className="facet">{WALK_PACE_LABEL[person.walkPace]} pace</span>
                  <span className="facet">Walks up to {person.maxWalkMinutes} min</span>
                  {person.stepFree && (
                    <span className="facet">
                      <Icon name="stepFree" size={11} strokeWidth={2.4} />
                      Step-free
                    </span>
                  )}
                </div>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing({ kind: 'person', person, isNew: false })}>
                Edit
              </button>
            </div>
            {theirs.map((place) => (
              <div key={place.id} className="list-row" style={{ borderBottom: '1px solid var(--line)', opacity: place.enabled ? 1 : 0.6 }}>
                <div className="main">
                  <div style={{ fontWeight: 600 }}>
                    {place.label}
                    {!place.enabled && <span className="hint"> · hidden from listings</span>}
                  </div>
                  <div className="hint truncate">
                    {MODE_LABEL[place.mode]} · by {formatHhmm(place.arriveBy)} · {DAY_LABEL[place.day]} · {place.address}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn icon-btn"
                  disabled={place.mode === 'drive'}
                  aria-pressed={isShaded(place)}
                  aria-label={isShaded(place) ? `Stop shading ${place.label} on the map` : `Shade ${place.label} on the map`}
                  title={place.mode === 'drive' ? 'Shading is for transit and walking places' : 'Shade on the map'}
                  onClick={() => toggleShade(place)}
                >
                  <Icon name="layers" size={16} />
                </button>
                <button
                  type="button"
                  className="btn icon-btn"
                  aria-label={place.enabled ? `Hide ${place.label} from listings` : `Show ${place.label} on listings`}
                  title={place.enabled ? 'Hide from listings' : 'Show on listings'}
                  onClick={() => toggleVisible(place)}
                >
                  <Icon name={place.enabled ? 'eye' : 'eyeOff'} size={16} />
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setEditing({ kind: 'place', place, personId: person.id })}>
                  Edit
                </button>
              </div>
            ))}
            <div style={{ padding: '6px 8px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing({ kind: 'place', personId: person.id })}>
                <Icon name="plus" size={14} strokeWidth={2.2} />
                Add a place for {person.name}
              </button>
            </div>
          </section>
        );
      })}

      <button type="button" className="btn btn-dashed" onClick={() => setEditing({ kind: 'person', person: newPerson('', people), isNew: true })}>
        <Icon name="plus" size={16} strokeWidth={2.2} />
        Add a person
      </button>

      <p className="fine">
        The layers button picks which place is shaded on the listing map. Hidden places keep their routes but drop off the listing
        badges.
      </p>
    </>
  );
}

function PersonEditor({
  person: initial,
  people,
  isNew,
  placeCount,
  onSave,
  onCancel,
  onDelete,
}: {
  person: Person;
  people: Person[];
  isNew: boolean;
  placeCount: number;
  onSave(p: Person): void;
  onCancel(): void;
  onDelete(): void;
}) {
  const [person, setPerson] = useState(initial);
  const name = person.name.trim();
  return (
    <div className="stack">
      <h1 className="page-title">{isNew ? 'Add a person' : `Edit ${initial.name}`}</h1>
      <PersonFields person={person} people={people} onChange={setPerson} />
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={!name} onClick={() => onSave({ ...person, name })}>
          Save
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <span className="spacer" />
        {!isNew && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              const extra = placeCount ? ` and their ${placeCount} place${placeCount > 1 ? 's' : ''}` : '';
              if (confirm(`Delete ${initial.name}${extra}?`)) onDelete();
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
