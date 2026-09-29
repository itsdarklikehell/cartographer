# Benchmarks

The project has five benchmark harnesses. Each one measures a different part
of the app.

- `pnpm bench` drives the real app in Chrome and reports what a tab costs: DOM
  nodes, listeners, heap, layout and script time, long tasks, and a sampled CPU
  profile per scenario.
- `pnpm bench:pure` times the pure modules in Node, with no browser. Generation,
  serialization, fog reveal, and the world tree run here.
- `pnpm bench:scale` times the whole-state paths as the world grows, from the
  example campaign up to four hundred extra generated regions. Its table shows
  which paths grow with the world and where each one crosses the 50 ms line
  that a GM feels as a stall. Run it before and after a change to the save,
  diff, or reconcile paths.
- `pnpm bench:step` times one Play-mode party step on square nodes from 48 to
  400 cells on a side. Its table shows whether a step grows with the node.
- `pnpm bench:commit` is the fast check that the pre-commit hook runs. It times
  the same whole-state paths at one large world size and compares each median
  against a budget from `budgets.json`. It runs in under a second.

None of them adds a dependency. The browser harness talks the Chrome DevTools
Protocol over the `WebSocket` that Node 22 ships, so there is no Playwright or
Puppeteer install.

## Running the browser harness

```
pnpm bench                          every scenario, headless
pnpm bench -- --headful             the same run in a visible window
pnpm bench -- --only=paint-stroke   one scenario
pnpm bench -- --port=8934           a dev server that is already running
pnpm bench -- --budget=120000       a longer per-scenario cap
```

The harness serves the repository with a small Node static server when the
port is closed, and it stops only a server that it started. The app fetches
about 340 modules at once on boot, and `python3 -m http.server` resets some of
those connections, which leaves the page with no app. Chrome runs with a
throwaway profile, so your own browser stays closed and every run starts with an
empty localStorage.

Set `CHROME_PATH` when Chrome is not in the usual place for the platform.

## What a run writes

Each run makes one directory under `bench/results/`:

- `summary.md`: the table to read, and the ten hottest functions per scenario.
- `metrics.json`: every reading, for a diff between two runs.
- `<scenario>.cpuprofile`: a sampled profile at 100 microseconds. Open it in the
  DevTools Performance panel for a flame chart. Chrome loads the file through
  the Load button in that panel.

Results are not committed.

## The commit check

The pre-commit hook runs `bench:commit` when a commit touches `src/`. The
check is informational. The table prints on every run. A path over its budget
prints a loud warning, and the commit still goes through. The warning is a
prompt to look at the change before you push it.

The budgets live in `budgets.json`. They sit well above the medians of a
healthy run, so machine speed and background noise do not trip them. A breach
means a code path does more work than before. When a change moves a cost on
purpose,
re-measure with `pnpm bench:commit` and raise the budget in the same commit.

The `heapPerTile` row is a memory budget, in bytes. It loads the campaign
from its save, saves it once, and divides the heap that the result keeps by
the tile count (`heap.js`). The reading covers the live tiles and every cache
that a load and a save fill, and it sits near 150 bytes. A cache that keeps
one record per tile for the whole session puts it over its budget of 220 bytes:
a cache of packed tiles in V8's dictionary mode reads about 690.

The `partyStep` row and the `step ms` column of the scale table time one
Play-mode party step on the example world node, averaged over a walk along
its middle row. A step is the fog reveal plus the values that the next frame
and the map description read: the region groups, slots, outlines, and image
chunks, the revealed-id lookup, the span blocks, and `describeNode`
(`party-step.js`). The region caches key on tile stamps, so a step that only
reveals fog costs about 0.01 ms. A cache that keys on the node instead
rebuilds on every step.

The `partyStep200` row walks the same step on a fogged 200x200 node
(`sweepNode` in `party-step.js`), where it costs about 0.04 ms. A step
reader that scans every tile makes the row read about 0.9 ms, which is over
its budget of 0.3 ms, while the example world node is too small to show the
scan. `pnpm bench:step` prints the same walk at each node size:

| Node | Tiles | Step with the fog readers | Step with a scan of every tile |
| --- | --- | --- | --- |
| 48x48 | 2,304 | 0.010 ms | 0.060 ms |
| 100x100 | 10,000 | 0.010 ms | 0.225 ms |
| 200x200 | 40,000 | 0.037 ms | 0.891 ms |
| 400x400 | 160,000 | 0.120 ms | 3.473 ms |

The step cost that still grows with the node is the copy of the tile array
in `withTilesReplaced`.

## The scenarios

| Scenario | What it drives |
| --- | --- |
| `boot` | A cold load, up to the first mounted panel |
| `load-example` | Build the example campaign, persist it, reload onto it |
| `paint-stroke` | One authoring stroke of 24 cells |
| `generate-map` | Procedural generation through the Generate dialog |
| `zoom-pan` | Twenty wheel-zoom steps at the canvas center |
| `play-pan` | One right-drag pan across the fog-revealed map in Play mode |
| `panel-tabs` | Thirty sidebar tab switches |
| `rehydrate` | Fifty cross-tab save adoptions, each a full re-read of the save |
| `combat-turns` | Start a fight, advance twenty turns, end it |

Order matters. `load-example` reloads onto the example campaign, and the
scenarios after it read that campaign. When `--only` names one of those
scenarios without `load-example`, the runner adds `load-example` in front
and says so. Without it, the selected scenarios would drive an empty campaign
and report nothing. The runner always adds `boot`, because `boot` is the
scenario that opens the app. Every scenario drives the UI the way a
GM does, through a click, a drag, a wheel gesture, or a `storage` event. None of
them reach into app state, so the numbers cover the same code a real action
runs.

A scenario reports `skipped` when the control it needs is absent. That is not a
failure. The fight scenario, for example, needs an encounter on the party's
tile, so it loads a save that puts the party there (`seed.js`) before it gives
up. The exception is a scenario marked `prerequisite`, which is only
`load-example`. The scenarios after it read the example campaign, so when it
skips or fails, the runner stops and exits with status 1.

## Reading the numbers

- **Wall** is the whole scenario, including the harness waits. Compare it
  between runs, not against a budget.
- **Script, Layout, Style** come from Chrome's own counters, as a delta over the
  scenario. A scenario that reloads the document resets those counters, so its
  row reads `(reload)`.
- **Long tasks** are the entries over 50 ms. These are what a GM feels as a
  stall. A row with none can still be slow in total.
- **Frame p95** is the 95th percentile gap between animation frames. A p95 far
  above the p50 means a stall, which a mean would hide.
- **Nodes and Listeners** are the leak signal. `rehydrate` and `panel-tabs` both
  repeat one rebuild many times and finish where they started, so growth in
  those two rows points at something a rebuild does not release.
- **Hot functions** are self time from the sampled profile. `(program)` and
  `(idle)` are the browser itself, not app code.

## Adding a scenario

Add an entry to `SCENARIOS` in `scenarios.js` with a `name`, a `description`,
and an async `run(page, ctx)`. Use the helpers on `page`: `clickSelector`,
`clickText`, `box`, `mouse`, `wheel`, `waitFor`, and `eval`. Return a small
record of what the scenario did, or `{ skipped: reason }`.

Two rules keep a scenario honest. Drive the UI, never app internals. If the
action reloads the document, use `page.clickForReload`, because the evaluation
that ran the click dies with the old document and never answers. If the click
reloads only sometimes, start `page.nextLoad()` before the click and await it
after.
