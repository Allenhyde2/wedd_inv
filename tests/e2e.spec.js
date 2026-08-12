// E2E 테스트: 하객이 실제로 겪는 흐름을 그대로 재현
const { test, expect } = require('@playwright/test');
const { open, skipToMain, INTRO_TOTAL_MS } = require('./harness');

test.describe('인트로(스플래시)', () => {
  test('E-01 계절에 맞게 수정된 멘트 3개가 순서대로 노출', async ({ page }) => {
    await open(page);
    const seen = [];
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(i === 0 ? 900 : 4000);
      seen.push(await page.locator('#intro-text-element').innerHTML());
    }
    expect(seen[0]).toContain('같은 곳을 바라보게');
    expect(seen[1]).toContain('여름의 끝자락');
    expect(seen[1]).not.toContain('가을');
    expect(seen[2]).toContain('햇살과 그늘');

    await page.waitForTimeout(4200);
    await expect(page.locator('#action-prompt-container')).toHaveCSS('opacity', '1');
  });

  test('E-02 축하 버튼 클릭 시 메인 화면으로 전환', async ({ page }) => {
    await open(page);
    await page.waitForTimeout(INTRO_TOTAL_MS + 500);
    await page.locator('#celebrate-btn').click({ force: true });
    await page.waitForTimeout(5200);
    await expect(page.locator('#splash-layer')).toBeHidden();
    await expect(page.locator('#main-layer')).toHaveClass(/fade-in/);
  });

  test('E-03 SKIP INTRO로 즉시 건너뛰기', async ({ page }) => {
    await open(page);
    await page.getByText('SKIP INTRO').click({ force: true });
    await page.waitForTimeout(3300);
    await expect(page.locator('#splash-layer')).toBeHidden();
  });

  test('E-04 캔버스 터치 시 물결이 생성됨', async ({ page }) => {
    await open(page);
    const before = await page.evaluate(() => activeWaves.length);
    await page.locator('#splash-canvas').click({ position: { x: 200, y: 400 }, force: true });
    const after = await page.evaluate(() => activeWaves.length);
    expect(after).toBeGreaterThan(before);
  });
});

test.describe('메인 화면 · 모달 내비게이션', () => {
  const menus = [
    ['btn-menu-1', 'modal-greeting', 'GREETING'],
    ['btn-menu-2', 'modal-gallery', 'GALLERY'],
    ['btn-menu-3', 'modal-map', 'LOCATION'],
    ['btn-menu-4', 'modal-accounts', 'ACCOUNTS'],
  ];

  for (const [btn, modal, title] of menus) {
    test(`E-05 ${title} 모달 열기/닫기`, async ({ page }) => {
      await open(page);
      await skipToMain(page);
      await page.locator(`#${btn}`).click({ force: true });
      await page.waitForTimeout(800);
      await expect(page.locator(`#${modal}`)).toHaveClass(/open/);
      await expect(page.locator(`#${modal}`)).toContainText(title);
      await page.locator(`#${modal} button:has-text("✕")`).first().click({ force: true });
      await page.waitForTimeout(800);
      await expect(page.locator(`#${modal}`)).not.toHaveClass(/open/);
    });
  }

  test('E-06 [FIX] RSVP·방명록 모달과 5번 버튼이 완전히 제거됨', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    await expect(page.locator('#modal-rsvp')).toHaveCount(0);
    await expect(page.locator('#btn-menu-5')).toHaveCount(0);
    await expect(page.locator('#guestbook-form')).toHaveCount(0);
    await expect(page.locator('#rsvp-form')).toHaveCount(0);
    const html = await page.content();
    expect(html).not.toContain('방명록');
    expect(html).not.toContain('RSVP');
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).not.toContain('wedding_guestbook');
  });

  test('E-07 메뉴 버튼 4개가 모두 화면 안에 배치됨', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    const frame = await page.locator('.phone-frame').boundingBox();
    for (let i = 1; i <= 4; i++) {
      const b = await page.locator(`#btn-menu-${i}`).boundingBox();
      expect(b.x, `btn-menu-${i} 좌측 이탈`).toBeGreaterThanOrEqual(frame.x - 1);
      expect(b.x + b.width, `btn-menu-${i} 우측 이탈`).toBeLessThanOrEqual(frame.x + frame.width + 1);
      expect(b.y + b.height, `btn-menu-${i} 하단 이탈`).toBeLessThanOrEqual(frame.y + frame.height + 1);
    }
  });
});

test.describe('갤러리 · 라이트박스', () => {
  test('E-08 썸네일 클릭 → 라이트박스 열림 · 화살표 이동', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    await page.locator('#btn-menu-2').click({ force: true });
    await page.waitForTimeout(800);
    // 서브그리드 첫 칸 = 전체 2번째 사진
    await page.locator('#gallery-grid > div').nth(0).click({ force: true });
    await page.waitForTimeout(500);
    await expect(page.locator('#lightbox-overlay')).toHaveCSS('opacity', '1');
    const n = await page.evaluate(() => activeConfig.gallery.length);
    await expect(page.locator('#lightbox-index')).toHaveText(`2 / ${n}`);
    await page.locator('button:has-text("▶")').click({ force: true });
    await expect(page.locator('#lightbox-index')).toHaveText(`3 / ${n}`);
    await page.locator('button:has-text("✕ CLOSE")').click({ force: true });
    await page.waitForTimeout(500);
    await expect(page.locator('#lightbox-overlay')).toHaveCSS('opacity', '0');
  });
});

test.describe('[FIX] 관리자 게이팅', () => {
  test('E-09 하객(일반 접속)에게는 톱니 버튼이 보이지 않음', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    await expect(page.locator('#admin-gear')).toBeHidden();
    await expect(page.locator('#settings-panel')).not.toHaveClass(/open/);
  });

  test('E-10 ?admin=1 + 비밀번호 통과 시 패널이 열림', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    const gear = page.locator('#admin-gear');
    await expect(gear).toBeVisible();
    await gear.click({ force: true });
    await page.waitForTimeout(400);
    await page.locator('#admin-pass-input').fill('5589');
    await page.locator('#admin-pass-input').press('Enter');
    await page.waitForTimeout(800);
    await expect(page.locator('#settings-panel')).toHaveClass(/open/);
    await expect(page.locator('#settings-panel')).toContainText('관리자 전용');
    await expect(page.locator('#cfg-groom-name')).toBeEditable();
  });

  test('E-11 [핵심 수정] 관리자의 임시 설정이 하객 화면에 새어나가지 않음', async ({ page, browser }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await page.evaluate(() => {
      document.getElementById('cfg-groom-name').value = '임시신랑';
      document.getElementById('cfg-bride-name').value = '임시신부';
      updateInviteRealtime();
    });
    await expect(page.locator('#view-couple-names')).toHaveText('임시신부 🤍 임시신랑');

    // 같은 브라우저·같은 origin이지만 하객 URL로 접속하면 DEFAULT_CONFIG가 보인다
    const guestUrl = (await page.evaluate(() => location.href)).replace('?admin=1', '');
    await page.goto(guestUrl);
    await page.waitForFunction(() => typeof updateInviteRealtime === 'function');
    await skipToMain(page);
    await expect(page.locator('#view-couple-names')).toHaveText('정선애 🤍 고용건');

    // 새 하객(별도 컨텍스트)도 동일
    const ctx = await browser.newContext();
    const guest = await ctx.newPage();
    await open(guest);
    await skipToMain(guest);
    await expect(guest.locator('#view-couple-names')).toHaveText('정선애 🤍 고용건');
    await ctx.close();
  });

  test('E-12 관리자 모드에서 버튼 위치 조정 후 새로고침해도 유지', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await page.evaluate(() => {
      document.getElementById('cfg-m1-x').value = 45;
      updateInviteRealtime();
    });
    expect(await page.locator('#btn-menu-1').evaluate((e) => e.style.left)).toBe('45%');

    await page.reload();
    await page.waitForFunction(() => typeof updateInviteRealtime === 'function');
    await skipToMain(page);
    expect(await page.locator('#btn-menu-1').evaluate((e) => e.style.left)).toBe('45%');
  });
});

