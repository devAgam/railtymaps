import { defineContentScript } from 'wxt/utils/define-content-script';
import { runSite } from '../lib/content/run-site';
import { zillow } from '../lib/sites/zillow';

export default defineContentScript({
  matches: ['*://www.zillow.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    runSite(ctx, zillow);
  },
});
