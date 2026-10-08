import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { deliveryExceptionReasonError, deliveryExceptionText } from '../../domain/delivery/driverDeliveryException';
import type { DriverQueuedCommand } from '../../domain/delivery/driverCommandQueue';
import { loadDriverDeliveryExceptionDraft, saveDriverDeliveryExceptionDraft } from '../../platform/expo/storage/driverCommandStore';

export function DriverDeliveryException({
  destinationName,
  draftKey,
  savedCommand,
  onSubmit,
  onWorkProtectionChange,
}: {
  destinationName: string;
  draftKey: string;
  savedCommand?: Extract<DriverQueuedCommand, { type: 'REPORT_DELIVERY_EXCEPTION' }>;
  onSubmit(reason: string): Promise<void>;
  onWorkProtectionChange?(isProtected: boolean): void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isDraftReady, setIsDraftReady] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string>();
  const [isConfirmed, setIsConfirmed] = useState(false);
  const sendingRef = useRef(false);
  const mountedRef = useRef(true);
  const draftWriteRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    void loadDriverDeliveryExceptionDraft(draftKey).then((saved) => {
      if (active) { setReason(saved); setIsDraftReady(true); }
    }).catch(() => {
      if (active) setError('저장된 보고 내용을 확인하지 못했습니다. 화면을 다시 열어 주세요.');
    });
    return () => { active = false; mountedRef.current = false; };
  }, [draftKey]);
  const text = savedCommand === undefined ? reason : deliveryExceptionText(savedCommand.payload);
  const validationError = deliveryExceptionReasonError(text);
  const confirmed = isConfirmed || savedCommand?.status === 'confirmed';
  const blocked = savedCommand?.status === 'blocked';
  const canSubmit = isDraftReady && !blocked && !confirmed && validationError === undefined;
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

  function updateReason(value: string) {
    if (savedCommand !== undefined || !isDraftReady || sendingRef.current) return;
    setReason(value);
    setError(undefined);
    const write = saveDriverDeliveryExceptionDraft(draftKey, value);
    draftWriteRef.current = write;
    void write.catch(() => {
      if (mountedRef.current) setError('보고 내용을 저장하지 못했습니다. 다시 입력해 주세요.');
    });
  }

  async function submit() {
    if (sendingRef.current || !canSubmit) return;
    sendingRef.current = true; setIsSending(true); setError(undefined);
    try {
      await draftWriteRef.current;
      await onSubmit(text.trim());
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
      <Pressable accessibilityRole="button" onPress={openReport}>
        <Text style={styles.buttonText}>미배송 보고</Text>
      </Pressable>
      {isOpen ? (
        <Modal transparent animationType="fade" onRequestClose={closeReport}>
          <View style={styles.backdrop}>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.card} contentContainerStyle={styles.content}>
              <Text style={styles.title}>미배송 보고</Text>
              <Text>{destinationName}</Text>
              <Text style={styles.help}>보고는 배송 완료 또는 배송 실패 처리가 아닙니다. 사진 없이 보고할 수 있습니다.</Text>
              {confirmed ? <Text accessibilityRole="alert">미배송 보고가 접수되었습니다</Text> : (
                <>
                  <TextInput accessibilityLabel="미배송 사유" editable={isDraftReady && !isSending && savedCommand === undefined}
                    multiline onChangeText={updateReason} placeholder="미배송 사유를 입력해 주세요. 필수 항목입니다."
                    style={styles.input} value={text} />
                  <Text style={styles.help}>{text.trim().length}/1,000자</Text>
                  {!isDraftReady ? <ActivityIndicator /> : null}
                  {text !== '' && validationError ? <Text accessibilityRole="alert" style={styles.error}>{validationError}</Text> : null}
                  {savedCommand?.status === 'pending' ? <Text style={styles.help}>접수 확인 대기 중입니다. 저장된 보고 내용을 그대로 다시 전송합니다.</Text> : null}
                  {blocked ? <Text accessibilityRole="alert" style={styles.error}>배차 또는 배송지가 변경되어 보고 명령이 차단됐습니다. 현재 배차를 확인해 주세요.</Text> : null}
                  {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
                  {isSending ? <ActivityIndicator /> : null}
                  <Pressable accessibilityRole="button" disabled={!canSubmit || isSending} onPress={() => { void submit(); }} style={styles.submit}>
                    <Text style={styles.submitText}>{savedCommand?.status === 'pending' ? '보고 다시 전송' : '보고 전송'}</Text>
                  </Pressable>
                </>
              )}
              <Pressable accessibilityRole="button" disabled={isSending} onPress={closeReport} style={styles.close}>
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
  close: { paddingVertical: 12 },
  input: { minHeight: 100, borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 8, padding: 12, textAlignVertical: 'top' },
  error: { color: '#B42318' },
  submit: { backgroundColor: '#0B57D0', padding: 12, borderRadius: 8, alignItems: 'center' },
  submitText: { color: '#FFFFFF', fontWeight: '700' },
});
