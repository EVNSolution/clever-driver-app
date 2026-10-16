import { registerRootComponent } from 'expo';
import { createElement } from 'react';

import { AppRoot } from './src/app/AppRoot';
import { configureExpoDriverPushNotifications } from './src/platform/expo/notifications/expoDriverNotificationService';

configureExpoDriverPushNotifications();
registerRootComponent(function DriverRoot() {
  return createElement(AppRoot);
});
