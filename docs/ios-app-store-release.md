# iOS TestFlight and Unlisted App Store release

이 문서는 CLEVER Driver의 App Store Connect 심사와 Unlisted 정식 배포 정본이다.
EAS 빌드 명령과 TestFlight 업로드의 간단한 실행 절차는
`docs/ios-release.md`가 소유하고, 이 문서는 개인정보·심사·릴리스 게이트를 소유한다.
배포 변경은 `EVNSolution/clever-change-control#240`과
`EVNSolution/clever-driver-app#29`에 연결한다.

## 배포 결정

- 파일럿: TestFlight 외부 테스트
- 정식 운영: Unlisted App Store
- 공개 검색형 App Store, 웹앱/PWA, Enterprise 배포: 사용하지 않음
- Ad Hoc: 등록된 내부 QA 기기에서만 사용
- App Store 첫 버전: 수동 릴리스

Unlisted App도 App Review를 통과해야 한다. App Store Connect에서는 처음에
`Public` 배포를 선택해야 Unlisted 요청을 제출할 수 있지만, 버전 릴리스는 반드시
수동으로 둔다. App Review와 Unlisted 요청이 모두 승인되어 배포 방식이
`Unlisted`로 표시되기 전에는 `Release This Version`을 실행하지 않는다.

공식 기준:

- TestFlight: <https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview>
- Unlisted App: <https://developer.apple.com/support/unlisted-app-distribution>
- 수동 릴리스: <https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/select-an-app-store-version-release-option>
- EAS iOS 제출: <https://docs.expo.dev/submit/ios/>

## 2026-09-01 준비 상태

| 항목 | 현재 근거 | 판정 |
| --- | --- | --- |
| iOS 앱 ID | `com.evnsolution.clever.driver` | 준비됨 |
| 앱 버전 | `0.1.11`, TestFlight build `4` 설치 확인 | 새 계정 삭제 UI를 포함한 build 필요 |
| EAS 빌드 프로필 | `production`은 `distribution: store`, `autoIncrement: true` | 준비됨 |
| iOS 네이티브 peer 의존성 | `expo-font ~56.0.7`을 직접 설치해 SDK 56 단일 버전으로 정렬 | 준비됨 |
| Expo 런타임 건전성 | SDK 56 빌드와 TestFlight 실기기 실행 확인, 알려진 Hermes 회귀는 SDK 57 전환 작업으로 분리 | 출시 후 업그레이드 |
| 프로덕션 의존성 감사 | Expo fingerprint/Metro 빌드 도구 경로 high 10건, 앱 입력에서 직접 호출하지 않음 | 강제 수정 없이 SDK 57 전환에서 해소 |
| EAS 프로젝트 | `@evandsolution/clever-driver-app`, ID `f0feb2b9-2a77-4fe0-8ae7-27b5b5ecbacd` 연결 확인 | 준비됨 |
| EAS 소유 계정 | 조직 계정 `evandsolution`으로 생성됨 | 준비됨 |
| EAS iOS 빌드 | build `887d2744-531d-42b1-9d75-728ff023ac26`, source `bab870acb9194b02720449e7ebf3f2ae6cb31e4e` | 기존 TestFlight 증적 |
| Apple Developer 팀 | App Store Connect 앱과 TestFlight 접근 성공, 팀 권한은 계정 관리자가 정리 중 | 제출 전 역할 확인 필요 |
| 로컬 Apple 도구 | 전체 Xcode가 없고 Command Line Tools만 활성화됨 | 로컬 archive/Simulator 차단 |
| 로컬 코드서명 | 개발용 identity 1개, Distribution identity와 provisioning profile 없음 | 로컬 배포 차단 |
| App Store Connect 앱 | Apple ID/`ascAppId` `6806955523` | 준비됨 |
| 앱 아이콘 | `assets/branding/driver-app-icon.png`를 TestFlight build에서 처리 확인 | 최종 스크린샷에서 시각 확인 |
| 개인정보처리방침 | Driver 전용 `/driver-app/privacy` 구현 | 서버 배포 후 공개 `200` 확인 필요 |
| 지원 URL | Driver 전용 `/driver-app/support` 구현 | 서버 배포 후 공개 `200` 확인 필요 |
| 계정 삭제 | 설정 화면에서 서버 삭제 요청을 시작하고 활성 배송 오류를 안내 | 새 iOS build 실기기 확인 필요 |
| 리뷰 계정 | 만료되지 않고 실제 기능을 볼 수 있는 비식별 데모 계정이 없음 | 차단 |
| 스크린샷 | iPhone 6.9형 세트가 없음 | 차단 |
| 실기기 | 사용자가 TestFlight 설치·실행 성공을 확인 | 새 build 회귀 확인 필요 |

