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

  it('returns through child screens and requires two back presses to exit from root tabs', () => {
    const workspace = readFileSync(
      join(appDirectory, '../ui/driver/DriverWorkspace.tsx'),
      'utf8',
    );
    const deliveryScreen = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryScreen.tsx'),
      'utf8',
    );
    const appConfig = readFileSync(join(projectRoot, 'app.json'), 'utf8');

    assert.match(
      workspace,
      /BackHandler\.addEventListener\([\s\S]*?'hardwareBackPress'/u,
    );
    assert.match(workspace, /BackHandler\.exitApp\(\)/u);
    assert.match(workspace, /ToastAndroid\.show/u);
    assert.match(workspace, /앱을 종료하려면 뒤로가기를 한 번 더 누르세요\./u);
    assert.match(workspace, /isDeliverySpaceOpen/u);
    assert.match(workspace, /isSequenceEditing/u);
    assert.match(workspace, /backSubscription\.remove\(\)/u);
    assert.match(deliveryScreen, /isEditing: boolean/u);
    assert.match(deliveryScreen, /onEditingChange\(isEditing: boolean\): void/u);
    assert.match(appConfig, /"predictiveBackGestureEnabled": true/u);
  });

  it('selects delivery dates from server route choices', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DriverWorkspace.tsx'),
      'utf8',
    );
    const deliveryScreen = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryScreen.tsx'),
      'utf8',
    );
    const routeClient = readFileSync(
      join(appDirectory, '../api/dsvDriverRoute.ts'),
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
    assert.doesNotMatch(routeClient, /등록된 차량이 있어야/u);
    assert.match(deliveryScreen, /이 배차에 배정된 배송이 없습니다/u);
    assert.match(deliveryScreen, /주문 목록에서 공용 배송을 확인할 수 있습니다/u);
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

    assert.match(source, /const \[isExpanded, setIsExpanded\] = useState\(isCurrent\)/u);
    assert.match(source, /accessibilityState=\{\{ expanded: isExpanded \}\}/u);
    assert.match(source, /group\.orders\.map/u);
    assert.match(source, /주문 \{orderIndex \+ 1\}/u);
    assert.match(source, /order\.conditionCode/u);
    assert.match(source, /order\.shippedBoxes/u);
  });

  it('shows driver messages and pending time changes inside the existing order details', () => {
    const deliveryScreen = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryScreen.tsx'),
      'utf8',
    );
    const workspace = readFileSync(
      join(appDirectory, '../ui/driver/DriverWorkspace.tsx'),
      'utf8',
    );

    assert.match(deliveryScreen, /배송원 메모/u);
    assert.match(deliveryScreen, /시간 변경 확인/u);
    assert.match(deliveryScreen, /onReadDriverMessage/u);
    assert.match(deliveryScreen, /onAcknowledgeTimeConstraint/u);
    assert.match(workspace, /markDriverOrderMessageRead/u);
    assert.match(workspace, /acknowledgeDriverTimeConstraint/u);
  });

  it('mutes completed delivery groups and opens the active destination', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryScreen.tsx'),
      'utf8',
    );
    const workspace = readFileSync(
      join(appDirectory, '../ui/driver/DriverWorkspace.tsx'),
      'utf8',
    );

    assert.match(source, /resolveDeliveryDestinationProgressState/u);
    assert.match(source, /styles\.destinationGroupCompleted/u);
    assert.match(source, /styles\.destinationGroupEmphasis/u);
    assert.match(
      source,
      /!isLast && !isCompleted && !isCurrent && styles\.orderRowDivider/u,
    );
    assert.match(source, /styles\.destinationGroupCurrent/u);
    assert.match(source, /styles\.currentDeliveryBadge/u);
    assert.match(source, /highlighted=\{isCurrent\}/u);
    assert.match(source, /styles\.conditionBadgeHighlighted/u);
    assert.match(source, /styles\.conditionBadgeColdHighlighted/u);
    assert.match(source, />배송 중</u);
    assert.match(source, /key=\{`\$\{group\.key\}:\$\{progressState\}`\}/u);
    assert.match(workspace, /nextDeliveryStopId=\{route\.nextDeliveryStopId\}/u);
    assert.match(source, /destinationGroupEmphasis:[\s\S]*paddingHorizontal: 9/u);
    assert.match(source, /completedPrimaryText:[\s\S]*color: '#475467'/u);
    assert.match(source, /paddingBottom: 88/u);
    assert.match(source, /scrollTo\(\{[\s\S]*destinationTop/u);
  });

  it('uses matching action-button geometry, typography, and visual summary separators', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryScreen.tsx'),
      'utf8',
    );

    assert.equal(source.match(/styles\.headerActionButton/gu)?.length, 2);
    assert.equal(source.match(/styles\.headerActionText/gu)?.length, 2);
    assert.match(source, /headerActionText:[\s\S]*fontSize: 13,[\s\S]*fontWeight: '800'/u);
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
    assert.match(source, /LocationManager\.requestPermissions\(\)/u);
    assert.match(source, /<UserLocation/u);
    assert.match(source, /animated/u);
    assert.match(source, /accuracy/u);
    assert.match(source, /heading/u);
    assert.match(source, /minDisplacement=\{5\}/u);
    assert.match(source, /canExplore && locationPermission === 'granted'/u);
    assert.match(source, /내 위치 권한 허용/u);
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
    assert.match(screenSource, /주문 정보/u);
    assert.match(screenSource, /summary\.orderBoxes/u);
    assert.match(screenSource, /summary\.destinationSequence/u);
    assert.match(screenSource, /<ScrollView/u);
    assert.match(screenSource, /styles\.actionFooter/u);
    assert.match(screenSource, /ETA/u);
    assert.match(screenSource, /배송 완료/u);
    assert.match(screenSource, /etaStatus === 'PRE_PICKUP'/u);
    assert.match(screenSource, /배송 시작/u);
    assert.match(screenSource, /픽업을 완료하고 배송을 시작할까요/u);
    assert.match(screenSource, /onStartDelivery/u);
    assert.match(screenSource, /styles\.startOverlay/u);
    assert.match(screenSource, /styles\.startButton/u);
    assert.match(screenSource, /summary\.address/u);
    assert.match(screenSource, /지도 열기/u);
    assert.match(screenSource, /openDestinationMap/u);
    assert.doesNotMatch(screenSource, /canCompleteDelivery/u);
    const destinationMapSource = readFileSync(
      join(appDirectory, '../platform/destinationMap.ts'),
      'utf8',
    );
    assert.match(destinationMapSource, /Clipboard\.setStringAsync\(address\)/u);
    assert.match(destinationMapSource, /requireNativeModule<AndroidMapChooser>\('MapChooser'\)/u);
    const androidChooserSource = readFileSync(
      join(
        projectRoot,
        'modules/map-chooser/android/src/main/java/com/evnsolution/clever/driver/mapchooser/MapChooserModule.kt',
      ),
      'utf8',
    );
    assert.match(androidChooserSource, /Intent\.createChooser/u);
    assert.match(androidChooserSource, /Intent\.ACTION_VIEW/u);
    assert.match(androidChooserSource, /geo:0,0\?q=/u);
    assert.match(screenSource, /시간 지정/u);
    assert.match(screenSource, /출발 전/u);
    assert.match(
      readFileSync(join(appDirectory, '../ui/driver/DriverWorkspace.tsx'), 'utf8'),
      /startDriverDeliveryRoute/u,
    );
    assert.doesNotMatch(screenSource, /배송지 순서 미리보기|서버가 생성한 경로|서버 경로 표시 중/u);
    assert.match(
      source,
      /https:\/\/tiles\.openfreemap\.org\/styles\/liberty/u,
    );
    assert.match(appConfig, /@maplibre\/maplibre-react-native/u);
    assert.match(appConfig, /NSLocationWhenInUseUsageDescription/u);
    assert.match(appConfig, /현재 위치를 표시/u);
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

    assert.match(source, /buildDeliveryRouteVisualState/u);
    assert.match(source, /data=\{mapModel\.upcomingGeometry\}/u);
    assert.doesNotMatch(screenSource, /서버 경로/u);
    assert.doesNotMatch(
      source,
      /geometry: \{ type: 'LineString', coordinates \}/u,
    );
  });

  it('uses the Demo progress colors for server route slices and markers', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryRouteMap.tsx'),
      'utf8',
    );
    const screenSource = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryMapScreen.tsx'),
      'utf8',
    );

    assert.match(source, /id="delivery-completed-route-line"/u);
    assert.match(source, /id="delivery-current-route-line"/u);
    assert.match(source, /const COMPLETED_MAP_COLOR = '#98a2b3'/u);
    assert.match(source, /'line-color': COMPLETED_MAP_COLOR/u);
    assert.match(source, /'line-opacity': 0\.72/u);
    assert.match(source, /'line-color': '#12b76a'/u);
    assert.match(source, /'line-color': '#0b57d0'/u);
    assert.match(source, /\['get', 'markerState'\]/u);
    assert.match(screenSource, /currentDeliveryStopId=\{nextDeliveryStopId\}/u);
  });

  it('offers camera and album proof upload after delivery completion', () => {
    const mapScreen = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryMapScreen.tsx'),
      'utf8',
    );
    const proofModal = readFileSync(
      join(appDirectory, '../ui/driver/DeliveryProofModal.tsx'),
      'utf8',
    );
    const workspace = readFileSync(
      join(appDirectory, '../ui/driver/DriverWorkspace.tsx'),
      'utf8',
    );

    assert.match(mapScreen, /DeliveryProofModal/u);
    assert.match(mapScreen, /setProofDelivery/u);
    assert.match(
      mapScreen,
      /onCompleteDelivery\(summary\.destinationId, summary\.deliveryStopIds\)/u,
    );
    assert.match(mapScreen, /주문 \$\{summary\.deliveryStopIds\.length\}건을 모두/u);
    assert.match(workspace, /completeDriverDeliveryDestination/u);
    assert.match(proofModal, /배송 증빙 추가/u);
    assert.match(proofModal, /사진 촬영/u);
    assert.match(proofModal, /앨범에서 선택/u);
    assert.match(proofModal, /requestCameraPermissionsAsync/u);
    assert.match(proofModal, /launchCameraAsync/u);
    assert.match(proofModal, /launchImageLibraryAsync/u);
    assert.match(proofModal, /<Image/u);
    assert.match(proofModal, /10 \* 1024 \* 1024/u);
    assert.match(workspace, /uploadDriverProofPhoto/u);
    const proofClient = readFileSync(
      join(appDirectory, '../api/dsvDriverProofMedia.ts'),
      'utf8',
    );
    assert.match(proofClient, /import\('expo\/fetch'\)/u);
    assert.match(proofClient, /import\('expo-file-system'\)/u);
    assert.match(proofClient, /new File\(uri\)/u);
    assert.doesNotMatch(proofClient, /as unknown as Blob/u);
  });

  it('opens permission settings to the left of logout', () => {
    const workspace = readFileSync(
      join(appDirectory, '../ui/driver/DriverWorkspace.tsx'),
      'utf8',
    );
    const settings = readFileSync(
      join(appDirectory, '../ui/driver/DriverSettingsModal.tsx'),
      'utf8',
    );

    assert.match(workspace, /DriverSettingsModal/u);
    assert.match(workspace, /accessibilityLabel="환경설정"/u);
    assert.ok(
      workspace.indexOf('accessibilityLabel="환경설정"')
        < workspace.indexOf('<Text style={styles.logoutButtonText}>로그아웃</Text>'),
    );
    assert.match(settings, /앱 권한/u);
    assert.match(settings, /위치/u);
    assert.match(settings, /카메라/u);
    assert.match(settings, /사진 앨범/u);
    assert.match(settings, /PermissionsAndroid\.check/u);
    assert.match(settings, /LocationManager\.requestPermissions/u);
    assert.match(settings, /getCameraPermissionsAsync/u);
    assert.match(settings, /getMediaLibraryPermissionsAsync/u);
    assert.match(settings, /Linking\.openSettings/u);
    assert.match(settings, /업데이트 확인/u);
    assert.match(settings, /최신 버전/u);
    assert.match(settings, /기기 버전/u);
    assert.doesNotMatch(settings, /formatVersion/u);
    assert.doesNotMatch(settings, /\(\$\{versionCode\}\)/u);
    assert.match(settings, /fetchDriverAndroidAppRelease/u);
    assert.match(settings, /readInstalledDriverAppVersion/u);
  });

  it('uses the CLEVER dialog instead of Android alert dialogs', () => {
    const dialog = readFileSync(
      join(appDirectory, '../ui/driver/AppDialog.tsx'),
      'utf8',
    );
    const dialogOwners = [
      'DeliveryScreen.tsx',
      'DeliveryMapScreen.tsx',
      'DeliveryProofModal.tsx',
      'DeliverySpaceScreen.tsx',
      'DriverSettingsModal.tsx',
    ].map((fileName) => readFileSync(
      join(appDirectory, `../ui/driver/${fileName}`),
      'utf8',
    ));

    assert.match(dialog, /rgba\(15, 23, 42, 0\.56\)/u);
    assert.match(dialog, /borderRadius: 24/u);
    assert.match(dialog, /#0b57d0/u);
    assert.match(dialog, /accessibilityViewIsModal/u);
    for (const owner of dialogOwners) {
      assert.match(owner, /useAppDialog/u);
      assert.doesNotMatch(owner, /Alert\.alert/u);
    }
  });
});
