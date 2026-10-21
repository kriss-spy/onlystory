import type { Page } from '@playwright/test';

export async function waitForImports(
  page: Page,
  ids: string[],
  timeout = 480000,
) {
  await page.waitForFunction(
    (episodeIds) => {
      const failed = document.querySelector(
        '.download-error[title], .error-text[role="alert"]',
      );
      if (failed)
        throw Error(
          'Story import failed: ' +
            (failed.getAttribute('title') || failed.textContent),
        );
      const installed =
        JSON.parse(localStorage.getItem('onlystory.v1') ?? '{}').installed ??
        {};
      return episodeIds.every((id) => installed[id] === true);
    },
    ids,
    { timeout, polling: 250 },
  );
}
