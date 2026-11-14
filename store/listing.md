# Chrome Web Store listing

Everything the developer dashboard asks for, in the order it asks. Images are in this folder; upload the `.jpg`
versions (the store rejects PNGs with transparency, and these are smaller).

## Package

Upload `.output/railtymaps-1.0.0-chrome.zip`, built with `npm run zip`.

## Store listing tab

**Name** (from the manifest): RailtyMaps: transit times for home search

**Summary** (from the manifest, 124 of 132 characters):
Door-to-door transit times from Zillow and Redfin listings to the places everyone in your household goes. Washington, DC area.

**Description:**

```
House hunting for someone who gets around by bus and Metro usually means copying every address into a trip planner, once for each place they need to get to. RailtyMaps puts those answers on the listings instead.

Add the people in your household and the places they go: work, a clinic, school, church, a friend's house, each with the time they need to be there. Then search on Zillow or Redfin as you normally would.

• Every listing card shows a time for each person and place, colored from green to red.
• The map shades where you can live and still arrive on time, and draws Metro, rail and bus lines.
• Open a home to see the routes: when to leave, each walk and ride, transfers, and when the same trip runs earlier or later. Show any route on the map.
• Save the homes you like and compare them side by side, sorted by average or worst commute. Copy a summary to share with family.
• Each person gets their own walking pace, longest walk, and a step-free option for elevators instead of stairs.

Times mean "leave home this many minutes before the deadline", which counts waiting for buses that don't come often. They use each transit agency's published schedules. Live delays are not included.

Covers the Washington, DC area: Metrorail and Metrobus, MARC, VRE, Ride On, Fairfax Connector, ART, DASH, TheBus and other local systems.

Private by design: your people, places and saved homes stay in your browser. Trip planning uses Transitous, a free community trip planner, which receives only map coordinates. No account, no ads, no tracking.

Free and open source: https://github.com/devAgam/railtymaps

RailtyMaps is not affiliated with or endorsed by Zillow, Redfin, WMATA or any transit agency.
```

**Category:** Lifestyle › Household

**Language:** English (United States)

**Graphic assets:**

- Store icon: `public/icon/128.png`
- Screenshots, in this order: `screenshots/01-listings.jpg`, `02-cards.jpg`, `03-routes.jpg`, `04-saved.jpg`, `05-people.jpg`
- Small promo tile: `promo/small-440x280.jpg`
- Marquee promo tile: `promo/marquee-1400x560.jpg`

**Additional fields:**

- Official URL: none (needs a verified domain; add railtymaps.com later if you verify it in Search Console)
- Homepage URL: https://github.com/devAgam/railtymaps
- Support URL: https://github.com/devAgam/railtymaps/issues
- Mature content: No

## Privacy tab

**Single purpose:**

```
Show public-transit travel times from home listings on Zillow and Redfin to places the user chooses, with routes and a map overlay.
```

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| storage | Saves the people, places, saved homes and settings the user enters, and caches transit results so the same trips aren't requested again. |
| unlimitedStorage | Cached transit data for one place is close to 1 MB (every stop that can reach it in time). A few places exceed the default quota. |
| sidePanel | The extension's interface (routes, saved homes, people and places, settings) lives in the side panel. |
| declarativeNetRequestWithHostAccess | Adds a User-Agent header identifying the extension to its own requests to api.transitous.org, which that service's usage policy requires. It does not change any other requests and does not block anything. |
| Host permission: api.transitous.org | Trip planning: sends coordinates of the user's places and of homes they open, and receives routes and travel times. |
| Host permission: geocoding.geo.census.gov | Turns a street address the user types for a new place into coordinates. |
| Content scripts on zillow.com and redfin.com | Read listing locations from search results and home pages the user opens, show travel-time badges on them, and draw transit lines and the reachable area on the site's map. |

**Remote code:** No, I am not using remote code. (All JavaScript ships in the package; network responses are JSON data.)

**Data usage.** Check these data types:

- **Location:** coordinates of places the user adds and of listings, sent to the routing service to compute routes.
- **Website content:** listing addresses, prices and coordinates read from Zillow and Redfin pages to show travel times and to save homes locally.

Leave everything else unchecked. The names typed for people ("Mom") and all saved data stay on the device and are never transmitted.

Then certify all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/devAgam/railtymaps/blob/main/PRIVACY.md

## Distribution tab

- Visibility: Public
- Regions: United States (coverage is the DC area for now; listing it worldwide would only invite confused reviews)
- Pricing: Free

## Before you submit

- [ ] Load `.output/chrome-mv3` unpacked in your own Chrome and run through it on both sites: setup, a search page, a
      home page, Save, the Saved tab, Show on map.
- [ ] In `chrome://extensions`, open the service worker's DevTools, Network tab, and confirm requests to
      api.transitous.org carry the `RailtyMaps/1.0.0 (+https://github.com/devAgam/railtymaps)` User-Agent.
- [ ] Confirm clicking a badge opens the side panel (if Chrome refuses, the page shows a hint to use the toolbar button).
- [ ] Push the repo first so the privacy policy and homepage links resolve.
