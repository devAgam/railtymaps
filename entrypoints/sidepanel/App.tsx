import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Banner, Brand } from '../../components/ui';
import { ISSUES_URL } from '../../lib/app';
import { currentListingKey, listingKey, pageStatusKey, TRANSITOUS_URL } from '../../lib/storage';
import { formatClock } from '../../lib/time';
import type { Listing, PageStatus, Person, Place, SavedHome } from '../../lib/types';
import { useActiveTabId, useSettings, useStored, useUsage } from './hooks';
import { Onboarding } from './Onboarding';
import { People } from './People';
import { Saved } from './Saved';
import { SettingsView } from './SettingsView';
import { ThisHome } from './ThisHome';

type View = 'home' | 'saved' | 'people' | 'settings';

export function App() {
  const tabId = useActiveTabId();
  const [people, peopleLoaded] = useStored<Person[]>('local', 'people', []);
  const [places, placesLoaded] = useStored<Place[]>('local', 'places', []);
  const [saved] = useStored<SavedHome[]>('local', 'saved', []);
  const [settings, settingsLoaded] = useSettings();
  const [listing] = useStored<Listing | null>('session', tabId != null ? currentListingKey(tabId) : null, null);
  const [status] = useStored<PageStatus | null>('session', tabId != null ? pageStatusKey(tabId) : null, null);
  const [usage] = useUsage();
  const [view, setView] = useState<View>('home');

  // Picking a listing on the page should bring This home forward.
  useEffect(() => {
    if (listing) setView((v) => (v === 'settings' || v === 'people' ? v : 'home'));
  }, [listing?.site, listing?.id]);

  if (!peopleLoaded || !placesLoaded || !settingsLoaded) return <div className="app" aria-busy="true" />;
  // Stay in setup until Done, even after the first place is added (it saves as you go).
  if (!settings.onboarded) return <Onboarding people={people} places={places} />;

  const isSaved = !!listing && saved.some((s) => listingKey(s) === listingKey(listing));
  const paused = settings.routerUrl === TRANSITOUS_URL && usage && usage.count >= usage.limit;
  const unreadable = status && status.searchPage && status.cards === 0 && Date.now() - status.checkedAt < 30 * 60_000;

  const tabs: [View, string][] = [
    ['home', 'This home'],
    ['saved', saved.length ? `Saved · ${saved.length}` : 'Saved'],
    ['people', 'People'],
  ];

  return (
    <div className="app">
      <header className="top">
        <div className="top-row">
          {view === 'settings' ? (
            <>
              <button type="button" className="btn icon-btn" aria-label="Back" onClick={() => setView('home')}>
                <Icon name="chevronLeft" size={18} strokeWidth={2.2} />
              </button>
              <h1 className="page-title">Settings</h1>
            </>
          ) : (
            <>
              <Brand />
              <span className="spacer" />
              <button type="button" className="btn icon-btn" aria-label="Settings" onClick={() => setView('settings')}>
                <Icon name="settings" size={18} />
              </button>
            </>
          )}
        </div>
        {view !== 'settings' && (
          <nav className="tabs" aria-label="Sections">
            {tabs.map(([id, label]) => (
              <button key={id} type="button" className="tab" aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
                {label}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main>
        {paused && (
          <Banner kind="warn" icon="alert">
            <b>New trip searches are paused{usage.resetsAt ? ` until about ${formatClock(new Date(usage.resetsAt).toISOString())}` : ''}.</b>{' '}
            You've used {usage.count} in the last day, the most RailtyMaps sends to the free routing service. Badges and saved routes
            still work.
          </Banner>
        )}
        {view === 'home' && unreadable && (
          <Banner kind="info" icon="info">
            <b>Couldn't read listings on this page.</b> The site may have changed its layout. Routes still work from a home's own page.{' '}
            <a href={ISSUES_URL} target="_blank" rel="noreferrer">
              Report it
            </a>
          </Banner>
        )}

        {view === 'home' && (
          <ThisHome
            listing={listing}
            people={people}
            places={places}
            settings={settings}
            saved={isSaved}
            tabId={tabId}
            onGoPeople={() => setView('people')}
          />
        )}
        {view === 'saved' && (
          <Saved saved={saved} people={people} places={places} settings={settings} usage={usage} tabId={tabId} onOpenHome={() => setView('home')} />
        )}
        {view === 'people' && <People people={people} places={places} settings={settings} />}
        {view === 'settings' && <SettingsView settings={settings} usage={usage} />}
      </main>
    </div>
  );
}
