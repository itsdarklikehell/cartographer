# The map

*Explanation. Back to the [architecture overview](../architecture.md).*

The map is a tiled world that the GM paints in Build mode and the party
explores in Play mode. A small data model of nodes and tiles sits underneath
it, and the hierarchy, regions, drawing, fog of war, and party movement all
build on that model, so the first section applies to every later topic.

## Nodes and tiles

Both types of the model are declared in `src/types/map.ts`:

- A **Tile** is one square of a map. It has an id, an art reference
  (`imageRef`), an optional overlay, a `revealed` flag for fog of war, and
  metadata such as a point-of-interest label.
- A **MapNode** is one whole map: a rectangular grid of tiles, plus a name, a
  kind (`'world'`, `'region'`, or `'interior'`), and dimensions.

There is no separate "world" type, "region" type, or "dungeon" type. A world
map, a region inside it, a town inside that region, and a dungeon under the
town are all MapNodes, and the difference between them is how they connect.
They connect in two directions at once, because each node has a `parentId`
that points up at the map that contains it, and a tile can have a
`childNodeId` that points down at another node. A click on that tile in Play
mode means "zoom in here, and you get that map."

A concrete example, using the names from the example campaign:

```
  world (MapNode, kind: 'world')
    |
    |  tile "3,4" has childNodeId: 'darkwood'
    v
  darkwood (MapNode, kind: 'region', parentId: 'world')
    |
    |  tiles "1,2" and "2,2" both have childNodeId: 'barrow'
    v
  barrow (MapNode, kind: 'interior', parentId: 'darkwood')
```

The world map has a tile at position (3,4) that zooms into the Darkwood
region. Inside Darkwood, two adjacent tiles both zoom into the same barrow,
which is legal and common, because a large landmark can occupy several tiles
of its parent map and any of those tiles takes the party inside.

The model has no separate "region" entity to keep in sync with the tiles. A
region is only a MapNode that one or more tiles point at through
`childNodeId`.

### TileGrid, the node registry

`TileGrid` (`src/map/TileGrid.js`) contains all the nodes: a `Map<id, MapNode>`
with helpers that add, get, and update nodes, walk the `parentId` chain to
build a breadcrumb, and resolve a tile's zoom target.

Cross-tab sync depends on `replaceNodes`, which swaps out the entire
registry's contents but keeps the grid *object's* identity. Several
long-lived objects (the navigator, the party tracker, the canvas) each keep a
reference to the grid they were constructed with, so when another browser tab
saves the campaign, the running tab adopts the new campaign by replacing the
grid's contents in place, and none of those objects need a rebuild or a new
reference.

### Grid coordinates

A tile's id doubles as its position. Tiles placed in a grid use `"x,y"` as
their id, for example `"3,4"` for the tile at column 3, row 4, so there is no
separate x/y field to keep consistent with the id.

The pure functions `parseCoords`, `tileRect`, and `screenToTile` in
`src/map/MapGeometry.js` convert between grid coordinates and screen pixels.
Anything that needs a tile's position parses its id.

Grid-aware code skips ids that do not match the `"x,y"` pattern (see
`RegionGroups.findRegionGroups` for an example), because the hierarchy tests
use fixture nodes with ids such as `"entrance"`, and grid logic leaves them
alone instead of failing on them.

## Region grouping and multi-tile art

As the barrow example above showed, a region can have more than one entry
tile. Any set of tiles that share the same non-null `childNodeId` and are
contiguous (touching along an edge, not only at a corner) forms one **region
group**, which is what counts as one landmark.

`RegionGroups.findRegionGroups(node)` (`src/map/RegionGroups.js`) computes
these groups. It is a pure flood-fill over the node's tiles, and for each
group it returns:

```js
{ childNodeId, tileIds, cells, minX, minY, maxX, maxY }
```

`cells` lists each member tile's parsed grid coordinates, in the same order
as `tileIds`, so downstream code never needs to parse the ids again. `minX`
through `maxY` describe the group's bounding box.

Multi-tile regions need no schema change, because multiple tiles have the
same `childNodeId` value and the model derives the grouping from that.
`MapCanvas` recomputes the groups every time a node loads, and draws a tint
plus an outline over each group's bounding box, with an optional label for
the region's name through a `getNodeName` callback.

### Group images

On outdoor maps (`kind: 'region'`), a multi-tile region group also changes how
its art draws. Instead of each tile drawing its own small image, the group
draws as larger scaled images, so a two-by-two castle looks like one castle
instead of four copies of a castle tile.

`groupImageChunks(node, group)` does the partitioning. It splits a
filled-rectangle group into chunks of at most 2x2 tiles, and each chunk draws
one image stretched across its block. The image chosen for a chunk
(`groupImageRef`) is the art of a tile marked as a point of interest, if the
chunk has one, and otherwise the top-left-most tile's art.
`MapRenderer._renderGroupImages` draws these chunks, and the ordinary
per-tile pass then skips the base images of the covered cells.

Fog rectangles and path overlays draw per tile even here, on top of the
stretched image, so a partially explored block reveals piece by piece and a
road that runs through a region stays drawn at tile size instead of
stretched with the landmark art.

Groups that are ragged (not a filled rectangle), and groups on interior
maps, keep plain per-tile drawing.

### Spans

