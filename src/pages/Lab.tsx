import { Link } from 'react-router-dom';
import { ArrowUpRight, FlaskConical } from 'lucide-react';
import { games } from '../fixtures';
import { PageTitle } from '../components/Shell';

const checks = [
  {
    game: 'gfl2',
    title: 'System messages & video',
    description:
      'A message window changes, then an actual six-second sample movie plays.',
    fixture: '',
  },
  {
    game: 'pjsk',
    title: 'Concurrent motion & voice',
    description:
      'Two illustrated stand-ins stay on stage while a sample voice plays.',
    fixture: '',
  },
  {
    game: 'ba',
    title: 'Choices & scene effects',
    description:
      'Both answers lead to distinct passages. History and bookmarks preserve the branch.',
    fixture: '',
  },
  {
    game: 'gfl1',
    title: 'Incomplete archive',
    description:
      'The missing mission conversation stops normal progression, with available text accessible.',
    fixture: '',
    episode: 3,
  },
  {
    game: 'gfl2',
    title: 'Missing background',
    description:
      'Scene failure stays inside the stage. Dialogue and navigation remain usable.',
    fixture: 'missing-background',
  },
  {
    game: 'pjsk',
    title: 'Missing voice',
    description:
      'A failed voice track cannot keep auto reading waiting forever.',
    fixture: 'missing-voice',
  },
  {
    game: 'ba',
    title: 'Loading scene',
    description:
      'The visual area waits while text, history and the rest of the app remain accessible.',
    fixture: 'loading',
  },
  {
    game: 'gfl2',
    title: 'Disconnected server',
    description:
      'An episode without a device copy has a recovery path to the local library.',
    fixture: 'offline',
    episode: 2,
  },
  {
    game: 'gfl2',
    title: 'Expired server session',
    description:
      'The connection gate offers a return to the device library. No real authentication is claimed.',
    fixture: 'expired',
  },
  {
    game: 'gfl2',
    title: 'Unsupported command',
    description:
      'Unknown control flow is disclosed and never silently skipped.',
    fixture: 'unsupported',
  },
];
export function LabPage() {
  return (
    <main className="page">
      <PageTitle
        eyebrow="MILESTONE ONE"
        title="Cross-game design checks"
        back="/library"
      >
        <p>
          Purpose-built fixtures for checking the shared interface. These
          exercise UI behavior, not original game playback.
        </p>
      </PageTitle>
      <p className="page-note">
        <Link className="text-link" to="/read/gfl2/gfl2-a33001-opening">
          Original GFL2 opening presentation
        </Link>
        <Link className="text-link" to="/games/gfl2?examples=1">
          Fictional catalog fixtures
        </Link>
        <Link className="text-link" to="/manage?examples=1">
          Fixture downloads
        </Link>
      </p>
      <div className="lab-list">
        {checks.map((check) => (
          <Link
            className="lab-item"
            key={check.title}
            to={`/read/${check.game}/${check.game}-${check.episode ?? 1}?${check.fixture ? `fixture=${check.fixture}&` : ''}line=arrival`}
            state={{ from: '/lab' }}
          >
            <FlaskConical size={19} />
            <span>
              <small>{games.find((g) => g.id === check.game)?.shortName}</small>
              <h2>{check.title}</h2>
              <p>{check.description}</p>
            </span>
            <ArrowUpRight size={18} />
          </Link>
        ))}
      </div>
    </main>
  );
}
