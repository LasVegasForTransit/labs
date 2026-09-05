import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { discoverLabs } from '@lvbt/labs-tooling/manifest';
import { isListedLab } from '@lvbt/labs-tooling/catalog';

test('presents the Labs projects clearly without overflowing', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('LVBT Labs');
  await expect(page.getByRole('heading', { level: 1, name: 'LVBT Labs' })).toBeVisible();
  await expect(
    page.locator('.sidebar-copy p:visible, .mobile-hero__description:visible'),
  ).toHaveText(
    'Public experiments that help Southern Nevadans understand transportation and explore what could work better.',
  );
  const programIntroduction = page.getByRole('region', { name: 'Public work in progress' });
  await expect(programIntroduction).toBeVisible();
  await expect(
    programIntroduction.getByText(
      'LVBT Labs is where Las Vegas for Better Transit publishes experimental maps, tools, and visualizations about transportation in Southern Nevada.',
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Projects' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Projects' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: 'Transit Funding' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: 'TransitMapper' })).toBeVisible();
  const records = await discoverLabs(fileURLToPath(new URL('../../../../', import.meta.url)));
  const expectedProjects = 1 + records.filter(isListedLab).length;
  await expect(page.locator('.project-card')).toHaveCount(expectedProjects);
  await expect(page.locator('.project-card-link')).toHaveCount(expectedProjects);
  await expect(page.locator('.project-card-link').first()).toHaveAttribute(
    'href',
    'https://map.lasvegasfortransit.org/',
  );
  await expect(page.getByRole('link', { name: 'Contribute', exact: true })).toHaveAttribute(
    'href',
    'https://github.com/LasVegasForTransit/labs/blob/main/CONTRIBUTING.md',
  );
  await expect(page.locator('.brand')).toHaveAttribute('href', 'https://lasvegasfortransit.org/');
  const footer = page.getByRole('contentinfo');
  await expect(footer).toBeVisible();
  await expect(footer.locator('.footer-stripe')).toBeVisible();
  await expect(footer.locator('.footer-wordmark img')).toHaveAttribute(
    'src',
    '/brand/lvbt-wordmark-dark.svg',
  );
  const organization = footer.getByRole('navigation', { name: 'Organization' });
  await expect(organization.getByRole('link', { name: 'About' })).toHaveAttribute(
    'href',
    'https://lasvegasfortransit.org/about',
  );
  await expect(organization.getByRole('link', { name: 'Contact' })).toHaveAttribute(
    'href',
    'https://lasvegasfortransit.org/contact',
  );
  const getInvolved = footer.getByRole('navigation', { name: 'Get involved' });
  await expect(getInvolved.getByRole('link', { name: 'Join us' })).toHaveAttribute(
    'href',
    'https://lasvegasfortransit.org/join',
  );
  await expect(getInvolved.getByRole('link', { name: 'Donate' })).toHaveAttribute(
    'href',
    'https://givebutter.com/lvbt',
  );
  await expect(
    footer.getByText('14th-busiest bus system in the country.', { exact: false }),
  ).toBeVisible();
  await expect(footer.getByText('Zero miles of rail.', { exact: false })).toBeVisible();
  const utilities = footer.getByRole('navigation', { name: 'Labs utilities' });
  await expect(utilities.getByRole('link', { name: 'Main website' })).toHaveAttribute(
    'href',
    'https://lasvegasfortransit.org/',
  );
  await expect(utilities.getByRole('link', { name: 'Source' })).toHaveAttribute(
    'href',
    'https://github.com/LasVegasForTransit/labs',
  );
  await expect(footer.getByText('Stewardship')).toHaveCount(0);
  await expect(page.getByText('Active', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Visualization', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Published', { exact: true })).toHaveCount(0);
  await expect(page.getByText('View source', { exact: true })).toHaveCount(0);
  await expect(page.locator('.brand-name')).toHaveText('Las Vegans');
  await expect(page.locator('.brand-purpose')).toHaveText('for Better Transit');
  await expect(page.locator('.brand img')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'GitHub', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Propose a lab' })).toHaveCount(0);
  await expect(page.getByText('LVBT', { exact: true })).toHaveCount(0);

  const structure = await page.evaluate(() => ({
    shellDisplay: getComputedStyle(document.querySelector('.labs-shell')!).display,
    sidebarPosition: getComputedStyle(document.querySelector('.lab-sidebar')!).position,
    footerBottom: document.querySelector('.site-footer')!.getBoundingClientRect().bottom,
    footerHeight: document.querySelector('.site-footer')!.getBoundingClientRect().height,
    viewportHeight: window.innerHeight,
  }));
  const wide = (await page.evaluate(() => window.innerWidth)) >= 1200;
  expect(structure.shellDisplay).toBe(wide ? 'grid' : 'block');
  expect(structure.sidebarPosition).toBe(wide ? 'sticky' : 'static');
  if (wide) expect(structure.footerBottom).toBeGreaterThanOrEqual(structure.viewportHeight);
  expect(structure.footerHeight).toBeGreaterThanOrEqual(structure.viewportHeight);

  const pageWidth = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://labs.lasvegasfortransit.org/',
  );
});

