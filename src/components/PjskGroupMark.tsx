import { groupArtwork } from '../covers';
import { pjskGroups } from '../pjsk-groups';

export function PjskGroupMark({ group }: { group?: string }) {
  const info = pjskGroups.find((item) => item.id === group);
  if (!info) return null;
  const logo = groupArtwork('pjsk', info.id);
  return (
    <span
      className="group-mark"
      role="img"
      aria-label={info.label}
      style={{ '--group-color': info.color } as React.CSSProperties}
    >
      {logo ? (
        <img src={logo.url} alt="" width={logo.width} height={logo.height} />
      ) : null}
      <span>{info.shortLabel}</span>
    </span>
  );
}
