import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DriverCommandQueueError,
  parseStoredDriverCommands,
  type DriverCommandStore,
} from '../../../domain/delivery/driverCommandQueue';

const STORAGE_KEY = 'clever-driver.operational-commands.v1';
let storageWork: Promise<void> = Promise.resolve();

function serializeStorage<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageWork.then(operation);
  storageWork = result.then(() => undefined, () => undefined);
  return result;
}

/** Contains account-scoped command identities/fences only; never authentication tokens or images. */
export function createDriverCommandStore(): DriverCommandStore {
  return {
    load() {
      return serializeStorage(async () => {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === null) return [];
        let parsed: unknown;
        try { parsed = JSON.parse(saved); } catch { throw new DriverCommandQueueError('STORAGE_INVALID'); }
        return parseStoredDriverCommands(parsed);
      });
    },
    save(commands) {
      const serialized = JSON.stringify(parseStoredDriverCommands(commands));
      return serializeStorage(() => AsyncStorage.setItem(STORAGE_KEY, serialized));
    },
  };
}

/** Unsubmitted text is separate from the immutable command. The key includes account and every execution fence. */
export function loadDriverDeliveryExceptionDraft(key: string): Promise<string> {
  return serializeStorage(async () => {
    const saved = await AsyncStorage.getItem(`clever-driver.delivery-exception-draft.v1:${key}`);
    if (saved === null) return '';
    let parsed: unknown;
    try { parsed = JSON.parse(saved); } catch { throw new DriverCommandQueueError('STORAGE_INVALID'); }
    if (typeof parsed !== 'string') throw new DriverCommandQueueError('STORAGE_INVALID');
    return parsed;
  });
}

export function saveDriverDeliveryExceptionDraft(key: string, reason: string): Promise<void> {
  return serializeStorage(() => AsyncStorage.setItem(
    `clever-driver.delivery-exception-draft.v1:${key}`, JSON.stringify(reason),
  ));
}
