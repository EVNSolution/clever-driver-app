import { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type AppDialogTone = 'danger' | 'info' | 'success' | 'warning';
type AppDialogActionTone = 'danger' | 'primary' | 'secondary';

type AppDialogAction = {
  label: string;
  onPress?(): void;
  tone?: AppDialogActionTone;
};

type AppDialogOptions = {
  actions?: AppDialogAction[];
  dismissible?: boolean;
  message: string;
  title: string;
  tone?: AppDialogTone;
};

export function useAppDialog() {
  const [options, setOptions] = useState<AppDialogOptions | null>(null);
  const dismissDialog = useCallback(() => setOptions(null), []);
  const showDialog = useCallback((nextOptions: AppDialogOptions) => {
    setOptions(nextOptions);
  }, []);

  return {
    dialog: options === null ? null : (
      <AppDialog
        onDismiss={dismissDialog}
        options={options}
      />
    ),
    showDialog,
  };
}

function AppDialog({
  onDismiss,
  options,
}: {
  onDismiss(): void;
  options: AppDialogOptions;
}) {
  const tone = options.tone ?? 'info';
  const actions = options.actions ?? [{ label: '확인', tone: 'primary' as const }];
  const isDismissible = options.dismissible ?? true;

  function runAction(action: AppDialogAction) {
    onDismiss();
    action.onPress?.();
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={isDismissible ? onDismiss : () => undefined}
      statusBarTranslucent
      transparent
      visible
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="팝업 닫기"
          disabled={!isDismissible}
          onPress={onDismiss}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityRole="alert"
          accessibilityViewIsModal
          style={styles.card}
        >
          <View style={[styles.icon, toneStyles[tone].icon]}>
            <Text style={[styles.iconText, toneStyles[tone].iconText]}>
              {toneIcon[tone]}
            </Text>
          </View>
          <Text style={styles.title}>{options.title}</Text>
          <Text style={styles.message}>{options.message}</Text>
          <View style={styles.actions}>
            {actions.map((action) => {
              const actionTone = action.tone ?? 'secondary';
              return (
                <Pressable
                  accessibilityRole="button"
                  key={action.label}
                  onPress={() => runAction(action)}
                  style={({ pressed }) => [
                    styles.action,
                    actionStyles[actionTone].action,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[
                    styles.actionText,
                    actionStyles[actionTone].text,
                  ]}>
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const toneIcon: Record<AppDialogTone, string> = {
  danger: '!',
  info: 'i',
  success: '✓',
  warning: '!',
};

const toneStyles = {
  danger: StyleSheet.create({
    icon: { backgroundColor: '#fef3f2' },
    iconText: { color: '#b42318' },
  }),
  info: StyleSheet.create({
    icon: { backgroundColor: '#eff6ff' },
    iconText: { color: '#0b57d0' },
  }),
  success: StyleSheet.create({
    icon: { backgroundColor: '#ecfdf3' },
    iconText: { color: '#079455' },
  }),
  warning: StyleSheet.create({
    icon: { backgroundColor: '#fff7ed' },
    iconText: { color: '#c2410c' },
  }),
};

const actionStyles = {
  danger: StyleSheet.create({
    action: { backgroundColor: '#b42318' },
    text: { color: '#ffffff' },
  }),
  primary: StyleSheet.create({
    action: { backgroundColor: '#0b57d0' },
    text: { color: '#ffffff' },
  }),
  secondary: StyleSheet.create({
    action: { backgroundColor: '#f2f4f7' },
    text: { color: '#344054' },
  }),
};

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.56)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    elevation: 18,
    maxWidth: 380,
    padding: 22,
    shadowColor: '#101828',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    width: '100%',
  },
  icon: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  iconText: {
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 29,
  },
  title: {
    color: '#101828',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center',
  },
  message: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 7,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    width: '100%',
  },
  action: {
    alignItems: 'center',
    borderRadius: 13,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
  },
});
