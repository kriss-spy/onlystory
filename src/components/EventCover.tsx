import { artworkStyle, type CoverArt } from '../covers';

export function EventCover({
  cover,
  className,
}: {
  cover: CoverArt;
  className: string;
}) {
  if (!cover.logo)
    return (
      <img
        className={className}
        src={cover.url}
        alt=""
        width={cover.width}
        height={cover.height}
        style={artworkStyle(cover)}
      />
    );
  return (
    <span
      className={`${className} event-artwork`}
      aria-hidden="true"
      style={{ aspectRatio: `${cover.width} / ${cover.height}` }}
    >
      <img
        src={cover.url}
        alt=""
        width={cover.width}
        height={cover.height}
        style={artworkStyle(cover)}
      />
      <img
        className="event-artwork-logo"
        src={cover.logo.url}
        alt=""
        width={cover.logo.width}
        height={cover.logo.height}
      />
    </span>
  );
}
