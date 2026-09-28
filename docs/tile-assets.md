# Tile assets

*Reference. To draw and register a new tile, follow
[Adding a tile](adding-a-tile.md).*

Built-in tile art lives under `assets/tiles/<type>/`. Each tile type has its
own subfolder: `grass/`, `forest/`, `mountain/`, `water/`, `desert/`,
`swamp/`, `snow/`, `hills/`, `farmland/`, one folder for each biome of the
climate model, for example `jungle/` and `deep-water/`, `road/`, `river/`,
`coast/`, `dock/`, `plaza/`, `interior/`, `town/` for the town buildings and
the town wall, and one folder for each POI marker, for example `settlement/`,
`castle/`, and `tavern/`. `src/map/TileCatalog.js` defines the catalog and
the paths that it expects, so anyone who adds or renames files reads
`VARIANT_COUNTS`, `ROAD_KINDS`, `RIVER_KINDS`, `COAST_KINDS`,
`DOCK_KINDS`, `MARKER_TYPES`, and `TOWN_BUILDINGS` in that file first. The interior
pieces, the furnishings, and the town wall pieces are in `INTERIOR_KINDS`,
`FURNISHING_KINDS`, and `TOWN_WALL_KINDS` in `src/map/TileKinds.js`.

## Terrain variants

Each terrain type has 3 variants, for example `grass-1.svg`, `grass-2.svg`,
and `grass-3.svg`. Mountain, snow-mountain, and badlands have 5, and taiga
has 4, because their landforms and trees are large and a range of 3
repeated layouts shows as rows. Plaza also has 5, and its variants differ
only in the worn stones on one shared cobble layout. `VARIANT_COUNTS` in
`TileCatalog.js` sets the count per type. `palette.pickVariant(type, rng)`
selects one so that adjacent tiles of the same type do not look identical.
The Build-mode palette uses it too. Its default terrain swatch for a type
is a `palette.anyVariant(type)` brush, which picks a new variant for each
painted cell. The variants abut
cleanly in the grid under these rules:

- All variants of a type use the same background fill color. `farmland`
  reuses the grass background, like `road`, so fields abut grass tiles
  around settlements.
- Decorative details, for example grass tufts, trees, rocks, and sparkles,
  stay inset from the tile edges. No decorative detail touches or crosses a
  border.
- The one exception is a motif that crosses an edge, which a type can include
  if the motif is identical across all variants of the type and continuous in
  geometry at the borders.

  A *periodic path* is one type of edge-crossing motif. Desert's dune crests
  and the mountain mid-ground ridge band are periodic paths. The path
  passes through the same point with the same tangent at x=0 and x=64, for
  example as a `Q .. T ..` chain whose period divides 64.

  Water has no edge-crossing motif. Its wave crests are inset stamps,
  because a wave row that crosses every edge joins the rows of the
  neighboring tiles and draws unbroken stripes across open water.

  A *wrapped stamp* is the other type: forest's edge-canopy clusters and
  mountain's edge outcrops. A wrapped stamp is a `<use>` element that
  straddles a border, and the tile duplicates it at the opposite border with
  the same transform plus a 64-unit offset. Anything that crosses x=0 repeats
  at +64, anything that crosses y=0 repeats in the same way, and a corner
  repeats at all four positions.

  Wrapped-stamp centers sit a few units off the border line, and their
  shapes and offsets vary per edge, because identical stamps that sit
  exactly on every border form a straight row at each shared edge and the rows
  read as a 64-pixel lattice across the whole map.

  Either type of motif lets any variant abut any other variant without a
  visible join, provided the motif does not vary between variants. Variants differ
  only in their inset details.
- Variants differ only in the count, placement, and arrangement of inset
  details, never in background color or overall tone.
- Reusable elements, for example a grass tuft or a tree, are defined once in
  `<defs>` and stamped with `<use href="#id" transform=...>`. The canvas
  `drawImage` method draws these correctly.

## Road connector pieces

Road tiles are not random variants. Each road tile is a distinct connector
piece, and `palette.getRoadPiece(kind)` looks one up by name: `h`, `v`,
`cross`, the four `corner-*` pieces, and the four `end-*` (dead-end stub)
pieces. The autotiling code picks the piece whose open edges match the
neighboring road tiles. All road pieces share:

- The same background fill as `grass`, because roads are grass-adjacent
  terrain rather than a separate background color, and a mismatch here shows
  as a visible line where road tiles meet grass tiles.
- The same path stroke width and the same centerline position, so the path
  of a straight piece lines up with the path of a corner or cross piece at
  the shared edge.

## River connector pieces

Rivers follow the same pattern as roads. `palette.getRiverPiece(kind)` looks
up the same fifteen connector kinds. Rivers are painted as transparent
overlays (`overlayRef`), so a channel can cross grass, sand, or snow.

Four more pieces show a road across a straight channel. `bridge-h` and
`ford-h` take an east-west road across a north-south river, and `bridge-v`
and `ford-v` take a north-south road across an east-west river. Each
crossing piece draws its own copy of the road, so it replaces both the
river piece and the road piece of its cell.

