import { format } from 'date-fns';

export type DateRange = {
  start: string;
  end: string;
};

export function defaultDateRange(days: number = 30): DateRange {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));

  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
  };
}

export function normalizeDateRange(
  searchParams: Record<string, string | string[] | undefined>,
  fallback?: DateRange,
): DateRange {
  const base = fallback ?? defaultDateRange();
  const fromParam = searchParams.from;
  const toParam = searchParams.to;

  const coerce = (value: string | string[] | undefined): string | null => {
    if (!value) return null;
    if (Array.isArray(value)) {
      return value[0]?.slice(0, 10) ?? null;
    }
    return value.slice(0, 10);
  };

  const start = coerce(fromParam) ?? base.start;
  const end = coerce(toParam) ?? base.end;

  if (start > end) {
    return base;
  }

  return { start, end };
}



