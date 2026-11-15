import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { handleRequest } from '../lib/handlers';
import { wrapError, wrapOk, type Request } from '../lib/messages';
import { installUserAgentRule } from '../lib/motis';
import { prunePlans } from '../lib/plan';
import { forgetReach } from '../lib/reach';
import { forgetDrives } from '../lib/street';
import { currentListingKey, migrate, pageStatusKey } from '../lib/storage';
import type { Place } from '../lib/types';

export default defineBackground(() => {
  void setup();

  browser.runtime.onInstalled.addListener(({ reason }) => {
    void setup();
    if (reason === 'install') void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
  });
  browser.runtime.onStartup.addListener(() => void setup());

  browser.runtime.onMessage.addListener((msg: Request, sender, sendResponse) => {
    if (msg?.type === 'openPanel') {
      // sidePanel.open() only works while the user's click is still "live", so
      // it has to be the first thing we do, before any await.
      const tabId = sender.tab?.id;
      if (tabId == null) {
        sendResponse(wrapOk({ opened: false }));
        return false;
      }
      if (msg.listing) void browser.storage.session.set({ [currentListingKey(tabId)]: msg.listing });
      browser.sidePanel.open({ tabId }).then(
        () => sendResponse(wrapOk({ opened: true })),
        () => sendResponse(wrapOk({ opened: false })),
      );
      return true;
    }
    handleRequest(msg, sender.tab?.id).then(
      (value) => sendResponse(wrapOk(value)),
      (err) => sendResponse(wrapError(err)),
    );
    return true;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void browser.storage.session.remove([currentListingKey(tabId), pageStatusKey(tabId)]);
  });

  // A deleted place's cached reach is ~1 MB; don't keep it, or its drive times, around.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.places) return;
    const after = new Set(((changes.places.newValue as Place[] | undefined) ?? []).map((p) => p.id));
    for (const p of (changes.places.oldValue as Place[] | undefined) ?? []) {
      if (after.has(p.id)) continue;
      void forgetReach(p.id);
      void forgetDrives(p.id);
    }
  });
});

async function setup(): Promise<void> {
  await migrate().catch((e) => console.error('RailtyMaps: storage migration failed', e));
  await browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  await installUserAgentRule().catch((e) => console.warn('RailtyMaps: could not install the User-Agent rule', e));
  await prunePlans().catch(() => {});
}
