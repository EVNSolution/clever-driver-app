export type LunchAccess = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';

type DestinationNoteField<T> = {
  updatedAt: string | null;
  value: T;
};

export type DestinationNotes = {
  lunchAccess: DestinationNoteField<LunchAccess>;
  lunchTime: DestinationNoteField<string>;
  memo: DestinationNoteField<string>;
  requiredArrivalTime: DestinationNoteField<string>;
};

export type DestinationNoteValues = {
  lunchAccess: LunchAccess;
  lunchTime: string;
  memo: string;
  requiredArrivalTime: string;
};

export const EMPTY_DESTINATION_NOTES: DestinationNotes = {
  lunchAccess: { updatedAt: null, value: 'UNKNOWN' },
  lunchTime: { updatedAt: null, value: '' },
  memo: { updatedAt: null, value: '' },
  requiredArrivalTime: { updatedAt: null, value: '' },
};

export function savePreviewDestinationNotes(
  previous: DestinationNotes,
  values: DestinationNoteValues,
  updatedAt: string,
): DestinationNotes {
  return {
    lunchAccess: updateField(previous.lunchAccess, values.lunchAccess, updatedAt),
    lunchTime: updateField(previous.lunchTime, values.lunchTime, updatedAt),
    memo: updateField(previous.memo, values.memo, updatedAt),
    requiredArrivalTime: updateField(
      previous.requiredArrivalTime,
      values.requiredArrivalTime,
      updatedAt,
    ),
  };
}

export function isValidRequiredArrivalTime(value: string): boolean {
  return value === '' || isValidTime(value);
}

export function isValidLunchTime(value: string): boolean {
  if (value === '') return true;
  const [startsAt, endsAt, extra] = value.split('~');

  return extra === undefined
    && startsAt !== undefined
    && endsAt !== undefined
    && isValidTime(startsAt)
    && isValidTime(endsAt);
}

export function formatTimeInput(value: string): string {
  const digits = value.replace(/\D/gu, '').slice(0, 4);

  return digits.length <= 2
    ? digits
    : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function formatTimeRangeInput(value: string): string {
  const digits = value.replace(/\D/gu, '').slice(0, 8);
  const startsAt = formatTimeInput(digits.slice(0, 4));

  return digits.length <= 4
    ? startsAt
    : `${startsAt}~${formatTimeInput(digits.slice(4))}`;
}

function isValidTime(value: string): boolean {
  const match = /^(?<hour>\d{2}):(?<minute>\d{2})$/u.exec(value);
  return match?.groups !== undefined
    && Number(match.groups.hour) < 24
    && Number(match.groups.minute) < 60;
}

function updateField<T>(
  previous: DestinationNoteField<T>,
  value: T,
  updatedAt: string,
): DestinationNoteField<T> {
  return Object.is(previous.value, value)
    ? previous
    : { updatedAt, value };
}
