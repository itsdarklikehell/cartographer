# Persistence

*Explanation. Back to the [architecture overview](../architecture.md).*

A campaign lives in the browser's localStorage, whose limit of about 5 MB per
origin drove almost every decision in `src/storage/`: saves are packed
tightly, the undo history stores small deltas instead of full snapshots, and
image payloads stay in their own section so that one large picture cannot
take down the whole map.

## The save pipeline

```
  live state (TileGrid, characters, creatures, ...)
      |
      |  buildState            flatten to CampaignState; stamp schema version
      v
  plain CampaignState object
      |
      |  packTile              drop tile fields equal to their defaults
      |  packEntity            drop entity fields withDefaults would restore
      |  tabulateGear          repeated weapons, armor, items -> gear table
      |  hoistAssets           inline data: URLs -> asset:<key> + assets table
      |  encodeNodeTiles       tile codec: palette + run-length streams
      |  tabulateStrings       palette strings -> one strings table
      v
  packed state ---- JSON.stringify ----> one string
      |                                        |
      |  localStorage path                     |  export path
      v                                        v
  detachAssets: payloads to their          downloadCampaignFile: one
  own key, campaign string to its          self-contained JSON file,
  own key, one history delta appended      with the custom library
                                           attached as a `library` field
                                           (storage/CampaignFile.js)
```

Loading runs the same stages in reverse, with two extra steps at the front:
schema migrations, then field coercion. The gear restore and the string
restore run ahead of the migrations.

The top-level type is `CampaignState` (`src/types/storage.ts`). It has a
flat `nodes` array (the flattened node map of the `TileGrid`), plus `party`,
`characters`, `creatures`, and the other collections. `storage/SaveManager.js`
owns `buildState`, `serialize`, `deserialize`, and `toTileGrid`, and all four
are pure. `toTileGrid` rebuilds a working hierarchy by adding each node of
the state as it is, because a `MapNode` already has its own `parentId`.
It runs no defaulting of its own, because `deserialize` has already
defaulted every node and a second pass would re-map and re-freeze every tile
of the world on each load. The grid therefore contains the parsed node
objects themselves.

`buildState` takes one source object (`CampaignSource`: a `TileGrid` plus any
campaign field the caller has) instead of a positional list. Every field
except the grid is optional. Each optional field falls back to the same empty
value that an older save reads as. As a result, adding a top-level field means
naming it in `buildState` and in `CampaignState`. No caller needs an update to
keep persisting it.

The two live callers pass a whole object. The save and export path spreads
`app.state` with the grid and party position added. The campaign-replace path
passes the `Campaign` as it stands.

Thin wrappers surround these pure functions: `trySaveToLocalStorage`,
`loadFromLocalStorage`, `downloadState`, and `readStateFromFile`. These
wrappers are the only code that touches the real browser APIs: `localStorage`,
`Blob`, and `FileReader`. The save wrapper reports its result instead of
throwing an error, so a quota failure reaches the GM instead of appearing as
a successful save.

The save wrapper also reports the footprint of the whole origin, because
the save, the history deltas, the image sidecar, and the library share one
quota. `storage/Footprint.js` keeps a ledger from key to stored length, so
this check does not read every stored value after each save. Every
localStorage write in the app goes through `writeStored` and `removeStored`,
which record it in the ledger. The theme switch and the onboarding overlay
use them too, although they live in `src/ui/` and `src/app/`.
`HistoryLog.trimToCap` reads delta sizes from the same ledger. Writes from
other tabs arrive as `storage` events, and `onExternalSave` passes each one
to the ledger. The ledger re-reads the origin when the key count differs
from its own size. A direct `setItem` that rewrites a key with a new length
does not change the key count, so the ledger cannot detect it. To prevent
this, a test in `tests/Footprint.test.js` scans `src/` and fails when a file
outside `src/storage/` calls `localStorage.setItem`, `removeItem`, or
`clear`.

The export and import buttons go through `storage/CampaignFile.js` instead
of `downloadState` and `readStateFromFile`. `serializeCampaignFile` writes
the packed state with the GM's custom library attached as a `library`
field, and omits the field when the customs are empty, so such a file
equals the plain serialized save. `readCampaignFromFile` splits the two
apart again. The library joins the byte stream in this one module and
nowhere else: `buildState`, the localStorage save, the history log, and
the tab-sync deltas never include it, so bundling adds nothing to the
storage costs those paths account for.

## Load-time validation

`deserialize` sets any missing top-level field to an empty value instead of
throwing an error, so an older or smaller save still loads. It is also
the only validation step a save passes through. It coerces every field whose
*structure* the load path trusts. Collections become lists of records. The
party position, a running combat, the game clock, the travelogue, the quest
log, and the bestiary get their required members with the right types. Those coercers
live in `storage/RecordCoercion.js`, one function per collection. Import
persists what it reads and then reloads, so a malformed field that passes
through `deserialize` becomes the stored save of an app that no longer
starts. A travelogue entry whose timestamp is not a number is
one example: the panel formats every entry during startup, and an unreadable
date throws there.

A quest from a save with no `objectives` or `links` field loads with empty
lists. The quest coercer gives each objective a unique id, because the panel
keys every objective edit by id. It drops a link that names no node or no
creature.

