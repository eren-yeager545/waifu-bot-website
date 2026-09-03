import crypto from 'crypto';

/**
 * Validates Telegram WebApp initData string using secret key derived from bot token.
 * Returns parsed user object if valid, throws error if invalid.
 */
export function validateAndParseInitData(initData, botToken) {
  if (!initData) {
    throw new Error('Missing initData');
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    throw new Error('Missing hash in initData');
  }

  params.delete('hash');

  const keys = Array.from(params.keys()).sort();
  const dataCheckString = keys.map(key => `${key}=${params.get(key)}`).join('\n');

  // Secret key = HMAC-SHA256("WebAppData", botToken)
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

  // Calculated hash = HMAC-SHA256(secretKey, dataCheckString)
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (calculatedHash !== hash) {
    throw new Error('Invalid initData signature');
  }

  const userStr = params.get('user');
  if (!userStr) {
    throw new Error('Missing user parameter in initData');
  }

  try {
    const user = JSON.parse(userStr);
    const startParam = params.get('start_param');
    return { user, startParam };
  } catch (err) {
    throw new Error('Failed to parse user JSON from initData');
  }
}

/**
 * Helper to generate valid Telegram initData for development/testing
 */
export function createMockInitData(userObj, botToken, startParam = null) {
  const userJson = JSON.stringify(userObj);
  const params = new URLSearchParams();
  params.set('auth_date', Math.floor(Date.now() / 1000).toString());
  if (startParam) {
    params.set('start_param', startParam);
  }
  params.set('user', userJson);

  const keys = Array.from(params.keys()).sort();
  const dataCheckString = keys.map(key => `${key}=${params.get(key)}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  params.set('hash', hash);
  return params.toString();
}
