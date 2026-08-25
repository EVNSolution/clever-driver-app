import { RefreshControl, type RefreshControlProps } from 'react-native';

import { formatDriverRefreshUpdatedAt } from './driverRefresh';

type DriverRefreshProps = {
  lastUpdatedAt: Date | null;
  onRefresh(): void;
  refreshing: boolean;
};

type DriverRefreshControlProps = DriverRefreshProps & Omit<
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
  lastUpdatedAt,
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
      title={formatDriverRefreshUpdatedAt(lastUpdatedAt)}
      titleColor="#667085"
    />
  );
}
