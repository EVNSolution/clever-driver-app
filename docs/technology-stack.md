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
| 배송 증빙 선택 | Expo ImagePicker | 카메라 촬영과 앨범 사진 선택을 Expo SDK에 맞게 처리 |
| 배송 증빙 업로드 | Expo FileSystem + Expo Fetch | 로컬 사진 URI를 `File`로 변환해 표준 멀티파트 파일로 전송 |
| 전화번호 처리 | libphonenumber-js | 국가번호와 E.164 정규화 |
| 테스트 | Node test runner + tsx | 도메인 테스트를 네이티브 런타임과 분리 |
| 정적 검사 | Expo ESLint + `tsc --noEmit` | 기존 검증 명령 유지 |
| 지도 | MapLibre React Native 11.3.4 | `CLEVER Routes`와 같은 네이티브 지도 경로 사용 |
| 지도 스타일 | OpenFreeMap Liberty | Routes의 기본 미리보기 스타일과 정렬 |
| 제스처 | React Native Gesture Handler | 드래그 입력을 네이티브 UI 스레드에서 처리 |
| 애니메이션 | React Native Reanimated + Worklets | React 재렌더 없이 주문 위치를 UI 스레드에서 전환 |
| Android 배포 | EAS/Gradle release APK + 고정 Google Drive 파일 | 직접 설치 APK 정본과 업데이트 서명 유지 |
| iOS 배포 | EAS production + TestFlight + Unlisted App Store | 파일럿과 정식 비공개 링크 배포를 분리 |

## 현재 제외

- 상태 관리 라이브러리: 실제 공유 상태와 재사용 요구가 없다.
- API 클라이언트 라이브러리: 현재 승인된 인증 호출은 표준 `fetch`로 충분하다.
- 내비게이션 라이브러리: 승인된 두 화면은 최상위 상태 전환으로 충분하다.
- 백그라운드 위치 추적, 경로 계산, 알림: 현재 범위에 포함되지 않는다.
- 웹앱과 PWA: 네이티브 권한·지도·증빙 기능의 배포 대안으로 만들지 않는다.
- iOS Ad Hoc 정식 배포와 Enterprise 배포: 내부 QA가 아닌 배송원 운영 경로로
  사용하지 않는다.

## 지도 경계

지도 화면은 `@maplibre/maplibre-react-native` 11.3.4와
`https://tiles.openfreemap.org/styles/liberty`를 사용한다. 앱은 배송지 좌표로
경로를 계산·보간하거나 직선 연결하지 않는다. 경로 선은 DSV 서버가
OSRM/VWorld로 생성해 응답한 GeoJSON `LineString` geometry만 수정 없이
MapLibre source에 전달한다. geometry가 없으면 배송지 표식만 표시한다. GPS
전체 지도 화면에서만 사용 중 위치 권한을 요청하고 MapLibre `UserLocation`의
기본 위치점, 정확도 원과 방향 표시를 사용한다. 순서 편집의 지도 미리보기에서는
위치를 요청하지 않으며 백그라운드 위치 권한과 추적은 사용하지 않는다.

## 순서 편집 경계

주문 드래그 중에는 React 주문 배열이나 MapLibre source를 변경하지 않는다.
Gesture Handler가 입력을 받고 Reanimated shared value가 화면상 주문 위치만
변경한다. 손을 놓은 뒤 최종 위치를 주문 배열에 한 번 반영하며, 지도 마커도
그 확정된 배열로 한 번 갱신한다. 이 규칙은 드래그 중 JS 재렌더와 지도 native
source 갱신이 프레임 연속성을 방해하지 않도록 하기 위한 것이다.

## 인증 경계

비밀번호 검증, 계정 생성, 로그인 세션과 DSV 배송원 연결은 서버가 소유한다.
앱은 승인된 DSV 인증 API 계약에 따라 가입과 로그인 요청을 전송하고, 응답
access token과 계정 정보는 화면 메모리에만 두고, 30일 refresh token과
만료 시각만 Expo SecureStore에 보관한다. 기본 API 주소는
`https://clever-route-api.cleversystem.ai`이며 `EXPO_PUBLIC_DSV_API_BASE_URL`로
재정의할 때는 localhost 또는 `127.0.0.1` 개발 서버를 제외하고 HTTPS여야 한다. 토큰
앱 시작 시 refresh token으로 DSV 세션을 복원하고 access token 만료 1분 전
자동 갱신한다. 로그아웃과 만료 세션은 SecureStore에서 삭제하며
비밀번호와 access token은 영구 저장하지 않는다.

회원가입은 로그인 화면의 버튼으로 진입한다. 앱은 이름과 휴대전화 번호를 서버에 보내고,
서버가 같은 이름과 정규화된 전화번호를 가진 활성·미연결 DSV 배송원만 원자적으로
연결한다. 기존 `clever-driver://signup?token=...` 링크는 설치된 구버전 앱 호환을 위해
인식하지만 신규 안내나 가입 권한에는 사용하지 않는다.

## 확장 기준

새 패키지는 다음 세 조건을 모두 만족할 때만 추가한다.

1. 승인된 사용자 기능에 직접 필요하다.
2. Expo 56과의 버전 정합성이 확인된다.
3. 표준 라이브러리나 현재 의존성으로 해결할 수 없다.
