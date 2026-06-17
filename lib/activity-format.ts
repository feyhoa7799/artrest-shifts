function formatMinutes(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return `${value} минуту назад`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${value} минуты назад`;
  }

  return `${value} минут назад`;
}

export function formatActivityStatus(value?: string | null, now = new Date()) {
  if (!value) return 'нет данных';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'нет данных';

  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 5) return 'сейчас';
  if (diffMinutes < 60) return formatMinutes(diffMinutes);

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 2) return 'час назад';

  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const valueDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((nowDate.getTime() - valueDate.getTime()) / 86400000);

  if (diffDays === 0) return 'сегодня';
  if (diffDays === 1) return 'вчера';

  return 'давно';
}
