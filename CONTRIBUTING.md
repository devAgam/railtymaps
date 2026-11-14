# Contributing

Bug reports and pull requests are welcome. The most useful report is a link to the page where something went wrong:
these sites change their markup often, and a URL is usually enough to reproduce it.

## Setup

```bash
npm install
npm run dev
```

`npm run dev` opens a separate Chrome profile with the extension loaded and reloads it as you edit. You'll need to set
up people and places once in that profile.

Before sending a pull request:

```bash
npm run compile
npm test
```

## Where things live

- `lib/sites/` reads each listing site. If Zillow or Redfin changed and badges disappeared, start here.
- `lib/content/run-site.ts` is everything the content script does on a listing page: badges, the floating card on home
  pages, and talking to the map script.
- `lib/map-overlay.ts` runs in the page's own world and draws on the site's Google Map.
- `lib/reach.ts`, `lib/estimate.ts`, `lib/plan.ts` are the routing logic. `lib/handlers.ts` is what the background
  answers.
- `entrypoints/sidepanel/` is the React side panel.
- `tests/` has unit tests. `tests/fixtures/` holds real responses from Transitous; please keep any new fixtures free of
  real people's addresses.

## Adding a site

1. Write a `SiteAdapter` in `lib/sites/<site>.ts`. Prefer data the site embeds for search engines (JSON-LD, inline
   JSON) over CSS selectors.
2. Add `entrypoints/<site>.content.ts` that calls `runSite(ctx, adapter)`, and add the site to the `matches` in
   `entrypoints/map.content.ts` if it uses Google Maps.
3. Add tests with a trimmed copy of the site's markup.

## Being nice to Transitous

Transitous is free and run by volunteers. Please don't add features that send a request per listing, per scroll or on
a timer. If something needs more routing than the current design allows, open an issue first so we can work out how to
do it with fewer requests.
