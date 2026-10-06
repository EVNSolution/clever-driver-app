# Driver Android 운영 알림 검증

검증일: 2026-10-07, Asia/Seoul.
Target: Driver #63. 앱 change-control: #312. 기준 계약: 서버 PR483 `af9b4b43b40a5c6c5cba7bc83587217b2bbe25ab`.

## 기준과 보존

- 원격 dev는 `4009a9f522372a9cf23272ba723bfbbb76d96253`으로 재확인했다.
- 초기 core는 clean dev였다. 구현은 dev 기반 GitHub Development linked branch `cc-312-driver-operational`과 별도 managed worktree에서 수행했다.
- PR61은 Draft·미병합, SHA `a7959e5a84393d7dc57e2caa654ea2f8edad202c`이다. 기존 worktree와 변경을 보존했다.
- 서버 #310은 모바일 구현을 제외한다. 앱 #312는 서버 계약을 참조하는 별도 승인 범위다.
- 최종 소스 SHA와 PR 링크, 해당 SHA의 빌드·CI 로그는 PR 완료 기록에 남긴다.

## 검사 결과

| 검사 | 결과 |
|---|---|
| `npm run check:workspace` | PASS. TypeScript와 테스트 253/253. 실패·skip 0. |
| `npm run lint` | PASS. 기존 규칙을 유지했다. |
| `npx expo install --check` | PASS. Expo 56.0.23 / notifications 56.0.26 정합성. |
| `git diff --check` | PASS. |
| `npm run build:android -- --max-workers 1` | PASS. Android Hermes export. 최종 SHA의 로그·번들 hash는 PR에 기록한다. |
| `npm audit --audit-level=moderate` | BLOCKED. exit 1. braces / node-forge 두 advisory가 남는다. 의존 패키지 항목 high 20, critical 0. 독립 취약점 20개라는 의미가 아니다. |
| 독립 소스 리뷰 | APPROVE. 보고된 결함을 수정하고 관련 실행 테스트 90/90을 재검증했다. 미해결 코드 결함 0. |

필수 Expo patch와 기존 override의 지원되는 brace-expansion 5.0.12 / shell-quote 1.11.0 patch를 적용했다. 강제 SDK downgrade, audit 예외와 CI 검사 삭제는 사용하지 않았다. Issue62는 계속 열린 보안 차단이다.

## 합성 실행 증거

테스트는 실제 API 함수, payload parser, 영속 명령 큐, 클릭 복구, AppRoot/DriverWorkspace/Expo adapter의 생산 코드를 실행한다. 네이티브 컴포넌트와 네트워크는 합성 응답·VM adapter로 대체한다.

| 흐름 또는 경계 | 실행 증거 |
|---|---|
| 등록 N01 → 창고 안내 N04 → 출발 확인 T+300초 N05 → 클릭 → 로그인 복구 → 배차 → 사용자 시작 → 승인 | `driverOperationalFlow.test.ts`의 연결 합성 시나리오. 인텐트 시간은 합성 서버가 만든다. 앱 예약 타이머가 아니다. |
| 조회·상세·새로고침·탭 진입 | DriverWorkspace effect 실행에서 업무 POST 0. 완료 배송지가 있어도 자동 ROUTE_COMPLETED 없음. |
| 알림 클릭·로그인 복구 | 실제 AppRoot 실행. 로그인 전에 목적지 조회 없음. resolver 성공 및 Workspace 화면 확인 후 OPENED. |
| N03 / N06 | N03 배정 해제 사실만 표시. N06은 `targetStopId == DeliveryOrder.id`인 정확한 배송지. nextStop으로 대체하지 않음. |
| 중복 클릭·cold start·재시작 | 미해결 클릭 보존. 승인된 화면만 dedup. 명시적 알림함 열기는 다시 resolver 호출 가능. |
| 만료·권한 상실·재배정·완료 배송지 | 안전 안내. 오래된 상세와 다른 배송지에 대한 업무 명령을 만들지 않음. |
| 최초 입력 시 오프라인 | 시작·보고를 먼저 저장. GET/POST 연결 실패 후에도 원본 ID·시각·fence 유지. |
| 승인 응답 유실·불완전 응답·이미 시작한 배차 | pending 유지. 재시작 후 동일 요청으로 서버 receipt 확인. 기존 두 시작 POST 우회 없음. |
| 재배정·버전 충돌 | executionContextId와 모든 신·구 fence를 다시 확인. 이전 명령을 새 배차에 적용하지 않음. |
| HTTP401·인증 갱신 | 같은 계정에서 원본 명령을 pending 유지하고 갱신 후 replay. 다른 계정 또는 늦은 응답은 무효. |
| 로그아웃·계정 전환 | 이전 resolver, refresh, OPENED, native cleanup, FCM revoke가 새 계정 상태를 변경하지 않음. |
| 영속 저장 실패 | 클릭·OPENED 처리 완료를 미리 기록하지 않음. 명령은 저장 성공 후에만 전송. |
| 토큰 갱신 | 직접 FCM 등록 → 서버 tokenId → 동일 deviceId capability 순서. 이전 계정 DELETE와 새 계정 PUT 직렬화. |
| 알림 권한 | 거부 안내와 설정 이동. 앱 활성화 때 복구 재확인. 지원하지 않는 payload는 안전 안내. |
| 미배송 보고 | 주입한 합성 사유만 사용. REPORT API만 호출. STOP_FAILED·주문 FAILED·배송 완료 이벤트 없음. |
| 기존 완료 복구 | 명시적 사용자 입력만 ROUTE_COMPLETED 전송. 응답 유실·재시작 후 원본 legacy event ID와 발생 시각 재사용. |

