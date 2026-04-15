export type ShiftMeta = {
  hours: string | null;
  overnight: boolean;
};

function parseTimeParts(value: string) {
  const parts = value.split(':').map(Number);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return { hours, minutes };
}

export function getShiftMeta(timeFrom: string, timeTo: string): ShiftMeta {
  if (!timeFrom || !timeTo) {
    return { hours: null, overnight: false };
  }

  const from = parseTimeParts(timeFrom);
  const to = parseTimeParts(timeTo);

  if (!from || !to) {
    return { hours: null, overnight: false };
  }

  const fromMinutes = from.hours * 60 + from.minutes;
  let toMinutes = to.hours * 60 + to.minutes;
  let overnight = false;

  if (toMinutes <= fromMinutes) {
    toMinutes += 24 * 60;
    overnight = true;
  }

  const diffMinutes = toMinutes - fromMinutes;

  if (diffMinutes <= 0) {
    return { hours: null, overnight: false };
  }

  return {
    hours: (diffMinutes / 60).toFixed(2),
    overnight,
  };
}

export function getShiftStartDate(workDate: string, timeFrom: string) {
  const from = parseTimeParts(timeFrom);

  if (!workDate || !from) {
    return null;
  }

  const date = new Date(`${workDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(from.hours, from.minutes, 0, 0);
  return date;
}

export function getShiftEndDate(workDate: string, timeFrom: string, timeTo: string) {
  const start = getShiftStartDate(workDate, timeFrom);
  const to = parseTimeParts(timeTo);

  if (!start || !to) {
    return null;
  }

  const end = new Date(start);
  end.setHours(to.hours, to.minutes, 0, 0);

  if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
  }

  return end;
}

export function isShiftFinished(workDate: string, timeFrom: string, timeTo: string, now = new Date()) {
  const end = getShiftEndDate(workDate, timeFrom, timeTo);

  if (!end) {
    return false;
  }

  return end.getTime() <= now.getTime();
}

export function formatHours(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const num = Number(value);

  if (!Number.isFinite(num)) {
    return '—';
  }

  if (Number.isInteger(num)) {
    return `${num} ч`;
  }

  return `${num.toFixed(2).replace('.', ',')} ч`;
}

export function formatDateRu(value: string) {
  if (!value) return '—';

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(date);
}

export function formatTimeRu(value: string) {
  if (!value) return '—';
  return value.slice(0, 5);
}

export function formatShiftTimeRange(timeFrom: string, timeTo: string, overnight?: boolean) {
  const from = formatTimeRu(timeFrom);
  const to = formatTimeRu(timeTo);

  if (from === '—' || to === '—') {
    return '—';
  }

  return `${from}–${to}${overnight ? ' (следующий день)' : ''}`;
}

export function pluralRu(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}