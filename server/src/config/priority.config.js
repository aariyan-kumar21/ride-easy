/**
 * Configurable prototype priority scoring rules.
 * Adjust these values to tune demonstration behavior.
 */
const DEFAULT_PRIORITY_CONFIG = {
  bonuses: {
    senior: 40,
    womanNight: 30,
    regular: 0
  },
  waitingTime: {
    pointsPerFullMinute: 1,
    maxBonus: 30
  },
  nightHours: {
    startHour: Number(process.env.NIGHT_START_HOUR ?? 22), // 22:00
    endHour: Number(process.env.NIGHT_END_HOUR ?? 6)       // 06:00
  }
};

module.exports = { DEFAULT_PRIORITY_CONFIG };

