# Android APK 빌드 런북

> **먼저 읽기:** 8GB Mac에서 Android 네이티브 빌드를 실행하거나 빌드가
> 10분을 넘었다면 [`android-build-lesson-8gb-mac.md`](./android-build-lesson-8gb-mac.md)의
> 중지 기준과 메모리 회복 확인 절차를 먼저 적용한다.

## 목적

`0.2.0` 후보부터 Android prebuild는 공식 `expo-template-bare-minimum@56.0.37`을 사용한다.
현재 Expo56 패키지의 내장 SDK57 템플릿 혼입을 피하기 위한 고정값이다.
생성 전 실패 조건이 없고 기존 `android` 디렉터리의 템플릿 표식이 없거나 다르면 helper가 clean prebuild를 실행한다.
같은 템플릿·모드의 후속 빌드는 기존 생성물과 Gradle 캐시를 재사용한다.
후보 버전·기능·검증과 출시 차단은 [0.2.0 후보 기록](driver-policy-candidate-20261008.md)을 따른다.

CLEVER Driver의 Android APK를 동일한 소스와 서명으로 반복 가능하게 만들면서
Gradle 산출물과 로컬 Build Cache를 재사용한다. 매 릴리스마다 새 clone을 만들지
않는다. APK 게시 절차와 고정 Google Drive 계약은
[`android-drive-release.md`](./android-drive-release.md)를 따른다.

## 운영 기준

2026-08-26 실측에서 새 clone의 최초 빌드는 23분 51초였다. 영구 릴리스
작업공간으로 옮긴 뒤 clean cache-seeding 빌드는 12분 36초였다. 1GB Metaspace
daemon을 처음 띄운 같은 revision 빌드는 29.44초, daemon 재사용 빌드는
6.78초였다. 아래 시간을 로컬 릴리스 빌드의 판정 기준으로 사용한다.

- 같은 revision 재빌드: 1분 이내
- 일반 TypeScript 또는 JavaScript 변경: 5분 이내
- 10분 초과: 성능 저하로 보고 프로파일 수집
- 20분 초과: 빌드 장애로 기록하고 원인 확인 전 게시 중단

SDK, NDK, Expo 또는 네이티브 의존성이 변경된 최초 빌드는 일반 변경보다 오래
걸릴 수 있다. 그래도 20분을 넘으면 장애 기준을 적용한다.

## 최초 1회 준비

기능 개발 worktree와 분리된 영구 릴리스 작업공간을 한 번만 만든다. 아래
`release_dir`는 실제로 계속 보존할 절대 경로로 바꾼다. 작업공간 자체를 다른
절대 경로로 옮기면 생성된 Android 파일에 이전 경로가 남을 수 있으므로 한 번만
clean prebuild를 실행한다.
Node.js는 `.nvmrc`의 `20.19.4` 이상을 사용한다.

```bash
release_dir="/absolute/path/clever-driver-app-release"
git clone https://github.com/EVNSolution/clever-driver-app.git "$release_dir"
cd "$release_dir"
git switch dev
node --version
npm ci
npm run prepare:firebase:android

# 기존 작업공간을 다른 절대 경로로 옮긴 경우에만 1회 실행
NODE_ENV=production npx expo prebuild --platform android --clean --no-install \
  --template expo-template-bare-minimum@56.0.37
```

`.private/google-services.json`은 Git에 추가하지 않는다. 준비 명령이 승인된
Firebase 프로젝트와 Android 패키지를 검증하고 권한을 `0600`으로 저장한다.

## 릴리스 빌드

먼저 현재 HEAD, 원격 PR HEAD, 미커밋 변경과 같은 작업공간의 빌드·기기 사용을 확인한다.
기존 변경과 다른 작업의 프로세스를 보존한다. 후보 검사는 연결된 PR의 지정 SHA를 사용한다.
후보 검사 중에는 `origin/dev`를 합치거나 게시 명령을 실행하지 않는다.

아래는 승인된 `dev`의 정기 릴리스 절차다. 영구 릴리스 작업공간에서 실행한다.

