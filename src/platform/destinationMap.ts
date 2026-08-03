import * as Clipboard from 'expo-clipboard';
import { requireNativeModule } from 'expo-modules-core';
import { Linking, Platform } from 'react-native';

type AndroidMapChooser = {
  openMapChooser(address: string): Promise<void>;
};

export async function openDestinationMap(address: string): Promise<void> {
  await Clipboard.setStringAsync(address);
  if (Platform.OS === 'android') {
    const mapChooser = requireNativeModule<AndroidMapChooser>('MapChooser');
    await mapChooser.openMapChooser(address);
    return;
  }

  const query = encodeURIComponent(address);
  await Linking.openURL(`https://maps.apple.com/?q=${query}`);
}