현재 Unlisted 제출 변경은 `cc-240-unlisted-release` 격리 워크트리가 소유한다.
기존 `dev` 작업공간의 미추적 Android Gradle 캐시는 수정하거나 정리하지 않는다.
체크리스트는 최종 커밋과 새 TestFlight 바이너리를 기준으로 다시 확인한다.

## 1. 조직 소유권과 EAS 연결

EAS 프로젝트는 조직 계정 `evandsolution`에 연결되어 있다. 새 프로젝트를
다시 만들지 않는다. 다음 명령으로 owner, slug와 project ID를 대조한다.

```bash
npx eas-cli@latest project:info --non-interactive
npx eas-cli@latest build:list --platform ios --limit 5 --json --non-interactive
```

통합 과정에서 project ID가 누락된 경우에만 기존 프로젝트를 ID로 연결한다.

```bash
npx eas-cli@latest init \
  --id f0feb2b9-2a77-4fe0-8ae7-27b5b5ecbacd \
  --non-interactive
```

`app.json`의 `owner`, `extra.eas.projectId`와 Expo 대시보드의 owner, slug, project
ID가 모두 같아야 한다. App Store Connect 앱이 생성되면 `eas.json`의
`submit.production.ios.ascAppId`를 실제 Apple ID로 설정한다. Apple ID, Team ID,
App Store Connect API key는 저장소에 직접 기록하지 않는다.

현재 Mac은 전체 Xcode가 아니라 Command Line Tools만 활성화돼 있고, 조직용
Apple Distribution identity와 provisioning profile도 없다. 로컬 개인 개발 identity를
정식 배포에 재사용하지 않는다. 최초 TestFlight 후보는 승인된 조직 Apple Team과 EAS
remote credentials로 만들고, 로컬 Simulator 캡처가 필요하면 별도로 전체 Xcode와 해당
iOS runtime을 설치한 뒤 진행한다.

### SDK와 의존성 게이트

`expo-symbols`가 요구하는 `expo-font`는 SDK 56 정렬 버전을 직접 설치해 중복을
제거했다. Expo Doctor의 남은 실패는 현재 React Native/Hermes 버전의 알려진
메모리 회귀이며, 공식 권고는 Expo SDK 57과 React Native 0.86.2 이상이다.

`npm audit --omit=dev`의 high 결과도 Expo/Metro 변환 도구 계열에 남아 있다.
`npm audit fix --force`는 Expo 57을 포함한 breaking upgrade를 만들기 때문에
자동 실행하지 않는다. 별도 SDK 57 전환에서 다음을 함께
검증한다.

- MapLibre, Reanimated, Worklets와 Gesture Handler 정합성
- iOS/Android 네이티브 빌드와 지도·드래그·권한 동작
- Hermes 장시간 메모리 사용과 앱 재개
- `npm audit --omit=dev` 잔여 항목의 실제 프로덕션 노출 또는 예외 근거

공식 회귀 안내:
<https://expo.dev/changelog/sdk-57#known-regressions>

## 2. Apple 앱 레코드

| 필드 | 값 또는 원칙 |
| --- | --- |
| 플랫폼 | iOS |
| 이름 | `CLEVER Driver` |
| Bundle ID | `com.evnsolution.clever.driver` |
| SKU | `clever-driver-ios` |
| 기본 언어 | 한국어 |
| 배포 방식 | `Public`으로 생성 후 Unlisted 요청 |
| 가격 | 무료 |
| 지역 | 대한민국부터 시작하고 실제 배송원 Apple Account 지역을 확인 |
| 릴리스 | `Manually release this version` |
| 기본 카테고리 | 비즈니스 |
| 보조 카테고리 | 내비게이션은 최종 메타데이터 검토 후 선택 |

`Public`은 Unlisted 요청을 위한 Apple의 App Store Connect 분류일 뿐, 공개
릴리스를 승인한다는 뜻이 아니다.

## 3. TestFlight 파일럿