test.describe('[FIX] 실제 예식 정보 표시', () => {
  test('E-13 커버·푸터에 실제 정보가 표시됨', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    await expect(page.locator('#view-couple-names')).toHaveText('정선애 🤍 고용건');
    await expect(page.locator('#view-date')).toHaveText('2026. 09. 05. SATURDAY AM 11:00');
    await expect(page.locator('#view-venue')).toHaveText('중림동 약현성당');
    await expect(page.locator('#dday-count-element')).toContainText('남았습니다');
  });

  test('E-14 [FIX] 예식일을 바꾸면 D-day와 푸터 문구가 함께 갱신', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await page.evaluate(() => {
      document.getElementById('cfg-date').value = '2027/05/15 18:30:00';
      updateInviteRealtime();
    });
    await page.waitForTimeout(400);
    await expect(page.locator('#view-date')).toHaveText('2027. 05. 15. SATURDAY PM 6:30');
    await expect(page.locator('#dday-count-element')).not.toContainText('2026');
  });

  test('E-15 오시는 길에 성당·교통·주차 정보가 표시', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    await page.locator('#btn-menu-3').click({ force: true });
    await page.waitForTimeout(800);
    await expect(page.locator('#map-venue-name')).toHaveText('중림동 약현성당');
    await expect(page.locator('#map-venue-address')).toHaveText('서울특별시 중구 청파로 447-1');
    await expect(page.locator('#map-parking')).toContainText('서소문역사공원 주차장');
    await expect(page.locator('#map-parking')).toContainText('칠패로 5');
    await expect(page.locator('#map-parking-benefit')).toHaveText('2시간 무료 주차권 제공');
  });

  test('E-16 [FIX] 지도 버튼이 실제 지도 서비스로 연결됨', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    for (const id of ['link-kakaonavi', 'link-navermap', 'link-parking']) {
      const href = await page.locator(`#${id}`).getAttribute('href');
      expect(href, `${id} 가 placeholder`).not.toBe('#');
      expect(href).toMatch(/^https:\/\//);
    }
  });

  test('E-17 [FIX] 샘플 데이터가 남아 있지 않음', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    const html = await page.content();
    for (const stale of [
      '이민우', '김지현', '아펠가모', '김철수', '이영희', '박호진', '최은경',
      '123456-01-123456', '987-654-321012', '반포대로 235',
    ]) {
      expect(html, `샘플 데이터 잔존: ${stale}`).not.toContain(stale);
    }
  });
});

test.describe('[FIX] 공유 · 메타데이터', () => {
  test('E-18 OG / Twitter 메타태그가 존재', async ({ page }) => {
    await open(page);
    const meta = await page.evaluate(() => {
      const get = (sel, attr) => {
        const el = document.querySelector(sel);
        return el ? el.getAttribute(attr) : null;
      };
      return {
        ogTitle: get('meta[property="og:title"]', 'content'),
        ogDesc: get('meta[property="og:description"]', 'content'),
        ogImage: get('meta[property="og:image"]', 'content'),
        ogUrl: get('meta[property="og:url"]', 'content'),
        twCard: get('meta[name="twitter:card"]', 'content'),
        desc: get('meta[name="description"]', 'content'),
      };
    });
    expect(meta.ogTitle).toContain('고용건');
    expect(meta.ogDesc).toContain('약현성당');
    // 카카오톡은 절대 URL만 인식한다
    expect(meta.ogImage).toMatch(/^https:\/\//);
    expect(meta.ogUrl).toMatch(/^https:\/\//);
    expect(meta.twCard).toBe('summary_large_image');
    expect(meta.desc).toBeTruthy();
  });

  test('E-19 [FIX] 이름을 바꾸면 document.title도 함께 갱신', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    expect(await page.title()).toContain('고용건');
    await page.evaluate(() => {
      document.getElementById('cfg-groom-name').value = '새신랑';
      updateInviteRealtime();
    });
    expect(await page.title()).toContain('새신랑');
    expect(await page.title()).not.toContain('고용건');
  });
});

test.describe('반응형', () => {
  const viewports = [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 14 Pro', width: 393, height: 852 },
    { name: 'Galaxy S20', width: 360, height: 800 },
    { name: 'Desktop', width: 1440, height: 900 },
  ];
  for (const v of viewports) {
    test(`E-20 ${v.name} (${v.width}x${v.height}) 가로 스크롤 없이 렌더`, async ({ page }) => {
      await page.setViewportSize({ width: v.width, height: v.height });
      await open(page);
      await skipToMain(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(page.locator('#view-couple-names')).toBeVisible();
      await expect(page.locator('#dday-count-element')).toBeVisible();
    });
  }
});

test.describe('[FIX] 콘솔 오류', () => {
  test('E-21 전체 흐름에서 콘솔 오류 0건 (SVG path 수정 확인)', async ({ page }) => {
    const errors = await open(page, { admin: true });
    await skipToMain(page);
    for (let i = 1; i <= 4; i++) {
      await page.locator(`#btn-menu-${i}`).click({ force: true });
      await page.waitForTimeout(700);
      await page.evaluate((n) => {
        const ids = ['modal-greeting', 'modal-gallery', 'modal-map', 'modal-accounts'];
        closePage(ids[n - 1]);
      }, i);
      await page.waitForTimeout(400);
    }
    await page.evaluate(() => openSettings());
    await page.waitForTimeout(600);

    const real = errors.filter((e) => !/Failed to load resource/.test(e.text));
    if (real.length) console.log('수집된 오류:', JSON.stringify(real, null, 2));
    expect(real, '콘솔 오류 발생').toHaveLength(0);
  });
});

test.describe('애니메이션 · 접근성', () => {
  test('E-22 [FIX] prefers-reduced-motion을 존중해 애니메이션 정지', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await skipToMain(page);

    const anims = await page.evaluate(() =>
      [...document.querySelectorAll('.floating-btn, .glowing-text-btn')].map(
        (el) => getComputedStyle(el).animationName
      )
    );
    expect(anims.length).toBeGreaterThan(0);
    expect(anims.every((a) => a === 'none'), '감소 모션에서도 애니메이션이 남아 있음').toBe(true);

    const y1 = (await page.locator('#btn-menu-1').boundingBox()).y;
    await page.waitForTimeout(1200);
    const y2 = (await page.locator('#btn-menu-1').boundingBox()).y;
    expect(Math.abs(y1 - y2)).toBeLessThan(0.5);
  });

  test('E-23 기본 모드에서는 플로팅 애니메이션이 살아 있음', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    const ys = [];
    for (let i = 0; i < 12; i++) {
      ys.push((await page.locator('#btn-menu-1').boundingBox()).y);
      await page.waitForTimeout(350);
    }
    const swing = Math.max(...ys) - Math.min(...ys);
    console.log('btn-menu-1 y좌표 진폭(px):', swing.toFixed(2));
    expect(swing).toBeGreaterThan(2);
  });

  test('E-24 [성능] 인트로 종료 후 캔버스 rAF 루프가 정지', async ({ page }) => {
    await page.addInitScript(() => {
      window.__raf = 0;
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => { window.__raf++; return orig(cb); };
    });
    await open(page);
    await page.waitForTimeout(1500);
    const during = await page.evaluate(() => window.__raf);
    await skipToMain(page);
    await page.waitForTimeout(500);
    const a = await page.evaluate(() => window.__raf);
    await page.waitForTimeout(1500);
    const b = await page.evaluate(() => window.__raf);

    console.log(`인트로 중 rAF: ${during}, 종료 직후: ${a}, 1.5초 뒤: ${b}`);
    expect(during).toBeGreaterThan(10);
    expect(b - a, '인트로 종료 후 rAF 루프가 멈추지 않음').toBeLessThanOrEqual(2);
  });

  test('E-25 [FIX] 무한 애니메이션 요소에 will-change 상시 지정이 없음', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    const wc = await page.evaluate(() =>
      [...document.querySelectorAll('.floating-btn, .glowing-text-btn')].map(
        (el) => getComputedStyle(el).willChange
      )
    );
    expect(wc.every((v) => v === 'auto'), 'will-change가 상시 지정되어 컴포지터를 점유').toBe(true);
  });
});

