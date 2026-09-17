import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedIp, validateSampleUrl, ValidationError, isUuid, cleanName } from '../src/lib/validate.js';

describe('isBlockedIp — IPv4', () => {
  const blocked = [
    '0.0.0.0',
    '0.255.255.255',
    '127.0.0.1',
    '127.255.255.254',
    '10.0.0.0',
    '10.255.255.255',
    '169.254.169.254',      // AWS / GCP / Azure metadata
    '172.16.0.0',
    '172.31.255.255',
    '192.168.0.1',
    '100.64.0.1',            // CGNAT
    '100.127.255.255',
    '192.0.2.1',             // TEST-NET-1
    '198.51.100.1',          // TEST-NET-2
    '203.0.113.1',           // TEST-NET-3
    '224.0.0.1',
    '239.255.255.255',
    '240.0.0.1',
    '255.255.255.255',
  ];
  for (const ip of blocked) {
    it(`blocks ${ip}`, () => assert.equal(isBlockedIp(ip), true));
  }

  const allowed = [
    '1.2.3.4',
    '8.8.8.8',
    '11.0.0.1',
    '76.255.255.255',
    '77.0.0.1',
    '99.255.255.255',
    '101.0.0.1',
    '126.255.255.255',
    '128.0.0.1',
    '171.255.255.255',
    '173.0.0.1',
    '191.255.255.255',
    '193.0.0.1',
    '197.255.255.255',
    '199.0.0.1',
    '202.255.255.255',
    '204.0.0.1',
    '223.255.255.255',
  ];
  for (const ip of allowed) {
    it(`allows ${ip}`, () => assert.equal(isBlockedIp(ip), false));
  }
});

describe('isBlockedIp — IPv6', () => {
  const blocked = [
    '::',            // unspecified
    '::1',           // loopback
    'fc00::1',       // ULA
    'fd12:3456:789a::1', // ULA
    'fe80::1',       // link-local
    'feb0::1',       // link-local
    'ff02::1',       // multicast
    'ff00::1',
    '::ffff:127.0.0.1',     // IPv4-mapped loopback
    '::ffff:10.1.2.3',      // IPv4-mapped RFC1918
    '::ffff:169.254.169.254', // IPv4-mapped metadata
  ];
  for (const ip of blocked) {
    it(`blocks ${ip}`, () => assert.equal(isBlockedIp(ip), true));
  }

  const allowed = [
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
    '::ffff:8.8.8.8', // IPv4-mapped public
  ];
  for (const ip of allowed) {
    it(`allows ${ip}`, () => assert.equal(isBlockedIp(ip), false));
  }
});

describe('validateSampleUrl', () => {
  it('rejects non-strings', async () => {
    await assert.rejects(validateSampleUrl(123), ValidationError);
    await assert.rejects(validateSampleUrl(null), ValidationError);
    await assert.rejects(validateSampleUrl({}), ValidationError);
  });

  it('rejects empty / too-long URLs', async () => {
    await assert.rejects(validateSampleUrl(''), ValidationError);
    await assert.rejects(validateSampleUrl('   '), ValidationError);
    await assert.rejects(validateSampleUrl('a'.repeat(2049)), ValidationError);
  });

  it('rejects unparseable URLs', async () => {
    await assert.rejects(validateSampleUrl('not a url'), ValidationError);
  });

  it('rejects non-http(s) schemes', async () => {
    await assert.rejects(validateSampleUrl('ftp://example.com/file'), ValidationError);
    await assert.rejects(validateSampleUrl('file:///etc/passwd'), ValidationError);
    await assert.rejects(validateSampleUrl('gopher://example.com'), ValidationError);
    await assert.rejects(validateSampleUrl('javascript:alert(1)'), ValidationError);
    await assert.rejects(validateSampleUrl('data:text/plain,hello'), ValidationError);
  });

  it('rejects IP literals in internal ranges', async () => {
    await assert.rejects(validateSampleUrl('http://127.0.0.1/foo'), ValidationError);
    await assert.rejects(validateSampleUrl('http://10.1.2.3/'), ValidationError);
    await assert.rejects(validateSampleUrl('http://192.168.1.1/'), ValidationError);
    await assert.rejects(validateSampleUrl('http://[::1]/'), ValidationError);
    await assert.rejects(validateSampleUrl('http://[fe80::1]/'), ValidationError);
  });

  it('rejects localhost names and internal TLDs', async () => {
    await assert.rejects(validateSampleUrl('http://localhost/x'), ValidationError);
    await assert.rejects(validateSampleUrl('http://service.internal/x'), ValidationError);
  });
});

describe('isUuid', () => {
  it('accepts a well-formed uuid', () => {
    assert.equal(isUuid('01234567-89ab-cdef-0123-456789abcdef'), true);
  });
  it('rejects other shapes', () => {
    assert.equal(isUuid('not-a-uuid'), false);
    assert.equal(isUuid(123), false);
    assert.equal(isUuid(''), false);
    assert.equal(isUuid('01234567-89ab-cdef-0123-456789abcde'), false); // one short
  });
});

describe('cleanName', () => {
  it('strips control characters', () => {
    assert.equal(cleanName('a\nb\rc\u0000d'), 'abcd');
  });
  it('clamps length', () => {
    assert.equal(cleanName('x'.repeat(500)).length, 160);
  });
  it('falls back to a default when empty', () => {
    assert.equal(cleanName('   '), 'sample');
  });
});
