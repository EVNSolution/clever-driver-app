import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  DriverDestinationNoteField,
  DriverDestinationVisit,
  DriverDestinationVisitPage,
} from '../../api/dsvDriverRoute';
import { formatDeliveryCompletionTime } from '../../domain/delivery/deliveryCompletionTime';

const NOTE_LABELS: [DriverDestinationNoteField, string][] = [
  ['memo', '메모'],
  ['openTime', '오픈 시간'],
  ['lunchTimeRange', '점심 시간'],
  ['lunchEntryStatus', '점심 출입'],
  ['requiredArrivalTime', '도착 요구 시간'],
];

/** The driver's own past visits to one destination, newest first, with the notes as they were on each visit. */
export function DestinationVisitHistory({
  destinationName,
  onClose,
  onLoad,
}: {
  destinationName: string;
  onClose(): void;
  onLoad(cursor: string | null): Promise<DriverDestinationVisitPage>;
}) {
  const insets = useSafeAreaInsets();
  const [visits, setVisits] = useState<DriverDestinationVisit[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    let isActive = true;
    onLoad(null)
      .then((page) => {
        if (!isActive) return;
        setVisits(page.visits);
        setNextCursor(page.nextCursor);
        setState('ready');
      })
      .catch(() => {
        if (isActive) setState('error');
      });
    return () => {
      isActive = false;
    };
    // Loads once per opened destination; the parent remounts this view for another destination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMore() {
    if (nextCursor === null || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await onLoad(nextCursor);
      setVisits((current) => [...current, ...page.visits]);
      setNextCursor(page.nextCursor);
    } catch {
      setState('error');
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="방문 이력 닫기" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + 12, 24) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>방문 이력</Text>
              <Text numberOfLines={1} style={styles.destinationName}>{destinationName}</Text>
              <Text style={styles.subtitle}>내가 방문한 기록 · 최신순</Text>
            </View>
            <Pressable
              accessibilityLabel="방문 이력 닫기"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {state === 'loading' ? <Text style={styles.stateText}>방문 이력을 불러오는 중입니다.</Text> : null}
            {state === 'error' && visits.length === 0
              ? <Text style={styles.stateText}>방문 이력을 불러오지 못했습니다.</Text>
              : null}
            {state === 'ready' && visits.length === 0
              ? <Text style={styles.stateText}>아직 방문한 기록이 없습니다.</Text>
              : null}
            {visits.map((visit) => <VisitCard key={visit.routePlanId} visit={visit} />)}
            {nextCursor === null ? null : (
              <Pressable
                accessibilityRole="button"
                disabled={isLoadingMore}
                onPress={() => void loadMore()}
                style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
              >
                <Text style={styles.moreButtonText}>{isLoadingMore ? '불러오는 중' : '더 보기'}</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function VisitCard({ visit }: { visit: DriverDestinationVisit }) {
  const time = visit.visitedAt === null ? null : formatDeliveryCompletionTime(new Date(visit.visitedAt));
  const outcome = visit.outcome === 'FAILED'
    ? '미배송'
    : `${visit.outcome === 'PARTIAL' ? '일부 완료' : '완료'}${time === null ? '' : ` ${time}`}`;
  const notes = NOTE_LABELS.flatMap(([field, label]) => {
    const value = visit.notes[field];
    if (value === null) return [];
    return [{ changed: visit.changedFields.includes(field), field, label, value: formatNoteValue(field, value) }];
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardDate}>{visit.deliveryDate} · {visit.routeName}</Text>
        <Text style={[styles.outcome, visit.outcome === 'FAILED' && styles.outcomeFailed]}>{outcome}</Text>
      </View>
      <Text style={styles.cardCounts}>주문 {visit.orderCount}건 · {visit.boxCount}박스</Text>
      {notes.length === 0 ? <Text style={styles.noteEmpty}>당시 배송지 메모 없음</Text> : notes.map((note) => (
        <View key={note.field} style={styles.noteRow}>
          <Text style={styles.noteLabel}>{note.label}</Text>
          <Text style={styles.noteValue}>{note.value}</Text>
          {note.changed ? <Text style={styles.changedBadge}>이번 방문에 변경</Text> : null}
        </View>
      ))}
      {visit.orderNotes.map((note) => (
        <Text key={note} style={styles.orderNote}>주문 메모 · {note}</Text>
      ))}
    </View>
  );
}

function formatNoteValue(field: DriverDestinationNoteField, value: string): string {
  if (field !== 'lunchEntryStatus') return value;
  return value === 'AVAILABLE' ? '출입 가능' : value === 'UNAVAILABLE' ? '출입 불가' : value;
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
  subtitle: {
    color: '#667085',
    fontSize: 12,
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
  pressed: {
    opacity: 0.7,
  },
  list: {
    gap: 10,
    paddingBottom: 8,
    paddingTop: 14,
  },
  stateText: {
    color: '#667085',
    fontSize: 13,
    paddingVertical: 24,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    gap: 5,
    padding: 14,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardDate: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '800',
  },
  outcome: {
    color: '#027a48',
    fontSize: 13,
    fontWeight: '800',
  },
  outcomeFailed: {
    color: '#b42318',
  },
  cardCounts: {
    color: '#475467',
    fontSize: 12,
    fontWeight: '700',
  },
  noteRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  noteLabel: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
    width: 84,
  },
  noteValue: {
    color: '#1d2939',
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    minWidth: 120,
  },
  changedBadge: {
    backgroundColor: '#eff4ff',
    borderRadius: 6,
    color: '#0b57d0',
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  noteEmpty: {
    color: '#98a2b3',
    fontSize: 12,
  },
  orderNote: {
    color: '#9a3412',
    fontSize: 12,
    fontWeight: '700',
  },
  moreButton: {
    alignItems: 'center',
    backgroundColor: '#eff4ff',
    borderRadius: 12,
    paddingVertical: 13,
  },
  moreButtonText: {
    color: '#0b57d0',
    fontSize: 14,
    fontWeight: '800',
  },
});