test.describe('복사 기능', () => {
  test('E-26 [FIX] 주소 복사가 config 값을 사용', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    let captured = null;
    await page.exposeFunction('__capture', (t) => { captured = t; });
    await page.evaluate(() => {
      const orig = window.copyText;
      window.copyText = (text, msg) => { window.__capture(text); orig(text, msg); };
    });
    await page.locator('#btn-menu-3').click({ force: true });
    await page.waitForTimeout(800);
    await page.getByText('도로명 주소 복사하기').click({ force: true });
    await page.waitForTimeout(600);
    expect(captured).toBe('서울특별시 중구 청파로 447-1');
    await expect(page.locator('#custom-toast')).toContainText('복사');
  });
});

test.describe('[NEW] 관리자 비밀번호', () => {
  test('E-27 하객에게는 잠금 화면조차 노출되지 않음', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    await expect(page.locator('#admin-gear')).toBeHidden();
    await expect(page.locator('#admin-lock')).toBeHidden();
    // 비밀번호를 몰라도 콘솔로 우회 가능한지는 별개 — 하객 UI에는 진입점이 없다
    const unlocked = await page.evaluate(() => sessionStorage.getItem('wedding_admin_unlocked'));
    expect(unlocked).toBeNull();
  });

  test('E-28 ?admin=1 에서 톱니를 누르면 설정이 아니라 잠금 화면이 뜸', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await page.locator('#admin-gear').click({ force: true });
    await page.waitForTimeout(500);
    await expect(page.locator('#admin-lock')).toBeVisible();
    await expect(page.locator('#settings-panel')).not.toHaveClass(/open/);
  });

  test('E-29 잘못된 비밀번호는 거부되고 패널이 열리지 않음', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await page.locator('#admin-gear').click({ force: true });
    await page.waitForTimeout(400);
    await page.locator('#admin-pass-input').fill('1234');
    await page.getByRole('button', { name: '확인' }).click({ force: true });
    await page.waitForTimeout(500);
    await expect(page.locator('#admin-pass-error')).toHaveText('비밀번호가 올바르지 않습니다.');
    await expect(page.locator('#settings-panel')).not.toHaveClass(/open/);
    await expect(page.locator('#admin-pass-input')).toHaveValue('');
    const unlocked = await page.evaluate(() => sessionStorage.getItem('wedding_admin_unlocked'));
    expect(unlocked).toBeNull();
  });

  test('E-30 빈 입력은 안내 문구를 표시', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await page.locator('#admin-gear').click({ force: true });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '확인' }).click({ force: true });
    await page.waitForTimeout(300);
    await expect(page.locator('#admin-pass-error')).toHaveText('비밀번호를 입력해주세요.');
  });

  test('E-31 올바른 비밀번호(5589)를 넣으면 설정 패널이 열림', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await page.locator('#admin-gear').click({ force: true });
    await page.waitForTimeout(400);
    await page.locator('#admin-pass-input').fill('5589');
    await page.getByRole('button', { name: '확인' }).click({ force: true });
    await page.waitForTimeout(700);
    await expect(page.locator('#admin-lock')).toBeHidden();
    await expect(page.locator('#settings-panel')).toHaveClass(/open/);
    await expect(page.locator('#cfg-groom-name')).toBeEditable();
    const unlocked = await page.evaluate(() => sessionStorage.getItem('wedding_admin_unlocked'));
    expect(unlocked).toBe('1');
  });

  test('E-32 Enter 키로도 제출 가능', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await page.locator('#admin-gear').click({ force: true });
    await page.waitForTimeout(400);
    await page.locator('#admin-pass-input').fill('5589');
    await page.locator('#admin-pass-input').press('Enter');
    await page.waitForTimeout(700);
    await expect(page.locator('#settings-panel')).toHaveClass(/open/);
  });

  test('E-33 한 번 인증하면 같은 탭에서는 다시 묻지 않음', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await page.locator('#admin-gear').click({ force: true });
    await page.waitForTimeout(400);
    await page.locator('#admin-pass-input').fill('5589');
    await page.locator('#admin-pass-input').press('Enter');
    await page.waitForTimeout(700);
    await page.evaluate(() => closeSettings());
    await page.waitForTimeout(700);

    // 새로고침 후에도 세션이 유지된다
    await page.reload();
    await page.waitForFunction(() => typeof requestAdminAccess === 'function');
    await skipToMain(page);
    await page.locator('#admin-gear').click({ force: true });
    await page.waitForTimeout(600);
    await expect(page.locator('#admin-lock')).toBeHidden();
    await expect(page.locator('#settings-panel')).toHaveClass(/open/);
  });

  test('E-34 잠그기 버튼을 누르면 다음 진입 시 다시 비밀번호를 물음', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await page.locator('#admin-gear').click({ force: true });
    await page.waitForTimeout(400);
    await page.locator('#admin-pass-input').fill('5589');
    await page.locator('#admin-pass-input').press('Enter');
    await page.waitForTimeout(700);

    await page.getByRole('button', { name: '관리자 모드 잠그기' }).click({ force: true });
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => sessionStorage.getItem('wedding_admin_unlocked'))).toBeNull();

    await page.locator('#admin-gear').click({ force: true });
    await page.waitForTimeout(500);
    await expect(page.locator('#admin-lock')).toBeVisible();
  });

  test('E-35 [보안] 비밀번호 원문이 소스에 남아 있지 않음', async ({ page }) => {
    await open(page);
    const html = await page.content();
    // 해시만 존재해야 하고, "5589" 리터럴은 없어야 한다
    expect(html).toContain('ADMIN_PASS_HASH');
    expect(html).not.toContain("'5589'");
    expect(html).not.toContain('"5589"');
  });
});

