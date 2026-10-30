import { mkdirSync, copyFileSync, cpSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist';
const vendor = join(out, 'vendor');
mkdirSync(vendor, { recursive: true });
for (const file of ['index.html', 'app.js', 'comments.js', 'styles.css', 'library.html', 'library.css', 'library.js']) {
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
for (const file of ['vendor/pdf.mjs','vendor/pdf.worker.mjs','vendor/pdf-lib.min.js','library.html','library.js']) { if (!existsSync(join(out,file))) throw new Error('Deployment missing required asset: '+file); }
console.log('Built self-hosted, static IA Marking Desk and independent library in dist/');