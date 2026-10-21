import { useStore } from '../store';
import { useI18n } from '../i18n';
import type { Preferences } from '../model';

export function CatalogLayout() {
  const { t } = useI18n();
  const { data, preferences } = useStore();
  return (
    <select
      aria-label={t('Collection layout')}
      value={data.preferences.catalogLayout ?? 'list'}
      onChange={(event) =>
        preferences({
          catalogLayout: event.target.value as Preferences['catalogLayout'],
        })
      }
    >
      <option value="list">{t('List')}</option>
      <option value="table">{t('Table')}</option>
      <option value="grid">{t('Cards')}</option>
    </select>
  );
}
