// 유닛 테스트: 페이지 컨텍스트에서 개별 함수의 동작을 직접 검증
const { test, expect } = require('@playwright/test');
const { open, skipToMain } = require('./harness');

test.describe('설정(config) 로직', () => {
  test('U-01 mergeConfig: 누락 키만 기본값으로 채우고 기존 값은 보존', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const target = { groomName: '홍길동', intro1Pos: { x: 11 } };
      mergeConfig(target, {
        groomName: '기본신랑',
        brideName: '기본신부',
        intro1Pos: { x: 30, y: 35 },
      });
      return target;
    });
    expect(r.groomName).toBe('홍길동');
    expect(r.brideName).toBe('기본신부');
    expect(r.intro1Pos).toEqual({ x: 11, y: 35 });
  });

  test('U-02 실제 예식 정보가 DEFAULT_CONFIG에 반영되어 있음', async ({ page }) => {
    await open(page);
    const cfg = await page.evaluate(() => activeConfig);
    expect(cfg.groomName).toBe('고용건');
    expect(cfg.brideName).toBe('정선애');
    expect(cfg.weddingDate).toBe('2026/09/05 11:00:00');
    expect(cfg.venueName).toBe('중림동 약현성당');
    expect(cfg.venueAddress).toBe('서울특별시 중구 청파로 447-1');
    expect(cfg.parkingAddress).toBe('서울특별시 중구 칠패로 5');
    // 부모님 계좌는 자리만 잡아두고 은행·번호가 채워지면 화면에 나온다
    expect(cfg.accounts).toHaveLength(5);
    expect(cfg.accounts[0]).toMatchObject({ side: '신부측', rel: '신부', bank: '하나은행', number: '620-22-1730-651', holder: '정선애' });
    expect(cfg.accounts[1]).toMatchObject({ side: '신부측', rel: '어머니', bank: '', number: '', holder: '최효임' });
    expect(cfg.accounts[2]).toMatchObject({ side: '신랑측', rel: '신랑', bank: '국민은행', number: '506102-01-279842', holder: '고용건' });
    expect(cfg.accounts[3]).toMatchObject({ side: '신랑측', rel: '아버지', bank: '', number: '', holder: '고대관' });
    expect(cfg.accounts[4]).toMatchObject({ side: '신랑측', rel: '어머니', bank: '국민은행', number: '208601-04-026056', holder: '박미경' });
  });

  test('U-03 [FIX] 하객 모드에서는 localStorage에 아무것도 쓰지 않음', async ({ page }) => {
    await open(page);
    await page.evaluate(() => updateInviteRealtime());
    const saved = await page.evaluate(() => localStorage.getItem('wedding_final_config'));
    expect(saved).toBeNull();
  });

  test('U-04 [FIX] 관리자 모드에서만 설정이 저장됨', async ({ page }) => {
    await open(page, { admin: true });
    await page.evaluate(() => {
      document.getElementById('cfg-groom-name').value = '테스트신랑';
      updateInviteRealtime();
    });
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('wedding_final_config'))
    );
    expect(saved.groomName).toBe('테스트신랑');
  });

  test('U-05 applyButtonPositions가 버튼 4개에 left/top(%)을 설정', async ({ page }) => {
    await open(page, { admin: true });
    const pos = await page.evaluate(() => {
      activeConfig.menu1 = { x: 12, y: 34 };
      applyButtonPositions();
      const b = document.getElementById('btn-menu-1');
      return { left: b.style.left, top: b.style.top };
    });
    expect(pos).toEqual({ left: '12%', top: '34%' });
    // 5번째 버튼은 제거되었다
    await expect(page.locator('#btn-menu-5')).toHaveCount(0);
  });

  test('U-06 exportConfig가 DEFAULT_CONFIG 형태의 JS 문자열을 생성', async ({ page }) => {
    await open(page, { admin: true });
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'log') logs.push(m.text()); });
    await page.evaluate(() => exportConfig());
    await page.waitForTimeout(300);
    const text = logs.find((l) => l.startsWith('const DEFAULT_CONFIG'));
    expect(text, 'exportConfig 출력 없음').toBeTruthy();
    expect(text).toContain('"groomName": "고용건"');
    expect(text).toContain('"venueName": "중림동 약현성당"');
    expect(text).toContain('"menu4"');
    expect(text).not.toContain('"menu5"');
  });
});

