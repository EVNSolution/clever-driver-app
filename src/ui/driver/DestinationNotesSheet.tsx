import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  isValidRequiredArrivalTime,
  savePreviewDestinationNotes,
  type DestinationNotes,
} from '../../domain/delivery/destinationNotesPreview';

export function DestinationNotesSheet({
  address,
  destinationName,
  notes,
  onClose,
  onSave,
}: {
  address: string;
  destinationName: string;
  notes: DestinationNotes;
  onClose(): void;
  onSave(notes: DestinationNotes): void;
}) {
  const insets = useSafeAreaInsets();
  const [lunchAccess, setLunchAccess] = useState(notes.lunchAccess.value);
  const [memo, setMemo] = useState(notes.memo.value);
  const [requiredArrivalTime, setRequiredArrivalTime] = useState(
    notes.requiredArrivalTime.value,
  );
  const normalizedMemo = memo.trim();
  const normalizedArrivalTime = requiredArrivalTime.trim();
  const hasValidArrivalTime = isValidRequiredArrivalTime(normalizedArrivalTime);

  function save() {
    if (!hasValidArrivalTime) return;
    const updatedAt = new Date().toISOString();

    onSave(savePreviewDestinationNotes(notes, {
      lunchAccess,
      memo: normalizedMemo,
      requiredArrivalTime: normalizedArrivalTime,
    }, updatedAt));
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable
          accessibilityLabel="배송지 정보 닫기"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom + 12, 24) },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>배송지 정보</Text>
              <Text numberOfLines={1} style={styles.destinationName}>
                {destinationName}
              </Text>
              <Text numberOfLines={2} style={styles.address}>
                {address}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="배송지 정보 닫기"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.previewNotice}>
            <Text style={styles.previewNoticeText}>
              UI Preview · 저장 내용은 앱을 닫으면 초기화됩니다
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <FieldHeader label="일반 메모" updatedAt={notes.memo.updatedAt} />
            <TextInput
              accessibilityLabel="배송지 일반 메모"
              maxLength={500}
              multiline
              onChangeText={setMemo}
              placeholder="출입구, 담당자 연락 등 배송 시 참고할 내용을 입력하세요"
              placeholderTextColor="#98a2b3"
              style={[styles.textInput, styles.memoInput]}
              textAlignVertical="top"
              value={memo}
            />

            <FieldHeader
              label="점심시간 입장"
              updatedAt={notes.lunchAccess.updatedAt}
            />
            <View style={styles.segmentedControl}>
              <LunchAccessButton
                isSelected={lunchAccess === 'UNKNOWN'}
                label="미확인"
                onPress={() => setLunchAccess('UNKNOWN')}
              />
              <LunchAccessButton
                isSelected={lunchAccess === 'AVAILABLE'}
                label="가능"
                onPress={() => setLunchAccess('AVAILABLE')}
              />
              <LunchAccessButton
                isSelected={lunchAccess === 'UNAVAILABLE'}
                label="불가능"
                onPress={() => setLunchAccess('UNAVAILABLE')}
              />
            </View>

            <FieldHeader
              label="필수 도착 시간"
              updatedAt={notes.requiredArrivalTime.updatedAt}
            />
            <TextInput
              accessibilityLabel="필수 도착 시간"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              onChangeText={setRequiredArrivalTime}
              placeholder="예: 13:30"
              placeholderTextColor="#98a2b3"
              style={[
                styles.textInput,
                !hasValidArrivalTime && styles.textInputInvalid,
              ]}
              value={requiredArrivalTime}
            />
            <Text style={[
              styles.fieldHint,
              !hasValidArrivalTime && styles.fieldError,
            ]}>
              {hasValidArrivalTime
                ? '정보성 항목이며 현재 경로와 ETA에는 반영되지 않습니다.'
                : '00:00부터 23:59 사이의 시간으로 입력해 주세요.'}
            </Text>
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !hasValidArrivalTime }}
            disabled={!hasValidArrivalTime}
            onPress={save}
            style={({ pressed }) => [
              styles.saveButton,
              !hasValidArrivalTime && styles.saveButtonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.saveButtonText}>배송지 정보 저장</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FieldHeader({
  label,
  updatedAt,
}: {
  label: string;
  updatedAt: string | null;
}) {
  return (
    <View style={styles.fieldHeader}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.updatedAt}>
        마지막 수정 · {formatUpdatedAt(updatedAt)}
      </Text>
    </View>
  );
}

function LunchAccessButton({
  isSelected,
  label,
  onPress,
}: {
  isSelected: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentButton,
        isSelected && styles.segmentButtonSelected,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={[
        styles.segmentButtonText,
        isSelected && styles.segmentButtonTextSelected,
      ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function formatUpdatedAt(updatedAt: string | null): string {
  if (updatedAt === null) return '기록 없음';

  return new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(updatedAt));
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#d0d5dd',
    borderRadius: 3,
    height: 5,
    marginBottom: 16,
    width: 44,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: '#101828',
    fontSize: 22,
    fontWeight: '900',
  },
  destinationName: {
    color: '#344054',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 8,
  },
  address: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#f2f4f7',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  closeButtonText: {
    color: '#475467',
    fontSize: 26,
    lineHeight: 29,
  },
  previewNotice: {
    backgroundColor: '#eef4ff',
    borderRadius: 10,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  previewNoticeText: {
    color: '#1849a9',
    fontSize: 11,
    fontWeight: '700',
  },
  form: {
    gap: 10,
    paddingBottom: 18,
    paddingTop: 18,
  },
  fieldHeader: {
    gap: 2,
    marginTop: 2,
  },
  fieldLabel: {
    color: '#344054',
    fontSize: 14,
    fontWeight: '900',
  },
  updatedAt: {
    color: '#98a2b3',
    fontSize: 10,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderColor: '#d0d5dd',
    borderRadius: 12,
    borderWidth: 1,
    color: '#101828',
    fontSize: 14,
    minHeight: 48,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  textInputInvalid: {
    borderColor: '#f04438',
  },
  memoInput: {
    minHeight: 92,
  },
  segmentedControl: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#d0d5dd',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 46,
    justifyContent: 'center',
  },
  segmentButtonSelected: {
    backgroundColor: '#e8f1ff',
    borderColor: '#0b57d0',
  },
  segmentButtonText: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '800',
  },
  segmentButtonTextSelected: {
    color: '#0b57d0',
  },
  fieldHint: {
    color: '#667085',
    fontSize: 10,
    lineHeight: 15,
  },
  fieldError: {
    color: '#b42318',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#0b57d0',
    borderRadius: 12,
    minHeight: 50,
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#98a2b3',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  buttonPressed: {
    opacity: 0.78,
  },
});
