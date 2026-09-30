import { icon } from './icons.js';
import { setTip } from './Tooltip.js';
import { bareButton, emptyState } from './buttons.js';
import { el } from './dom.js';
import { textField } from './formFields.js';
import { openContextMenu } from './ContextMenu.js';
import { ancestorIds, buildWorldTree, filterWorldTree } from '../map/WorldTree.js';
import { createRefreshScheduler } from '../combat/RefreshScheduler.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../map/WorldTree.js').WorldTreeNode} WorldTreeNode */

/** A world with at least this many nodes gets the search box above the tree. */
const SEARCH_MIN_NODES = 12;

/**
 * Mount the world tree: a nested list that mirrors the MapNode hierarchy.
 * It shows the whole tree, not only the path to the current node, inside a
 * box that scrolls on its own. Every row with children has an expand or
 * collapse chevron. A branch starts collapsed the first time the tree sees
 * it, unless it is a root or it contains the current node. When the current
 * node changes, the tree opens the branches above it and scrolls its row
 * into view. Collapse state lives in the mount and stays the same through
 * calls to update(). A world with 12 or more nodes also gets a search box,
 * which reduces the tree to the matching places and the paths to them.
 *
 * A click on a node runs onSelect. If onAddChild, onEdit, or onDelete are
 * set, each row gets one actions button that opens a menu with those
 * choices, and a right-click on the row opens the same menu. Build mode uses
 * these. If getWarning is set, a row whose node has something wrong gets a
 * warning badge that gives the message, and a collapsed row counts the
 * warnings in the branch it hides. This lets a GM see an unreachable or
 * sealed node at the moment it breaks, not the next time they view it. Call
 * update() after any structural change to the tree.
 * @param {HTMLElement} container
 * @param {{
 *   getNodes: () => MapNode[],
 *   getCurrentId: () => string,
 *   onSelect: (nodeId: string) => void,
 *   onAddChild?: (parentId: string) => void,
 *   onEdit?: (nodeId: string) => void,
 *   onDelete?: (nodeId: string) => void,
 *   getWarning?: (node: MapNode) => string | null,
 * }} opts
 * @returns {{ update: () => void }}
 */
