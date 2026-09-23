import { cp, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
await mkdir(dist, { recursive: true });
// Explicit allowlist: never publish .git, test fixtures outside this list, or secrets.
for (const file of ['index.html', 'style.css', 'favicon.svg']) await copyFile(join(root, file), join(dist, file));
await cp(join(root, 'src'), join(dist, 'src'), { recursive: true });
await mkdir(join(dist, 'fixtures'), { recursive: true });
for (const size of [16, 64]) await copyFile(join(root, `fixtures/ejbs-${size}.html`), join(dist, `fixtures/ejbs-${size}.html`));
await writeFile(join(dist, '.nojekyll'), '');
console.log('Static site built in dist/ (relative URLs support /tournament/).');
