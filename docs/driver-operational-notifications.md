# Driver Android 운영 알림과 명령

## 기준과 사용 조건

- 통합 기준: Driver `dev` `4009a9f522372a9cf23272ba723bfbbb76d96253`.
- Target: [Driver #63](https://github.com/EVNSolution/clever-driver-app/issues/63).
- 앱 change-control: [#312](https://github.com/EVNSolution/clever-change-control/issues/312).
- 서버 [#310](https://github.com/EVNSolution/clever-change-control/issues/310)은 모바일 구현을 제외한다. #312가 앱 범위를 별도로 기록한다.
- 서버 계약: [PR483 af9b4b43](https://github.com/EVNSolution/clever-route-server/blob/af9b4b43b40a5c6c5cba7bc83587217b2bbe25ab/docs/contracts/dsv-operational-server-v1.md).
- 서버 route, DTO, provider와 명령 service를 위 SHA에서 대조했다. 서버 참조는 읽기 전용이다.
- 서버 PR483은 미병합·미배포다. 운영 서버 준비를 가정하지 않는다.
- 새 기능은 `EXPO_PUBLIC_DSV_OPERATIONAL_ENABLED=true`일 때만 사용한다. 기본값은 OFF다.
- 검증 시 `EXPO_PUBLIC_DSV_API_BASE_URL`을 승인된 격리 서버로 지정한다. 합성 응답 테스트는 운영 서버를 호출하지 않는다.
- 앱 플래그는 서버 실발송·지오펜싱을 활성화하지 않는다. 기존 `route_changed`, `bundle_handoff`는 유지한다.

## 기존 후보와 의존 관계

PR61 `a7959e5a84393d7dc57e2caa654ea2f8edad202c`은 Draft·미병합이다. PR61의 변경은 이 dev 기준에 포함되지 않는다. 기존 `cc-240-completion-flow` 작업공간은 보존한다.

겹치는 파일은 `src/app/AppRoot.tsx`, `src/ui/driver/DriverWorkspace.tsx`, `src/api/dsvDriverEvents.ts`, 관련 실행/알림 테스트, `docs/project-brief.md`, `docs/technology-stack.md`, `package.json`, `package-lock.json`이다. PR61의 완료 시간·증빙·ETA·가입 화면 변경을 이 작업에 가져오지 않는다. Expo 56의 필수 patch 정합성 및 기존 brace-expansion 및 shell-quote 보안 patch는 별도 검증하여 적용한다. 통합 시 PR61과 이 PR의 실행 명령·인증·조회 변경을 함께 리뷰해야 한다.

[Issue62](https://github.com/EVNSolution/clever-driver-app/issues/62)의 보안 차단은 유지한다. CI audit을 삭제하거나 예외 처리하지 않는다. 소스/합성 검증과 병합·배포·실기기 후보 설치 승인은 구분한다.

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
앱은 초안을 자동 폐기하거나 자동 저장하지 않는다. 안전한 시점에 서버 resolver를 다시 호출한다.
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

미배송 보고는 `/api/dsv/driver/executions/:id/delivery-exceptions`를 호출한다. 보고는 STOP_FAILED, 주문 FAILED 또는 배송 완료를 만들지 않는다. D05 운영 사유 목록은 미확정이다. UI는 `AppRoot`의 `deliveryExceptionReasons`로 주입한 목록만 사용하며 기본값은 비어 있다. 테스트의 합성 사유는 운영 정책이 아니다.

소형 명령은 전송 전에 저장한다. 저장 데이터에는 명령 ID·발생 시각·계정 ID·executionContextId·routeVersion·assignmentEpoch·assignmentGeneration·expectedRouteVersionId와 보고 입력만 포함한다. access token, refresh token, 사진과 GPS는 저장하지 않는다. 재시도·재시작은 같은 commandId와 occurredAt을 유지한다. 전송 전 현재 context와 모든 fence를 다시 확인한다. 계정·배정·버전 충돌은 차단 상태로 표시하고 새 배차로 변환하지 않는다. 서버 ACK를 확인한 뒤 승인 상태를 저장한다.

## 검증 경계

위치 판정, 출발 확인과 T+300초 N05 예약은 서버 책임이다. 앱에 geofence 또는 반복 로컬 알림 타이머가 없다. 반복 최대 6회는 운영 정책으로 사용하지 않는다.

자동 검증은 합성 payload·API 응답·영속 저장과 실제 앱 함수/화면 조회 effect를 실행한다. 합성 클릭, 실제 FCM 수신, Android native 설치/화면 증거를 별도로 기록한다. 검증 결과와 남은 차단은 `driver-operational-verification.md`에 기록한다.

범위 제외: 병합, 서버 배포, 실발송 활성화, Play·Drive 게시, 운영 DB 변경, iOS, 외부 HTTPS App Links, 전체 사진 오프라인 큐.
