import { browser } from 'wxt/browser';

export const APP_NAME = 'RailtyMaps';
export const REPO_URL = 'https://github.com/devAgam/railtymaps';
export const PRIVACY_URL = `${REPO_URL}/blob/main/PRIVACY.md`;
export const ISSUES_URL = `${REPO_URL}/issues`;

// Transitous asks every client to identify itself with a name, a version and a
// way to reach whoever runs it. The issue tracker is that way.
export function userAgent(): string {
  return `${APP_NAME}/${browser.runtime.getManifest().version} (+${REPO_URL})`;
}

// Their policy asks apps to coordinate with them above ~720 plan/one-to-all
// requests a day. We stop a little short of that.
export const DAILY_ROUTING_LIMIT = 700;
