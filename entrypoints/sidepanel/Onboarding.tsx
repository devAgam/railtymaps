import { useState } from 'react';
import { browser } from 'wxt/browser';
import { Icon } from '../../components/Icon';
import { Avatar, Brand } from '../../components/ui';
import { newPerson, savePeople, savePlaces, saveSettings } from '../../lib/storage';
import { DAY_LABEL, formatHhmm } from '../../lib/time';
import type { Person, Place } from '../../lib/types';
import { PersonFields, PlaceForm } from './forms';

// First run, in three steps: who's riding, where they go, then off to a listing site.
// People are saved when leaving step 1 and places as they're added, so closing
// the panel halfway loses nothing.

export function Onboarding({ people: savedPeople, places }: { people: Person[]; places: Place[] }) {
  const [step, setStep] = useState(savedPeople.length ? 2 : 1);
  const [people, setPeople] = useState<Person[]>(() => (savedPeople.length ? savedPeople : [newPerson('Me', [])]));
  const [forPerson, setForPerson] = useState(people[0].id);
  const [formKey, setFormKey] = useState(0);

  const named = people.filter((p) => p.name.trim());

  const toStep2 = async () => {
    const clean = named.map((p) => ({ ...p, name: p.name.trim() }));
    await savePeople(clean);
    setPeople(clean);
    if (!clean.some((p) => p.id === forPerson)) setForPerson(clean[0].id);
    setStep(2);
  };

  const addPlace = async (place: Place) => {
    await savePlaces([...places, place]);
    setFormKey((k) => k + 1); // fresh, empty form for the next place
  };

  const finish = async () => {
    await saveSettings({ onboarded: true, shadePlaceId: places[0]?.id ?? null });
  };

  const open = (url: string) => void browser.tabs.create({ url });

  return (
    <div className="app">
      <div className="top" style={{ paddingBottom: 0 }}>
        <div className="top-row">
          <Brand />
          <span className="spacer" />
          <span className="hint" style={{ fontWeight: 600 }}>
            Step {step} of 3
          </span>
        </div>
        <div className="progress" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= step ? 'done' : ''} />
          ))}
        </div>
      </div>

      <main>
        {step === 1 && (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Who's riding?</h1>
              <p className="hint" style={{ fontSize: 14 }}>
                Add everyone whose trips matter. Walking limits are per person, so a slower walker gets honest times.
              </p>
            </div>
            {people.map((p) => (
              <PersonFields
                key={p.id}
                person={p}
                people={people}
                onChange={(next) => setPeople(people.map((x) => (x.id === p.id ? next : x)))}
                onRemove={people.length > 1 ? () => setPeople(people.filter((x) => x.id !== p.id)) : undefined}
              />
            ))}
            <button type="button" className="btn btn-dashed" onClick={() => setPeople([...people, newPerson('', people)])}>
              <Icon name="plus" size={16} strokeWidth={2.2} />
              Add a person
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Where do they go?</h1>
              <p className="hint" style={{ fontSize: 14 }}>
                Work, a clinic, a place of worship, a friend's house. Pick the time they need to be there.
              </p>
            </div>
            {people.length > 1 && (
              <div className="row" role="tablist" aria-label="Person" style={{ flexWrap: 'wrap' }}>
                {people.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={p.id === forPerson}
                    className="btn"
                    style={p.id === forPerson ? { borderColor: 'var(--text)', boxShadow: 'inset 0 0 0 1px var(--text)' } : undefined}
                    onClick={() => setForPerson(p.id)}
                  >
                    <Avatar person={p} people={people} />
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <PlaceForm key={`${forPerson}-${formKey}`} people={people} personId={forPerson} submitLabel="Add place" onSave={(p) => void addPlace(p)} />
            {places.length > 0 && (
              <div className="section">
                <span className="label" style={{ margin: 0 }}>
                  Added
                </span>
                <div className="list">
                  {places.map((place) => (
                    <div key={place.id} className="list-row">
                      <Avatar person={people.find((p) => p.id === place.personId)} people={people} size="sm" />
                      <span style={{ fontWeight: 600 }}>{place.label}</span>
                      <span className="hint truncate">
                        by {formatHhmm(place.arriveBy)} · {DAY_LABEL[place.day]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>You're set</h1>
              <p className="hint" style={{ fontSize: 14 }}>
                Search for homes the way you normally do. Each listing gets a time for every place, colored from green (short)
                to red (long). Click one for the full routes.
              </p>
            </div>
            <div className="grid-2">
              <button type="button" className="btn btn-primary" onClick={() => open('https://www.zillow.com/washington-dc/')}>
                Open Zillow
              </button>
              <button type="button" className="btn btn-primary" onClick={() => open('https://www.redfin.com/city/12839/DC/Washington-DC')}>
                Open Redfin
              </button>
            </div>
            <p className="fine">
              Add or change people and places any time under People. Trip times come from Transitous, a free community trip
              planner that uses each transit agency's published schedules.
            </p>
          </>
        )}
      </main>

      <div className="footer-bar">
        {step === 2 && (
          <button type="button" className="btn" onClick={() => setStep(1)}>
            Back
          </button>
        )}
        {step === 1 && (
          <button type="button" className="btn btn-primary" disabled={!named.length} onClick={() => void toStep2()}>
            Continue
          </button>
        )}
        {step === 2 && (
          <button type="button" className="btn btn-primary" disabled={!places.length} onClick={() => setStep(3)}>
            {places.length ? 'Continue' : 'Add a place to continue'}
          </button>
        )}
        {step === 3 && (
          <button type="button" className="btn btn-primary" onClick={() => void finish()}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}
