import { expect, test } from '@playwright/test';

test('keeps lifecycle notices inside cards and above the footer', async ({ page }) => {
  for (const width of [390, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const card = page.locator('.project-card').first();
    await card.evaluate((element) => {
      const notice = document.createElement('aside');
      notice.textContent = 'Retired. This read-only project is preserved for reference.';
      notice.style.padding = '24px';
      notice.setAttribute('data-lifecycle-test', '');
      element.append(notice);
    });
    const cardBox = await card.boundingBox();
    const noticeBox = await card.locator('[data-lifecycle-test]').boundingBox();
    const footerBox = await page.locator('.site-footer').boundingBox();
    expect(cardBox).not.toBeNull();
    expect(noticeBox).not.toBeNull();
    expect(footerBox).not.toBeNull();
    if (!cardBox || !noticeBox || !footerBox) throw new Error('Missing layout boxes.');
    expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
    expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(footerBox.y);
  }
});
