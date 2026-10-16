import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('volunteers can show, edit, and share a sign without signing in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Las Vegans for Better Transit');
  await page.getByLabel('Display name').fill('Meet here for the bus ride');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByRole('button', { name: 'Show sign', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Sign settings' })).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Meet here for the bus ride');
  await expect(page.getByRole('button', { name: 'Exit display' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Sign settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show sign', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Copy sign link' }).click();
  await expect(page).toHaveURL(/#.*name=Meet/);
  await page.reload();
  await expect(page.getByLabel('Display name')).toHaveValue('Meet here for the bus ride');
  await expect(page.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

for (const viewport of [
  { width: 1180, height: 820 },
  { width: 820, height: 1180 },
  { width: 390, height: 664 },
  { width: 750, height: 340 },
]) {
  test(`sign fits ${viewport.width} × ${viewport.height} with unavailable device APIs`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      Object.defineProperty(Element.prototype, 'requestFullscreen', {
        value: undefined,
        configurable: true,
      });
      Object.defineProperty(navigator, 'wakeLock', { value: undefined, configurable: true });
    });
    await page.goto('/');
    await page
      .getByLabel('Display name')
      .fill('A long meeting label with 48 characters to display');
    await page.getByRole('button', { name: 'Show sign', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Exit display' })).toBeVisible();
    for (const selector of ['[data-sign-title]', '[data-sign-domain]']) {
      const box = await page.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      if (!box) throw new Error('The sign content has no visible bounds.');
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    await page.getByRole('button', { name: 'Exit display' }).click();
    await expect(page.getByRole('status')).toContainText('auto-lock');
  });
}

test('the default sign remains readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 820, height: 1180 },
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sign settings' })).toBeHidden();
  await expect(page.locator('.sign-no-script')).toBeVisible();
  await context.close();
});

test('a delayed wake lock is released if the volunteer exits', async ({ page }) => {
  await page.addInitScript(() => {
    let releaseRequest: ((lock: unknown) => void) | undefined;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: () =>
          new Promise((resolve) => {
            releaseRequest = resolve;
          }),
      },
    });
    Object.defineProperty(window, 'resolveTestWakeLock', {
      value: () =>
        releaseRequest?.({
          release: () => {
            document.documentElement.dataset.wakeReleased = 'true';
            return Promise.resolve();
          },
          addEventListener: () => {},
        }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Show sign', exact: true }).click();
  await page.getByRole('button', { name: 'Exit display' }).click();
  await page.evaluate(() => {
    const resolve = Reflect.get(window, 'resolveTestWakeLock') as () => void;
    resolve();
  });
  await expect(page.locator('html')).toHaveAttribute('data-wake-released', 'true');
});

test('shared names render as text and clearing the field restores the LVBT sign', async ({
  page,
}) => {
  await page.goto('/#name=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('h1 img')).toHaveCount(0);
  await page.getByLabel('Display name').fill('');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Las Vegans for Better Transit');
});

test('setup stays focused and all sign text keeps readable contrast', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('link')).toHaveCount(0);
  const showBox = await page.getByRole('button', { name: 'Show sign', exact: true }).boundingBox();
  if (!showBox) throw new Error('The display action is missing.');
  await page.getByRole('button', { name: 'Show sign', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Show sign', exact: true })).toBeInViewport();
  for (const color of ['Orange', 'Dark']) {
    await page.getByRole('button', { name: color, exact: true }).click();
    const ratios = await page.evaluate(() => {
      function luminance(color: string) {
        const components = color
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number);
        if (components?.length !== 3) throw new Error('Cannot read color.');
        return components
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          })
          .reduce((sum, value, index) => sum + value * ([0.2126, 0.7152, 0.0722][index] ?? 0), 0);
      }
      const board = document.querySelector('.sign-board');
      if (!board) throw new Error('The preview is missing.');
      const background = luminance(getComputedStyle(board).backgroundColor);
      return [...document.querySelectorAll('.sign-art h1 span, .sign-masthead p')].map(
        (element) => {
          const foreground = luminance(getComputedStyle(element).color);
          return (
            (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05)
          );
        },
      );
    });
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.getByRole('button', { name: 'Show sign', exact: true }).click();
  const animations = await page.locator('h1').evaluate((title) => title.getAnimations().length);
  expect(animations).toBe(0);
});

test('display entrance settles instead of looping while people read', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Show sign', exact: true }).click();
  await page.locator('h1').evaluate(async (title) => {
    await Promise.all(title.getAnimations().map((animation) => animation.finished));
  });
  const running = await page
    .locator('h1')
    .evaluate((title) =>
      title.getAnimations().some((animation) => animation.playState === 'running'),
    );
  expect(running).toBe(false);
});

for (const viewport of [
  { width: 750, height: 340 },
  { width: 390, height: 664 },
]) {
  test(`setup scrolls and display stays fixed at ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      Object.defineProperty(Element.prototype, 'requestFullscreen', {
        value: undefined,
        configurable: true,
      });
    });
    await page.goto('/');
    await page.mouse.wheel(0, 1200);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const copy = page.getByRole('button', { name: 'Copy sign link' });
    await copy.scrollIntoViewIfNeeded();
    await expect(copy).toBeInViewport();
    const show = page.getByRole('button', { name: 'Show sign', exact: true });
    await show.scrollIntoViewIfNeeded();
    const setupPosition = await page.evaluate(() => window.scrollY);
    await show.click();
    const sign = page.locator('[data-event-sign]');
    const before = await sign.boundingBox();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 1000);
    await page.keyboard.press('PageDown');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    expect(await sign.boundingBox()).toEqual(before);
    await expect(page.getByRole('button', { name: 'Exit display' })).toBeInViewport();
    await page.getByRole('button', { name: 'Exit display' }).click();
    await expect(show).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThanOrEqual(setupPosition - 10);
    await page.mouse.move(30, 30);
    await page.mouse.wheel(0, -1200);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });
}

test('exit control hides when idle and returns on pointer or keyboard interaction', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Show sign', exact: true }).click();
  const exit = page.getByRole('button', { name: 'Exit display' });
  await expect(exit).toHaveCSS('opacity', '1');
  await page.clock.runFor(3000);
  await expect(exit).toHaveCSS('opacity', '0');
  await page.mouse.move(60, 60);
  await expect(exit).toHaveCSS('opacity', '1');
  await page.clock.runFor(3000);
  await expect(exit).toHaveCSS('opacity', '0');
  await page.keyboard.press('Tab');
  await expect(exit).toBeFocused();
  await expect(exit).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Sign settings' })).toBeVisible();
});

test('headline color is selectable and preserved in shared links', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'White', exact: true }).click();
  await expect(page.locator('[data-event-sign]')).toHaveAttribute('data-text-color', 'white');
  await page.getByRole('button', { name: 'Copy sign link' }).click();
  await expect(page).toHaveURL(/text=white/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'White', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Black', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Black', exact: true })).toBeDisabled();
  await expect(page.locator('[data-event-sign]')).toHaveAttribute('data-text-color', 'white');
  await page.getByRole('button', { name: 'Orange', exact: true }).click();
  await expect(page.locator('[data-event-sign]')).toHaveAttribute('data-text-color', 'black');
});
