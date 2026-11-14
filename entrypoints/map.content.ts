import { defineContentScript } from 'wxt/utils/define-content-script';
import { startMapOverlay } from '../lib/map-overlay';

// Page-world script: both sites build their maps with the Google Maps JS API,
// and only code in the page's own world can reach those map objects.
export default defineContentScript({
  matches: ['*://www.zillow.com/*', '*://www.redfin.com/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    startMapOverlay();
  },
});
