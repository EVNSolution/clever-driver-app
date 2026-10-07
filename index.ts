import { registerRootComponent } from 'expo';
import { createElement } from 'react';

import { AppRoot } from './src/app/AppRoot';
import { isolatedDeliveryExceptionReasons } from './src/config/driverIsolatedVerification';
import { configureExpoDriverPushNotifications } from './src/platform/expo/notifications/expoDriverNotificationService';

configureExpoDriverPushNotifications();
registerRootComponent(function DriverRoot() {
  const props: NonNullable<Parameters<typeof AppRoot>[0]> = {
    deliveryExceptionReasons: isolatedDeliveryExceptionReasons({
      enabled: process.env.EXPO_PUBLIC_DSV_ISOLATED_VERIFICATION,
      operational: process.env.EXPO_PUBLIC_DSV_OPERATIONAL_ENABLED,
      apiBaseUrl: process.env.EXPO_PUBLIC_DSV_API_BASE_URL,
    }),
  };
  return createElement<NonNullable<Parameters<typeof AppRoot>[0]>>(AppRoot, props);
});
