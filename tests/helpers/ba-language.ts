import type { Page } from '@playwright/test';
import { emptyData } from '../../src/model';

// Existing visual/JP source assertions select Japanese explicitly. The product's
// default remains English, and language-switch tests use the ordinary fixture.
export async function preferJapaneseBa(page: Page) {
  const data = emptyData();
  data.preferences.games = { ba: { textLocale: 'ja' } };
  await page.addInitScript((initial) => {
    if (!localStorage.getItem('onlystory.v1'))
      localStorage.setItem('onlystory.v1', JSON.stringify(initial));
  }, data);
}
