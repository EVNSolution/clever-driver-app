# Google Play 릴리스

## 고정 계약

- 개발자 계정: `EVN Dev` 조직 (`7728300998655121517`)
- 앱 이름과 기본 언어: `CLEVER Driver`, 한국어
- Android 패키지: `com.evnsolution.clever.driver`
- EAS 프로젝트: `@evandsolution/clever-driver-app`
- EAS 프로젝트 ID: `f0feb2b9-2a77-4fe0-8ae7-27b5b5ecbacd`
- 최초 트랙: Google Play internal testing
- internal 참여 링크: `https://play.google.com/apps/internaltest/4700236589179130460`
- 관련 이슈: `EVNSolution/clever-driver-app#37`
- change control: `EVNSolution/clever-change-control#240`

Google Drive APK 채널은 계속 별도로 유지한다. Play App Signing과 Drive APK의
서명이 다르므로 Drive 설치본에서 Play 설치본으로 자동 업데이트할 수 없다. Play로
전환하는 기기는 기존 앱을 삭제하고 Play internal 링크에서 다시 설치한다.

## 릴리스 원칙

1. 최신 `origin/dev`를 issue-linked branch에서 동결한다.
2. 깨끗하게 커밋된 동일 소스로 production AAB를 한 번만 만든다.
3. 생성된 AAB를 internal testing에 올리고 실제 기기에서 검증한다.
4. 수정이 필요하면 기존 후보를 덮어쓰지 않고 versionCode를 올려 새 후보를 만든다.
5. production에는 internal에서 검증한 동일 AAB만 승격한다.

Google Play internal testing만 활성화된 동안에는 Data safety 제출이 면제된다. closed,
open 또는 production으로 확장하기 전에는 개인정보처리방침, Data safety, 앱 접근 방법,
계정 삭제 경로, 콘텐츠 등급, 대상 연령, 스토어 등록정보와 지원 연락처를 완성한다.

## 사전 점검

```bash
git status --short --branch
npm ci
npm run prepare:firebase:android
npm run check:workspace
npm run lint
npx expo install --check
git diff --check
```

릴리스 매니페스트는 `targetSdkVersion 36`이어야 하고 다음 권한을 포함하면 안 된다.

- `android.permission.ACCESS_BACKGROUND_LOCATION`
- `android.permission.SYSTEM_ALERT_WINDOW`
- `android.permission.RECORD_AUDIO`

위치 권한은 지도 화면에서 현재 위치를 기기에 표시할 때만 사용한다. 앱은 백그라운드
위치를 수집하거나 서버로 전송하지 않는다. 카메라와 사진 선택은 배송 완료 증빙을
사용자가 첨부할 때만 요청한다.

## EAS 서명과 AAB 생성

최초 한 번은 Driver 전용 Android upload keystore를 EAS remote credentials에 생성한다.
Drive APK 서명이나 Routes 앱 upload keystore를 재사용하지 않는다. keystore 백업은
Git 밖의 소유자 전용 위치에 저장하고 인증서 SHA-256을 이슈에 기록한다.

Git에서 제외된 `.private/google-services.json`은 저장소나 빌드 로그에 넣지 않는다.
EAS production 환경의 secret file 변수 `GOOGLE_SERVICES_JSON`에 등록하고,
`app.config.js`가 로컬에서는 기존 파일을, EAS 빌드에서는 해당 비밀 파일을 사용한다.

```bash
npx eas-cli env:set production \
  --name GOOGLE_SERVICES_JSON \
  --value ./.private/google-services.json \
  --type file \
  --visibility secret \
  --scope project \
  --non-interactive
```

원격 versionCode가 아직 없다면 현재 앱 versionCode에서 시작하도록 설정한다. production
프로필은 `autoIncrement`이므로 실제 후보의 versionCode는 빌드 결과에서 다시 읽는다.

```bash
npx eas-cli build:version:get --platform android --profile production
npx eas-cli credentials --platform android
npm run build:android:play
```

빌드 완료 뒤 다음 증적을 남긴다.

- source Git SHA
- EAS build ID
- versionName / versionCode
- AAB SHA-256
- Android upload certificate SHA-256
- EAS artifact URL

## internal testing 게시와 검증

`eas.json`의 submit production 프로필은 실수로 production에 올리지 않도록
`track: internal`을 고정한다. 기존 Routes 게시용 서비스 계정은 Driver 앱 접근 권한을
받기 전까지 사용하지 않는다. 최초 internal 게시처럼 Play Console에서 직접 올리거나,
명시적으로 Driver 앱 권한을 부여한 뒤에만 Android Publisher API 자동화를 사용한다.

### 2026-08-26 최초 internal 후보

- 상태: 활성, 내부 테스터에게 제공됨
- 버전: `0.1.10 (13)`
- source: `9072b2284dfe6aca389acb9bb268d6f62fd250ee`
- EAS build: `82f218fe-80ae-4684-9dcf-4d8c705243ee`
- AAB SHA-256: `72039d6c9826c229b59b29afb630a3695e3d84835e70b5c77865258fd7389659`
- upload certificate SHA-256: `10:CC:17:26:41:CB:6C:83:E1:76:1C:6A:FE:F7:05:3E:A8:16:06:32:FF:6C:3C:06:B7:AA:6C:6B:1F:89:3B:E4`
- Play App Signing SHA-256: `F1:0F:84:8A:8A:57:68:45:10:11:9F:05:E6:2D:DA:6B:38:95:8C:79:61:A4:6D:C8:D2:8A:A3:92:A0:CF:EF:B2`
- Play 확인값: minSdk 24, targetSdk 36, ABI 4개, 신규 설치 크기 22.4MB
- 테스터: 기존 `CLEVER` 목록 2명
- 남은 검증: 실제 기기 설치와 기능 점검

게시 뒤 Play Console 또는 Publisher API에서 release status와 versionCode를 다시 읽고,
테스터 계정으로 internal 링크를 수락하여 Play가 서명한 앱을 설치한다. 실제 기기에서
다음을 확인한다.

- 패키지와 버전
- Play App Signing 인증서
- 앱 실행과 로그인/회원가입
- 배송 조회와 지도 foreground 위치
- 알림 권한
- 카메라/앨범 증빙 업로드
- 로그아웃과 재로그인

검증이 끝나기 전에는 production rollout을 만들지 않는다.
