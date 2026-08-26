import { resolveDsvApiUrl } from './dsvApiUrl';

export type DriverConnectionStatus = 'LINKED' | 'UNLINKED';

export type LinkedDriver = {
  driverId: string;
  name: string;
  shopDomain: string;
};

export type DriverAccount = {
  id: string;
  loginId: string;
  name: string;
  phone: string;
  connectionStatus: DriverConnectionStatus;
  linkedDrivers: LinkedDriver[];
};

export type DriverAuthSession = {
  account: DriverAccount;
  accessToken: string;
  expiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  tokenType: string;
  ttlSeconds: number;
  use: 'dsv_driver_account';
};

export type RegisterDriverAccountRequest = {
  loginId: string;
  password: string;
  name: string;
  phone: string;
  signupInviteToken: string | null;
};

export type DriverSignupInvite = {
  driverName: string;
  expiresAt: string;
  phoneLast4: string;
  shopDomain?: string;
};

export type LoginDriverAccountRequest = {
  loginId: string;
  password: string;
};

export type RefreshDriverAccountRequest = {
  refreshToken: string;
};

type ErrorEnvelope = {
  data: null;
  error: {
    code: string;
    message: string;
  };
};

type SuccessEnvelope = {
  data: DriverAuthSession;
  error?: null;
};

type AuthEnvelope = ErrorEnvelope | SuccessEnvelope;

type SignupInviteEnvelope = ErrorEnvelope | {
  data: { invite: DriverSignupInvite };
  error?: null;
};

export class AuthApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

export async function registerDriverAccount(
  request: RegisterDriverAccountRequest,
): Promise<DriverAuthSession> {
  return postAuth('/api/dsv/driver/auth/register', request);
}

export async function validateDriverSignupInvite(
  token: string,
): Promise<DriverSignupInvite> {
  const envelope = await postJson<SignupInviteEnvelope>(
    '/api/dsv/driver/auth/signup-invite/validate',
    { token },
  );
  if (envelope.data === null) {
    throw new AuthApiError(envelope.error.code, envelope.error.message);
  }
  const invite = envelope.data?.invite;
  if (
    invite === undefined
    || typeof invite.driverName !== 'string'
    || typeof invite.expiresAt !== 'string'
    || typeof invite.phoneLast4 !== 'string'
    || (invite.shopDomain !== undefined && typeof invite.shopDomain !== 'string')
  ) {
    throw new AuthApiError(
      'INVALID_AUTH_RESPONSE',
      '가입 링크를 확인하지 못했습니다. 서버 배포 상태를 확인해 주세요.',
    );
  }
  return invite;
}

export async function loginDriverAccount(
  request: LoginDriverAccountRequest,
): Promise<DriverAuthSession> {
  return postAuth('/api/dsv/driver/auth/login', request);
}

export async function refreshDriverAccountSession(
  request: RefreshDriverAccountRequest,
): Promise<DriverAuthSession> {
  return postAuth('/api/dsv/driver/auth/refresh', request);
}

async function postAuth(
  path: string,
  body:
    | RegisterDriverAccountRequest
    | LoginDriverAccountRequest
    | RefreshDriverAccountRequest,
): Promise<DriverAuthSession> {
  const envelope = await postJson<AuthEnvelope>(path, body);

  if (envelope.data === null) {
    throw new AuthApiError(envelope.error.code, envelope.error.message);
  }

  if (envelope.data?.use !== 'dsv_driver_account') {
    throw new AuthApiError(
      'INVALID_AUTH_RESPONSE',
      'DSV 배송원 인증 응답을 확인할 수 없습니다.',
    );
  }

  return envelope.data;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let url: string;
  try {
    url = resolveDsvApiUrl(path);
  } catch (error) {
    throw new AuthApiError(
      'INVALID_API_BASE_URL',
      error instanceof Error ? error.message : 'DSV API 기본 주소를 확인해 주세요.',
    );
  }

  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  return (await response.json()) as T;
}