```bash
release_dir="/absolute/path/clever-driver-app-release"
cd "$release_dir"
node --version
git status --short --branch
test -z "$(git status --porcelain --untracked-files=all)"

previous_head="$(git rev-parse HEAD)"
git fetch origin dev
git merge --ff-only origin/dev
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/dev)"

if [[ ! -d node_modules ]] || ! git diff --quiet "$previous_head" HEAD -- package-lock.json; then
  npm ci
fi
npm run prepare:firebase:android
npx expo install --check
git status --short --branch
test -z "$(git status --porcelain --untracked-files=all)"

time npm run build:android:release:apk
npm run release:android:drive
```

빌드 명령은 다음 조건을 정본으로 유지한다.

- Expo prebuild와 Gradle 모두에 `NODE_ENV=production` 적용
- 아래 표의 조건으로 clean prebuild 결정
- 업무용 release 명령은 격리 flag와 API override를 제거하고 `EXPO_PUBLIC_DSV_OPERATIONAL_ENABLED=true`를 설정
- prebuild helper도 release 환경에 `operational=true`를 강제 적용. Gradle의 JS bundle에도 같은 값 적용
- 업무용 release 명령의 API는 기본 운영 주소 `https://clever-route-api.cleversystem.ai` 사용
- Expo prebuild의 암묵적 패키지 설치 차단
- Gradle 로컬 Build Cache 활성화
- 실제 기기용 `armeabi-v7a`, `arm64-v8a`만 빌드
- Gradle daemon의 Metaspace를 `1g`로 확보하고 기존 병렬 빌드 설정 유지

생성 판단의 정본은 `scripts/prebuild-android.mjs`다. `android/.clever-driver-generation-mode`와
`android/.clever-driver-generation-template`은 생성 검증을 모두 통과한 뒤 기록한다.
먼저 아래 표의 생성 전 실패 조건을 적용한다. 실패 조건이 없을 때 clean 여부를 판단한다.

| 기존 생성물 상태 | helper 동작 |
| --- | --- |
| integration 요청에 생성된 Firebase 파일이 남고 모드 표식 없음 | 생성 전 실패. 별도 격리 작업공간 사용 |
| `android` 디렉터리 없음 | `--clean` 없이 최초 생성 |
| `android` 있음, 템플릿 표식 없음 또는 `expo-template-bare-minimum@56.0.37`과 다름 | `--clean`으로 재생성 |
| 기록된 생성 모드가 요청 모드와 다름 | `--clean`으로 재생성 |
| integration 요청에 생성된 Firebase 파일이 남고 모드 표식 있음 | `--clean`으로 재생성 |
| 템플릿 일치, 모드 전환과 integration Firebase 잔존 없음 | nonclean prebuild. 기존 생성물과 캐시 재사용 |

모드 표식만 없고 템플릿이 일치하면 clean 조건이 아니다. 그러나 두 표식이 모두 없으면
기존 release tree도 템플릿 불일치 조건으로 clean 처리한다. clean은 생성된 native 파일을
다시 만들 수 있으므로 수동 변경과 기존 서명 자료를 먼저 확인한다. 전역 Gradle 캐시는 지우지 않는다.

release 생성에는 승인된 Firebase 원본이 필요하다. helper는 일반 package, cleartext 속성 부재와
생성 Firebase의 SHA256 일치를 검증한다. integration 생성은 별도 package,
cleartext 허용과 Firebase 부재를 검증한다. 이 검사는 산출물 서명 검증을 대신하지 않는다.

마지막 `release:android:drive`는 기본적으로 비변경 dry-run이다. 패키지 ID,
버전, ABI, 서명, checksum, 원격 브랜치 일치 여부가 모두 통과한 뒤에만 기존
배포 문서의 `--execute` 절차로 게시한다.

## 게시 전 후보 검사

이 절차는 AAB/APK 생성과 검사에 한정한다. Play·Drive 게시와 운영 서버 변경은 별도 절차다.
보안 검사가 실패해도 독립적인 빌드·기기 검사는 계속한다. 빌드 성공은 보안 차단 해제나 출시 승인이 아니다.

