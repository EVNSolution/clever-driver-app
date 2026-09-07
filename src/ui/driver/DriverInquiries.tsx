import { uuid } from 'expo-modules-core';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import {
  createDriverInquiry,
  DriverInquiryApiError,
  getDriverInquiry,
  listDriverInquiries,
  type DriverInquiry,
} from '../../api/dsvDriverInquiries';

type InquiryView =
  | { kind: 'list' }
  | { kind: 'compose' }
  | { id: string; kind: 'detail' };

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export function useDriverInquiries(accessToken: string) {
  const mountedRef = useRef(true);
  const listSequenceRef = useRef(0);
  const listAbortRef = useRef<AbortController | null>(null);
  const hasItemsRef = useRef(false);
  const loadMoreLockRef = useRef(false);
  const detailSequenceRef = useRef(0);
  const detailAbortRef = useRef<AbortController | null>(null);
  const submitAbortRef = useRef<AbortController | null>(null);
  const submitLockRef = useRef(false);
  const attemptKeyRef = useRef(uuid.v4());
  const [view, setView] = useState<InquiryView>({ kind: 'list' });
  const [items, setItems] = useState<DriverInquiry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listState, setListState] = useState<LoadState>('loading');
  const [listError, setListError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [detail, setDetail] = useState<DriverInquiry | null>(null);
  const [detailState, setDetailState] = useState<LoadState>('idle');
  const [detailError, setDetailError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hasIdempotencyConflict, setHasIdempotencyConflict] = useState(false);

  const refresh = useCallback(async () => {
    const sequence = listSequenceRef.current + 1;
    listSequenceRef.current = sequence;
    listAbortRef.current?.abort();
    loadMoreLockRef.current = false;
    const controller = new AbortController();
    listAbortRef.current = controller;
    setListError(null);
    setIsLoadingMore(false);
    setIsRefreshing(hasItemsRef.current);
    if (!hasItemsRef.current) setListState('loading');

    try {
      const page = await listDriverInquiries(accessToken, undefined, controller.signal);
      if (!mountedRef.current || controller.signal.aborted || sequence !== listSequenceRef.current) {
        return;
      }
      hasItemsRef.current = page.items.length > 0;
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setListState('ready');
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted || sequence !== listSequenceRef.current) {
        return;
      }
      setListError(inquiryErrorMessage(error, '목록'));
      setListState('error');
    } finally {
      if (mountedRef.current && sequence === listSequenceRef.current) {
        setIsRefreshing(false);
      }
      if (listAbortRef.current === controller) listAbortRef.current = null;
    }
  }, [accessToken]);

  const loadMore = useCallback(async () => {
    if (nextCursor === null || loadMoreLockRef.current || listAbortRef.current !== null) return;
    loadMoreLockRef.current = true;
    const sequence = listSequenceRef.current;
    const controller = new AbortController();
    listAbortRef.current = controller;
    setIsLoadingMore(true);
    setListError(null);
    try {
      const page = await listDriverInquiries(accessToken, nextCursor, controller.signal);
      if (!mountedRef.current || controller.signal.aborted || sequence !== listSequenceRef.current) {
        return;
      }
      setItems((current) => {
        const nextItems = [...current, ...page.items];
        hasItemsRef.current = nextItems.length > 0;
        return nextItems;
      });
      setNextCursor(page.nextCursor);
      setListState('ready');
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted || sequence !== listSequenceRef.current) {
        return;
      }
      setListError(inquiryErrorMessage(error, '목록'));
    } finally {
      if (listAbortRef.current === controller) {
        listAbortRef.current = null;
        loadMoreLockRef.current = false;
        if (mountedRef.current && sequence === listSequenceRef.current) {
          setIsLoadingMore(false);
        }
      }
    }
  }, [accessToken, nextCursor]);

  const openDetail = useCallback(async (id: string) => {
    const sequence = detailSequenceRef.current + 1;
    detailSequenceRef.current = sequence;
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    setDetail(null);
    setDetailError(null);
    setDetailState('loading');
    setView({ id, kind: 'detail' });
    try {
      const inquiry = await getDriverInquiry(accessToken, id, controller.signal);
      if (!mountedRef.current || controller.signal.aborted || sequence !== detailSequenceRef.current) {
        return;
      }
      setDetail(inquiry);
      setDetailState('ready');
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted || sequence !== detailSequenceRef.current) {
        return;
      }
      setDetailError(inquiryErrorMessage(error, '상세'));
      setDetailState('error');
    }
  }, [accessToken]);

  const submit = useCallback(async () => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (trimmedTitle.length < 1 || trimmedTitle.length > 120) {
      setSubmitError('제목은 1자 이상 120자 이하로 입력해 주세요.');
      return;
    }
    if (trimmedBody.length < 1 || trimmedBody.length > 4000) {
      setSubmitError('내용은 1자 이상 4,000자 이하로 입력해 주세요.');
      return;
    }
    if (submitLockRef.current) return;

    submitLockRef.current = true;
    submitAbortRef.current?.abort();
    const controller = new AbortController();
    submitAbortRef.current = controller;
    setIsSubmitting(true);
    setSubmitError(null);
    setHasIdempotencyConflict(false);
    try {
      const created = await createDriverInquiry(
        accessToken,
        { body: trimmedBody, title: trimmedTitle },
        attemptKeyRef.current,
        controller.signal,
      );
      if (!mountedRef.current || controller.signal.aborted) return;
      setTitle('');
      setBody('');
      attemptKeyRef.current = uuid.v4();
      void refresh();
      void openDetail(created.id);
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted) return;
      const isConflict = error instanceof DriverInquiryApiError
        && error.code === 'IDEMPOTENCY_CONFLICT';
      setHasIdempotencyConflict(isConflict);
      setSubmitError(inquiryErrorMessage(error, '작성'));
    } finally {
      if (submitAbortRef.current === controller) {
        submitLockRef.current = false;
        if (mountedRef.current && !controller.signal.aborted) setIsSubmitting(false);
      }
    }
  }, [accessToken, body, openDetail, refresh, title]);

  useEffect(() => {
    let isActive = true;
    mountedRef.current = true;
    submitLockRef.current = false;
    void Promise.resolve().then(() => {
      if (!isActive) return;
      if (submitAbortRef.current === null) setIsSubmitting(false);
      void refresh();
    });
    return () => {
      isActive = false;
      listSequenceRef.current += 1;
      detailSequenceRef.current += 1;
      listAbortRef.current?.abort();
      detailAbortRef.current?.abort();
      submitAbortRef.current?.abort();
      listAbortRef.current = null;
      detailAbortRef.current = null;
      submitAbortRef.current = null;
      loadMoreLockRef.current = false;
      submitLockRef.current = false;
    };
  }, [accessToken, refresh]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function showList() {
    detailAbortRef.current?.abort();
    detailSequenceRef.current += 1;
    setView({ kind: 'list' });
  }

  function showCompose() {
    setSubmitError(null);
    setHasIdempotencyConflict(false);
    setView({ kind: 'compose' });
  }

  function startNewAttempt() {
    attemptKeyRef.current = uuid.v4();
    setHasIdempotencyConflict(false);
    setSubmitError(null);
  }

  return {
    body,
    detail,
    detailError,
    detailState,
    hasIdempotencyConflict,
    inquiries: items,
    isLoadingMore,
    isRefreshing,
    isSubmitting,
    listError,
    listState,
    loadMore,
    nextCursor,
    openDetail,
    refresh,
    setBody,
    setTitle,
    showCompose,
    showList,
    startNewAttempt,
    submit,
    submitError,
    title,
    view,
  };
}

