import type { Person, Place, SavedHome } from '../../lib/types';

// A made-up household for screenshots. The places are public landmarks; the
// homes are invented addresses at real points in Silver Spring and Wheaton.

export const people: Person[] = [
  { id: 'me', name: 'Me', color: '#1d4ed8', walkPace: 'brisk', maxWalkMinutes: 15, stepFree: false },
  { id: 'mom', name: 'Mom', color: '#a21caf', walkPace: 'relaxed', maxWalkMinutes: 12, stepFree: false },
  { id: 'dad', name: 'Dad', color: '#0f766e', walkPace: 'slow', maxWalkMinutes: 10, stepFree: true },
];

export const places: Place[] = [
  { id: 'work', personId: 'me', label: 'Work', address: 'Union Station, Washington, DC', lat: 38.8977, lon: -77.006, arriveBy: '09:00', day: 'weekday', enabled: true },
  { id: 'clinic', personId: 'mom', label: 'Clinic', address: 'NIH Clinical Center, Bethesda, MD', lat: 39.0004, lon: -77.103, arriveBy: '10:30', day: 'weekday', enabled: true },
  { id: 'church', personId: 'dad', label: 'Church', address: "St. Matthew's Cathedral, Washington, DC", lat: 38.9067, lon: -77.0396, arriveBy: '10:00', day: 'sunday', enabled: true },
];

const now = Date.UTC(2026, 10, 14);

export const saved: SavedHome[] = [
  { site: 'redfin', id: '9001', lat: 39.001, lon: -77.025, address: '100 Example St, Silver Spring, MD 20910', price: 525000, beds: 3, baths: 2, savedAt: now },
  { site: 'zillow', id: '9002', lat: 38.98, lon: -77.009, address: '200 Sample Ave, Takoma Park, MD 20912', price: 610000, beds: 3, baths: 2.5, savedAt: now },
  { site: 'redfin', id: '9003', lat: 39.04, lon: -77.056, address: '300 Test Rd, Wheaton, MD 20902', price: 455000, beds: 4, baths: 2, savedAt: now },
];
