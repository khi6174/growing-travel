import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.mjs';
import { providerFromEnv } from './ai-provider.mjs';
import { createWeather } from './weather.mjs';

const publicRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const defaultDataDir = fileURLToPath(new URL('../data/', import.meta.url));
export const CERT_DIR = fileURLToPath(new URL('../.cert/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
export const LOCAL_HOSTS = Object.freeze(['127.0.0.1', 'localhost']);
const ACCESS_COOKIE = 'gt_access';

// D29 phone demo: this computer's own IPv4 addresses, so a phone on the same Wi-Fi can open the HTTPS server.
export function lanAddresses(interfaces = os.networkInterfaces()) {
  return Object.values(interfaces).flat().filter((entry) => entry?.family === 'IPv4' && !entry.internal).map((entry) => entry.address);
}
export const isPrivateAddress = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
const hostName = (host = '') => (/^[a-z0-9.-]+(:\d+)?$/i.test(host) ? host.replace(/:\d+$/, '').toLowerCase() : '');
const isLoopback = (address = '') => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
function hasAccess(req, code) {
  const sent = (req.headers.cookie ?? '').split(';').map((part) => part.trim().split('=')).find(([name]) => name === ACCESS_COOKIE)?.[1] ?? '';
  return sent.length === code.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(code));
}

// A Kakao JavaScript key is 32 hexadecimal characters; anything else is treated as not set.
export const kakaoKeyFrom = (value) => (/^[0-9a-f]{32}$/i.test(value ?? '') ? value : null);
// D35: KMA 단기예보 uses the data.go.kr account key; KMA_SERVICE_KEY wins, else the TourAPI key from the same account.
export const weatherKeyFrom = (env) => env.KMA_SERVICE_KEY || env.TOURAPI_KEY || null;
// D30: the Kakao map SDK loads from dapi.kakao.com, pulls its main script from kakaocdn.net (4.5.x, seen
// 2026-11-02) and draws tiles from daumcdn.net/kakaocdn.net. Those hosts are allowed only when a key is configured;
// host sources without a scheme follow the page's own http/https.
// D44: with a TourAPI key, nearby places may show 한국관광공사 photos, served from tong.visitkorea.or.kr over HTTPS.
export function contentSecurityPolicy(kakaoJsKey = null, { photos = false } = {}) {
  const map = kakaoJsKey ? ' dapi.kakao.com *.kakaocdn.net *.daumcdn.net' : '';
  const photo = photos ? ' https://tong.visitkorea.or.kr' : '';
  return `default-src 'self'; script-src 'self'${map}; style-src 'self'; img-src 'self' data:${map}${photo}; connect-src 'self'${map}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`;
}

// Loopback HTTP by default. With `tls`, `hosts` and `accessCode` (the --lan mode) other devices may connect, but only
// through this computer's own addresses and only after opening the printed address that carries the code once.
export function createServer({ dataDir = defaultDataDir, aiProvider = providerFromEnv(), aiTimeoutMs = Number(process.env.AI_TIMEOUT_MS) || 10000, tls = null, hosts = LOCAL_HOSTS, accessCode = null, kakaoJsKey = kakaoKeyFrom(process.env.KAKAO_JS_KEY), weather = createWeather({ key: weatherKeyFrom(process.env) }), kakaoRestKey = kakaoKeyFrom(process.env.KAKAO_REST_KEY), tourKey = process.env.TOURAPI_KEY || null, searchFetch = fetch } = {}) {
  const api = createApi({ dataDir, aiProvider, aiTimeoutMs, kakaoJsKey, weather, kakaoRestKey, tourKey, searchFetch });
  const allowed = new Set(hosts);
  const policy = contentSecurityPolicy(kakaoJsKey, { photos: Boolean(tourKey) });
  // Kakao checks the requesting site against the key's registered domains, so map mode sends the origin (never the
  // path) to other sites; without a key nothing is sent.
  const referrer = kakaoJsKey ? 'strict-origin-when-cross-origin' : 'no-referrer';
  async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', referrer);
    res.setHeader('Content-Security-Policy', policy);
    if (!allowed.has(hostName(req.headers.host))) {
      res.writeHead(403); res.end('Local requests only'); return;
    }
    const url = new URL(req.url, 'http://localhost');
    if (accessCode && !isLoopback(req.socket.remoteAddress) && !hasAccess(req, accessCode)) {
      if (url.searchParams.get('code') === accessCode) {
        res.writeHead(303, { 'Set-Cookie': `${ACCESS_COOKIE}=${accessCode}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${tls ? '; Secure' : ''}`, Location: url.pathname });
        res.end(); return;
      }
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('접속 코드가 필요해요. 서버를 켠 컴퓨터에 나온 주소를 그대로 열어 주세요.'); return;
    }
    if (url.pathname.startsWith('/api/')) { await api.handle(req, res, url.pathname, url.searchParams); return; }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed'); return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const target = path.resolve(publicRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
      const relative = path.relative(publicRoot, target);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !mime[path.extname(target)]) {
        res.writeHead(404); res.end('Not found'); return;
      }
      const content = await fs.readFile(target);
      res.writeHead(200, { 'Content-Type': mime[path.extname(target)] });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      res.writeHead(error instanceof URIError ? 400 : 404); res.end('Not found');
    }
  }
  return tls ? https.createServer(tls, handle) : http.createServer(handle);
}

