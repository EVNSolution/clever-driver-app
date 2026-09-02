import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const authScreenPath = join(appDirectory, '../ui/auth/AuthEntryScreen.tsx');
const appRootPath = join(appDirectory, 'AppRoot.tsx');
const legalDocumentsPath = join(appDirectory, '../config/driverLegalDocuments.ts');
const sessionStorePath = join(appDirectory, '../auth/driverAuthSessionStore.ts');

describe('DSV authentication entry screen', () => {
  it('keeps the Routes visual entry pattern under the Driver brand', () => {
    const source = readFileSync(authScreenPath, 'utf8');

    assert.match(source, /styles\.brandBlue\}>Clever/u);
    assert.match(source, /styles\.brandGreen\}>Driver/u);
    assert.match(source, /backgroundColor: '#f7f9fc'/u);
    assert.match(source, /backgroundColor: '#0b57d0'/u);
  });

  it('offers direct signup without legacy invite-link compatibility', () => {
    const source = readFileSync(authScreenPath, 'utf8');
    const appRoot = readFileSync(appRootPath, 'utf8');

    assert.match(source, /label="아이디"/u);
    assert.match(source, /label="비밀번호"/u);
    assert.match(source, /label="이름"/u);
    assert.match(source, /label="휴대전화 번호"/u);
    assert.doesNotMatch(source, /label="주민등록번호 앞 7자리"/u);
    assert.doesNotMatch(source, /residentNumberFront/u);
    assert.doesNotMatch(source, /signupInvite|inviteError|초대받은/u);
    assert.match(source, /회원가입/u);
    assert.match(source, /label="비밀번호 확인"/u);
    assert.doesNotMatch(source, /ModeButton/u);
    assert.doesNotMatch(source, /accessibilityRole="tab"/u);
    assert.doesNotMatch(appRoot, /signupInvite|handleSignupLink|validateDriverSignupInvite/u);
    assert.doesNotMatch(appRoot, /Linking\.getInitialURL/u);
    assert.doesNotMatch(appRoot, /Linking\.addEventListener\('url'/u);
  });

  it('uses the approved DSV authentication client', () => {
    const source = readFileSync(authScreenPath, 'utf8');

    assert.match(source, /loginDriverAccount/u);
    assert.match(source, /registerDriverAccount/u);
  });

  it('keeps focused authentication fields visible above the native keyboard', () => {
    const source = readFileSync(authScreenPath, 'utf8');
    const appRoot = readFileSync(appRootPath, 'utf8');

    assert.match(appRoot, /KeyboardProvider/u);
    assert.match(source, /KeyboardAwareScrollView/u);
    assert.match(source, /bottomOffset=\{50\}/u);
    assert.match(source, /keyboardShouldPersistTaps="handled"/u);
    assert.match(source, /onSubmitEditing=\{\(\) => phoneInputRef\.current\?\.focus\(\)\}/u);
    assert.match(source, /KeyboardToolbar\.Group/u);
    assert.match(
      source,
      /<KeyboardToolbar\.Prev \/>[\s\S]*<KeyboardToolbar\.Next \/>[\s\S]*<KeyboardToolbar\.Done text="완료" \/>/u,
    );
    assert.doesNotMatch(source, /KeyboardAvoidingView/u);
  });

  it('restores and refreshes login through SecureStore without saving credentials', () => {
    const appRoot = readFileSync(appRootPath, 'utf8');
    const sessionStore = readFileSync(sessionStorePath, 'utf8');

    assert.match(appRoot, /readDriverAuthRefreshToken/u);
    assert.match(appRoot, /refreshDriverAccountSession/u);
    assert.match(appRoot, /saveDriverAuthSession/u);
    assert.match(appRoot, /clearDriverAuthSession/u);
    assert.match(sessionStore, /SecureStore\.setItemAsync/u);
    assert.match(sessionStore, /SecureStore\.getItemAsync/u);
    assert.match(sessionStore, /SecureStore\.deleteItemAsync/u);
    assert.doesNotMatch(sessionStore, /password/u);
    assert.doesNotMatch(sessionStore, /accessToken/u);
  });

  it('keeps automatic login active across temporary server failures', () => {
    const appRoot = readFileSync(appRootPath, 'utf8');

    assert.match(appRoot, /resolveDriverAuthRecoveryAction/u);
    assert.match(appRoot, /AUTO_LOGIN_RETRY_DELAY_MS/u);
    assert.match(appRoot, /자동 로그인을 다시 연결하고 있습니다/u);
    assert.match(appRoot, /아이디로 로그인/u);
    assert.match(appRoot, /setAutoLoginEnabled\(false\)/u);
  });

  it('rechecks the installed app in the background and presents available updates', () => {
    const appRoot = readFileSync(appRootPath, 'utf8');
    assert.match(appRoot, /fetchDriverAndroidAppRelease/u);
    assert.match(appRoot, /readInstalledDriverAppVersion/u);
    assert.match(appRoot, /AppState\.addEventListener\('change'/u);
    assert.match(appRoot, /shouldPresentDriverAppUpdate/u);
    assert.match(appRoot, /APP_UPDATE_FAILURE_RETRY_INTERVAL_MS/u);
    assert.match(appRoot, /retainDriverAppUpdateAfterLookupFailure/u);
    assert.match(appRoot, /DriverAppUpdateScreen/u);
    assert.match(appRoot, /Linking\.openURL\(DRIVER_APP_INSTALL_PAGE_URL\)/u);
    assert.doesNotMatch(appRoot, /\{appUpdateState\.kind === 'checking' \?/u);
    assert.match(appRoot, /checkForAppUpdate\(true\)/u);
  });

  it('shows concrete linked and unlinked success states in Korean', () => {
    const source = readFileSync(authScreenPath, 'utf8');

    assert.match(source, /DSV 배송원 정보와 연결되었습니다/u);
    assert.match(source, /DSV 배송원 정보 연결 대기 중입니다/u);
  });

  it('keeps legal documents available before authentication', () => {
    const source = readFileSync(authScreenPath, 'utf8');
    const legalDocuments = readFileSync(legalDocumentsPath, 'utf8');

    assert.match(source, /DRIVER_LEGAL_DOCUMENTS/u);
    assert.match(source, /Linking\.openURL/u);
    assert.match(legalDocuments, /개인정보 처리방침/u);
    assert.match(legalDocuments, /배송원 이용약관/u);
    assert.match(legalDocuments, /위치기반서비스 이용약관/u);
    assert.match(legalDocuments, /driver-app\/privacy/u);
    assert.match(legalDocuments, /cleversystem\.ai\/driver-terms/u);
    assert.match(legalDocuments, /cleversystem\.ai\/location-terms/u);
  });
});
