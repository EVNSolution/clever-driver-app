export type LunchAccess = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';

type DestinationNoteField<T> = {
  updatedAt: string | null;
  value: T;
};

export type DestinationNotes = {
  lunchAccess: DestinationNoteField<LunchAccess>;
  memo: DestinationNoteField<string>;
  requiredArrivalTime: DestinationNoteField<string>;
};

export type DestinationNoteValues = {
  lunchAccess: LunchAccess;
  memo: string;
  requiredArrivalTime: string;
};

export const EMPTY_DESTINATION_NOTES: DestinationNotes = {
  lunchAccess: { updatedAt: null, value: 'UNKNOWN' },
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
    memo: updateField(previous.memo, values.memo, updatedAt),
    requiredArrivalTime: updateField(
      previous.requiredArrivalTime,
      values.requiredArrivalTime,
      updatedAt,
    ),
  };
}

export function isValidRequiredArrivalTime(value: string): boolean {
  if (value === '') return true;
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
