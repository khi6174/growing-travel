// The Kakao Maps SDK, loaded once for the living map and the in-app route guide. Rejects with 'no-key' when no key
// is set (KAKAO_JS_KEY), or 'load' when Kakao refuses it (usually a site address not registered for the key).
let loading = null;
export function kakaoSdk() {
  loading ??= (async () => {
    const response = await fetch('/api/map-config');
    const { kakaoJsKey } = await response.json().catch(() => ({}));
    if (!kakaoJsKey) throw new Error('no-key');
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(kakaoJsKey)}&autoload=false`;
      script.addEventListener('load', resolve); script.addEventListener('error', () => reject(new Error('load')));
      setTimeout(() => reject(new Error('load')), 8000);
      document.head.append(script);
    });
    if (!globalThis.kakao?.maps?.load) throw new Error('load');
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('load')), 8000); globalThis.kakao.maps.load(() => { clearTimeout(timer); resolve(); }); });
    return globalThis.kakao;
  })();
  return loading;
}