앱 재시작·인증 갱신·새로고침은 **기존에 사용자가 저장한 pending 명령**을 재시도할 수 있다. 이것은 조회가 새 업무 명령을 만드는 경로와 구분한다. 새 명령이 없는 읽기 테스트에서 업무 POST는 0회다.

## Android 산출물과 기기 경계

- 저장소 Android build runbook과 build-hygiene의 run 절차를 읽었다.
- Metro worker 1, command-scoped Node old-space 상한 3072MiB를 사용한다. 전체 프로세스 메모리 상한이라는 의미는 아니다.
- 정상 캐시를 삭제하지 않는다. Hermes export·로그·metadata hash와 재사용 node_modules를 보존한다.
- `build:android`는 Hermes export다. APK/AAB 서명·설치와 동일하지 않다.
- private `google-services.json`을 제공하지 않은 export에서는 config 경고가 남는다. 실제 Firebase 및 서명 native 후보 증거가 아니다.
- 연결된 Galaxy SM-N981N을 읽기 전용으로 확인했다. 설치된 `com.evnsolution.clever.driver`는 `0.1.15 (26)`이다.
- 설치본의 base.apk SHA256은 `0ed81f68648c523ea11ad4e8537126877b0f530879e7328b6c0c45fa5773189d`이다. 기기 앱·자료를 교체하거나 삭제하지 않았다.
- 이번 dev 후보의 `app.json`은 기존 `0.1.14 (23)`을 유지한다. PR61 또는 기기 설치본을 dev에 이미 있는 릴리스로 취급하지 않는다.

| 증거 | 결과 |
|---|---|
| 합성 payload·클릭·인증·업무 명령 실행 | 검증됨. |
| 기기 연결·기존 패키지 버전·hash 읽기 | 검증됨. |
| 새 후보 native APK 설치·화면·권한·카메라 | 미검증. Issue62가 열려 있고 서명/Firebase native 후보를 만들거나 설치하지 않았다. |
| 실제 FCM 수신·배경/종료 상태 native 클릭 | 미검증. 합성 VM 결과와 구분한다. |
| 서버 runtime·운영 배차·실제 GPS·실발송 | 미검증. 서버 PR483은 미병합·미배포다. |

## 남은 차단

Issue62 보안 검사, 서버 API 통합/배포 증거, D05 운영 사유 승인, 실제 FCM 및 native 기기 후보 검증이 남는다. 기능은 기본 OFF다. 앱 플래그는 서버 지오펜싱·실발송 승인이 아니다. 반복 6회 정책은 구현하지 않았다.

PR 병합, 서버 배포, 실발송 활성화, Play·Drive 게시, 운영 DB 변경, iOS 작업은 수행하지 않았다.
