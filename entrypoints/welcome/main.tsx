import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { Icon } from '../../components/Icon';
import { Brand } from '../../components/ui';
import { PRIVACY_URL, REPO_URL } from '../../lib/app';
import '../sidepanel/style.css';
import './welcome.css';

// Opened once, right after install. Its only real job is the "Set up" button:
// Chrome won't open a side panel without a click, so this page provides one.

function Welcome() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    void browser.tabs.getCurrent().then((t) => setTabId(t?.id ?? null));
  }, []);

  const setUp = () => {
    if (tabId == null) return;
    // No await before open(): the click's user gesture has to still be active.
    browser.sidePanel.open({ tabId }).then(
      () => setOpened(true),
      () => setOpened(false),
    );
  };

  return (
    <div className="welcome">
      <Brand />
      <h1>Transit times on every listing</h1>
      <p className="lede">
        RailtyMaps adds door-to-door bus, subway and train times to Zillow and Redfin, for each person in your household and each
        place they need to get to.
      </p>

      <ol className="how">
        <li>
          <Icon name="users" size={22} />
          <div>
            <b>Add who's riding and where they go.</b> Work, a clinic, school, church. Each person gets their own walking pace and
            limit.
          </div>
        </li>
        <li>
          <Icon name="search" size={22} />
          <div>
            <b>Search on Zillow or Redfin as usual.</b> Every listing shows a time per place, and the map shades what's in reach.
          </div>
        </li>
        <li>
          <Icon name="star" size={22} />
          <div>
            <b>Click a time for the routes.</b> Save the homes you like and compare them side by side.
          </div>
        </li>
      </ol>

      <div className="cta">
        <button type="button" className="btn btn-primary" onClick={setUp} disabled={tabId == null}>
          {opened ? 'Setup is open on the right' : 'Set up RailtyMaps'}
        </button>
        <p className="hint">
          Tip: pin it so it's one click away. Click the puzzle piece in Chrome's toolbar, then the pin next to RailtyMaps.
        </p>
      </div>

      <p className="fine">
        Your people, places and saved homes stay in this browser. Trip times come from{' '}
        <a href="https://transitous.org" target="_blank" rel="noreferrer">
          Transitous
        </a>
        , a free community trip planner. <a href={PRIVACY_URL}>Privacy</a> · <a href={REPO_URL}>Source code</a>
      </p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Welcome />
  </StrictMode>,
);