test.describe('[NEW] 커버 텍스트 가독성', () => {
  test('E-36 [FIX] 스크림이 vignette-mask 바깥의 별도 레이어로 분리됨', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    const r = await page.evaluate(() => {
      const bg = document.getElementById('main-bg-image');
      const scrim = document.getElementById('cover-scrim');
      return {
        scrimExists: !!scrim,
        scrimIsSibling: scrim && scrim.parentElement === bg.parentElement,
        bgHasNoChildDiv: bg.querySelectorAll('div').length === 0,
        bgMasked: getComputedStyle(bg).maskImage !== 'none',
        scrimMasked: getComputedStyle(scrim).maskImage !== 'none',
      };
    });
    expect(r.scrimExists).toBe(true);
    expect(r.scrimIsSibling, '스크림이 배경의 형제 요소여야 함').toBe(true);
    expect(r.bgHasNoChildDiv, '마스크 안에 그라디언트가 남아 있음').toBe(true);
    expect(r.bgMasked, '배경에는 vignette 마스크가 유지되어야 함').toBe(true);
    expect(r.scrimMasked, '스크림에는 마스크가 걸리면 안 됨').toBe(false);
  });

  test('E-37 기본값이 G(리퀴드 글래스)이고 클래스가 적용됨', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    const cfg = await page.evaluate(() => activeConfig.coverTextStyle);
    expect(cfg).toBe('g');
    await expect(page.locator('#main-layer')).toHaveClass(/covfx-g/);
  });

  test('E-38 7가지 처리를 전환하면 클래스와 스크림 배경이 실제로 바뀜', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    const seen = new Set();
    for (const fx of ['base', 'a', 'b', 'c', 'd', 'e', 'f']) {
      const bg = await page.evaluate((v) => {
        document.getElementById('cfg-cover-fx').value = v;
        updateInviteRealtime();
        const layer = document.getElementById('main-layer');
        return {
          cls: layer.className.match(/covfx-\w+/)[0],
          scrim: getComputedStyle(document.getElementById('cover-scrim')).backgroundImage,
        };
      }, fx);
      expect(bg.cls).toBe('covfx-' + fx);
      seen.add(bg.scrim);
    }
    // base/a/b/e/f 는 서로 다른 그라디언트, c/d 는 none — 최소 5종 이상 구분되어야 한다
    expect(seen.size, '처리별 스크림이 실제로 달라지지 않음').toBeGreaterThanOrEqual(5);
  });

  test('E-39 잘못된 값이 들어와도 기본(E)으로 폴백', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await page.evaluate(() => {
      activeConfig.coverTextStyle = '존재하지않음';
      applyCoverTextStyle();
    });
    await expect(page.locator('#main-layer')).toHaveClass(/covfx-e/);
  });

  test('E-40 D(플레이트) 선택 시에만 텍스트 배경 플레이트가 생김', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    const read = () => page.evaluate(() =>
      getComputedStyle(document.querySelector('footer .cover-plate')).backgroundColor
    );
    await page.evaluate(() => { document.getElementById('cfg-cover-fx').value = 'e'; updateInviteRealtime(); });
    expect(await read()).toBe('rgba(0, 0, 0, 0)');
    await page.evaluate(() => { document.getElementById('cfg-cover-fx').value = 'd'; updateInviteRealtime(); });
    expect(await read()).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('E-41 exportConfig에 coverTextStyle이 포함됨', async ({ page }) => {
    await open(page, { admin: true });
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'log') logs.push(m.text()); });
    await page.evaluate(() => exportConfig());
    await page.waitForTimeout(300);
    const text = logs.find((l) => l.startsWith('const DEFAULT_CONFIG'));
    expect(text).toContain('"coverTextStyle"');
  });
});

test.describe('[NEW] G · 리퀴드 글래스', () => {
  const setFx = (page, v) => page.evaluate((fx) => {
    document.getElementById('cfg-cover-fx').value = fx;
    updateInviteRealtime();
  }, v);

  test('E-42 셀렉터와 COVER_FX 목록에 g가 포함됨', async ({ page }) => {
    await open(page, { admin: true });
    const opts = await page.evaluate(() =>
      [...document.querySelectorAll('#cfg-cover-fx option')].map((o) => o.value)
    );
    expect(opts).toContain('g');
    expect(await page.evaluate(() => COVER_FX)).toContain('g');
  });

  test('E-43 커버 텍스트에 유리 재질(backdrop-filter)이 적용됨', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await setFx(page, 'g');
    const s = await page.evaluate(() => {
      const el = document.querySelector('footer .cover-plate');
      const cs = getComputedStyle(el);
      return {
        backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
        bg: cs.backgroundColor,
        radius: cs.borderTopLeftRadius,
        hasSpecular: getComputedStyle(el, '::before').backgroundImage,
      };
    });
    expect(s.backdrop).toContain('blur');
    expect(s.backdrop).toContain('saturate');
    expect(s.bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(parseFloat(s.radius)).toBeGreaterThan(15);
    expect(s.hasSpecular, '스펙큘러 하이라이트 레이어 없음').toContain('gradient');
  });

  test('E-44 [회귀] 유리 적용이 메뉴 버튼의 absolute 배치를 깨뜨리지 않음', async ({ page }) => {
    // 플로팅 애니메이션을 끄고 좌표를 고정시킨 뒤 비교한다
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, { admin: true });
    await skipToMain(page);

    await setFx(page, 'e');
    const before = [];
    for (let i = 1; i <= 4; i++) before.push(await page.locator(`#btn-menu-${i}`).boundingBox());

    await setFx(page, 'g');
    await page.waitForTimeout(300);
    const after = [];
    for (let i = 1; i <= 4; i++) after.push(await page.locator(`#btn-menu-${i}`).boundingBox());

    const pos = await page.evaluate(() =>
      [...document.querySelectorAll('.floating-btn')].map((e) => getComputedStyle(e).position)
    );
    expect(pos.every((p) => p === 'absolute'), 'position이 absolute에서 벗어남').toBe(true);

    // 애니메이션을 껐으므로 좌표는 정확히 동일해야 한다
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(before[i].x - after[i].x), `btn-menu-${i + 1} x 이동`).toBeLessThan(1);
      expect(Math.abs(before[i].y - after[i].y), `btn-menu-${i + 1} y 이동`).toBeLessThan(1);
    }
  });

  test('E-45 메뉴 버튼과 D-day 뱃지도 같은 유리 재질로 통일됨', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await setFx(page, 'g');
    const r = await page.evaluate(() => {
      const g = (sel) => {
        const cs = getComputedStyle(document.querySelector(sel));
        return cs.backdropFilter || cs.webkitBackdropFilter;
      };
      return { btn: g('#btn-menu-1'), dday: g('#dday-count-element') };
    });
    expect(r.btn).toContain('blur');
    expect(r.dday).toContain('blur');
  });

  test('E-46 다른 처리로 되돌리면 유리 재질이 사라짐', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await setFx(page, 'g');
    await setFx(page, 'b');
    const bd = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('footer .cover-plate'));
      return cs.backdropFilter || cs.webkitBackdropFilter;
    });
    expect(bd === 'none' || bd === '').toBe(true);
  });
});

