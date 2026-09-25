type SlotCompensation = {
  label: string;
  value: string;
  isSupplemental: boolean;
};

export function getSlotCompensation(
  hourlyRate: number | null | undefined,
  comment: string | null | undefined
): SlotCompensation {
  const normalizedComment = String(comment || '').toLocaleLowerCase('ru-RU');
  const hasRate = typeof hourlyRate === 'number' && Number.isFinite(hourlyRate) && hourlyRate > 0;
  const isSupplemental =
    hasRate &&
    normalizedComment.includes(`+${hourlyRate}`) &&
    normalizedComment.includes('ставк');

  return {
    label: isSupplemental ? 'Доп. оплата к ставке' : 'Оплата',
    value: hasRate
      ? `${isSupplemental ? '+' : ''}${hourlyRate} ₽/час`
      : 'По договорённости',
    isSupplemental,
  };
}
