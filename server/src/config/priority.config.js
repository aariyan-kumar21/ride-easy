/**
 * Configurable Priority & Time-Category Rules for Urban Ride Simulation.
 * Central configuration file for simulation time bands, presets, and priority scoring.
 */

const TIME_CATEGORIES = [
  {
    id: 'early_morning',
    label: 'Early Morning',
    startHour: 5,
    startMinute: 0,
    endHour: 7,
    endMinute: 59,
    hoursRange: '05:00–07:59',
    isNight: false,
    trafficNote: 'Low traffic conditions; prompt vehicle availability.'
  },
  {
    id: 'morning_peak',
    label: 'Morning Peak',
    startHour: 8,
    startMinute: 0,
    endHour: 10,
    endMinute: 59,
    hoursRange: '08:00–10:59',
    isNight: false,
    trafficNote: 'High commuter demand; priority-based queuing active.'
  },
  {
    id: 'normal_daytime',
    label: 'Normal Daytime',
    startHour: 11,
    startMinute: 0,
    endHour: 15,
    endMinute: 59,
    hoursRange: '11:00–15:59',
    isNight: false,
    trafficNote: 'Moderate road conditions; steady vehicle turnaround.'
  },
  {
    id: 'evening_peak',
    label: 'Evening Peak',
    startHour: 16,
    startMinute: 0,
    endHour: 18,
    endMinute: 59,
    hoursRange: '16:00–18:59',
    isNight: false,
    trafficNote: 'Rush hour traffic congestion; priority dispatch active.'
  },
  {
    id: 'evening',
    label: 'Evening',
    startHour: 19,
    startMinute: 0,
    endHour: 20,
    endMinute: 59,
    hoursRange: '19:00–20:59',
    isNight: false,
    trafficNote: 'Moderate evening traffic; daytime priority rules apply.'
  },
  {
    id: 'night',
    label: 'Night',
    startHour: 21,
    startMinute: 0,
    endHour: 4,
    endMinute: 59,
    hoursRange: '21:00–04:59',
    isNight: true,
    trafficNote: 'Night hours active: Women safety priority (+30) & Senior priority (+40).'
  }
];

const TIME_PRESETS = [
  { id: 'early_morning', label: 'Early Morning — 06:00 AM', time: '06:00', hour: 6, minute: 0, categoryId: 'early_morning' },
  { id: 'morning', label: 'Morning — 08:00 AM', time: '08:00', hour: 8, minute: 0, categoryId: 'morning_peak' },
  { id: 'late_morning', label: 'Late Morning — 11:00 AM', time: '11:00', hour: 11, minute: 0, categoryId: 'normal_daytime' },
  { id: 'afternoon', label: 'Afternoon — 02:00 PM', time: '14:00', hour: 14, minute: 0, categoryId: 'normal_daytime' },
  { id: 'evening_peak', label: 'Evening Peak — 05:00 PM', time: '17:00', hour: 17, minute: 0, categoryId: 'evening_peak' },
  { id: 'evening', label: 'Evening — 07:00 PM', time: '19:00', hour: 19, minute: 0, categoryId: 'evening' },
  { id: 'night', label: 'Night — 10:00 PM', time: '22:00', hour: 22, minute: 0, categoryId: 'night' },
  { id: 'late_night', label: 'Late Night — 12:00 AM', time: '00:00', hour: 0, minute: 0, categoryId: 'night' }
];

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
    startHour: Number(process.env.NIGHT_START_HOUR ?? 21), // 21:00
    endHour: Number(process.env.NIGHT_END_HOUR ?? 5)       // 05:00 (covers up to 04:59:59)
  },
  timeCategories: TIME_CATEGORIES,
  timePresets: TIME_PRESETS
};

/**
 * Determine the time category given an hour (0-23) and optional minute (0-59).
 */
function getTimeCategory(hour = 14, minute = 0) {
  const h = Number(hour) % 24;
  const m = Number(minute) % 60;
  const totalMinutes = h * 60 + m;

  for (const cat of TIME_CATEGORIES) {
    const startMin = cat.startHour * 60 + cat.startMinute;
    const endMin = cat.endHour * 60 + cat.endMinute;

    if (startMin <= endMin) {
      if (totalMinutes >= startMin && totalMinutes <= endMin) {
        return cat;
      }
    } else {
      // Midnight wrap-around (e.g. Night: 21:00 [1260m] to 04:59 [299m])
      if (totalMinutes >= startMin || totalMinutes <= endMin) {
        return cat;
      }
    }
  }

  return TIME_CATEGORIES[2]; // Default Normal Daytime
}

module.exports = {
  TIME_CATEGORIES,
  TIME_PRESETS,
  DEFAULT_PRIORITY_CONFIG,
  getTimeCategory
};