test.describe('[FIX] 날짜 파생 — D-day와 표시 문구가 같은 값을 공유', () => {
  test('U-07 formatDateLabel이 요일·오전/오후를 정확히 계산', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => ({
      wedding: formatDateLabel('2026/09/05 11:00:00'),
      pm: formatDateLabel('2026/10/24 13:00:00'),
      midnightish: formatDateLabel('2026/01/01 00:30:00'),
      noon: formatDateLabel('2026/01/01 12:00:00'),
      invalid: formatDateLabel('말도안되는값'),
    }));
    expect(r.wedding).toBe('2026. 09. 05. SATURDAY AM 11:00');
    expect(r.pm).toBe('2026. 10. 24. SATURDAY PM 1:00');
    expect(r.midnightish).toBe('2026. 01. 01. THURSDAY AM 12:30');
    expect(r.noon).toBe('2026. 01. 01. THURSDAY PM 12:00');
    expect(r.invalid).toBe('');
  });

  test('U-08 하이픈 날짜 포맷(YYYY-MM-DD)도 동일하게 파싱', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => ({
      hyphen: formatDateLabel('2026-09-05 11:00:00'),
      slash: formatDateLabel('2026/09/05 11:00:00'),
    }));
    expect(r.hyphen).toBe(r.slash);
  });
});

