const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { GasPlugin } = require('esbuild-gas-plugin');

const DIST_DIR = 'dist';
const SRC_DIR = 'src';
const STATIC_ASSETS = ['appsscript.json'];

async function main() {
  await fs.mkdir(DIST_DIR, { recursive: true });

  await build({
    entryPoints: [path.join(SRC_DIR, 'code.ts')],
    bundle: true,
    outfile: path.join(DIST_DIR, 'code.js'),
    target: ['es2019'],
    plugins: [GasPlugin],
  });

  await copyHtmlAssets();
  await copyStaticAssets();
}

async function copyHtmlAssets() {
  const entries = await fs.readdir(SRC_DIR, { withFileTypes: true });
  const htmlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => entry.name);

  await Promise.all(
    htmlFiles.map((fileName) =>
      fs.copyFile(path.join(SRC_DIR, fileName), path.join(DIST_DIR, fileName)),
    ),
  );
}

async function copyStaticAssets() {
  await Promise.all(
    STATIC_ASSETS.map((fileName) =>
      fs.copyFile(path.join(SRC_DIR, fileName), path.join(DIST_DIR, fileName)),
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