`withNodeDefaults` (`map/TileGrid.js`) does the same job for nodes and their
tiles. It drops any tile it cannot read. `withRepairedParents` then clears a
`parentId` that names the node itself or a node not in the save, and breaks
each parent loop by turning one node of the loop into a root. Every walk up
the hierarchy, such as the breadcrumb, loops forever on a cycle and freezes
the tab at startup. The character and creature `withDefaults` functions use
`entities/LoadCoercion.js` for their list fields (resources, inventory,
conditions) and the spellbook, so a scalar in one of those fields reads as
empty.

`loadInitialCampaign` throws on a save with no map nodes, and the import
refuses such a file before it stores anything. Any JSON record parses as a
campaign, so a file such as `{"hello":"world"}` reaches this check. A party
position that names a missing node moves to tile 0,0 of the first root node
(`Campaigns.partyOnGrid`).

A bundled `library` field has its own gate. `deserialize` rebuilds the
state field by field, so the field can never enter `CampaignState` or reach
localStorage through the import's persist. `extractBundledLibrary` in
`CampaignFile.js` lifts it through `normalizeLibrary`, the same tolerant
parse a standalone library file passes, and reads anything absent,
malformed, or empty as null. A broken library therefore cannot fail the
campaign import around it.

As a backstop, `main.js` starts through `Campaigns.loadInitialCampaignSafe`,
which also builds the map navigator and the party tracker. A save that still
cannot be read, or whose map either object refuses, produces a blank campaign
plus a notice. This
leaves the stored save and the history log untouched, so Undo can still step
back to the save before the broken one.

### Shortened loads

`decodeNodeList` (`TileCodec.js`) loads at most `MAX_NODES` nodes and
`MAX_TOTAL_CELLS` tiles, because a run of `[index, count]` costs a few
characters in the file and one tile object in memory per cell. It drops the
nodes past the node limit, loads a node that does not fit in the cells left
with no tiles, and returns both counts. `deserialize` notes a nonzero report
in a `WeakMap` keyed on the state it returns, and `loadTruncation(state)` in
`storage/ShortenedLoad.js` reads it. The report stays off the state, because
`StateDiff` diffs every top-level field.

A shortened state is a copy of the save with parts missing, and the next
save stores it over the full campaign. The import handler therefore asks
before it stores a file that loads shortened (`confirmShortenedImport` in
`app/shortenedLoadPrompts.js`). At boot, `loadInitialCampaignSafe` returns the
report as `truncated`, and `main.js` calls `holdShortenedBoot`, which turns
on the save hold and asks the GM. While the hold is on, `writeOut` in
`campaignActions.js` skips the autosave and the flush, and the Save button
asks first. Keeping the shortened map, or saving it from the Save button,
lifts the hold. The hold does not stop New, Load example, Import, or Undo,
because each of those stores a campaign the GM chose.

## Packing layer 1: tile defaults

The on-disk format differs from the in-memory format. `serialize` packs every
tile. It omits each field that equals its default value: `overlayRef: null`,
`revealed: false`, `childNodeId: null`, `span: 1`, any default `metadata`
member, and the empty `metadata` object itself.

Default tile fields make up 62% of the example campaign's characters in the
per-cell form, because almost every tile of a painted map is plain unrevealed
terrain with no point of interest, and a day of undo history multiplies
whatever a save costs by ten. This layer alone takes the example campaign
from 358,413 to 134,907 characters.

The inverse function is `withTileDefaults` (`map/TileGrid.js`). It fills
exactly those fields from absence, and every load already runs it, so no code
states a default twice. `deserialize` runs `withNodeDefaults` itself on load,
instead of leaving the unpack to `toTileGrid`.

`withTileDefaults` builds each tile with its fields in the order of
`createTile`, then any field it does not know, then `span`. A decoded record
lists its fields in whatever order the file gives, and V8 gives each order
its own hidden class. The example campaign loads with 11 tile hidden classes
when the order follows the record, and a scan over those tiles takes about
three times as long as a scan over tiles of one order. With the fixed order,
loaded tiles have the same 2 hidden classes as tiles built in memory.

Packing drops no field that the packer does not know about, and a packed
tile never reaches live state:

- `packTile` deletes keys from a *copy* of the tile, instead of picking named
  fields into a new object. As a result, a `Tile` member added later stays
  in a save, even when the packer does not know about it.
- Packed tiles exist only inside the serialized string. The renderer reads
  `tile.metadata` without a guard, so a packed tile in live state throws on
  its first draw. An explicit `span: 1` comes back absent, and the `Tile` type defines
  absence as the same value.

## Packing layer 2: entity defaults

The entity collections pack the same way, one level up, through
`storage/EntityPack.js`, but with a difference. `packEntity(entity,
withDefaults)` does not read a table of default values. It omits a field only
after it *proves* that the entity's own `withDefaults` restores that exact
value. It deletes the field from a copy, runs `withDefaults`, and keeps the
omission only when the result matches the loaded form of the original exactly.
The same trial runs for fields inside nested records, such as the lists in a
character's `proficiencies`. An empty `expertise` list goes because the load
path fills the hole with the same empty list, and a record whose fields are
all defaults goes whole.

