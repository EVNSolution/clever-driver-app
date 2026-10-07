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
| `npm run check:workspace` | PASS. source 후보 `ac1e688da250de9611dc2de0fde89f01ce41620e`의 CI 37570524933에서 TypeScript와 테스트 320/320. 실패·skip 0. |
| `npm run lint` | PASS. 기존 규칙을 유지했다. |
| `npx expo install --check` | PASS. Expo 56.0.23 / notifications 56.0.26 정합성. |
| `git diff --check` | PASS. |
| Android/iOS export | PASS. source 후보 `ac1e688da250de9611dc2de0fde89f01ce41620e`의 CI 37570524933에서 두 export가 통과했다. Android Hermes export는 native APK와 구분한다. |
| `npm audit --audit-level=moderate` | BLOCKED. exit 1. braces / node-forge 두 advisory가 남는다. 의존 패키지 항목 high 20, critical 0. 독립 취약점 20개라는 의미가 아니다. |
| 독립 소스 리뷰 | 관리 검토의 R1~R3을 반영했다. 추가 리뷰에서 확인한 경쟁 조건도 수정하고 실행 회귀에 추가했다. 독립 리뷰는 APPROVE이며 관련 실행 검사 66/66을 통과했다. 미해결 소스 결함은 0건이다. |

필수 Expo patch와 기존 override의 지원되는 brace-expansion 5.0.12 / shell-quote 1.11.0 patch를 적용했다. 강제 SDK downgrade, audit 예외와 CI 검사 삭제는 사용하지 않았다. Issue62는 계속 열린 보안 차단이다.

2026-10-07에 unmodified audit gate를 다시 실행했다. `npm audit --audit-level=moderate`는 exit 1, high 20, critical 0이었다. 실제 advisory root는 다음 두 건이다.

- `braces <= 3.0.3` / GHSA-vfj7-8cjw-p6xm: 최신 공개 npm 버전도 3.0.3이다. GitHub advisory의 `first_patched_version`은 null이고 upstream issue 70은 open이다.
- `node-forge <= 1.4.0` / GHSA-86w9-cpqp-85rv: 최신 공개 npm 버전도 1.4.0이다. GitHub advisory의 `first_patched_version`은 null이고 upstream PR 1152는 open·미병합이다.

Expo 57의 최신 CLI도 `node-forge ^1.3.3`을 요구한다. 최신 `micromatch 4.0.8`도 `braces ^3.0.3`을 요구한다. `npm audit fix --force`가 제시한 Expo 44.0.6 downgrade는 현행 Expo 56 / React Native 계약을 깨므로 지원되는 해결책이 아니다. 두 패키지는 Metro 파일 처리와 Expo 인증서 도구를 통한 Node build-tool 경로다. 이 범위 사실과 Android runtime 번들 포함 여부는 별도 증거로 기록하며, runtime 미포함 증거로 audit 차단을 해제하지 않는다.

Android export source map의 source 항목 1,322개에는 `node-forge`와 `/braces/` 경로가 없었다. 이 결과는 runtime bundle 범위만 설명한다. CI 37570524933의 audit gate는 기존 high 20 때문에 실패했고 후속 정합성 단계는 skip됐다. audit 차단은 유지한다.

## PR64 관리 검토 반영

검토 기준은 `c39acfaaf51cb94ee3963ffa81dd889509fa996e`이며 같은 Draft PR64를 갱신한다.
기존 `cc-312-driver-operational` 작업공간과 원격 head가 일치하는 clean 상태에서 보완했다.
다른 작업공간과 PR61은 변경하지 않았다.

- R1: 알림함 갱신을 업무 갱신과 분리했다. 편집·저장·증빙 중 조회 응답과 이동을 보류한다.
- 보류 안내는 `현재 작업 계속`과 `알림으로 이동`을 제공한다. 초안을 자동 저장하거나 폐기하지 않는다.
- 명시적 이동도 작업의 안전한 종료를 기다리고 resolver를 다시 호출한다. 새 목적지를 실제 표시한 뒤 처리한다.
- 보호 시작은 입력 handler에서 동기 적용한다. 늦은 GET이 다음 render 전에 편집을 종료하지 못한다.
- 배송 확인 팝업, POD와 사진 전송도 보호한다. 빠른 명령 종료 뒤 보호 상태가 고정되지 않게 조정한다.
- 숨겨진 Workspace는 OPENED를 전송하지 않는다. 이전 실패 안내도 성공한 이동 전에 해제한다.
- 기존 알림도 fresh GET과 표시 완료 뒤 클릭을 소비한다. legacy 알림에는 OPENED를 추가하지 않는다.
- R2: N06의 누락·잘못된 targetStopId는 안내로 종료한다. next stop 대체와 OPENED가 없다.
- R3: API와 push parser가 UUID 검증 함수를 공유한다. nil·잘못된 version/variant는 unsupported로 종료한다.

