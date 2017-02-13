var reqx = require('../index.js');

test('reqx has its api methods', () => {
  expect(typeof reqx.options).toBe('function');
  expect(typeof reqx.uri).toBe('function');
  expect(typeof reqx.method).toBe('function');
  expect(typeof reqx.get).toBe('function');
  expect(typeof reqx.post).toBe('function');
  expect(typeof reqx.put).toBe('function');
  expect(typeof reqx.del).toBe('function');
  expect(typeof reqx.patch).toBe('function');
  expect(typeof reqx.head).toBe('function');
  expect(typeof reqx.sendType).toBe('function');
  expect(typeof reqx.redirect).toBe('function');
  expect(typeof reqx.headers).toBe('function');
  expect(typeof reqx.agent).toBe('function');
  expect(typeof reqx.timeout).toBe('function');
  expect(typeof reqx.pfx).toBe('function');
  expect(typeof reqx.key).toBe('function');
  expect(typeof reqx.passphrase).toBe('function');
  expect(typeof reqx.cert).toBe('function');
  expect(typeof reqx.ca).toBe('function');
  expect(typeof reqx.ciphers).toBe('function');
  expect(typeof reqx.rejectUnauthorized).toBe('function');
  expect(typeof reqx.secureProtocol).toBe('function');
  expect(typeof reqx.servername).toBe('function');
});

//todo
