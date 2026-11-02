import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CERT_DIR, lanAddresses } from './serve.mjs';

// D29 phone demo: a self-signed certificate for `node scripts/serve.mjs --lan`, valid 30 days for localhost and
// this computer's current IPv4 addresses. Files go to .cert/ (Git-ignored); nothing is installed or trusted
// system-wide, so the phone shows a certificate warning once. Rerun after the Wi-Fi address changes.
const CANDIDATES = ['openssl', 'C:/Program Files/Git/usr/bin/openssl.exe', 'C:/Program Files/Git/mingw64/bin/openssl.exe'];
const openssl = CANDIDATES.find((command) => spawnSync(command, ['version'], { encoding: 'utf8' }).status === 0);
if (!openssl) {
  console.error('openssl을 찾지 못했어요. Git for Windows를 설치했거나 openssl이 PATH에 있는지 확인해 주세요.');
  process.exitCode = 1;
} else {
  const addresses = ['127.0.0.1', ...lanAddresses()];
  await fs.mkdir(CERT_DIR, { recursive: true });
  const result = spawnSync(openssl, [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '30',
    '-keyout', path.join(CERT_DIR, 'key.pem'), '-out', path.join(CERT_DIR, 'cert.pem'),
    '-subj', '/CN=Growing Travel local demo',
    '-addext', `subjectAltName=${['DNS:localhost', ...addresses.map((address) => `IP:${address}`)].join(',')}`,
  ], { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
  if (result.status !== 0) { console.error(result.stderr || '인증서를 만들지 못했어요.'); process.exitCode = 1; }
  else console.log(`.cert/에 30일짜리 자체 서명 인증서를 만들었어요 (${addresses.join(', ')}).\n이제 node scripts/serve.mjs --lan 으로 켜세요.`);
}