1. 앱 PR과 소스 SHA, 서버 계약 SHA, 빌드 시작 시각을 기록한다. 검사 종료 시 원격 HEAD와 다시 대조한다.
2. EAS `production`의 원격 Android 번호와 Android 빌드 이력을 읽어 사용된 최대 번호를 확인한다.
   `appVersionSource: remote`와 `autoIncrement: true`이므로 로컬 번호를 실제 EAS 번호로 보고하지 않는다.
3. 기존 승인된 서명과 Firebase 설정을 확인한다. 새 키 생성·교체나 원격 설정 변경으로 우회하지 않는다.
4. AAB는 `npm run build:android:play`의 EAS `production` 산출물로 준비한다.
   빌드 ID, 빌드에 연결된 소스 SHA와 실제 `versionCode`를 기록한다. Play·Drive 게시·제출은 실행하지 않는다.
5. APK는 목적에 맞는 기존 release 또는 integration 명령으로 준비한다. 서명 자료가 없으면 해당 산출물만 대기로 남긴다.
6. 각 산출물에서 package, 표시 버전, `versionCode`, 서명 인증서 SHA256과 파일 SHA256을 확인한다.
   manifest·권한·ABI, API 주소, 업무 기능 포함과 합성 검증 기능의 격리를 확인한다.
7. 기기 serial, 모델·Android 버전, 기존 package·버전·서명을 확인한다. 기존 앱 데이터와 설치본을 보존한다.
8. 같은 서명의 더 높은 번호 APK만 기존 설치본 위에 업데이트한다. 서명 불일치·번호 충돌은 미검증으로 기록한다.
   앱 삭제·초기화·강제 downgrade로 우회하지 않는다. Drive와 Play 채널 전환도 데이터 보존이 검증되기 전 대기로 남긴다.
9. 기능 검사는 격리 서버·테스트 계정과 `com.evnsolution.clever.driver.integration`에서 수행한다.
   업무용 후보 업데이트 증거와 격리 기능 증거를 구분한다. 다른 작업의 기기 사용이 확인되면 기기 검사만 대기한다.
10. 합성 알림 클릭, 입력 보호, 보고·완료 복구와 선택 사진 재시도를 화면·HTTP·DB 증거로 연결한다.
    합성 클릭은 실제 FCM 수신 증거가 아니다. 이전 후보의 실기기 결과를 새 후보의 결과로 재사용하지 않는다.

