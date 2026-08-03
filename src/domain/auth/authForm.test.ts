import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  normalizePhoneNumber,
  normalizeResidentNumberFront,
  validateLoginForm,
  validateRegistrationForm,
} from './authForm';

describe('DSV account form', () => {
  it('normalizes digit-only identity inputs at the UI boundary', () => {
    assert.equal(normalizePhoneNumber('010-1234-5678'), '01012345678');
    assert.equal(normalizeResidentNumberFront('900101-1abc'), '9001011');
    assert.equal(normalizeResidentNumberFront('9001011234'), '9001011');
  });

  it('requires an identifier and password to enter the login flow', () => {
    assert.deepEqual(validateLoginForm({ loginId: '', password: '' }), {
      loginId: '아이디를 입력해 주세요.',
      password: '비밀번호를 입력해 주세요.',
    });
    assert.deepEqual(
      validateLoginForm({ loginId: 'driver01', password: 'password1' }),
      {},
    );
  });

  it('accepts the complete registration API contract', () => {
    assert.deepEqual(
      validateRegistrationForm({
        loginId: 'driver.01-test',
        name: '홍길동',
        password: 'password123',
        passwordConfirmation: 'password123',
        phoneNumber: '01012345678',
        residentNumberFront: '9001011',
      }),
      {},
    );
  });

  it('rejects incomplete or inconsistent registration details', () => {
    assert.deepEqual(
      validateRegistrationForm({
        loginId: '',
        name: ' ',
        password: '',
        passwordConfirmation: 'different',
        phoneNumber: '021234567',
        residentNumberFront: '900101',
      }),
      {
        loginId: '아이디를 입력해 주세요.',
        name: '이름을 입력해 주세요.',
        password: '비밀번호를 입력해 주세요.',
        passwordConfirmation: '비밀번호가 일치하지 않습니다.',
        phoneNumber: '휴대전화 번호를 정확히 입력해 주세요.',
        residentNumberFront: '주민등록번호 앞 7자리를 숫자로 입력해 주세요.',
      },
    );
  });

  it('enforces the approved DSV identifier and password policy locally', () => {
    assert.deepEqual(
      validateRegistrationForm({
        loginId: 'Driver',
        name: '홍'.repeat(81),
        password: 'short',
        passwordConfirmation: 'short',
        phoneNumber: '0101234567',
        residentNumberFront: '9001011',
      }),
      {
        loginId:
          '아이디는 영문 소문자, 숫자, 점, 밑줄, 하이픈 4~40자로 입력해 주세요.',
        name: '이름은 80자 이하로 입력해 주세요.',
        password: '비밀번호는 8~128자로 입력해 주세요.',
      },
    );
  });

  it('rejects login values outside the backend contract', () => {
    assert.deepEqual(
      validateLoginForm({
        loginId: 'Driver',
        password: 'short',
      }),
      {
        loginId:
          '아이디는 영문 소문자, 숫자, 점, 밑줄, 하이픈 4~40자로 입력해 주세요.',
        password: '비밀번호는 8~128자로 입력해 주세요.',
      },
    );
  });
});