A static table of defaults does not work, because for entities the default
value can depend on the entity itself. `Character.withDefaults` derives the
hit dice pool and the spell slots from the character's own class list, so the
value that an omitted field restores to differs per character. A table of
per-type defaults has one value per field, so it either never omits such a
field or omits it against a value that the load puts back wrong. Validating
each omission against the real unpacker keeps packing and loading in
agreement.

`SaveManager`'s one `ENTITY_DEFAULTS` table names three pairs: `characters`,
`creatures`, and `handouts`. Both directions read this table, so the
two halves cannot drift apart. `quests` and `bestiary` are absent because
neither has a `withDefaults` function to pack against, and both measured at
zero default-valued bytes.

For the same reason, `deserialize` runs the entity `withDefaults` functions
itself, instead of leaving them to `Campaigns.loadInitialCampaign`. A stored
character may have no `spellbook` key. `undoHistory` and
`readStateFromFile` hand their results to callers that apply no defaults of
their own.

The omission works per field, on a flat structure, because recursion into a
nested record would need to know whether the record fills member-wise
(`stats`) or as a whole (`equipment`), and the `withDefaults` contract does
not state this.

Each collection packs through one `createEntityPacker`, which caches the
packed form on the entity's identity. Entities are immutable values, so an
entity that no edit touched since the last save packs to the cached object.
Without the cache, the trial loop ran for every creature on every autosave,
and it dominated the save cost of a campaign with hundreds of creatures.

Measured on the example campaign, this layer moved the save from 133,948
characters to 129,715, with the creature collection alone dropping 49%. The
win scales with the size of the roster, not the size of the map. It is small
next to the tile packing, and it grows with a campaign that has hundreds of
mobs.

### The gear table

A creature spawned from a template copies the template's weapon and armor,
and a character copies each library item it carries. Twenty goblins store
the same Shortsword twenty times. `tabulateGear` in `storage/GearTable.js`
runs on the packed entities and moves every piece used two or more times
into a `gear` list at the top of the save. The record keeps `{"@": 0}` in
its place. The sites are `weapon` and `armor` on `creatures` and
`bestiary`, and each entry of a character's `inventory`. A piece used
once stays inline, because a reference plus a table entry costs more than
the piece.

An inventory item has two fields that belong to the one copy a character
carries, `quantity` and `notes`. The table entry keeps those keys with a
null value, and the reference keeps their values: `{"@": 2, "quantity": 5,
"notes": ""}`. `restoreGear` spreads a copy of the entry and then the
reference, so the restored item has its keys in the order it was stored in.
Without that order, a load followed by a save gives a different string for
the same state.

`restoreGear` is the first step of `deserialize`, ahead of the migrations,
so no migration step and no coercion ever sees a reference. The table is
built again from the state at each save, in the order the walk first meets
each piece, and it exists only in the stored string. The undo log diffs
parsed state, so a history op holds gear inline. A save with no `gear`
field loads with no restore step, so a save written without the table still
reads.

The walk caches each piece's dedup key on the piece object. The entity pack
cache hands the same packed piece to every save until the entity changes,
so a save with 1,200 creatures spends about 1 ms on the table. On the
example campaign the table saves about 3,600 characters. Each goblin
spawned from the bestiary costs 281 characters where it costs 484 with its
gear inline. The four example characters carry mostly different items, so
their inventories shrink by only about 340 characters.

## Packing layer 3: the asset table

GM-supplied images arrive as inline `data:` URLs, so the whole image is
base64 text inside the field that references it. Stored this
way, one imported tile painted across a 30x30 region costs its whole payload
once per cell: 18.5 MB of save for a 20 KB image.

`hoistAssets` in `storage/Assets.js` replaces every inline
`data:` URL with an `asset:<key>` reference into an `assets` table, keyed by
a hash of the payload's content. `restoreAssets` inlines the payloads again
inside `deserialize`. The 18.5 MB example becomes 58 KB, because the payload
is now stored once and referenced 900 times.

`restoreAssets` also runs every ref through `storage/ImageRefs.js`. The
app loads an inline image payload, an `asset:` key, or a relative path on
this origin with no `..` segment. Any other ref, such as a protocol-relative
URL to another host, is blanked at load, and the renderer draws its placeholder for that
tile. `TileRaster.imageSrcForRef` and the handout panel repeat the check
before they hand a ref to an image element.

