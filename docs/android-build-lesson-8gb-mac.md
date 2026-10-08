# Lesson: 8GB Mac의 Android 빌드는 실제 병렬 수를 보고 통제한다

> **한 줄 결론:** 2026-09-11의 40분 빌드는 오래된 다른 작업 때문이 아니라,
> 현재 저장소의 cold native build가 Gradle 제한 밖에서 Ninja/clang을 과도하게
> 병렬 실행하여 메모리 압축과 swap을 키운 사건이었다. 같은 상황에서 20분까지
> 기다리지 말고 아래 기준으로 즉시 중지한다.

## 바로 적용할 중지 기준

- 같은 revision 재빌드가 1분을 넘으면 cache hit 여부를 확인한다.
- 10분을 넘으면 빌드 산출을 기다리지 말고 마지막 실행 task, CPU, Ninja/clang
  개수, 메모리 압력과 swap 증가량을 기록한다.
- 20분을 넘으면 **빌드 장애**다. 원인 확인 전 게시와 반복 빌드를 중지한다.
- 8GB Mac의 로컬 검증 빌드에서 Ninja/clang이 2개를 넘겨 계속 실행되거나,
  free memory가 20%대로 하락하면서 swap이 증가하면 즉시 중지한다. 이는
  2026-09-11 실측에 근거한 이 프로젝트의 보수적 중지선이다.
- 중지 후 `~/.gradle`, Android SDK, `android/.cxx`를 지우지 않는다. 먼저 재사용할
  수 있는 cache와 이미 끝난 native 산출물을 보존한다.

## 빌드 목적부터 분리한다

| 목적 | 실행 위치와 산출물 | 규칙 |
| --- | --- | --- |
| 일반 코드 검증 | 현재 작업공간의 typecheck, test, lint, Expo 정합성 | 네이티브 빌드를 반복하지 않는다. |
| 로컬 R8 검증 | 8GB Mac에서 arm64 한 개만 대상으로 만든 debug-signed AAB | R8/리소스 축소 확인용이다. **Play에 업로드하지 않는다.** |
| Google Play 후보 | EAS `production`의 app-bundle | quota, remote versionCode, production secret를 먼저 확인하고 한 번만 빌드한다. |
| Google Drive APK | 영구 릴리스 작업공간의 armv7+arm64 signed APK | [`android-build-runbook.md`](./android-build-runbook.md)와 전용 게시 명령만 사용한다. |

로컬 AAB가 성공했다는 사실은 Play 후보가 준비됐다는 뜻이 아니다. source 설정,
로컬 산출물, EAS 산출물, Play 업로드, Play 처리 완료와 최적화 지표 반영은 각각
별도의 증거가 필요하다.

## 2026-09-11 사건 기록

| 실행 | 결과 | 확인된 사실 |
| --- | --- | --- |
| 전체 release APK | 40분 03초 후 중지, APK 없음 | R8 task에도 도달하지 못했다. 현재 저장소의 C++/Kotlin 작업이 CPU를 사용했다. |
| Gradle `--max-workers=2` 재시도 | 2분 57초에 중지 | Ninja가 제한과 별도로 clang 10개를 실행했고 swap이 3.78GB에서 4.13GB로 증가했다. |
| 미완료 native arm64 target을 `ninja -j2`로 재개 | 53 step, 40.3초 성공 | 실제 clang 동시 실행이 2개로 제한됐다. |
| cache를 보존한 arm64 로컬 AAB | 4분 16초 성공 | 554 tasks 중 458개가 up-to-date였고 R8, package, sign, bundle이 완료됐다. |

핵심 원인은 “8GB라서 원래 느림”이 아니다. 새 작업공간의 불충분한 native cache,
Gradle JVM과 Kotlin compiler의 메모리 사용, Gradle 설정으로 제어되지 않은 Ninja
병렬 실행이 겹쳐 memory compression과 swap thrashing이 발생했다.

## 반드시 실제 프로세스를 본다

Gradle의 `--max-workers=2`, `--no-parallel`, Kotlin in-process 설정은 Gradle 쪽
동시성을 줄일 뿐이다. Android Gradle Plugin이 Ninja를 직접 실행하면 Ninja는
자체 기본 병렬 수를 사용할 수 있다. `CMAKE_BUILD_PARALLEL_LEVEL=2`도 이 사건의
직접 Ninja 호출에는 적용되지 않았다.

따라서 “저메모리 옵션을 줬다”를 완료 조건으로 삼지 않는다. 실행 중인 저장소
소유 프로세스에서 실제 `ninja`와 `clang++` 자식 수가 2 이하인지 확인한다.

