export const ANDROID_BACK_EXIT_WINDOW_MS = 2_000;

type AndroidBackAction =
  | 'close-delivery-space'
  | 'close-sequence-editor'
  | 'show-exit-hint'
  | 'exit-app';

export function resolveAndroidBackAction({
  isDeliverySpaceOpen,
  isSequenceEditing,
  lastRootBackAt,
  now,
}: {
  isDeliverySpaceOpen: boolean;
  isSequenceEditing: boolean;
  lastRootBackAt: number | null;
  now: number;
}): AndroidBackAction {
  if (isDeliverySpaceOpen) return 'close-delivery-space';
  if (isSequenceEditing) return 'close-sequence-editor';

  const elapsed = lastRootBackAt === null ? null : now - lastRootBackAt;
  return elapsed !== null
    && elapsed >= 0
    && elapsed <= ANDROID_BACK_EXIT_WINDOW_MS
    ? 'exit-app'
    : 'show-exit-hint';
}
