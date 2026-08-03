export type LoginFormValues = {
  loginId: string;
  password: string;
};

export type RegistrationFormValues = LoginFormValues & {
  name: string;
  passwordConfirmation: string;
  phoneNumber: string;
  residentNumberFront: string;
};

export type LoginFormErrors = Partial<Record<keyof LoginFormValues, string>>;
export type RegistrationFormErrors = Partial<
  Record<keyof RegistrationFormValues, string>
>;

const KOREAN_MOBILE_PATTERN = /^01\d{8,9}$/u;
const LOGIN_ID_PATTERN = /^[a-z0-9._-]{4,40}$/u;
const RESIDENT_NUMBER_FRONT_PATTERN = /^\d{7}$/u;
const MAX_NAME_LENGTH = 80;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export function normalizePhoneNumber(value: string): string {
  return value.replace(/\D/gu, '').slice(0, 11);
}

export function normalizeResidentNumberFront(value: string): string {
  return value.replace(/\D/gu, '').slice(0, 7);
}

export function validateLoginForm(
  values: LoginFormValues,
): LoginFormErrors {
  const errors: LoginFormErrors = {};

  if (values.loginId.length === 0) {
    errors.loginId = '아이디를 입력해 주세요.';
  } else if (!LOGIN_ID_PATTERN.test(values.loginId)) {
    errors.loginId =
      '아이디는 영문 소문자, 숫자, 점, 밑줄, 하이픈 4~40자로 입력해 주세요.';
  }

  if (values.password.length === 0) {
    errors.password = '비밀번호를 입력해 주세요.';
  } else if (
    values.password.length < MIN_PASSWORD_LENGTH ||
    values.password.length > MAX_PASSWORD_LENGTH
  ) {
    errors.password = '비밀번호는 8~128자로 입력해 주세요.';
  }

  return errors;
}

export function validateRegistrationForm(
  values: RegistrationFormValues,
): RegistrationFormErrors {
  const errors: RegistrationFormErrors = {};

  if (values.loginId.length === 0) {
    errors.loginId = '아이디를 입력해 주세요.';
  } else if (!LOGIN_ID_PATTERN.test(values.loginId)) {
    errors.loginId =
      '아이디는 영문 소문자, 숫자, 점, 밑줄, 하이픈 4~40자로 입력해 주세요.';
  }

  const trimmedName = values.name.trim();
  if (trimmedName.length === 0) {
    errors.name = '이름을 입력해 주세요.';
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = '이름은 80자 이하로 입력해 주세요.';
  }

  if (values.password.length === 0) {
    errors.password = '비밀번호를 입력해 주세요.';
  } else if (
    values.password.length < MIN_PASSWORD_LENGTH ||
    values.password.length > MAX_PASSWORD_LENGTH
  ) {
    errors.password = '비밀번호는 8~128자로 입력해 주세요.';
  }

  if (values.passwordConfirmation !== values.password) {
    errors.passwordConfirmation = '비밀번호가 일치하지 않습니다.';
  }

  if (!KOREAN_MOBILE_PATTERN.test(values.phoneNumber)) {
    errors.phoneNumber = '휴대전화 번호를 정확히 입력해 주세요.';
  }

  if (!RESIDENT_NUMBER_FRONT_PATTERN.test(values.residentNumberFront)) {
    errors.residentNumberFront =
      '주민등록번호 앞 7자리를 숫자로 입력해 주세요.';
  }

  return errors;
}
