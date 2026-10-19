import { useStore } from '../store';
import type { Preferences } from '../model';

export function CatalogLayout() {
  const { data, preferences } = useStore();
  return (
    <select
      aria-label="Collection layout"
      value={data.preferences.catalogLayout ?? 'list'}
      onChange={(event) =>
        preferences({
          catalogLayout: event.target.value as Preferences['catalogLayout'],
        })
      }
    >
      <option value="list">List</option>
      <option value="table">Table</option>
      <option value="grid">Cards</option>
    </select>
  );
}
