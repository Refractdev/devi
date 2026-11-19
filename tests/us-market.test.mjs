import test from 'node:test';
import assert from 'node:assert/strict';
import { addBusinessDaysAtLocalTime, federalHolidays, inferTimeZone, isUSBusinessWindow, normalizeStateCode } from '../src/lib/us-market.ts';

test('normalizes the names and postal codes of all 50 states', () => {
  const states = ['Alabama:AL','Alaska:AK','Arizona:AZ','Arkansas:AR','California:CA','Colorado:CO','Connecticut:CT','Delaware:DE','Florida:FL','Georgia:GA','Hawaii:HI','Idaho:ID','Illinois:IL','Indiana:IN','Iowa:IA','Kansas:KS','Kentucky:KY','Louisiana:LA','Maine:ME','Maryland:MD','Massachusetts:MA','Michigan:MI','Minnesota:MN','Mississippi:MS','Missouri:MO','Montana:MT','Nebraska:NE','Nevada:NV','New Hampshire:NH','New Jersey:NJ','New Mexico:NM','New York:NY','North Carolina:NC','North Dakota:ND','Ohio:OH','Oklahoma:OK','Oregon:OR','Pennsylvania:PA','Rhode Island:RI','South Carolina:SC','South Dakota:SD','Tennessee:TN','Texas:TX','Utah:UT','Vermont:VT','Virginia:VA','Washington:WA','West Virginia:WV','Wisconsin:WI','Wyoming:WY'];
  for (const row of states) {
    const [name, code] = row.split(':');
    assert.equal(normalizeStateCode(name), code);
    assert.equal(normalizeStateCode(code.toLowerCase()), code);
  }
});

test('infers representative US time zones', () => {
  assert.equal(inferTimeZone('Austin, TX'), 'America/Chicago');
  assert.equal(inferTimeZone('San Francisco, California'), 'America/Los_Angeles');
  assert.equal(inferTimeZone('Phoenix, AZ'), 'America/Phoenix');
  assert.equal(inferTimeZone('Honolulu, HI'), 'Pacific/Honolulu');
});

test('excludes weekends, federal holidays, and hours outside 9 to 5 local time', () => {
  assert.equal(isUSBusinessWindow(new Date('2026-11-16T15:00:00Z'), 'New York, NY'), true);
  assert.equal(isUSBusinessWindow(new Date('2026-11-16T12:00:00Z'), 'New York, NY'), false);
  assert.equal(isUSBusinessWindow(new Date('2026-11-21T16:00:00Z'), 'Austin, TX'), false);
  assert.equal(isUSBusinessWindow(new Date('2026-11-26T16:00:00Z'), 'Austin, TX'), false);
  assert.ok(federalHolidays(2026).has('2026-11-26'));
});

test('schedules follow-ups at 10 a.m. recipient time after US business days and holidays', () => {
  const beforeObservedIndependenceDay = new Date('2026-07-02T14:30:00.000Z');
  assert.equal(addBusinessDaysAtLocalTime(beforeObservedIndependenceDay, 1, 'America/New_York').toISOString(), '2026-07-06T14:00:00.000Z');
  const beforeDaylightSavingSwitch = new Date('2026-03-06T15:30:00.000Z');
  assert.equal(addBusinessDaysAtLocalTime(beforeDaylightSavingSwitch, 1, 'America/New_York').toISOString(), '2026-03-09T14:00:00.000Z');
});
