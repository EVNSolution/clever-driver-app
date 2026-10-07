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