The fields that contain payloads (a tile's `imageRef` and `overlayRef`,
single or stacked, and a handout's `image`) are listed in one traversal
there. As a result, adding a third site takes a single line.

The table follows these rules:

- The table is rebuilt from the refs that are present on every serialize. As
  a result, it prunes itself, and an image-free campaign gets no `assets`
  field at all.
- A node that one hoist found free of payloads is remembered in a `WeakSet`.
  Nodes are immutable, and the save path packs a node once per identity, so
  a later save skips the tiles of an unchanged node instead of walking them
  again.
- A module-level map keeps the hash of each payload that the last hoist
  met, so a save hashes only a payload that is new since the previous save.
  Each hoist starts a new map, so a payload that leaves the campaign leaves
  the map too. With eight photos of 250,000 characters, a one-hit save costs
  about 1.6 ms, where hashing every payload again costs about 5.5 ms.
- Keys resolve a collision by comparing the stored payload and probing a
  suffix. A hash collision costs a longer key, and never the wrong image.
- A reference that the table cannot resolve stays as written, instead of
  being blanked. The `asset:` prefix is one character from the built-in tile
  root (`assets/tiles/...`). The worst case of leaving it is the placeholder
  that the renderer already draws for a ref that will not load.
- Like a packed tile, the table exists only on disk. `deserialize` builds its
  return value field by field, so live state never contains one.
- The undo log names images by the same keys. `HistoryCodec.historyForm`
  hoists both states of a step before the diff, so a step that attaches a
  245,000-character photo records an 86-character delta, and a step that
  deletes the handout records 527 characters. Undo, redo, and a follower
  tab apply such a step through `HistoryLog.applyHistoryOps`, which resolves
  the keys with `restoreAssets` and the stored table, the step a load runs.

### The localStorage split

In localStorage, the assets table does not travel inside the save at all.
`storage/AssetStore.js` keeps it under its own key
(`campaign-builder:assets`). `trySaveToLocalStorage` splits the table off the
packed state with `detachAssets`. It writes the payloads first, then writes
the campaign, and reports the two results separately as `ok` and `assetsOk`.

This split lets structure and blobs fail independently, so a full origin
costs the GM a handout picture instead of the whole map, and a history
snapshot never includes a picture that it did not change.

The write order (payloads first) makes the failure recoverable. A campaign
that references a payload missing from the sidecar renders the placeholder
that the renderer already draws. The reverse order
can instead persist structure that references nothing. The write order also
settles the cross-tab case, because a follower acts only after the
campaign key is written, and by then the payloads are already stored.

Only the localStorage path splits the table out. `downloadState` still
serializes the whole save, so an exported campaign is one self-contained
document. Import needs no special handling, because the persist-then-reload
path hands the inline payloads straight back to the same writer.

The optional second argument to `deserialize` is the read half. It supplies
payloads that the string does not contain, and a table inside the string takes
priority over it. Its only two callers are the two readers of a stored
string: `loadFromLocalStorage` and the cache that `HistoryLog` keeps of the
last persisted state.

Retention spans every stored string, not only the current save. A payload is
deleted exactly when the last state that references it becomes unreachable.
These references are collected by matching `asset:` keys against the raw
text (`referencedAssetKeys`, in `Assets.js`, beside the key alphabet it
matches), instead of by walking parsed state.

A delta record that names a key lands after the scan of its own save, so
`saveCampaign` passes `keepPrevious` for it, the same as for a snapshot
record, and that save skips the scan. The next save scans and finds the
record. A payload whose last record drops out of the log stays in the table
until a later scan runs, which happens once the references of a save
change or a key that the last scan saw is gone.

The scan reads raw text because of the tile codec, described below. After
encoding, a tile's reference lives inside an encoded node's palette, where a
state walk cannot see it without decoding first. The scan is skipped completely when there is
nothing to keep, which is true of every campaign that has never had an
image.

The scan is also skipped when it cannot change anything. `persistAssets`
remembers the table string it last wrote, the keys that save referenced,
and the names of every stored key at that time. A reference can only go
away when the save stops naming a key or a stored string disappears, so the
next save scans only when its references differ, a stored key is gone (the
history log dropped a record), the table on the origin is not the one this
tab wrote, or a payload differs under a known key. A key that appears, as
every save adds one history delta, does not trigger a scan. After a scan,
the table is written only when the kept table differs from the stored one.
Without these checks, one picture in the campaign makes every autosave parse
the table, read every other stored string, and write the table back
unchanged.

The table string itself is read only when it can differ from the one this
tab wrote. `storeAssets` and `persistAssets` compare the length that the
`Footprint.js` ledger records for the key with the length this tab wrote,
and `Footprint.externalWriteSerial` tells them whether a `storage` event
from another tab has touched the key since. When both match, they use the
remembered string, because a `getItem` of a table with eight photos copies
about 2M characters. A write from another tab whose event has not arrived
yet can slip past this check. `storeAssets` therefore merges new payloads
into a freshly read table, and a scan that `persistAssets` runs reads the
table fresh too.

## Packing layer 4: the tile codec

The three layers above cannot reduce the largest cost. A packed tile is
little more than `{"id":"12,34","imageRef":"assets/tiles/grass/grass-1.svg"}`,
and neither field is a default value, so no omission rule can drop either
one. The node list is the only part of a save that grows without limit.
Authoring adds tiles, and fog reveals only increase and are never reclaimed.

`storage/TileCodec.js` encodes a node's tiles positionally instead:

```
  per-cell form                        encoded form
  --------------                       ------------
  [                                    refs:  distinct (imageRef, overlayRef)
    {"id":"0,0","imageRef":"grass"},          pairs, the node's art palette
    {"id":"1,0","imageRef":"grass"},   cells: row-major run-length stream of
    {"id":"2,0","imageRef":"road",            indices into refs; a tile's id
     "revealed":true},                        is implicit in its position
    ...                                fog:   revealed as its own run-length
  ]                                           stream (alternating run lengths)
                                       links: distinct childNodeId values, and
                                              linkCells, a run-length stream
                                              of indices into links
                                       tiles: only the leftovers, keyed by id
```

The encoder lists each distinct piece of art once. It then describes the map
as runs of "the next N cells use art number K". A 40x40 field painted with
one grass variant becomes one palette entry and one run, 129 characters in
place of 93,601 in the per-cell form.

`fog` is separate because `revealed` is the one field that play changes. A
reveal is a disc, and run-lengths compress a disc almost perfectly. Exploring
that whole field costs 15 more characters in the encoded form, where the
per-cell form adds 25,600.

`links` and `linkCells` state the region links the same way. The generators
link every tile of a region's block to that region, so a link repeats over
hundreds of tiles in a few rows of runs. A save with links in the leftover
records still reads, because the decoder uses the link stream only when a
node has `links`.

The palette writes each ref in a short form (`storage/TileRefs.js`). Each
built-in palette id equals the base name of its file, so the palette stores
`snow-3` for `assets/tiles/snow/snow-3.svg`, and the decoder reads the id
back through the built-in catalog. A ref with a `/` or a `:` is never a
palette id, so an `asset:` key, a `data:` payload, and a path outside the
catalog pass through both ways, and so does every path in a save that
stores full paths. A bare live ref that reads as a palette id gets a `=`
prefix, so a hand-edited ref `grass-1` does not come back as a path.

A variant family (a terrain type with variants, such as `grass`, or an
interior floor family, such as `interior-floor`) has a shorter form still.
`TileCatalog.variantIdAt` picks a variant from a hash of the cell position.
The generators and the random-variant brush paint that pick, and the codec
writes a cell whose variant is the pick as the family name alone, which the
decoder expands with the same hash. A field of mixed grass variants then
stores as one palette entry and one run. A variant that the GM paints on
purpose and that differs from the pick keeps its palette id. A 40x40 field
painted with the random grass brush costs 127 characters. A cell whose
variant equals the pick can store either form, and the encoder takes the
palette id when the cell before it stored that id, so a field of one fixed
variant also stays one run. Adding a variant to a family changes the pick, so the
stored cells of that family read back with new art.

The decoder turns each palette entry into a reader (`artReader` in
`TileRefs.js`) before it walks the cells. A reader of a fixed entry keeps
one live art object, and a reader of a family keeps one per variant, so a
48x48 grass field allocates a few art objects, not 2,304. Every reader has
the same fields, so the cell loop branches on them and makes no function
call through a closure per cell.

On the example campaign, the encoded node list is 130,825 characters, where
the same nodes in the per-cell form cost 1,506,124.

The codec never loses data, because it refuses any node that it cannot
represent and writes whatever it does not represent out of line:

- **The codec is opt-in for each node.** A node qualifies only when its
  dimensions are usable and every tile id is a canonical in-bounds `"x,y"`
  with no duplicate position. Otherwise, `encodeNodeTiles` returns the *same
  object*. A hierarchy fixture or a hand-edited id then falls back to the
  per-cell form, instead of being forced into the grid. Nodes that are sparse
  but still gridded (interiors often are this way, and `barrow` is 94 tiles
  in a 14x14) encode through a reserved `-1` index that means "no tile here".
- **The leftover list is built by deleting the fields that the codec
  represents itself**, exactly as `packTile` does. As a result, a `Tile`
  member added later stays in the leftover record, instead of being dropped.
  A `childNodeId` that is not a string stays there too.

The codec also follows these rules:

- Each palette is built by row-major traversal, instead of by `tiles` array
  order, because the cross-tab write check (`storageMovedOn`) compares raw
  save strings, and a palette in array order would make an unchanged
  campaign re-serialize to a different string and read as another tab's
  save.
- Decoding degrades instead of throwing an error. An unreadable palette
  entry skips its cell, and an unreadable run ends the stream. Import
  persists what it reads before it reloads, so an error thrown here produces
  a save that cannot start.
- **Ordering.** The codec runs after the asset hoist in `packState`, and
  before the asset restore in `deserialize`. The hoist's
  traversal walks `node.tiles[].imageRef`, and an encoded node no longer has
  this field. Running the codec after the hoist means the palette contains refs that are
  already hoisted to `asset:` form, so `Assets.js` needs no knowledge of the
  encoding. Decoding ahead of `withNodeDefaults` likewise leaves a decoded
  tile still packed, so the codec states nothing about what a default value
  is.

The codec is the one place where the reader branches on whether a field is
present instead of filling one from absence, so the app reads both forms
indefinitely. `StateDiff` works on parsed state, and it never
sees `cells` or `fog`. The undo log stores whole nodes in the encoded form
(see Undo and redo), through `encodeNodeTiles` and `decodeNodeTiles` only,
so the codec stays node-local.

### The string table

The node palettes of one campaign repeat the same refs. The example
campaign has 3,390 palette strings, but only 119 distinct ones.
`tabulateStrings` (`storage/StringTable.js`) runs last in `packState`. It
lists each distinct palette string once, in a top-level `strings` array, and
writes its index into every palette in its place:

```
  "strings": ["grass", "road-h", "asset:k1"],
  "nodes": [{ "id": "world", "refs": [0, [0, [1, 2]]], "cells": [...] }]
```

On the example campaign, the palettes cost 12,187 characters and the table
1,739, where palettes of strings cost 53,584. The whole example save is
142,162 characters.

`restoreStrings` runs first in `deserialize`, beside the gear restore. It
puts the strings back and removes the table, so the migrations, the tile
decoder, and the asset restore all read palettes of strings. Only the save
string has the table. The output of `encodeNodeTiles` still names its
strings, because the undo log stores encoded nodes and decodes each one
alone, with no save around it. Code that needs one encoded node calls
`encodeNodeTiles`, never `packState(...).nodes`.

The table lists strings in the order of first use: the nodes in list order,
then each palette in order. The same state therefore gives the same table,
and an unchanged campaign saves to the same string, which the undo log and
`storageMovedOn` compare. A new node joins the end of the node list, so its
new refs join the end of the table. A new ref that a paint adds to an
earlier node shifts the indices after it. The palettes of later nodes then
change in the save string, but the parsed state stays the same, and the
undo log diffs parsed state. Each tabulated node is cached on its encoded
node, together with the indices it used, so an unchanged node whose
indices stay the same tabulates to the same object on the next save.

Reading is based on presence. A save with no `strings` array loads as it
is, and a number in a palette is an index only when the table is present.
An index that names no string stays a number, and the decoder skips it as
an unreadable entry. `referencedAssetKeys` scans the raw save text, so an
`asset:` key in the table still keeps its payload.

## Schema versions and migrations

A save has a schema `version`. `buildState` stamps this version, and
`deserialize` reads it, with the step transforms living in
`storage/Migrations.js`. `MIGRATIONS[n]` turns a version-n save into a
version-n+1 one, and a missing version reads as 0 (every save written before
this field existed).

The migration chain runs on the raw parsed object *before* the coercion in
`deserialize`. A step repairs data that coercion would flatten or drop. The chain also
runs ahead of the asset restore, so a step sees hoisted refs and resolves a
payload through the table itself. The gear restore and the string restore
run before the chain, so a step sees each weapon, armor, and item inline,
and each palette as a list of strings. A
save stamped newer than the app runs no migration steps, and the app reads it
on a best-effort basis.

A version bump with no payload change registers an identity step, instead of
being left absent. As a result, a unit test can assert that the table covers
every step. A transform filed under the wrong key cannot silently do
nothing.

Any future change to the *meaning* of a stored field belongs in that table. Adding a field alone does not belong there,
because the `withDefaults` functions already absorb its absence.

A step never names `library`, because the field a campaign export bundles
belongs to `normalizeLibrary` and passes through the table untouched. A
test runs a version-1 save with a library through
the whole chain and asserts that the field is unchanged.

## Undo and redo

Undo and redo work from a log of invertible deltas against the persisted
save, in `storage/HistoryLog.js`. A delta records only what one save
changed, not the whole campaign. `saveCampaign` is the one save path, and it
writes the campaign, then appends one delta produced by the `diffState`
function of `storage/StateDiff.js`, over the previous and new parsed states.

An op records both its old value and its new value, so `invertOps` performs
a swap. Undo and redo are the same walk, in opposite directions:

```
   deltas:   d1      d2      d3      d4
                          ^
                        cursor
   undo:  apply inverse of d3, cursor moves left
   redo:  apply d4 as written, cursor moves right
   new edit at cursor: d4 is deleted (the redo tail)
```

A step that replaces the whole campaign stores a snapshot record in place
of a delta. New, Load example, and Import diff to ops that contain the old
world and the new world, both unpacked. `saveCampaign` compares the length
of those ops as JSON with the stored save string it replaces, and when the
save string is shorter it stores `snapshot:` followed by that string. The
length comes from `jsonLengthWithin` in `StateDiff.js`, which stops as soon
as the count passes the save's length, so a replacing step never builds
the string of its ops. Over the example campaign plus 200 generated
regions, that string is about 21 million characters, and New saves in 11.5
ms where a full `JSON.stringify` of the ops takes 41.6 ms. Undo across a
snapshot writes the snapshot as the campaign, then stores the current save
string in a new record at the same position, so redo swaps the two back.
The save that records a snapshot passes `keepPrevious` to
`trySaveToLocalStorage`, so the image table keeps every picture of the
replaced campaign until the snapshot record references it.

`diffState` works on parsed state, so an inserted node arrives as every
tile with every default filled in, and a regenerated node arrives as one op
per changed tile field. `HistoryCodec.compactOps` rewrites the ops of each
node into the smallest of three forms. The first is the plain ops. The
second is one `node` op whose `f` and `t` are whole nodes in the save's own
form (`SaveManager.encodeHistoryNode`: packed tiles, then the tile codec),
which an inserted or removed node always takes. The third is one `fog` op,
used when every op of the node flips a tile's `revealed` flag, whose `t`
lists the tile ids the step reveals and whose `f` lists the ids it hides.
`invertOps` swaps both kinds like any other op, and `expandOps` turns them
back into plain ops before `applyOps` runs. Measured on the example
campaign:

| Step | Plain ops | Compact record |
| --- | --- | --- |
| Add a generated 48x48 region | 97,098 | 10,182 |
| Regenerate that region | 83,782 | 20,700 |
| Ten party moves on it | 4,209 | 495 |

A delta record is stored as `delta:` followed by the JSON op list. An app
version without the compact ops reads that prefix as an unreadable record
and takes its full load path. Read as a plain list, a `node` op would
insert an encoded node into its live state, and its next save would write
that node with most of its tiles gone. A bare JSON list still reads as
plain ops.

`applyOps` copies each container on an op's path once per call, keeps an
id-to-position map for each keyed list, and drops the removals from a list
in one pass at the end of the removal phase. The plain ops of a
regenerated node (about 2,700, of which 1,820 remove a tile) apply in 1.1
ms, and in 6.5 ms with a copy of the node list and tile list per op.

Delta records share `HISTORY_BYTE_CAP` (512 KiB), and `trimToCap` drops
the oldest records until the deltas fit. A record larger than the whole
cap stays as the only step, because `trimToCap` always keeps the newest
record. Snapshot records do not count against the cap. One snapshot of the
example campaign is about 800 KB, so counted against the cap it removes
every older step when it lands, and the next save removes the snapshot
itself. `storage/HistoryBudget.js` gives snapshots a budget of their own,
as pure arithmetic over record sizes. The newest snapshot is outside that
budget, because its write already succeeded. An older snapshot stays only
while it fits in the quota estimate (`QUOTA_BYTES`, 5 MiB) less the delta
cap, every key outside the log, and the newest snapshot. Records always
drop from the oldest end, because undo cannot reach a record past a gap.
The index lists the snapshot records in `snapshots`, so the budget reads
each record's size from the footprint ledger and never reads a record. An
index without the list counts every record as a delta.

New, Load example, and Import call `replaceIsUndoable` before their
confirm. It estimates whether the snapshot of the current save fits beside
the new save, the images that the new campaign adds, and the other keys.
When the snapshot does not fit, the confirm says that Undo may not restore
the current campaign and suggests an export (`SaveNotices.replacePrompt`).
The estimate uses the same 5 MiB model as the footprint warning. A browser
that allows more can still store a snapshot that the estimate calls too
large, so the text says "may".

Both header controls step the cursor and then reload. As a result, every
module re-initializes from the restored state through the ordinary load
path. Both controls grey out from `historyDepth` when that direction is
empty.

The storage layout uses one key for each record: an index at
`campaign-builder:history` that contains `{ version, log, deltas, cursor, snapshots }`, and
one `campaign-builder:history:d<seq>` for each record. A step is therefore
one small `setItem` call, instead of a rewrite of the whole log. Measured on
the example campaign, fifty party steps cost 27,304 bytes of log, where a
ring of ten full snapshots costs 699,980 bytes for ten steps, and a save
writes 70,488 bytes where the ring writes 139,996.

The log also serves cross-tab adoption. A tab calls
`historyPosition()` to get a token for the delta that its live state
reflects. The tab records this token each time its live state matches the
persisted save. When another tab saves, the follower calls
`planAdoption(held)`. The answer is the head delta's ops when the save is
exactly one delta ahead of the held position, `current` when nothing moved,
and `full` in every other case, where the follower then takes the ordinary
load path. The follower calls `planAdoption` on the `storage` event of the
save mark (`campaign-builder:save-mark`), not of the campaign key. Every save,
undo, and redo writes the mark last. The browser delivers one event per
write in write order, and at the campaign key's event the follower still
reads the old index, so a plan made there applies the previous delta and
shows each change one save late. When a mark write fails, `SaveFollower.js`
adopts on a one-second fallback timer. The `log` field of the index is a random
id. A fresh log draws a new id when its first delta lands. Sequence numbers
restart at zero after `clearHistoryLog`. A position token pairs the id with
the number, so a token from a cleared log matches nothing in the new log.

There is no base snapshot, because undo and redo only ever apply a delta to
the *current* state, so the canonical save already is the base.
The cap drops the oldest deltas, instead of folding them into a base that
needs a synchronous rewrite on every cap hit. A deferred idea, replaying a
base plus the log at load instead of writing the canonical save, would need
a base again.

The log's own rules keep it from corrupting the campaign that it describes:

1. **A delta is never migrated.** It was written against one schema version
   of `CampaignState`, so the index records `version`. A log
   stamped with any other version is discarded whole.
2. **Every history write happens after the campaign write**, on both the
   save path and the cursor-stepping path. As a result, the index can never
   describe a state that was not stored.
3. **A full origin degrades depth-first.** A record write that fails drops
   the redo tail first, which the new step discards anyway, then the oldest
   step, and retries after each. It drops the whole log if that also fails,
   and reports `{ ok, evictedAll }` either way. The report keeps undo from becoming
   single-step without notice. Reaching the ordinary byte cap is normal
   operation and reports no loss. The campaign write gets the same
   treatment: when it fails, `saveCampaign` passes `makeRoom` to
   `trySaveToLocalStorage`, which calls `dropForSave` and writes again.
   `dropForSave` removes the redo tail first, because the save drops it
   anyway, then the oldest step, one per call, and last any history key the
   index does not name. A campaign write therefore fails only when no
   history is left to remove. After a write that still fails, autosave in
   `app/campaignActions.js` waits for the next mutation instead of retrying
   on every poll, and it shows the error once until a write lands.

A diff needs the previous state as a *value*, not a string. `HistoryLog`
caches this value, stamped with the raw string it was parsed from and the
save mark stored with it. A tab that declined the cross-tab reload prompt
cannot diff against a save that another tab replaced, because a save from
another tab writes a new mark, and a new string fails the compare.

In the steady state the cache reads only the mark. While the stored mark
equals the cached one, the stored save is the cached string, so
`loadPersistedCampaign` skips the `getItem` of the whole save and the
string compare. `app/campaignActions.js` checks for another tab's write
the same way (`Autosave.markMovedOn`), so a steady-state autosave reads
the save string zero times, where a string compare reads it twice. A
missing mark tells neither side anything, and both fall back to the string
compare. Every write of the campaign key first removes the mark, so for
the time between the campaign write and the new mark, the old mark cannot
name a save that is gone. `writeSaveMark` also removes the mark when
its own write fails, and a follower ignores the removal event.

The cache is warm from the start of a session. `Campaigns.loadInitialCampaign`
reads the save through `HistoryLog.loadPersistedCampaign`, which parses the
stored string once and keeps the result as the base for the first delta.
`toTileGrid` adds those parsed nodes to the grid as they are, so the live
nodes and the cached nodes are the same objects, and the first save of the
session diffs by identity like every later one. A first save that parses
the stored string a second time and diffs two unrelated object trees costs
more than a hundred milliseconds at two hundred nodes.
A tab that adopts another tab's save calls `adoptPersisted` with its live
state for the same reason, because the full load path leaves the cache on
parsed objects that the reconciled live state does not share.

## The custom library store

The GM's custom library (equipment, creature, spell, and feat overrides)
persists separately in `storage/LibraryStore.js`, under its own localStorage
key (`campaign-builder:library`). As a result, New, Import, and Load example
never touch it.

The browser copy is the working state. `downloadLibrary` and
`readLibraryFromFile` round-trip this state through a portable JSON file,
and `fetchLibraryFile` seeds an empty browser from
`library/campaign-library.json` at startup. This file is committed with an
empty library, so the startup fetch never asks for a missing file. A
GM's export overwrites this file, and everything else under `library/` is
gitignored. `normalizeLibrary` (in `library/Library.js`) makes every load
tolerant, and it drops invalid entries instead of throwing an error. The
library file has no version field. A file written before the creature
merge has `bestiary` and `npcs` lists, and `normalizeLibrary` reads both
into the one `creatures` list on the way in.

A campaign export also includes the customs, as a `library` field beside the
save (see the pipeline above). On import, `libraryImportAction` in
`CampaignFile.js` decides what happens to the browser's customs:

| File `library` field | Browser customs | Behavior |
| --- | --- | --- |
| absent, empty, or malformed | anything | untouched, no prompt |
| present | empty | adopted silently |
| present | non-empty | the GM confirms; Replace adopts, decline keeps the browser library. The campaign imports either way |

An adopted library writes to the library key before the import's reload, so
the library wiring picks it up through its normal mount-time read. A quota
failure on that write falls back to importing the campaign alone, with a
toast. The standalone library export stays, because it is still the way to
move a library without a campaign and the file that seeds a fresh clone.

### Changing the spell or feat schema

Library data is versionless everywhere it is stored: the browser's library
key, the exported `campaign-library.json`, and the `library` field bundled
into a campaign export. All three pass through `normalizeLibrary` on read,
and none pass through `Migrations.js`. A schema change is therefore a
coercion change, never a migration step:

1. Update the type in `src/types/spell.ts` (or `feat.ts`). A new field is
   optional or has a stated default.
2. Teach `normalizeSpell` (or `normalizeFeat`) in `library/Library.js` to
   accept the new format, coerce the old format into it, and keep any
   original free text it cannot interpret. A throw here fails the load of the
   whole library, and a dropped entry deletes a record the GM wrote.
3. Update the editor form (`ui/SpellForm.js` / `ui/FeatForm.js`) to read
   and write the new field. The form assembles its draft through the same
   normalizer, so a typed entry and an imported one cannot disagree.
4. If characters keep copies of the record, give `Character.withDefaults`
   the same default. That side rides the campaign save and is covered by
   `deserialize`, not by the library gate.
5. Add `Library.test.js` cases: the new format passes through unchanged, the
   old format coerces, and garbage in the field coerces to the default.
6. Do not add a `Migrations.js` step, and do not bump `CURRENT_VERSION`
   for a library-only change. `state.library` never appears in a migration
   step, because the campaign chain does not own that field.

## File IO

Both stores' file paths route through `storage/fileIO.js`. Its
`downloadJSON` and `readFileText` functions are the only two places where
the app touches `Blob`, object URLs, or `FileReader`. New export and import
features call these functions instead of building the browser plumbing
again, so a Tauri desktop build swaps this one file for native dialogs and
the fs plugin.
