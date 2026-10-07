# DSV Driver 배송 완료·알림 통합 검증

검증일: 2026-10-07, Asia/Seoul. Target: Driver #63. Change-control: #312.

격리 실기기 인수 검증을 통과했다. 완료 event, READY 증빙, 저장 파일은 각각 1건이다.
독립 검토는 격리 소스와 실기기 인수 범위에서 APPROVE다. 열린 소스 결함은 0건이다.
Issue62의 npm audit 차단은 유지한다. 이 결과는 운영 출시 승인이 아니다.

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
