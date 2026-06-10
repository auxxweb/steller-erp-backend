/**
 * Map UI period presets to a MongoDB date range on a given field.
 * Inclusive start; end is start of day after the last included day ($lt).
 */
export const DATE_PERIOD_VALUES = [
  'today',
  'yesterday',
  'this_week',
  'this_month',
  'this_year',
  'custom',
];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const resolveDatePeriodRange = (query = {}) => {
  const period = query.period?.trim();
  const now = new Date();

  if (period === 'custom') {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && !Number.isNaN(from.getTime())) {
      const range = { $gte: startOfDay(from) };
      if (to && !Number.isNaN(to.getTime())) {
        range.$lt = addDays(startOfDay(to), 1);
      }
      return range;
    }
    return null;
  }

  const todayStart = startOfDay(now);
  const tomorrow = addDays(todayStart, 1);

  switch (period) {
    case 'today':
      return { $gte: todayStart, $lt: tomorrow };
    case 'yesterday': {
      const y = addDays(todayStart, -1);
      return { $gte: y, $lt: todayStart };
    }
    case 'this_week': {
      const day = now.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const weekStart = addDays(todayStart, mondayOffset);
      return { $gte: weekStart, $lt: tomorrow };
    }
    case 'this_month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { $gte: monthStart, $lt: tomorrow };
    }
    case 'this_year': {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return { $gte: yearStart, $lt: tomorrow };
    }
    default:
      return null;
  }
};

/** Apply period filter to a Mongoose query filter object. */
export const applyDatePeriodFilter = (filter, query, dateField = 'createdAt') => {
  const range = resolveDatePeriodRange(query);
  if (range) filter[dateField] = range;
  return filter;
};
