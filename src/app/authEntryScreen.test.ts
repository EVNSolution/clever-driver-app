import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const authScreenPath = join(appDirectory, '../ui/auth/AuthEntryScreen.tsx');

describe('DSV authentication entry screen', () => {
  it('keeps the Routes visual entry pattern under the Driver brand', () => {
    const source = readFileSync(authScreenPath, 'utf8');

    assert.match(source, /styles\.brandBlue\}>Clever/u);
    assert.match(source, /styles\.brandGreen\}>Driver/u);
    assert.match(source, /backgroundColor: '#f7f9fc'/u);
    assert.match(source, /backgroundColor: '#0b57d0'/u);
  });

  it('offers ID login and the requested registration fields', () => {
    const source = readFileSync(authScreenPath, 'utf8');

    assert.match(source, /label="아이디"/u);
    assert.match(source, /label="비밀번호"/u);
    assert.match(source, /label="이름"/u);
    assert.match(source, /label="휴대전화 번호"/u);
    assert.match(source, /label="주민등록번호 앞 7자리"/u);
    assert.match(source, /label="비밀번호 확인"/u);
  });

  it('uses the approved DSV authentication client without persisting tokens', () => {
    const source = readFileSync(authScreenPath, 'utf8');

    assert.match(source, /loginDriverAccount/u);
    assert.match(source, /registerDriverAccount/u);
    assert.doesNotMatch(source, /SecureStore|AsyncStorage/u);
  });

  it('shows concrete linked and unlinked success states in Korean', () => {
    const source = readFileSync(authScreenPath, 'utf8');

    assert.match(source, /DSV 배송원 정보와 연결되었습니다/u);
    assert.match(source, /DSV 배송원 정보 연결 대기 중입니다/u);
  });
});
