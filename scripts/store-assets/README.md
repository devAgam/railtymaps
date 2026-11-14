# Store assets

`npm run store-assets` regenerates `store/screenshots/` and `store/promo/`.

How it works:

- `panel-entry.tsx` runs the real side panel as an ordinary web page. `fake-browser.ts` stands in for the extension
  APIs (in-memory storage, messages go straight to the real background handlers), and `sample-data.ts` is the made-up
  household it shows.
- `page-harness.ts` gets injected into a live Redfin search page together with the built `map.js` content script. It
  reads the cards with the real Redfin adapter and draws real badges, with reach data that `node-routing.ts` fetched
  from Transitous.
- `shoot.mjs` drives headless Chrome (your installed Chrome, through playwright-core), takes the pictures, and frames
  them into 1280x800 screenshots and the two promo tiles.

Listing photos and agent names are blurred in the captures.

Run it sparingly. Each run loads Redfin twice and makes about a dozen Transitous requests, and Redfin's CDN starts
refusing headless Chrome after several runs close together. The script says so when that happens; waiting an hour or
so clears it.
