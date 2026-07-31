# CLEVER Driver

DSV 배송원이 계정을 만들고 자신의 배송 업무를 확인하며, 배송지 단위의
업무를 반납하거나 선착순으로 확보하는 iOS/Android 앱입니다.

## 기술 기반

- Expo SDK 56
- React Native 0.85
- React 19
- TypeScript strict
- npm + Node.js 20.19.4

자세한 선택 근거와 추가 의존성 기준은
[`docs/technology-stack.md`](docs/technology-stack.md)를 참고합니다.

## 시작

```bash
nvm use
npm install
npm start
```

## 검증

```bash
npm run check:workspace
npm run lint
npx expo install --check
```

## 현재 범위

현재 저장소는 앱 런타임과 개발 규약만 초기화한 상태입니다. DSV API, SMS 인증
제공업체, 자동 연결, 배송 조회와 배정 변경은 승인된 API 계약과 후속 작업
범위가 준비된 뒤 구현합니다.