Independent of region links, a single tile can have an optional `span`. The
Build palette's Size row sets it (2x or 3x), and `paintTile(node, tileId,
imageRef, overlay, span)` records it. A spanned tile's image draws stretched
across a span-by-span block anchored at that tile, and near the right or
bottom edge of the map the block shifts up or left as needed to stay in
bounds.

`spanBlocks(node)` in `TilePaint.js` lists these blocks with pure geometry,
and `MapRenderer._renderSpanImages` draws them right after the region-group
chunks. Span blocks feed the same "covered cells" set, so the per-tile pass
skips the base images underneath, while fog and overlays stay per tile, the
same as with group images.

Unlike a region chunk, span art draws on interior maps too, and the covered
cells keep their own tile data untouched. The span is only a drawing effect
of the anchor tile, so a repaint of the anchor at 1x clears it.

## Drawing and input

The canvas code splits so that each file owns one concern:

```
  MapCanvas (src/map/MapCanvas.js)
    owns the <canvas> and the view state: node, pan/zoom,
    markers, selection
    |
    +-- MapRenderer ......... terrain / fog / grid / region passes
    |     +-- TileRaster ....... tile art, rasterized once per drawn size
    |     +-- MapMarkers ....... party, encounter, NPC, token markers
    |     +-- MapDecorations ... cursor, marquee, selection, POI,
    |                            coordinate chrome
    |
    +-- MapCanvasPointer .... right-drag/touch pan, cursor-anchored wheel
    |                         and pinch zoom, authoring strokes, hover
    |                         tracking, context click
    +-- MapCanvasKeyboard ... arrow-key cursor, Enter/Space activation,
                              +/- zoom, focus outline