## 합성 실행 증거

테스트는 실제 API 함수, payload parser, 영속 명령 큐, 클릭 복구, AppRoot/DriverWorkspace/Expo adapter의 생산 코드를 실행한다. 네이티브 컴포넌트와 네트워크는 합성 응답·VM adapter로 대체한다.

| 흐름 또는 경계 | 실행 증거 |
|---|---|
| 등록 N01 → 창고 안내 N04 → 출발 확인 T+300초 N05 → 클릭 → 로그인 복구 → 배차 → 사용자 시작 → 승인 | `driverOperationalFlow.test.ts`의 연결 합성 시나리오. 인텐트 시간은 합성 서버가 만든다. 앱 예약 타이머가 아니다. |
| foreground 알림과 편집 초안 | 실제 AppRoot → Workspace → DeliveryScreen의 재정렬 초안을 유지. 업무 조회 갱신과 새 업무 POST 없음. |
| 편집 클릭 → 현재 작업 계속 | pending과 화면 유지. 편집 종료만으로 이동하지 않음. 보류된 알림에서 명시적 이동 선택. |
| 저장·POD·사진 전송 중 클릭 | 실제 실행 hook과 AppDialog/POD 상태 사용. 보호 중 destination 조회·OPENED 0. 사진 전송 완료만으로 proof를 종료하지 않음. |
| 이동 전 권한·배정·만료 변경 | 보류 전에 반환 중이던 resolver 결과도 무효화. 명시적 이동에서 HTTP403/409/410 재검증 후 안전 안내. |
| render 이전 늦은 GET / 빠른 빈 큐 재시도 | 동기 보호와 종료 상태 조정. 초안 유실과 보호 상태 고정의 직접 회귀. |
| 실패 안내 뒤 재클릭 / 숨긴 Workspace | 표시 상태를 확인한 뒤만 OPENED. stale notice 뒤 목적지 승인 방지. |
| 알림함 페이지 갱신 | 수신 시 첫 페이지부터 재조회. 이전 페이지의 늦은 응답 무시. 업무 API·OPENED 0. |
| N06 누락 / nil·version·variant UUID | 안전 안내를 닫으면 pending 제거. OPENED 0. 재시작 후 불필요한 재시도 없음. |
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

## 실제 PostgreSQL API와 Driver 생산 코드

loopback fixture의 실제 PostgreSQL, Prisma repository, JWT 로그인과 legacy Driver API에 생산 Driver 클라이언트를 연결했다. fixture 비밀번호와 token은 출력하지 않았다.

- 실제 `loginDriverAccount`로 로그인했다. 실행 context와 알림함을 실제 API에서 조회했다.
- 실제 `DriverCommandQueue`로 시작 승인과 미배송 보고를 저장하고 전송했다.
- 서버가 commit한 뒤 클라이언트 응답을 유실시켰다. 저장된 같은 commandId와 fence를 다시 전송했다.
- 시작과 보고 재시도는 모두 `duplicate=true` receipt를 반환했다.
- 미배송 보고 응답은 업무 보고 상태만 변경했다. 주문·배송 결과 변경은 만들지 않았다.

이 검사는 합성 Prisma repository 검사를 실제 DB 검사로 계산하지 않는다. 실제 서버 fixture와 production Driver API client 코드를 연결한 별도 HTTP 검사다.
legacy Driver HTTP 검증 범위는 로그인, execution context, 알림함, 시작 명령과 미배송 보고다. 기기의 전체 배송 UI 흐름과 legacy API 전체를 검증한 결과가 아니다.

## 초기 격리 Android 산출물과 기기 경계

