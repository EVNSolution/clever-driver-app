import {
  RefreshControl,
  StyleSheet,
  Text,
  type RefreshControlProps,
} from 'react-native';

import { formatDriverRefreshUpdatedAt } from './driverRefresh';

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

export function DriverRefreshUpdatedAt({
  lastUpdatedAt,
  refreshing,
}: Pick<DriverRefreshProps, 'lastUpdatedAt' | 'refreshing'>) {
  if (!refreshing) return null;

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
    paddingTop: 8,
    textAlign: 'center',
  },
});