export function DriverInquiries({
  accessToken,
  onBack,
  requestBackRef,
}: {
  accessToken: string;
  onBack(): void;
  requestBackRef: MutableRefObject<() => void>;
}) {
  const controller = useDriverInquiries(accessToken);
  const { isSubmitting, showList, view } = controller;
  const heading = view.kind === 'compose'
    ? '문의 작성'
    : view.kind === 'detail' ? '문의 상세' : '문의사항';
  const goBack = useCallback(() => {
    if (isSubmitting) return;
    if (view.kind === 'list') {
      onBack();
      return;
    }
    showList();
  }, [isSubmitting, onBack, showList, view.kind]);
  useEffect(() => {
    requestBackRef.current = goBack;
    return () => {
      requestBackRef.current = onBack;
    };
  }, [goBack, onBack, requestBackRef]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="뒤로 가기"
          accessibilityRole="button"
          accessibilityState={{ disabled: controller.isSubmitting }}
          disabled={controller.isSubmitting}
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
        <Text style={styles.heading}>{heading}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {controller.view.kind === 'list' ? (
        <InquiryList controller={controller} />
      ) : controller.view.kind === 'compose' ? (
        <InquiryComposer controller={controller} />
      ) : (
        <InquiryDetail controller={controller} inquiryId={controller.view.id} />
      )}
    </View>
  );
}

type InquiryController = ReturnType<typeof useDriverInquiries>;

