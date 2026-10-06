import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

import * as completionTime from '../domain/delivery/deliveryCompletionTime';

type Element = { type: unknown; props: Record<string, unknown> };
type Modal = typeof import('../ui/driver/DeliveryProofModal').DeliveryProofModal;

function createHarness() {
  const cells: unknown[] = [];
  let index = 0;
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
    'expo-image-picker': {},
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
  const render = createHarness();
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