test.describe('[FIX] 관리자 화면 stale 설정', () => {
  const KEY = 'wedding_final_config';

  test('E-47 [회귀] 최초 접속만으로는 로컬에 설정이 저장되지 않음', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    // 예전에는 window.onload 의 updateInviteRealtime() 가 즉시 저장해버려
    // 그 스냅샷이 이후 배포를 계속 가렸다
    const saved = await page.evaluate((k) => localStorage.getItem(k), KEY);
    expect(saved, '편집하지 않았는데 저장됨').toBeNull();
  });

  test('E-48 실제로 편집했을 때만 저장됨', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();

    await page.evaluate(() => {
      document.getElementById('cfg-groom-name').value = '편집됨';
      updateInviteRealtime();
    });
    const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    expect(saved.groomName).toBe('편집됨');
    expect(saved.configVersion, '저장 시 배포 버전이 함께 기록되어야 함').toBeTruthy();
  });

  test('E-49 [핵심] 배포 버전이 바뀌면 오래된 로컬 설정을 폐기하고 배포본을 보여줌', async ({ page }) => {
    const staleStore = {
      [KEY]: JSON.stringify({
        configVersion: '아주-오래된-버전',
        groomName: '옛날신랑',
        bgUrl: 'assets/photo-a-cover.jpg',
        coverTextStyle: 'e',
      }),
    };
    await open(page, { admin: true, storage: staleStore });
    await skipToMain(page);

    const r = await page.evaluate((k) => ({
      applied: activeConfig.groomName,
      bg: activeConfig.bgUrl,
      fx: activeConfig.coverTextStyle,
      deployedBg: DEFAULT_CONFIG.bgUrl,
      deployedFx: DEFAULT_CONFIG.coverTextStyle,
      stored: localStorage.getItem(k),
    }), KEY);

    expect(r.applied).toBe('고용건');
    expect(r.bg).toBe(r.deployedBg);
    expect(r.fx).toBe(r.deployedFx);
    expect(r.stored, '오래된 저장본이 삭제되어야 함').toBeNull();
  });

  test('E-50 같은 버전의 로컬 설정은 그대로 유지됨', async ({ page }) => {
    const version = await page.evaluate(() => null); // placeholder
    // 먼저 현재 배포 버전을 읽어온다
    await open(page, { admin: true });
    const ver = await page.evaluate(() => DEFAULT_CONFIG.configVersion);

    const store = {
      [KEY]: JSON.stringify({ configVersion: ver, groomName: '유지되는신랑' }),
    };
    const page2 = await page.context().newPage();
    await open(page2, { admin: true, storage: store });
    await skipToMain(page2);
    expect(await page2.evaluate(() => activeConfig.groomName)).toBe('유지되는신랑');
    await page2.close();
  });

  test('E-51 로컬 설정이 배포본과 다르면 관리자 패널에 경고 배너가 뜸', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await expect(page.locator('#admin-override-banner')).toBeHidden();

    await page.evaluate(() => {
      document.getElementById('cfg-groom-name').value = '바꾼이름';
      document.getElementById('cfg-cover-fx').value = 'b';
      updateInviteRealtime();
      openSettings();
    });
    await page.waitForTimeout(700);
    await expect(page.locator('#admin-override-banner')).toBeVisible();
    await expect(page.locator('#admin-override-list')).toContainText('신랑 성명');
    await expect(page.locator('#admin-override-list')).toContainText('가독성 처리');
  });

  test('E-52 하객 화면에는 경고 배너가 뜨지 않음', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    await expect(page.locator('#admin-override-banner')).toBeHidden();
  });
});