- 저장소 Android build runbook과 build-hygiene의 run 절차를 읽었다.
- Metro worker 1, command-scoped Node old-space 상한 3072MiB를 사용한다. 전체 프로세스 메모리 상한이라는 의미는 아니다.
- 정상 캐시를 삭제하지 않는다. Hermes export·로그·metadata hash와 재사용 node_modules를 보존한다.
- `build:android`는 Hermes export다. APK/AAB 서명·설치와 동일하지 않다.
- private `google-services.json`을 제공하지 않은 export에서는 config 경고가 남는다. 실제 Firebase 및 서명 native 후보 증거가 아니다.
- 격리 후보는 `com.evnsolution.clever.driver.integration`과 `CLEVER Driver Integration`을 사용한다. 로컬 HTTP는 이 후보에서만 허용한다. Firebase `googleServicesFile`은 격리 후보에서 제거한다.
- `build:android:integration:apk`는 기본 API를 `http://127.0.0.1:4908`로 고정하고 운영 알림 후보를 켠다. Gradle worker와 CMake 병렬도는 각각 1로 제한한다. JVM heap 2GiB와 Metaspace 1GiB는 전체 빌드 메모리 상한이 아니다.
- native 빌드 script는 mode 전환 또는 관리된 격리 tree의 Firebase 잔존 때만 clean prebuild를 사용한다. marker 없는 release tree와 동일 mode는 nonclean 생성 후 검증한다. app config plugin은 일반 생성에서 `usesCleartextTraffic`을 제거한다.
- `test:android:generation-isolation`은 임시 저장소와 synthetic Firebase fixture만 사용한다. 실제 isolated→일반 prebuild 순서에서 package, Firebase 파일과 cleartext 매니페스트를 검사한다. 업무용 Firebase 파일은 읽거나 수정하지 않는다.
- 실제 생성 증거와 SHA256 목록은 `/tmp/dsv-driver-android-generation-isolation/result.json`에 보존한다. production Firebase 파일은 synthetic fixture 사본이다.
- 업무용 release helper는 격리 flag, 운영 flag와 API override를 제거한다. custom API 주소는 격리 검증 빌드에서만 허용한다.
- Galaxy SM-N981N 장치 `R3CN80SCYPL`에 suffix 후보만 설치했다. 설치 전후 업무용 `com.evnsolution.clever.driver`는 `0.1.15 (26)`이다.
- 설치본의 base.apk SHA256은 `0ed81f68648c523ea11ad4e8537126877b0f530879e7328b6c0c45fa5773189d`이다. 기기 앱·자료를 교체하거나 삭제하지 않았다.
- 이번 dev 후보의 `app.json`은 기존 `0.1.14 (23)`을 유지한다. PR61 또는 기기 설치본을 dev에 이미 있는 릴리스로 취급하지 않는다.

| 증거 | 결과 |
|---|---|
| 합성 payload·클릭·인증·업무 명령 실행 | 검증됨. |
| 실제 PostgreSQL API와 생산 Driver 클라이언트 | 검증됨. 실제 JWT 로그인, context·알림함 조회, 시작·미배송 보고와 응답 유실 뒤 같은 commandId 재시도를 확인했다. |
| Android Hermes export | 검증됨. CI 37570524933에서 Android/iOS export가 통과했다. native APK 증거와 구분한다. |
| native APK 생성 | 검증됨. `com.evnsolution.clever.driver.integration` 0.1.14(23), arm64-v8a, 45,577,823 bytes, SHA256 `9fff45386f9384f0207ca496dbf0147a10ba956c78f1113290fc03ec8d3825f5`이다. Android debug certificate로 서명했다. 배포 서명 후보가 아니다. |
| APK source tree | 최종 APK는 `ac1e688da250de9611dc2de0fde89f01ce41620e` 위에 isolated manifest 수정이 적용된 tree에서 생성했다. 같은 수정은 후속 commit `d9740e5a6764e82e05e698c39181a8aee2e4aac8`에 기록했다. 문서 commit은 APK binary를 변경하지 않는다. |
| native 빌드 과정 | 첫 observer는 1,200초에 terminal `lintVital` 진행 중 timeout됐다. OOM과 source error는 없었다. 보존한 Gradle·NDK cache를 사용한 1회 continuation은 57.3초에 성공했다. isolated cleartext manifest 수정 뒤 최종 incremental build는 30.1초에 성공했다. |
| APK 매니페스트 | 검증됨. suffix package, targetSdk 36, arm64와 isolated `usesCleartextTraffic=true`를 확인했다. production config는 기존 package·Firebase 설정을 유지한다. |
| 격리 설치·실제 로그인·복구 | 검증됨. `adb reverse tcp:4908 tcp:4908` 뒤 최종 PostgreSQL fixture의 합성 계정으로 로그인했다. 합성 배송원 홈 화면을 확인했다. force-stop과 재실행 뒤 로그인 홈이 복구됐다. |
| native 화면 증거 | `/tmp/dsv-isolated-integration-20261007/driver-native-home.png`, SHA256 `f96264e4e8f98ddda1c9c98c647c38646d15e104571dec9ea30dc2f6f0208538`, 94,176 bytes. 합성 배송원 이름과 홈 화면을 포함한다. |
| 업무용 설치와 데이터 보존 | 검증됨. 업무용 package는 0.1.15(26) 상태를 유지했다. suffix package만 새로 설치했다. |
| 권한·카메라 native 화면 | 미검증. 로그인과 홈 화면까지만 기기에서 확인했다. |
| 실제 FCM 수신·배경/종료 상태 native 클릭 | 미검증. 합성 VM 결과와 구분한다. |
| Firebase provider와 실제 알림 | 미검증. 격리 APK는 업무용 Firebase config를 제거했다. 실제 provider와 실발송을 사용하지 않았다. |
| 운영 배차·실제 GPS·운영 활성화 | 미검증. 서버 후보는 미병합·미배포다. |

