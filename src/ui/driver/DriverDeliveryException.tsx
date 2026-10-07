import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export type DriverDeliveryExceptionReason = {
  code: string;
  label: string;
  requiresExplanation?: boolean;
};

export function DriverDeliveryException({
  destinationName,
  reasons,
  onSubmit,
  onWorkProtectionChange,
}: {
  destinationName: string;
  reasons: readonly DriverDeliveryExceptionReason[];
  onSubmit(reasonCode: string, explanation?: string): Promise<void>;
  onWorkProtectionChange?(isProtected: boolean): void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<string>();
  const [explanation, setExplanation] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string>();
  const [isConfirmed, setIsConfirmed] = useState(false);
  const sendingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const selected = reasons.find((reason) => reason.code === reasonCode);
  const canSubmit = selected !== undefined && (!selected.requiresExplanation || explanation.trim() !== '');
  const isWorkProtected = isOpen || isSending;
  useEffect(() => {
    onWorkProtectionChange?.(isWorkProtected);
  }, [isWorkProtected, onWorkProtectionChange]);
  useEffect(() => () => onWorkProtectionChange?.(false), [onWorkProtectionChange]);

  function openReport() {
    onWorkProtectionChange?.(true);
    setIsOpen(true);
  }

  function closeReport() {
    if (!sendingRef.current) setIsOpen(false);
  }

  async function submit() {
    if (sendingRef.current || !canSubmit || selected === undefined || isConfirmed) return;
    sendingRef.current = true; setIsSending(true); setError(undefined);
    try {
      await onSubmit(selected.code, explanation.trim() || undefined);
      if (mountedRef.current) setIsConfirmed(true);
    } catch (failure) {
      if (mountedRef.current) setError(failure instanceof Error ? failure.message : '미배송 보고를 전송하지 못했습니다.');
    } finally {
      sendingRef.current = false;
      if (mountedRef.current) setIsSending(false);
    }
  }

  return (
    <View style={styles.entry}>
      <Pressable accessibilityRole="button" disabled={reasons.length === 0} onPress={openReport}>
        <Text style={styles.buttonText}>미배송 보고</Text>
      </Pressable>
      {reasons.length === 0 ? <Text style={styles.help}>보고 사유 승인 후 사용할 수 있습니다.</Text> : null}
      {isOpen ? (
        <Modal transparent animationType="fade" onRequestClose={closeReport}>
          <View style={styles.backdrop}>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.card} contentContainerStyle={styles.content}>
              <Text style={styles.title}>미배송 보고</Text>
              <Text>{destinationName}</Text>
              <Text style={styles.help}>보고는 배송 완료 또는 배송 실패 처리가 아닙니다.</Text>
              {isConfirmed ? <Text accessibilityRole="alert">서버가 미배송 보고를 접수했습니다.</Text> : (
                <>
                  {reasons.map((reason) => (
                    <Pressable accessibilityRole="radio" accessibilityState={{ checked: reasonCode === reason.code }}
                      disabled={isSending} key={reason.code} onPress={() => setReasonCode(reason.code)} style={styles.reason}>
                      <Text>{reasonCode === reason.code ? '●' : '○'} {reason.label}</Text>
                    </Pressable>
                  ))}
                  <TextInput accessibilityLabel="미배송 보고 내용" editable={!isSending} maxLength={1000}
                    multiline onChangeText={setExplanation} placeholder={selected?.requiresExplanation ? '내용을 입력해 주세요. 필수 항목입니다.' : '필요한 내용을 입력해 주세요.'}
                    style={styles.input} value={explanation} />
                  {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
                  {isSending ? <ActivityIndicator /> : null}
                  <Pressable accessibilityRole="button" disabled={!canSubmit || isSending} onPress={() => { void submit(); }} style={styles.submit}>
                    <Text style={styles.submitText}>보고 전송</Text>
                  </Pressable>
                </>
              )}
              <Pressable accessibilityRole="button" disabled={isSending} onPress={closeReport} style={styles.reason}>
                <Text>닫기</Text>
              </Pressable>
            </ScrollView>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { paddingHorizontal: 16, paddingVertical: 8, gap: 4 },
  buttonText: { color: '#B54708', fontWeight: '700' },
  help: { color: '#667085', fontSize: 12 },
  backdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48, backgroundColor: 'rgba(15,23,42,0.56)' },
  card: { flexGrow: 0, borderRadius: 20, backgroundColor: '#FFFFFF' },
  content: { padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  reason: { paddingVertical: 12 },
  input: { minHeight: 100, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 8, padding: 12, textAlignVertical: 'top' },
  error: { color: '#B42318' },
  submit: { backgroundColor: '#0B57D0', padding: 12, borderRadius: 8, alignItems: 'center' },
  submitText: { color: '#FFFFFF', fontWeight: '700' },
});
