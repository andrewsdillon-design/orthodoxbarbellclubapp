import { Alert, Platform } from 'react-native';

/** Ask before doing something that can't be undone. The web preview has no Alert, so it just goes ahead. */
export function confirmAction(title: string, message: string, yes: string, onYes: () => void, destructive = true) {
  if (Platform.OS === 'web') return onYes();
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: yes, style: destructive ? 'destructive' : 'default', onPress: onYes },
  ]);
}
