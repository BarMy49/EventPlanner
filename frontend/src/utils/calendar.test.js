import { describe, expect, it } from 'vitest';
import { buildBusyPayload, getProposalsForDate, getUsersForDate, proposalCalendarStatus } from './calendar.js';

describe('calendar utilities', () => {
  it('turns inclusive date inputs into an all-day API range', () => {
    const payload = buildBusyPayload('2026-05-10', '2026-05-12');
    expect(new Date(payload.end_time).getTime()).toBeGreaterThan(new Date(payload.start_time).getTime());
  });

  it('finds users with overlapping busy ranges', () => {
    const users = getUsersForDate([{ username: 'anna', start_time: '2026-05-09T22:00:00Z', end_time: '2026-05-11T22:00:00Z' }], new Date(2026, 4, 10));
    expect(users).toEqual(['anna']);
  });

  it('renders only open and accepted proposals on the calendar', () => {
    const accepted = { id: 1, status: 'closed', results: { yes_count: 2, no_count: 1 }, start_time: '2026-05-10T00:00:00Z', end_time: '2026-05-11T00:00:00Z' };
    const rejected = { ...accepted, id: 2, results: { yes_count: 1, no_count: 2 } };
    expect(proposalCalendarStatus(accepted)).toBe('accepted');
    expect(getProposalsForDate([accepted, rejected], new Date(2026, 4, 10)).map((proposal) => proposal.id)).toEqual([1]);
  });
});
