/**
 * The files of the docs site. GitHub Pages builds the gh-pages branch with
 * Jekyll, so the production build copies the Markdown as it is, and Jekyll
 * turns it into HTML on the server. The Jekyll settings, the page layout,
 * the sidebar order, and the site's CSS and JS live in site/, which mirrors
 * the root of the published branch.
 *
 * Each Markdown file keeps its path from the repository. A relative link
 * such as ../CONTRIBUTING.md then resolves on the site the same way it
 * resolves on GitHub, and jekyll-relative-links rewrites it to the built page.
 */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Markdown outside docs/ that the docs link to. */
export const EXTRA_PAGES = ['CONTRIBUTING.md', 'bench/README.md', 'fonts/README.md'];

/**
 * docs/gallery.html is left out. It imports the source modules unbundled,
 * and the production build ships only the bundle.
 */
const SKIP = new Set(['docs/gallery.html', 'docs/gallery']);

/**
 * Jekyll skips a README.md or CONTRIBUTING.md that has no front matter, and
 * it copies the source of each page beside the built HTML. An empty block
 * makes each Markdown file a page. The files in the repository stay without
 * one, so GitHub shows no front matter table at the top.
 */
export const FRONT_MATTER = '---\n---\n';

/**
 * Every file of the site, as paths relative to the repository root. `to` is
 * the path in the build output.
 * @param {string} root
 * @returns {{ from: string, to: string }[]}
 */
export function siteFiles(root) {
  /** @param {string} dir @returns {string[]} */
  const walk = (dir) =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
      const path = `${dir}/${entry.name}`;
      if (SKIP.has(path) || entry.name.startsWith('.')) return [];
      return entry.isDirectory() ? walk(path) : [path];
    });

  const fonts = readdirSync(join(root, 'fonts')).filter((name) => /\.(woff2|txt)$/.test(name));
  return [
    ...walk('site').map((path) => ({ from: path, to: path.slice('site/'.length) })),
    ...walk('docs').map((path) => ({ from: path, to: path })),
    ...EXTRA_PAGES.map((path) => ({ from: path, to: path })),
    ...fonts.map((name) => ({ from: `fonts/${name}`, to: `fonts/${name}` })),
  ];
}

/**
 * Copy the site into the build output.
 * @param {string} root
 * @param {string} outdir
 */
export async function copySite(root, outdir) {
  const files = siteFiles(root);
  for (const { from, to } of files) {
    await mkdir(dirname(join(outdir, to)), { recursive: true });
    if (to.endsWith('.md') && !to.startsWith('_')) {
      await writeFile(join(outdir, to), FRONT_MATTER + (await readFile(join(root, from), 'utf8')));
    } else {
      await cp(join(root, from), join(outdir, to));
    }
  }
  return files.length;
}