## 중지 후 복구 순서

1. 현재 저장소가 띄운 Gradle, Kotlin, Ninja/clang 프로세스만 중지한다.
2. 마지막 완료 task와 미완료 native build directory/target을 로그에 남긴다.
3. cache를 삭제하지 않은 채 macOS 메모리 회복을 기다린다.
4. `memory_pressure -Q`, `vm_stat`, `sysctl vm.swapusage`를 반복 확인한다.
   free percentage가 회복되고 `Pages occupied by compressor`가 하락하면 압축
   메모리가 자연스럽게 해제되는 중이다. swap은 그보다 늦게 줄 수 있으므로
   0GB가 될 때까지 기다리는 것을 조건으로 삼지 않는다.
5. native target만 미완료이고 정확한 directory와 target을 로그에서 얻었다면
   진단 복구에 한해 아래처럼 실제 Ninja 병렬 수를 제한한다.

```bash
ninja -j2 -C <로그에서 확인한-native-build-directory> <로그에서 확인한-targets>
```

생성 경로의 hash나 target 이름을 추측하거나 스크립트에 고정하지 않는다. 이
명령은 production 산출물을 만드는 정본 명령이 아니라 cache를 안전하게 완성하기
위한 진단 복구 수단이다. 그 다음 목적에 맞는 가장 작은 Gradle build를 한 번만
실행한다.

## 메모리 회복 판정

이 사건에서 잘못된 재시도 중 free memory는 28~30%, compressor pages는 약
196,732~204,914, swap은 최대 약 4.50GB였다. 프로세스를 중지한 뒤 free memory는
52~54%로 회복되고 compressor pages는 약 81,000까지 감소했다. 통제된 빌드 종료
후에는 free memory 58%, compressor pages 63,967, swap 2.987GB가 관찰됐다.

즉, 압축 메모리는 자연스럽게 해제됐다. swap이 즉시 0이 아니어도 누수라고
단정하지 않는다. 다음 두 조건을 함께 확인한다.

- 현재 저장소 소유 빌드 프로세스가 남아 있지 않다.
- memory pressure가 안정적이고 compressor pages와 swap이 증가 추세가 아니다.

## R8 최적화와 Play 게시의 증거 경계

로컬 검증 AAB에서는 다음이 확인됐다.

- `mapping.txt`가 `# compiler: R8`로 생성됐다.
- `usage.txt`에 제거 후보/결과가 기록됐다.
- `resources.txt`에 `Unused resources are:` 구간이 생성됐다.
- 산출물은 `0.1.15 (26)`, arm64-only, debug certificate 서명이었다.

따라서 소스의 R8 난독화와 resource shrinking 설정이 실제 release pipeline에서
작동한다는 로컬 증거는 있다. 그러나 이 AAB는 **Play에 업로드하지 않는다.**
Google Play의 “난독화 2%” 경고 해소는 production EAS AAB를 업로드하고 Play의
처리와 지표 갱신까지 확인한 뒤에만 완료로 판정한다.

EAS 실행 전에는 최소한 아래를 확인한다.

```bash
npx eas-cli build:version:get --platform android --profile production
npx eas-cli env:list production --scope project
npx eas-cli build:list --platform android --limit 5
```

Expo dashboard에서 월간 Android build quota도 먼저 확인한다. 2026-09-11에는
Free plan quota가 소진되어 원격 build가 생성되기 전에 거절됐지만 remote
versionCode는 25에서 26으로 증가했다. quota 확인 없이 `autoIncrement` build를
반복하면 산출물 없이 versionCode만 올라갈 수 있다.

## 보존된 증거

- 실패한 40분 APK: `~/.codex/build-hygiene/logs/clever-driver-app/20260911T120617.682023+0900-b01162e3446c-r8-release-apk/`
- 과병렬이 재현된 재시도: `~/.codex/build-hygiene/logs/clever-driver-app/20260911T125656.845380+0900-b01162e3446c-r8-arm64-lowmem/`
- 명시적 `ninja -j2` 복구: `~/.codex/build-hygiene/logs/clever-driver-app/20260911T131502.671648+0900-13e2c46c0463-app-native-arm64-j2/`
- 통제된 로컬 AAB: `~/.codex/build-hygiene/logs/clever-driver-app/20260911T131556.129689+0900-13e2c46c0463-r8-bundle-arm64-lowmem/`

이 증거 폴더는 원인 추적용이며 Git에 포함하지 않는다. 이후 실행은 기존 기록을
덮어쓰지 말고 별도 timestamp 폴더로 남긴다.
