import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(appDirectory, '../..');

describe('authenticated driver screens', () => {
  it('offers only the delivery and map workspaces', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DriverWorkspace.tsx'),
      'utf8',
    );

    assert.match(source, /type DriverWorkspaceTab = 'delivery' \| 'map'/u);
    assert.match(source, /label="배송"/u);
    assert.match(source, /label="지도"/u);
    assert.match(source, /loadDriverDeliveryRoute/u);
    assert.match(source, /DeliveryPackageIcon/u);
    assert.match(source, /SymbolView/u);
    assert.match(source, /inventory_2/u);
    assert.match(source, /shippingbox\.fill/u);
    assert.doesNotMatch(source, /PREVIEW_DELIVERY_ORDERS/u);
    assert.doesNotMatch(source, /label="배송 순서"/u);
  });

  it('selects delivery dates from server route choices', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DriverWorkspace.tsx'),
      'utf8',
    );

    assert.match(source, /RouteDateSelector/u);
    assert.match(source, /availableRoutes/u);
    assert.match(source, /selectedRoutePlanId/u);
    assert.match(source, /routePlanId/u);
    assert.match(source, /const \[isExpanded, setIsExpanded\] = useState\(false\)/u);
    assert.match(source, /accessibilityState=\{\{ expanded: isExpanded \}\}/u);
    assert.match(source, /setIsExpanded\(false\)/u);
    assert.match(source, /styles\.dateAccordionList/u);
    assert.doesNotMatch(source, /\n\s*horizontal\n/u);
    assert.doesNotMatch(source, /routes\.length < 2/u);
    assert.doesNotMatch(source, /2026-07-31.*배송 선택/u);
  });

  it('opens one delivery Space page for whole-destination release and first-claim pickup', () => {
    const workspace = readFileSync(
      join(appDirectory, '../ui/driver/DriverWorkspace.tsx'),
      'utf8',
    );
    const screen = readFileSync(
      join(appDirectory, '../ui/driver/DeliverySpaceScreen.tsx'),
      'utf8',
    );
    const client = readFileSync(
      join(appDirectory, '../api/dsvDriverDeliverySpace.ts'),
      'utf8',
    );

    assert.match(workspace, /DeliverySpaceScreen/u);
    assert.match(screen, /label="내 배송"/u);
    assert.match(screen, /label="공용 배송"/u);
    assert.match(screen, /배송지의 모든 주문이 공용 배송으로 이동/u);
    assert.match(screen, /다른 배송원이 먼저 가져갔습니다/u);
    assert.match(client, /destinationId/u);
    assert.match(client, /expectedVersion/u);
    assert.match(client, /\/driver\/delivery-space/u);
    assert.doesNotMatch(screen, /sellerOrderKey|orderId/u);
  });

  it('shows only index, destination, address, condition, and boxes in order rows', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryScreen.tsx'),
      'utf8',
    );

    assert.match(source, /순서 편집/u);
    assert.match(source, /\{index \+ 1\}/u);
    assert.match(source, /order\.destinationName/u);
    assert.match(source, /order\.address/u);
    assert.match(source, /order\.conditionCode/u);
    assert.match(source, /order\.shippedBoxes/u);
    assert.doesNotMatch(source, /order\.sellerOrderKey/u);
    assert.doesNotMatch(source, /order\.customerCode/u);
    assert.doesNotMatch(source, /order\.notes/u);
    assert.doesNotMatch(source, /↑ 위로 이동|↓ 아래로 이동/u);
  });

  it('expands a destination card to distinguish each order condition and box count', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryScreen.tsx'),
      'utf8',
    );

    assert.match(source, /const \[isExpanded, setIsExpanded\] = useState\(false\)/u);
    assert.match(source, /accessibilityState=\{\{ expanded: isExpanded \}\}/u);
    assert.match(source, /group\.orders\.map/u);
    assert.match(source, /주문 \{orderIndex \+ 1\}/u);
    assert.match(source, /order\.conditionCode/u);
    assert.match(source, /order\.shippedBoxes/u);
  });

  it('uses matching action-button geometry and visual summary separators', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryScreen.tsx'),
      'utf8',
    );

    assert.equal(source.match(/styles\.headerActionButton/gu)?.length, 2);
    assert.match(source, /styles\.summaryItems/u);
    assert.match(source, /styles\.summaryDivider/u);
    assert.doesNotMatch(source, /주문 \{orders\.length\}건 · 배송지/u);
  });

  it('reorders individual seller orders from a left drag handle', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryScreen.tsx'),
      'utf8',
    );

    assert.match(source, /Gesture\.Pan\(\)/u);
    assert.match(source, /<GestureDetector gesture=\{dragGesture\}>/u);
    assert.match(source, /accessibilityLabel=.*순서 이동 핸들/u);
    assert.match(source, /styles\.dragHandle/u);
    assert.match(source, /onDrop/u);
    assert.match(source, /order\.destinationName/u);
    assert.doesNotMatch(source, /destination\.orders\.length/u);
  });

  it('reorders and animates neighboring rows while the handle remains held', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryScreen.tsx'),
      'utf8',
    );
    const onUpdateSource = source.match(
      /\.onUpdate\(\(event\) => \{(?<body>[\s\S]*?)\n\s*\}\)\n\s*\.onEnd/u,
    )?.groups?.body;

    assert.ok(onUpdateSource);
    assert.match(source, /useSharedValue/u);
    assert.match(source, /useAnimatedStyle/u);
    assert.match(source, /moveDeliveryOrderPosition/u);
    assert.match(source, /resolveDeliveryOrderDragTarget/u);
    assert.match(source, /scheduleOnRN\(onDrop/u);
    assert.match(source, /withTiming/u);
    assert.match(source, /\{initialIndex \+ 1\}/u);
    assert.doesNotMatch(source, /styles\.editorOrderKey/u);
    assert.doesNotMatch(source, /PanResponder/u);
    assert.doesNotMatch(onUpdateSource, /setDraftOrders|scheduleOnRN/u);
    assert.doesNotMatch(source, /useNativeDriver: false/u);
    assert.match(source, /const EDITOR_ORDER_ROW_HEIGHT = 72/u);
    assert.doesNotMatch(source, /const EDITOR_ORDER_ROW_HEIGHT = 88/u);
  });

  it('installs the native gesture root at the app boundary', () => {
    const source = readFileSync(join(appDirectory, 'AppRoot.tsx'), 'utf8');

    assert.match(source, /GestureHandlerRootView/u);
    assert.match(source, /style=\{styles\.root\}/u);
  });

  it('keeps a full-width pan-only map fixed above the scrolling editor list', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryScreen.tsx'),
      'utf8',
    );

    assert.match(source, /<DeliveryRouteMap/u);
    assert.match(source, /interactionMode="pan-only"/u);
    assert.match(source, /style=\{styles\.editorMap\}/u);
    assert.match(source, /<ScrollView/u);
    assert.match(source, /style=\{styles\.editorListScroll\}/u);
  });

  it('uses the Routes MapLibre package and map style', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryRouteMap.tsx'),
      'utf8',
    );
    const appConfig = readFileSync(join(projectRoot, 'app.json'), 'utf8');
    const packageManifest = readFileSync(
      join(projectRoot, 'package.json'),
      'utf8',
    );

    assert.match(source, /@maplibre\/maplibre-react-native/u);
    assert.match(source, /onDidFinishLoadingStyle/u);
    assert.match(source, /const canExplore = interactionMode === 'explore'/u);
    assert.match(source, /dragPan/u);
    assert.match(source, /touchZoom=\{canExplore\}/u);
    assert.match(source, /touchPitch=\{false\}/u);
    assert.match(source, /touchRotate=\{false\}/u);
    assert.match(source, /<Images/u);
    assert.match(source, /'icon-anchor': 'bottom'/u);
    assert.match(source, /'text-offset': \[0, -2\]/u);
    assert.match(source, /'text-font': \['Noto Sans Bold'\]/u);
    assert.match(source, /id="delivery-destination-marker"/u);
    assert.match(source, /id="delivery-depot-marker"/u);
    assert.match(source, /'icon-size': 0\.65/u);
    assert.match(source, /'symbol-sort-key': 5000/u);
    assert.doesNotMatch(source, /'text-field': '출발'/u);
    assert.match(source, /depotCoordinate/u);
    assert.doesNotMatch(source, /CircleLayerSpecification|delivery-marker-circle/u);
    const screenSource = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryMapScreen.tsx'),
      'utf8',
    );
    assert.match(screenSource, /지금 가는 배송지/u);
    assert.match(screenSource, /주문 수/u);
    assert.match(screenSource, /박스 수/u);
    assert.match(screenSource, /ETA/u);
    assert.match(screenSource, /배송 완료/u);
    assert.doesNotMatch(screenSource, /배송지 순서 미리보기|서버가 생성한 경로|서버 경로 표시 중/u);
    assert.match(
      source,
      /https:\/\/tiles\.openfreemap\.org\/styles\/liberty/u,
    );
    assert.match(appConfig, /@maplibre\/maplibre-react-native/u);
    assert.match(packageManifest, /@maplibre\/maplibre-react-native/u);
  });

  it('renders only server-provided route geometry without inventing a line', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryRouteMap.tsx'),
      'utf8',
    );
    const screenSource = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryMapScreen.tsx'),
      'utf8',
    );

    assert.match(source, /serverRouteGeometry !== null/u);
    assert.match(source, /data=\{serverRouteGeometry\}/u);
    assert.doesNotMatch(screenSource, /서버 경로/u);
    assert.doesNotMatch(
      source,
      /geometry: \{ type: 'LineString', coordinates \}/u,
    );
  });
});
