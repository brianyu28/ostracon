import type { DateUnit } from '@/domain/schema/types';

/** Date units for relative date operands. */
export const UNITS: { value: DateUnit; label: string }[] = [
  { value: 'day', label: 'days' },
  { value: 'week', label: 'weeks' },
  { value: 'month', label: 'months' },
  { value: 'quarter', label: 'quarters' },
  { value: 'year', label: 'years' },
];