// `node scripts/serve.mjs` serves http://127.0.0.1:4173 to this computer only. `--lan` serves HTTPS on every
// interface for a phone on the same Wi-Fi (browsers give location only to HTTPS pages), using the self-signed
// certificate from `node scripts/make-cert.mjs` and a new access code each run.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // AI keys live in a local .env (Git-ignored); see .env.example.
  const envFile = fileURLToPath(new URL('../.env', import.meta.url));
  try { process.loadEnvFile(envFile); } catch (error) { if (error.code !== 'ENOENT') console.error(`.env not loaded: ${error.message}`); }
  const lan = process.argv.includes('--lan');
  const portArg = process.argv.indexOf('--port');
  const port = portArg === -1 ? (lan ? 4443 : 4173) : Number(process.argv[portArg + 1]);
  let tls = null;
  if (lan) {
    try { tls = { key: await fs.readFile(path.join(CERT_DIR, 'key.pem')), cert: await fs.readFile(path.join(CERT_DIR, 'cert.pem')) }; }
    catch { console.error('인증서가 없어요. 먼저 node scripts/make-cert.mjs 를 실행해 주세요.'); process.exitCode = 1; }
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error('Use a port from 1024 to 65535.'); process.exitCode = 1;
  } else if (!lan || tls) {
    const aiProvider = providerFromEnv();
    const addresses = lan ? lanAddresses() : [];
    const accessCode = lan ? crypto.randomBytes(6).toString('base64url') : null;
    const server = createServer({ aiProvider, tls, hosts: [...LOCAL_HOSTS, ...addresses], accessCode });
    server.on('error', (error) => {
      console.error(error.code === 'EADDRINUSE'
        ? `Port ${port} is in use. Stop the existing demo or use --port 4174 (separate browser storage).`
        : error.message);
      process.exitCode = 1;
    });
    const map = process.env.KAKAO_JS_KEY && !kakaoKeyFrom(process.env.KAKAO_JS_KEY) ? 'KAKAO_JS_KEY 형식이 달라요(32자리 JavaScript 키). 지도 대신 목록으로 보여요.' : `지도: ${kakaoKeyFrom(process.env.KAKAO_JS_KEY) ? '카카오맵 (키 설정됨)' : '카카오맵 키 없음, 목록으로 표시'}`;
    const sky = `날씨: ${weatherKeyFrom(process.env) ? '기상청 단기예보 (공공데이터포털 키 설정됨, 활용신청이 안 됐으면 계절만 보여요)' : '키 없음, 계절만 보여요'}`;
    const search = `출발지 검색: ${kakaoKeyFrom(process.env.KAKAO_REST_KEY) ? '카카오 장소 검색 (REST 키 설정됨)' : 'REST 키 없음, 앱 안의 역·후보지에서만 찾아요'}`;
    const around = `근처 추천: ${[kakaoKeyFrom(process.env.KAKAO_REST_KEY) && '카카오 장소 검색', process.env.TOURAPI_KEY && 'TourAPI 위치 기반·행사'].filter(Boolean).join(' + ') || '키 없음, 팀이 정리한 장소에서만 골라요'}`;
    const ai = `AI: ${aiProvider.configured ? `${aiProvider.name} (${aiProvider.model})` : `${aiProvider.name} not configured, rule ranking only`}\n${map}\n${sky}\n${search}\n${around}`;
    server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
      if (!lan) { console.log(`Growing Travel · Local: http://127.0.0.1:${port}\n${ai}\nStop: Ctrl+C`); return; }
      console.log(`Growing Travel · 같은 와이파이 휴대폰 시연 (HTTPS, 자체 서명 인증서)\n이 컴퓨터: https://127.0.0.1:${port}`);
      for (const address of addresses) console.log(`휴대폰: https://${address}:${port}/?code=${accessCode}${isPrivateAddress(address) ? '' : '  ← 사설망 주소가 아니라 와이파이 밖에서도 닿을 수 있어요. 코드를 공유하지 마세요.'}`);
      console.log(`인증서 경고가 뜨면 '고급 → 계속'을 고르세요. Windows 방화벽 허용 창은 직접 판단해 주세요.\n와이파이가 바뀌면 주소가 달라지니 make-cert와 이 서버를 다시 실행하세요.\n${ai}\n시연이 끝나면 Ctrl+C로 꺼 주세요.`);
    });
    process.on('SIGINT', () => server.close());
    process.on('SIGTERM', () => server.close());
  }
}