## 남은 차단

Issue62 보안 검사, 배포 서명, 실제 FCM, native 권한·카메라, 서버 배포와 D05 운영 사유 승인이 남는다. 기능은 기본 OFF다. 앱 플래그는 서버 지오펜싱·실발송 승인이 아니다. 반복 6회 정책은 구현하지 않았다.

PR 병합, 서버 배포, 실발송 활성화, Play·Drive 게시, 운영 DB 변경, iOS 작업은 수행하지 않았다.

## Android 실기기 업무 흐름 보완 — 2026-10-07

이 절은 앞선 로그인·홈 한정 기록을 보완한다. 실제 기기는 Samsung SM-N981N, Android 13/API 33이다. 실제 PostgreSQL 17과 loopback Fastify/Prisma API를 사용했다. 배차와 GPS 자료는 합성이다. 서버 provider는 `FakeOperationalPushProvider`이며 실제 발송은 없다.

### 생성 격리와 결함 수정

- `7c11922a`는 native 생성 mode와 실제 생성 결과 검사를 추가한다. 격리→일반 생성은 manifest, applicationId와 synthetic Firebase 파일을 검사한다. JS config 객체 검사로 대체하지 않는다.
- 일반 생성에서 `usesCleartextTraffic`을 제거한다. release helper는 네 개의 격리·운영·API 환경 변수를 제거한다. mode 전환은 guarded clean을 사용하며 같은 mode는 build cache를 보존한다.
- `ae3229ec`는 격리 package, 명시적 검증 flag와 loopback HTTP 조건에서만 합성 Android 알림을 예약한다. 실제 Android 알림창의 탭은 기존 클릭 복구와 서버 resolver를 실행한다. 일반 package의 FCM 등록 조건을 바꾸지 않는다.
- `47825ad9`는 같은 격리 조건에서만 보고 사유 `UNDELIVERABLE`을 주입한다. 표시명은 `합성 검증 사유`다. 일반 앱의 사유 목록은 계속 비어 있다. D05 운영 사유 승인이 아니다.
- 실기기에서 보호 알림 동작이 navigation 영역 아래로 밀린 결함을 발견했다. `1075507d`는 별도 bottom/left/right SafeArea overlay와 높이 44 이상의 가로 버튼으로 수정한다.
- 수정 APK에서 `현재 작업 계속`, `보류된 알림`, `알림으로 이동`을 직접 눌렀다. 보고 사유와 `protected-after-fix` 입력을 유지했다. 명시적 이동에서 fresh resolver와 표시 후 OPENED를 확인했다.
- 합성 서버 자료의 누락도 수정했다. 두 번째 주문의 DSV metadata와 변경 후 metadata를 보존했다. 재배정 Driver에는 canonical account/authSubject 연결을 사용했다. 클라이언트 parser와 서버 권한 조건은 완화하지 않았다.

### 실제 화면·HTTP·DB 연결