1. 깨끗한 릴리스 커밋에서 전체 검증을 통과한다.
2. EAS/Apple 조직 소유권과 서명 자격 증명을 확인한다.
3. 아래 명령으로 store 서명 빌드를 만들고 App Store Connect에 업로드한다.
4. 외부 테스트 그룹 `DSV Driver Pilot`을 만들고 첫 빌드를 Beta App Review에
   제출한다.
5. HTTPS TestFlight 공개 링크에는 테스터 상한을 설정하고, 앱 로그인 권한은
   DSV 서버가 계속 통제한다.
6. 실제 배송원과 별도인 테스트 계정으로 iPhone 설치, 로그인, 지도, 권한,
   사진 증빙과 로그아웃을 검증한다.

```bash
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production
```

TestFlight 빌드는 90일 후 만료된다. 정식 운영을 TestFlight에 계속 의존하지 않는다.

## 4. App Review 차단 조건

### 계정 삭제

앱에서 계정을 만들 수 있으므로 설정 화면에서 계정 삭제를 시작할 수 있어야 한다.
서버 정본은 이미 다음 계약을 제공한다.

```http
POST /driver/account-deletion-requests
Authorization: Bearer <driver-account-access-token>
Content-Type: application/json

{"confirmation":"DELETE","reason":"optional"}
```

- 동일 요청은 멱등 `REQUESTED` 기록을 반환한다.
- 진행 중 배차가 있으면 `409 ACCOUNT_DELETION_ACTIVE_ROUTE`로 차단한다.
- UI는 전체 계정 삭제 요청임을 명확히 설명하고 재인증 또는 명시적 확인을 거친다.
- 앱은 이메일이나 전화 문의만 제시하는 것으로 이 요구를 대신하지 않는다.

공식 기준:
<https://developer.apple.com/support/offering-account-deletion-in-your-app/>

### 개인정보처리방침과 지원 URL

Driver 전용 제출 URL은 다음과 같다. 서버 변경이 배포된 뒤 공개 `200` 응답과
본문 연락처를 다시 검증한다.

- 개인정보처리방침: `https://clever-route-api.cleversystem.ai/driver-app/privacy`
- 지원: `https://clever-route-api.cleversystem.ai/driver-app/support`

문서에는 기존 회사 개인정보처리방침의 운영자·책임자 연락처와 다음 내용을
반영한다.

- 정확한 법인 운영자명과 주소
- 개인정보·지원·삭제 요청 연락처
- 배송원 계정 정보, 배송 이벤트와 증빙 사진의 목적
- 보관 기간 또는 결정 기준
- 계정 삭제 요청과 법정 보관 데이터의 처리 방식
- iOS 앱이 현재 위치를 기기에서만 표시하고 백그라운드 추적하지 않는 범위

Support URL은 실제 연락처를 표시하는 공개 HTTPS 페이지여야 한다. 인증이 필요한
DSV 가이드 PDF 경로는 Support URL로 사용하지 않는다.

### 리뷰 접근

App Review에는 만료되지 않는 데모 계정을 제공한다. 실제 배송원이나 고객의
이름, 전화번호, 주소, 사진을 사용하지 않고 다음 기능을 검토할 수 있는 전용
테스트 배차를 준비한다.

- 로그인
- 배송 목록과 배송지 정보
- 지도와 사용 중 위치 권한
- 배송 시작/완료
- 카메라 또는 앨범 증빙
- 설정의 계정 삭제 요청

현재 회원가입은 로그인 화면의 `회원가입` 버튼에서 이름과 휴대전화 번호로
진행한다. App Review에는 이미 생성된 만료되지 않는 데모 계정을 제공한다.

## 5. App Privacy 초안

아래 표는 현재 `dev` 소스의 데이터 흐름을 기준으로 한 기술 초안이다. App Store
Connect 답변은 최종 바이너리와 서버 운영 정책을 반영해 운영/법무가 최종 승인한다.

| Apple 데이터 유형 | 현재 앱 동작 | 초안 |
| --- | --- | --- |
| 이름 | 가입/계정 연결을 위해 서버 전송 | 사용자와 연결, App Functionality |
| 전화번호 | 가입/계정 연결을 위해 서버 전송 | 사용자와 연결, App Functionality |
| User ID | 로그인 ID와 서버 계정 ID 사용 | 사용자와 연결, App Functionality |
| 사진 또는 비디오 | 배송 완료 증빙 사진 업로드 | 사용자와 연결, App Functionality |
| 정확한 위치 | 지도 화면에서 현재 위치를 기기 안에서만 표시 | 현재 소스 기준 수집하지 않음 |
| Device ID/푸시 토큰 | 현재 구현은 Android 전용 | iOS 수집 없음, 최종 바이너리 재확인 |
| 배송 이벤트 | 시작·완료 시각과 배차/배송지 식별자를 서버 전송 | Apple 분류와 보관 목적 확정 필요 |
| 진단/광고/추적 | 분석·광고 SDK 없음 | 수집/추적 없음, 의존성 재확인 |

