const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseInvestmentDate(value: unknown): Date {
  if (!value) {
    return new Date(NaN);
  }

  const str = String(value).trim();
  const dateOnlyMatch = DATE_ONLY_PATTERN.exec(str);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0));
  }

  return new Date(str);
}

export function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function getTodayDateKey(now: Date = new Date()): string {
  return toDateKey(now);
}
