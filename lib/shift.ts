export type ShiftMeta = {
  hours: string | null;
  overnight: boolean;
};

export function getShiftMeta(timeFrom: string, timeTo: string): ShiftMeta {
  if (!timeFrom || !timeTo) {
    return { hours: null, overnight: false };
  }

  const fromParts = timeFrom.split(':').map(Number);
  const toParts = timeTo.split(':').map(Number);

  const fromH = fromParts[0] ?? 0;
  const fromM = fromParts[1] ?? 0;
  const toH = toParts[0] ?? 0;
  const toM = toParts[1] ?? 0;

  if (
    Number.isNaN(fromH) ||
    Number.isNaN(fromM) ||
    Number.isNaN(toH) ||
    Number.isNaN(toM)
  ) {
    return { hours: null, overnight: false };
  }

  const from = fromH * 60 + fromM;
  let to = toH * 60 + toM;

  let overnight = false;

  if (to <= from) {
    to += 24 * 60;
    overnight = true;
  }

  const diffMinutes = to - from;

  if (diffMinutes <= 0) {
    return { hours: null, overnight: false };
  }

  return {
    hours: (diffMinutes / 60).toFixed(2),
    overnight,
  };
}