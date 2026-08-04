const SIGNUP_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export function readDriverSignupInviteToken(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'clever-driver:' || parsed.hostname !== 'signup') {
      return null;
    }
    const token = parsed.searchParams.get('token')?.trim() ?? '';
    return SIGNUP_TOKEN_PATTERN.test(token) ? token : null;
  } catch {
    return null;
  }
}
