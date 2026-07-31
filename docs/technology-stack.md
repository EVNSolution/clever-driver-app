# Technology stack

## 선택

| 영역 | 선택 | 기준 |
|---|---|---|
| 앱 런타임 | Expo SDK 56 | `CLEVER Routes`와 같은 검증 경로 사용 |
| 모바일 프레임워크 | React Native 0.85 | iOS와 Android 단일 코드베이스 |
| UI 런타임 | React 19 | Expo 56 정렬 버전 |
| 언어 | TypeScript 6 strict | 계약과 상태 전이의 정적 검증 |
| 패키지 관리 | npm lockfile | 기존 앱과 같은 설치·CI 흐름 |
| Node.js | 20.19.4 이상 | 기존 앱 엔진 기준 |
| 민감정보 저장 | Expo SecureStore | 추후 승인된 인증 토큰 저장 |
| 전화번호 처리 | libphonenumber-js | 국가번호와 E.164 정규화 |
| 테스트 | Node test runner + tsx | 도메인 테스트를 네이티브 런타임과 분리 |
| 정적 검사 | Expo ESLint + `tsc --noEmit` | 기존 검증 명령 유지 |
| 배포 준비 | EAS preview/production profiles | 내부 APK와 스토어 빌드 분리 |

## 초기 제외

- SMS 제공업체 SDK: 업체와 서버 계약이 미정이다.
- 상태 관리 라이브러리: 실제 공유 상태와 재사용 요구가 없다.
- API 클라이언트 라이브러리: 승인된 DSV API 계약이 없다.
- 내비게이션 라이브러리: 화면 정보 구조가 아직 구현 작업으로 승인되지 않았다.
- 지도, 위치, 카메라, 알림: 현재 첫 기능 범위에 포함되지 않았다.
- `android/`, `ios/`: 네이티브 설정이 필요한 기능을 시작할 때 Expo prebuild로 생성한다.

## 인증 경계

SMS 발송과 인증 비밀값은 서버가 소유한다. 앱에 SMS 제공업체 secret을 넣거나
업체 API를 직접 호출하지 않는다. 앱은 후속 DSV 인증 API 계약을 통해 인증
요청과 확인 결과만 주고받는다.

## 확장 기준

새 패키지는 다음 세 조건을 모두 만족할 때만 추가한다.

1. 승인된 사용자 기능에 직접 필요하다.
2. Expo 56과의 버전 정합성이 확인된다.
3. 표준 라이브러리나 현재 의존성으로 해결할 수 없다.
