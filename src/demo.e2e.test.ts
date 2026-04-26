import { expect, test, type Page } from '@playwright/test';

const listSelector = '.demo-list';
const listItemSelector = '.demo-list__item';
const middleIndex = 40;
const tailIndex = 79;
const visibilityEpsilonPx = 0.5;

const getPositionStatusText = async (page: Page): Promise<string> =>
  (await page.locator('.position-status').textContent()) ?? '';

const readListClientHeight = async (page: Page): Promise<number> =>
  page.locator(listSelector).evaluate((viewport) => viewport.clientHeight);

const setLowerBlockHeight = async (
  page: Page,
  height: number,
): Promise<void> => {
  const slider = page.getByRole('slider', { name: /Lower block height/ });

  await slider.fill(String(height));
  await expect(slider).toHaveValue(String(height));
};

const readTailBottomOffset = async (page: Page): Promise<number> =>
  page.locator(listSelector).evaluate((viewport, params) => {
    const viewportRect = viewport.getBoundingClientRect();
    const tailItem = viewport.querySelector<HTMLElement>(
      `${params.itemSelector}[data-index="${params.tailIndex}"]`,
    );

    if (!tailItem) {
      throw new Error(`Missing tail item at index ${params.tailIndex}`);
    }

    return tailItem.getBoundingClientRect().bottom - viewportRect.bottom;
  }, {
    itemSelector: listItemSelector,
    tailIndex,
  });

const placeTailInsideBottomPadding = async (page: Page): Promise<number> =>
  page.locator(listSelector).evaluate((viewport, params) => {
    const viewportRect = viewport.getBoundingClientRect();
    const tailItem = viewport.querySelector<HTMLElement>(
      `${params.itemSelector}[data-index="${params.tailIndex}"]`,
    );

    if (!tailItem) {
      throw new Error(`Missing tail item at index ${params.tailIndex}`);
    }

    const paddingBottom = Number.parseFloat(
      window.getComputedStyle(tailItem).paddingBottom,
    );

    if (!Number.isFinite(paddingBottom) || paddingBottom <= 2) {
      throw new Error('Tail item needs enough bottom padding for this check');
    }

    const tailRect = tailItem.getBoundingClientRect();
    const targetOffset = paddingBottom / 2;

    viewport.scrollTop += tailRect.bottom - viewportRect.bottom - targetOffset;
    viewport.dispatchEvent(new Event('scroll', { bubbles: true }));

    return targetOffset;
  }, {
    itemSelector: listItemSelector,
    tailIndex,
  });

const readBottomAnchor = async (
  page: Page,
): Promise<{ index: number; bottomOffset: number }> =>
  page.locator(listSelector).evaluate((viewport, epsilonPx) => {
    const viewportRect = viewport.getBoundingClientRect();
    const visibleItems = Array.from(
      viewport.querySelectorAll<HTMLElement>('.demo-list__item'),
    )
      .map((item) => {
        const rect = item.getBoundingClientRect();
        const isVisible =
          rect.top < viewportRect.bottom - epsilonPx &&
          rect.bottom > viewportRect.top + epsilonPx;

        if (!isVisible) {
          return null;
        }

        return {
          index: Number(item.dataset.index),
          bottomOffset: Math.max(0, rect.bottom - viewportRect.bottom),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) => right.index - left.index);

    const bottomAnchor = visibleItems[0];

    if (!bottomAnchor) {
      throw new Error('Expected at least one visible rendered item');
    }

    return {
      index: bottomAnchor.index,
      bottomOffset: bottomAnchor.bottomOffset,
    };
  }, visibilityEpsilonPx);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator(listSelector)).toBeVisible();
});

test('scrolling away from the tail updates status and the demo button returns to the end', async ({
  page,
}) => {
  const list = page.locator(listSelector);

  await expect(page.locator('.position-status')).toContainText('anchored to tail');

  await list.hover();
  await page.mouse.wheel(0, -720);

  await expect
    .poll(() => getPositionStatusText(page))
    .toContain('away from tail');

  await page.getByRole('button', { name: 'Scroll to tail' }).click();

  await expect
    .poll(() => getPositionStatusText(page))
    .toContain('anchored to tail');
  await expect
    .poll(() => readTailBottomOffset(page).then((offset) => Math.abs(offset)))
    .toBeLessThan(2);
});

test('entering tail padding snaps back to the end', async ({ page }) => {
  await expect(page.locator('.position-status')).toContainText('anchored to tail');

  const targetOffset = await placeTailInsideBottomPadding(page);
  expect(targetOffset).toBeGreaterThan(visibilityEpsilonPx);

  await expect
    .poll(() => getPositionStatusText(page))
    .toContain('anchored to tail');
  await expect
    .poll(() => readTailBottomOffset(page).then((offset) => Math.abs(offset)))
    .toBeLessThan(2);
});

test('scroll to middle row makes that item the bottom anchor', async ({
  page,
}) => {
  await page.getByRole('button', { name: /^Scroll to Row \d+$/ }).click();

  await expect
    .poll(() => getPositionStatusText(page))
    .toContain('away from tail');
  await expect
    .poll(async () => (await readBottomAnchor(page)).index)
    .toBe(middleIndex);
  await expect
    .poll(async () => Math.abs((await readBottomAnchor(page)).bottomOffset))
    .toBeLessThan(2);
});

test('shrinking the viewport while anchored to the end keeps the tail flush to the bottom edge', async ({
  page,
}) => {
  await expect(page.locator('.position-status')).toContainText('anchored to tail');
  await expect
    .poll(() => readTailBottomOffset(page).then((offset) => Math.abs(offset)))
    .toBeLessThan(2);

  await page.setViewportSize({
    width: 1280,
    height: 700,
  });

  await expect
    .poll(() => getPositionStatusText(page))
    .toContain('anchored to tail');
  await expect
    .poll(() => readTailBottomOffset(page).then((offset) => Math.abs(offset)))
    .toBeLessThan(2);
});

test('growing the lower flex block keeps the tail flush to the list bottom edge', async ({
  page,
}) => {
  await expect(page.locator('.position-status')).toContainText('anchored to tail');
  await expect
    .poll(() => readTailBottomOffset(page).then((offset) => Math.abs(offset)))
    .toBeLessThan(2);

  const initialListHeight = await readListClientHeight(page);

  await setLowerBlockHeight(page, 240);

  await expect
    .poll(() => readListClientHeight(page))
    .toBeLessThan(initialListHeight);
  await expect
    .poll(() => getPositionStatusText(page))
    .toContain('anchored to tail');
  await expect
    .poll(() => readTailBottomOffset(page).then((offset) => Math.abs(offset)))
    .toBeLessThan(2);
});

test('shrinking the viewport away from the end preserves the bottom anchored item', async ({
  page,
}) => {
  const list = page.locator(listSelector);

  await expect(page.locator('.position-status')).toContainText('anchored to tail');

  await list.hover();
  await page.mouse.wheel(0, -960);

  await expect
    .poll(() => getPositionStatusText(page))
    .toContain('away from tail');

  const beforeResize = await readBottomAnchor(page);

  await page.setViewportSize({
    width: 1280,
    height: 700,
  });

  await expect
    .poll(() => getPositionStatusText(page))
    .toContain('away from tail');

  await expect
    .poll(async () => (await readBottomAnchor(page)).index)
    .toBe(beforeResize.index);
  await expect
    .poll(async () =>
      Math.abs((await readBottomAnchor(page)).bottomOffset - beforeResize.bottomOffset),
    )
    .toBeLessThan(2);
});