export function mountWorldTree(container, opts) {
  const search = textField('', { type: 'search', placeholder: 'Find a place' });
  search.classList.add('world-tree__search');
  search.setAttribute('aria-label', 'Find a place in the world');
  search.hidden = true;

  const root = el('nav', 'world-tree');
  root.setAttribute('aria-label', 'World hierarchy');
  container.append(search, root);

  /** Node ids whose children are hidden. @type {Set<string>} */
  const collapsed = new Set();
  /** Node ids whose first collapse state is already set. @type {Set<string>} */
  const known = new Set();
  /** Branches closed during the current search. A new query opens them all. @type {Set<string>} */
  const closedInSearch = new Set();
  /** The open-or-close function of each chevron on screen, by node id. @type {Map<string, (isCollapsed: boolean) => void>} */
  const toggles = new Map();
  /** The select button of each row on screen, by node id. @type {Map<string, HTMLButtonElement>} */
  const rows = new Map();

  /** @type {string} the trimmed search text the tree on screen was built from */
  let query = '';

  const menuItems = (/** @type {MapNode} */ node) =>
    [
      opts.onAddChild && { label: 'Add a child', onSelect: () => opts.onAddChild?.(node.id) },
      opts.onEdit && { label: 'Edit settings', onSelect: () => opts.onEdit?.(node.id) },
      opts.onDelete && { label: 'Delete', onSelect: () => opts.onDelete?.(node.id) },
    ].filter((item) => !!item);
  const hasActions = Boolean(opts.onAddChild || opts.onEdit || opts.onDelete);

  /**
   * Build the chevron for a row with children. A collapse hides the child
   * list in place instead of rerendering the tree, so the scroll position and
   * focus stay where they are.
   * @param {WorldTreeNode} treeNode
   * @param {HTMLUListElement} childList
   * @param {HTMLElement | null} hiddenBadge shown only while the branch is closed
   * @returns {HTMLButtonElement}
   */
  function collapseToggle(treeNode, childList, hiddenBadge) {
    const nodeId = treeNode.node.id;
    const closed = query ? closedInSearch : collapsed;
    const toggle = bareButton([icon('chevron', { size: 14 })], undefined, {
      className: 'world-tree__toggle',
    });

    /** @param {boolean} isCollapsed */
    const apply = (isCollapsed) => {
      if (isCollapsed) closed.add(nodeId);
      else closed.delete(nodeId);
      toggle.classList.toggle('world-tree__toggle--open', !isCollapsed);
      toggle.setAttribute('aria-expanded', String(!isCollapsed));
      toggle.setAttribute(
        'aria-label',
        `${isCollapsed ? 'Expand' : 'Collapse'} ${treeNode.node.name}`,
      );
      childList.hidden = isCollapsed;
      if (hiddenBadge) hiddenBadge.hidden = !isCollapsed;
    };

    toggle.addEventListener('click', () => apply(!closed.has(nodeId)));
    toggles.set(nodeId, apply);
    apply(closed.has(nodeId));
    return toggle;
  }

  /**
   * A warning icon with its message as tooltip and accessible name.
   * @param {string} message
   * @param {string} [count] text after the icon
   */
  function warningBadge(message, count) {
    const badge = el('span', 'world-tree__warning', icon('warning', { size: 14 }), count);
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', message);
    setTip(badge, message);
    return badge;
  }

  /**
   * @param {WorldTreeNode} treeNode
   * @param {Set<string>} openPath ancestors of the current node
   * @returns {{ item: HTMLLIElement, warnings: number }} the row and the warning count of its branch
   */
  function renderNode(treeNode, openPath) {
    const { node } = treeNode;
    const hasChildren = treeNode.children.length > 0;
    // A branch gets its first state here, so a region added later starts
    // closed like the rest. A search never sets it, because a search opens
    // every branch it keeps.
    if (hasChildren && !query && !known.has(node.id)) {
      known.add(node.id);
      if (treeNode.depth > 0 && !openPath.has(node.id)) collapsed.add(node.id);
    }

    const rendered = treeNode.children.map((child) => renderNode(child, openPath));
    const below = rendered.reduce((sum, r) => sum + r.warnings, 0);

    const select = bareButton([node.name], () => opts.onSelect(node.id), {
      className: 'row-select',
    });
    rows.set(node.id, select);

    const warning = opts.getWarning?.(node) ?? null;
    const hiddenBadge =
      below > 0
        ? warningBadge(
            `${below} ${below === 1 ? 'place' : 'places'} inside ${node.name} ${below === 1 ? 'has' : 'have'} a link warning`,
            String(below),
          )
        : null;
    hiddenBadge?.classList.add('world-tree__warning--hidden');

    const childList = hasChildren
      ? el('ul', 'world-tree__children', ...rendered.map((r) => r.item))
      : null;

    const row = el(
      'div',
      'world-tree__row u-row u-g1',
      // Every row gets a fixed-width toggle slot, so labels line up. Only a
      // row with children gets a live chevron in that slot.
      childList
        ? collapseToggle(treeNode, childList, hiddenBadge)
        : el('span', 'world-tree__toggle world-tree__toggle--leaf'),
      select,
      warning && warningBadge(warning),
      hiddenBadge,
      hasActions && actionsButton(node),
    );
    if (hasActions) {
      row.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        openContextMenu(menuItems(node), event);
      });
    }

    return {
      item: el('li', 'world-tree__item', row, childList),
      warnings: below + (warning ? 1 : 0),
    };
  }

  /** @param {MapNode} node @returns {HTMLButtonElement} */
  function actionsButton(node) {
    const label = `Actions for ${node.name}`;
    const button = bareButton(
      [icon('more', { size: 16 })],
      () => {
        const rect = button.getBoundingClientRect();
        openContextMenu(menuItems(node), { clientX: rect.left, clientY: rect.bottom });
      },
      { className: 'world-tree__more' },
    );
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-haspopup', 'menu');
    setTip(button, label);
    return button;
  }

  /** @type {string | null} the signature the tree on screen was built from */
  let shownSignature = null;
  /** @type {string | null} the node whose row is marked as current */
  let currentId = null;
  /** @type {HTMLButtonElement | null} */
  let currentRow = null;
  /** True while the current row still needs to scroll into view. */
  let scrollPending = false;

  /**
   * Scroll the tree box so the current row is inside it. A box with no
   * height is hidden, for example the Build rail in Play mode, so the scroll
   * waits until the resize observer below sees the box appear.
   */
  function scrollToCurrent() {
    if (!scrollPending || !currentRow || root.clientHeight === 0) return;
    scrollPending = false;
    const box = root.getBoundingClientRect();
    const row = currentRow.getBoundingClientRect();
    const margin = row.height;
    if (row.top < box.top) root.scrollTop -= box.top - row.top + margin;
    else if (row.bottom > box.bottom) root.scrollTop += row.bottom - box.bottom + margin;
  }
  new ResizeObserver(scrollToCurrent).observe(root);

  /**
   * Move the current-node mark to the row of `id`. Navigation changes only
   * this mark, so it touches two rows instead of rebuilding the tree. A new
   * current node opens the branches above it and scrolls into view.
   * @param {string} id
   * @param {MapNode[]} nodes
   */
  function markCurrent(id, nodes) {
    const next = rows.get(id) ?? null;
    if (id !== currentId) {
      for (const ancestor of ancestorIds(nodes, id)) {
        collapsed.delete(ancestor);
        toggles.get(ancestor)?.(false);
      }
      scrollPending = true;
    }
    currentId = id;
    if (next !== currentRow) {
      currentRow?.classList.remove('row-select--current');
      currentRow?.removeAttribute('aria-current');
      next?.classList.add('row-select--current');
      next?.setAttribute('aria-current', 'true');
      currentRow = next;
    }
    scrollToCurrent();
  }

  /**
   * This returns everything the markup reads: the search text and each
   * node's id, name, parent, and warning. The current row is left out,
   * because markCurrent moves that mark without a rebuild. It compares by
   * value, not by node identity, since a party step replaces the node it
   * revealed fog on without changing any of these fields, and that step
   * is the most frequent caller of update(). The warning sits in the
   * signature, so a paint stroke that seals or unseals a node redraws its badge.
   * @param {MapNode[]} nodes
   */
  function signatureOf(nodes) {
    return JSON.stringify([
      query,
      nodes.map((n) => [n.id, n.name, n.parentId, opts.getWarning?.(n) ?? null]),
    ]);
  }

  /** @param {MapNode[]} nodes */
  function rebuild(nodes) {
    const focusedId = [...rows].find(([, row]) => row === document.activeElement)?.[0];
    const scrollTop = root.scrollTop;
    rows.clear();
    toggles.clear();
    currentRow = null;

    const openPath = new Set(ancestorIds(nodes, opts.getCurrentId()));
    const tree = filterWorldTree(buildWorldTree(nodes), query);
    // With no search, an empty tree has no nodes at all. That is the tree of a
    // Player tab, which lists no place, so it shows no message either.
    if (tree.length) {
      root.replaceChildren(
        el(
          'ul',
          'world-tree__children world-tree__root',
          ...tree.map((t) => renderNode(t, openPath).item),
        ),
      );
    } else if (query.trim()) {
      root.replaceChildren(emptyState(`No place matches "${query}".`));
    } else {
      root.replaceChildren();
    }
    root.scrollTop = scrollTop;
    if (focusedId) rows.get(focusedId)?.focus();
  }

  function render() {
    const nodes = opts.getNodes();
    search.hidden = nodes.length < SEARCH_MIN_NODES;
    if (search.hidden) search.value = '';
    const nextQuery = search.value.trim();
    if (nextQuery !== query) closedInSearch.clear();
    query = nextQuery;
    // A caller refreshes the tree after anything that can have moved a
    // node, so it redraws far more often than it changes. Stop when the
    // markup comes out the same, since a rebuild costs the scroll
    // position and any focus inside the tree.
    const signature = signatureOf(nodes);
    if (signature !== shownSignature) {
      shownSignature = signature;
      rebuild(nodes);
    }
    markCurrent(opts.getCurrentId(), nodes);
  }

  search.addEventListener('input', render);
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !search.value) return;
    event.preventDefault();
    search.value = '';
    render();
  });

  // One navigation calls update() two or three times, from the resync, the
  // exit sync, and the travel code. Each signature runs getWarning for every
  // node, so the calls of one handler share a single render in a microtask,
  // which still runs before the browser paints.
  const scheduler = createRefreshScheduler(render);

  render();
  return { update: scheduler.request };
}
