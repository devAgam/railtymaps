# Privacy

Last updated: November 14, 2026

RailtyMaps is a browser extension that adds public-transit travel times to home listings on zillow.com and redfin.com. It
has no account, no server of its own and no analytics. This page lists everything it stores and everything it sends.

## What it stores, and where

All of this is kept in your browser's extension storage (`chrome.storage`) on your computer. None of it is uploaded
anywhere by RailtyMaps.

- **People and places you add:** names you type (like "Mom"), each person's walking settings, and each place's name,
  address, coordinates, arrive-by time and days.
- **Homes you save:** the listing's address, coordinates, price, beds and baths, and link, copied from the listing page.
- **Settings:** map options, color bands and the routing server address.
- **Cached results:** transit data for your places and trip plans for homes you looked at, kept for up to a week so
  the same question isn't asked twice.
- **A count of recent trip searches** (timestamps only), used to stay under the routing server's daily limit.

The home you're currently looking at, per tab, is held in session storage and cleared when the tab or browser closes.

You can export all of it as a JSON file or delete all of it from the extension's Settings screen. Uninstalling the
extension deletes it too.

## What it sends, and to whom

RailtyMaps talks to two outside services, only to do what you asked:

1. **The routing server** (by default [Transitous](https://transitous.org), at `api.transitous.org`):
   - the coordinates of your places, to find which transit stops can reach them in time;
   - the coordinates of a home, when you open it in the side panel or ask for exact times;
   - for places you've set to driving, the coordinates of the listings on the page you're viewing, to get driving times
     to all of them at once;
   - the text you type when searching for a place, while you type it, to suggest matches. If you already have other
     places, the coordinates of one of them go along so that nearby matches come first;
   - a new place's coordinates, to look up its time zone.

   No names, no listing details and nothing that identifies you are sent, though like any web request it reaches the
   server from your IP address. Transitous is run by volunteers and has its own
   [privacy policy](https://transitous.org/privacy/). You can point RailtyMaps at a different routing server in Settings.

2. **The US Census Bureau geocoder** (`geocoding.geo.census.gov`): the address text you type when adding a place, to find
   its coordinates. Census has its own [privacy policy](https://www.census.gov/about/policies/privacy.html).

Nothing is sent to Zillow or Redfin beyond what those sites already load themselves. RailtyMaps reads listing details
from the pages you open (addresses, coordinates, prices) in your own browser and does not send them anywhere except as
coordinates to the routing server, as above.

RailtyMaps does not sell data, does not use it for advertising, and does not share it with anyone else.

## Permissions

- **Access to zillow.com and redfin.com:** to read listings on pages you open and show transit times on them.
- **storage, unlimitedStorage:** to keep your people, places, saved homes and cached transit data on your computer.
  Cached data for one place can be close to a megabyte, more than the default storage quota allows.
- **sidePanel:** for the RailtyMaps panel.
- **declarativeNetRequestWithHostAccess:** to add an identifying User-Agent header to RailtyMaps' own requests to
  Transitous, as their usage policy asks. It changes no other requests.
- **Access to api.transitous.org and geocoding.geo.census.gov:** to send the requests described above.

## Contact

Questions or concerns: open an issue at https://github.com/devAgam/railtymaps/issues.
