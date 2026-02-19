const DEV_FALLBACK_SECRET = 'dev-secret';
const MIN_SECRET_LENGTH = 32;

export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  const env = process.env.NODE_ENV || 'development';
  const isDevLike = env === 'development' || env === 'test';

  if (secret) {
    if (!isDevLike && secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters in ${env} mode`
      );
    }
    return secret;
  }

  if (isDevLike) {
    return DEV_FALLBACK_SECRET;
  }

  throw new Error(`JWT_SECRET is required in ${env} mode`);
}
