# DSV Driver 배송 완료·알림 통합 검증

최종 실행 검증일: 2026-10-08, Asia/Seoul. Target: Driver #63. Change-control: #312.

현재 실행 후보는 `f5609529a00d9a39ea12ad81319183e5de5bac20`이다.
PR61과 PR64를 결합한 Draft PR65에 H1 수정과 실기기 footer 수정을 포함했다.
Issue62의 npm audit 차단은 유지한다. 운영 출시 판정은 하지 않았다.
이 문서 이후 문서만 수정한 HEAD는 PR에 별도로 기록한다. APK 소스 SHA와 구분한다.

## 현재 후보와 연결 기준

| 대상 | SHA / 연결 |
|---|---|
| [Driver 통합 Draft PR65](https://github.com/EVNSolution/clever-driver-app/pull/65) 실행 소스 | `f5609529a00d9a39ea12ad81319183e5de5bac20` |
| [서버 최소 계약 Draft PR487](https://github.com/EVNSolution/clever-route-server/pull/487) | `18ea784934ec3cf511f56646b708d141617c404b` |
| 보존한 Driver PR61 | `a7959e5a84393d7dc57e2caa654ea2f8edad202c` |
| 보존한 Driver PR64 | `6e2db49e0415786c018762a26a6b136bcef5b743` |
| 보존한 서버 PR483 / PR487 base | `44e6d880684609f7d075f3102c634a999b5c24ca` |
| 보존한 웹 PR85 | `72709e3afe67eb2700e9baf035a89c090b0effdf` |

서버 PR487은 PR483의 `codex/dsv-server-notifications` branch 위에 쌓은 별도 Draft다.
원본 PR61·64·483·85의 원격 SHA는 최종 확인에서도 같다.
원본 worktree, 업무용 앱·데이터와 서명 자료를 보존했다.
업무용 package의 APK 4개 해시, version과 설치 시각은 전후가 같다.

## H1과 실기기 결함 수정

첫 완료 요청에서 서버가 `completionOutcome=NOT_APPLIED`를 확인하면 완료 시간 수정과 닫기를 허용한다.
선택 사진과 사진 key는 유지한다. HTTP status만 보고 결과를 확정하지 않는다.
이전 요청의 결과가 불명확하면 이후 거절에도 원래 완료 identity와 시간을 유지한다.
완료 승인 후 사진 재시도는 완료 API를 다시 호출하지 않는다.

불명확한 완료의 같은 요청이 직접 200으로 확인되면 원래 결과를 채택한다.
현재 route 권한이 바뀌면 ACTIVE 계정의 `/driver/destinations/complete/result`로 원래 결과를 조회한다.
두 복구 경로는 사진과 원래 시간을 유지하며 자동 사진 업로드와 자동 배정 갱신을 중단한다.
사용자가 “닫고 배정 확인”을 누른 뒤 현재 배정을 다시 조회한다.

서버는 실제 `DriverEvent.completionOwnerAccountId` UUID column으로 완료 소유자를 기록한다.
현재 Driver.accountId나 payload owner를 조회 권한으로 사용하지 않는다.
추가 migration은 nullable column과 조회 index만 만든다. 기존 이벤트를 backfill하지 않는다.
전체 stop, route, destination, identity, 시각과 소유자가 모두 일치해야 확인 결과를 반환한다.
부분 완료, 기존 null owner, foreign 계정과 fingerprint 충돌은 UNKNOWN으로 남긴다.
초기 duplicate 조회와 P2002 race fallback 모두 같은 소유자·fingerprint 검사를 적용했다.
서버의 계약과 migration은 PR487에 기록했다.

실기기 `e37122e`에서는 복구 안내가 추가될 때 안전 닫기 버튼이 화면 밖으로 밀렸다.
`f560952`는 sheet 높이를 제한하고 본문을 스크롤 영역으로 분리했다.
작업 버튼은 고정 footer에 남긴다. 사진, 시간, modal identity와 알림 보호 상태는 유지한다.
수정 APK에서 안전 닫기 버튼의 표시와 실제 탭을 다시 검증했다.
새 전체 사진 오프라인 큐는 추가하지 않았다.

합성 미배송 사유와 로컬 알림의 공유 guard도 현재 후보에서 유지한다.
실제 package가 `com.evnsolution.clever.driver.integration`이어야 한다.
`EXPO_PUBLIC_DSV_ISOLATED_VERIFICATION`과 `EXPO_PUBLIC_DSV_OPERATIONAL_ENABLED`는 모두 정확히 `true`여야 한다.
API는 `http:`이며 hostname은 `localhost` 또는 `127.0.0.1`이어야 한다.
일반 package에서 두 flag와 loopback URL이 오염된 부정 검사도 전체 회귀에 포함한다.

## 최종 격리 검증

Samsung Galaxy Note20 SM-N981N, Android 13/API33을 사용했다.
실제 Fastify API와 Prisma repository를 실행했다. 독립 PostgreSQL17에 114 migrations를 적용했다.
API4908, 기록 proxy4910, PostgreSQL55496은 loopback만 사용했다.
suffix 앱은 소유 adb reverse4910으로 연결했다. 증빙은 private proof-media에 저장했다.
실제 승인과 저장 응답을 합성하지 않았다. 합성 계정·배차·주문·사진만 사용했다.

모든 새 raw 자료는 다음 비공개 디렉터리에 보존했다.
`/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/04_CLEVER_Route/.omx/private-evidence/dsv-completion-recovery-20261007`

token, password, cookie와 원본 multipart body는 HTTP 증거에 기록하지 않는다.
아래 prefix는 새 후보의 최종 검증이다. 기존 `A/B`, `FA` preflight와 구분한다.

| 흐름 | 실제 증거와 결과 |
|---|---|
| F2: N06 정확한 대상 | `F205` 화면과 HTTP/DB가 route의 두 번째 primary stop을 연결한다. 첫 next stop을 대신 열지 않았다. 읽기와 알림 탭은 자동 완료를 만들지 않았다. |
| 카메라·앨범 | 같은 f560952 APK의 `FA06/07/08b`에서 권한 요청·거부·허용을 검사했다. `FA09`는 native camera controls다. Android Photo Picker에서 합성 사진을 선택했다. 카메라 촬영본 업로드는 검사하지 않았다. |
| F2: 실제 연결 거절 | canonical 연결을 잘못 구성했다. `F208/211`은 실제 403 NOT_APPLIED다. `F209/210`에서 같은 사진 유지와 01:00 시간 편집을 확인했다. 취소 후 `F212` DB의 완료·media는0건이다. |
| F2: 4단계 알림 보호 | Android 묶음을 펼쳐 개별 알림을 눌렀다. `F218/221/223/226`은 완료 확인·picker·미리보기·업로드 중 같은 사진과 01:21을 유지한다. picker는 알림 탭 후 앱 modal로 돌아왔다. native picker 화면의 연속 유지는 주장하지 않는다. |
| F2: 업로드 중 명시적 이동 | `F227`에서도 이동을 보류했다. 서버 목적지 조회와 ACK를 작업 종료 전 실행하지 않았다. |
| F2: 승인 후 사진 재시도 | 정상 최초202 → 사진503 → 실제201 저장 후 응답 유실 → 같은 key의201을 수행했다. `F228/230/232/233`의 완료 event 전체 값과 시각은 같다. 같은 media·uploadedAt·저장 파일을 재사용했다. 완료 POST를 반복하지 않았다. |
| F2: 종료 후 이동 | 마지막 사진201 뒤 보류 알림의 목적지를 서버에서 다시 조회했다. 현재 assigned-route를 적용했다. `F232/233`에 화면·DB를 연결했다. |
| FB: 불명확 → 직접200 확인 | 실제202 승인 응답을 폐기하고 untagged502를 전달했다. 원래 identity/time으로 직접200과 같은 event를 확인했다. 사진을 유지하고 명시적 안전 닫기 전 follow-up은0건이다. 계정 결과 조회를 사용한 사례가 아니다. |
| FC: 불명확 → 재배정 → 계정 결과 | 실제202 응답 유실 뒤 같은 shop의 다른 합성 Driver로 route를 재배정했다. 원래 route 요청은401 NOT_APPLIED다. 원래 ACTIVE 계정 조회는 APPLIED다. 사진·시간·완료 event를 유지했다. 안전 닫기 후 현재 route0건을 확인했다. |
| 실제 API 부정 검사 | foreign 계정, 계정 연결 변경, inactive 계정, route token, legacy payload owner 위조, 부분 완료, canonical 연결 오류와 duplicate fingerprint 충돌을 검사했다. 잘못된 승인과 새 완료 event를 만들지 않았다. |

FB/FC의 파일명 `03-exact-n06`는 helper의 고정 label이다. 실제 N06 대상 증거로 사용하지 않는다.
최종 N06 증거는 F205다. FB/FC는 새 fixture의 명시적 완료와 복구를 검증한다.

F2 완료 event의 identity와 KST 01:21 승인 시각을 유지했다. 원본 event는 비공개 DB 기록에 보존했다.
현재 F2 fixture의 완료 event, READY media와 저장 파일은 각각1개다.
다음 stop은 PENDING이다. 배송 결과는 DeliveryStop.status와 STOP_DELIVERED로 검증했다.
Order.deliveryStatus는 기존 PENDING 값이다. 운영 주문 상태 정책은 이 범위에서 결정하지 않았다.
이전 fixture와 기존 사진 파일은 별도 이력으로 보존했다.
요청 사진은56,262 bytes, 저장 사진은56,172 bytes다. 서버는 JPEG EXIF를 제거한다.
저장 SHA256은 `86124939da23570285c7d64011963798979bb918d89c40bf6ff81f59377073bd`다.
원본 multipart bytes를 저장하지 않았으므로 별도 바이트 변환 재현은 주장하지 않는다.

Android socket drop은 SDK가 투명 재시도할 수 있었다. 그 preflight는 보존했다.
FB/FC는 실제 upstream202를 폐기한 뒤 untagged502를 전달해 앱의 불명확 상태를 노출했다.
FA의 collapsed group summary 탭은 앱에 전달되지 않았다. 최종 알림 보호 증거에서 제외했다.
F2는 개별 row의 실제 탭, 보호 화면, HTTP·DB로 검증했다.
notificationMode OFF의 불필요한 geofence helper500은 harness 선행조건 누락이다.
seeded N06를 사용했다. GPS 또는 운영 정책을 활성화하지 않았다.

## 회귀·검토·APK

| 검사 | 결과 |
|---|---|
| Driver 전체 | TypeScript 및401/401 tests PASS, skip0. lint·Expo alignment·whitespace PASS. |
| Driver 완료·알림 회귀 |118/118 PASS. 전체401에 포함되는 부분집합이다. |
| 서버 전체 | Prisma generate/validate, TypeScript, 명령 단위4GiB lint,3284 tests PASS, guarded/optional314 skip, build·whitespace PASS. |
| 실제 HTTP·독립 DB | 계정 소유권·부분 완료·충돌·proof 멱등성·재배정 부정 검사 PASS. 별도 결과 JSON 보존. |
| 독립 소스 검토 | H1 code review APPROVE, architecture OKAY, 실제 footer 수정 focused review APPROVE. |
| 독립 실기기 검토 | APPROVE. 최종 연결 증거와 주장 제한은 private evidence-review-final-f560952.md에 보존한다. |
| [서버 CI37643790521](https://github.com/EVNSolution/clever-route-server/actions/runs/37643790521) |18ea7849에서 SUCCESS. disposable PostgreSQL profile 포함. |
| [Driver CI37649139688](https://github.com/EVNSolution/clever-driver-app/actions/runs/37649139688) |f560952에서 workspace·lint·Android/iOS export PASS. audit20high로 FAILURE. 이후 alignment·whitespace는 skipped이며 같은 로컬 검사는 PASS. |

| 최종 APK 항목 | 값 |
|---|---|
| 파일 | `driver-f560952-integration.apk` |
| 실행·빌드 소스 | `f5609529a00d9a39ea12ad81319183e5de5bac20` |
| SHA256 | `c40780e63c0ce24c823091b1950d3e0222c3315dffdc4274e73fe15f2d49274d` |
| 크기 |38,607,537 bytes |
| package | `com.evnsolution.clever.driver.integration` |
| version |0.1.15 / versionCode26 |
| 서명 |Android Debug / APKv2 / RSA2048 |
| 인증서 SHA256 | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` |

설치 직후와 실기기 완료 후의 base.apk raw 해시를 보존했다. 위 산출물 해시와 일치한다.
최종 APK는34.8초에 빌드했다. 정상 캐시를 보존했고 C++ 재컴파일은 없었다.
최종 문서 변경은 실행 소스를 변경하지 않는다.

## 남은 차단과 제외 범위

- Issue62: npm audit high20/critical0. 예외, gate 해제와 강제 dependency 변경은 하지 않았다.
- 최종 증빙은 Photo Picker의 합성 사진이다. 카메라 촬영본 업로드는 미검증이다.
- 실차 ETA와 GPS는 미검증이다. fixture의 ETA 계산 실패는 보존했다.
- 사진 유지와 재시도는 현재 완료 modal의 범위다. 새 전체 사진 오프라인 큐는 없다.
- 실제 FCM, 실차 GPS, 운영 정책, 운영 DB, AWS, GitHub 병합, 배포, 스토어 게시와 P7은 제외했다.
- Android Debug suffix APK는 운영 release 서명을 사용하지 않는다.

격리 런타임을 종료했다. 소유 adb reverse와 기기의 합성 원본 사진만 제거했다.
비공개 runtime-cleanup-result.json과 device-cleanup-result.json에 PASS를 기록했다.
독립 PG 데이터, fixture, 사진 증빙, APK와 원본 PR·worktree는 보존한다.

<details>
<summary>2026-10-07 이전 실행 후보 eb9264b4의 검증 이력</summary>

이하 내용은 이전 후보의 이력이다. 현재 H1 후보의 판정과 산출물은 위 표를 따른다.

## 기준과 보존

먼저 서버의 관리 기록 `.omx/plans/dsv-android-device-manager-review-20261007.md`를 읽었다.
작업 루트는 `/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/04_CLEVER_Route`다.

| 대상 | 고정 기준 |
|---|---|
| 원격 Driver dev | `4009a9f522372a9cf23272ba723bfbbb76d96253` |
| [Driver PR61](https://github.com/EVNSolution/clever-driver-app/pull/61) | `a7959e5a84393d7dc57e2caa654ea2f8edad202c` |
| [Driver PR64](https://github.com/EVNSolution/clever-driver-app/pull/64) | `6e2db49e0415786c018762a26a6b136bcef5b743` |
| [서버 PR483](https://github.com/EVNSolution/clever-route-server/pull/483) | `44e6d880684609f7d075f3102c634a999b5c24ca` |
| [웹 PR85](https://github.com/EVNSolution/clever-dsv-web/pull/85) | `72709e3afe67eb2700e9baf035a89c090b0effdf` |
| 통합 merge | `40eb21c8785026028272544f9e0a8db76955f359` |
| 검증한 실행 소스와 APK 소스 | `eb9264b4b7d1040e6b77f2549edadd56e4ed5eed` |

새 worktree는 `.worktrees/dsv-completion-notification-integration`이다.
새 branch는 `cc-312-completion-notification-integration`이다.
PR64에서 PR61을 merge했다. `AppRoot`와 `DeliveryExecutionActions`의 충돌을 해결했다.
원본 PR과 원본 worktree는 변경하지 않았다. 서버와 웹의 소스도 변경하지 않았다.
최종 원격 SHA와 CI run은 통합 Draft PR에 기록한다. 이 문서 이후 문서 변경은 APK 소스와 구분한다.

업무용 package `com.evnsolution.clever.driver`는 실행하거나 초기화하지 않았다.
업무용 APK 4개의 해시, version, 최초 설치 시각과 마지막 갱신 시각은 전후가 같다.
업무용 앱 데이터, Firebase 자료와 서명 자료는 읽거나 변경하지 않았다.
새 격리 앱의 이전 합성 데이터만 초기화했다.

## 결합과 결함 수정

- PR61의 완료 시각 입력, 명시적 완료, 사진 증빙, ETA와 복구 경로를 유지했다.
- PR64의 동기식 작업 보호와 서버 목적지 재확인을 완료 창에 연결했다.
- 완료 창 안에서 보류 알림을 표시한다. 알림 표시로 완료 창을 다시 만들지 않는다.
- 승인된 현재 N06 대상만 종료한다. 다른 배송지 또는 재배정된 대상을 대신 처리하지 않는다.
- foreground 인증 갱신은 generation fence와 single-flight 보호를 유지한다.

초기 merge 후보에서 실제 서버의 승인 응답을 유실시켜 두 결함을 재현했다.

| 재현된 결함 | 수정 |
|---|---|
| 완료 재시도가 새 ID를 만들어 STOP_DELIVERED event 2건을 생성 | 최초 `clientEventId`와 `occurredAt`을 생성해 재사용한다. API identity 인자는 필수다. |
| 사진 저장 후 응답 유실에서 READY media와 파일 2건을 생성 | 사진 선택 때 만든 `Idempotency-Key`를 같은 사진의 모든 재시도에 사용한다. |
| 완료 승인 여부가 불명확한 상태에서 닫기 또는 시간 변경 가능 | 확인할 때까지 닫기, 뒤로가기, 취소와 시간 변경을 차단한다. |

완료 승인 후 사진 재시도는 완료 API를 다시 호출하지 않는다.
사진 재시도는 현재 완료 창의 선택 사진을 사용한다. 새 전체 사진 오프라인 큐는 추가하지 않았다.

## 합성 기능의 격리 조건

합성 미배송 사유와 로컬 합성 알림은 공유 guard를 사용한다.
다음 조건을 모두 만족해야 활성화된다.

1. 실제 application ID가 `com.evnsolution.clever.driver.integration`이다.
2. `EXPO_PUBLIC_DSV_ISOLATED_VERIFICATION`이 정확히 `true`다.
3. `EXPO_PUBLIC_DSV_OPERATIONAL_ENABLED`가 정확히 `true`다.
4. API URL의 protocol은 `http:`다. hostname은 `localhost` 또는 `127.0.0.1`이다.

일반 package에서는 두 flag와 loopback URL이 오염돼도 합성 기능이 꺼진다.
flag 누락, 잘못된 package, 비 loopback HTTP, HTTPS와 잘못된 URL의 부정 검사를 통과했다.
isolated clean → 일반 nonclean native 생성 검사도 통과했다.
일반 생성에서 격리 환경, cleartext와 격리 Firebase 상태가 제거됐다. 이 검사는 합성 Firebase 사본만 사용했다.

## 실제 기기와 격리 서버

- 기기: Samsung Galaxy Note20 `SM-N981N`, Android 13, API 33.
- 실제 frozen 서버의 Fastify, Prisma repository, JWT 로그인과 Driver API를 사용했다.
- PostgreSQL 17.10의 새 독립 cluster에 113개 migration을 적용했다.
- PostgreSQL은 loopback `55496`, API는 `4908`, 기록·장애 주입 proxy는 `4910`을 사용했다.
- 앱은 `http://127.0.0.1:4910`과 해당 port의 소유 adb reverse만 사용했다.
- 계정, 배차, 주문, 주소, 알림과 사진은 합성 자료다.
- 증빙 저장소는 별도 `proof-media` 디렉터리다. AWS를 호출하지 않았다.

원래 서버 fixture의 병렬 부모 insert에서 deadlock이 발생했다.
증거용 harness 사본에서 부모 insert를 순차 실행했다. 실패 로그와 수정 diff를 보존했다.
합성 canonical 배송지와 주문 연결을 맞추고 기존 proof reservation gate를 로컬 harness에서 활성화했다.
실제 HTTP handler와 repository를 사용했다. 완료 또는 업로드 성공 응답을 합성하지 않았다.
실기기 흐름 시작 전 완료 event, media와 저장 파일은 0건이었다.
기준 서버 소스와 원본 fixture는 변경하지 않았다.

## 화면·HTTP·DB·파일 연결

증거 디렉터리:
`/Users/jiin/Documents/Files/03_Work_EVnSolution/01_Repos/04_CLEVER_Route/.omx/reports/dsv-completion-notifications-20261007`

`manifest.json`은 공개 증거 파일의 크기와 SHA256을 기록한다.
`native-http.jsonl`은 request ID, 합성 대상, 시각, 상태, event와 media ID, 업로드 해시를 기록한다.
token, password, cookie, 인증 header와 원본 multipart body는 기록하지 않는다.
private fixture, PG 데이터, raw runtime log와 업무용 자료는 공개 증거에 포함하지 않았다.

| 검사 | 화면 | HTTP·DB·파일 결과 |
|---|---|---|
| N06 정확한 대상 → 명시적 완료 | `11`, `15`, `16` | targetStopId는 `05d1f43e-c5a3-41dc-89e7-43912d6cc37c`. `14` DB에 완료 0건. 조회와 알림 클릭은 자동 완료를 만들지 않았다. |
| 완료 확인 중 알림 | `19` | 17:40 입력 유지. 이동 보류. |
| 카메라 권한과 앨범 선택 | `20`~`24`, `26`, `27` | 카메라 거부, 재요청, 허용과 native camera 실행. Android Photo Picker에서 합성 사진 한 개 선택. |
| 기존 사진을 유지한 picker 중 알림 | `28`, `32` | picker 복귀 후 17:40과 같은 사진 유지. |
| 미리보기 중 알림 | `35` | 17:40과 같은 사진 유지. 이동 보류. |
| 빠른 중복 완료 입력·승인 응답 유실 | `36`, `38` | 최초 POST는 1회. 실제 202 승인 후 응답을 유실했다. `37` DB에 완료 1건. 닫기와 시간 변경 차단. |
| 완료 재시도 → 사진 503 | `39`, `41` | 같은 완료 body로 실제 200. 같은 event ID. 사진은 저장 전에 503 주입. `40` DB에 완료 1건, media 0건. |
| 업로드 중 알림·명시적 이동 선택 | `42`, `44` | spinner, 17:40과 같은 사진 유지. 목적지 resolve와 이동 보류. `45` DB도 동일. |
| 사진 저장 후 응답 유실 | `46`, `48` | 실제 201 저장 후 응답 유실. `47` DB에 READY media와 파일 각각 1건. 완료 event와 시각 불변. |
| 사진 재시도 → 작업 종료 → 이동 | `49` | 같은 key로 실제 201. media ID, uploadedAt, hash가 같다. 추가 완료 POST 없음. 마지막 201 이후 보류 알림 4건을 서버에서 다시 resolve. 모두 200. |
| 잘못된 배송지 연결 | 별도 실제 API 검사 | canonical 목적지와 다른 stop의 조합은 403. 완료 event 수 1 → 1. 다음 stop은 PENDING. |

승인된 완료 event ID는 `bafc1f2e-85c4-46fa-a963-65ccbb9ec9ac`다.
승인된 `occurredAt`은 `2026-10-07T08:40:00.000Z`이며 KST 17:40이다.
`37`, `40`, `45`, `47`, `50` DB의 완료 event 전체 값은 같다.
최종 DeliveryOrder 상태는 대상 DELIVERED, 다음 대상 PENDING이다. route는 IN_PROGRESS다.
검증한 배송 결과는 DeliveryOrder 상태와 STOP_DELIVERED event다.
Order.deliveryStatus는 고정 서버의 기존 PENDING 값으로 유지됐다.

사진 미리보기 8개 화면의 동일 영역 pixel SHA256은 모두 같다.
`photo-preview-retention-result.json`에 비교 결과를 기록했다.

업로드 key는 `proof-media-v1:1dafb6ceb38e4ed3a712f892b656abf1`이다.
media ID는 `e8aed99a-196b-4f21-a180-c87a41fcb3f5`다.
서버가 JPEG EXIF APP1 90 bytes를 제거하므로 요청과 저장 bytes는 다르다.

| 처리 단계 | 크기 | SHA256 |
|---|---:|---|
| 동일 사진의 세 multipart file 요청 | 56,262 bytes | `bac2113f149ceb31a6aefaede61047422af8d38737abb5015189f416d32cff09` |
| 실제 응답·DB·저장 파일 | 56,172 bytes | `86124939da23570285c7d64011963798979bb918d89c40bf6ff81f59377073bd` |

`device-linked-acceptance-result.json`은 HTTP와 DB snapshot, 알림 ID와 저장 파일을 연결한다.
`post-completion-wrong-destination-result.json`은 403 전후의 불변 상태를 기록한다.
`independent-review.md`는 소스, 설치 APK, 화면, HTTP, DB와 저장 파일을 독립 검토한 결과다.

## 회귀와 산출물

| 검사 | 결과 |
|---|---|
| `npm run check:workspace` | PASS. TypeScript와 360/360 tests. 실패·skip 0. |
| 연결된 완료·알림 보호 회귀 | PASS. 99/99. 전체 360에 포함된 검사다. |
| 완료·증빙 API / 통합 계약 | PASS. 9/9 / 13/13. 전체 검사에 포함된다. |
| frozen 서버의 독립 PostgreSQL HTTP 회귀 | PASS. 65/65. 실제 DB와 서버 44e6d880 검증이다. 전체 앱 테스트와 별도다. |
| lint / Expo alignment / whitespace | PASS. 기존 검사 유지. |
| isolated → 일반 native 생성 | PASS. 일반 package의 환경 오염과 cleartext 제거 검사 포함. |
| exact source Android APK | PASS. 보존한 캐시 사용, 37.4초. 설치 base.apk 해시도 일치. |
| [통합 CI 37600176843](https://github.com/EVNSolution/clever-driver-app/actions/runs/37600176843) | HEAD `456ffbf791bfd0058b5d04db908a5910617ad5b3`. Typecheck, 360 tests, lint와 Android/iOS export PASS. audit 실패. 이후 정합성·whitespace는 skip이며 같은 로컬 검사는 PASS. |
| `npm audit --audit-level=moderate` | BLOCKED. high 의존 항목 20, critical 0. braces / node-forge 두 advisory. Issue62 유지. |

전체 source 검사 로그의 디렉터리 이름은 commit 전 `40eb21c87850`을 표시한다.
검사 당시 source 내용은 후속 실행 commit `eb9264b4b7d1`과 같다.
observer의 오류 문자열 집계는 부정 검사 이름도 센다. 실제 exit 0과 테스트 실패 0을 기준으로 판정했다.
초기 전체 검사에서 obsolete 정적 assertion 3개가 실패했다. 해당 assertion을 수정한 뒤 전체 360개를 다시 통과했다.
초기 cold APK는 최종 후보가 아니다. cold build의 실제 C++ 병렬도가 항상 1이었다고 주장하지 않는다.
최종 warm build에는 C++ 재컴파일이 없었다. 다른 작업의 프로세스와 정상 캐시는 보존했다.

| 최종 APK 항목 | 값 |
|---|---|
| 파일 | `driver-eb9264b-integration.apk` |
| 소스 SHA | `eb9264b4b7d1040e6b77f2549edadd56e4ed5eed` |
| SHA256 | `216288426172ce941cb3d53ae0c9df17ca79d8fe4f3cd1a2190984504afec048` |
| 크기 | 38,600,521 bytes |
| package | `com.evnsolution.clever.driver.integration` |
| version | `0.1.15`, versionCode `26` |
| 서명 종류 | Android Debug, APK Signature Scheme v2, RSA 2048 |
| 인증서 SHA256 | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` |

## 한계와 남은 차단

- Issue62 audit 차단은 미해결이다. audit 예외, gate 제거 또는 강제 Expo downgrade는 하지 않았다.
- 최종 증빙은 Photo Picker의 합성 사진이다. 카메라 권한과 native 실행은 확인했다. 카메라 촬영본의 업로드는 검사하지 않았다.
- 업로드 단계 tray crop `43`은 앱 이름 행을 찾지 못했다. 실제 탭 action, 화면 `44`, 업로드 보류와 종료 후 해당 알림 resolve 증거는 있다.
- fixture에는 실제 경로 계산 서버가 없다. ETA의 계산 실패 화면을 보존했다. PR61 ETA 회귀는 통과했지만 실제 주행 ETA는 검증하지 않았다.
- 사진 선택과 재시도 증거는 실행 중인 완료 창의 범위다. 전체 사진 오프라인 큐나 앱 재설치 복구의 검증이 아니다.
- 실제 FCM, 실차 GPS, 운영 정책 결정, 운영 DB, AWS, GitHub 병합, 배포, 스토어 게시와 P7은 수행하지 않았다.
- 업무용 release signing을 사용하지 않았다. suffix APK는 격리 시험 산출물이다.

격리 API, proxy와 PostgreSQL의 종료 결과는 공개 증거의 `runtime-cleanup-result.json`에 기록한다.
suffix 설치본과 합성 앱 상태는 보존했다. 소유 adb reverse와 기기 합성 원본 사진은 검증 후 제거했다.

</details>
