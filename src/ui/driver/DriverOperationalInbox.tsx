import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  acknowledgeDriverOperationalNotification,
  loadDriverOperationalInbox,
  type DriverOperationalInboxItem,
} from '../../api/dsvDriverOperational';

export function DriverOperationalInbox({ accessToken, onClose, onOpen, refreshRequestKey = 0 }: {
  accessToken: string;
  refreshRequestKey?: number;
  onClose(): void;
  onOpen(notificationId: string): void;
}) {
  const [items, setItems] = useState<DriverOperationalInboxItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const loadedRefreshKeyRef = useRef(refreshRequestKey);
  const [request, setRequest] = useState<{ cursor?: string; sequence: number }>({ sequence: 0 });

  useEffect(() => {
    let active = true;
    const pageCursor = loadedRefreshKeyRef.current === refreshRequestKey ? request.cursor : undefined;
    void Promise.resolve().then(() => { if (active) setLoading(true); });
    void loadDriverOperationalInbox(accessToken, pageCursor)
      .then((page) => {
        if (!active) return;
        loadedRefreshKeyRef.current = refreshRequestKey;
        setItems((previous) => pageCursor === undefined ? page.items : [
          ...previous, ...page.items.filter((item) => !previous.some((old) => old.id === item.id)),
        ]);
        setCursor(page.nextCursor);
        setError(undefined);
      })
      .catch(() => { if (active) setError('알림을 불러오지 못했습니다. 다시 시도해 주세요.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, request, refreshRequestKey]);

  async function markRead(id: string) {
    try {
      const ack = await acknowledgeDriverOperationalNotification(accessToken, id, 'READ');
      setItems((previous) => previous.map((item) => item.id === id ? { ...item, ackedAt: ack.ackedAt } : item));
    } catch {
      setError('읽음 처리를 저장하지 못했습니다. 다시 시도해 주세요.');
    }
  }

  return <View style={styles.root}>
    <View style={styles.header}>
      <Text style={styles.title}>알림함</Text>
      <Button label="닫기" onPress={onClose} />
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button label="새로고침" disabled={loading} onPress={() => setRequest((old) => ({ sequence: old.sequence + 1 }))} />
      {loading ? <ActivityIndicator /> : null}
      {!loading && !error && items.length === 0 ? <Text>받은 알림이 없습니다.</Text> : null}
      {items.map((item) => <View key={item.id} style={styles.card}>
        <Text style={styles.itemTitle}>{item.summary.title}</Text>
        <Text>{item.summary.body}</Text>
        <Text>{item.ackedAt === null ? '읽지 않음' : '읽음'} · {statusLabel(item.businessStatus)}</Text>
        <Text>{new Date(item.createdAt).toLocaleString('ko-KR')}</Text>
        <View style={styles.actions}>
          <Button label="열기" onPress={() => onOpen(item.id)} />
          {item.ackedAt === null ? <Button label="읽음" onPress={() => { void markRead(item.id); }} /> : null}
        </View>
      </View>)}
      {cursor !== null ? <Button label="더 보기" disabled={loading} onPress={() => setRequest((old) => ({ cursor, sequence: old.sequence + 1 }))} /> : null}
    </ScrollView>
  </View>;
}

export function DriverNotificationNotice({ message, onClose, onRetry }: {
  message: string;
  onClose(): void;
  onRetry?: () => void;
}) {
  return <View style={styles.notice}>
    <Text accessibilityRole="header" style={styles.title}>알림 안내</Text>
    <Text accessibilityRole="alert">{message}</Text>
    {onRetry ? <Button label="다시 시도" onPress={onRetry} /> : null}
    <Button label="닫기" onPress={onClose} />
  </View>;
}

function statusLabel(status: DriverOperationalInboxItem['businessStatus']) {
  return { OPEN: '안내 중', RESOLVED: '처리됨', CANCELLED: '취소됨', EXPIRED: '만료됨' }[status];
}
function Button({ label, onPress, disabled = false }: { label: string; onPress(): void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={styles.button}>
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f9fc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#101828' },
  content: { padding: 16, gap: 14 },
  card: { padding: 16, gap: 8, backgroundColor: '#fff', borderRadius: 12 },
  itemTitle: { fontSize: 16, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12 },
  button: { padding: 12, backgroundColor: '#eaf1ff', borderRadius: 8 },
  buttonText: { color: '#0b57d0', fontWeight: '700' },
  notice: { flex: 1, padding: 24, justifyContent: 'center', gap: 18, backgroundColor: '#f7f9fc' },
  error: { color: '#b42318' },
});
