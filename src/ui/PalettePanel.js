import { textButton } from './buttons.js';
import { el } from './dom.js';
import { setTip } from './Tooltip.js';
import { checkbox } from './formFields.js';
import { allowsPaletteType } from '../map/NodeKinds.js';
import { isOverlayType, isTerrainType, isVariantType } from '../map/TileCatalog.js';
import { removeStored, writeStored } from '../storage/Footprint.js';

/** localStorage key of the "Show variants" choice. Absent means off. */
const SHOW_VARIANTS_KEY = 'campaign-builder:show-variants';
import { buildDisclosure } from './Disclosure.js';
import { columnsFromTops, rovingTarget } from './rovingIndex.js';

/** @typedef {import('../map/TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('../map/TilePalette.js').PaletteEntry} PaletteEntry */
/** @typedef {null | 'erase' | 'erase-path' | 'region' | PaletteEntry} Brush */

/**
 * Mount the tile palette: a picker of paint brushes for Build mode. The active
 * brush controls what a click on a tile does. An Inspect brush (null) selects
 * a tile for the inspector. An Erase brush removes a tile. A Region brush
 * drag-selects a block of tiles to link to a child node. Any tile swatch
 * paints that image. A brush pick invokes onBrushChange, and the panel
 * highlights the active brush. Swatches are also drag sources, so a GM can
 * drag a tile onto the grid in addition to click-to-paint. A hover over a
 * swatch shows its label in the supplied tooltip, because a swatch is
 * image-only and has no other visible label. A scale row (1x, 2x, 3x) sizes
 * painted tile art. At 2x or 3x, a paint places one tile whose image draws
 * stretched across a 2x2 or 3x3 block. This is a visual footprint only, for
 * landmarks such as an academy or a keep, and involves no region link. Roads
 * and erasing ignore the scale row.
 *
 * A terrain type with several variants, such as grass, shows one swatch. That
 * swatch paints a random variant on each cell, so a painted field does not
 * repeat one image. The "Show variants" checkbox replaces these swatches with
 * one swatch for each variant, so the GM can paint an exact image. The choice
 * persists per browser.
 *
 * Every tool and swatch exposes its pick through `aria-pressed`, so a screen
 * reader hears which brush is active. Each swatch section is one Tab stop:
 * the arrow keys, Home, and End move focus inside the section grid, and only
 * the focused (or active) swatch of a section sits in the document tab order.
 * Without that, a keyboard user tabs through every one of the swatches to
 * pass the palette.
 * @param {HTMLElement} container
 * @param {TilePalette} palette
 * @param {(brush: Brush) => void} onBrushChange
 * @param {ReturnType<typeof import('./TileTooltip.js').mountTileTooltip>} [tooltip]
 * @returns {{ getBrush: () => Brush, getScale: () => number, setKind: (kind: string) => void }}
 */
export function mountPalettePanel(container, palette, onBrushChange, tooltip) {
  /** @type {Brush} */
  let brush = null;
  let scale = 1;
  let showVariants = localStorage.getItem(SHOW_VARIANTS_KEY) === '1';
  /** The node kind from the last setKind call. Null shows every kind. */
  let kind = /** @type {string | null} */ (null);

  const root = el('div', 'palette');
  container.appendChild(root);

  /** @type {HTMLElement[]} */
  const selectables = [];
  /**
   * Swatches, tagged with their palette entry for kind-filtering. `role` is
   * 'any' for a random-variant swatch, 'variant' for one exact variant, and
   * 'other' for every other tile.
   * @type {{ el: HTMLElement, entry: PaletteEntry, role: 'any' | 'variant' | 'other' }[]}
   */
  const swatchEntries = [];

  /**
   * @param {HTMLElement} node
   * @param {Brush} value
   */
  function bindSelect(node, value) {
    selectables.push(node);
    node.setAttribute('aria-pressed', 'false');
    node.addEventListener('click', () => select(value, node));
  }

  /**
   * @param {Brush} value
   * @param {HTMLElement} node
   */
  function select(value, node) {
    brush = value;
    for (const s of selectables) {
      const active = s === node;
      s.classList.toggle('palette__item--active', active);
      s.setAttribute('aria-pressed', String(active));
    }
    syncTabStops();
    onBrushChange(brush);
  }

  /**
   * Keep one Tab stop per swatch section: the active swatch when the section
   * holds it, otherwise the section's first visible swatch. This runs after
   * a pick and after a kind filter, since both can move or hide the stop.
   */
  function syncTabStops() {
    for (const { swatches } of sections.values()) {
      const visible = swatches.filter((swatch) => !swatch.hidden);
      const stop = visible.find((swatch) => swatch.classList.contains('palette__item--active'));
      setTabStop(visible, stop ?? visible[0] ?? null);
    }
  }

  /**
   * @param {HTMLElement[]} items
   * @param {HTMLElement | null} stop
   */
  function setTabStop(items, stop) {
    for (const item of items) item.tabIndex = item === stop ? 0 : -1;
  }

  /**
   * Move focus inside one section grid with the arrow keys, Home, and End.
   * The row length is read from the rendered layout, so a narrower rail with
   * fewer columns still moves Up and Down by one visual row. The focused
   * swatch becomes the section's Tab stop, so Shift+Tab and Tab come back to
   * it. Enter and Space still pick the swatch through the button's own click.
   * @param {HTMLElement[]} swatches
   * @param {KeyboardEvent} event
   */
  function onGridKeyDown(swatches, event) {
    const visible = swatches.filter((swatch) => !swatch.hidden);
    const index = visible.indexOf(/** @type {HTMLElement} */ (event.target));
    if (index < 0) return;
    const columns = columnsFromTops(visible.map((swatch) => swatch.offsetTop));
    const next = rovingTarget(index, event.key, visible.length, columns);
    if (next === null) return;
    event.preventDefault();
    setTabStop(visible, visible[next]);
    visible[next].focus();
  }

  // Tools row: Inspect (the default) and Erase.
  const tools = el('div', 'palette__tools');

  /**
   * @param {string} label
   * @param {import('./icons.js').IconName} glyph
   * @param {Brush} value
   * @param {import('./buttons.js').ButtonVariant} [variant]
   */
  function toolButton(label, glyph, value, variant) {
    const node = textButton(label, () => select(value, node), {
      icon: glyph,
      variant,
      className: 'palette__item',
    });
    selectables.push(node);
    node.setAttribute('aria-pressed', 'false');
    return node;
  }

  // Inspect is the starting brush. It carries the active styling from mount.
  const inspectBtn = toolButton('Inspect', 'edit', null);
  inspectBtn.classList.add('palette__item--active');
  inspectBtn.setAttribute('aria-pressed', 'true');

  const regionBtn = toolButton('Region', 'map', 'region');
  const erasePathBtn = toolButton('Erase path', 'remove', 'erase-path');
  const eraseBtn = toolButton('Erase tile', 'remove', 'erase', 'danger');

  // Grid order (row-major): Inspect, Region, Erase path, Erase tile.
  tools.append(inspectBtn, regionBtn, erasePathBtn, eraseBtn);
  root.appendChild(tools);

  // Scale row: how large the next painted tile's art draws, from 1x1 to 3x3.
  const scaleRow = el(
    'div',
    'palette__scale u-row u-g2',
    el('span', 'palette__scale-label u-muted', 'Size'),
  );
  /** @type {HTMLButtonElement[]} */
  const scaleButtons = [];
  for (const n of [1, 2, 3]) {
    const btn = textButton(
      `${n}x`,
      () => {
        scale = n;
        for (const b of scaleButtons) {
          const active = b === btn;
          b.classList.toggle('palette__item--active', active);
          b.setAttribute('aria-pressed', String(active));
        }
      },
      { ariaLabel: `Paint tile art at ${n}x${n} size`, className: 'palette__item' },
    );
    btn.setAttribute('aria-pressed', String(n === scale));
    btn.classList.toggle('palette__item--active', n === scale);
    scaleButtons.push(btn);
    scaleRow.appendChild(btn);
  }
  root.appendChild(scaleRow);

  const variantsToggle = checkbox('Show variants', showVariants, {
    className: 'palette__variants',
  });
  variantsToggle.input.addEventListener('change', () => {
    showVariants = variantsToggle.input.checked;
    if (showVariants) writeStored(SHOW_VARIANTS_KEY, '1');
    else removeStored(SHOW_VARIANTS_KEY);
    applyVisibility();
  });
  root.appendChild(variantsToggle.label);

  // Swatches group into collapsible sections, so terrain, overlays (roads,
  // rivers, coasts), buildings, interior pieces, and furnishings do not mix
  // in one grid. Terrain starts open, because it is the most common brush.
  // The rest start collapsed.
  /** @param {PaletteEntry} entry */
  const sectionFor = (entry) =>
    isTerrainType(entry.type)
      ? 'Terrain'
      : entry.type === 'furnishing'
        ? 'Furnishings'
        : isOverlayType(entry.type)
          ? 'Overlays'
          : entry.type === 'interior'
            ? 'Interior'
            : 'Buildings';

  const sectionsEl = el('div', 'palette__sections');
  /** @type {Map<string, { wrap: HTMLElement, grid: HTMLElement, swatches: HTMLElement[] }>} */
  const sections = new Map();
  for (const label of ['Terrain', 'Overlays', 'Buildings', 'Interior', 'Furnishings']) {
    const grid = el('div', 'palette__grid');
    const { head } = buildDisclosure({ label, body: grid, expanded: label === 'Terrain' });
    const wrap = el('div', 'palette__section', head, grid);

    sectionsEl.appendChild(wrap);
    const section = { wrap, grid, swatches: /** @type {HTMLElement[]} */ ([]) };
    grid.addEventListener('keydown', (event) => onGridKeyDown(section.swatches, event));
    sections.set(label, section);
  }

  // Random-variant swatches come first, so they lead the Terrain grid.
  for (const entry of [...palette.listAnyVariants(), ...palette.listAll()]) {
    const label = entry.anyVariant ? `${entry.label} (random variant)` : entry.label;
    const img = el('img');
    img.src = `/${entry.imageRef}`;
    img.alt = '';

    const swatch = el('button', 'palette__swatch palette__item', img);
    swatch.type = 'button';
    swatch.setAttribute('aria-label', label);
    swatch.draggable = true;

    if (tooltip) {
      swatch.addEventListener('pointermove', (event) => {
        tooltip.show({ title: label, notes: '' }, event.clientX, event.clientY);
      });
      swatch.addEventListener('pointerleave', () => tooltip.hide());
    } else {
      // No cursor-following tooltip supplied. Fall back to the anchored one.
      setTip(swatch, label);
    }

    swatch.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/tile-id', entry.id);
      tooltip?.hide();
    });

    bindSelect(swatch, entry);
    const role = entry.anyVariant ? 'any' : isVariantType(entry.type) ? 'variant' : 'other';
    swatchEntries.push({ el: swatch, entry, role });
    const section = /** @type {NonNullable<ReturnType<typeof sections.get>>} */ (
      sections.get(sectionFor(entry))
    );
    section.swatches.push(swatch);
    section.grid.appendChild(swatch);
  }
  root.appendChild(sectionsEl);

  /**
   * Show the swatches that the node kind can use and that match the "Show
   * variants" choice. A random-variant swatch shows only when the choice is
   * off, and an exact variant only when it is on. A section with nothing
   * visible hides in full, for example Interior on outdoor nodes, or Terrain,
   * Roads, and Buildings inside. This leaves no empty disclosure headers.
   *
   * A hidden brush cannot paint. If the active swatch hides, the brush moves
   * to the first visible swatch of the same terrain type, so a toggle of the
   * checkbox keeps the GM on the same terrain. With no such swatch, for
   * example after a move into an interior, the brush falls back to Inspect.
   */
  function applyVisibility() {
    for (const { el: swatch, entry, role } of swatchEntries) {
      const allowed = kind === null || allowsPaletteType(kind, entry.type);
      const matches = role === 'other' || (role === 'variant') === showVariants;
      swatch.hidden = !allowed || !matches;
    }
    for (const { wrap, swatches } of sections.values()) {
      wrap.hidden = swatches.every((swatch) => swatch.hidden);
    }
    syncTabStops();
    const active = swatchEntries.find((s) => s.el.classList.contains('palette__item--active'));
    if (!active?.el.hidden) return;
    const next = swatchEntries.find(
      (s) => !s.el.hidden && s.role !== 'other' && s.entry.type === active.entry.type,
    );
    if (next) select(next.entry, next.el);
    else select(null, inspectBtn);
  }
  applyVisibility();

  /**
   * Filter the swatch grid to the terrain a node kind can use. An interior
   * shows only interior or custom pieces. A region shows everything else.
   * @param {string} nextKind
   */
  function setKind(nextKind) {
    kind = nextKind;
    applyVisibility();
  }

  return { getBrush: () => brush, getScale: () => scale, setKind };
}