test.describe('[NEW] 카카오맵 임베드', () => {
  // 실제 SDK 대신 가짜 kakao 객체를 주입해 렌더 경로를 검증한다
  const mockSdk = (page, { geocodeOk = true } = {}) =>
    page.route('**/dapi.kakao.com/v2/maps/sdk.js*', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `
          window.__sdkUrl = ${JSON.stringify(route.request().url())};
          window.__calls = { markers: 0, overlays: 0, relayout: 0, zoomable: null };
          function LatLng(a, b) { this.a = a; this.b = b; }
          window.kakao = {
            maps: {
              load: (cb) => cb(),
              LatLng,
              Map: function (el, opt) {
                window.__calls.mapEl = el.id;
                window.__calls.center = [opt.center.a, opt.center.b];
                this.setZoomable = (v) => { window.__calls.zoomable = v; };
                this.setCenter = () => {};
                this.relayout = () => { window.__calls.relayout++; };
                this.addControl = () => {};
              },
              Marker: function () { window.__calls.markers++; },
              CustomOverlay: function (o) { window.__calls.overlays++; window.__calls.overlayHtml = o.content; },
              ZoomControl: function () {},
              ControlPosition: { RIGHT: 'RIGHT' },
              services: {
                Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT' },
                Geocoder: function () {
                  this.addressSearch = (addr, cb) => {
                    window.__calls.geocoded = addr;
                    ${geocodeOk
                      ? "cb([{ y: '37.5556', x: '126.9683' }], 'OK');"
                      : "cb([], 'ZERO_RESULT');"}
                  };
                },
              },
            },
          };
        `,
      })
    );

  test('E-53 키를 비우면 지도를 부르지 않고 폴백 그래픽을 보여줌', async ({ page }) => {
    await open(page, { admin: true });
    let sdkRequested = false;
    await page.route('**/dapi.kakao.com/**', (r) => { sdkRequested = true; r.abort(); });
    await skipToMain(page);
    // 페이지가 뜨는 순간 기본 키로 SDK 를 한 번 부른다. 그 요청이 아직 날아가는 중이면
    // 아래 검증에 섞여 들어가므로, 가라앉기를 기다린 뒤 카운터를 리셋하고 시작한다.
    await page.waitForTimeout(600);
    sdkRequested = false;
    await page.evaluate(() => {
      document.getElementById('cfg-kakao-key').value = '';
      kakaoSdkPromise = null; kakaoMapInstance = null; kakaoRenderedFor = '';
      updateInviteRealtime();
    });
    await page.waitForTimeout(900);

    await expect(page.locator('#map-placeholder')).toBeVisible();
    await expect(page.locator('#kakao-map')).toBeHidden();
    expect(sdkRequested, '키가 없는데 SDK를 요청함').toBe(false);
  });

  test('E-59 배포본에 실제 카카오맵 키가 설정되어 있음', async ({ page }) => {
    await open(page);
    const key = await page.evaluate(() => DEFAULT_CONFIG.kakaoMapKey);
    expect(key, '키가 비어 있음').toMatch(/^[0-9a-f]{32}$/);
  });

  test('E-60 좌표가 확정되면 카카오맵·길찾기 링크가 좌표 기반으로 승격됨', async ({ page }) => {
    await open(page, { admin: true });
    await mockSdk(page);
    await skipToMain(page);
    await page.evaluate(() => {
      kakaoSdkPromise = null; kakaoMapInstance = null; kakaoRenderedFor = '';
      updateInviteRealtime();
    });
    await page.waitForTimeout(1400);
    const links = await page.evaluate(() => ({
      navi: document.getElementById('link-kakaonavi').href,
      naver: document.getElementById('link-navermap').href,
      kakaoOnly: !!document.getElementById('link-kakaomap'),
    }));
    expect(links.kakaoOnly, '중복되던 카카오맵 단독 버튼은 제거됨').toBe(false);
    expect(links.navi).toContain('map.kakao.com/link/to/');
    expect(links.navi).toContain('37.5556,126.9683');
    expect(decodeURIComponent(links.navi)).toContain('중림동 약현성당');
    expect(links.naver).toContain('map.naver.com/p/search/');
  });

  test('E-54 키를 넣으면 SDK를 불러 주소로 지오코딩하고 지도를 그림', async ({ page }) => {
    await open(page, { admin: true });
    await mockSdk(page);   // 하니스의 catch-all 이후에 등록해야 우선순위를 가진다
    await skipToMain(page);
    await page.evaluate(() => {
      document.getElementById('cfg-kakao-key').value = 'TEST_JS_KEY';
      kakaoSdkPromise = null; kakaoMapInstance = null; kakaoRenderedFor = '';
      updateInviteRealtime();
    });
    await page.waitForTimeout(1200);

    const c = await page.evaluate(() => window.__calls);
    const url = await page.evaluate(() => window.__sdkUrl);
    expect(url).toContain('appkey=TEST_JS_KEY');
    expect(url, 'services 라이브러리 필요').toContain('libraries=services');
    expect(url, 'autoload=false 로 초기화 시점을 통제해야 함').toContain('autoload=false');

    expect(c.geocoded).toBe('서울특별시 중구 청파로 447-1');
    expect(c.mapEl).toBe('kakao-map');
    expect(c.center).toEqual([37.5556, 126.9683]);
    expect(c.markers).toBe(1);
    expect(c.overlays).toBe(1);
    expect(c.overlayHtml).toContain('중림동 약현성당');
    expect(c.zoomable, '휠 줌은 꺼져 있어야 페이지 스크롤이 안 먹힘').toBe(false);

    await expect(page.locator('#kakao-map')).toBeVisible();
    await expect(page.locator('#map-placeholder')).toBeHidden();
  });

  test('E-55 좌표를 직접 넣으면 지오코딩을 건너뜀', async ({ page }) => {
    await open(page, { admin: true });
    await mockSdk(page);   // 하니스의 catch-all 이후에 등록해야 우선순위를 가진다
    await skipToMain(page);
    await page.evaluate(() => {
      document.getElementById('cfg-kakao-key').value = 'TEST_JS_KEY';
      document.getElementById('cfg-venue-lat').value = '37.1234';
      document.getElementById('cfg-venue-lng').value = '127.5678';
      kakaoSdkPromise = null; kakaoMapInstance = null; kakaoRenderedFor = '';
      updateInviteRealtime();
    });
    await page.waitForTimeout(1200);
    const c = await page.evaluate(() => window.__calls);
    expect(c.geocoded, '좌표가 있으면 주소 검색을 하지 않아야 함').toBeUndefined();
    expect(c.center).toEqual([37.1234, 127.5678]);
  });

  test('E-56 주소 검색에 실패하면 폴백으로 되돌아감', async ({ page }) => {
    await open(page, { admin: true });
    await mockSdk(page, { geocodeOk: false });
    await skipToMain(page);
    await page.evaluate(() => {
      document.getElementById('cfg-kakao-key').value = 'TEST_JS_KEY';
      kakaoSdkPromise = null; kakaoMapInstance = null; kakaoRenderedFor = '';
      updateInviteRealtime();
    });
    await page.waitForTimeout(1200);
    await expect(page.locator('#map-placeholder')).toBeVisible();
    await expect(page.locator('#kakao-map')).toBeHidden();
  });

  test('E-57 SDK 로드가 실패해도 페이지가 깨지지 않고 폴백 유지', async ({ page }) => {
    await page.route('**/dapi.kakao.com/**', (r) => r.abort());
    const errors = await open(page, { admin: true });
    await skipToMain(page);
    await page.evaluate(() => {
      document.getElementById('cfg-kakao-key').value = 'BAD_KEY';
      kakaoSdkPromise = null; kakaoMapInstance = null; kakaoRenderedFor = '';
      updateInviteRealtime();
    });
    await page.waitForTimeout(1500);
    await expect(page.locator('#map-placeholder')).toBeVisible();
    const fatal = errors.filter((e) => e.kind === 'pageerror');
    expect(fatal, '지도 실패가 페이지 오류로 번지면 안 됨').toHaveLength(0);
  });

  test('E-58 지도 모달을 열면 relayout이 호출됨 (회색 화면 방지)', async ({ page }) => {
    await open(page, { admin: true });
    await mockSdk(page);   // 하니스의 catch-all 이후에 등록해야 우선순위를 가진다
    await skipToMain(page);
    await page.evaluate(() => {
      document.getElementById('cfg-kakao-key').value = 'TEST_JS_KEY';
      kakaoSdkPromise = null; kakaoMapInstance = null; kakaoRenderedFor = '';
      updateInviteRealtime();
    });
    await page.waitForTimeout(1200);
    const before = await page.evaluate(() => window.__calls.relayout);
    await page.locator('#btn-menu-3').click({ force: true });
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => window.__calls.relayout);
    expect(after).toBeGreaterThan(before);
  });
});


test.describe('[NEW] 오시는 길 카드 레이아웃', () => {
  test('E-61 주차 카드가 지하철 카드보다 먼저 오고, 카드 전체가 링크', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    await page.locator('#btn-menu-3').click({ force: true });
    await page.waitForTimeout(800);

    const r = await page.evaluate(() => {
      const park = document.getElementById('link-parking');
      const transit = document.getElementById('transit-card');
      const pos = park.compareDocumentPosition(transit);
      return {
        parkIsAnchor: park.tagName === 'A',
        parkHasCardClass: park.classList.contains('card-gold'),
        parkBeforeTransit: !!(pos & Node.DOCUMENT_POSITION_FOLLOWING),
        parkRect: park.getBoundingClientRect().height,
      };
    });
    expect(r.parkIsAnchor, '주차 카드 전체가 <a> 여야 함').toBe(true);
    expect(r.parkHasCardClass).toBe(true);
    expect(r.parkBeforeTransit, '주차가 지하철보다 위에 있어야 함').toBe(true);
    expect(r.parkRect, '카드 터치 영역이 충분해야 함').toBeGreaterThan(60);
  });

  test('E-62 주차는 이중 금선, 지하철은 회색 테두리', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    await page.locator('#btn-menu-3').click({ force: true });
    await page.waitForTimeout(800);

    const r = await page.evaluate(() => {
      const park = document.getElementById('link-parking');
      const transit = document.getElementById('transit-card');
      const inner = getComputedStyle(park, '::after');
      return {
        parkBorder: getComputedStyle(park).borderTopColor,
        parkBg: getComputedStyle(park).backgroundColor,
        innerBorder: inner.borderTopColor,
        innerInset: inner.inset || inner.top,
        transitBorder: getComputedStyle(transit).borderTopColor,
      };
    });
    // 골드 계열: R > G > B
    const rgb = (s) => s.match(/\d+/g).map(Number);
    const [pr, pg, pb] = rgb(r.parkBorder);
    expect(pr).toBeGreaterThan(pg);
    expect(pg).toBeGreaterThan(pb);
    // 안쪽 이중선이 실제로 존재
    const [ir, ig, ib] = rgb(r.innerBorder);
    expect(ir).toBeGreaterThan(ib);
    expect(r.innerInset, '이중선이 안쪽으로 들어가 있어야 함').toContain('4px');
    // 지하철은 무채색에 가까움 (채도 낮음)
    const [tr, tg, tb] = rgb(r.transitBorder);
    expect(Math.max(tr, tg, tb) - Math.min(tr, tg, tb), '지하철 테두리는 회색이어야 함').toBeLessThan(20);
  });

  test('E-63 주차 혜택 배지를 비우면 숨겨짐', async ({ page }) => {
    await open(page, { admin: true });
    await skipToMain(page);
    await expect(page.locator('#map-parking-benefit')).toBeVisible();
    await page.evaluate(() => {
      document.getElementById('cfg-parking-benefit').value = '';
      updateInviteRealtime();
    });
    await page.waitForTimeout(300);
    await expect(page.locator('#map-parking-benefit')).toBeHidden();
  });
});