```

`MapCanvas` is the host. The renderer and decoration modules read the view
state and draw, and the two input controllers (pointer and keyboard) change
the view state back through the host reference.

Every drawing layer takes its colors from `INK` in `src/map/CanvasInk.js` and
its captions from `src/map/CanvasText.js`. Canvas accepts a color string, not
a CSS custom property, so the map cannot read the stylesheet's tokens, and
`INK` is the canvas side of that vocabulary, with one named entry per role,
so a color two layers share is written once. `CanvasText` defines the label
rule that the coordinate digits, character names, exit labels, and region
names share: `labelSize(size, { factor, min, max })` scales a font from the
on-screen tile size, and `drawPlatedLabel(ctx, text, x, y, opts)` sets the
font and alignment, draws the pill or rectangle behind the text, and restores
the context. Each caller keeps its own scale, because the bounds differ by
what the label sits over, so coordinate digits run large on empty canvas and
a character name stays small over tile art.

For each tile, the draw pass draws a fog rectangle if the tile is not
revealed and otherwise draws the image at `tile.imageRef`. The group, span,
and marker passes described elsewhere on this page add to that base.

Tile art does not come straight from the SVG file. `TileRaster`
(`src/map/TileRaster.js`) draws each image ref once into an offscreen canvas
at the size the map draws it, and every later frame copies those pixels. A
canvas re-rasterizes an SVG on every `drawImage` call, and Build mode draws
every tile in the node, so drawing the vector art directly costs about 1,600
rasterizations per frame on a 40x40 map, or 769 ms of script for one paint
stroke across the example world, where the raster cache costs 29 ms.

The raster is the same size as the tile on screen, down to the pixel. A
raster rounded up to a power of two, which would keep fewer rasters, averages
away the hairline strokes in the art, such as the grid lines on grass and
the ripples on water, and the whole map goes flat at the zoom that fits it
on screen. A destination wider than 256 pixels skips the cache and draws the
vector art, so one large landmark stays crisp at high zoom, and the cache
drops itself once it reaches 32 MB.

`MapRenderer._renderCellGrid` draws the one-pixel grid along the cell
boundaries as its own pass. The SVG rasterizer leaves the outermost pixel row
of each tile partly transparent, so tiles drawn from vector art show the dark
map backdrop through at every boundary as a natural grid, while a cached
raster fills those pixels and shows none, and the pass restores the line. It
is clipped to the revealed cells, because a flat fog rectangle never shows
the backdrop through and so never shows a grid. Where tiles still draw from
the vector art, which is the PNG export and any zoom past the raster size
ceiling, the natural boundary is present, so the pass skips itself rather
than darken every boundary with a second line.

A pointerup counts as a tile click only if the total drag distance stays
below a small threshold, because without that check a pointer that ends a
pan gesture on a region tile also zooms into it.

**Navigation** is pure logic with no DOM. `MapNavigator`
(`src/map/MapNavigator.js`) tracks which node is currently in view, and
exposes `zoomIn(tileId)`, `zoomOut()`, `goTo(nodeId)`, and `getBreadcrumb()`
over a `TileGrid`. The canvas's `onTileClick` callback and the breadcrumb's
click handler (`ui/Breadcrumb.js`) both call into a navigator and redraw the
view, and because the navigator has no DOM dependency, plain unit tests cover
all of the zoom and breadcrumb behavior.

## The tile catalog and generation

`TilePalette` (`src/map/TilePalette.js`) is the built-in tile catalog, built
from the family tables in `src/map/TileCatalog.js`. It distinguishes terrain
variants from connector pieces:

- Terrain types (grass, water, mountains, and other kinds) have multiple
  interchangeable variants, so a painted field does not look like a
  wallpaper pattern. `pickVariant(type, rng)` chooses one, and takes the
  random number generator as an argument so tests can pass a deterministic
  one.
- Road pieces are named connector pieces (a straight, a corner, a tee), not
  random variants. `getRoadPiece(kind)` looks one up by name.

Callers can register custom tiles with `addCustom`/`removeCustom`. Custom
tiles cannot override built-in tiles, so they only extend the catalog.

A few pieces of art mean something to the rules, not only to the eye: the
party cannot stand on a wall or on an obstacle such as a pillar, a door is
the authored way into a space, and stairs and trapdoors connect one level to
the next. `src/map/TileKinds.js` is the only place in the code that knows
this. `kindOf(imageRef)` says what one image means, and `tileKind(tile)` says
what a whole tile means: the topmost overlay with a meaning decides, and the
base image decides when no overlay has one. `kindOf` matches whole
references against the catalog instead of looking for a word in a file
name, so a GM's own art called `interior-wall-h.svg` stays plain art and
renaming a built-in asset cannot quietly change where the party can walk.
A town wall segment and a corner tower are walls too, and a gate and a
water gate are `plain`, so a landing or a new link can go on a gate but
never on the wall beside it. Everything outside the interior, furnishing, and town
wall sets (terrain, markers, custom images) is `plain`.

`Autotile.js` (`src/map/Autotile.js`) handles the detailed part of generated
terrain. It picks connector overlay pieces, so that coastlines, rivers, and
roads join up visually. It is pure and RNG-injected, like the palette:

- `smoothCoastline` widens water until every shore outline matches a coast
  piece in the art set.
- `coastOverlays` and `coastKind` name the shoreline overlay for each land
  cell along the water.
- `ArmNetwork` records which edges of each cell a river or a road crosses, and
  `connectorKind` names the piece for a set of edges. A network stores edges,
  not covered cells. Two rivers that run side by side then stay two rivers,
  because a piece picked from the neighbor cells would join them.

### Climate model

The open-terrain archetypes (wilderness, highlands, frontier, desert,
wetlands, and island) share one climate model in
`src/map/GeneratorTerrain.js`. Seeded value noise from
`src/map/GeneratorNoise.js` gives three fields over the map: elevation,
moisture, and temperature. `classifyBiome` turns the three values of a cell
into a biome. Elevation decides water, hills, and mountain first. Then
temperature decides cold biomes, and moisture decides between desert, grass,
forest, swamp, and jungle.

Each archetype is a profile in `TERRAIN_PROFILES`. A profile gives the share
of the map that is water, hills, and mountain, a warmth and a wetness, and
how much colder the north edge is than the south edge. The water, hill, and
mountain lines come from quantiles of the elevation field, so a profile that
asks for 12% water gets about 12% on every seed. An island profile lowers
the land toward the edges and puts the whole border under water.

Each biome has its own tile art, and `BIOME_TERRAIN` gives each biome a
terrain class, for example forest for jungle and mountain for volcanic. The
generator rules read the class, so a road avoids a volcanic peak as it
avoids any mountain. `terrainTiles` draws the biome art of a cell while the
cell keeps the class of its biome. A cell that a later step changes, for
example to farmland or to a pond, draws with the art of its new class.

Noise features scale with the map, at about one feature per nine tiles. A
large map then gets more lakes and ranges, not larger ones.

`src/map/GeneratorRivers.js` traces rivers after the coastline is smoothed.
A river starts on the hills or at the foot of a range, and each step goes to
the lowest free neighbor. A step can climb 0.02 of the elevation range, so a
river crosses small ripples in the noise. A river ends where it meets water,
leaves the map, or reaches another river. A river that meets another river
joins it as a tee, or as a cross where the other river has a tee. The head
of the river joins every river cell beside it, so no two channels run side
by side without a join. A head beside a river and water both joins the
river and drains into the water. A river with no lower ground left ends in a pond, and the
pond cell becomes water.

### Sites and roads

After the rivers, `src/map/GeneratorSites.js` places the sites of an
outdoor map. A site is a place that people built: a settlement, a keep, or
a dungeon. Each site marks one tile with a marker and names the archetype
of its own map (`town`, `castle`, or `dungeon`). `siteCounts`
sets how many of each a map gets, from one settlement on a small map to
five settlements, a keep, and a dungeon on a vast map.

A settlement prefers grass near a river or a lake. A settlement with at
least four water cells within two cells of it becomes a port. The first
settlement takes the best spot, and on a map of 32 cells or more it draws
as a city. Each later settlement draws as a village with a chance of one
in two. The keep prefers the foot of the hills, and the dungeon stands as far from the
settlements as it can. No site stands on a river, on a shoreline, or within
two cells of the border. The marker then hides no overlay, and a road can
reach the site from every side. Grass around each settlement turns into
farmland at random.

`src/map/GeneratorRoads.js` routes roads with an A* search. Each terrain
type has a step cost in `ROAD_COST`, and a type that is not in the table,
such as water or mountain, takes no road. A step along an existing road is
cheap, so a new road joins the old one instead of running beside it. A
road crosses a river only over a straight channel, and it leaves the river
cell in the direction it entered, because the crossing pieces (`bridge-h`,
`bridge-v`, `ford-h`, and `ford-v`) have only a straight channel. For this
rule the search state is a cell plus the direction of entry.
`fordCrossings` in `src/map/GeneratorWilds.js` picks the crossings that
draw as a ford: each crossing more than three cells from every settlement.

`connectSites` joins the settlements and the keep as a minimum spanning
tree. Then it runs one road off the map edge, and a map of 32 cells or more
gets a second exit far from the first. The dungeon gets no road. The first
exit becomes the entry of the map. A map with no exit, such as an island
with its whole border under water, enters at the bottom-center border tile.

### Town layout

`planTown` in `src/map/GeneratorTown.js` plans a town with no tiles, and
`generateTown` draws the plan with `terrainTiles`, the same function that
draws the outdoor maps. The core of the town is the square of cells within
about three tenths of the map side from the central crossroads.

A town has a river with a chance of three in five. `townRiver` runs it from
one edge to the opposite edge, at least two cells from the center row and
column. The river moves one cell to the side at random, but never on two
rows in a row. So each bend has a straight channel beside it, and a bridge
fits on a straight channel. In a town of 22 cells or more, the river also
keeps clear of the first ring that the wall tries. It never runs along a
side of that ring and never bends on it, so where it meets the ring it
goes straight through.

The streets use `routeRoad` with a `turn` cost of 0.6 for each bend, so a
street on open grass runs straight. The `heading` argument counts the first
step too, so a street that starts on the map edge goes straight into the
map. The first street runs from the south edge to the crossroads, and its
border cell is the entry. Each later street runs from another edge to the
nearest street. A town of 14 cells or more has three ways out, and one of
22 cells or more has four. In a town of 14 cells or more, about one lane
for each five cells of map side then runs from open ground in the core to
the nearest street. A town of 8 cells gets no lane, because a lane there
can take the ground that the three core buildings need.

The plaza paves the cells within one cell of the crossroads, or within two
on a map of 32 cells or more. The plaza cells get no street overlay, so the
streets open onto the cobbles.

`placeBuildings` in `src/map/GeneratorTownBuildings.js` puts the buildings
on the plan. Each building fills a 2x2 block of open ground beside a street
or the plaza, and draws with span 2. When no such block is free, a building
takes the nearest free block off the streets. `buildingList` gives the
main set, which has one building for each thirty cells of map area and
never fewer than three. The core set (inn, tavern, blacksmith, general
store, and temple) takes the blocks nearest the crossroads, so the example
campaign finds its innkeeper, smith, and priest in each medium town. The
civic set comes next: a well or a fountain, and on a map of 22 cells or
more a market and a town hall.

A town of 14 cells or more then gets a watermill on a block beside its
river, beside a street when one is free. It also gets a graveyard at the
edge of the core with a chance of three in five. Both go before the rest
of the main set, because the extras and the homes of a large town take
every block beside the river and at the edge of the core.

Extra buildings from `EXTRA_BUILDINGS` then take half of the remaining
slots of the main set, and homes take the rest. A town that wants more
extras than there are kinds repeats the list in a new random order, so
each kind appears once before any kind appears twice. A home is a house
near the crossroads and a cottage near the edge of the core. Outside the
core, one farm for each ten cells of map side takes a block, and noise
turns patches of the open ground into farmland. Then a windmill takes the
outlying block with the most farmland in the ring of cells around it.

A town of 22 cells or more gets a wall with a chance of one in two.
`planWall` in `src/map/GeneratorTownWall.js` tries the rings from
`wallRadii`: a square ring one cell past the core, then two cells past,
then on the core edge. `planTown` passes the first radius to `townRiver`,
so a river town gets a wall about as often as a dry town. It plans the
wall after the streets and before the buildings, so no building covers the
wall. `wallRing` refuses a ring where a street or the river meets a
corner, runs along the wall, or turns on it, because a gate piece takes
only a straight street and a water gate piece takes only a straight river.
It also refuses a ring where a street crosses the wall on a bridge. A town
whose streets or river fit no ring gets no wall. `generateTown` draws each wall
piece as the overlay of its cell, and a gate piece replaces the street
overlay under it, because the gate art draws its own street. A water gate
replaces the river overlay in the same way.

### Interior layouts

Each interior generator carves a flat array of cell codes: void, floor,
wall, and a door in a horizontal or a vertical wall. The helpers in
`src/map/GeneratorInteriorMask.js` finish the mask. `wrapWalls` turns each
void cell beside floor into wall, in all eight directions, so no floor cell
touches the void. `maskTiles` then gives each floor cell a random floor
variant and each wall cell the piece from `wallKind` that joins the walls
and doors beside it. A void cell gets no tile. A door counts as part of the
wall around it, so the wall pieces on each side of a door join through it.

A dungeon level (`src/map/GeneratorInteriors.js`) places rectangular rooms
that do not touch. About one room in three with sides of five cells or more
trims its corners and reads as round. Rooms grow with the map. `roomLinks`
joins the room centers with a minimum spanning tree, plus about one loop
for every seven rooms between near rooms that the tree does not join. Each
corridor bends once, and a coin toss picks the order of its two legs.

A cave level (`src/map/GeneratorCave.js`) grows with a cellular automaton.
Each cell starts as rock with a chance of 0.45. In each of four rounds, a
cell with five or more rock neighbors turns to rock, and a cell with three
or fewer opens. Only the largest connected cavern stays, through
`largestArea` in `GeneratorInteriorMask.js`. The generator tries again when
the cavern covers less than a fifth of the map, up to six tries, and keeps
the largest cavern of all the tries. When that cavern has fewer than
`MIN_CAVERN` (nine) cells, a room of three by three cells in the middle
takes its place, so every level has room for both of its stairs. A cave draws
with `CAVE_ART` from `GeneratorInteriorMask.js`: cave floors, one rough wall
piece for every wall cell, and a cave mouth in place of the border door.

A dungeon level and a cave level finish the same way, in `finishLevel`. A
stairs level puts its stairs up on the `up` cell of its layout. An edge
level has no level above it, so it gets no stairs up. It cuts a straight
tunnel from the `up` cell to the nearest border and sets a door there.
`interiorExits` in `MapExits.js` accepts a door on the border as a way out,
so the party can walk back to the parent map. The stairs down go on the
cell farthest from the way in by walking distance. The way in is the
border door of an edge level and the stairs up of a stairs level. A walk
from the door keeps the stairs down of a one-room level out of its tunnel.
The stairs down of a level lead to the level below through `childNodeId`.
The level lists a forced site for that level, and `expandTree` builds it
(see [Nested generation](#nested-generation)).

A castle and a building (`src/map/GeneratorHalls.js`) fill the whole grid
with a wall ring and a door in the middle of the south wall. `hallLayout`
splits the floor by binary space partition. Each split draws a wall across
one room, with one door in it, and each half can split again. The split
cuts the longer side, so rooms stay near square. A new wall never ends
beside a door in the wall around its room, because that wall would block
the door from one side. A castle keeps rooms of at least three cells a side
and has stairs, and a building keeps rooms of at least two cells a side,
with no stairs. The stairs up of a castle lead to its upper floor, which
`generateUpperFloor` lays out with the same splits and no door. Its stairs
down sit in the corner above the stairs up of the keep and are its entry.
The stairs down of a castle lead to one dungeon level. They go in the last
room, on the first cell that `stairsCell` accepts, with the corners first.
`stairsCell` refuses a cell beside a door, because a click on a linked tile
always follows the link and the party could never walk through that door.
It also refuses a cell whose loss cuts any floor off from the south door.
A building has a cellar with a chance of `CELLAR_CHANCE` (three in ten).
Its trapdoor goes on the floor cell farthest from the door that
`stairsCell` accepts. The building picks that cell before the furnishings,
so no obstacle goes beside it, and a building with no cellar leaves the
cell bare. The `cellar` archetype in `MapGenerator.js`
generates the cellar as a small dungeon level that the party enters by its
stairs up.

Each interior generator then furnishes its map through `src/map/GeneratorFurnish.js`.
A furnishing is an overlay on a floor tile, and `furnisher` refuses a cell
where it does not fit. An obstacle, such as a pillar, a table, a bed, or a
bookshelf, never goes beside a door or a staircase. The furnisher also walks
the level from the way in after each obstacle and takes the obstacle back
when a floor cell becomes unreachable. The walk never crosses a staircase,
so an obstacle cannot leave a staircase as the only way to a cell. A castle
puts a throne and two rows of pillars in its largest room. The other rooms
of a castle each get a role at random: a bedroom, a dining room, a library,
a storeroom, a chapel, or an empty room. A building takes its layout from
its environ, which a town sets for each building (`BUILDING_INTERIORS` in
`GeneratorTown.js`) and `generateNodeTiles` passes to `generateBuilding`.
`BUILDING_LAYOUTS` names what goes in the room behind the door and the roles
that the other rooms draw from. An inn has guest bedrooms, a temple an altar
and a colonnade, a barracks a row of beds, a shop a counter and its stock,
an academy bookshelves and a table, and a warehouse barrels and chests. A
house, and a building with an environ that has no layout, puts a hearth and
a table in the room behind its door. A dungeon level lines some large square rooms
with pillars, and a cave level gets small pools. Both scatter rubble, and
the bottom level of each puts a chest on the floor cell farthest from the
way in.

### Nested generation

Every archetype returns `sites` beside its tiles. A site is a place on the
map that opens into a sub-map of its own. Its type is `GeneratedSite` in
`src/types/map.ts`, and it lists the tiles that link to the sub-map, plus
the archetype, the kind, the environ, and the size preset of that map. An
outdoor map lists its settlements, its keep, and its dungeon, and each cave
entrance, mine, and ruin (`siteMap` in `GeneratorSites.js`). A town lists
each building that has an inside, over all four cells of its art. A well, a
fountain, a market, and a graveyard are open ground, so they are not sites.

A dungeon or a cave level with stairs down lists a forced site for the level
below it. A building with a trapdoor lists a forced site for its cellar, and
a castle lists forced sites for its upper floor and its dungeons. A forced
site always gets its map, because its tile already leads up or down. A
staircase with no map behind it gives the party a way that goes nowhere, so
no generator places stairs or a trapdoor without a forced site.

`src/map/GeneratorWorld.js` is the world archetype. Its terrain uses the
`continent` profile, with rivers but no roads or settlements. `partitionLand`
splits the largest land mass into regions of about 80 cells each, to a
maximum of nine. The first seed is a random cell, and each later seed is the
cell farthest from the seeds so far. Each region grows from its seed over
land, one ring of neighbors at a time, so a region is always one connected
block. Each other land mass of 12 cells or more becomes one region, and a
smaller island is in no region. `regionFor` picks the archetype of each
region from its terrain. Every tile of a region links to the region map, so
the region shows as one region group on the world.

`expandTree` in `src/map/GeneratorTree.js` builds a map and its sub-maps,
breadth first. The top map draws from `mulberry32(seed)`. Each sub-map draws
from `mulberry32(childSeed(parentSeed, siteIndex))`, and never from the RNG
of its parent. The top map is then the same with or without its sub-maps,
so the Generate preview builds the top map alone. `depth` limits the
optional sites. `SUBMAP_BUDGET` stops the optional sub-maps at 300, because
each sub-map adds to the save. A vast world with every level holds 226 to
276 maps over seeds 1 to 5. Its packed save is about 0.5 MiB of text. The
browser stores two bytes per character, so the world takes about 1 MiB of
localStorage, and the save warns at 3 MiB. The forced sub-maps do not count
against the budget. `MAX_LEVELS` in `MapGenerator.js` limits a stack of
dungeon or cave levels to 10 instead, and the Levels field of the Generate
dialog has the same limit. Without it, a vast dungeon of 500 levels builds
500 nodes.

A regeneration of a node that its parent reaches by a staircase keeps that
staircase. `stackPlace` in `src/map/RegenerateNode.js` reads the stairway
(`MapExits.stairwayTo`) and counts the stairs down above the node for its
level number. `archetypesFor` in `MapGenerator.js` then offers a dungeon, a
cave, or a cellar for a level below and the upper floor for a floor above,
and the generator gives a level above 1 its stairs up. A castle or a
building in either place gets a door onto a floor with no outside, and a
castle adds a second upper floor and dungeon to the stack. `stackBase`
removes the label from the name of a regenerated level, so its new levels
take the name of the top of the stack.

`src/map/GeneratorNames.js` names each sub-map from its own RNG. A forced
map takes the name of the map at the top of its stack and adds its label,
for example "Ashford Barrow (level 2)". `expandTree` gets node ids from a
`makeId` callback. It also refuses an id that it gave out earlier in the
same batch, so two new nodes never share an id.

### Generator modules

The generator archetypes build on these helpers, and `MapGenerator`
dispatches to them. `src/map/GeneratorGround.js` builds the ground of the
open maps with `wildTerrain` and draws it as tiles with `terrainTiles`. The
wilderness, the town, and the world all draw with it. The climate
archetypes are in `src/map/GeneratorWilds.js`, with their sites and roads in
`src/map/GeneratorSites.js` and `src/map/GeneratorRoads.js`. The town is in
`src/map/GeneratorTown.js`, with its buildings in
`src/map/GeneratorTownBuildings.js` and its wall in
`src/map/GeneratorTownWall.js`.
The dungeon is in `src/map/GeneratorInteriors.js`, the cave in
`src/map/GeneratorCave.js`, and the castle and the building in
`src/map/GeneratorHalls.js`. They all draw furnishings with
`src/map/GeneratorFurnish.js`. The world is in `src/map/GeneratorWorld.js`,
and `src/map/GeneratorTree.js` and `src/map/GeneratorNames.js` build and
name the sub-maps. The example world in
`campaign/ExampleWorld.js` uses them too.

A tile's `overlayRef` can be either a single reference or a draw-ordered
stack of them (`TileGrid.overlayList` normalizes the two forms). The stack
exists for places such as a river mouth, where the tile needs both its
shoreline piece and the river channel drawn on top of it, and neither
overlay displaces the other.

## Fog of war

Play mode hides the parts of a map the party has not been near. The state
behind this is only the `revealed` flag on each tile, and `FogOfWar.js`
(`src/map/FogOfWar.js`) is a set of pure functions over a MapNode that
manage it:

- `revealAround(node, centerId, radius)` parses `centerId` as an `"x,y"`
  grid coordinate, and reveals every tile within a Euclidean radius of it, so
  the revealed area is a disc instead of a square. Revealing is monotonic: a
  tile that is already revealed, or outside the radius, stays untouched, and
  moving away from an area never re-fogs it.
- `hideAll(node)` resets a node to fully unrevealed. It backs reset and debug
  paths.
- `revealedCount(node)` backs "percent explored" style readouts.
- `withinRadius(tileId, centerId, radius)` exposes the same Euclidean cutoff
  as a standalone predicate.

That last function also gates the markers. `MapMarkers` uses it to limit the
encounter, NPC, and point-of-interest markers to a detection range around
the party tile, and around every individual character token. The range
(`MapView.markerRange`, wired from `PartyTracker.revealRadius`) is twice the
fog reveal radius, so a marker can be sensed slightly beyond the fog edge but
never from across the map. A node the party is not currently in shows no
markers at all outside Build mode.

`markerAnchors` and `withinMarkerRange` in `MapMarkers.js` are the pure
halves of that rule, and `MapCanvas.markerVisible(tileId)` answers it for
code outside the render loop. The Play-mode hover tooltip in `mapTravel.js`
calls it before it names the POI type or the NPCs on a tile, because the
tooltip runs for a pointer hover and for the keyboard cursor alike, and
without that call either one would read out what the map leaves unmarked. GM
notes are not gated, because they are not drawn on the map at all.

## The party

`PartyTracker` (`src/party/PartyTracker.js`) owns the party's
`PartyPosition`, which is a nodeId plus a tileId, and it is the only object
that moves the party. `moveTo(nodeId, tileId)` updates the position, calls
`revealAround` on the target node, and writes the revealed tiles straight
back into the `TileGrid` it was constructed with. The constructor also
reveals around the initial position, so a party never starts the campaign
fogged in on its own tile.

`moveTo`'s `nodeId` can differ from the party's current node. Crossing
between a parent map and a zoomed-in region (through `MapNavigator`) works
the same way as moving within one node, and each node's revealed state stays
independent, so exploring the barrow reveals nothing about Darkwood.

### Individual character tokens and the split party

Usually the party moves as one marker. `CharacterTokens.js`
(`src/party/CharacterTokens.js`) layers individual characters over that
shared position for the times they split up. A `Character.location` of null
means "with the party", and the character's token draws on the party's tile,
while a non-null location is the character's own tile.

- `characterTokens(characters, partyPosition, nodeId)` resolves the named
  tokens to draw on a node.
- `moveCharacter` relocates one character.
- `recallAll` removes every individual location, which amounts to bringing
  everyone back to the shared party position.
- `isSplit` and `characterPosition` back the regroup flow described below.

Movement permissions reuse `CharacterBinding.partyPermissions`.
`mapTravel.js`'s `clickSubject` decides which character a map click moves:
while the party is split, the GM's clicks move the character selected in the
Party roster, and a tab bound to one player moves that player's character. A
moved character's steps reveal fog through the same `revealAround` path. The
GM can also place any single character on any node through the roster's
place action, which reaches nodes that are not on screen.

A pick of a character in the roster brings them into view while the party is
split. `partyWiring.js`'s `followCharacter` resolves their
`characterPosition` and hands it to `mapWiring.js`'s `centerOnLocation`,
which navigates to that node if the view is elsewhere and centers the canvas
on the tile at the current zoom. This is the lighter half of
`focusLocation`, with no tile selection and no inspector, so it stays out of
the way in Play mode.

All of this individual movement sits behind the `splitParty` flag, persisted
on `CampaignState` and false by default, and toggled by a GM-only switch in
the Party panel (`app/splitParty.js`). While the switch is off, the app
behaves as if individual movement did not exist: `syncPartyMarker` passes no
tokens to the canvas (only the shared marker draws), the roster hides its
place action, a pick of a character leaves the view alone, a GM's map click
moves the whole party and brings everyone back to it, and a bound player's
map click has no effect.

Turning the switch off while characters are scattered first regroups the
party. The GM picks a member, and the party position moves to that member's
`characterPosition` (a `PartyTracker.moveTo` plus `recallAll`). A cancelled
pick leaves the switch on, so the app never ends up with the switch off and
the party still split. A character placed on a node that no longer exists
(deleted, or gone from a save that another tab adopted) is left out of the
pick through `regroupCandidates` and counts as standing with the party, and
when nobody is left to pick, the party regroups at its own marker.

## Leaving a sub-region

Zooming in uses a tile's `childNodeId` plus
`EntryPoint.computeRegionEntryTile`. Leaving again uses
`src/map/MapExits.js`, a pure module whose entry point is
`findExits(node, parent)`. It returns a list of `MapExit` values
(`src/types/map.ts`) of these kinds:

- `edge`: a side of the map the party can walk off, one per side of the
  parent block that touches usable parent terrain. Outdoor children only.
- `tile`: a door or a staircase that leads out, with the `tileId` and a
  `via` of `door`, `stairs-up`, or `stairs-down`. Interiors only.
- `fallback`: no authored way out was found. `findExits` returns this as a
  single exit instead of an empty list, so a party can always leave a space
  it walked into.

The block a child occupies in its parent comes from `blockFor`, a lookup
over `RegionGroups.findRegionGroups`. A parent can link one child from two
blocks that do not touch, such as a cave with two mouths, so `blockFor` takes
an optional zoom-through tile for that case and returns the block that
contains it, and without the tile it returns the first block. `findExits`
takes the same tile: it reports the sides of the block that contains the
tile, and the sides of every block when no tile is given.

That tile comes from the entry memory in `src/map/EntryMemory.js`. The
memory records one parent tile for each traveler and child node pair, and it
is part of the save, under `entryTiles`. A traveler is the party, or one
character who has their own location while the party is split, and two
travelers can stand in one child having come in by different blocks, so one
tile per node is not enough. `travelerFor` names the key: the party for the
party marker, and for a character who stands at it, and `c:<id>` for a
character with a location of their own.

`mapTravel.js` writes an entry when a tab that moves somebody zooms in, and
drops the entry when the party teleports in, because a teleport arrives
through no block. A whole-party move recalls every character, so it also
drops the character side of the memory, and deleting or regenerating a node
drops the entries of the nodes that go with it.

For an `edge` exit, a side counts when any cell of that block has an
orthogonal neighbor in the parent that has an `imageRef` and is not part of
the block itself. Diagonal contact past a corner does not count, because it
leaves the party nothing to step onto.

An interior's doors qualify when they open outward: on the grid border, or
beside a cell the map leaves empty, which is the void a generated dungeon
leaves around its rooms. That test cannot tell the void from an unpainted
courtyard inside a hand-authored structure, so a door onto such a courtyard
also reads as a way out, and a GM who does not want the courtyard to be a
way out paints it.

### Stairway direction

`stairwayTo(parent, childNodeId)` answers which of the parent's tiles reaches
a child, and which tile kind in the child comes back along it. A parent that
links through its own stairs down is the level above, so the child leaves
through its stairs up. A parent that links through stairs up is the level
below, in the same way a keep's ground floor is to its upper story, and the
child leaves through its stairs down. Any other kind of link, such as a
town's door into a keep, is not a stacked level, and has no stairway back at
all.

Everything that depends on the direction reads this one answer. It decides
which tiles `interiorExits` treats as a way out, where
`computeRegionEntryTile` lands the party when it takes the stairs, where
`computeParentReturnTile` puts the party when it comes back, which way the
badge's chevron points in `MapMarkers`, and what the Build warning tells the
GM to paint.

A parent that links the same child from both a stairs-down tile and a
stairs-up tile has authored two contradictory connections. The descent wins,
because a level below is the far more common case.

The model expresses one return staircase per level. Every tile in the child
of the kind that runs back counts as an exit to the parent, and all of them
land on the parent's one linking stair tile. The entry landing, in the same
way, picks the first matching stair in tile order. A second staircase meant
to go somewhere else needs its own link to a child node, which takes it out
of the exit list.

### Entry landing

`EntryPoint.computeRegionEntryTile(parent, child, childNodeId, party)`
picks the tile where the party lands in a child. A child that the parent
reaches by a staircase lands the party on its staircase back. Otherwise
`computeEntryTile` projects the party's position beside the block onto the
matching side of the child. An interior then lands the party on the outward
door nearest that tile (`nearestOutwardDoor`), with the same outward test
that `interiorExits` uses. A generated dungeon leaves void around its rooms,
so the floor tile nearest the approach side can be far from its door, and
sometimes next to its stairs down. An interior with no outward door and a
region child both snap through `resolveEntryTile` to the nearest walkable
tile.

### Return landing

`EntryPoint.computeParentReturnTile(parent, child, exit, position)` mirrors
`computeRegionEntryTile`. Off an edge, the party's coordinate along that side
of the child maps back onto the block's extent, and then one cell further
out, onto the parent terrain the side touches. Through a door, the model
uses the same projection from the door's own coordinate. Along a stairway,
it uses the parent's tile at the other end of the stairway. A block that
sits on the parent's own north or west edge projects to a coordinate of -1,
so the function limits the coordinate to the grid before the snap, and the
party lands beside the block instead of at the origin.

The first two cases snap through `resolveReturnTile`, the parent-side
counterpart of `resolveEntryTile`: the nearest painted, non-wall tile that
does not belong to the block just left, since landing back on the block
reads as never having left. The stairway case skips the snap, because the
parent's staircase *is* a tile of that block, and the snap logic rejects any
tile from that block for that same reason.

### Drawing and taking an exit

`MapView` has an `exits` field, set through `MapCanvas.setExits`, and its
readers are:

- `MapDecorations` draws an outward chevron and a "Return to {name}" label
  in the gutter beyond each `edge` exit, and `MapMarkers` draws a small
  chevron badge on each `tile` exit.
- `MapCanvasPointer` hit-tests the same bands on a click. `MapCanvasKeyboard`
  arms an exit when a cursor key leaves the cursor stopped at a border
  that has one: the band brightens, a live region says to press again,
  and only a second discrete press of the same arrow moves the party. Key
  repeats neither arm nor confirm an exit, so holding an arrow key sends the
  cursor to the border and stops it there, instead of moving the party
  across it. Any other interaction (a cursor move, another key, a pointer
  touch, a loss of focus, a change in the exits) withdraws the arming
  (`MapCanvas.disarmExit`).
- `ui/ExitList.js` mounts the same exits as real buttons over the viewport,
  hidden until one takes focus. These buttons are how a keyboard or a screen
  reader travels. A list that contains only a `fallback` exit stays pinned
  open instead, because the canvas draws no arrow and no badge for a
  fallback, and without the pin a pointer user in a sealed interior sees no
  way out anywhere. A list that changes while one of its buttons has focus
  moves focus to the first remaining button, instead of dropping it.

The band's rectangle is computed once, by `exitBandGeometry` plus
`edgeExitBand`, and both the drawing code and the pointer call it, so the
arrow the GM sees and the rectangle their click is tested against cannot
differ. The band is a bounded pill centered on the party's row or column,
kept within the canvas, so panning the map's border out of view pins the
arrow at the viewport edge instead of scrolling it away.

`mapTravel.js`'s `exitToParent` does the travel, and it moves whoever a
click moves: the whole party for the GM, one character while the
split-party toggle is on, and no one from a spectator tab, which follows the
camera out instead. A `tile` exit also stays an ordinary tile to walk onto,
so it only leads out once whoever the click moves is already standing on it,
because otherwise the party could never stand in a doorway. The exit buttons
take the same door in one press.

`mapWiring.js`'s `syncExits` is the one place that recomputes the list, and
it feeds the canvas and the button list together. It runs from
`syncPartyMarker`, which every path that changes the node in view already
calls, plus `resyncMapViews`, the three authoring paths in
`mapAuthoring.js`, the zoom-in branch of `onCellClick`, and the mode switch.
`travel.currentExits` returns an empty list outside Play mode, because
authoring a map is not the same as traveling it.

### The Build warning

`syncExits` also refreshes `authoringWarning(node, parent)`, the sentence
Build mode shows the GM about the node in view. It looks at the same links
from the parent's side, and it reports these problems in the order they have
to be solved:

1. No parent tile links here at all, so the node is unreachable, and players
   never see it, whatever is painted inside.
2. A linked outdoor child whose block sits in blank parent terrain: no side
   has anything to walk off onto, so the fix belongs on the parent, beside
   the tiles that link here, not anywhere in the child.
3. An interior is linked, but sealed: nothing painted to leave through.

The link comes first because it also decides the later answers. A staircase
counts as a way out only in the direction the link runs, so stair advice
before a link exists is a guess. Once there is a link, the warning names
that direction and no other: a crypt level is told about its stairs up, an
upper story about its stairs down, and a keep entered through a town door
about a door alone.

These are warnings about an unfinished map, not a stranded party, because
`findExits` hands Play mode a fallback either way and nothing is written to
the node. The `#build-warning` element is a permanent `role="status"` live
region, hidden by CSS while empty, and its writes are deduplicated against
the last text, because `syncExits` runs on every party step and every paint
stroke.

The Build world tree runs the same check on every node. A row whose
`authoringWarning` is non-null gets a warning badge with the sentence as its
tooltip and accessible name, so an unlinked tile flags the orphaned child at
the moment of the break, instead of when the GM next views it. The warning
is part of the tree's redraw signature, so `syncExits` also refreshes the
tree, because a stroke on the parent can seal or unseal a child without a
change to the rail warning for the node in view. Outside Build mode the check
returns null, so a Play-mode party step never pays for a world scan.
