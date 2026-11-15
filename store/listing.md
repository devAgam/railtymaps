# Chrome Web Store listing

Everything the developer dashboard asks for, in the order it asks. Upload the `.jpg` images: the store rejects
screenshots and promo tiles with transparency, and these are smaller than the PNGs.

## Before you start

- [ ] railtymaps.com is live. Its privacy page is the policy URL below, and the site is the homepage.
- [ ] Transitous knows about the listing. Their [usage policy](https://transitous.org/api/) asks apps to get in touch
      before going past about 720 trip searches a day across all users, which a public listing can reach quickly.
- [ ] Load the zip you're about to upload, unpacked, in your own Chrome and try both sites: setup, a search page, a home
      page, Save, the Saved tab, Show on map, and clicking a badge to open the side panel.
- [ ] In `chrome://extensions`, open the service worker's DevTools, Network tab, and check that requests to
      api.transitous.org carry the `RailtyMaps/<version> (+https://github.com/devAgam/railtymaps)` User-Agent.

## Developer account (once)

Register at https://chrome.google.com/webstore/devconsole with the Google account that should own the listing. There's a
one-time $5 registration fee, and the account needs 2-Step Verification turned on. In the Account tab, set the
publisher name and a contact email, which gets verified. The dashboard also asks whether you are a trader under EU
law; that's your declaration to make.

## Package

Click **New item** and upload the zip from the latest release: `.output/railtymaps-<version>-chrome.zip`, built with
`npm run zip`. It's the same file that's attached to the GitHub release. Later versions go in through the item's
Package tab; bump the version in package.json first, since the store won't take a version number twice.

## Store listing tab

**Name** (from the manifest): RailtyMaps: transit times for home search

**Summary** (from the manifest, 129 of 132 characters):
Transit, driving and walking times from Zillow and Redfin listings to the places everyone in your household goes. Most US metros.

**Description:**

```
House hunting for someone who gets around by bus and Metro usually means copying every address into a trip planner, once for each place they need to get to. RailtyMaps puts those answers on the listings instead.

Add the people in your household and the places they go: work, a clinic, school, church, a friend's house, each with the time they need to be there. Then search on Zillow or Redfin as you normally would.

• Every listing card shows a time for each person and place, colored from green to red.
• The map shades where you can live and still arrive on time, and draws Metro, rail and bus lines.
• Open a home to see the routes: when to leave, each walk and ride, transfers, and when the same trip runs earlier or later. Show any route on the map.
• Save the homes you like and compare them side by side, sorted by average or worst commute. Copy a summary to share with family.
• Each person gets their own walking pace, longest walk, and a step-free option for elevators instead of stairs.
• Not everyone rides transit: set any place to driving or walking instead. Driving times are without traffic.
• If no trip fits someone's walking limit, you still see the best one, marked as needing a longer walk.

Times mean "leave home this many minutes before the deadline", which counts waiting for buses that don't come often. They use each transit agency's published schedules. Live delays are not included.

Works across the US wherever Transitous has transit schedules: hundreds of agencies in 41 states and DC, including New York, Los Angeles, the Bay Area, Chicago, Boston, Philadelphia, Seattle, Portland, Denver, Atlanta, Phoenix, Minneapolis, Texas and Florida.

Private by design: your people, places and saved homes stay in your browser. Trip planning and place search use Transitous, a free community trip planner, which receives map coordinates and what you type into place search. No account, no ads, no tracking.

Website: https://railtymaps.com
Free and open source: https://github.com/devAgam/railtymaps

RailtyMaps is not affiliated with or endorsed by Zillow, Redfin, WMATA or any transit agency.
```

**Category:** Lifestyle › Household

**Language:** English (United States)

**Graphic assets:**

- Store icon: `icon-128.png` (the toolbar icon with the 16px of padding the store's image guidelines ask for; make it
  with `python3 scripts/make-icons.py`)
- Screenshots, in this order: `screenshots/01-listings.jpg`, `02-cards.jpg`, `03-routes.jpg`, `04-saved.jpg`,
  `05-people.jpg`
- Small promo tile: `promo/small-440x280.jpg`
- Marquee promo tile: `promo/marquee-1400x560.jpg` (only shown if the store features the extension)

**Additional fields:**

- Official URL: https://railtymaps.com. The dropdown only offers domains verified in Google Search Console under the same
  Google account, so verify it there first; leave it empty until then.
- Homepage URL: https://railtymaps.com
- Support URL: https://github.com/devAgam/railtymaps/issues
- Mature content: No

## Privacy tab

**Single purpose:**

```
Show travel times by transit, car or on foot from home listings on Zillow and Redfin to places the user chooses, with routes and a map overlay.
```

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| storage | Saves the people, places, saved homes and settings the user enters, and caches transit results so the same trips aren't requested again. |
| unlimitedStorage | Cached transit data for one place is close to 1 MB (every stop that can reach it in time). A few places exceed the default quota. |
| sidePanel | The extension's interface (routes, saved homes, people and places, settings) lives in the side panel. |
| declarativeNetRequestWithHostAccess | Adds a User-Agent header identifying the extension to its own requests to api.transitous.org, which that service's usage policy requires. It does not change any other requests and does not block anything. |
| Host permission: api.transitous.org | Trip planning and place search: sends coordinates of the user's places, of homes they open, and of listings on the page for places they drive to, plus the text they type when searching for a place, and receives routes, travel times and matching places. |
| Host permission: geocoding.geo.census.gov | Turns a street address the user types for a new place into coordinates. |
| Content scripts on zillow.com and redfin.com | Read listing locations from search results and home pages the user opens, show travel-time badges on them, and draw transit lines and the reachable area on the site's map. |

**Remote code:** No, I am not using remote code. (All JavaScript ships in the package; network responses are JSON data.)

**Data usage.** Check these data types:

- **Location:** coordinates of places the user adds and of listings, and the addresses they search for, sent to the routing service and the Census geocoder to compute routes and find places.
- **Website content:** listing addresses, prices and coordinates read from Zillow and Redfin pages to show travel times and to save homes locally.

Leave everything else unchecked. The names typed for people ("Mom") and all saved data stay on the device and are never transmitted.

Then certify all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://railtymaps.com/privacy/

## Distribution tab

- Visibility: Public. Unlisted also works if you'd rather share the link with a few people first.
- Regions: United States (address search and transit coverage are US-only for now)

## Test instructions tab

```
No account or sign-in is needed. After installing, click the RailtyMaps toolbar button to open the side panel and finish the short setup: add a person and a place, for example "Union Station, Washington, DC", arriving by 9:00 on weekdays. Then open https://www.redfin.com/city/12839/DC/Washington-DC (or search Zillow for Washington, DC). Each listing card shows a travel time for the place; clicking it opens the routes in the side panel. Trip planning uses the free Transitous service, so the first times can take a few seconds to appear.
```

## Submit

Click **Submit for review**. The dialog can publish automatically once the review passes, or wait for you to press
Publish. Reviews take anywhere from a few hours to a few weeks; extensions that run on other sites tend to take longer.

## After it's published

- The store version has its own extension ID, so it starts empty. To move your own people, places and saved homes
  across, use Export in the unpacked copy's Settings and Import in the store copy.
- Point people at the listing: the website's install section and "Download for Chrome" buttons, a `/chrome` short
  link in `site/_redirects`, and the README's Install section.
- Later versions: bump the version, `npm run zip`, upload it in the item's Package tab and submit again.