test.describe('[NEW] 전체 디자인 통일', () => {
  const MODALS = ['modal-greeting', 'modal-gallery', 'modal-map', 'modal-accounts'];

  test('E-64 모달 4종 모두 금선 오너먼트 + Cinzel 라벨을 가짐', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    for (const id of MODALS) {
      const r = await page.evaluate((m) => {
        const el = document.getElementById(m);
        return {
          orn: el.querySelectorAll('.orn').length,
          eyebrow: el.querySelectorAll('.eyebrow').length,
          title: el.querySelectorAll('.sect-t').length,
        };
      }, id);
      expect(r.orn, `${id} 오너먼트 없음`).toBeGreaterThanOrEqual(1);
      expect(r.eyebrow, `${id} 라벨 없음`).toBeGreaterThanOrEqual(1);
      expect(r.title, `${id} 섹션 제목 없음`).toBeGreaterThanOrEqual(1);
    }
  });

  test('E-65 카드 위계: 누를 수 있는 것은 골드, 읽는 것은 회색', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    const r = await page.evaluate(() => {
      const gold = [...document.querySelectorAll('.card-gold')];
      const gray = [...document.querySelectorAll('.card-gray')];
      const tappable = (e) => e.tagName === 'A' || e.tagName === 'BUTTON' || !!e.onclick;
      // 계좌 그룹처럼 카드 자체가 아니라 그 안의 행이 눌리는 경우도 있다.
      // 규칙의 취지는 "금색이 보이면 누를 것이 있다" 이므로 자손까지 인정한다.
      const hasTap = (e) => tappable(e) || !!e.querySelector('a, button, [onclick]');
      return {
        goldCount: gold.length,
        grayCount: gray.length,
        allGoldTappable: gold.every(hasTap),
        anyGrayTappable: gray.some(hasTap),
      };
    });
    expect(r.goldCount, '골드 카드가 여러 화면에 존재해야 함').toBeGreaterThanOrEqual(4);
    expect(r.grayCount).toBeGreaterThanOrEqual(2);
    expect(r.allGoldTappable, '골드 카드는 모두 누를 수 있어야 함').toBe(true);
    expect(r.anyGrayTappable, '회색 카드는 누르는 것이 아니어야 함').toBe(false);
  });

  test('E-66 사진첩: 히어로 1장 + 서브그리드 나머지, 인덱스가 어긋나지 않음', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    await page.locator('#btn-menu-2').click({ force: true });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({
      heroSrc: document.querySelector('#gallery-hero img').getAttribute('src'),
      subSrcs: [...document.querySelectorAll('#gallery-grid img')].map((i) => i.getAttribute('src')),
      cfg: activeConfig.gallery,
      caption: document.querySelector('#gallery-hero p')?.textContent,
      count: document.getElementById('gallery-count').textContent,
    }));
    expect(r.heroSrc).toBe(r.cfg[0]);
    expect(r.subSrcs).toEqual(r.cfg.slice(1));
    expect(r.caption).toBe('Milano, Duomo');
    expect(r.count).toBe(`사진 ${r.cfg.length}장`);
    expect(r.cfg.length, '사진이 최소 5장 이상').toBeGreaterThanOrEqual(5);

    // 히어로를 누르면 1번, 서브 첫 칸은 2번
    await page.locator('#gallery-hero > div').click({ force: true });
    await expect(page.locator('#lightbox-index')).toHaveText(`1 / ${r.cfg.length}`);
  });

  test('E-67 계좌가 양가 그룹 카드로 묶이고 신부측이 위에 온다', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    const r = await page.evaluate(() => {
      const groups = [...document.querySelectorAll('#accounts-list > div')];
      const first = groups[0].querySelector('.acct-row');
      const spans = first.querySelectorAll('span');
      const holder = [...first.querySelectorAll('span')].find((s) => s.textContent === '정선애');
      const info = first.querySelector('.flex-1');
      return {
        sides: groups.map((g) => g.dataset.side),
        allGold: groups.every((g) => g.classList.contains('card-gold')),
        rowIsButton: first.tagName === 'BUTTON',
        holderText: holder ? holder.textContent : null,
        holderSize: holder ? parseFloat(getComputedStyle(holder).fontSize) : 0,
        infoSize: parseFloat(getComputedStyle(info).fontSize),
        hasCopyIcon: !!first.querySelector('.acct-copy'),
      };
    });
    expect(r.sides, '신부측이 먼저, 그다음 신랑측').toEqual(['신부측', '신랑측']);
    expect(r.allGold).toBe(true);
    expect(r.rowIsButton, '행 전체가 버튼이어야 함').toBe(true);
    expect(r.holderText).toBe('정선애');
    expect(r.holderSize, '예금주가 은행/번호보다 커야 함').toBeGreaterThan(r.infoSize);
    expect(r.hasCopyIcon).toBe(true);
  });

  test('E-67b 은행·번호가 빈 계좌는 화면에 나오지 않는다', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    const r = await page.evaluate(() => ({
      shown: [...document.querySelectorAll('#accounts-list .acct-row')]
        .map((b) => [...b.querySelectorAll('span')].map((s) => s.textContent).join(' ')),
      cfgCount: activeConfig.accounts.length,
      cfgEmpty: activeConfig.accounts.filter((a) => !a.bank || !a.number).map((a) => a.holder),
    }));
    // 설정에는 남아 있지만(나중에 채울 자리) 화면에는 안 나온다
    expect(r.cfgEmpty).toEqual(['최효임']);
    const joined = r.shown.join(' ');
    expect(joined).not.toContain('최효임');
    expect(r.shown).toHaveLength(4);
    expect(joined).toContain('고대관');
    expect(joined).toContain('박미경');
  });

  test('E-67c 계좌가 한쪽도 없으면 그룹 카드 자체가 사라진다', async ({ page }) => {
    await open(page, { admin: true });
    const count = await page.evaluate(() => {
      activeConfig.accounts = activeConfig.accounts.map((a) =>
        a.side === '신랑측' ? { ...a, bank: '', number: '' } : a
      );
      renderAccounts();
      return {
        groups: document.querySelectorAll('#accounts-list > div').length,
        sides: [...document.querySelectorAll('#accounts-list > div')].map((g) => g.dataset.side),
      };
    });
    expect(count.groups).toBe(1);
    expect(count.sides).toEqual(['신부측']);
  });

  test('E-68 계좌 행 아무 데나 눌러도 숫자만 복사됨', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    const copied = await page.evaluate(() => {
      const out = [];
      const orig = window.copyText;
      window.copyText = (t) => out.push(t);
      document.querySelectorAll('#accounts-list .acct-row').forEach((b) => b.click());
      window.copyText = orig;
      return out;
    });
    expect(copied).toEqual(['620221730651', '50610201279842', '20420204036928', '20860104026056']);
  });

  test('E-69 캘린더 .ics 가 한국 시간으로 고정 생성됨', async ({ page }) => {
    await open(page);
    const ics = await page.evaluate(() => buildIcs());
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('TZID:Asia/Seoul');
    expect(ics).toContain('DTSTART;TZID=Asia/Seoul:20260905T110000');
    expect(ics).toContain('DTEND;TZID=Asia/Seoul:20260905T130000');
    expect(ics).toContain('SUMMARY:고용건 ♥ 정선애 결혼식');
    expect(ics, '쉼표는 이스케이프되어야 함').toContain('LOCATION:중림동 약현성당\\,');
    expect(ics).toContain('END:VCALENDAR');
  });

  test('E-70 [회귀] 하객 시간대가 달라도 예식 시각이 흔들리지 않음', async ({ browser }) => {
    const results = [];
    for (const tz of ['Asia/Seoul', 'America/New_York', 'Europe/London']) {
      const ctx = await browser.newContext({ timezoneId: tz });
      const pg = await ctx.newPage();
      await open(pg);
      results.push(await pg.evaluate(() =>
        buildIcs().split('\r\n').find((l) => l.startsWith('DTSTART;'))));
      await ctx.close();
    }
    expect(new Set(results).size, '시간대마다 다른 시각이 생성됨').toBe(1);
    expect(results[0]).toContain('20260905T110000');
  });

  test('E-71 캘린더 카드에 일시·장소·D-day가 표시됨', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    await page.locator('#btn-menu-1').click({ force: true });
    await page.waitForTimeout(800);
    await expect(page.locator('#cal-summary')).toContainText('2026년 9월 5일 토요일 오전 11시');
    await expect(page.locator('#cal-summary')).toContainText('중림동 약현성당');
    await expect(page.locator('#cal-dday')).toHaveText(/^D-\d+$/);
  });
});

