# Driver Issue62 출시 사전검사 — 2026-10-08

## 판정

**Issue62는 미해결이며 출시 보안 차단을 유지한다.**
앱 번들 검사와 빌드 도구 호출 검사는 취약 경로의 범위를 좁힌다.
이 결과는 audit 통과 또는 출시 승인이 아니다.

- 대상: [앱 PR67](https://github.com/EVNSolution/clever-driver-app/pull/67)
- 검사 소스: `cce1c2179c77c500032044cdfb46d2bf45b48092`
- 관련 이슈: [Issue62](https://github.com/EVNSolution/clever-driver-app/issues/62),
  [change-control #315](https://github.com/EVNSolution/clever-change-control/issues/315)
- 로컬 검사 환경: Node `v26.3.1`; 저장소 CI 기준은 `.nvmrc`의 `20.19.4`
- 작업공간: `/Users/jiin/.codex/worktrees/dsv-driver-release-preflight/clever-driver-app`
- 로컬 원본 증거: `/tmp/dsv-driver-preflight-20261008/security/`
- 앱 `package.json`, `package-lock.json`, CI audit 조건을 변경하지 않았다.
- 연구용 패치는 위 증거 디렉터리의 복사본에만 적용했다.

## audit와 공식 수정 상태

`npm audit --audit-level=moderate --json`은 **exit 1**, high 20건이다.
20건은 두 원인 취약점이 의존 패키지로 전파된 결과다.
개별 취약점 20개로 계산하지 않는다.

| 의존성 | 설치 버전 | 공식 advisory | 공식 수정 버전 |
| --- | --- | --- | --- |
| `braces` | `3.0.3` | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | 없음 |
| `node-forge` | `1.4.0` | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | 없음 |

이번 검사에서 npm registry의 latest도 각각 `3.0.3`, `1.4.0`이었다.
audit의 자동 수정 제안은 Expo `44.0.6`으로의 major 변경이다.
이는 현재 Expo 56 / React Native 0.85 계약의 지원 가능한 보안 패치가 아니다.
`npm audit fix --force`, 제외 목록, severity 하향 또는 실패 무시는 적용하지 않았다.

원본: `npm-audit.json`, `npm-audit-exit.txt`, `advisoryBraces.json`,
`advisoryForge.json`, `braces-registry.json`, `forge-registry.json`.

## 앱 번들과 빌드 호출 경로

현재 소스에서 Android production 설정으로 새 export를 생성했다.
업무 기능은 `true`, API는 `https://clever-route-api.cleversystem.ai`다.
격리 검증 환경변수는 설정하지 않았다.
Metro worker는 1개, Node old-space 상한은 2048 MiB였다.
기존 Metro 캐시를 보존했다.

```sh
NODE_OPTIONS='--max-old-space-size=2048 --require=/tmp/dsv-driver-preflight-20261008/security/trace.cjs' \
EXPO_PUBLIC_DSV_OPERATIONAL_ENABLED=true \
EXPO_PUBLIC_DSV_API_BASE_URL=https://clever-route-api.cleversystem.ai \
CI=1 node node_modules/expo/bin/cli export -p android --max-workers 1 \
  --source-maps --output-dir /tmp/dsv-driver-preflight-20261008/security/android-export
```

- 결과: exit 0, 8.8초, Metro 1,319 modules.
- 새 source map: 1,302 sources.
- `braces`, `node-forge`, `@expo/code-signing-certificates` source: 각각 0건.
- export 프로세스 계측: `braces` 모듈 load 1회, 취약 함수 호출 0회.
- export 프로세스 계측: `node-forge` 모듈 load 0회.
- 이 계측은 해당 export 실행만 관찰한다. 모든 CLI 명령을 검사한 결과가 아니다.
- export는 APK/AAB 서명 검사 결과와 별개다.

| 파일 | SHA256 |
| --- | --- |
| `index-5fc47027db9be456274cc04f7459ccd3.hbc` | `9be1a68cb3e2bc653662da4431c70da7c85d5cdbfce24170c56a67c8e5aa1b73` |
| 같은 이름의 `.hbc.map` | `c5b11c629eefbcfe040e6fbf48654209b73f7173e53833760db8598c8b268d93` |

두 파일은 증거 디렉터리의 `android-export/_expo/static/js/android/`에 있다.
`bundle-inclusion.json`, `trace-92904.json`에 세부 결과가 있다.
build-hygiene 실행 로그는 다음 위치에 있다.

`/Users/jiin/.codex/build-hygiene/logs/clever-driver-app/20261008T165606.370733+0900-cce1c2179c77-issue62-instrumented-export/`

관찰기에 남은 Gradle 프로세스 2개는 병렬 진행 중인 별도 native 검사였다.
export가 만든 잔류 프로세스로 처리하거나 종료하지 않았다.

### braces 경로

의존 경로는 다음과 같다.

- `expo@56.0.23 → @expo/cli@56.1.26 → @expo/metro-file-map@56.0.4 → micromatch@4.0.8 → braces@3.0.3`
- `expo/@expo/metro → metro-file-map@0.84.5 → micromatch@4.0.8 → braces@3.0.3`

두 file-map의 `watchers/common.js`는 `includedByGlob()`에서 `micromatch.some()`을 호출한다.
설치된 `micromatch/index.js:264`의 `some()`은 `picomatch()`를 사용한다.
`braces()`는 `micromatch.parse()`, `braces()`, `braceExpand()` 경로에 있다.

두 watcher를 직접 실행하고 braces 함수 호출 시 실패하도록 계측했다.
일반 확장자, 숨김 파일, 불일치 조건은 모두 예상대로 처리됐다.
braces 함수 호출은 0회였다. 결과는 `watcher-call-path.json`에 있다.
배송원 사유나 API 응답을 build glob으로 넘기는 연결은 현재 앱에서 확인되지 않았다.
따라서 이 검사에서는 배송원 입력을 통한 해당 빌드 DoS 경로를 찾지 못했다.
의존성 자체의 취약점이나 다른 CLI 경로가 없다는 뜻은 아니다.

### node-forge와 서명 도구 경로

앱 의존 경로는 다음과 같다.

- `expo → @expo/cli → node-forge@1.4.0`
- `expo → @expo/cli → @expo/code-signing-certificates@0.0.6 → node-forge@1.4.0`

`@expo/code-signing-certificates/build/main.js`에는 취약 검증 API 호출이 실제 있다.
`validateSelfSignedCertificate()`는 `certificate.verify()`를 호출한다.
`signBufferRSASHA256AndVerify()`는 `certificate.publicKey.verify()`를 호출한다.
이는 Expo 개발/OTA manifest 서명 경로다.
현재 `app.json`에는 `expo-updates` 서명 인증서 설정이 없다.
새 Android export에서 이 함수는 실행되지 않았다.

로컬 EAS CLI `24.12.0` 캐시도 별도로 읽었다.
EAS CLI는 `node-forge@1.4.0`과 `@expo/code-signing-certificates@0.0.5`를 포함한다.
Android 자격 증명 검사에는 `@expo/pkcs12@0.1.3`과 `jks-js@1.1.0`이 사용된다.
이 경로의 Forge 사용은 PKCS#12/ASN.1 변환이며, 읽은 Android 검사 함수에 RSA
`publicKey.verify()` 호출은 없다. JKS 경로는 `parseJks()`와 키 복호화를 사용한다.
Expo `@expo/devcert`는 OpenSSL을 호출한다. 앱 lock의 Forge 유입 경로가 아니다.

Android APK/AAB 서명과 검증은 Gradle/Android SDK/JDK 도구가 담당한다.
Forge의 Expo manifest 검증을 Android APK 서명과 혼동하지 않는다.
이번 연구에서 자격 증명은 생성·교체하지 않았고, 원격 EAS 설정도 변경하지 않았다.
원격 EAS worker 내부의 모든 의존성과 호출을 계측한 것은 아니다.

## 취약 동작과 수정 후보의 격리 검증

### braces

설치된 `3.0.3`에서 중첩 깊이 4,000, 전체 8,001자인 패턴을 실행했다.
`compile()`과 `expand()` 모두 `Maximum call stack size exceeded`를 재현했다.
기본 10,000자 제한 이하에서도 발생했다.
결과는 `braces-reproduction.json`에 있다.

[upstream PR78](https://github.com/micromatch/braces/pull/78)의
`97308a01d091b211cf015314a2d0696da28a5392`를 임시 복사본에 적용했다.
이 패치는 parser와 AST walker의 중첩 깊이를 제한한다.
같은 PR의 14개 회귀 검사를 원본과 수정본에 직접 실행했다.

- 원본: 2 pass / 12 fail.
- 수정본: 14 pass / 0 fail.
- 문자열, 직접 AST, 경계값, 일반 대안·범위·escape 패턴을 검사했다.
- full upstream suite와 앱 전체 dependency 교체 검사는 수행하지 않았다.
- PR78은 검사 시점에 open/unmerged다. 지원되는 정식 릴리스가 아니다.

`braces-baseline-regression.json`, `braces-fixed-regression.json`에 각 결과가 있다.
옵션만 추가하는 미병합 패치는 기존 호출자가 옵션을 전달하지 않으면 보호하지 못한다.
`micromatch`를 `picomatch`로 단순 npm alias 교체하는 방법도 부적합하다.
현재 watcher가 사용하는 `some()` API가 picomatch에는 없다.

### node-forge

[upstream PR1152](https://github.com/digitalbazaar/forge/pull/1152)의
`ceba34402e329f0365134f23fe19898756527d65`를 임시 복사본에 적용했다.
같은 PR의 공개 malformed DigestAlgorithm 서명 fixture를 사용했다.
검사에서 padding 검사를 끄는 옵션은 사용하지 않았다.

- 설치된 Forge 1.4.0: 잘못된 서명을 `true`로 승인.
- 수정본: invalid DigestInfo 예외로 거부.
- Node `crypto.verify()`: 같은 잘못된 서명을 `false`로 거부.
- 공개 정상 서명 fixture: 원본·수정본·Node crypto 모두 `true`.
- 같은 서명과 다른 메시지: 세 경로 모두 `false`.
- 실제 Driver 서명 키를 사용하거나 새 서명 키를 만들지 않았다.
- full upstream RSA suite와 Expo 인증서 lifecycle 전체 검사는 수행하지 않았다.
- PR1152는 검사 시점에 open/unmerged다. 지원되는 정식 릴리스가 아니다.

`forge-regression.json`, `forge-control.json`에 결과가 있다.
Node crypto로 검증을 대체할 기술 경로는 확인했다.
그러나 Forge의 PKCS#12·ASN.1·인증서 API 전체를 Node crypto로 npm alias 교체할 수는 없다.
Expo signing package의 명시적 변경과 별도 호환성 검사가 필요하다.

## 처리 선택지와 다음 판정 조건

1. **권장: 공식 수정 릴리스 적용.** 두 라이브러리의 수정 릴리스와 Expo 호환성을 확인한다.
   재현 검사, 원래 audit 기준, workspace/export/native/device 검사를 최종 HEAD에서 통과시킨다.
2. **별도 검토: 유지보수할 fork 또는 상위 도구 변경.** 위 검증된 패치 후보를 출발점으로 한다.
   provenance, 고정 commit/integrity, full upstream 검사, 재현 가능한 lockfile과
   Metro·EAS·서명 호환성을 검토한다. package 이름 변경이나 advisory 누락으로
   audit만 초록색이 되는 결과는 해결로 인정하지 않는다.
3. **대기:** 지원 가능한 경로가 승인·완성될 때까지 Issue62와 기존 CI 차단을 유지한다.
   독립적인 서명 산출물·실기기 검사는 계속할 수 있다.

이번 문서만으로 Issue62를 닫지 않는다.
로컬 동작 도달성 결과는 위험 평가 자료이며 audit 예외 승인이 아니다.
서버 선배포, 실기기 결과, 서명 산출물 검사는 별도 출시 기록과 함께 판단한다.
