import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { ReactNode } from 'react';

import * as completionTime from '../domain/delivery/deliveryCompletionTime';

type Element = { type: unknown; props: Record<string, unknown> };
type Modal = typeof import('../ui/driver/DeliveryProofModal').DeliveryProofModal;

export function createProofModalHarness(imagePicker: Record<string, unknown> = {}) {
  const cells: unknown[] = [];
  let index = 0;
  let uuidCounter = 0;
  const module = { exports: {} };
  const jsx = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
  const dependencies: Record<string, unknown> = {
    react: {
      useState: (initial: unknown) => {
        const slot = index++;
        if (!(slot in cells)) cells[slot] = typeof initial === 'function' ? initial() : initial;
        return [cells[slot], (value: unknown) => { cells[slot] = value; }];
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': Object.fromEntries([
      ...['ActivityIndicator', 'Image', 'Modal', 'Pressable', 'Text', 'TextInput', 'View']
        .map((name) => [name, name]),
      ['Platform', { OS: 'android' }],
      ['StyleSheet', { create: (styles: unknown) => styles }],
    ]),
    'expo-image-picker': imagePicker,
    'expo-modules-core': { uuid: { v4: () => `22222222-2222-4222-8222-${String(++uuidCounter).padStart(12, '0')}` } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../../domain/delivery/deliveryCompletionTime': completionTime,
    './AppDialog': { useAppDialog: () => ({ dialog: null, showDialog: () => undefined }) },
  };
  const source = readFileSync(new URL('../ui/driver/DeliveryProofModal.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  } });
  runInNewContext(outputText, {
    module,
    exports: module.exports,
    Date,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected runtime dependency: ${name}`);
      return dependencies[name];
    },
  });
  const { DeliveryProofModal } = module.exports as { DeliveryProofModal: Modal };
  return (props: Parameters<Modal>[0]) => {
    index = 0;
    return DeliveryProofModal(props) as unknown as Element;
  };
}

function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (node === null || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

it('locks and displays the saved completion time after a partial success', () => {
  const render = createProofModalHarness();
  const props = {
    destinationName: '배송지',
    savedCompletionOccurredAt: null as string | null,
    onClose: () => undefined,
    onConfirm: async () => undefined,
  };
  const initialInput = elements(render(props)).find(({ type }) => type === 'TextInput')!;
  assert.equal(initialInput.props.editable, true);
  (initialInput.props.onChangeText as (value: string) => void)('1530');
  assert.equal(elements(render(props)).find(({ type }) => type === 'TextInput')!.props.value, '15:30');

  const savedAt = new Date(2026, 8, 10, 14, 0).toISOString();
  const savedElements = elements(render({ ...props, savedCompletionOccurredAt: savedAt }));
  const savedInput = savedElements.find(({ type }) => type === 'TextInput')!;
  const nowButton = savedElements.find(({ type, props: item }) => (
    type === 'Pressable' && elements(item.children).some(({ props: child }) => child.children === '현재 시간')
  ))!;
  assert.equal(savedInput.props.editable, false);
  assert.equal(savedInput.props.value, '14:00');
  assert.equal(nowButton.props.disabled, true);
  assert.ok(savedElements.some(({ props: item }) => item.children === '완료 시간이 저장되었습니다.'));

  const pendingElements = elements(render({ ...props, executionPending: true }));
  assert.equal(pendingElements.find(({ type }) => type === 'TextInput')!.props.editable, false);
  assert.equal(pendingElements.find(({ type, props: item }) => (
    type === 'Pressable' && elements(item.children).some(({ props: child }) => child.children === '현재 시간')
  ))!.props.disabled, true);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

it('retains the time and selected photo while notification actions render inside the native Modal', async () => {
  const permission = deferred<{ granted: boolean }>();
  const camera = deferred<{ canceled: boolean; assets: { uri: string; fileName: string; mimeType: string }[] }>();
  const requests: Parameters<Parameters<Modal>[0]['onConfirm']>[] = [];
  let cameraCalls = 0;
  let closeCalls = 0;
  const render = createProofModalHarness({
    requestCameraPermissionsAsync: () => permission.promise,
    launchCameraAsync: () => { cameraCalls += 1; return camera.promise; },
  });
  const firstOverlay = { type: 'SyntheticHold', props: { children: '현재 작업 계속' } };
  const movedOverlay = { type: 'SyntheticHold', props: { children: '알림으로 이동' } };
  const props: Parameters<Modal>[0] = {
    destinationName: '정확한 N06 배송지', savedCompletionOccurredAt: null,
    onClose: () => { closeCalls += 1; },
    onConfirm: async (...request) => { requests.push(request); },
    protectedNotificationOverlay: firstOverlay as unknown as ReactNode,
  };
  let tree = render(props);
  const input = elements(tree).find(({ type }) => type === 'TextInput')!;
  (input.props.onChangeText as (value: string) => void)('1542');
  tree = render(props);
  const source = elements(tree).find(({ props: item }) => item.label === '사진 촬영')!;
  (source.props.onPress as () => void)();
  await flush();
  assert.equal(cameraCalls, 0);
  tree = render({ ...props, protectedNotificationOverlay: movedOverlay as unknown as ReactNode });
  assert.equal(tree.type, 'Modal');
  assert.ok(elements(tree).includes(movedOverlay));
  assert.ok(elements(tree).indexOf(movedOverlay) < elements(tree).findIndex(({ type }) => type === 'TextInput'),
    'Notification actions must precede the completion sheet, so they do not cover its footer');
  assert.equal(elements(tree).find(({ type }) => type === 'TextInput')!.props.value, '15:42');
  permission.resolve({ granted: true }); await flush();
  assert.equal(cameraCalls, 1);
  tree = render(props);
  assert.ok(elements(tree).includes(firstOverlay));
  camera.resolve({ canceled: false, assets: [{ uri: 'file:///isolated-proof.jpg', fileName: 'isolated-proof.jpg', mimeType: 'image/jpeg' }] });
  await flush(); tree = render(props);
  const preview = elements(tree).find(({ type }) => type === 'Image')!;
  assert.deepEqual(JSON.parse(JSON.stringify(preview.props.source)), { uri: 'file:///isolated-proof.jpg' });
  const acceptedAt = new Date(2026, 9, 7, 15, 42).toISOString();
  const unknownProps = { ...props, submittedCompletionOccurredAt: acceptedAt };
  tree = render(unknownProps);
  assert.equal(elements(tree).find(({ type }) => type === 'TextInput')!.props.editable, false);
  assert.ok(elements(tree).some(({ props: item }) => item.children === '요청한 완료 시간을 유지합니다.'));
  assert.ok(!elements(tree).some(({ props: item }) => item.children === '완료 시간이 저장되었습니다.'));
  const cancel = elements(tree).find(({ type, props: item }) => type === 'Pressable'
    && elements(item.children).some(({ props: child }) => child.children === '취소'))!;
  assert.equal(cancel.props.disabled, true);
  (tree.props.onRequestClose as () => void)();
  assert.equal(closeCalls, 0);
  const retry = elements(tree).find(({ type, props: item }) => type === 'Pressable'
    && elements(item.children).some(({ props: child }) => child.children === '완료 확정'))!;
  (retry.props.onPress as () => void)(); await flush();
  assert.equal(requests.length, 1);
  assert.equal(requests[0]![0], acceptedAt);
  assert.match(requests[0]![1]!.idempotencyKey, /^proof-media-v1:[a-f0-9]{32}$/u);
  tree = render({ ...props, savedCompletionOccurredAt: acceptedAt, executionPending: true });
  assert.ok(elements(tree).includes(firstOverlay));
  assert.deepEqual(JSON.parse(JSON.stringify(elements(tree).find(({ type }) => type === 'Image')!.props.source)), { uri: 'file:///isolated-proof.jpg' });
  tree = render({ ...props, savedCompletionOccurredAt: acceptedAt });
  const confirm = elements(tree).find(({ type, props: item }) => type === 'Pressable'
    && elements(item.children).some(({ props: child }) => child.children === '완료 확정'))!;
  (confirm.props.onPress as () => void)(); await flush();
  assert.equal(requests.length, 2);
  assert.equal(requests[1]![0], acceptedAt);
  assert.equal(requests[1]![1]?.uri, 'file:///isolated-proof.jpg');
  assert.equal(requests[1]![1]!.idempotencyKey, requests[0]![1]!.idempotencyKey);
  assert.equal(elements(render({ ...props, savedCompletionOccurredAt: acceptedAt })).find(({ type }) => type === 'TextInput')!.props.editable, false);
});

it('keeps an existing camera preview when the Android album picker is cancelled', async () => {
  let libraryRequests = 0;
  const render = createProofModalHarness({
    requestCameraPermissionsAsync: async () => ({ granted: true }),
    launchCameraAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///camera-proof.jpg', fileName: 'proof.jpg', mimeType: 'image/jpeg' }] }),
    requestMediaLibraryPermissionsAsync: async () => { libraryRequests += 1; return { granted: true }; },
    launchImageLibraryAsync: async () => ({ canceled: true, assets: [] }),
  });
  const props: Parameters<Modal>[0] = {
    destinationName: '배송지', savedCompletionOccurredAt: null,
    onClose: () => undefined, onConfirm: async () => undefined,
  };
  let tree = render(props);
  (elements(tree).find(({ props: item }) => item.label === '사진 촬영')!.props.onPress as () => void)();
  await flush(); tree = render(props);
  (elements(tree).find(({ props: item }) => item.label === '앨범에서 선택')!.props.onPress as () => void)();
  await flush(); tree = render(props);
  assert.equal(libraryRequests, 0, 'Android uses the system photo picker without requesting broad library permission');
  assert.deepEqual(JSON.parse(JSON.stringify(elements(tree).find(({ type }) => type === 'Image')!.props.source)), { uri: 'file:///camera-proof.jpg' });
});