지역 증거는 `/tmp/dsv-android-flow-20261007`에 보존한다. `device-actions.jsonl`은 실제 입력과 탭의 UTC 시각이다. `native-http.jsonl`은 기기의 실제 요청을 전달한 loopback proxy 기록이다. 로그인 비밀번호와 token은 기록하지 않는다.

| 실제 화면 조작 | HTTP·DB 결과 | 화면 증거 |
|---|---|---|
| 로그인 → 10월 7일 → 합성 배차 선택 | JWT 로그인 200. 실제 legacy route lookup, routes와 assigned-route 조회. 두 배송지와 주문 metadata 표시. | `04-authenticated-home`, `05-delivery-date-options`, `07-dispatch-data-corrected` |
| 등록 N01·변경 N02·창고 도착 N04 확인 | 실제 publication/context sync와 geofence worker의 notification intent. 도착 안내 한 건. 변경 후 박스 수 갱신. | `08-registration-inbox`, `10-change-notice`, `11-change-applied`, `12-warehouse-arrival-warning` |
| 창고 출발 경고와 반복 확인 | 시험 시각 기준 출발+300초에 첫 N05. 직전 tick 0, due tick 1. 다음 due는 +300초이며 ordinal 2다. 실제 5분 벽시계 대기를 주장하지 않는다. | `12-warehouse-first-warning.db.json`, `13-five-minute-repeat` |
| 배송 시작 확인 팝업에서 승인 | 새 start POST 201. commandId `5934c901-b486-4ad6-b18a-6c1a80d0496c`. startedAt 기록, reminderDueAt=null. 이후 실제 worker +1시간 tick 0, N05 수 2→2. | `14-start-confirmation`, `16-start-result`, `post-start-tick.json` |
| genuine N06을 합성 Android 알림으로 표시한 뒤 알림창에서 탭 | resolve 200 → 정확한 target stop → OPENED 200. 다음 순번 배송지와 다른 두 번째 배송지다. | `22-n06-notification-tray`, `23-n06-exact-destination`, `23-n06-opened.db.json` |
| 보고 입력 중 다른 Android 알림 탭 | 보고 사유와 설명 유지. 목적지 이동 보류. 수정 후 두 동작 버튼 표시·탭도 재검증. | `26-report-input-before-notification`, `28-report-protected-after-tap`, `51`~`55` 화면 |
| 오프라인 보고 제출 → suffix 앱 종료·재실행 → 연결 복구 | 저장한 commandId와 fence·사유·설명을 복구했다. 첫 201 응답을 proxy에서 유실시켰다. 앱이 같은 ID로 재전송한 200은 duplicate=true였다. | `29-report-offline-submission`, `30-offline-persisted-command`, `31-offline-process-restart`, `32-after-response-loss.db.json` |
| 실제 관제 브라우저에서 N07 열기 → 읽음 → 보고 확인 → 처리 완료 | 읽기에서 업무 POST 0. ACKNOWLEDGED→RESOLVED. reload 후 유지. 보고·N07·보고 receipt 각각 한 건. 주문 currentRouteVersion과 배송지 PENDING을 유지했다. | `web-03-native-report-open`, `web-04-native-report-acknowledged`, `web-05-native-report-resolved`, `web-report-after.db.json` |
| 인증 만료 후 새로운 N02 알림창 탭 | resolve 401→refresh 200→같은 알림 resolve 200. 현재 계정의 최신 배차 표시. | `39-expired-token-notification-tap`, `40-expired-token-destination-recovered` |
| 다른 사업장 계정으로 로그인한 뒤 이전 계정 N02 탭 | resolve 404와 안전 안내. 이전 계정의 배송지나 업무 명령을 열지 않았다. | `45-foreign-account-confirmed`, `46-old-account-target-rejected` |
| 재배정 후 이전 N02 탭과 N03 열기 | stale resolve 404. N03은 해제 사실만 표시한다. 새 배송원에게 N01을 표시하고 canonical 연결 수정 후 현재 두 배송지를 실제 화면에 표시했다. | `59-reassigned-old-target-rejected`, `61-reassignment-fact-only`, `63-new-recipient-registration`, `67-new-recipient-route-reloaded` |
| 취소 후 이전 N02 탭과 N03 열기 | stale resolve 404. N03은 해제 사실만 표시한다. 새 업무 POST와 잘못된 배송지 이동이 없다. | `71-cancelled-target-rejected`, `73-cancellation-fact-only` |

