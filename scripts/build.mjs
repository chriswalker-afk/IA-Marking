import { mkdirSync, copyFileSync, cpSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist';
const vendor = join(out, 'vendor');
mkdirSync(vendor, { recursive: true });
for (const file of ['index.html', 'app.js', 'comments.js', 'styles.css']) {
  copyFileSync(file, join(out, file));
}
const deps = [
  ['node_modules/pdfjs-dist/build/pdf.mjs', 'pdf.mjs'],
  ['node_modules/pdfjs-dist/build/pdf.worker.mjs', 'pdf.worker.mjs'],
  ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'pdf-lib.min.js'],
];
for (const [source, output] of deps) {
  if (!existsSync(source)) throw new Error(`Missing dependency: ${source}. Run npm install first.`);
  copyFileSync(source, join(vendor, output));
}
for (const directory of ['cmaps','standard_fonts','wasm']) {
  const source=join('node_modules/pdfjs-dist',directory);
  if (existsSync(source)) cpSync(source,join(vendor,directory),{recursive:true});
}
writeFileSync(join(out, '.nojekyll'), '');
console.log('Built self-hosted, static IA Marking Desk in dist/');