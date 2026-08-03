# CLEVER Driver Agent Rules

## 문서 역할

이 파일은 `clever-driver-app`에서 작업하는 agent의 실행 규약이다.
제품 목적과 범위는 `docs/project-brief.md`, 기술 선택은
`docs/technology-stack.md`를 정본으로 사용한다.

## 프로젝트 연결값

- project-start issue: `EVNSolution/clever-change-control#240`
- change-control issue: `EVNSolution/clever-change-control#240`
- target repo issue: `EVNSolution/clever-driver-app#1`
- target repo: `EVNSolution/clever-driver-app`
- target service: `clever-driver-app`
- reference app: `../clever-routes-app`
- default integration branch: `dev`

확정되지 않은 연결값은 추측해서 채우지 않는다.

## 제품 경계

- 이 앱은 DSV 배송원을 위한 독립 모바일 제품이다.
- `CLEVER Routes`의 Shopify 인증, 호스팅, API 계약을 가져오지 않는다.
- DSV 서버가 계정 연결과 배송지 배정의 최종 권위다.
- 로그인 아이디와 비밀번호를 사용하고, 가입 기본 입력은 이름, 휴대전화 번호,
  주민등록번호 앞 7자리로 유지한다.
- 계정과 DSV 배송원 정보의 연결 기준은 승인된 DSV 서버 계약을 최종 권위로
  둔다.
- 배정 변경 단위는 개별 물품이 아니라 배송지별 전체 묶음이다.
- 반납된 배송지 묶음은 미배정 목록에서 서버 선착순으로 확보한다.

## 구현 원칙

- Expo와 React Native의 기존 패턴을 우선한다.
- TypeScript strict를 유지한다.
- 서버 계약이 확정되기 전에 예상 API, 권한, 캐시, 동기화 또는 범용 상태
  관리 계층을 구현하지 않는다.
- 인증 API와 비밀번호 정책이 확정되기 전 예상 엔드포인트, 세션 또는 자격
  증명 저장을 추가하지 않는다. 앱은 승인된 DSV API만 호출한다.
- 지도, 위치 추적, 카메라, 알림과 네이티브 디렉터리는 실제 기능 범위가
  확정된 작업에서만 추가한다.
- 새 추상화는 중복이나 복잡도를 실제로 줄일 때만 만든다.
- 기존 `CLEVER Routes` 코드를 복사할 때는 DSV 계약에 필요한 최소 부분만
  선택하고 Shopify 전용 개념을 함께 가져오지 않는다.

## UI 명칭

- 탭, 메뉴, 페이지와 섹션 제목은 하나의 명확한 개념만 표현한다.
- `물품·배송`, `배정/교환`처럼 서로 다른 개념을 기호로 묶어 이름 짓지 않는다.
- 배정 상태는 배송지 묶음에만 사용한다. 개별 물품에 `미배정` 또는 `배정됨`
  상태를 부여하지 않는다.

## 작업 절차

1. `git status --short --branch`로 현재 상태를 확인한다.
2. 비사소한 구현 전 target issue와 change-control issue를 연결한다.
3. 원격 저장소가 준비된 뒤에는 GitHub Development linked branch를 `dev`에서
   생성한다.
4. 작업 전 `docs/project-brief.md`와 관련 계약 문서를 읽는다.
5. 기능 또는 버그 변경은 가장 가까운 회귀 테스트를 먼저 둔다.
6. 구현 후 `npm run check:workspace`, `npm run lint`,
   `npx expo install --check`, `git diff --check`를 실행한다.
7. 검증하지 못한 항목과 외부 계약의 미정 사항을 완료 보고에 남긴다.

GitHub 저장소 생성, ruleset 또는 branch protection 같은 외부 변경은 별도
control-plane preflight와 명시적인 대상 저장소가 준비된 뒤 진행한다.

## 브랜치 운영

- `main`: 배포 기준
- `dev`: 통합 기준
- 작업 브랜치: `cc-<change-control-issue-number>-<short-scope>`

초기 원격 저장소가 만들어진 뒤에는 `main` 또는 `dev`에 직접 기능을
구현하거나 push하지 않는다. 연결된 issue가 없는 임의 작업 브랜치를 만들지
않는다.

## 완료 조건

- 의도한 파일만 변경했다.
- 가까운 테스트, 전체 테스트, lint와 typecheck를 통과했다.
- Expo 의존성 버전 정합성을 확인했다.
- API, 인증, 개인정보 또는 배포 계약의 미정 내용을 구현으로 가정하지 않았다.
- 서비스 책임이나 public contract 변경 시 문서 반영 여부를 확인했다.
