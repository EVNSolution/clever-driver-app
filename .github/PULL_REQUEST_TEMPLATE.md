# CLEVER Driver change

- target repo: `EVNSolution/clever-driver-app`
- target service: `clever-driver-app`
- target branch: `dev` / `main`
- source branch:
- project-start issue:
- change-control issue:
- target repo issue:

## 변경 내용

-

## 범위 확인

- DSV 전용 제품 경계를 유지했다.
- CLEVER Routes의 Shopify API 또는 인증 계약을 가져오지 않았다.
- 확정되지 않은 API, 권한, 캐시 또는 동기화를 미리 구현하지 않았다.
- UI 제목은 하나의 업무 개념만 나타낸다.

## 검증

- [ ] `npm run check:workspace`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm audit --audit-level=moderate`
- [ ] `npx expo install --check`
- [ ] `git diff --check`

## 외부 계약

- API 또는 서비스 문서 반영:
- 개인정보 또는 SMS 인증 검토:
- 미정 사항:
