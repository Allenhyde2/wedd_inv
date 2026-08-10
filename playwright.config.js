// 이 저장소는 빌드 과정이 없다. index.html 을 file:// 로 직접 열어 검증한다.
const fs = require('fs');

// 샌드박스 환경에는 크로미움이 고정 경로에 미리 설치되어 있다.
// macOS/Windows 등 일반 환경에서는 이 경로가 없으므로
// Playwright 가 `npx playwright install chromium` 으로 받은 브라우저를 쓰게 둔다.
const SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = {
  args: ['--allow-file-access-from-files'], // file:// 문서에서 로컬 에셋 접근 허용
};
if (fs.existsSync(SANDBOX_CHROME)) launchOptions.executablePath = SANDBOX_CHROME;

module.exports = {
  testDir: './tests',
  timeout: 45000,
  expect: { timeout: 8000 },
  fullyParallel: true,
  workers: 2, // 캔버스 애니메이션이 무거워 3 이상이면 타이밍 플레이크가 생긴다
  reporter: [['list'], ['json', { outputFile: 'results.json' }]],
  use: {
    viewport: { width: 420, height: 880 }, // 모바일 청첩장이므로 폰 폭 기준
    deviceScaleFactor: 2,
    launchOptions,
  },
};
