import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { discoverLabs } from '@lasvegasfortransit/labs-cli/manifest';
import { isListedLab } from '@lasvegasfortransit/labs-cli/catalog';

const labsHost = 'labs.lasvegasfortransit.org';

test('links each listed project to where it is served', async ({ page }) => {
  await page.goto('/');
  const records = await discoverLabs(fileURLToPath(new URL('../../../../', import.meta.url)));
  for (const record of records.filter(isListedLab)) {
    const card = page
      .locator('.project-card-link')
      .filter({ has: page.getByRole('heading', { level: 2, name: record.title }) });
    // A graduated project's card goes to its canonical URL and names the host when it leaves Labs.
    const href = record.canonicalUrl ?? `/${record.slug}/`;
    const { host } = new URL(href, `https://${labsHost}/`);
    await expect(card).toHaveAttribute('href', href);
    const action = card.locator('.project-action');
    if (host === labsHost) {
      await expect(action).toContainText('Open project');
      await expect(action).not.toHaveAttribute('data-external');
    } else {
      await expect(action).toHaveText(`Visit ${host}`);
      await expect(action).toHaveAttribute('data-external');
    }
  }
});
