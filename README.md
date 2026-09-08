# CLEVER Driver

DSV 배송원이 계정을 만들고 자신의 배송 업무를 확인하며, 배송지 단위의
업무를 반납하거나 선착순으로 확보하는 iOS/Android 앱입니다.

## 기술 기반

- Expo SDK 56
- React Native 0.85
- React 19
- TypeScript strict
- MapLibre React Native
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

현재 DSV 계정 가입·로그인과 연결 상태 확인, 서버 배차·배송 조회, 배송지별
수동 순서 저장과 MapLibre 지도를 제공합니다. 수동 순서는 `routeVersionId`가
있는 배차에서 전체 stop 순열과 현재 서버 버전을 승인된 DSV API에 보내고 정본
응답을 채택합니다. 레거시 배차처럼 버전이 없으면 저장을 제공하지 않습니다.
지도 경로는 클라이언트가 만들지 않으며 서버가 OSRM/VWorld로 생성한 geometry가
있을 때만 표시합니다. 배송지 묶음 반납·확보도 승인된 DSV API를 사용합니다.
