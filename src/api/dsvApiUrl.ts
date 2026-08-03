const API_BASE_URL_ENV = 'EXPO_PUBLIC_DSV_API_BASE_URL';

export function resolveDsvApiUrl(path: string): string {
  const rawBaseUrl = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;

  if (rawBaseUrl === undefined || rawBaseUrl.trim().length === 0) {
    throw new Error(`${API_BASE_URL_ENV} 환경 변수를 설정해 주세요.`);
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error(`${API_BASE_URL_ENV} 환경 변수의 URL 형식을 확인해 주세요.`);
  }

  const isLocalHttp =
    baseUrl.protocol === 'http:' &&
    (baseUrl.hostname === 'localhost' || baseUrl.hostname === '127.0.0.1');

  if (baseUrl.protocol !== 'https:' && !isLocalHttp) {
    throw new Error(
      'DSV API 기본 주소는 localhost 또는 127.0.0.1을 제외하고 https를 사용해야 합니다.',
    );
  }

  const normalizedBaseUrl = rawBaseUrl.endsWith('/')
    ? rawBaseUrl
    : `${rawBaseUrl}/`;

  return new URL(path.replace(/^\//u, ''), normalizedBaseUrl).toString();
}
