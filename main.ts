import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
if (output === root.slice(0, -1) || root.startsWith(output + '/')) {
  throw new Error('输出目录不能是项目目录或它的父目录');
}
mkdirSync(output, { recursive: true });
for (const folder of ['app', 'screenshots']) {
  // Repeated packaging also removes stale assets from previous builds.
  rmSync(join(output, folder), { recursive: true, force: true });
  cpSync(join(root, folder), join(output, folder), { recursive: true });
}
writeFileSync(join(output, 'dossier.json'), buildDossier(output, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
}));
console.log('Afterglow 已输出到 ' + output);
