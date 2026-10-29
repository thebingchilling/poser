import { pickFiles, type PickedFile } from './collectFiles';
import { useImport } from './importStore';

/** Opens the picker (or takes dropped files) and starts the import wizard. */
export async function startImport(folder: boolean, files?: PickedFile[]): Promise<number> {
  const picked = files ?? (await pickFiles(folder));
  if (!picked.length) return 0;
  return useImport.getState().start(picked);
}
