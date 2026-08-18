import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  formatTimeInput,
  isValidLunchTime,
  isValidRequiredArrivalTime,
  type DestinationNotes,
  type DestinationNoteValues,
} from '../../domain/delivery/destinationNotesPreview';
import type { DeliveryOrder } from '../../domain/delivery/deliveryPlan';

type InformationTab = 'orders' | 'destination';

export function DestinationNotesSheet({
  address,
  destinationName,
  notes,
  onClose,
  onSave,
  orders,
}: {
  address: string;
  destinationName: string;
  notes: DestinationNotes;
  onClose(): void;
  onSave(values: DestinationNoteValues): Promise<void> | void;
  orders: DeliveryOrder[];
}) {
  const insets = useSafeAreaInsets();
  const [informationTab, setInformationTab] = useState<InformationTab>('orders');
  const [isSaving, setIsSaving] = useState(false);
  const [initialLunchStartsAt = '', initialLunchEndsAt = ''] =
    notes.lunchTime.value.split('~');
  const [lunchAccess, setLunchAccess] = useState(notes.lunchAccess.value);
  const [lunchStartsAt, setLunchStartsAt] = useState(initialLunchStartsAt);
  const [lunchEndsAt, setLunchEndsAt] = useState(initialLunchEndsAt);
  const [memo, setMemo] = useState(notes.memo.value);
  const [requiredArrivalTime, setRequiredArrivalTime] = useState(
    notes.requiredArrivalTime.value,
  );
  const normalizedLunchTime = lunchStartsAt === '' && lunchEndsAt === ''
    ? ''
    : `${lunchStartsAt}~${lunchEndsAt}`;
  const normalizedMemo = memo.trim();
  const normalizedArrivalTime = requiredArrivalTime.trim();
  const hasValidLunchTime = isValidLunchTime(normalizedLunchTime);
  const hasValidArrivalTime = isValidRequiredArrivalTime(normalizedArrivalTime);
  const canSave = hasValidLunchTime && hasValidArrivalTime && !isSaving;
  const totalBoxes = orders.reduce(
    (sum, order) => sum + order.shippedBoxes,
    0,
  );

  async function save() {
    if (!canSave) return;
    setIsSaving(true);
    try {
      await onSave({
        lunchAccess,
        lunchTime: normalizedLunchTime,
        memo: normalizedMemo,
        requiredArrivalTime: normalizedArrivalTime,
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="배송 정보 닫기"
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
              <Text style={styles.title}>배송 정보</Text>
              <Text numberOfLines={1} style={styles.destinationName}>
                {destinationName}
              </Text>
              <Text numberOfLines={2} style={styles.address}>
                {address}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="배송 정보 닫기"
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

          <View accessibilityRole="tablist" style={styles.informationTabs}>
            <InformationTabButton
              isSelected={informationTab === 'orders'}
              label="주문 정보"
              onPress={() => setInformationTab('orders')}
            />
            <InformationTabButton
              isSelected={informationTab === 'destination'}
              label="배송지 정보"
              onPress={() => setInformationTab('destination')}
            />
          </View>

          <KeyboardAwareScrollView
            bottomOffset={80}
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {informationTab === 'orders' ? (
              <>
                <View style={styles.orderSummary}>
                  <Text style={styles.orderSummaryText}>주문 {orders.length}건</Text>
                  <View style={styles.orderSummaryDivider} />
                  <Text style={styles.orderSummaryText}>총 {totalBoxes}박스</Text>
                </View>
                <View style={styles.orderInformationCard}>
                  {orders.map((order, index) => (
                    <View
                      key={order.id}
                      style={[
                        styles.orderInformationRow,
                        index < orders.length - 1
                          && styles.orderInformationDivider,
                      ]}
                    >
                      <Text style={styles.orderInformationLabel}>
                        주문 {index + 1}
                      </Text>
                      <Text
                        style={[
                          styles.orderCondition,
                          order.conditionCode === 'COLD'
                            && styles.orderConditionCold,
                        ]}
                      >
                        {order.conditionCode}
                      </Text>
                      <Text style={styles.orderBoxes}>
                        {order.shippedBoxes}박스
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <>
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

                <View style={styles.lunchGroup}>
                  <FieldHeader
                    label="점심시간"
                    updatedAt={notes.lunchTime.updatedAt}
                  />
                  <View style={styles.lunchControls}>
                    <View style={styles.timeRangeInputs}>
                      <TextInput
                        accessibilityLabel="점심시간 시작"
                        keyboardType="number-pad"
                        maxLength={5}
                        onChangeText={(value) => {
                          setLunchStartsAt(formatTimeInput(value));
                        }}
                        placeholder="12:00"
                        placeholderTextColor="#98a2b3"
                        style={[
                          styles.textInput,
                          styles.timeRangeInput,
                          !hasValidLunchTime && styles.textInputInvalid,
                        ]}
                        value={lunchStartsAt}
                      />
                      <Text style={styles.timeRangeSeparator}>~</Text>
                      <TextInput
                        accessibilityLabel="점심시간 종료"
                        keyboardType="number-pad"
                        maxLength={5}
                        onChangeText={(value) => {
                          setLunchEndsAt(formatTimeInput(value));
                        }}
                        placeholder="13:00"
                        placeholderTextColor="#98a2b3"
                        style={[
                          styles.textInput,
                          styles.timeRangeInput,
                          !hasValidLunchTime && styles.textInputInvalid,
                        ]}
                        value={lunchEndsAt}
                      />
                    </View>
                    <View style={[styles.segmentedControl, styles.accessControl]}>
                      <LunchAccessButton
                        accessibilityLabel="점심시간 입장 가능"
                        isSelected={lunchAccess === 'AVAILABLE'}
                        label="입장 가능"
                        onPress={() => setLunchAccess('AVAILABLE')}
                      />
                      <LunchAccessButton
                        accessibilityLabel="점심시간 입장 불가"
                        isSelected={lunchAccess === 'UNAVAILABLE'}
                        label="입장 불가"
                        onPress={() => setLunchAccess('UNAVAILABLE')}
                      />
                    </View>
                  </View>
                  {!hasValidLunchTime ? (
                    <Text style={[styles.fieldHint, styles.fieldError]}>
                      시작·종료 시간을 각각 숫자 4자리로 입력해 주세요.
                    </Text>
                  ) : null}
                </View>

                <FieldHeader
                  label="필수 도착 시간"
                  updatedAt={notes.requiredArrivalTime.updatedAt}
                />
                <TextInput
                  accessibilityLabel="필수 도착 시간"
                  keyboardType="number-pad"
                  maxLength={5}
                  onChangeText={(value) => {
                    setRequiredArrivalTime(formatTimeInput(value));
                  }}
                  placeholder="13:30"
                  placeholderTextColor="#98a2b3"
                  style={[
                    styles.textInput,
                    styles.arrivalTimeInput,
                    !hasValidArrivalTime && styles.textInputInvalid,
                  ]}
                  value={requiredArrivalTime}
                />
                {!hasValidArrivalTime ? (
                  <Text style={[styles.fieldHint, styles.fieldError]}>
                    0000부터 2359 사이의 숫자 4자리로 입력해 주세요.
                  </Text>
                ) : null}
              </>
            )}
          </KeyboardAwareScrollView>

          {informationTab === 'destination' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              disabled={!canSave}
              onPress={() => { void save(); }}
              style={({ pressed }) => [
                styles.saveButton,
                !canSave && styles.saveButtonDisabled,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.saveButtonText}>
                {isSaving ? '저장 중…' : '배송지 정보 저장'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function InformationTabButton({
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
      accessibilityRole="tab"
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.informationTab,
        isSelected && styles.informationTabSelected,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={[
        styles.informationTabText,
        isSelected && styles.informationTabTextSelected,
      ]}>
        {label}
      </Text>
    </Pressable>
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
  accessibilityLabel,
  isSelected,
  label,
  onPress,
}: {
  accessibilityLabel: string;
  isSelected: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
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
  informationTabs: {
    backgroundColor: '#f2f4f7',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 4,
    marginTop: 14,
    padding: 4,
  },
  informationTab: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  informationTabSelected: {
    backgroundColor: '#ffffff',
    borderColor: '#b2ccff',
    borderWidth: 1,
  },
  informationTabText: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '800',
  },
  informationTabTextSelected: {
    color: '#0b57d0',
  },
  form: {
    gap: 10,
    paddingBottom: 18,
    paddingTop: 18,
  },
  orderSummary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  orderSummaryText: {
    color: '#344054',
    fontSize: 13,
    fontWeight: '800',
  },
  orderSummaryDivider: {
    backgroundColor: '#d0d5dd',
    height: 12,
    width: 1,
  },
  orderInformationCard: {
    borderColor: '#e4e7ec',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  orderInformationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  orderInformationDivider: {
    borderBottomColor: '#eaecf0',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  orderInformationLabel: {
    color: '#344054',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  orderCondition: {
    backgroundColor: '#f2f4f7',
    borderRadius: 6,
    color: '#475467',
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  orderConditionCold: {
    backgroundColor: '#e8f1ff',
    color: '#0b57d0',
  },
  orderBoxes: {
    color: '#027a48',
    fontSize: 12,
    fontWeight: '800',
    minWidth: 52,
    textAlign: 'right',
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
  lunchGroup: {
    backgroundColor: '#f8fafc',
    borderColor: '#e4e7ec',
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 10,
  },
  lunchControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  timeRangeInputs: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 5,
  },
  timeRangeInput: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 6,
    textAlign: 'center',
  },
  timeRangeSeparator: {
    color: '#667085',
    fontSize: 16,
    fontWeight: '700',
  },
  accessControl: {
    width: 150,
  },
  arrivalTimeInput: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingVertical: 6,
    textAlign: 'center',
    width: 132,
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
    minHeight: 44,
    justifyContent: 'center',
  },
  segmentButtonSelected: {
    backgroundColor: '#e8f1ff',
    borderColor: '#0b57d0',
  },
  segmentButtonText: {
    color: '#667085',
    fontSize: 12,
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
