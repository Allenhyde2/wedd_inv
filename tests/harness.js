// 공용 테스트 하니스: 오프라인 환경에서 CDN/이미지/폰트를 로컬 자산으로 대체
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TAILWIND = fs.readFileSync(
  path.join(ROOT, 'node_modules/@tailwindcss/browser/dist/index.global.js'),
  'utf8'
);
const PLACEHOLDER = fs.readFileSync(path.join(__dirname, 'ph.jpg'));

const PAGE_URL = 'file://' + path.join(ROOT, 'index.html');

/** 네트워크 스텁 + 콘솔/페이지 에러 수집. 반환: errors 배열 */
async function setup(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push({ kind: 'console', text: m.text() });
  });
  page.on('pageerror', (e) => errors.push({ kind: 'pageerror', text: e.message }));

  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.includes('cdn.jsdelivr.net') && url.includes('tailwindcss')) {
      return route.fulfill({ contentType: 'application/javascript', body: TAILWIND });
    }
    if (url.includes('images.unsplash.com')) {
      return route.fulfill({ contentType: 'image/jpeg', body: PLACEHOLDER });
    }
    if (url.includes('fonts.googleapis.com')) {
      return route.fulfill({ contentType: 'text/css', body: '' });
    }
    if (url.includes('fonts.gstatic.com')) {
      return route.fulfill({ status: 200, body: '' });
    }
    // 외부 네트워크는 전부 차단한다.
    // 인터넷이 되는 개발 머신에서는 진짜 카카오 SDK 가 먼저 로드되어
    // loadKakaoSdk 의 `window.kakao 가 이미 있으면 재사용` 분기를 타고,
    // 테스트가 심어둔 가짜 SDK 가 호출되지 않아 실패한다.
    // 여기서 막아두면 어느 머신에서 돌리든 같은 출발선에서 시작한다.
    // (가짜 SDK 가 필요한 테스트는 open() 이후에 자기 route 를 등록해 우선순위를 가진다)
    if (/^https?:/.test(url)) return route.abort();
    return route.continue();
  });
  return errors;
}

/**
 * 페이지 열기.
 * @param {object} opts.admin   true 면 ?admin=1 (관리자 모드)로 접속
 * @param {object} opts.storage 사전 주입할 localStorage
 */
async function open(page, { admin = false, storage = null } = {}) {
  const errors = await setup(page);
  if (storage) {
    await page.addInitScript((s) => {
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    }, storage);
  }
  await page.goto(PAGE_URL + (admin ? '?admin=1' : ''));
  await page.waitForFunction(() => typeof window.updateInviteRealtime === 'function');
  return errors;
}

/** 인트로를 건너뛰고 메인 화면 진입까지 대기 */
async function skipToMain(page) {
  await page.evaluate(() => skipSplash());
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('splash-layer')).display === 'none',
    null,
    { timeout: 8000 }
  );
}

const INTRO_TOTAL_MS = 3 * (2800 + 1200) + 600; // 멘트 3개 × (노출+전환) + 초기 지연

module.exports = { setup, open, skipToMain, PAGE_URL, INTRO_TOTAL_MS };
