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
4. `npm run release:android:drive`를 실행한다.

게시 명령은 APK에서 패키지 ID와 버전을 직접 읽는다. Drive 파일의 비공개
`appProperties.publishedVersionCode`보다 새 APK의 `versionCode`가 클 때만 기존 파일
내용을 교체한다. 업로드 후 Drive SHA-256과 로컬 APK SHA-256이 일치하고 익명 다운로드가
가능해야 성공한다.

기본 APK 경로는 `android/app/build/outputs/apk/release/app-release.apk`다. 다른 빌드
경로를 게시할 때만 첫 번째 인자로 전달한다.

```bash
npm run release:android:drive
bash scripts/publish-android-drive-release.sh /absolute/path/to/app-release.apk
```

새 파일 생성, 파일명 변경, 공유 권한 변경은 이 배포 명령의 책임이 아니며 허용하지 않는다.
