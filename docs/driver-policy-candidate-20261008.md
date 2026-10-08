# Driver 0.2.0 출시 검사 후보

확인일: 2026-10-08, Asia/Seoul. 이 기록은 소스 후보의 검증이다.
서명 APK/AAB 생성, 설치, 게시 또는 운영 배포 완료를 뜻하지 않는다.

## 연결과 보존

- Target: [Driver #66](https://github.com/EVNSolution/clever-driver-app/issues/66).
- Change-control: [#315](https://github.com/EVNSolution/clever-change-control/issues/315).
- 연결 브랜치: `cc-315-driver-policy-candidate`, PR 기준 `dev`.
- 별도 worktree에서 PR65 `047d57fdb783294ba4a48e62715387842cd8f65c`를 포함했다.
- PR61 `a7959e5a84393d7dc57e2caa654ea2f8edad202c`, PR64
  `6e2db49e0415786c018762a26a6b136bcef5b743`, PR65 원본을 보존한다.
- 서버 기준: [PR488 b3710cad863a8c12d2a7e38a90486cc8010c5722](https://github.com/EVNSolution/clever-route-server/pull/488).
- [확정 서버 계약](https://github.com/EVNSolution/clever-route-server/blob/b3710cad863a8c12d2a7e38a90486cc8010c5722/docs/contracts/dsv-operations-policy-20261008.md)을 대조했다.
  지정됐던 로컬 서버 worktree는 없어 Git 객체에서 계약을 읽고 동일 SHA를 격리 검사에 사용했다.
- 현재 작업과 별도로 실기기를 사용하는 작업을 확인했다. 실기기 및 다른 작업의 프로세스는 조작하지 않았다.

## 변경 동작

미배송 보고는 자유 텍스트 `reason`만 전송한다. 앞뒤 공백 제거 후 필수이며 최대 1,000자다.
탭과 줄바꿈은 허용하고 그 외 제어 문자는 거부한다. 사진 없이 보고할 수 있다.
접수 뒤 “미배송 보고가 접수되었습니다”를 표시한다. `PREPARED`는 메일 발송 완료가 아니다.
보고 때문에 배송 완료·실패 이벤트를 생성하지 않는다.

입력 초안은 계정·회차·배정·버전·배송지별로 기기에 저장한다. 전송 전 명령을 영속화한다.
재시도와 재실행은 원래 commandId, occurredAt, 배정·버전과 본문을 유지한다.
접수 대기 중인 본문은 편집하지 못한다. 기존 reasonCode/explanation 큐는 변환 없이 재전송한다.
완료 결과 복구, 사진 없는 완료, 선택 사진 증빙, 알림 클릭과 입력 보호는 PR65 흐름을 유지한다.

`eas.json` production과 로컬 release APK 명령은 운영 알림·업무 기능을 포함한다.
일반 개발 빌드는 명시적으로 플래그를 켜기 전 OFF다. 합성 알림 검증은 계속 별도 package와 loopback 조건을 요구한다.
서버 GPS 전송, 서버 최신 버전 안내와 최소 지원 버전은 변경하지 않는다.

## 버전 결정

| 확인 대상 | 확인값과 결정 |
| --- | --- |
| 표시 버전 | `app.json`의 `0.2.0` |
| EAS 원격 Android 번호 | `build:version:get --platform android --profile production --json`: `26` |
| EAS Android 빌드 이력 | 조회된 11개 기록의 최대 번호 `22`, 버전 `0.1.14`, build `85985198-1b86-4a8d-bdf6-07f347c98a5c` |
| 기존 앱 후보·사용 이력 | PR65의 `0.1.15(26)` 및 이전 검증 문서의 일반 package 사용 기록 |
| 새 로컬 번호 | 기존 최대 확인값 26보다 큰 `27` |
| 실제 EAS 후보 번호 | `appVersionSource: remote`, `autoIncrement: true` 유지. 조회 당시 다음 번호는 27이며 실제 빌드 전에 다시 조회하고 결과물에서 확정해야 한다. |

EAS 번호를 예약하거나 변경하지 않았다. 빌드도 요청하지 않았다.
후보 표시 버전은 운영 버전과 달라도 정상이다. 생성한 Android Gradle 설정에서 `0.2.0(27)`을 확인했다.
iOS buildNumber는 이번 Android 후보에서 변경하지 않았다.

## Android 네이티브 템플릿

공식 `expo@56.0.23` tarball의 내장 template.tgz는 `57.0.9`이며 Expo57/RN0.86을 참조한다.
로컬 파일과 공식 tarball의 바이트가 같아 로컬 오염이 아님을 확인했다.
공식 `expo-template-bare-minimum@56.0.37`은 현재 Expo56.0.23/RN0.85.3과 일치한다.

로컬 prebuild와 EAS preview/production의 Android prebuild에 `56.0.37`을 고정한다.
기존 native 생성물에 템플릿 표식이 없거나 버전이 바뀌면 helper가 최초 한 번 재생성한다.
템플릿과 생성 모드가 같으면 기존 native 폴더를 재사용한다. 전역 Gradle 캐시는 삭제하지 않는다.
EAS의 Android `prebuildCommand`는 [공식 설정 스키마](https://docs.expo.dev/build/eas-json/#schema)를 따른다.

## 검증 결과

| 검사 | 결과 |
| --- | --- |
| `npm run check:workspace` | PASS: typecheck와 418/418 테스트, 제외 0 |
| `npm run lint` | PASS |
| `npx expo install --check` | PASS: 현재 Expo56 의존성 정합성 |
| `git diff --check` | PASS |
| 운영 기능 ON Android export | PASS: Metro 1 worker, 1,319 modules, Hermes bundle 및 source map 생성 |
| Android 생성 격리 검사 | PASS: SDK56 템플릿, 일반/격리 package 전환, Firebase 잔류 방지, `0.2.0(27)` |
| EAS production 설정 해석 | PASS: operational=true, 공식 API, SDK56 Android prebuildCommand, 원격 번호 자동 증가 |
| 실제 앱 client + 서버 PR488 + 격리 PostgreSQL17 | PASS: 115 migrations, 6개 시나리오 그룹 |
| 독립 코드 검토 | 승인: 미해결 P1/P2 없음, 검토자가 관련 회귀 77개 추가 실행 |
| 기존 `npm audit --audit-level=moderate` | FAIL: high20/critical0, Issue62 유지 |

격리 API 검사는 실제 앱 API·큐를 실행한다. 자유 텍스트 경계와 접수 영수증,
동시 중복/본문 충돌, 응답 유실 후 오프라인 디스크 재로드, 구형 큐 재전송,
배정 변경 차단, 알림 목적지 해석·사진 없는 완료·재배정 후 완료 결과 복구를 확인했다.
오프라인과 응답 유실은 테스트 전송 계층에서 재현한다. 실제 푸시·메일 provider는 연결하지 않았다.
검사 뒤 소유 PostgreSQL을 종료하고 일회성 데이터 75MiB를 삭제했다.

재현 스크립트는 `scripts/test-dsv-policy-api.mjs`다. 스크립트 상단의 환경 변수를 사용한다.
정확한 서버 SHA의 소스·의존성·Prisma client와 신규 로컬 DB의 115개 마이그레이션이 선행 조건이다.
이 검사는 외부 서버 소스를 요구하므로 일반 CI의 자동 테스트에는 포함하지 않는다.

로컬 증거는 `/tmp/dsv-driver-policy-evidence`에 보관한다. `api-output.log`,
`provenance.json`, `eas-version.json`, `eas-builds.json`, `npm-audit-final.json`,
`android-generation-sdk56/result.json`과 `build-logs`를 포함한다.
export는 이 worktree의 `dist/android`에 보존한다. 임시 native 생성 작업공간은 제거했다.
검사 시 인증 자료를 복사하지 않아 export에서 로컬 google-services.json 부재 경고가 있었다.
export는 exit0이다. 실제 서명 빌드의 Firebase/서명 설정 검증을 대신하지 않는다.

최종 HEAD CI 링크와 최종 SHA는 PR 본문에 기록한다. CI 정의와 audit 기준은 변경하지 않는다.

## Issue62 보안 차단

2026-10-08 공식 registry와 advisory를 다시 확인했다. 지원되는 수정 버전이 없다.

| 원인 | 최신 버전 | 공식 근거 |
| --- | --- | --- |
| braces | `3.0.3`, patched version 없음 | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) |
| node-forge | `1.4.0`, patched version 없음 | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) |

Expo56 최신 `56.0.23`와 CLI `56.1.26`을 이미 사용한다. 최신 micromatch4.0.8과
@expo/code-signing-certificates0.0.7도 위 의존성을 유지한다.
`npm audit --audit-level=moderate`는 high20/critical0으로 실패한다.
20개는 두 원인의 전이 의존성 항목이다. 20개의 독립 취약점을 뜻하지 않는다.
audit의 Expo44 강제 하향 제안은 현재 지원 계약에 맞지 않아 적용하지 않았다.
package-lock과 의존성 버전, audit 기준을 유지했다. [Issue62](https://github.com/EVNSolution/clever-driver-app/issues/62)는 출시 차단이다.

## 출시 검사에 넘길 항목

1. 보안 차단 수정 후 같은 audit 기준과 최종 HEAD CI를 다시 통과한다.
2. 서버 PR488의 운영 적용·마이그레이션·기능 허용 상태를 출시 담당자가 확인한다.
3. EAS 원격 번호와 새 사용 이력을 다시 확인한 뒤 승인된 서명 APK/AAB를 생성한다.
   실제 versionCode, package, 서명, ABI, SHA256과 소스 SHA를 기록한다.
4. **다른 작업 사용 중 — 실기기 검증 대기**: 새 0.2.0 후보의 실제 키보드·다중 행 입력,
   오프라인 강제 종료 후 복구, 완료 복구, 사진 없는 완료, 카메라/앨범 증빙,
   알림 클릭 중 입력 보호를 확인한다. 기존 PR65의 실기기 결과를 이 SHA의 증거로 대체하지 않는다.
5. 실제 FCM과 메일은 별도 발송 권한·설정과 검증이 필요하다. 이번 검사에는 실제 발송을 포함하지 않는다.
6. 서버 GPS 실발송은 계속 비활성으로 유지한다. 실차 검증은 별도 범위다.

실기기가 사용 가능해져도 이번 작업의 기기 조작 제외는 유지한다.
Play/Drive 게시, 병합, 운영 배포, 서버 버전 정책 변경은 하지 않았다. C1은 재조사하지 않았다.
