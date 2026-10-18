import metadata from './ba-catalog.json';

export const baSchools: {
  id: string;
  name: string;
  mark?: { url: string; width: number; height: number };
}[] = metadata.schools;
export const featuredSchools = (event: { game: string; id: string }) =>
  event.game === 'ba'
    ? (
        (metadata.collections as Record<string, { schools: string[] }>)[
          event.id
        ]?.schools ?? []
      ).flatMap((id) => baSchools.filter((school) => school.id === id))
    : [];