function InquiryList({ controller }: { controller: InquiryController }) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={(
        <RefreshControl
          onRefresh={() => void controller.refresh()}
          refreshing={controller.isRefreshing}
          tintColor="#0b57d0"
        />
      )}
      showsVerticalScrollIndicator={false}
    >
      <Pressable
        accessibilityRole="button"
        onPress={controller.showCompose}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
      >
        <Text style={styles.primaryButtonText}>새 문의 작성</Text>
      </Pressable>

      {controller.listState === 'loading' ? (
        <LoadingState label="문의 내역을 불러오는 중입니다." />
      ) : controller.listState === 'error' && controller.inquiries.length === 0 ? (
        <ErrorState message={controller.listError} onRetry={() => void controller.refresh()} />
      ) : controller.inquiries.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>작성한 문의가 없습니다.</Text>
          <Text style={styles.stateDescription}>필요한 내용을 문의로 남겨 주세요.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {controller.inquiries.map((inquiry) => (
            <Pressable
              accessibilityRole="button"
              key={inquiry.id}
              onPress={() => void controller.openDetail(inquiry.id)}
              style={({ pressed }) => [styles.inquiryRow, pressed && styles.pressed]}
            >
              <Text style={styles.inquiryTitle}>{inquiry.title}</Text>
              <Text style={styles.inquiryMeta}>
                {inquiry.authorName} · {formatInquiryCreatedAt(inquiry.createdAt)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {controller.listError !== null && controller.inquiries.length > 0 ? (
        <Text accessibilityLiveRegion="polite" style={styles.inlineError}>
          {controller.listError}
        </Text>
      ) : null}

      {controller.nextCursor !== null ? (
        <Pressable
          accessibilityRole="button"
          disabled={controller.isLoadingMore}
          onPress={() => void controller.loadMore()}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          {controller.isLoadingMore ? (
            <ActivityIndicator color="#0b57d0" size="small" />
          ) : (
            <Text style={styles.secondaryButtonText}>이전 문의 더 보기</Text>
          )}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function InquiryComposer({ controller }: { controller: InquiryController }) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={80}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.fieldLabel}>제목</Text>
      <TextInput
        accessibilityLabel="문의 제목"
        editable={!controller.isSubmitting}
        maxLength={120}
        multiline
        onChangeText={controller.setTitle}
        placeholder="문의 제목을 입력해 주세요"
        placeholderTextColor="#98a2b3"
        style={styles.titleInput}
        value={controller.title}
      />
      <Text style={styles.characterCount}>{controller.title.length}/120</Text>

      <Text style={styles.fieldLabel}>내용</Text>
      <TextInput
        accessibilityLabel="문의 내용"
        editable={!controller.isSubmitting}
        maxLength={4000}
        multiline
        onChangeText={controller.setBody}
        placeholder="문의 내용을 자세히 입력해 주세요"
        placeholderTextColor="#98a2b3"
        style={styles.bodyInput}
        textAlignVertical="top"
        value={controller.body}
      />
      <Text style={styles.characterCount}>{controller.body.length}/4000</Text>

      {controller.submitError === null ? null : (
        <View accessibilityLiveRegion="polite" style={styles.errorCard}>
          <Text style={styles.errorText}>{controller.submitError}</Text>
          {controller.hasIdempotencyConflict ? (
            <Pressable
              accessibilityRole="button"
              onPress={controller.startNewAttempt}
              style={({ pressed }) => [styles.conflictButton, pressed && styles.pressed]}
            >
              <Text style={styles.conflictButtonText}>현재 내용으로 새 문의 시작</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: controller.isSubmitting, disabled: controller.isSubmitting }}
        disabled={controller.isSubmitting}
        onPress={() => void controller.submit()}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
      >
        {controller.isSubmitting ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>문의 등록</Text>
        )}
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

function InquiryDetail({
  controller,
  inquiryId,
}: {
  controller: InquiryController;
  inquiryId: string;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {controller.detailState === 'loading' ? (
        <LoadingState label="문의 내용을 불러오는 중입니다." />
      ) : controller.detailState === 'error' || controller.detail === null ? (
        <ErrorState
          message={controller.detailError}
          onRetry={() => void controller.openDetail(inquiryId)}
        />
      ) : (
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>{controller.detail.title}</Text>
          <View style={styles.detailMeta}>
            <Text style={styles.detailAuthor}>{controller.detail.authorName}</Text>
            <Text style={styles.detailTime}>
              {formatInquiryCreatedAt(controller.detail.createdAt)}
            </Text>
          </View>
          <Text style={styles.detailBody}>{controller.detail.body}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <View style={styles.stateCard}>
      <ActivityIndicator color="#0b57d0" size="small" />
      <Text style={styles.stateDescription}>{label}</Text>
    </View>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry(): void;
}) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.stateCard}>
      <Text style={styles.errorText}>{message ?? '문의 정보를 불러오지 못했습니다.'}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
      >
        <Text style={styles.secondaryButtonText}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

function inquiryErrorMessage(error: unknown, action: '목록' | '상세' | '작성'): string {
  if (!(error instanceof DriverInquiryApiError)) {
    return action === '작성'
      ? '문의를 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      : '문의 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
  switch (error.code) {
    case 'UNAUTHORIZED':
      return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
    case 'BAD_REQUEST':
    case 'INVALID_JSON':
      return '입력한 문의 내용을 확인해 주세요.';
    case 'NOT_FOUND':
      return '해당 문의를 찾을 수 없습니다.';
    case 'IDEMPOTENCY_CONFLICT':
      return '이 작성 시도는 다른 내용으로 이미 사용되었습니다. 아래 버튼으로 새 문의를 시작해 주세요.';
    case 'PAYLOAD_TOO_LARGE':
      return '문의 내용이 너무 깁니다. 제목과 내용을 줄여 주세요.';
    case 'RATE_LIMITED':
      return '문의 요청이 많습니다. 잠시 후 다시 시도해 주세요.';
    case 'INTERNAL_SERVER_ERROR':
      return '문의 서버에 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    default:
      return action === '작성'
        ? '문의를 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        : '문의 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
}

function formatInquiryCreatedAt(createdAt: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(createdAt));
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', minHeight: 52 },
  backButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  backButtonText: { color: '#344054', fontSize: 34, lineHeight: 38 },
  heading: { color: '#101828', flex: 1, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  headerSpacer: { width: 44 },
  content: { gap: 14, paddingBottom: 24, paddingTop: 12 },
  primaryButton: { alignItems: 'center', backgroundColor: '#0b57d0', borderRadius: 12, justifyContent: 'center', minHeight: 50, paddingHorizontal: 16, paddingVertical: 12 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  secondaryButton: { alignItems: 'center', backgroundColor: '#eef4ff', borderColor: '#b2ccff', borderRadius: 12, borderWidth: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryButtonText: { color: '#1849a9', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  list: { borderColor: '#e4e7ec', borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  inquiryRow: { backgroundColor: '#ffffff', borderBottomColor: '#eaecf0', borderBottomWidth: 1, gap: 7, minHeight: 76, padding: 14 },
  inquiryTitle: { color: '#101828', flexShrink: 1, fontSize: 16, fontWeight: '900' },
  inquiryMeta: { color: '#667085', flexShrink: 1, fontSize: 12, fontWeight: '600' },
  stateCard: { alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 14, gap: 10, justifyContent: 'center', minHeight: 150, padding: 24 },
  stateTitle: { color: '#101828', flexShrink: 1, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  stateDescription: { color: '#667085', flexShrink: 1, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  inlineError: { color: '#b42318', flexShrink: 1, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  fieldLabel: { color: '#344054', fontSize: 14, fontWeight: '900' },
  titleInput: { backgroundColor: '#ffffff', borderColor: '#d0d5dd', borderRadius: 12, borderWidth: 1, color: '#101828', fontSize: 16, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12 },
  bodyInput: { backgroundColor: '#ffffff', borderColor: '#d0d5dd', borderRadius: 12, borderWidth: 1, color: '#101828', fontSize: 16, minHeight: 220, padding: 14 },
  characterCount: { color: '#667085', fontSize: 11, textAlign: 'right' },
  errorCard: { backgroundColor: '#fff5f4', borderColor: '#fecdca', borderRadius: 12, borderWidth: 1, gap: 10, padding: 12 },
  errorText: { color: '#b42318', flexShrink: 1, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  conflictButton: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#f97066', borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 44, padding: 10 },
  conflictButtonText: { color: '#b42318', flexShrink: 1, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  detailCard: { backgroundColor: '#ffffff', borderColor: '#e4e7ec', borderRadius: 16, borderWidth: 1, gap: 16, padding: 16 },
  detailTitle: { color: '#101828', flexShrink: 1, fontSize: 20, fontWeight: '900' },
  detailMeta: { gap: 5 },
  detailAuthor: { color: '#344054', flexShrink: 1, fontSize: 14, fontWeight: '800' },
  detailTime: { color: '#667085', flexShrink: 1, fontSize: 12, fontWeight: '600' },
  detailBody: { color: '#344054', flexShrink: 1, fontSize: 16, lineHeight: 25 },
  pressed: { opacity: 0.78 },
});
