# Android Google Drive release

## 고정 배포 계약

CLEVER Driver의 직접 설치 APK는 Google Drive의 파일 하나를 계속 갱신한다.
버전별 파일이나 새 링크를 만들지 않는다.

- 소유 계정: `dlajiin@gmail.com`
- 폴더: `CLEVER Driver App Releases`
- 폴더 ID: `1VybPlbJcNiCb-FvC1zQf4QjAYe_2aSZR`
- 파일명: `clever-driver-latest.apk`
- 파일 ID: `1XRXAqREGtJJRMUsRnKgRAhFsiikE4V1y`
- Android 패키지: `com.evnsolution.clever.driver`
- 고정 설치 URL:
  `https://drive.usercontent.google.com/download?id=1XRXAqREGtJJRMUsRnKgRAhFsiikE4V1y&export=download&confirm=t`

파일명, 파일 ID와 설치 URL은 릴리스 버전이 바뀌어도 변경하지 않는다. Google Drive
폴더의 링크 보유자 읽기 권한을 파일이 상속하므로 파일별 공유 권한도 다시 만들지 않는다.

## 버전 규칙

1. `app.json`의 `expo.version`과 `android.versionCode`를 올린다.
2. `android/app/build.gradle`의 `versionName`과 `versionCode`를 같은 값으로 맞춘다.
3. 새 APK를 빌드하고 연결 기기에서 설치·실행을 확인한다.
4. `npm run release:android:drive`로 사전 점검 결과를 확인한다.
5. `npm run release:android:drive -- --execute`로 게시한다.

게시 명령은 기본적으로 Drive나 서버를 변경하지 않는 dry-run이다. 현재 브랜치가
`dev` 또는 `main`이고, worktree가 깨끗하며, HEAD가 같은 원격 브랜치와 일치할 때만
APK와 운영 상태를 점검한다. 실제 변경은 `--execute`를 명시한 경우에만 수행한다.
운영 API 주소는 `https://clever-route-api.cleversystem.ai`로 고정하며 다른 환경의
`DSV_API_BASE_URL`이 설정되어 있으면 게시를 중단한다.

게시 명령은 APK에서 패키지 ID와 버전을 직접 읽는다. Drive 파일의 비공개
`appProperties.publishedVersionCode`보다 새 APK의 `versionCode`가 클 때만 기존 파일
내용을 교체한다. 같은 버전과 checksum의 재실행은 Drive 업로드를 생략하고 서버 릴리스
상태 동기화부터 안전하게 재시도한다. 업로드 후 Drive SHA-256과 로컬 APK SHA-256이
일치해야 한다. 게시 후에는 고정 설치 URL에서 APK 전체를 익명 다운로드해 로컬 APK와
SHA-256이 같은지 다시 확인해야 성공한다.

Drive 검증이 끝나면 동일 명령이 운영 서버 컨테이너의 릴리스 게시 CLI를 SSM으로 실행해
`dsv_driver_app_releases`의 Android 최신 버전을 갱신하고, 공개 조회 API 응답까지 확인한다.
이 작업은 이미 실행 중인 컨테이너에서 DB만 갱신하므로 앱 버전마다 서버를 빌드하거나
재배포하지 않는다. 이 계약을 처음 도입할 때만 테이블·API·CLI를 포함한 서버 배포가 한 번
필요하다.

- 앱 첫 진입 조회: `GET /api/dsv/driver/app-release/android`
- 운영 API: `https://clever-route-api.cleversystem.ai`
- 강제 업데이트 하한을 올리는 릴리스만
  `MINIMUM_SUPPORTED_VERSION_CODE=<versionCode> npm run release:android:drive -- --execute`로 게시한다.
  지정하지 않으면 기존 하한을 보존한다.
  현재 운영 하한보다 낮은 값은 허용하지 않는다.

기본 APK 경로는 `android/app/build/outputs/apk/release/app-release.apk`다. 다른 빌드
경로를 게시할 때만 `--apk`로 전달한다.

```bash
npm run release:android:drive
npm run release:android:drive -- --execute
bash scripts/publish-android-drive-release.sh --apk /absolute/path/to/app-release.apk --execute
```

새 파일 생성, 파일명 변경, 공유 권한 변경은 이 배포 명령의 책임이 아니며 허용하지 않는다.