test.describe('[NEW] 카카오톡 공유 버튼', () => {
  const mockKakaoJs = (page) =>
    page.route('**/kakao_js_sdk/**/kakao.min.js', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `
          window.__share = null; window.__inited = null;
          window.Kakao = {
            _i: false,
            isInitialized() { return this._i; },
            init(k) { this._i = true; window.__inited = k; },
            Share: { sendDefault(o) { window.__share = o; } },
          };
        `,
      })
    );

  test('E-72 하객 화면에도 공유 버튼이 보인다', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    await expect(page.locator('#share-btn')).toBeVisible();
    await expect(page.locator('#admin-gear')).toBeHidden();
  });

  test('E-73 공유 시 피드 템플릿에 제목·설명·2:1 썸네일이 채워짐', async ({ page }) => {
    await open(page);
    await mockKakaoJs(page);
    await skipToMain(page);
    await page.locator('#share-btn').click({ force: true });
    await page.waitForTimeout(1200);

    const r = await page.evaluate(() => ({ share: window.__share, key: window.__inited }));
    expect(r.key, '초기화에 JavaScript 키가 쓰여야 함').toMatch(/^[0-9a-f]{32}$/);
    expect(r.share.objectType).toBe('feed');
    expect(r.share.content.title).toBe('고용건 ♥ 정선애 결혼합니다');
    expect(r.share.content.description).toContain('2026년 9월 5일 토요일 오전 11시');
    expect(r.share.content.description).toContain('중림동 약현성당');
    // 카카오 피드는 2:1 — 실제 크기를 명시해야 잘리지 않는다
    expect(r.share.content.imageWidth).toBe(1200);
    expect(r.share.content.imageHeight).toBe(600);
    expect(r.share.content.imageWidth / r.share.content.imageHeight).toBe(2);
    expect(r.share.buttons[0].title).toBe('청첩장 보기');
  });

  test('E-74 썸네일·링크가 절대 URL로 전달됨', async ({ page }) => {
    await open(page);
    await mockKakaoJs(page);
    await skipToMain(page);
    await page.locator('#share-btn').click({ force: true });
    await page.waitForTimeout(1200);
    const c = await page.evaluate(() => window.__share.content);
    expect(c.imageUrl, '상대 경로면 카카오가 이미지를 못 가져감').toMatch(/^https:\/\//);
    expect(c.imageUrl).toContain('share-kakao.jpg');
    expect(c.link.mobileWebUrl).toMatch(/^https:\/\//);
    expect(c.link.webUrl).toBe(c.link.mobileWebUrl);
  });

  test('E-75 [회귀] 관리자 URL로 보고 있어도 ?admin=1 은 공유되지 않음', async ({ page }) => {
    await open(page, { admin: true });
    await mockKakaoJs(page);
    await skipToMain(page);
    await page.locator('#share-btn').click({ force: true });
    await page.waitForTimeout(1200);
    const link = await page.evaluate(() => window.__share.content.link.webUrl);
    expect(link).not.toContain('admin');
  });

  test('E-76 SDK 로드가 실패하면 주소 복사로 대체된다', async ({ page }) => {
    await open(page);
    await page.route('**/kakao_js_sdk/**', (r) => r.abort());
    await skipToMain(page);

    let captured = null;
    await page.exposeFunction('__cap', (t) => { captured = t; });
    await page.evaluate(() => {
      const orig = window.copyText;
      window.copyText = (t, m) => { window.__cap(t); orig(t, m); };
      // navigator.share 가 있으면 그쪽으로 빠지므로 없는 환경으로 맞춘다
      try { delete navigator.share; } catch (e) {}
    });
    await page.locator('#share-btn').click({ force: true });
    await page.waitForTimeout(1500);
    expect(captured, '폴백으로 주소가 복사되어야 함').toMatch(/^https:\/\//);
  });

  test('E-77 공유 썸네일 파일이 저장소에 존재하고 2:1 이다', async ({ page }) => {
    const fs = require('fs');
    expect(fs.existsSync('assets/share-kakao.jpg'), 'share-kakao.jpg 없음').toBe(true);
    expect(fs.existsSync('assets/og-cover.jpg'), 'og-cover.jpg 없음').toBe(true);
    // OG 메타가 실제 파일을 가리키는지
    await open(page);
    const og = await page.evaluate(() =>
      document.querySelector('meta[property="og:image"]').content);
    expect(og).toContain('assets/og-cover.jpg');
  });
});
