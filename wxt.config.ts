import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  imports: false,
  manifest: {
    name: 'RailtyMaps: transit times for home search',
    short_name: 'RailtyMaps',
    description:
      'Door-to-door transit times from Zillow and Redfin listings to the places everyone in your household goes. Washington, DC area.',
    homepage_url: 'https://github.com/devAgam/railtymaps',
    // sidePanel.open() from a content-script click needs 116.
    minimum_chrome_version: '116',
    permissions: ['storage', 'unlimitedStorage', 'sidePanel', 'declarativeNetRequestWithHostAccess'],
    host_permissions: ['https://api.transitous.org/*', 'https://geocoding.geo.census.gov/*'],
    action: { default_title: 'Open RailtyMaps' },
  },
});
