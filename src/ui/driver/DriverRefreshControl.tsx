import { useCallback, useState } from 'react';
import {
  RefreshControl,
  StyleSheet,
  Text,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
} from 'react-native';

import {
  formatDriverRefreshUpdatedAt,
  isDriverRefreshPulling,
} from './driverRefresh';

type DriverRefreshProps = {
  lastUpdatedAt: Date | null;
  onRefresh(): void;
  refreshing: boolean;
};

type DriverRefreshControlProps = Pick<
  DriverRefreshProps,
  'onRefresh' | 'refreshing'
> & Omit<
  RefreshControlProps,
  | 'colors'
  | 'onRefresh'
  | 'progressBackgroundColor'
  | 'refreshing'
  | 'tintColor'
  | 'title'
  | 'titleColor'
>;

export function DriverRefreshControl({
  onRefresh,
  refreshing,
  ...nativeProps
}: DriverRefreshControlProps) {
  return (
    <RefreshControl
      {...nativeProps}
      colors={['#0b57d0']}
      onRefresh={onRefresh}
      progressBackgroundColor="#ffffff"
      refreshing={refreshing}
      tintColor="#0b57d0"
    />
  );
}

export function useDriverRefreshFeedback(refreshing: boolean) {
  const [isPulling, setIsPulling] = useState(false);
  const onScroll = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    setIsPulling(isDriverRefreshPulling(event.nativeEvent.contentOffset.y));
  }, []);

  return { onScroll, visible: refreshing || isPulling };
}

export function DriverRefreshUpdatedAt({
  lastUpdatedAt,
  visible,
}: Pick<DriverRefreshProps, 'lastUpdatedAt'> & { visible: boolean }) {
  if (!visible) return null;

  return (
    <Text accessibilityLiveRegion="polite" style={styles.updatedAt}>
      {formatDriverRefreshUpdatedAt(lastUpdatedAt)}
    </Text>
  );
}

const styles = StyleSheet.create({
  updatedAt: {
    color: '#667085',
    fontSize: 11,
    paddingHorizontal: 18,
    paddingTop: 16,
    textAlign: 'center',
  },
});
