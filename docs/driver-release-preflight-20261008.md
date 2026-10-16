# Driver 0.2.0 출시 사전검사

검사일: 2026-10-08, Asia/Seoul. 이 기록은 출시 승인이 아니다.
Issue62 보안 차단은 유지한다. Play·Drive 게시, 병합과 운영 배포는 실행하지 않았다.

## 소스와 작업 보존

- 앱: [PR67](https://github.com/EVNSolution/clever-driver-app/pull/67). 최초 검사 소스는 `cce1c2179c77c500032044cdfb46d2bf45b48092`다.
- 사용자 UI 수정 후 실행 소스는 `1b1bc7a5d765bac77434e07360b91c8503c85c25`다. 표시 버전은 `0.2.0`, 로컬 번호는 `28`이다.
- 서버: [PR488](https://github.com/EVNSolution/clever-route-server/pull/488), `b3710cad863a8c12d2a7e38a90486cc8010c5722`.
- Target: [Driver #66](https://github.com/EVNSolution/clever-driver-app/issues/66). Change-control: [#315](https://github.com/EVNSolution/clever-change-control/issues/315).
- 지정 worktree는 최초 확인 때 위 SHA와 clean 상태였다. 확인 직후 외부 작업으로 경로가 제거됐다.
- 같은 브랜치를 `/Users/jiin/.codex/worktrees/dsv-driver-release-preflight/clever-driver-app`에 복구했다.
- 사용자 추가 지시에 따라 알림 배송지 확인 배너와 알림함의 합성 알림 버튼·설명을 제거했다.
- 실제 목적지 이동·입력 보호·보고·완료 계약을 유지했다. 가까운 회귀는 수정 전 2건 실패, 수정 후 105/105 통과다.
- 이미 사용한 번호27을 재사용하지 않고 UI 수정 후보 번호를28로 증가했다. package/lockfile과 audit 기준은 변경하지 않았다.
- 동시 작업과 기기 연결을 먼저 확인했다. 다른 작업·프로세스와 PR61·64·65 원본은 변경하지 않았다.
- 이전 실기기 제외 지시는 이번 요청으로 해제됐다. 이전 PR65 결과는 새 후보의 기기 증거로 사용하지 않는다.

## 보안 판정

[Issue62 상세 검사](driver-issue62-preflight-20261008.md)를 따른다.
원래 `npm audit --audit-level=moderate`는 high20/critical0으로 실패한다.
두 원인 패키지는 새 Android export source map에 없었다. 실제 빌드 도구 호출도 계측했다.
미병합 upstream 패치는 별도 복사본에서 취약 재현·회귀를 검사했다.
공식 수정 릴리스는 없다. 지원된 수정 적용 또는 별도 검토된 fork/상위 도구 변경이 필요하다.
번들 미포함이나 기능 검사 통과를 audit 예외와 보안 차단 해제로 처리하지 않는다.

## 산출물 계약

EAS 원격 번호를 새로 조회했을 때 `26`이었다. 조회된 11개 Android 이력의 최대 번호는 `22`였다.
기존 기기 설치본과 PR65 사용 번호는 `26`이다. production의 기존 자동 증가로 최초 EAS 번호는 `27`이었다. 이 산출물은 UI 수정 전 비교 기록이다.
수정된 후보는 기존 사용 이력을 다시 확인하고 기존 자동 증가로27→28을 사용했다.
최신 Android 이력13개의 최대 번호는28이며, 새 후보의 실제 manifest도28이다.
원격 번호를 수동 설정하거나 새로운 서명 키를 생성하지 않았다.
승인된 Driver Firebase 프로젝트와 package를 검증했다. secret 파일의 내용은 기록에 넣지 않았다.

UI 수정 전 비교 빌드: `65d3d762-fd57-4d59-890a-54ddc0db0030` (`cce1c217`, 번호27).
최종 실행 소스 빌드: [`a432b666-e04a-4113-9219-924fc5a1bfc3`](https://expo.dev/accounts/evandsolution/projects/clever-driver-app/builds/a432b666-e04a-4113-9219-924fc5a1bfc3), FINISHED (`1b1bc7a5`, 번호28).
빌드 전에 Free quota Android0/15, 전체0/30, 동시1을 읽었다. 요금제·자격 증명 설정은 변경하지 않았다.

모든 최종 산출물은 표시 버전 `0.2.0`, 실제 `versionCode=28`이다.

| 산출물 | bytes | SHA256 |
| --- | ---: | --- |
| 정식 AAB | 72,730,027 | `f485aa84df3da9473c9973e33e3e7e2026519ee1eaa5a6055d25d9cddc8d4cd4` |
| 정식 package 파생 APK | 120,857,932 | `eab6e8fd3364c030a390d150893defd22559bd968663f757d37b5780cbf74dfd` |
| 격리 실기기 APK | 38,609,113 | `5a6990be7008b930ac0ee82c5dc331eec159c044d8633bc565a282430211c757` |

- AAB/파생 APK package: `com.evnsolution.clever.driver`.
- AAB/파생 APK 인증서: `10cc172641cb6c83e1761c6afef7053ea8160632ff6c3c06b7aa6c6b1f893be4`.
- 격리 APK package: `com.evnsolution.clever.driver.integration`.
- 격리 APK 인증서: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
- 모두 minSdk24/targetSdk36, debuggable=false. 정식 산출물은4ABI, 격리 APK는arm64-v8a다.
- background location·overlay·microphone·외부 storage 읽기/쓰기 권한은 없다.
- 정식 산출물은 cleartext 미허용·공식 API·operational=true·승인 Firebase 일치를 확인했다.
- 격리 APK는 loopback4910·operational=true·cleartext 허용·Firebase 부재를 확인했다.
- 실제 Hermes에서 새 보고·사유 검사·초안·구형 큐·접수·완료 복구 기능을 확인했다.
- 정식/격리 모두6개 검증 UI 문구와 알림함 예약 handler가 없다. 내부 합성 adapter의 package·flag·loopback guard는 유지된다.

AAB bundletool validate, APK apksigner verify와 인증서 대조는 PASS다.
파생 APK는 승인 upload 키로 같은 AAB에서 만들었다. AAB와 APK의 JS bundle SHA256은 같다.
AAB jarsigner는 exit0이나 self-signed·timestamp 부재·ZIP 속성·MANIFEST.MF 순서 경고를 남겼다.
독립 JarFile 검증에서 payload1,062개 모두 승인 인증서로 검증됐다. unsigned0·중복0·CRC실패0이다.
경고를 없애기 위해 AAB를 재포장하지 않았다. Play 처리 완료는 미검증이다.

정식 APK는 Drive 게시용 서명·ABI 계약의 산출물이 아니다. 기존 Play 앱 위에 설치하지 않았다.
파일별 manifest·인증서·bytecode·UI 제거 검사와 원본 로그는 보존 경로의 `formal-artifacts-ui/`와 `integration-ui/`에 있다.

## 기기와 데이터 보존

기기: Samsung Galaxy Note20 SM-N981N, serial `R3CN80SCYPL`, Android13/API33.
검사 전 일반 package는 `0.1.15(26)`, Play 설치본이었다.
Play App Signing 인증서 SHA256은 `f10f848a8a57684510119f05e62dda6b38958c7961a46dc8d28aa392a0cfefb2`다.
승인 upload 인증서는 `10cc172641cb6c83e1761c6afef7053ea8160632ff6c3c06b7aa6c6b1f893be4`다.
서명이 다르므로 일반 APK를 기존 Play 설치본 위에 업데이트하는 경로는 미검증이다.
삭제·초기화·downgrade로 우회하지 않았다. 일반 설치본의 APK와 설치 메타데이터를 최초 확인하고 보존했다. 기기 대기 이후 전후 재대조는 미완료다.

기존 별도 package `com.evnsolution.clever.driver.integration`은 `0.1.15(26)`이었다.
최초 후보 `0.2.0(27)`을 `adb install -r`로 업데이트했다. 로그인 세션과 구형 미배송 명령이 복구됐다.
구형 명령의 업데이트 전후 commandId와 본문 SHA256은 동일했다. 서버 보고는1건이다.
서명 SHA256은 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`다.
격리 APK 기능 검사와 정식 후보의 업데이트 증거를 구분한다.

## 새 격리 서버와 실기기 증거

원본 작업 증거: `/tmp/dsv-driver-preflight-20261008/`.
최종 산출물과 보존 증거: `/Users/jiin/.codex/artifacts/dsv-driver-preflight-20261008/`.
서버는 지정 SHA의 새 archive, 독립 PostgreSQL17과 새 합성 계정·배차를 사용했다.
Fastify4930, fault proxy4931, control4932, DB55496은 loopback에만 노출했다.
기기4910을 소유 adb reverse로 host4931에 연결했다. 실제 FCM·메일·GPS provider는 실행하지 않았다.

`offline`은 proxy가 전달 전에 연결을 끊는 통신 장애다. 기기 비행기 모드 증거는 아니다.
응답 유실은 실제 서버 commit 후 성공 응답을 폐기하고 untagged502를 전달한다.
성공 응답을 합성하지 않는다. 화면·요청 body hash·명령 ID·DB 결과를 연결한다.

| 검사 | 직접 실행 결과와 증거 |
| --- | --- |
| 구형 큐의 데이터 보존 업데이트 | `cce1c217` APK27에서 PASS. `D09/10/11`, `candidate-after-update.all-db.json`. 구형 command `0ac270e4-e6aa-4856-8e6b-d8bf831f1ed7`의201 응답 유실 뒤 새 설치본이 동일 body hash `383d973d4743533510639ca8c7c920406ed39a91fdaaa4a90e23a72c5815848a`로200을 받았다. 보고1건, 완료0건. |
| 자유 텍스트 빈 입력 | 최초 APK27 `D15`에서0/1,000자·전송 disabled를 확인했다. |
| 합성 알림 클릭 | 최초 APK27에서 예약과 대상 화면을 관찰했지만 알림창 캡처/탭 경합이 있어 최종 클릭 증거로 채택하지 않는다. |
| 1,001자·공백 입력 | 입력 중 foreground가 홈/Play로 변경됐다. 앱 신규 crash 기록은 없었다. 해당 캡처를 제외하고 기기 조작을 중단했다. |
| 나머지 실기기 검사 | 아래 최신 기기 결과를 따른다. |

기기 입력 중 홈/Play로 전환되는 새 충돌 징후가 있었다. 사용자 지시대로 기기 검사만 대기했다.
사용 가능 확인을 요청했고, 이후 기기에 입력하거나 설치하지 않았다.
UI 수정 소스 `1b1bc7a5`의 APK28은 빌드·서명·bytecode 검사를 마쳤지만 실기기에 설치하지 않았다.
다음 항목은 최종 후보의 실기기 검증이 필요하다.

- UI 배너·합성 버튼 제거 화면과 기존 입력 보호.
- 자유 텍스트의 공백·1,001자·줄바꿈·1,000자 및 실제 접수 표시.
- 앱 종료 후 초안·명령 복구와 보고 중복 방지.
- 사진 없는 완료·결과 복구, 선택 사진의 카메라·앨범·업로드 재시도.
- 합성 알림의 실제 클릭·정확한 목적지·진행 중 입력 보호.

알림함 예약 버튼은 최종 UI에서 제거했다. 버튼을 다시 노출하거나 임의의 검증 메뉴를 추가하지 않았다.
남은 내부 adapter 회귀나 API 목적지 조회는 실제 알림 클릭 증거가 아니다.

### 최종 소스의 별도 API 검사

`runtime/api-final-client-1791448527737/result.json`은 실제 앱 API client와 `DriverCommandQueue`를
지정 서버 SHA·PostgreSQL에 연결한 6개 검사다. 모두 PASS이며 실기기 증거와 구분한다.

1. blank·공백·1,001자·NUL은 실제 client와 서버가 모두 거부했다.
2. 정리 후 1,000자·줄바꿈·tab 사유를 접수했고 `PREPARED`를 받았다. 실제 메일은 보내지 않았다.
3. 서버 commit 후 응답 유실→통신 차단→디스크 재로딩→동일 commandId·본문 재시도에서 보고1건·duplicate=true였다.
4. 구형 reasonCode/explanation 큐의 본문을 보존하고 동일 보고를 재사용했다.
5. N06 API가 정확한 두 번째 목적지를 반환했다. 기기 클릭 검사는 아니다.
6. 사진 없는 완료 응답을 폐기한 뒤 계정 결과에서 `APPLIED`를 복구했다. 완료event1건·사진0건이다.

기존 기기용 route·보고·event와 proxy fault 상태는 그대로였다. 별도 API proxy만 사용 후 종료했다.
첫 실행은 증거 helper의 BigInt 직렬화 오류로 끝났다. 그 기록을 보존하고 새 추가 route에서 재실행했다.

## 빌드 자원과 실패 기록

로컬 격리 빌드는 Gradle worker1, JVM heap2GiB/Metaspace1GiB, CMake compile pool1을 사용했다.
첫 실행은 C++ 동시1을 확인했지만 Metro 기본 워커가 증가했다. 여유 메모리28%와 swap 증가로 중지했다.
소유 프로세스만 종료했다. 전역 Gradle, 완료된 native cache, 서명 자료는 보존했다.
두 번째 실행은 임시 Gradle init의 React 설정 접근 오류로 실패했다. 앱 소스 결함은 아니다.
세 번째 실행은 Metro worker1과 Node old-space1536MiB를 사용했다. R8 완료 뒤 메모리29%·swap 증가로 중지했다.
캐시를 보존하고 메모리가55%로 회복된 뒤 JVM heap1GiB/Metaspace1GiB로 재개했다.
네 번째 실행은37초, 608 tasks(67 executed/32 cache/509 up-to-date), exit0이다. 잔류 소유 프로세스는0이다.
이 낮은 heap은 네이티브/R8 작업이 끝난 캐시에서 남은 단계를 완료한 값이며 cold build 권장값이 아니다.

UI 수정 APK28은 동일한 worker1·JVM heap1GiB·Node old-space1536MiB 설정으로196.6초에 완료됐다.
608 tasks(43 executed/565 up-to-date), exit0, 잔류 소유 프로세스0이다.
observer: `20261008T172850.141397+0900-1b1bc7a5d765-ui-candidate-integration-apk`.
실제 Hermes에서 제거한6개 UI 문구와 알림함 예약 handler가 모두 없었다.
명령 보고·초안·완료 복구와 구형 본문 기능은 포함됐다.

## 저장소 검사와 최종 CI

| 검사 | 결과 |
| --- | --- |
| `npm run check:workspace` | 418/418 PASS, typecheck PASS, skipped0 |
| UI 가까운 회귀 | 변경 전 실패2 → 변경 후105/105 PASS |
| `npm run lint` | PASS |
| `npx expo install --check` | PASS |
| native generation isolation | 최초 후보 PASS. UI 수정 후 integration prebuild clean=false·번호28·package/Firebase 격리 PASS |
| 실제 앱 client + 지정 서버 API | 6/6 PASS. 실기기 증거와 구분 |
| `npm audit --audit-level=moderate` | FAIL, high20/critical0. 최종 수정 후 재실행해 같은 실패 확인 |
| `git diff --check` | PASS |

번호28 반영 직후에는 프로젝트 규약 테스트가27을 기대해417/418이었다.
해당 기대값을28로 수정하고 전체418개를 재실행해 통과했다. 실패 로그도 보존했다.

최종 PR HEAD에는 실행 소스 `1b1bc7a5` 이후 문서와 버전 규약 테스트만 추가된다.
실행 코드·설정·lockfile이 산출물 소스와 같은지 diff로 확인한다.
최종 HEAD의 수동 CI run·SHA·단계별 결과는 PR67 설명과 보존 증거의 `final-verification.json`에 기록한다.
CI 실패 이후 생략된 단계는 PASS로 처리하지 않는다. 해당 단계의 독립 로컬 실행 결과와 구분한다.

## 출시 판단에 필요한 항목

- 사용자 지적 UI의 제거·회귀 검사를 완료했다. 수정본의 실기기 확인과 아래 차단 해제 전에는 출시하지 않는다.
- Issue62를 정식 수정으로 해결하고 원래 audit 기준과 최종 HEAD CI를 통과해야 한다.
- 서버 PR488 API와 마이그레이션을 앱보다 먼저 운영에 적용했는지 서버 담당자가 확인해야 한다.
- 기존 reasonCode 큐, 새 reason 본문과 접수 영수증을 서버가 함께 지원해야 한다.
- Play 내부 트랙에 게시한 동일 AAB의 Play 서명 업데이트는 별도 권한·범위에서 검증해야 한다.
- 롤백은 낮은 versionCode 설치나 앱 초기화에 의존할 수 없다. 새 저장 명령·초안과 서버 기록의 호환성 검사가 필요하다.
- 새 reason을 지원하지 않는 서버를 먼저 되돌리지 않는다. 전체 롤백 실행은 이번 검사 범위에 포함하지 않았다.
- 실제 FCM 수신·메일 발송·실차 GPS는 미검증이다. 합성 알림 클릭 결과로 대체하지 않는다.
- 서버 최신·최소 지원 버전과 GPS 실발송 설정은 변경하지 않았다. C1은 재조사하지 않았다.

[Android 빌드 런북](android-build-runbook.md)에 템플릿 표식 부재의 clean 처리,
release operational=true, 서버 선배포·앱 전환·롤백 검사를 반영했다.