test.describe('D-day 카운트다운', () => {
  test('U-09 미래 날짜: 남은 일/시간을 계산해 표시', async ({ page }) => {
    await open(page, { admin: true });
    const txt = await page.evaluate(async () => {
      const t = new Date(Date.now() + (3 * 24 + 5) * 3600 * 1000);
      const pad = (n) => String(n).padStart(2, '0');
      activeConfig.weddingDate =
        `${t.getFullYear()}/${pad(t.getMonth() + 1)}/${pad(t.getDate())} ` +
        `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
      initCountdown();
      await new Promise((r) => setTimeout(r, 300));
      return document.getElementById('dday-count-element').textContent;
    });
    expect(txt).toContain('3일');
    expect(txt).toMatch(/[45]시간/);
  });

  test('U-10 지난 날짜: 감사 문구로 대체', async ({ page }) => {
    await open(page, { admin: true });
    const txt = await page.evaluate(async () => {
      activeConfig.weddingDate = '2020/01/01 12:00:00';
      initCountdown();
      await new Promise((r) => setTimeout(r, 300));
      return document.getElementById('dday-count-element').textContent;
    });
    expect(txt).toContain('감사합니다');
  });

  test('U-11 잘못된 날짜 문자열이면 안내 문구로 폴백', async ({ page }) => {
    await open(page, { admin: true });
    const txt = await page.evaluate(async () => {
      activeConfig.weddingDate = 'not-a-date';
      initCountdown();
      await new Promise((r) => setTimeout(r, 300));
      return document.getElementById('dday-count-element').textContent;
    });
    expect(txt).toContain('확인해 주세요');
  });
});

test.describe('[FIX] 갤러리 단일 정의', () => {
  test('U-12 썸네일 DOM이 config.gallery에서 생성되어 완전히 일치', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const all = [...document.querySelectorAll('#gallery-hero img, #gallery-grid img')];
      return {
        thumbs: all.map((i) => i.getAttribute('src')),
        cfg: activeConfig.gallery,
        lazy: all.every((i) => i.loading === 'lazy'),
      };
    });
    expect(r.thumbs).toEqual(r.cfg);
    expect(r.lazy, '갤러리 이미지에 loading=lazy 미적용').toBe(true);
  });

  test('U-13 갤러리 개수를 바꾸면 썸네일·라이트박스가 함께 따라감', async ({ page }) => {
    await open(page, { admin: true });
    const r = await page.evaluate(() => {
      document.getElementById('cfg-gallery').value = 'a.jpg\nb.jpg\nc.jpg';
      updateInviteRealtime();
      openLightbox(0);
      changeLightboxSlide(-1);
      return {
        count: document.querySelectorAll('#gallery-hero img, #gallery-grid img').length,
        label: document.getElementById('lightbox-index').textContent.trim(),
        src: document.getElementById('lightbox-img').getAttribute('src'),
      };
    });
    expect(r.count).toBe(3);
    expect(r.label).toBe('3 / 3'); // 순환 확인
    expect(r.src).toBe('c.jpg');
  });
});

test.describe('[FIX] 계좌 렌더링', () => {
  test('U-14 계좌가 config에서 생성되고 복사값이 표시값에서 파생', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('#accounts-list .acct-row')]
        .map((c) => c.textContent.replace(/\s+/g, ' ').trim())
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('정선애');
    expect(rows[0]).toContain('하나은행');
    expect(rows[0]).toContain('620-22-1730-651');
    expect(rows[2]).toContain('박미경');
    expect(rows[2]).toContain('208601-04-026056');

    // 복사 버튼이 숫자만 남긴 값을 클립보드에 넣는지
    const copied = await page.evaluate(async () => {
      let captured = null;
      const orig = window.copyText;
      window.copyText = (t) => { captured = t; };
      document.querySelectorAll('#accounts-list .acct-row')[0].click();
      window.copyText = orig;
      return captured;
    });
    expect(copied).toBe('620221730651');
  });

  test('U-14b 관리자 입력에서 은행·번호를 비워도 그 줄이 설정에 보존됨', async ({ page }) => {
    await open(page, { admin: true });
    const r = await page.evaluate(() => {
      document.getElementById('cfg-accounts').value = [
        '신부측|신부|하나은행|620-22-1730-651|정선애',
        '신부측|어머니|||최효임',
      ].join('\n');
      updateInviteRealtime(false);
      return {
        cfg: activeConfig.accounts.map((a) => `${a.side}/${a.rel}/${a.bank}/${a.holder}`),
        shown: document.querySelectorAll('#accounts-list .acct-row').length,
      };
    });
    expect(r.cfg).toEqual(['신부측/신부/하나은행/정선애', '신부측/어머니//최효임']);
    expect(r.shown, '빈 계좌는 화면에 안 나옴').toBe(1);
  });
});

test.describe('[FIX] 혼주 표기', () => {
  test('U-15 혼주가 비어 있으면 이름만 표시', async ({ page }) => {
    await open(page, { admin: true });
    const rows = await page.evaluate(() => {
      document.getElementById('cfg-groom-parents').value = '';
      document.getElementById('cfg-bride-parents').value = '';
      updateInviteRealtime(false);
      return [...document.querySelectorAll('#view-family p')].map((p) =>
        p.textContent.replace(/\s+/g, ' ').trim()
      );
    });
    expect(rows).toEqual(['고용건', '정선애']);
    // "의 아들 / 의 딸" 같은 혼주 수식어가 붙지 않아야 한다
    expect(rows.join('')).not.toContain('의');
  });

  test('U-15b 실제 혼주 성함이 기본값에 반영되어 있음 (신부측은 모친만)', async ({ page }) => {
    await open(page);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('#view-family p')].map((p) =>
        p.textContent.replace(/\s+/g, ' ').trim()
      )
    );
    expect(rows[0]).toBe('고대관 · 박미경 의 아들 고용건');
    expect(rows[1]).toBe('최효임 의 딸 정선애');
  });

  test('U-16 혼주를 입력하면 "OOO·OOO 의 아들 고용건" 형태로 표시', async ({ page }) => {
    await open(page, { admin: true });
    const txt = await page.evaluate(() => {
      document.getElementById('cfg-groom-parents').value = '고아버지 · 고어머니';
      document.getElementById('cfg-bride-parents').value = '정아버지 · 정어머니';
      updateInviteRealtime();
      return document.getElementById('view-family').textContent.replace(/\s+/g, ' ').trim();
    });
    expect(txt).toContain('고아버지 · 고어머니 의 아들 고용건');
    expect(txt).toContain('정아버지 · 정어머니 의 딸 정선애');
  });

  test('U-17 [보안] 혼주·이름에 HTML을 넣어도 이스케이프되어 실행되지 않음', async ({ page }) => {
    await open(page, { admin: true });
    const r = await page.evaluate(() => {
      document.getElementById('cfg-groom-parents').value = '<img src=x onerror="window.__XSS__=true">';
      updateInviteRealtime();
      return {
        xss: window.__XSS__ === true,
        html: document.getElementById('view-family').innerHTML,
      };
    });
    expect(r.xss, 'XSS가 실행되면 안 됨').toBe(false);
    expect(r.html).toContain('&lt;img');
  });
});

test.describe('[FIX] 지도 딥링크', () => {
  test('U-18 카카오맵·네이버지도·주차장 링크가 실제 주소를 담음', async ({ page }) => {
    await open(page);
    await skipToMain(page);
    const r = await page.evaluate(() => ({
      kakao: document.getElementById('link-kakaonavi').href,
      naver: document.getElementById('link-navermap').href,
      parking: document.getElementById('link-parking').href,
    }));
    expect(r.kakao).toContain('map.kakao.com/link/');
    expect(decodeURIComponent(r.kakao)).toContain('중림동 약현성당');
    expect(decodeURIComponent(r.kakao)).toContain('청파로 447-1');
    expect(r.naver).toContain('map.naver.com');
    expect(decodeURIComponent(r.parking)).toContain('칠패로 5');
  });
});
