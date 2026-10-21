import { featuredSchools } from '../ba-schools';
import { useI18n } from '../i18n';

export function SchoolMarks({
  event,
  compact = false,
}: {
  event: { game: string; id: string };
  compact?: boolean;
}) {
  const { t } = useI18n();
  const schools = featuredSchools(event);
  if (!schools.length) return null;
  return (
    <span
      className={`school-marks${compact ? ' compact' : ''}`}
      aria-label={t('Featured schools')}
    >
      {schools.map((school) => (
        <span className="school-badge" key={school.id} title={school.name}>
          {school.mark ? (
            <img
              src={school.mark.url}
              alt={t('{name} school mark', { name: school.name })}
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
