# Driver Issue #62 보안 수정 후보

검사일: 2026-10-08, Asia/Seoul.

판정: 실제 앱 의존성에 최소 패치를 적용한 검토 후보다.
**기존 audit는 실패하며 Issue #62와 출시 차단을 유지한다.**
공식 수정 릴리스나 정식 배포 후보로 승인한 결과가 아니다.

## 연결과 보존

- Target: [Driver #62](https://github.com/EVNSolution/clever-driver-app/issues/62).
- Change control: [#315](https://github.com/EVNSolution/clever-change-control/issues/315).
- 기준: [PR #67](https://github.com/EVNSolution/clever-driver-app/pull/67), `4618905e19ee8229b5baab059d3527ceb34585aa`.
- 수정 구현 SHA: `b596688d7c0bf0e754a5787b7b9c4fece6166431`.
- 작업 브랜치: `cc-315-driver-issue62-security`.
- worktree: `/Users/jiin/.codex/worktrees/dsv-driver-issue62-security/clever-driver-app`.
- 증거 루트: `/Users/jiin/.codex/artifacts/dsv-driver-issue62-20261008/`.

Issue #62의 GitHub Development branch를 `dev`에서 생성했다.
새 worktree만 PR #67의 지정 HEAD로 fast-forward했다.
Draft PR은 PR #67 브랜치를 base로 사용하여 보안 변경만 비교한다.
기존 PR #67 worktree의 미커밋 실기기 문서와 28번 산출물은 변경하지 않는다.
보존 전후 해시는 증거 루트의 `preserved-before.json`과 최종 대조에 기록한다.

## 공식 경로 확인과 선택

2026-10-08에 npm registry, GitHub advisory와 upstream PR을 다시 조회했다.

| 항목 | 조회 결과 |
| --- | --- |
| braces | latest 3.0.3. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)의 공식 수정 버전 없음 |
| node-forge | latest 1.4.0. [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)의 공식 수정 버전 없음 |
| Expo SDK 56 | SDK 56 태그의 Expo 56.0.23 / CLI 56.1.26이 현재 설치 버전과 같음 |
| Expo 인증서 도구 | 최신 0.0.7도 node-forge ^1.4.0을 사용함. 이번 취약점의 공식 해결 경로가 아님 |

[Expo 공식 업그레이드 절차](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)는
SDK 정렬과 변경 기록 확인을 요구한다. SDK 전체 교체는 이번 최소 수정 범위에 포함하지 않았다.
조회 원본은 `registry-current.json`, 두 GHSA JSON과 `*-upstream-pr.json`에 보존했다.

선택은 **원래 registry 의존성을 유지한 설치 후 소스 패치**다.
패키지 이름·버전·resolved URL·integrity를 바꾸지 않았다.
새 npm 의존성도 추가하지 않았다. 변경한 lockfile 값은 root `hasInstallScript`뿐이다.

| 패키지 | 고정 upstream SHA | 적용 범위 |
| --- | --- | --- |
| braces 3.0.3 | `97308a01d091b211cf015314a2d0696da28a5392` | parser·AST 순회 깊이를 100으로 제한하는 lib 6개 파일 |
| node-forge 1.4.0 | `ceba34402e329f0365134f23fe19898756527d65` | RSA DigestAlgorithm의 남는 자식 요소를 거부하는 `lib/rsa.js` |

두 PR 모두 조회 시점에 open/unmerged였다.
braces는 PR parent의 미배포 따옴표·점 집합 변경을 함께 가져오지 않았다.
Forge는 NULL parameter가 있는 정상 입력과 없는 정상 입력을 모두 유지한다.

`postinstall`은 모든 locked copy의 이름·버전·원본 SHA256을 검사한다.
패치 자체의 SHA256도 확인하고, Git으로 적용한 뒤 수정 SHA256을 대조한다.
알 수 없는 내용이나 부분 적용은 자동 복구하지 않고 실패한다.
재실행은 정확히 같은 수정본만 허용한다.
workspace 검사도 패치 적용 여부를 먼저 확인한다.

출처·라이선스·파일 해시는 [patches/README](../patches/README.md)와 provenance JSON에 있다.
braces MIT와 Forge 전체 dual-license 고지를 보존했다. Forge는 BSD-3-Clause 조건을 선택한다.

## 실제 설치본 검증

Node는 저장소 CI의 `.nvmrc`와 같은 **20.19.4**, npm은 **10.8.2**다.
공식 Node 배포 archive의 SHA256을 확인했다.
시험은 실제 worktree의 npm 설치본을 대상으로 했다.
별도 upstream 테스트 의존성은 증거 디렉터리에만 설치했다.

| 검사 | 결과 |
| --- | --- |
| 패치 전 취약 동작 | braces 앱 회귀 5 pass / 12 fail, Forge 앱 회귀 7 pass / 2 fail |
| 깨끗한 `npm ci` + postinstall | PASS. 모든 패치 적용 후 SHA256 일치 |
| workspace typecheck / 기존 테스트 | PASS, 418/418, skipped 0 |
| 보안·설치 회귀 | PASS, 31/31, skipped 0 |
| lint | PASS |
| Expo 의존성 정합성 | PASS |
| Android export | PASS, Metro worker 1 |
| iOS export | PASS, Metro worker 1 |
| braces 배포 3.0.3 전체 upstream 검사 | 원본·최소 수정본·실제 앱 설치본 모두 764/764 PASS |
| braces PR의 새 깊이 검사 | 원본 2/14 → 실제 앱 수정본 14/14 PASS |
| braces 고정 PR HEAD 전체 검사 | 실제 앱 수정본 866 pass / 42 fail. 아래 한계 참조 |
| Forge 전체 upstream Node 검사 | 기본·pureJS 모드 각각 829 pass / 4 upstream pending / 0 fail |
| Expo 인증서·서명 호환성 | PASS. 임시 키의 PEM·인증서·CSR·manifest 서명·변조 거부·ASN.1·PKCS#12 |
| Android native release 구성 | PASS. 7분 17초, 608 tasks: 384 executed / 224 from cache |
| 원래 `npm audit --audit-level=moderate` | **FAIL, exit 1, high 20 / critical 0** |

일반 설치와 패치 설치 모두 기존 `@mapbox/jsonlint-lines-primitives@2.0.3`의
Node >=22 engine 경고가 있었다. CI 기준 Node 20.19.4를 바꾸거나 경고를 숨기지 않았다.
검사 통과는 해당 패키지의 공식 Node 20 지원 선언을 의미하지 않는다.

### upstream 전체 검사 해석

braces의 원래 3.0.3은 고정 PR HEAD의 908개 검사 중 54개가 실패한다.
최소 패치는 그중 보안 실패 12개를 해소한다.
남은 42개는 점 집합 23개와 따옴표 19개이며 원본과 실패 제목·메시지가 같다.
새 실패는 없다. 전체 PR 소스 자체는 908/908로 통과하여 검사 도구도 대조했다.
이 결과를 고정 PR 전체 검사의 통과로 표시하지 않는다.
관련 근거는 `braces/review-result.json`, `braces/README.md`와 `braces/runs/`다.

Forge의 고정 PR 테스트에는 `tests/unit/jsbn.js`의 `describe.only`가 있었다.
그대로 실행하면 5개만 실행된다. 이 결과는 전체 검사로 채택하지 않았다.
외부 증거용 테스트 복사본에서 `.only`만 제거하고 전체 Node suite를 실행했다.
원본은 보안 검사 1개가 실패하고 수정본은 해당 검사를 포함해 829개가 통과한다.
upstream 조건부 pending 4개는 통과 수에 포함하지 않는다.
pending은 결정적 RSA 키 생성의 sync/async 비교 4개이며 증거 summary에 제목을 보존했다.
추가 pureJS 검사에서는 public module을 먼저 로드한 뒤 모드를 설정했다.
초기 검사 도구의 module 초기화 순서 오류와 수정 후 결과를 모두 보존했다.
채택한 결과는 기본·pureJS 각각 829 pass / 4 pending / 0 fail이다.
근거는 `forge/review-result.json`, `forge/upstream-app-*.summary.json`,
`forge/purejs-harness-correction.json`에 있다.

### Android native 검사 산출물

실행 소스는 `b596688d7c0bf0e754a5787b7b9c4fece6166431`이다.
후속 기록 commit은 제품 코드나 설치 패치를 변경하지 않는다.
integration prebuild와 Android `assembleRelease`를 실행했다.
JDK 17.0.20.1, Gradle 9.3.1, Node 20.19.4, arm64-v8a 구성을 사용했다.
Metro worker와 Gradle worker는 각각 1로 제한했다.
새 임시 키를 생성하여 서명했으며 실제 앱 서명 키는 사용하지 않았다.

| 값 | 검증 결과 |
| --- | --- |
| 파일 | `native/driver-b596688-issue62-validation-only.apk` |
| APK SHA256 | `402cf0726400524665fd27287a45fee3cfb24c0c405d3dbd07dc98b4944b5065` |
| 검사용 인증서 SHA256 | `766371d7ebe43f7bd3e1a99821a962365f769239aba3a78934c43dcfed8a85e7` |
| package / version | `com.evnsolution.clever.driver.integration` / `0.2.0(28)` |
| 크기 / ABI | 38,609,101 bytes / arm64-v8a |
| APK 서명 검사 | PASS. 기존 integration·upload·Play 인증서와 다름 |
| 설치 여부 | 기기에 설치하지 않음 |

이 APK는 native 호환성 검사 전용이다. 정식 업데이트 산출물이 아니다.
로컬 버전 설정을 유지했으며 원격 EAS 버전을 변경하지 않았다.
기존 28번 APK와 이 APK를 같은 검증 대상으로 취급하지 않는다.
APK·manifest·서명·R8 출력·resource 표본은 증거 루트의 `native/`에 있다.
`native/verification.json`이 파일 해시와 검사 범위를 연결한다.

### 증거 위치

모든 상대 경로는 이 문서 상단의 증거 루트를 기준으로 한다.

| 검증 | 증거 |
| --- | --- |
| 원본 보존 | `preserved-before.json`, `preserved-after.json` |
| 설치·workspace·lint·export·alignment | `integration-results.json`, 각 `*.observer.log` |
| Node 및 의존성 고정 / export 내용 | `export-and-lock-verification.json`, `registry-current.json` |
| braces 전체 upstream / 회귀 대조 | `braces/review-result.json`, `braces/runs/` |
| Forge 전체 upstream / 회귀 대조 | `forge/review-result.json`, `forge/evidence-manifest.json` |
| 기존 audit | `npm-audit.json`, `npm-audit-exit.txt`, `audit.observer.log` |
| native 빌드·검사용 APK | `native/verification.json`, `native/native.observer.log`, `native/` |
| 최종 HEAD / 원격 CI / Draft PR | `final-result.json`, `ci-final.json`, Draft PR 본문 |

## 수정 범위와 남는 위험

- Forge 패치는 Node `lib/index.js`가 사용하는 소스에 적용한다. prebuilt browser `dist` 번들은 수정하지 않았다.
- Expo CLI·인증서 도구가 같은 수정된 Node module을 사용하는 것을 실제 검사했다.
- Android/iOS source map에 해당 build-tool 모듈이 없음을 확인했다. 이는 audit 예외 근거가 아니다.
- 별도로 설치되는 `npx eas-cli`와 원격 EAS worker 내부 의존성은 수정하지 않았다.
- upstream 패치는 미병합이다. 유지보수 책임과 공식 릴리스 전환 조건의 검토가 필요하다.
- npm audit는 소스 패치가 아닌 원래 registry 버전을 보고한다. 기존 두 원인 취약점이 20개 의존 패키지 항목으로 전파된다.
- package alias, 버전 위장, 감사 제외, severity 하향, 실패 무시와 `npm audit fix --force`는 사용하지 않았다.

## 재현·유지보수·원복

```sh
# 저장소 .nvmrc의 Node 사용. Git도 필요하다.
npm ci
npm run check:workspace
npm run lint
npx expo install --check
npm run build:android -- --max-workers 1 --source-maps
npm run build:ios -- --max-workers 1 --source-maps
npm audit --audit-level=moderate
```

원래 audit 실패를 그대로 유지한다. 검증 script에 실패 무시를 추가하지 않는다.
공식 수정이 나오면 해당 패치·provenance·hook의 필요성을 다시 검토한다.
새 package 버전의 원본 해시를 임의로 허용하지 않는다.
upstream 전체 검사, 실제 앱 회귀, export와 native 빌드를 다시 확인한다.

후보를 폐기하려면 이 후보의 변경 commit을 함께 revert한 뒤 `npm ci`를 실행한다.
기존 `node_modules`만 역패치하거나 서로 다른 버전의 hook과 lockfile을 혼합하지 않는다.
원복하면 취약한 기준 상태로 돌아가므로 출시 차단도 유지한다.

## 출시 경계

제품 화면·업무 기능·앱 버전 설정은 변경하지 않았다.
실기기를 조회하거나 조작하지 않았다. 원격 EAS 번호·서명 자격 증명도 변경하지 않았다.
Play/Drive 게시·운영 배포·PR 병합·Issue #62 종료를 하지 않았다.

지원 가능한 최종 보안 해결을 위해 다음 조건이 남는다.

1. 미병합 소스 패치의 유지보수·지원 범위를 검토해야 한다.
2. 기존 audit와 최종 HEAD CI를 통과할 공식 경로나 별도 승인된 의존성 변경이 필요하다.
3. 배포에 사용하는 별도 EAS CLI·원격 worker의 영향 범위를 확인해야 한다.
4. 채택한 최종 소스로 정식 AAB/APK를 새로 생성하고 서명·버전·내용을 검증해야 한다.
5. 기존 28번 산출물은 이 수정 후보의 검증 증거가 아니다.
6. 새 산출물에서 로그인·초안·대기 명령 업데이트, 사유 경계, 응답 유실·중복 방지,
   사진 없는 완료·카메라·앨범·업로드 재시도, 실제 알림 클릭·입력 보호를 검사해야 한다.
7. 같은 AAB의 Play 서명 업데이트, 서버 PR #488 선배포와 기존 출시 차단은 별도로 유지한다.

최종 PR HEAD CI와 산출물 해시의 상세 기록은 Draft PR 본문과 보존 증거를 따른다.