서명은 채널별로 구분한다. 생성된 로컬 release Gradle은 기본적으로 Android Debug 키를 사용한다.
Drive의 기존 승인 인증서도 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`지만,
파일 이름이나 buildType만으로 동일 서명이라고 판단하지 않는다. APK 인증서를 고정 계약과 대조한다.
EAS production AAB는 기존 Driver upload 키를 사용한다. upload 인증서는 기기의 Play App Signing
인증서와 다르다. 격리 APK의 Debug 서명 검사를 정식 Play 설치본 업데이트 증거로 사용하지 않는다.
기존 승인 키가 없거나 인증서가 다르면 해당 채널의 서명 검사를 대기로 남긴다.

EAS production은 `operational=true`와 운영 API 주소를 설정한다. 로컬 release APK도 업무 기능을 포함한다.
일반 개발 빌드는 명시적으로 켜기 전 OFF다. 합성 알림 내부 adapter는 integration package, 두 검증·업무 flag와
loopback HTTP API가 모두 일치할 때만 호출을 허용한다. 최종 알림함에는 예약 버튼이 없다.
production 후보에 합성 검증 UI가 노출되면 출시 차단이다.

## 서버 선배포·전환·롤백 검사

현재 후보는 [서버 PR488의 확정 계약](https://github.com/EVNSolution/clever-route-server/blob/b3710cad863a8c12d2a7e38a90486cc8010c5722/docs/contracts/dsv-operations-policy-20261008.md)을 요구한다.
아래는 출시 판단에 필요한 검사다. 후보 사전검사에서 운영 배포나 데이터 변경을 실행하지 않는다.

- 앱 배포 전에 서버 담당자가 계약 SHA, 필요한 마이그레이션 적용과 API 사용 가능 여부를 확인한다.
  `20261008090000_dsv_delivery_exception_email` 적용, 자유 텍스트 `reason`, 구형 보고 본문,
  동일 commandId 재시도와 접수 영수증을 확인한다. `PREPARED`는 메일 발송 완료가 아니다.
- 격리 서버에서 현재 앱과 기존 앱의 시작·보고·완료·인증을 확인한다. 기존 `reasonCode`/`explanation` 큐와
  `NOT_PREPARED` 영수증 재전송을 확인한다. 신규 앱 배포 전에 서버의 하위 호환 증거를 확보한다.
- 기존 설치본 전환 전에 미전송 명령·초안·진행 중 사진 작업을 확인한다. 업데이트 전후에 계정과 명령 ID,
  본문·발생 시각, 완료 결과가 유지되는지 확인한다. 서명이 다르면 삭제 전환을 사전검사의 대안으로 사용하지 않는다.
- 롤백 후보의 서명·번호와 새 저장 데이터 읽기 여부를 격리 환경에서 먼저 확인한다.
  낮은 `versionCode` 설치나 앱 초기화에 의존하는 경로를 무손실 롤백으로 보고하지 않는다.
- 서버 롤백이 신규 `reason` 요청·접수 영수증을 거부하는지 확인한다. 호환성을 증명하지 못하면 서버를 먼저 되돌리지 않는다.
  신규 보고·명령·이력 보존과 중복 재전송 방지를 확인하고, 미검증 경로는 차단으로 남긴다.
- 서버 최신·최소 지원 버전과 GPS 실발송 설정은 유지한다. 실제 FCM·메일과 실차 GPS는 별도 검증으로 남긴다.
- 최종 HEAD에서 저장소 필수 검사와 CI를 실행한다. PASS, FAIL, SKIP과 실행 불가를 구분한다.
  Issue62 audit 기준을 완화하거나 실패를 숨기지 않는다.

## 지연 진단

10분을 넘으면 같은 작업공간에서 프로파일을 남긴다.

```bash
time npm run build:android:release:apk -- --profile
profile_path="$(ls -t android/build/reports/profile/profile-*.html | head -1)"
open "$profile_path"
cd android
./gradlew --status
```

확인 순서는 다음과 같다.

1. 결과의 `actionable tasks`에서 `UP-TO-DATE` 또는 `FROM-CACHE`가 있는지 본다.
2. `createBundleReleaseJsAndAssets`와 CMake 작업의 소요 시간을 비교한다.
3. 새 clone, `npm ci`, SDK·NDK 변경처럼 캐시를 무효화한 직전 작업을 확인한다.
4. 같은 revision 재빌드도 1분을 넘으면 Gradle daemon과 캐시 상태를 우선 본다.
5. `./gradlew --status`에서 현재 daemon이 `IDLE`인지 본다. 이전 512MB daemon의
   종료 이력은 남을 수 있다. 새 실행도 `after running out of JVM Metaspace`로
   끝나고 `IDLE` daemon이 없으면 정본 명령의 `MaxMetaspaceSize=1g` 적용 여부를
   확인한다.

## 금지 및 복구

- 릴리스마다 새 clone을 만들지 않는다.
- 정상적인 지연 대응으로 `~/.gradle` 전체나 Android SDK를 삭제하지 않는다.
- `git clean -xfd` 또는 광범위한 재설정으로 사용자 작업을 지우지 않는다.
- Configuration Cache는 Expo와 React Native Gradle 스크립트의 외부 프로세스
  호출 문제가 해결되기 전까지 활성화하지 않는다.
- 작업공간 경로 변경이 아닌 생성물 불일치가 확인된 경우에만 영구 릴리스
  작업공간의 `android` 디렉터리에서 `./gradlew clean`을 실행한 뒤 `--profile`
  빌드로 원인을 남긴다.
