import wasmUrl from '7z-wasm/7zz.wasm?url';
import { extractWith7z } from './sevenZipCore';

self.onmessage = async (e: MessageEvent<{ file: Blob; name: string }>) => {
  try {
    const entries = await extractWith7z(e.data.file, e.data.name, wasmUrl);
    self.postMessage({ entries });
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