최종 가입 화면이 주민등록번호 앞자리 같은 추가 정보를 수집하면 이 표와 공개
개인정보처리방침을 먼저 갱신하고 민감정보 수집의 법적 근거와 최소성을 별도로
승인받는다.

## 6. 한국어 메타데이터 초안

### 부제

`DSV 배송원 전용 배송 앱`

### 설명

```text
CLEVER Driver는 DSV 배송원이 배정된 배송 업무를 확인하고 수행하기 위한 전용 앱입니다.

주요 기능
- 배정된 배송지와 주문 확인
- 배송 순서와 경로 확인
- 배송지 묶음 반납, 확보 및 전달
- 배송 시작과 완료 기록
- 카메라 또는 사진 앨범을 이용한 배송 증빙 등록

앱 사용에는 승인된 CLEVER Driver 계정이 필요합니다. 설치 링크만으로는 배송 정보에 접근할 수 없습니다.
```

### 키워드

`배송,배송원,배차,경로,지도,DSV,물류,증빙`

### 심사 노트 초안

```text
CLEVER Driver is a native operational app for a limited audience of DSV delivery drivers.
We are requesting unlisted App Store distribution. The app must not be made searchable or publicly promoted.

Use the non-expiring review account entered in the App Review credentials fields. The review account contains synthetic route and delivery data only.

Location permission is requested only while the map screen is open to show the user's current position on device. The app does not collect background location or upload the device's current position in the submitted version.

Camera and photo-library permissions are requested only when the reviewer chooses to attach proof after completing a delivery.

Account deletion can be initiated from Settings. An active delivery route must be completed or released before the server accepts the deletion request.
```

실제 연락처, 데모 계정과 비밀번호는 이 문서나 Git에 기록하지 않고 App Store
Connect의 전용 필드에만 입력한다.

## 7. 앱 아이콘과 스크린샷

- 앱 아이콘: 1024×1024 PNG, 알파 채널과 둥근 모서리 없음
- iPhone 스크린샷: 6.9형 세트 1~10장
- 대표 세로 크기: 1320×2868, 1290×2796 또는 1260×2736
- 실제 최종 바이너리와 비식별 데모 데이터로 촬영
- 로그인, 배송 목록, 지도, 배송 완료, 증빙, 설정/계정 삭제를 포함

공식 규격:
<https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/>

## 8. 최종 게이트

다음 항목이 모두 충족되기 전에는 App Review 제출이나 릴리스를 실행하지 않는다.

- [x] 릴리스 소스와 계약 문서 재대조
- [x] SDK 56 TestFlight 실기기 실행 확인, SDK 57 전환은 후속 작업으로 분리
- [x] high 감사 항목이 Expo/Metro 빌드 도구 경로임을 확인하고 강제 수정하지 않음
- [x] EAS 조직 owner와 프로젝트 연결 확인
- [ ] Apple Developer 조직 가입, 계약, Team ID 확인
- [ ] 조직용 Apple Distribution/EAS remote signing credentials 준비
- [x] App Store Connect 앱과 `ascAppId` 생성
- [x] 최종 앱 아이콘 적용
- [x] 계정 삭제 UI와 서버 오류 처리 로컬 검증
- [ ] Driver 개인정보처리방침 공개 URL 배포·확인
- [ ] 실제 연락처가 있는 Driver Support URL 배포·확인
- [ ] 비식별·비만료 App Review 계정 준비
- [ ] App Privacy 답변 확정
- [ ] iPhone 6.9형 스크린샷 준비
- [ ] 계정 삭제 UI를 포함한 새 EAS production 빌드 성공
- [x] 기존 TestFlight build 설치·실행 확인
- [ ] 새 TestFlight build에서 로그인·권한·지도·증빙·계정 삭제 검증
- [ ] App Review 제출 시 수동 릴리스 선택
- [ ] Unlisted 요청 승인과 배포 방식 표시 확인
- [ ] 승인 뒤에만 정식 버전 수동 릴리스