## Coast transition pieces

`coast/` contains twelve shoreline pieces, found through
`palette.getCoastPiece(kind)`:

- Four straights (`n/s/e/w`), named for the edge whose half is water.
- Four outer corners (`corner-ne/nw/se/sw`). Water wraps the two named edges
  around a land tip.
- Four inner corners (`inner-ne/nw/se/sw`). Water fills only the named
  quadrant, the inside of a turn in a bay.

Like roads and rivers, coast pieces are transparent overlays
(`isOverlayType`). The water side uses the water terrain base color
`#33719f`, with a wavy `#c2a36c` sand strand and an `#8ac2e6` foam line, and
the land side is fully transparent. The terrain beneath, for example grass,
desert, snow, or mountain, supplies the shore color, so one set of twelve
pieces serves every biome and no piece is needed per combination of water
and another terrain.

## Dock pieces

`dock/` contains ten pier and quay pieces, found through
`palette.getDockPiece(kind)`. They are overlays with a transparent ground,
like the coast pieces, so one set serves every water variant and every
shore biome.

- `pier-v` and `pier-h` are straight runs of pier over a water tile.
- `pier-head-n/e/s/w` end a pier with a wide landing, two bollards, and a
  moored rowboat.
- `quay-n/e/s/w` go on a shore tile, on top of the straight coast piece
  of the same name. A wharf deck covers the waterline, a street comes in
  from the land edge, and the pier leaves by the water edge.

A pier head and a quay are both named for the side that the pier runs out
to, so `quay-n` goes over `coast-n` and `pier-head-n` ends a pier that
runs north.

Every piece uses one cross-section: a `#8a6f4a` deck 16 units wide,
centered on the tile, between two `#5f4529` stringers, with `#6f583a`
plank joints on a 4-unit period and `#4a3a26` pile heads on a 32-unit
period. The deck and the timber colors are the ones of `river-bridge-h`.
A pier crosses the tile edge at the same place on every piece, so a
straight run joins its quay and its head. The street of a quay matches
`road-v` or `road-h` at the land edge. The shadow is a soft `#1f3b4d`
contact pad around the footprint of the timber, with no offset in any
direction, so a piece can turn a quarter turn and its shadow still fits.
The `e`, `s`, and `w` pieces are the `n` piece turned inside a
`rotate` group, and `pier-h` is `pier-v` turned the same way.

No dock piece has a rule meaning, so each one is `plain` and the party can
walk out along a pier. When a GM paints a dock piece, it stacks over the
coast and road pieces of its tile (see `stackOverlay` in
`src/map/TilePaint.js`).

## POI markers

Single-image markers (`MARKER_TYPES`) sit on the standard grass background
(`#5a9b4a`), with the usual mottle ellipses and a dirt clearing under the
building, so each marker abuts grass terrain without a visible join. All building
art stays inset from the tile edges.

The set covers `settlement`, `dungeon`, `castle`, `tavern`, `inn`,
`blacksmith`, `general-store`, `alchemist`, `temple`, `shrine`,
`wizard-tower`, `academy`, `barracks`, `ruins`, `cave-entrance`, `mine`,
`port`, `farm`, `graveyard`, `camp`, `standing-stones`, `village`, `city`,
`oasis`, `lighthouse`, and `watchtower`. The `lighthouse` fills its south
half with water like the `port`.

`dungeon` is the one marker with a stone background instead of grass. Every
other marker sits on grass, and a new marker does too.

A marker on desert or snow shows a square of grass, which reads as an oasis
in the desert but not in the snow. A set of markers with transparent
backgrounds, drawn as overlays over the terrain, would remove this limit.
The catalog has no such set.

## Town pieces

`town/` contains the town buildings (`TOWN_BUILDINGS`): `house`,
`cottage`, `market`, `well`, `fountain`, `town-hall`, `guildhall`,
`bakery`, `warehouse`, `stables`, `windmill`, and `watermill`. Each one is
a marker on the grass background, drawn to stretch over a 2x2 block, and
the town generator paints it at span 2.

The town wall pieces (`TOWN_WALL_KINDS`) are overlays with a transparent
background, and `palette.getTownWallPiece(kind)` selects one by kind.
`wall-h` and `wall-v` are straight runs, and every detail repeats on an
8-unit period, so a run joins at the tile edges. `gate-h` takes a
north-south street through an east-west wall, and `gate-v` takes an
east-west street through a north-south wall. Each gate draws its own copy
of `road-v` or `road-h`, so it works with or without a road overlay under
it. `water-gate-h` and `water-gate-v` take a river under the wall in the
same way, and each one draws its own copy of the river so it joins the
river tiles on both sides. Like the interior wall corners, each corner is named for its two open
edges, so `wall-corner-se` connects south and east and caps the north-west
corner of a ring. The straight pieces and the corners have the rule meaning
`wall`, so the party cannot stand on them. The gates and the water gates
are `plain`.

