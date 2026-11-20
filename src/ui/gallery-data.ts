// Reads gallery/*.json at build time. The files are bundled into the page, so loading is instant.
import { loadGallery } from './gallery';

export const gallery = loadGallery(
  import.meta.glob('/gallery/*.json', { eager: true, import: 'default' }) as Record<string, unknown>,
);
