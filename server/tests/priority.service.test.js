const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isNightHour,
  calculatePriority,
  sortRequestsByPriority
} = require('../src/services/priority.service');

describe('Priority Calculation Engine', () => {
  it('1. Senior citizen during daytime receives +40 category bonus', () => {
    const daytime = new Date(2026, 10, 12, 14, 0, 0); // 14:00 local
    const result = calculatePriority(
      { bookingId: 'BK-1', category: 'senior', createdAt: daytime },
      { now: daytime }
    );

    assert.equal(result.priorityScore, 40);
    assert.equal(result.priorityBreakdown.categoryBonus, 40);
    assert.equal(result.priorityBreakdown.waitingTimeBonus, 0);
    assert.equal(result.priorityBreakdown.isNightHours, false);
    assert.match(result.priorityBreakdown.reason, /Senior citizen \(\+40\)/);
  });

  it('2. Woman during daytime receives +0 category bonus', () => {
    const daytime = new Date(2026, 10, 12, 11, 30, 0); // 11:30 local
    const result = calculatePriority(
      { bookingId: 'BK-2', category: 'woman', createdAt: daytime },
      { now: daytime }
    );

    assert.equal(result.priorityScore, 0);
    assert.equal(result.priorityBreakdown.categoryBonus, 0);
    assert.equal(result.priorityBreakdown.isNightHours, false);
    assert.match(result.priorityBreakdown.reason, /daytime \(\+0\)/i);
  });

  it('3. Woman during night-time receives +30 category bonus (across midnight)', () => {
    const lateNight = new Date(2026, 10, 12, 23, 15, 0); // 23:15 local
    const earlyMorning = new Date(2026, 10, 13, 2, 45, 0); // 02:45 local

    const resLate = calculatePriority(
      { bookingId: 'BK-3A', category: 'woman', createdAt: lateNight },
      { now: lateNight }
    );
    const resEarly = calculatePriority(
      { bookingId: 'BK-3B', category: 'woman', createdAt: earlyMorning },
      { now: earlyMorning }
    );

    assert.equal(resLate.priorityScore, 30);
    assert.equal(resLate.priorityBreakdown.isNightHours, true);
    assert.equal(resEarly.priorityScore, 30);
    assert.equal(resEarly.priorityBreakdown.isNightHours, true);
    assert.equal(isNightHour(new Date(2026, 10, 12, 21, 0, 0)), true);
    assert.equal(isNightHour(new Date(2026, 10, 12, 22, 0, 0)), true);
    assert.equal(isNightHour(new Date(2026, 10, 13, 4, 59, 0)), true);
    assert.equal(isNightHour(new Date(2026, 10, 13, 5, 0, 0)), false);
    assert.equal(isNightHour(new Date(2026, 10, 13, 6, 0, 0)), false);
  });

  it('4. Regular passenger during night-time receives +0 category bonus', () => {
    const night = new Date(2026, 10, 12, 23, 0, 0);
    const result = calculatePriority(
      { bookingId: 'BK-4', category: 'regular', createdAt: night },
      { now: night }
    );

    assert.equal(result.priorityScore, 0);
    assert.equal(result.priorityBreakdown.categoryBonus, 0);
    assert.equal(result.priorityBreakdown.isNightHours, true);
  });

  it('5. Equal scores are ordered deterministically by earliest booking time, then bookingId', () => {
    const now = new Date(2026, 10, 12, 15, 0, 0);
    const tEarlier = new Date(2026, 10, 12, 14, 55, 0); // 5m wait -> +5
    const tLater = new Date(2026, 10, 12, 14, 55, 0);   // 5m wait -> +5 (same timestamp)

    const requests = [
      { bookingId: 'BK-200', category: 'regular', createdAt: tLater },
      { bookingId: 'BK-100', category: 'regular', createdAt: tEarlier },
      { bookingId: 'BK-300', category: 'regular', createdAt: new Date(2026, 10, 12, 14, 50, 0) } // 10m wait -> +10
    ];

    const sorted = sortRequestsByPriority(requests, { now });
    assert.deepEqual(
      sorted.map((r) => r.bookingId),
      ['BK-300', 'BK-100', 'BK-200']
    );
  });

  it('6. Waiting-time bonus is +1 per full minute and capped at +30', () => {
    const createdAt = new Date(2026, 10, 12, 12, 0, 0);
    const after45Mins = new Date(2026, 10, 12, 12, 45, 30);

    const result = calculatePriority(
      { bookingId: 'BK-6', category: 'senior', createdAt, priorityScore: 999 },
      { now: after45Mins }
    );

    assert.equal(result.priorityBreakdown.categoryBonus, 40);
    assert.equal(result.priorityBreakdown.waitingTimeBonus, 30);
    assert.equal(result.priorityScore, 70);
    assert.match(result.priorityBreakdown.reason, /capped/);
  });
});

