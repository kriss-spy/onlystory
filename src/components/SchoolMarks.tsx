import { featuredSchools } from '../ba-schools';

export function SchoolMarks({
  event,
  compact = false,
}: {
  event: { game: string; id: string };
  compact?: boolean;
}) {
  const schools = featuredSchools(event);
  if (!schools.length) return null;
  return (
    <span
      className={`school-marks${compact ? ' compact' : ''}`}
      aria-label="Featured schools"
    >
      {schools.map((school) => (
        <span className="school-badge" key={school.id} title={school.name}>
          {school.mark ? (
            <img
              src={school.mark.url}
              alt={`${school.name} school mark`}
              width={school.mark.width}
              height={school.mark.height}
            />
          ) : null}
          <span>{school.name}</span>
        </span>
      ))}
    </span>
  );
}
