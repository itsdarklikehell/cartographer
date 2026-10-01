import { emptyState, textButton } from './buttons.js';
import { buildStatBar } from './CharacterBars.js';
import { el, uniqueId } from './dom.js';
import { captureFocus, restoreFocus } from './focusMemory.js';
import { icon } from './icons.js';
import { mountListPanel } from './listPanel.js';
import { DEFEATED_KEY, distanceText, groupNearby } from '../view/NearbyGroups.js';
import { hpBand } from '../view/ViewRole.js';

/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../view/NearbyGroups.js').NearbyGroup} NearbyGroup */

/**
 * Mount the Nearby encounters list in its compact form. Each line is one
 * group of foes that share a name ("Gray Wolf x4"), with an HP bar and the
 * distance of the nearest one. Every defeated foe folds into one
 * "Defeated (2)" line at the end. For the GM, a line is a disclosure
 * button, and one line opens at a time. The open line shows the full row
 * of each member below it, built by a list panel from `list`. A player
 * sees each line as plain text, with the coarse HP band instead of the bar.
 *
 * `update()` repaints only when the groups, their members, the GM flag,
 * the open line, or `list.dependsOn` change. Otherwise it moves the HP
 * bars and asks the open list to update, which keeps the amount a GM typed
 * into a member row.
 * @param {HTMLElement} container
 * @param {{
 *   getRows: () => Creature[],
 *   getPosition: () => { nodeId: string, tileId: string } | null,
 *   gate: () => boolean,
 *   list: Omit<import('./listPanel.js').ListPanelOptions<Creature>, 'getRows'>,
 *   emptyMessage: string,
 *   addButtons: () => (import('./listPanel.js').AddButton | null)[],
 * }} opts
 * @returns {{ update: () => void, element: HTMLElement }}
 */
export function mountNearbyList(container, opts) {
  const root = el('div', 'encounter-panel__nearby u-col');
  container.appendChild(root);

  /** The key of the open line, or null. @type {string | null} */
  let expanded = null;
  /** @type {string | null} */
  let signature = null;
  /** @type {NearbyGroup[]} */
  let groups = [];
  /** Each line's HP bar update, by group key. @type {Map<string, (g: NearbyGroup) => void>} */
  let bars = new Map();
  /** @type {{ update: () => void } | null} */
  let open = null;

  /** @param {boolean} gm */
  const structure = (gm) =>
    JSON.stringify([
      gm,
      expanded,
      opts.list.dependsOn?.() ?? null,
      groups.map((g) => [g.key, g.distance, g.members.map((m) => m.id)]),
    ]);

  function update() {
    const gm = opts.gate();
    groups = groupNearby(opts.getRows(), opts.getPosition());
    if (!groups.some((g) => g.key === expanded)) expanded = null;
    const next = structure(gm);
    if (next === signature) {
      for (const g of groups) bars.get(g.key)?.(g);
      open?.update();
      return;
    }
    signature = next;
    paint(gm);
  }

  /** @param {boolean} gm */
  function paint(gm) {
    const memo = captureFocus(root, document.activeElement);
    root.innerHTML = '';
    bars = new Map();
    open = null;
    if (groups.length === 0) root.appendChild(emptyState(opts.emptyMessage));
    for (const g of groups) root.appendChild(gm ? gmLine(g) : playerLine(g));
    if (gm) {
      for (const spec of opts.addButtons()) {
        if (!spec) continue;
        root.appendChild(
          textButton(
            spec.label,
            async () => {
              const result = await spec.onClick();
              if (result !== false && result !== null) update();
            },
            { icon: spec.icon, className: 'encounter-panel__add' },
          ),
        );
      }
    }
    // A foe that falls or leaves takes its row, and the focused button with
    // it, out of the open line. Focus then goes to the first line, not to
    // the page body.
    if (memo && !restoreFocus(root, memo)) {
      /** @type {HTMLElement | null} */ (root.querySelector('button'))?.focus();
    }
  }

  /** @param {NearbyGroup} g @returns {HTMLElement} */
  function playerLine(g) {
    return el(
      'div',
      'encounter-panel__line u-row u-g2',
      el('span', 'encounter-panel__line-name', g.title),
      el('span', 'u-muted', hpBand(g.current, g.max)),
      el('span', 'encounter-panel__distance u-muted', distanceText(g.distance)),
    );
  }

  /** @param {NearbyGroup} g @returns {HTMLElement} */
  function gmLine(g) {
    const isOpen = g.key === expanded;
    const slotId = uniqueId('nearby-group');
    const defeated = g.key === DEFEATED_KEY;
    const button = el(
      'button',
      'encounter-panel__line encounter-panel__line--toggle u-row u-g2',
      icon('chevron'),
      el('span', 'encounter-panel__line-name', g.title),
    );
    button.type = 'button';
    button.dataset.focusKey = `nearby:${g.key}`;
    button.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) button.setAttribute('aria-controls', slotId);
    if (!defeated) {
      const bar = buildStatBar(g, { modifier: 'hp', label: 'HP', compact: true, band: true });
      button.appendChild(bar.element);
      bars.set(g.key, (next) => bar.update(next, 0));
    }
    button.appendChild(
      el('span', 'encounter-panel__distance u-muted', defeated ? '' : distanceText(g.distance)),
    );
    button.addEventListener('click', () => {
      expanded = isOpen ? null : g.key;
      update();
    });
    const wrap = el('div', 'encounter-panel__group', button);
    if (!isOpen) return wrap;
    const slot = el('div', 'encounter-panel__members');
    slot.id = slotId;
    wrap.appendChild(slot);
    const key = g.key;
    open = mountListPanel(slot, {
      ...opts.list,
      getRows: () => groups.find((x) => x.key === key)?.members ?? [],
    });
    return wrap;
  }

  update();
  return { update, element: root };
}
