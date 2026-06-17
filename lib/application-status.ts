export type EmployeeApplicationDerivedStatus = 'pending' | 'active' | 'finished' | 'rejected';

export type EmployeeApplicationStatusInput = {
  applicationStatus: 'pending' | 'approved' | 'rejected' | string | null | undefined;
  slotStatus?: string | null;
  workDate?: string | null;
  timeFrom?: string | null;
  timeTo?: string | null;
  now?: Date;
};

export type EmployeeApplicationStatusResult = {
  derivedStatus: EmployeeApplicationDerivedStatus;
  isFinished: boolean;
  isActiveApproved: boolean;
  isValidShiftTime: boolean;
  shiftStart: Date | null;
  shiftEnd: Date | null;
};

type TimeParts = {
  hours: number;
  minutes: number;
  seconds: number;
};

function parseTime(value?: string | null): TimeParts | null {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return { hours, minutes, seconds };
}

function normalizeTime(value: TimeParts) {
  return [
    String(value.hours).padStart(2, '0'),
    String(value.minutes).padStart(2, '0'),
    String(value.seconds).padStart(2, '0'),
  ].join(':');
}

function isValidIsoDate(value?: string | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;

  const [yearRaw, monthRaw, dayRaw] = String(value).split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function getShiftDateTimeRangeMoscow(params: {
  workDate?: string | null;
  timeFrom?: string | null;
  timeTo?: string | null;
}) {
  if (!isValidIsoDate(params.workDate)) {
    return { start: null, end: null, isValid: false };
  }

  const from = parseTime(params.timeFrom);
  const to = parseTime(params.timeTo);

  if (!from || !to) {
    return { start: null, end: null, isValid: false };
  }

  const start = new Date(`${params.workDate}T${normalizeTime(from)}+03:00`);
  const end = new Date(`${params.workDate}T${normalizeTime(to)}+03:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { start: null, end: null, isValid: false };
  }

  if (end.getTime() <= start.getTime()) {
    end.setUTCDate(end.getUTCDate() + 1);
  }

  return { start, end, isValid: true };
}

export function getEmployeeApplicationStatus(
  input: EmployeeApplicationStatusInput
): EmployeeApplicationStatusResult {
  const now = input.now || new Date();
  const range = getShiftDateTimeRangeMoscow({
    workDate: input.workDate,
    timeFrom: input.timeFrom,
    timeTo: input.timeTo,
  });

  if (input.applicationStatus === 'rejected') {
    return {
      derivedStatus: 'rejected',
      isFinished: false,
      isActiveApproved: false,
      isValidShiftTime: range.isValid,
      shiftStart: range.start,
      shiftEnd: range.end,
    };
  }

  const isClosedSlot = input.slotStatus === 'closed';
  const isFinished =
    !range.isValid ||
    isClosedSlot ||
    Boolean(range.end && range.end.getTime() <= now.getTime());

  if (isFinished) {
    return {
      derivedStatus: 'finished',
      isFinished: true,
      isActiveApproved: false,
      isValidShiftTime: range.isValid,
      shiftStart: range.start,
      shiftEnd: range.end,
    };
  }

  if (input.applicationStatus === 'approved') {
    return {
      derivedStatus: 'active',
      isFinished: false,
      isActiveApproved: true,
      isValidShiftTime: true,
      shiftStart: range.start,
      shiftEnd: range.end,
    };
  }

  return {
    derivedStatus: 'pending',
    isFinished: false,
    isActiveApproved: false,
    isValidShiftTime: true,
    shiftStart: range.start,
    shiftEnd: range.end,
  };
}
