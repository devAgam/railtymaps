import { defineContentScript } from 'wxt/utils/define-content-script';
import { runSite } from '../lib/content/run-site';
import { redfin } from '../lib/sites/redfin';

export default defineContentScript({
  matches: ['*://www.redfin.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    runSite(ctx, redfin);
  },
});
