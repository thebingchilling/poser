import type { MissingContentError } from '@poser/importers';
import { Button } from '@poser/ui';
import { folderPickerSupported, useContentFolders } from '../state/contentFolders';

/** A Daz scene or VaM look whose library files aren't reachable: grant the folder, then try again. */
export function MissingContent({ error, onRetry, onSkip }: { error: MissingContentError; onRetry: () => void; onSkip: () => void }) {
  const { folders, add, grantAll } = useContentFolders();
  const needsGrant = folders.some((f) => !f.granted);
  const what = error.library === 'daz' ? 'Daz content library' : error.library === 'poser' ? 'Poser content folder' : 'VaM folder';
  return (
    <>
      <p>{error.message}</p>
      <p className="hint">
        {error.library === 'daz'
          ? 'Choose your Daz content folder: the one that holds the “data” and “Runtime” folders. Poser reads only the files a scene needs.'
          : error.library === 'poser'
            ? 'Choose the folder that holds the “Runtime” folder with this figure’s geometry and textures. Only the files it needs are read.'
            : 'Choose your VaM folder (the one with “AddonPackages”).'}
      </p>
      <ul className="hint">
        {error.paths.slice(0, 5).map((p) => (
          <li key={p}>{p}</li>
        ))}
        {error.paths.length > 5 && <li>…and {error.paths.length - 5} more</li>}
      </ul>
      <div className="button-wrap">
        <Button variant="text" onClick={onSkip}>Skip</Button>
        {needsGrant && (
          <Button variant="tonal" icon="lock_open" onClick={() => void grantAll().then(onRetry)}>
            Allow access to your folders
          </Button>
        )}
        {folderPickerSupported() ? (
          <Button icon="folder_open" onClick={() => void add(error.library).then((f) => f && onRetry())}>
            Choose your {what}
          </Button>
        ) : (
          <p className="hint">This browser can’t open folders; drop the needed folders onto the app along with the file instead.</p>
        )}
      </div>
    </>
  );
}