## Interior pieces

`interior/` contains building-interior tiles, for example castle halls and
shops, and `palette.getInteriorPiece(kind)` selects one by kind in the same
pattern as road pieces. Every piece except the cave pieces shares one
flagstone floor base: fill `#a89f8d` with a `#8f8776` grout grid on a 16-pixel pitch. This base
includes half-width grout strokes centered on the tile edges, so the grid
continues across any shared edge. The kinds are:

- `floor-1` through `floor-3`: floor variants. They differ only in inset
  cracks, pebbles, and tinted inner grid cells, and no tint touches a tile
  edge.
- `wall-h`, `wall-v`, and `wall-corner-*`: a 16-pixel stone wall band
  centered on the tile. These pieces share one cross-section: fill
  `#6f6a60`, dark `#4c4841` edges, a `#55514a` course line, and an `#8a857a`
  highlight one unit inside the top or left face, which lets straight pieces
  and corner pieces join cleanly. Corner names describe the open edges, so
  `wall-corner-ne` connects north and east and caps the south-west corner of
  a room.
- `wall-tee-*` and `wall-cross`: three-way and four-way junctions on the same
  cross-section. Like the road tees, a tee is named for its single arm, so
  `wall-tee-n` runs east-west with a branch to the north.
- `door-h` and `door-v`: a wall with a framed wooden door leaf in the gap.
- `stairs-up` and `stairs-down`: treads that lighten toward the top and
  darken toward the bottom, with a direction chevron.
- `cave-floor-1` and `cave-floor-2`: rough rock floor variants for a cave.
- `cave-wall`: one rough rock piece for every wall cell of a cave. It has
  no connector kinds, because a cave wall has no straight runs to join.
- `cave-mouth-h` and `cave-mouth-v`: the way into a cave from the map
  border, with rock on both sides of an open passage. `cave-mouth-h` takes
  a passage north-south, like `door-h`.

## Furnishings

The furnishings are also in `interior/`, and `palette.getInteriorPiece(kind)`
selects them too, but their palette type is `furnishing`. Each one has a
transparent ground and draws as an overlay on a floor tile.

| Kind | Meaning | Where the generators put it |
| --- | --- | --- |
| `altar` | `plain` | A castle chapel, and some dungeon rooms |
| `chest` | `plain` | The farthest cell of the bottom level of a dungeon or a cave, and some storerooms |
| `pillar` | `obstacle` | Two rows in some large dungeon rooms and in the great hall of a castle |
| `throne` | `plain` | The north wall of the great hall of a castle |
| `bed` | `obstacle` | A bedroom |
| `table` | `obstacle` | A dining room, and the room behind the door of a building |
| `hearth` | `plain` | The north wall of the room behind the door of a building |
| `bookshelf` | `obstacle` | The north wall of a library |
| `barrel` | `plain` | The corners of a storeroom |
| `rubble` | `plain` | Random floor cells of a dungeon or a cave |
| `pool` | `plain` | Small groups of cells in a cave |
| `trapdoor` | `stairs-down` | No generator puts it. A GM paints it over a floor. |

## Rule meanings

Interior pieces and furnishings are the only art that the game rules read.
`INTERIOR_KINDS` and `FURNISHING_KINDS` in `src/map/TileKinds.js` list each
piece with its meaning, and the rest of the app asks for this meaning
through `tileKind(tile)`. The party cannot land on a `wall` or an
`obstacle`, and a new link does not go on one. A `door` is the authored way
into a space, and the stairs connect one level to the next. A piece without
a meaning reads as `plain` scenery that the party can walk across.

`tileKind` reads the overlays of a tile before its base image. The topmost
overlay with a meaning other than `plain` decides, so a pillar on a floor
is an obstacle and a trapdoor on a floor leads down like `stairs-down`. A
`plain` furnishing, such as a chest, leaves the meaning of the floor under
it. `kindOf(imageRef)` gives the meaning of one image.

## Registry tables

`src/map/TileCatalog.js` defines one table per tile family, and a tile
exists for the app only when its family table names it. The two interior
tables are in `src/map/TileKinds.js`, beside the rule meanings.

| Table | What it registers |
| --- | --- |
| `VARIANT_COUNTS` | How many variants each terrain type has |
| `ROAD_KINDS` | The fifteen road connector kinds |
| `RIVER_KINDS` | The fifteen river connector kinds, two bridges, and two fords |
| `COAST_KINDS` | The twelve shoreline pieces |
| `DOCK_KINDS` | The ten pier, pier head, and quay pieces |
| `MARKER_TYPES` | The single-image POI markers |
| `TOWN_BUILDINGS` | The span-2 town buildings |
| `TOWN_WALL_KINDS` | The ten town wall, gate, and water gate pieces |
| `INTERIOR_KINDS` | Each interior piece with its rule meaning |
| `FURNISHING_KINDS` | Each furnishing with its rule meaning |

`addCustom` registers a tile that a GM loads at runtime. A runtime tile is
not in these tables and cannot override a built-in one.