N06 notification은 `4c2ffc18-758a-4bbc-b651-36c679ca998a`다. target stop은 `5674b01d-2890-401a-b348-67f52b167968`이며 next stop `fe47ee5c-814e-47da-b76b-ec8594fcbb4c`와 다르다.

기기에서 저장한 보고 commandId는 `c6dde483-e51d-4f45-b3f7-9074f37e09f2`다. 설명 `synthetic-device-offline-20261007`과 N06 target을 DB에서 확인했다. 보고 ID는 `dcf298a2-64ec-4097-b789-bbd2b6b4e1de`, N07은 `0fce16a9-977d-44ff-98f8-d73c96edbe82`다. `final-db-evidence.json`의 직접 SQL 결과는 report=1, N07=1, report receipt=1, target stop=PENDING, STOP_FAILED=0이다. 마지막 route=CANCELLED는 이후 명시한 합성 취소 시험의 결과다. 보고 처리 직후에는 IN_PROGRESS를 유지했다.

### APK와 재검사

| 항목 | 결과 |
|---|---|
| 최종 실행 소스 | `1075507dedc3838356a372fc9bce9756157a1fe4`. 후속 문서 commit은 실행 소스를 바꾸지 않는다. |
| 최종 APK | `/tmp/dsv-android-flow-20261007/driver-integration-final.apk`, 45,582,315 bytes. SHA256 `2c78ef20bc8522dd46d8c57965ca664727f397aaa5f8557709c2334dd98d09d7`. 설치본 base.apk hash도 일치했다. |
| Package·version·ABI | `com.evnsolution.clever.driver.integration`, `0.1.14 (23)`, arm64-v8a, minSdk24/targetSdk36. |
| 서명 | Android Debug certificate. SHA256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. 업무용 배포 서명을 사용하지 않았다. |
| 주요 업무 흐름 APK | `47825ad9` 실행 소스, SHA256 `f3fde88e12a6e4cc5898459a9f11177e60876838bfd58bff03c4ddbfc692fc80`. 원본은 `driver-integration-main-flow.apk`로 보존했다. 최종 APK에서 보호 동작·재배정·취소 흐름을 다시 확인했다. |
| 수정 후 workspace 검사 | TypeScript 및 325/325 tests PASS, 실패·skip 0. targeted 보호 회귀 52/52 PASS. |
| 수정 후 lint·native build | PASS. 최종 native incremental build 43.2초, 615 tasks 중 22 executed/593 up-to-date. |
| 독립 검토 | APPROVE. safe-area 보완 후 미해결 소스 결함 0. 실제 PNG와 탭 증거를 별도로 확인했다. |
| Audit | 기존 `npm audit --audit-level=moderate`를 유지한다. 2026-10-07 재검사 exit1/high20/critical0. Issue62 차단을 해제하지 않았다. |
| 업무용 설치 보존 | 기존 package `0.1.15 (26)`의 APK split 네 개 hash, firstInstallTime와 lastUpdateTime이 모두 일치했다. 업무용 앱의 실행·설치·삭제·데이터 초기화와 서명 작업은 없었다. 앱 데이터의 별도 덤프 비교를 주장하지 않는다. |

native 알림 권한은 suffix package에만 허용했다. API 연결 차단은 소유한 `adb reverse tcp:4908` 매핑만 제거했다. Wi-Fi와 다른 앱의 네트워크를 변경하지 않았다. 완료 후 합성 계정에서 로그아웃하고 suffix 앱을 종료했다. 해당 reverse 매핑도 제거했다.

### 유지하는 미완료와 차단

실제 FCM 수신, background/terminated FCM delivery, 실차 GPS, 운영 Firebase·배포 서명, camera/POD의 실제 기기 검증은 남는다. 합성 local notification은 실제 Android 클릭 증거이며 FCM 수신 증거가 아니다. 미전송 초안의 process 종료 후 복구를 검증했다고 주장하지 않는다. process 종료 검증은 이미 저장한 보고 명령과 그 입력 내용의 복구다.

Issue62 audit와 D01/D02/D04/D05/D07 운영 정책은 계속 차단이다. 반복 최대 6회는 승인하지 않았다. 일반 앱은 기본 OFF다. 운영 DB, AWS, 실발송, 병합·배포와 P7은 수행하지 않았다. 이 결과는 격리된 실기기 업무 흐름 완료이며 운영 활성화 완료가 아니다.
