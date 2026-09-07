# 배송원 문의사항

연결: `EVNSolution/clever-driver-app#1`, `EVNSolution/clever-change-control#240`.
이번 변경은 문의 앱 UI와 확정 DSV 계약 연결만 포함한다. 자동 완료·순서 저장,
관리자 웹, 첨부·답변·문의 수정/삭제, 앱 버전과 스토어 제출은 포함하지 않는다.

## 사용자 흐름

`로그인 → 환경설정 → 문의사항`에서 본인 문의를 최신순으로 확인한다.
문의 작성은 제목·내용만 입력하며 작성자·작성 날짜와 시각은 서버 응답을 표시한다.
문의 선택 시 인증된 상세 API로 다시 조회한다. 긴 글과 큰 글꼴은 줄바꿈·스크롤로
읽고, 작성 화면은 키보드를 고려한 스크롤을 사용한다.

미전송 입력은 작성/목록 화면 이동 및 실패 재시도 중 유지한다. 서버가 성공을
확인한 뒤 입력을 비운다. 설정을 닫거나 로그아웃·계정 전환으로 화면이 해제되면
메모리 상태를 폐기하며 기기에 문의 본문이나 토큰을 별도로 저장하지 않는다.

## 확정 서버 계약

2026-09-07 서버 소유자 확정 계약을 배포 채팅이 전달했다. 기본 주소는
`https://clever-route-api.cleversystem.ai`이며 경로 토큰 대신 DSV 계정 accessToken을
Bearer 인증에 사용한다.

| 요청 | 계약 |
|---|---|
| `POST /api/dsv/driver/inquiries` | JSON `{title,body}`만 전송. trim 기준 제목 1–120자, 내용 1–4000자(JS length). UUID `Idempotency-Key` 필수 |
| `GET /api/dsv/driver/inquiries?limit=20&cursor=...` | `{items,nextCursor}`. `createdAt desc,id desc`. cursor는 불투명 문자열로 전달 |
| `GET /api/dsv/driver/inquiries/:id` | `{inquiry}`. 타인 ID와 없는 ID 모두 `404 NOT_FOUND` |

성공 envelope는 `{data,error:null}`이다. inquiry는
`{id,title,body,authorName,createdAt}`이며 `createdAt`은 ISO UTC이다.
생성은 201 `{inquiry,duplicate:false}`, 동일 계정·키·trim 내용 재전송은
200 `{inquiry,duplicate:true}`다. 같은 키의 다른 내용은 409 `IDEMPOTENCY_CONFLICT`다.
실패 envelope는 `{data:null,error:{code,message}}`이고 화면은 code에 따라
한국어로 안내하며 서버 message를 그대로 표시하지 않는다.

전송 재시도는 같은 키를 유지한다. 서버에서 응답을 받지 못한 경우 저장 여부를
단정하지 않는다. 목록·상세의 늦은 응답은 새 요청 또는 화면 해제 후 반영하지 않는다.
요청은 20초 뒤 취소하며, 시간 초과 뒤 재시도에도 같은 작성 시도 키를 사용한다.

## 배포 전 실제 앱 확인 절차

서버 문의 API 배포가 선행되어야 한다. 새 바이너리 설치·스토어 심사 빌드 교체는
배포 채팅이 수행하며 기존 심사 계정 비밀번호·기기 앱 데이터는 변경하지 않는다.

1. 서버 담당이 준비한 합성 계정 A로 로그인하고 환경설정 → 문의사항에 진입한다.
2. 빈 목록, 제목·내용 입력, 중복 탭 방지, 접수 후 서버 작성자·시각 및 상세를 확인한다.
3. 목록 새로고침과 20개 초과 추가 조회를 확인한다. 본문은 plain text여야 한다.
4. 통신 실패 후 입력 보존과 재시도를 확인하고 서버에 같은 문의가 한 번만 저장되는지 확인한다.
5. 시스템 글꼴을 크게 설정한 QA 기기에서 긴 한글 제목·본문, 키보드 열린 상태의
   내용 편집·제출 버튼 접근, 목록/상세 스크롤과 Android 뒤로가기를 확인한다.
6. 로그아웃 후 합성 계정 B로 로그인하여 A의 입력·목록·상세가 남지 않는지 확인한다.

자동 테스트는 API 요청·응답 계약과 실제 React hook의 비동기 제어를 검증한다.
Node의 네이티브 대체 실행은 실제 기기 레이아웃·키보드·제스처 검증을 대신하지 않는다.

## 앱 코드 검증 결과

- 전체 테스트 146/146: 기존 132개 + 문의 API 계약 5개 + 실제 hook 제어 9개 통과.
- typecheck, lint, Expo 의존성 정합성과 diff 검사 통과. 새 의존성 없음.
- Android export 1,306 modules, iOS export 1,291 modules 통과.
- export 증거는 로컬
  `~/.codex/build-hygiene/logs/driver-inquiries/20260907T133228.203985+0900-7f2232027858-inquiries-token-refresh/summary.json`.
- 같은 계정의 토큰 갱신 중 열린 상세를 새 토큰으로 재조회하며, 이전 응답을
  무시하고 이미 닫은 상세가 다시 열리지 않는 회귀를 포함한다.
- 이 소스 검증 시점에 문의 기능의 실기기 UI와 운영 두 계정 E2E는 미검증이다.
  연결된 배포 담당 기기의 기존 앱·로그인 세션을 변경하지 않았다.
