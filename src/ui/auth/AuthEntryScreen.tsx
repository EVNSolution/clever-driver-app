import { useRef, useState, type Ref } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardToolbar,
} from 'react-native-keyboard-controller';

import {
  AuthApiError,
  loginDriverAccount,
  registerDriverAccount,
  type DriverAuthSession,
} from '../../api/dsvDriverAuth';
import { DRIVER_LEGAL_DOCUMENTS } from '../../config/driverLegalDocuments';
import {
  normalizePhoneNumber,
  validateLoginForm,
  validateRegistrationForm,
  type LoginFormErrors,
  type LoginFormValues,
  type RegistrationFormErrors,
  type RegistrationFormValues,
} from '../../domain/auth/authForm';

const EMPTY_LOGIN_FORM: LoginFormValues = {
  loginId: '',
  password: '',
};

const EMPTY_REGISTRATION_FORM: RegistrationFormValues = {
  loginId: '',
  name: '',
  password: '',
  passwordConfirmation: '',
  phoneNumber: '',
};

type AuthEntryScreenProps = {
  onAuthenticated?(session: DriverAuthSession): Promise<void> | void;
};

export function AuthEntryScreen({
  onAuthenticated,
}: AuthEntryScreenProps) {
  const [loginForm, setLoginForm] =
    useState<LoginFormValues>(EMPTY_LOGIN_FORM);
  const [registrationForm, setRegistrationForm] =
    useState<RegistrationFormValues>(EMPTY_REGISTRATION_FORM);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginErrors, setLoginErrors] = useState<LoginFormErrors>({});
  const [registrationErrors, setRegistrationErrors] =
    useState<RegistrationFormErrors>({});
  const [authSession, setAuthSession] = useState<DriverAuthSession | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const loginPasswordInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const registrationLoginIdInputRef = useRef<TextInput>(null);
  const registrationPasswordInputRef = useRef<TextInput>(null);
  const registrationPasswordConfirmationInputRef = useRef<TextInput>(null);

  async function handleLoginSubmit() {
    const errors = validateLoginForm(loginForm);
    setLoginErrors(errors);
    setAuthSession(null);

    if (Object.keys(errors).length > 0) {
      setMessage('입력한 로그인 정보를 확인해 주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await loginDriverAccount(loginForm);
      setAuthSession(session);
      setMessage(formatAuthSuccessMessage(session));
      if (session.account.connectionStatus === 'LINKED') {
        await onAuthenticated?.(session);
      }
    } catch (error) {
      setMessage(formatAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegistrationSubmit() {
    const errors = validateRegistrationForm(registrationForm);
    setRegistrationErrors(errors);
    setAuthSession(null);

    if (Object.keys(errors).length > 0) {
      setMessage('입력한 회원가입 정보를 확인해 주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await registerDriverAccount({
        loginId: registrationForm.loginId,
        name: registrationForm.name.trim(),
        password: registrationForm.password,
        phone: registrationForm.phoneNumber,
      });
      setAuthSession(session);
      setMessage(formatAuthSuccessMessage(session));
      if (session.account.connectionStatus === 'LINKED') {
        await onAuthenticated?.(session);
      }
    } catch (error) {
      setMessage(formatAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function openLegalDocument(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      setMessage('문서 링크를 열지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  const isRegistration = mode === 'register';

  return (
    <>
      <KeyboardToolbar.Group style={styles.keyboardArea}>
        <KeyboardAwareScrollView
          bottomOffset={50}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
      <View style={styles.brandPanel}>
        <Text style={styles.brandName}>
          <Text style={styles.brandBlue}>Clever</Text>{' '}
          <Text style={styles.brandGreen}>Driver</Text>
        </Text>
        <Text style={styles.brandTagline}>
          DSV 배송 업무를 더 단순하고 빠르게.
        </Text>
      </View>

      <View style={styles.formCard}>
          <View style={styles.formHeading}>
            <Text style={styles.formTitle}>
              {isRegistration ? '배송원 계정 만들기' : '배송원 로그인'}
            </Text>
            <Text style={styles.formDescription}>
              {isRegistration
                ? '이름과 휴대전화 번호가 등록된 배송원 정보와 일치하면 자동으로 연결됩니다.'
                : '가입한 아이디와 비밀번호를 입력해 주세요.'}
            </Text>
          </View>

          {isRegistration ? (
            <>
              <LabeledInput
                autoComplete="name"
                error={registrationErrors.name}
                label="이름"
                onChangeText={(name) =>
                  setRegistrationForm((current) => ({ ...current, name }))
                }
                onSubmitEditing={() => phoneInputRef.current?.focus()}
                placeholder="실명을 입력해 주세요"
                returnKeyType="next"
                textContentType="name"
                value={registrationForm.name}
              />
              <LabeledInput
                autoComplete="tel"
                error={registrationErrors.phoneNumber}
                keyboardType="phone-pad"
                label="휴대전화 번호"
                maxLength={11}
                inputRef={phoneInputRef}
                onChangeText={(value) =>
                  setRegistrationForm((current) => ({
                    ...current,
                    phoneNumber: normalizePhoneNumber(value),
                  }))
                }
                onSubmitEditing={() =>
                  registrationLoginIdInputRef.current?.focus()
                }
                placeholder="01012345678"
                returnKeyType="next"
                textContentType="telephoneNumber"
                value={registrationForm.phoneNumber}
              />
              <View style={styles.sectionDivider} />
              <Text style={styles.sectionLabel}>로그인 정보</Text>
              <LabeledInput
                autoCapitalize="none"
                autoComplete="username-new"
                error={registrationErrors.loginId}
                inputRef={registrationLoginIdInputRef}
                label="아이디"
                onChangeText={(loginId) =>
                  setRegistrationForm((current) => ({
                    ...current,
                    loginId: loginId.toLowerCase(),
                  }))
                }
                onSubmitEditing={() =>
                  registrationPasswordInputRef.current?.focus()
                }
                placeholder="사용할 아이디를 입력해 주세요"
                returnKeyType="next"
                textContentType="username"
                value={registrationForm.loginId}
              />
              <LabeledInput
                autoCapitalize="none"
                autoComplete="password-new"
                error={registrationErrors.password}
                inputRef={registrationPasswordInputRef}
                label="비밀번호"
                onChangeText={(password) =>
                  setRegistrationForm((current) => ({
                    ...current,
                    password,
                  }))
                }
                onSubmitEditing={() =>
                  registrationPasswordConfirmationInputRef.current?.focus()
                }
                placeholder="사용할 비밀번호를 입력해 주세요"
                returnKeyType="next"
                secureTextEntry
                textContentType="newPassword"
                value={registrationForm.password}
              />
              <LabeledInput
                autoCapitalize="none"
                autoComplete="password-new"
                error={registrationErrors.passwordConfirmation}
                inputRef={registrationPasswordConfirmationInputRef}
                label="비밀번호 확인"
                onChangeText={(passwordConfirmation) =>
                  setRegistrationForm((current) => ({
                    ...current,
                    passwordConfirmation,
                  }))
                }
                onSubmitEditing={handleRegistrationSubmit}
                placeholder="비밀번호를 다시 입력해 주세요"
                returnKeyType="done"
                secureTextEntry
                textContentType="newPassword"
                value={registrationForm.passwordConfirmation}
              />
            </>
          ) : (
            <>
              <LabeledInput
                autoCapitalize="none"
                autoComplete="username"
                error={loginErrors.loginId}
                label="아이디"
                onChangeText={(loginId) =>
                  setLoginForm((current) => ({
                    ...current,
                    loginId: loginId.toLowerCase(),
                  }))
                }
                onSubmitEditing={() => loginPasswordInputRef.current?.focus()}
                placeholder="아이디를 입력해 주세요"
                returnKeyType="next"
                textContentType="username"
                value={loginForm.loginId}
              />
              <LabeledInput
                autoCapitalize="none"
                autoComplete="current-password"
                error={loginErrors.password}
                inputRef={loginPasswordInputRef}
                label="비밀번호"
                onChangeText={(password) =>
                  setLoginForm((current) => ({ ...current, password }))
                }
                onSubmitEditing={handleLoginSubmit}
                placeholder="비밀번호를 입력해 주세요"
                returnKeyType="done"
                secureTextEntry
                textContentType="password"
                value={loginForm.password}
              />
            </>
          )}

          {message !== null ? (
            <Text accessibilityRole="alert" style={styles.formMessage}>
              {message}
            </Text>
          ) : null}

          {authSession?.account.connectionStatus === 'LINKED' ? (
            <Text style={styles.linkedDriverText}>
              연결된 배송원 {authSession.account.linkedDrivers.length}명
            </Text>
          ) : null}

          <PrimaryButton
            disabled={isSubmitting}
            label={
              isSubmitting ? '처리 중' : isRegistration ? '회원가입' : '로그인'
            }
            onPress={
              isRegistration
                ? handleRegistrationSubmit
                : handleLoginSubmit
            }
          />
          {isRegistration ? (
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={() => {
                setMode('login');
                setMessage(null);
                setRegistrationErrors({});
              }}
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.cancelButtonText}>로그인으로 돌아가기</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={() => {
                setMode('register');
                setMessage(null);
                setLoginErrors({});
              }}
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.cancelButtonText}>회원가입</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.legalLinks}>
          {DRIVER_LEGAL_DOCUMENTS.map((document) => (
            <Pressable
              accessibilityRole="link"
              key={document.url}
              onPress={() => void openLegalDocument(document.url)}
              style={({ pressed }) => [
                styles.legalLink,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.legalLinkText}>{document.label}</Text>
            </Pressable>
          ))}
        </View>
        </KeyboardAwareScrollView>
      </KeyboardToolbar.Group>
      <KeyboardToolbar>
        <KeyboardToolbar.Prev />
        <KeyboardToolbar.Next />
        <KeyboardToolbar.Done text="완료" />
      </KeyboardToolbar>
    </>
  );
}

function formatAuthSuccessMessage(session: DriverAuthSession): string {
  if (session.account.connectionStatus === 'LINKED') {
    return `${session.account.name}님, DSV 배송원 정보와 연결되었습니다.`;
  }

  return `${session.account.name}님, 계정 인증이 완료되었습니다. DSV 배송원 정보 연결 대기 중입니다.`;
}

function formatAuthErrorMessage(error: unknown): string {
  if (error instanceof AuthApiError) {
    return error.message;
  }

  return 'DSV 인증 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

function LabeledInput({
  error,
  inputRef,
  label,
  ...inputProps
}: TextInputProps & {
  error?: string;
  inputRef?: Ref<TextInput>;
  label: string;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={[styles.inputShell, error !== undefined && styles.inputError]}>
        <TextInput
          autoCorrect={false}
          placeholderTextColor="#8a94a6"
          ref={inputRef}
          style={styles.input}
          {...inputProps}
        />
      </View>
      {error !== undefined ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}
    </View>
  );
}

function PrimaryButton({
  disabled,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled === true && styles.primaryButtonDisabled,
        pressed && styles.primaryButtonPressed,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  keyboardArea: {
    flex: 1,
  },
  container: {
    backgroundColor: '#f7f9fc',
    flexGrow: 1,
    paddingBottom: 36,
    paddingHorizontal: 22,
  },
  brandPanel: {
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    minHeight: 218,
    paddingTop: 28,
  },
  brandName: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  brandBlue: {
    color: '#0b57d0',
  },
  brandGreen: {
    color: '#079455',
  },
  brandTagline: {
    color: '#475467',
    fontSize: 17,
    lineHeight: 25,
    maxWidth: 280,
    textAlign: 'center',
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelButtonText: {
    color: '#475467',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.72,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 20,
    borderWidth: 1,
    gap: 18,
    padding: 20,
  },
  formHeading: {
    gap: 6,
    marginBottom: 2,
  },
  formTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  formDescription: {
    color: '#667085',
    fontSize: 14,
    lineHeight: 21,
  },
  sectionDivider: {
    backgroundColor: '#eef2f6',
    height: 1,
    marginTop: 2,
  },
  sectionLabel: {
    color: '#475467',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  inputGroup: {
    gap: 7,
  },
  inputLabel: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d9dee8',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  inputError: {
    borderColor: '#d92d20',
  },
  input: {
    color: '#111827',
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  errorText: {
    color: '#b42318',
    fontSize: 12,
    lineHeight: 18,
  },
  formMessage: {
    backgroundColor: '#f2f4f7',
    borderRadius: 12,
    color: '#475467',
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  linkedDriverText: {
    color: '#079455',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  legalLinks: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'center',
    marginTop: 18,
  },
  legalLink: {
    minHeight: 32,
    justifyContent: 'center',
  },
  legalLinkText: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0b57d0',
    borderRadius: 15,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  primaryButtonPressed: {
    backgroundColor: '#0848ae',
  },
  primaryButtonDisabled: {
    backgroundColor: '#98a2b3',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
});
