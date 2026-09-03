const { verifyTelegramInitData, createMockInitData } = require('../src/middleware/auth');

describe('Telegram initData Verification', () => {
  const token = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';

  test('validates valid initData signature correctly', () => {
    const userObj = { id: 777888999, first_name: 'TestUser', username: 'testuser' };
    const initDataStr = createMockInitData(userObj, token);

    const verifiedUser = verifyTelegramInitData(initDataStr, token);
    expect(verifiedUser).not.toBeNull();
    expect(verifiedUser.id).toBe(777888999);
    expect(verifiedUser.username).toBe('testuser');
  });

  test('rejects tampered or invalid initData hash', () => {
    const userObj = { id: 777888999, first_name: 'TestUser' };
    let initDataStr = createMockInitData(userObj, token);
    initDataStr = initDataStr.replace('TestUser', 'HackedUser');

    const verifiedUser = verifyTelegramInitData(initDataStr, token);
    expect(verifiedUser).toBeNull();
  });
});
