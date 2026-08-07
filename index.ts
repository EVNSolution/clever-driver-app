import { registerRootComponent } from 'expo';

import { AppRoot } from './src/app/AppRoot';
import { configureExpoDriverPushNotifications } from './src/platform/expo/notifications/expoDriverNotificationService';

configureExpoDriverPushNotifications();
registerRootComponent(AppRoot);
