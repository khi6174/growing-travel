import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createServer } from '../scripts/serve.mjs';

test('loopback demo serves only public assets and unknown API routes are not found', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const index = await fetch(base);
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.match(await index.text(), /<script type="module" src="\/app\.mjs"><\/script>/);
    for (const route of ['/styles.css','/app.mjs','/data.mjs','/domain.mjs','/storage.mjs','/real-catalog.mjs','/travel-domain.mjs','/travel-journey.mjs','/travel-links.mjs','/real-travel-view.mjs']) {
      assert.equal((await fetch(base + route)).status, 200, route);
    }
    for (const route of ['/assets/station.png','/assets/garden.png','/assets/bookstore.png']) {
      const asset = await fetch(base + route);
      assert.equal(asset.status, 200, route);
      assert.equal(asset.headers.get('content-type'), 'image/png');
      assert.deepEqual([...new Uint8Array(await asset.arrayBuffer()).slice(0, 8)], [137,80,78,71,13,10,26,10]);
    }
    // P47: the self-hosted Pretendard subsets come from this server, so the CSP stays 'self'.
    const fontSheet = await fetch(base + '/fonts/pretendard/pretendardvariable-dynamic-subset.css');
    assert.equal(fontSheet.status, 200);
    const fontFile = (await fontSheet.text()).match(/url\(\.\/([^)]+\.woff2)\)/)[1];
    const font = await fetch(`${base}/fonts/pretendard/${fontFile}`);
    assert.equal(font.status, 200);
    assert.equal(font.headers.get('content-type'), 'font/woff2');
    assert.equal(new TextDecoder().decode(new Uint8Array(await font.arrayBuffer()).slice(0, 4)), 'wOF2');
    for (const route of ['/README.md','/..%2fREADME.md','/..%5cREADME.md','/api/courses']) {
      assert.equal((await fetch(base + route)).status, 404, route);
    }
    assert.equal((await fetch(base, {method:'POST'})).status,405);
    const rejectedHost = await new Promise((resolve, reject) => {
      const req = request(base, { headers: { Host: 'untrusted.example' } }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(rejectedHost, 403);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
