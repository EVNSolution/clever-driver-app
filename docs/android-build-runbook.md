# Android APK 빌드 런북

## 목적

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
NODE_ENV=production npx expo prebuild --platform android --clean --no-install
```

`.private/google-services.json`은 Git에 추가하지 않는다. 준비 명령이 승인된
Firebase 프로젝트와 Android 패키지를 검증하고 권한을 `0600`으로 저장한다.

## 릴리스 빌드

기존 영구 릴리스 작업공간에서 아래 순서로 실행한다.

```bash
release_dir="/absolute/path/clever-driver-app-release"
cd "$release_dir"
node --version

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
- Expo prebuild의 암묵적 패키지 설치 차단
- Gradle 로컬 Build Cache 활성화
- 실제 기기용 `armeabi-v7a`, `arm64-v8a`만 빌드
- Gradle daemon의 Metaspace를 `1g`로 확보하고 기존 병렬 빌드 설정 유지

마지막 `release:android:drive`는 기본적으로 비변경 dry-run이다. 패키지 ID,
버전, ABI, 서명, checksum, 원격 브랜치 일치 여부가 모두 통과한 뒤에만 기존
배포 문서의 `--execute` 절차로 게시한다.

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