test('matches the organization footer interactions and hands off the sticky brand', async ({
  page,
  isMobile,
}) => {
  // Hover and the sticky-brand handoff are pointer interactions; touch profiles have neither.
  test.skip(isMobile, 'pointer interactions are desktop only');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const footer = page.getByRole('contentinfo');
  const about = footer.getByRole('link', { name: 'About' });
  const candid = footer.getByRole('link', { name: 'Candid' });

  const restingLink = await about.evaluate((link) => {
    const style = getComputedStyle(link);
    return { backgroundSize: style.backgroundSize, color: style.color };
  });
  expect(restingLink.backgroundSize).toBe('0px 2px');
  expect(restingLink.color).toBe('rgb(247, 244, 236)');

  await about.hover();
  await expect
    .poll(() =>
      about.evaluate((link) => {
        const style = getComputedStyle(link);
        return { backgroundSize: style.backgroundSize, color: style.color };
      }),
    )
    .toEqual({ backgroundSize: '100% 2px', color: 'rgb(229, 71, 26)' });

  const externalMarker = await candid.evaluate((link) => {
    const style = getComputedStyle(link, '::after');
    return { content: style.content, maskImage: style.maskImage };
  });
  expect(externalMarker.content).not.toBe('none');
  expect(externalMarker.maskImage).not.toBe('none');

  await page.evaluate(() => {
    const footer = document.querySelector('.site-footer')!.getBoundingClientRect();
    window.scrollBy(0, footer.top - window.innerHeight + 100);
  });
  await expect
    .poll(() => page.locator('.brand').evaluate((brand) => brand.getBoundingClientRect().bottom))
    .toBeGreaterThan(0);
  const beforeWordmark = await page.evaluate(() => ({
    brandBottom: document.querySelector('.brand')!.getBoundingClientRect().bottom,
    wordmarkTop: document.querySelector('.footer-wordmark')!.getBoundingClientRect().top,
    viewportHeight: window.innerHeight,
  }));
  expect(beforeWordmark.brandBottom).toBeGreaterThan(0);
  expect(beforeWordmark.wordmarkTop).toBeGreaterThan(beforeWordmark.viewportHeight);

  await page.evaluate(() => {
    const wordmark = document.querySelector('.footer-wordmark')!.getBoundingClientRect();
    window.scrollBy(0, wordmark.top - window.innerHeight + 1);
  });
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector('.brand')!.getBoundingClientRect().bottom),
    )
    .toBeLessThanOrEqual(1);
  const atWordmark = await page.evaluate(() => ({
    brandBottom: document.querySelector('.brand')!.getBoundingClientRect().bottom,
    sidebarBottom: document.querySelector('.lab-sidebar')!.getBoundingClientRect().bottom,
    sidebarTop: document.querySelector('.lab-sidebar')!.getBoundingClientRect().top,
    wordmarkTop: document.querySelector('.footer-wordmark')!.getBoundingClientRect().top,
    viewportHeight: window.innerHeight,
  }));
  expect(atWordmark.wordmarkTop).toBeLessThanOrEqual(atWordmark.viewportHeight);
  expect(atWordmark.brandBottom).toBeLessThanOrEqual(1);
  expect(atWordmark.sidebarTop).toBe(0);
  expect(atWordmark.sidebarBottom).toBe(atWordmark.viewportHeight);

  await footer.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await expect(footer.locator('.footer-wordmark')).toBeInViewport();

  const handoff = await page.evaluate(() => {
    const brand = document.querySelector('.brand')!.getBoundingClientRect();
    const footer = document.querySelector('.site-footer')!.getBoundingClientRect();
    const sidebar = document.querySelector('.lab-sidebar')!.getBoundingClientRect();
    return {
      brandBottom: brand.bottom,
      footerLeft: footer.left,
      footerWidth: footer.width,
      sidebarBackground: getComputedStyle(document.querySelector('.lab-sidebar')!).backgroundColor,
      sidebarBottom: sidebar.bottom,
      sidebarTop: sidebar.top,
      sidebarWidth: sidebar.width,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
  expect(handoff.brandBottom).toBeLessThanOrEqual(0);
  expect(handoff.sidebarBackground).toBe('rgb(15, 17, 21)');
  expect(handoff.sidebarTop).toBe(0);
  expect(handoff.sidebarBottom).toBe(handoff.viewportHeight);
  expect(handoff.footerLeft).toBeCloseTo(handoff.sidebarWidth, 0);
  expect(handoff.footerWidth + handoff.sidebarWidth).toBeCloseTo(handoff.viewportWidth, 0);

  await about.focus();
  const focus = await about.evaluate((link) => {
    const style = getComputedStyle(link);
    return {
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
    };
  });
  expect(focus).toEqual({
    outlineColor: 'rgb(229, 71, 26)',
    outlineStyle: 'solid',
    outlineWidth: '2px',
    outlineOffset: '3px',
  });
});

test('adapts at Material 3 window size classes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.locator('.project-card').evaluate((card) => {
    card.after(card.cloneNode(true));
  });

  const phone = await page.evaluate(() => {
    const visual = document.querySelector('.project-visual')!.getBoundingClientRect();
    const sidebar = document.querySelector('.lab-sidebar')!.getBoundingClientRect();
    const heroTitle = document.querySelector('.mobile-hero h1')!;
    const navHeights = Array.from(
      document.querySelectorAll('.sidebar-nav a'),
      (link) => link.getBoundingClientRect().height,
    );

    return {
      aspectRatio: visual.width / visual.height,
      imageFit: getComputedStyle(document.querySelector('.project-visual img')!).objectFit,
      sidebarHeight: sidebar.height,
      desktopIntroDisplay: getComputedStyle(document.querySelector('.sidebar-copy')!).display,
      mobileHeroDisplay: getComputedStyle(document.querySelector('.mobile-hero')!).display,
      heroTitleSize: Number.parseFloat(getComputedStyle(heroTitle).fontSize),
      projectCountCount: document.querySelectorAll('.project-count').length,
      bodyMinWidth: getComputedStyle(document.body).minWidth,
      navHeights,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });

  expect(phone.aspectRatio).toBeGreaterThan(1.88);
  expect(phone.aspectRatio).toBeLessThan(1.93);
  expect(phone.imageFit).toBe('cover');
  expect(phone.sidebarHeight).toBeGreaterThan(360);
  expect(phone.desktopIntroDisplay).toBe('none');
  expect(phone.mobileHeroDisplay).not.toBe('none');
  expect(phone.heroTitleSize).toBeGreaterThanOrEqual(64);
  expect(phone.projectCountCount).toBe(0);
  expect(phone.bodyMinWidth).toBe('0px');
  expect(Math.min(...phone.navHeights)).toBeGreaterThanOrEqual(44);
  expect(phone.scrollWidth).toBeLessThanOrEqual(phone.clientWidth);

  const readLayout = () =>
    page.evaluate(() => ({
      shellDisplay: getComputedStyle(document.querySelector('.labs-shell')!).display,
      sidebarPosition: getComputedStyle(document.querySelector('.lab-sidebar')!).position,
      sidebarWidth: document.querySelector('.lab-sidebar')!.getBoundingClientRect().width,
      sidebarHeight: document.querySelector('.lab-sidebar')!.getBoundingClientRect().height,
      projectCopyDisplay: getComputedStyle(document.querySelector('.project-copy')!).display,
      projectGridColumnCount: getComputedStyle(document.querySelector('.project-grid')!)
        .gridTemplateColumns.split(' ')
        .filter((column) => Number.parseFloat(column) > 0).length,
      projectCardTops: Array.from(
        document.querySelectorAll('.project-card'),
        (card) => card.getBoundingClientRect().top,
      ),
      visualWidth: document.querySelector('.project-visual')!.getBoundingClientRect().width,
      cardClientWidth: document.querySelector('.project-card-link')!.clientWidth,
      cardScrollWidth: document.querySelector('.project-card-link')!.scrollWidth,
      brandTop: document.querySelector('.brand')!.getBoundingClientRect().top,
      heroTitleRight: document.querySelector('.mobile-hero__title')!.getBoundingClientRect().right,
      heroContextLeft: document.querySelector('.mobile-hero__context')!.getBoundingClientRect()
        .left,
      navigationTop: document.querySelector('.sidebar-nav')!.getBoundingClientRect().top,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

  await page.setViewportSize({ width: 599, height: 900 });
  const compactEnd = await readLayout();
  expect(compactEnd.projectGridColumnCount).toBe(1);
  expect(compactEnd.projectCopyDisplay).toBe('grid');

  await page.setViewportSize({ width: 600, height: 900 });
  const mediumStart = await readLayout();
  expect(mediumStart.shellDisplay).toBe('block');
  expect(mediumStart.sidebarPosition).toBe('static');
  expect(mediumStart.projectGridColumnCount).toBe(1);
  expect(mediumStart.projectCopyDisplay).toBe('grid');
  expect(mediumStart.visualWidth / mediumStart.clientWidth).toBeGreaterThan(0.88);
  expect(mediumStart.projectCardTops[1] ?? Number.NaN).toBeGreaterThan(
    mediumStart.projectCardTops[0] ?? Number.NaN,
  );
  expect(mediumStart.heroTitleRight).toBeLessThanOrEqual(mediumStart.heroContextLeft);
  expect(Math.abs(mediumStart.brandTop - mediumStart.navigationTop)).toBeLessThan(8);
  expect(mediumStart.cardScrollWidth).toBeLessThanOrEqual(mediumStart.cardClientWidth);
  expect(mediumStart.scrollWidth).toBeLessThanOrEqual(mediumStart.clientWidth);

  await page.setViewportSize({ width: 839, height: 900 });
  const mediumEnd = await readLayout();
  expect(mediumEnd.projectGridColumnCount).toBe(1);
  expect(mediumEnd.projectCopyDisplay).toBe('grid');

  await page.setViewportSize({ width: 840, height: 900 });
  const expandedStart = await readLayout();
  expect(expandedStart.projectGridColumnCount).toBe(2);
  expect(expandedStart.projectCopyDisplay).toBe('flex');
  expect(expandedStart.visualWidth).toBeGreaterThanOrEqual(360);
  expect(
    Math.abs(
      (expandedStart.projectCardTops[0] ?? Number.NaN) -
        (expandedStart.projectCardTops[1] ?? Number.NaN),
    ),
  ).toBeLessThan(2);

  await page.setViewportSize({ width: 920, height: 900 });
  const expandedTwoColumn = await readLayout();
  expect(expandedTwoColumn.projectGridColumnCount).toBe(2);
  expect(expandedTwoColumn.visualWidth).toBeGreaterThanOrEqual(360);
  expect(
    Math.abs(
      (expandedTwoColumn.projectCardTops[0] ?? Number.NaN) -
        (expandedTwoColumn.projectCardTops[1] ?? Number.NaN),
    ),
  ).toBeLessThan(2);

  await page.setViewportSize({ width: 1199, height: 900 });
  const expandedEnd = await readLayout();
  expect(expandedEnd.shellDisplay).toBe('block');
  expect(expandedEnd.sidebarPosition).toBe('static');
  expect(expandedEnd.projectGridColumnCount).toBe(2);
  expect(expandedEnd.visualWidth).toBeGreaterThanOrEqual(360);

  await page.setViewportSize({ width: 1200, height: 900 });
  const largeStart = await readLayout();
  expect(largeStart.shellDisplay).toBe('grid');
  expect(largeStart.sidebarPosition).toBe('sticky');
  expect(largeStart.sidebarWidth).toBeGreaterThanOrEqual(320);
  expect(largeStart.projectGridColumnCount).toBe(2);
  expect(largeStart.visualWidth).toBeGreaterThanOrEqual(360);

  await page.setViewportSize({ width: 700, height: 479 });
  const compactHeight = await readLayout();
  expect(compactHeight.sidebarHeight).toBeLessThan(360);
  expect(compactHeight.scrollWidth).toBeLessThanOrEqual(compactHeight.clientWidth);
});

test('adapts card contents to the card width instead of the page width', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/');

  const grid = page.locator('.project-grid');
  const firstCard = page.locator('.project-card').first();
  const firstCardCopy = firstCard.locator('.project-copy');

  await expect(firstCardCopy).toHaveCSS('display', 'grid');

  await grid.evaluate((element) => {
    element.style.width = '25rem';
  });
  await expect(firstCard).toHaveCSS('width', '400px');
  await expect(firstCardCopy).toHaveCSS('display', 'flex');

  await page.setViewportSize({ width: 840, height: 900 });
  await grid.evaluate((element) => {
    element.style.width = '';
    element.style.gridTemplateColumns = '1fr';
  });
  await expect(firstCardCopy).toHaveCSS('display', 'grid');

  await page.setViewportSize({ width: 500, height: 900 });
  await grid.evaluate((element) => {
    element.style.width = '37.5rem';
  });
  await expect(firstCard).toHaveCSS('width', '600px');
  await expect(firstCardCopy).toHaveCSS('display', 'grid');
});

test('provides keyboard access to the project catalog', async ({ page }) => {
  await page.goto('/');

  const skipLink = page.getByRole('link', { name: 'Skip to projects' });
  await expect(skipLink).toHaveAttribute('href', '#projects');
  await skipLink.focus();
  await expect(skipLink).toBeVisible();
  await skipLink.press('Enter');
  await expect(page).toHaveURL(/#projects$/);
  await expect(page.locator('#projects')).toBeFocused();
});

test('uses one responsive interaction surface per project', async ({ page }) => {
  await page.goto('/');

  const projectLink = page.locator('.project-card-link').first();
  const thumbnail = projectLink.locator('img');
  const arrow = projectLink.locator('.arrow');
  await projectLink.hover();

  await expect(thumbnail).toHaveCSS('transform', 'none');
  await expect(thumbnail).toHaveCSS('transition-duration', '0s');
  await expect(projectLink).toHaveCSS('background-color', 'rgb(15, 17, 21)');
  await expect(projectLink).toHaveCSS('color', 'rgb(247, 244, 236)');
  await expect(arrow).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 3, 0)');

  await projectLink.focus();
  await expect(projectLink).toHaveCSS('outline-width', '2px');
  await expect(projectLink).toHaveCSS('outline-offset', '3px');
  await expect(projectLink).toHaveCSS('outline-color', 'rgb(229, 71, 26)');

  const navLink = page.getByRole('link', { name: 'Contribute', exact: true });
  await navLink.hover();
  await expect(navLink).toHaveCSS('background-size', '100% 2px');
  await expect(navLink).toHaveCSS('color', 'rgb(229, 71, 26)');

  await navLink.focus();
  await expect(navLink).toHaveCSS('outline-width', '2px');
  await expect(navLink).toHaveCSS('outline-offset', '3px');
  await expect(navLink).toHaveCSS('outline-color', 'rgb(229, 71, 26)');
});
