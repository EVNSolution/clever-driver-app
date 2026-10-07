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

## Android 산출물과 기기 경계

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
