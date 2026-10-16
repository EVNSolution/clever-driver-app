# Driver Android 운영 알림과 명령

## 기준과 사용 조건

- 후보 버전: `0.2.0`, 로컬 Android `versionCode 27`.
- Target: [Driver #66](https://github.com/EVNSolution/clever-driver-app/issues/66).
- 앱 change-control: [#315](https://github.com/EVNSolution/clever-change-control/issues/315).
- 앱 기준: PR65 `047d57fdb783294ba4a48e62715387842cd8f65c`. PR61·64의 완료 복구와 알림 보호를 포함한다. 원본 PR·브랜치·worktree는 보존한다.
- 서버 계약: [PR488 b3710cad](https://github.com/EVNSolution/clever-route-server/blob/b3710cad863a8c12d2a7e38a90486cc8010c5722/docs/contracts/dsv-operations-policy-20261008.md).
- `eas.json` production과 로컬 release APK 명령은 `EXPO_PUBLIC_DSV_OPERATIONAL_ENABLED=true`를 설정한다. 일반 개발 빌드는 명시적으로 켜기 전 OFF다.
- 검증은 승인된 격리 서버를 사용한다. 후보 기능 포함과 서버 운영 배포 완료는 별개다.
- 앱 플래그는 서버 GPS 실발송·지오펜싱을 활성화하지 않는다. 기존 `route_changed`, `bundle_handoff`는 유지한다.
- [Issue62](https://github.com/EVNSolution/clever-driver-app/issues/62)의 보안 차단은 유지한다. 기존 `npm audit --audit-level=moderate`를 변경하지 않는다.
- 현재 후보의 검증과 출시 검사는 [0.2.0 후보 기록](driver-policy-candidate-20261008.md)을 따른다. 이전 문서는 해당 SHA의 검증 이력이다.

## 알림과 인증 복구

FCM data는 `schemaVersion: "1"`, `kind: N01..N06`, UUID `notificationId`, UTC `expiresAt`만 포함한다. 앱은 형식과 만료를 검증한다. 지원하지 않는 payload는 안내 화면으로 처리한다. 알림 제목·본문을 배송 권한의 근거로 사용하지 않는다.

- 알림함은 계정 인증으로 서버 목록을 조회한다. `읽음`은 READ ack다.
- 알림 클릭은 인증 resolver를 호출한다. 현재 배정과 권한을 서버가 확인한다.
- N03은 배정 해제 사실만 표시한다.
- N06은 resolver의 `targetStopId`에 해당하는 배송지를 표시한다. 앱 로더는 `deliveryStopId`를 `DeliveryOrder.id`로 매핑한다. destinationId나 RoutePlanStop ID와 혼동하지 않는다.
- 취소·재배정·만료·권한 상실·완료 배송지는 상세 정보 대신 안내 화면을 표시한다.
- 클릭 ID는 로그인 전·종료 상태·재시작에서 복구한다. 미해결 클릭은 완료 처리하지 않는다.
- 화면이 목적지를 확인한 뒤 OPENED ack와 처리 완료를 저장한다. READ/OPENED는 업무 완료가 아니다.
- 로그아웃은 클릭과 native last response를 삭제한다. 계정 변경은 이전 목적지와 데이터, 진행 중 응답을 무효화한다.
- 인증 갱신은 access token을 메모리에서 교체한다. refresh token 보관은 기존 SecureStore 계약을 따른다.

알림 수신은 알림함만 갱신한다. 기존 알림의 업무 갱신과 앱 활성화의 갱신 요청은 별도로 유지한다.
순서 편집·저장, 배송 증빙, 미배송 보고와 배송지 정보 입력 중에는 업무 조회 응답과 알림 이동을 보류한다.
이미 진행 중인 조회도 보호 상태가 시작되면 화면에 적용하지 않는다.

보류 안내의 `현재 작업 계속`은 초안과 화면을 유지하며 클릭을 pending으로 남긴다.
`보류된 알림`을 누르면 이동 선택을 다시 연다.
`알림으로 이동`은 이동 의사만 기록한다. 저장·전송을 완료하거나 사용자가 현재 작업을 종료할 때까지 기다린다.
앱은 입력을 자동 폐기하거나 보고를 자동 제출하지 않는다. 미배송 입력은 재실행 복구를 위해 기기에 저장한다. 안전한 시점에 서버 resolver를 다시 호출한다.
확인한 배차와 정확한 배송지가 실제 표시된 뒤에만 OPENED와 클릭 완료를 저장한다.

N06은 EXECUTION 응답과 유효한 UUID `targetStopId`를 필수로 요구한다.
대상이 누락되거나 잘못되면 안전 안내 후 종료하며 다른 배송지나 `nextDeliveryStopId`로 대체하지 않는다.
잘못된 N06에는 OPENED를 전송하지 않는다.
Push와 API는 같은 UUID 검증 함수를 사용한다. 버전 1~5와 RFC variant만 허용한다.
nil UUID와 잘못된 version/variant는 unsupported 안내로 종료한다. 영속 재시도 명령을 만들지 않는다.

기존 `route-updates` Android 채널과 직접 FCM 토큰을 사용한다. 토큰 등록 응답의 `pushToken.id`를 capability의 `tokenId`로 전달한다. capability `installationId`는 토큰 등록 `deviceId`와 동일하다. 갱신된 토큰 등록 후 capability를 다시 등록한다. 권한 거부 시 토큰을 등록하지 않으며, 앱 활성화 시 권한 복구를 다시 확인한다.

## 읽기와 업무 명령

목록·상세·화면 진입·알림 클릭은 ROUTE_STARTED, PICKUP_COMPLETED, ROUTE_COMPLETED를 전송하지 않는다. 기존 DriverWorkspace의 두 자동 완료 보정 경로를 제거했다. 완료 복구는 사용자의 `배차 완료 복구` 입력으로 실행한다. 서버에 승인된 명령만 성공으로 표시한다.

새 executionContext 배차는 계정 토큰으로 `/api/dsv/driver/executions/:id/start`를 호출한다. 서버가 시작과 픽업을 원자적으로 승인한다. 응답 유실 시 기존 두 POST로 우회하지 않는다. 새 기능 OFF 상태의 기존 배차는 기존 시작 API를 유지한다.

미배송 보고는 `/api/dsv/driver/executions/:id/delivery-exceptions`에 자유 텍스트 `reason`을 전송한다. 앞뒤 공백을 제거한 값은 필수이며 최대 1,000자다. 줄바꿈과 탭을 제외한 제어 문자는 허용하지 않는다. 사진은 필수가 아니다. 보고는 STOP_FAILED, 주문 FAILED 또는 배송 완료를 만들지 않는다.

최초 201과 재시도 200/`duplicate: true`는 모두 “미배송 보고가 접수되었습니다”로 표시한다. `reportStatus: ACCEPTED`, `emailStatus: PREPARED`는 접수 시점 영수증이다. 메일 발송 완료를 뜻하지 않는다. 기존 영수증의 `NOT_PREPARED`도 지원한다.

전송 전 입력과 전송 중인 명령을 기기에 보존한다. 응답이 유실되면 본문을 잠그고 원래 명령을 재시도한다. 이미 저장된 구형 `reasonCode`/`explanation` 명령은 `reason`으로 변환하지 않고 같은 본문으로 재전송한다. 새로운 보고만 `reason`을 사용한다.

소형 명령은 전송 전에 저장한다. 저장 데이터에는 명령 ID·발생 시각·계정 ID·executionContextId·routeVersion·assignmentEpoch·assignmentGeneration·expectedRouteVersionId와 보고 입력만 포함한다. access token, refresh token, 사진과 GPS는 저장하지 않는다. 재시도·재시작은 같은 commandId와 occurredAt을 유지한다. 전송 전 현재 context와 모든 fence를 다시 확인한다. 계정·배정·버전 충돌은 차단 상태로 표시하고 새 배차로 변환하지 않는다. 서버 ACK를 확인한 뒤 승인 상태를 저장한다.

## 검증 경계

위치 판정, 출발 확인과 N05 예약은 서버 책임이다. 서버는 출발 5분 후부터 5분마다 반복하고 배차 업무일 정오(Asia/Seoul)에 중단한다. 앱은 횟수 제한, geofence 또는 반복 로컬 알림 타이머를 만들지 않는다.

자동 검증은 합성 payload·API 응답·영속 저장과 실제 앱 함수/화면 조회 effect를 실행한다. 합성 클릭, 실제 FCM 수신, Android native 설치/화면 증거를 별도로 기록한다. 검증 결과와 남은 차단은 `driver-operational-verification.md`에 기록한다.

알림함은 업무 알림의 열기·읽음만 제공한다. 일반 앱과 격리 앱 모두 합성 알림 예약 버튼과 검증 설명을 표시하지 않는다. 알림으로 연 배송지는 기존 배송 화면의 현재 배송지에 반영하며 별도 `알림 배송지` 확인 배너를 표시하지 않는다. 목적지 해석과 입력 보호는 유지한다.

격리 검증 adapter의 local notification은 조회한 `kind`, `id`, `expiresAt`만 production click classifier에 전달한다. 이 adapter는 격리 검증 flag, 운영 기능 flag, integration package와 loopback HTTP API가 모두 일치할 때만 허용된다. 격리 후보는 FCM token 등록과 foreground push receipt를 계속 차단한다. 합성 Android notification tap은 실제 FCM 수신 증거가 아니다. adapter 회귀 검사와 실기기 클릭 증거를 구분한다.

범위 제외: 병합, 서버 배포, 실발송 활성화, Play·Drive 게시, 운영 DB 변경, iOS, 외부 HTTPS App Links, 전체 사진 오프라인 큐.
