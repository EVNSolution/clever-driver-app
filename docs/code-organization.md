# Code organization

`CLEVER Driver`는 `CLEVER Routes`의 검증된 구분을 참고하되, 실제 기능이
생기기 전에는 빈 계층을 만들지 않는다.

```text
src/
  app/       앱 조립과 최상위 런타임
  config/    앱 식별자와 런타임 설정 검증
```

기능이 승인되면 다음 기준으로만 확장한다.

- `domain/`: React Native에 의존하지 않는 업무 규칙과 상태 전이
- `api/`: 승인된 DSV API 계약의 요청과 응답 어댑터
- `ui/`: 화면과 재사용이 확인된 시각 컴포넌트

화면 파일에서 예상 API를 직접 만들거나 서버 상태를 흉내 내지 않는다.
도메인 규칙은 가능한 한 순수 TypeScript로 두고 Node test runner로 검증한다.
