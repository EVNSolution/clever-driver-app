# iOS TestFlight release

`CLEVER Driver`는 Expo와 React Native의 같은 소스에서 iOS 앱을 만든다. `app.json`의
bundle ID는 `com.evnsolution.clever.driver`, EAS 소유자는 `evandsolution`이다.

## 빌드 프로필

- `npm run build:ios`는 iOS JavaScript bundle을 로컬에서 검증한다. 서명된 IPA가 아니다.
- `npm run build:ios:preview`는 등록된 내부 기기용 EAS 후보를 만든다.
- `npm run build:ios:production`은 TestFlight 제출 전 App Store용 archive를 만든다.

## 최초 1회 준비

1. EV&Solution Apple Developer Team에서 `com.evnsolution.clever.driver` App ID를 만든다.
2. EAS의 iOS build credentials를 해당 Apple Team으로 생성한다.
3. App Store Connect에 CLEVER Driver 앱 레코드를 만들고 bundle ID를 연결한다.
4. 개인정보 처리방침, 지원 URL, 앱 아이콘, 스크린샷과 App Privacy 답변을 검토한다.

Apple 로그인과 서명 권한은 저장소에 넣지 않는다. EAS remote credentials 또는 승인된
App Store Connect API key만 사용한다.

## TestFlight 게시

```bash
npm run build:ios:production
npx eas-cli submit --platform ios --profile production
```

처음 게시할 때는 Apple Developer Team, App Store Connect 앱 레코드와 심사 메타데이터가
모두 준비됐는지 확인한다. 게시 후 DSV 설치 페이지의 iPhone 버튼을 실제 TestFlight 공개
링크로 교체하고 아이폰 실기기에서 설치, 로그인, 회원가입, 배송 조회와 지도 열기를 검증한다.
