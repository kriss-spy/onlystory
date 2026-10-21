import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { GameId } from '../model';
import { useI18n } from '../i18n';
import { Panel } from './Primitives';
import agentSetupGuide from '../../docs/asset-setup-for-agents.md?raw';

const setupUrl =
  'https://github.com/kriss-spy/onlystory/blob/main/docs/asset-setup-for-agents.md';

export function GettingStarted({ game }: { game: GameId }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="getting-started">
      <button onClick={() => setOpen(true)}>
        <BookOpen size={15} />
        {t(game === 'ba' ? 'Blue Archive getting started' : 'Story setup help')}
      </button>
      <Panel
        open={open}
        onClose={() => setOpen(false)}
        title={t(
          game === 'ba' ? 'Blue Archive getting started' : 'Story setup help',
        )}
      >
        {game === 'ba' ? (
          <>
            <h2>{t('Get your first story')}</h2>
            <ol>
              <li>
                {t(
                  'Choose Main story and Source order in the catalog. Open the prologue collection and choose its first story. Event collections may contain spoilers for later main stories.',
                )}
              </li>
              <li>
                {t(
                  window.onlystoryDesktop
                    ? 'Choose Download and import. The desktop app fetches the pinned original files directly, checks them and prepares the story on your device.'
                    : 'Open the story download page. Download every listed original file, then choose those files or their folder to import. Your browser cannot fetch all game sources directly. Keep the app open while it imports.',
                )}
              </li>
              <li>
                {t(
                  'Use the download button to select several stories or a whole collection. While downloading, click it to open the queue. Download history is also available with the clock button, a long hover, or Arrow Down on the download button.',
                )}
              </li>
              <li>
                {t(
                  'After Downloaded appears, open the story. Use Settings to choose story text and audio levels. Tap or press Space to advance, choose responses when prompted, and use history or bookmarks to return to a passage. Progress saves automatically.',
                )}
              </li>
            </ol>
            <h2>{t('JP and global players')}</h2>
            <p>
              {t(
                'The catalog follows a pinned Japanese release snapshot. It is not connected to your game account or the live JP/global release schedule. Collections, titles and story order can differ from the global client. Source order follows the imported collection order; release order uses first JP releases.',
              )}
            </p>
            <p>
              {t(
                'Japanese is the original story text and audio. Official global English is offered only where the pinned global script matches the Japanese story and its branches. English coverage is shown on each collection and story. Missing English keeps Japanese text and titles; it does not mean a download failed. Audio stays Japanese when English text is selected.',
              )}
            </p>
            <p>
              {t(
                'Global players should choose stories they have unlocked in their own game to avoid spoilers. English availability here does not prove that a story is currently released on your server. Some native 3D cutscenes are unavailable and have an explicit Continue story step.',
              )}
            </p>
          </>
        ) : (
          <>
            <h2>{t('Download or prepare a local library')}</h2>
            <p>
              {t(
                'The download button selects stories with a supported downloader. Downloader pending and Unsupported identify stories whose original sources still need preparation. Catalog entries and saved progress alone do not include story files.',
              )}
            </p>
          </>
        )}
        <h2>{t('Downloaded and read counts')}</h2>
        <p>
          {t(
            'Downloaded counts stories installed for the current voice and text variant on this device. Read counts stories you have finished. A story can be downloaded without being read, or read from a local library without being downloaded for offline use. Removing a download keeps reading progress.',
          )}
        </p>
        <h2>{t('For a coding agent')}</h2>
        <p>
          {t(
            'For games without a downloader, use the repository setup guide to acquire and prepare a local library from your original game files. It lists the required tools, input paths, import commands and verification steps for each game.',
          )}
        </p>
        <a href={setupUrl} target="_blank" rel="noreferrer">
          {t('Open asset preparation guide')}
        </a>
      </Panel>
    </div>
  );
}
