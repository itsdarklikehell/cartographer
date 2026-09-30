# The map

*Explanation. Back to the [architecture overview](../architecture.md).*

The map is a tiled world that the GM paints in Build mode and the party
explores in Play mode. A small data model of nodes and tiles is under it. The
hierarchy, regions, drawing, fog of war, and party movement all build on that
model, so read the first section before any later one.

## Nodes and tiles

`src/types/map.ts` declares both types of the model:

- A **Tile** is one square of a map. It has an id, an art reference
  (`imageRef`), an optional overlay, a `revealed` flag for fog of war, and
  metadata such as a point-of-interest label.
- A **MapNode** is one whole map. It is a rectangular grid of tiles, plus a
  name, dimensions, a `kind`, and an `environ`. The `kind` is `'region'` for
  an outdoor area or `'interior'` for the inside of a building, and it
  controls palette filtering and defaults. The `environ` is a tag such as
  `forest`, `cave`, or `inn`, or null.

The model has no separate world, region, or dungeon type. A world map, a
region inside it, a town inside that region, and a dungeon under the town are
all MapNodes. The difference between them is how they connect.

Nodes connect in two directions at once. Each node has a `parentId` that
points up at the map that contains it, or null for a root such as the world.
A tile can have a `childNodeId` that points down at another node, and a click
on that tile in Play mode zooms into that map.

This example uses the names from the example campaign:

```
  world (MapNode, kind: 'region', parentId: null)
    |
    |  194 tiles, "31,29" among them, have childNodeId: 'barrowdowns'
    v
  barrowdowns (MapNode, kind: 'region', parentId: 'world')
    |
    |  tile "19,2" has childNodeId: 'barrow'
    v
  barrow (MapNode, kind: 'interior', parentId: 'barrowdowns')
    |
    |  tile "5,9" has childNodeId: 'barrow-1'
    v
  barrow-1 (MapNode, kind: 'interior', parentId: 'barrow')
```

On the world map, every tile of the Barrowdowns block zooms into the same
Barrowdowns region. Many tiles that lead into one child are legal and common,
because a large area can cover several tiles of its parent map, and any of
those tiles takes the party inside. Inside the Barrowdowns, one tile leads
into the first level of the barrow, and a staircase on that level leads down
to the second.

The model has no region record to keep in sync with the tiles. A region is
only a MapNode that one or more tiles point at through `childNodeId`.

### The node registry

`TileGrid` (`src/map/TileGrid.js`) contains all the nodes in a
`Map<id, MapNode>`. Its helpers add, get, and update nodes, walk the
`parentId` chain to build a breadcrumb, and resolve a tile's zoom target.

Cross-tab sync uses `replaceNodes`, which swaps the whole contents of the
registry but keeps the grid *object*. The navigator, the party tracker, and
the canvas each keep a reference to the grid they were constructed with.
When another browser tab saves the campaign, the running tab replaces the
grid's contents in place, so none of those objects needs a rebuild or a new
reference.

### Grid coordinates

A tile's id is also its position. A tile in a grid has the id `"x,y"`, for
example `"3,4"` for the tile at column 3, row 4. No separate x or y field can
then disagree with the id.

The pure functions `parseCoords`, `tileRect`, and `screenToTile` in
`src/map/MapGeometry.js` convert between grid coordinates and screen pixels.
Any code that needs a tile's position parses its id.

Grid-aware code skips ids that do not match the `"x,y"` pattern (see
`RegionGroups.findRegionGroups` for an example). The hierarchy tests use
fixture nodes with ids such as `"entrance"`, and grid logic leaves those
nodes alone instead of failing on them.

## Region grouping and multi-tile art

A region can have more than one entry tile, as the Barrowdowns example shows.
A set of tiles that share the same non-null `childNodeId` and are contiguous
(touching along an edge, not only at a corner) forms one **region group**. A
region group counts as one landmark.

`RegionGroups.findRegionGroups(node)` (`src/map/RegionGroups.js`) computes
these groups. It is a pure flood fill over a flat grid of the node's cells,
which keeps the child link of each cell. For each group, it returns:

```js
{ childNodeId, tileIds, cells, minX, minY, maxX, maxY }
```

`cells` lists the parsed grid coordinates of each member tile, in the same
order as `tileIds`, so later code does not parse the ids again. `minX`
through `maxY` give the group's bounding box.

Multi-tile regions need no schema change, because the grouping comes from
tiles that share a `childNodeId` value. `MapCanvas` asks for the groups each
time a node loads. The result is cached on the node's link stamp
(`TileIndex.linkStamp`), which changes only when a tile id or a
`childNodeId` changes.

A fog reveal or a terrain stroke makes a new node with the same link stamp.
The new node then gets the same group objects, so the outline, color slot,
and image chunk caches that key on those objects stay valid.

### Region overlay

`src/map/RegionOverlay.js` draws each group as a tint over its own cells, a
border along its outline, and the region name, which it gets through a
`getNodeName` callback. A painted region can have any outline, and its
bounding box covers cells of the regions beside it, so the overlay never
draws the box. `groupOutline` in `src/map/RegionOutline.js` lists the cell
edges that the border follows, which are the sides of member cells whose
neighbor on that side is outside the group.

Each region takes a color from `INK.regionHues`. `regionSlots` gives two
regions that touch two different slots. It removes the region with the fewest
neighbors, one at a time, and then colors the regions in the reverse order.
A map in which each region is one block then needs at most six colors.

The border line is twice its drawn width and centered on the cell edge, and
the clip to the region cells keeps only the inner half. Two regions that
share an edge then each show their own color on their own side of it.

In Play mode, the clip covers the revealed cells only, and the name sits on
the first revealed cell in reading order. A region therefore never shows its
extent through the fog.

### Group images

On outdoor maps (`kind: 'region'`), a multi-tile region group also changes
how its art draws. The group draws as larger scaled images instead of one
small image per tile, so a two-by-two castle looks like one castle instead of
four copies of a castle tile.

`groupImageChunks(node, group)` splits a group that fills a rectangle into
chunks of at most 2x2 tiles, and each chunk draws one image stretched across
its block. For a chunk's image (`groupImageRef`), it uses the art of a tile
marked as a point of interest if the chunk has one. Otherwise, it uses the
art of the top-left tile.

`MapRenderer._renderGroupImages` draws these chunks, and the ordinary
per-tile pass then skips the base images of the covered cells. Fog
rectangles and path overlays still draw per tile, on top of the stretched
image. A partly explored block then reveals piece by piece, and a road
through a region stays drawn at tile size.

Three kinds of group keep plain per-tile drawing: a ragged group (one that
does not fill a rectangle), a group with no point-of-interest marker, and a
group on an interior map. A group with no marker is a painted territory, not
a landmark. Its grass or forest, drawn as a few stretched tiles, would lose
the variants of its art.

### Spans

Apart from region links, a single tile can have an optional `span`. The Size
row of the Build palette sets it (2x or 3x), and `paintTile(node, tileId,
imageRef, overlay, span)` records it.

A spanned tile's image draws stretched across a span-by-span block anchored
at that tile. Near the right or bottom edge of the map, the block moves up or
left as needed to stay in bounds.

`spanBlocks(node)` in `TilePaint.js` lists these blocks with pure geometry.
`MapRenderer._renderSpanImages` draws them right after the region-group
chunks. Span blocks add to the same set of covered cells, so the per-tile
pass skips the base images under them, while fog and overlays stay per tile,
as with group images.

Span art also draws on interior maps, which region chunks do not. The covered
cells keep their own tile data. The span is only a drawing effect of the
anchor tile, so a repaint of the anchor at 1x clears it.

## Drawing and input

The canvas code is split so that each file owns one concern:

```
  MapCanvas (src/map/MapCanvas.js)
    owns the <canvas> and the view state: node, pan/zoom,
    markers, selection
    |
    +-- MapRenderer ......... terrain / fog / grid / region passes
    |     +-- TileRaster ....... tile art, rasterized once per drawn size
    |     +-- MapMarkers ....... party, encounter, NPC, token markers
    |     +-- MapDecorations ... cursor, selection, POI,
    |                            coordinate chrome
    |
    +-- MapCanvasPointer .... right-drag/touch pan, cursor-anchored wheel
    |                         and pinch zoom, authoring strokes, hover
    |                         tracking, context click
    +-- MapCanvasKeyboard ... arrow-key cursor, Enter/Space activation,
                              +/- zoom, focus outline
```

`MapCanvas` is the host. The renderer and decoration modules read the view
state and draw. The two input controllers (pointer and keyboard) change the
view state through the host reference.

### Canvas colors and labels

Every drawing layer takes its colors from `INK` in `src/map/CanvasInk.js`
and its captions from `src/map/CanvasText.js`. A canvas accepts a color
string, not a CSS custom property, so the map cannot read the stylesheet's
tokens. `INK` is the canvas copy of that vocabulary, with one named entry per
role, so a color that two layers share is written once.

`CanvasText` defines the label rule that the coordinate digits, character
names, exit labels, and region names share. `labelSize(size, { factor, min,
max })` scales a font from the tile size on screen. `drawPlatedLabel(ctx,
text, x, y, opts)` sets the font and alignment, draws the pill or rectangle
behind the text, and restores the context.

Each caller keeps its own scale, because the bounds depend on what the label
is drawn over. Coordinate digits are large on empty canvas, and a character
name stays small over tile art.

### Tile rasters

For each tile, the draw pass draws a fog rectangle if the tile is not
revealed, and otherwise draws the image at `tile.imageRef`. The group, span,
and marker passes described on this page add to that base.

Tile art does not come straight from the SVG file. `TileRaster`
(`src/map/TileRaster.js`) draws each image ref once into an offscreen canvas
at the size that the map draws it, and every later frame copies those pixels.

A canvas rasterizes an SVG again on every `drawImage` call, and Build mode
draws every tile in the node. Drawing the vector art directly costs about
1,600 rasterizations per frame on a 40x40 map. One paint stroke across the
example world then costs 769 ms of script, where the raster cache costs
29 ms.

The raster is the same size as the tile on screen, to the pixel. A raster
rounded up to a power of two would keep fewer rasters, but it averages away
the hairline strokes in the art, such as the grid lines on grass and the
ripples on water. The whole map then looks flat at the zoom that fits it on
screen.

A destination wider than 256 pixels skips the cache and draws the vector
art, so one large landmark stays sharp at high zoom. The cache clears itself
when it reaches 32 MB.

### The cell grid

`MapRenderer._renderCellGrid` draws the one-pixel grid along the cell
boundaries as its own pass. The SVG rasterizer leaves the outermost pixel row
of each tile partly transparent. Tiles drawn from vector art therefore show
the dark map backdrop at every boundary, which reads as a grid. A cached
raster fills those pixels and shows no grid, so this pass draws the line.

The pass is clipped to the revealed cells, because a flat fog rectangle never
shows the backdrop and so never shows a grid. Some tiles still draw from the
vector art: the PNG export, and any zoom past the raster size limit. There
the boundary line is already present, so the pass does not run, and no
boundary gets a second, darker line.

### Clicks and navigation

A `pointerup` counts as a tile click only if the total drag distance stays
below a small threshold. With no such check, a pointer that ends a pan
gesture on a region tile also zooms into it.

**Navigation** is pure logic with no DOM. `MapNavigator`
(`src/map/MapNavigator.js`) tracks which node is in view, and it provides
`zoomIn(tileId)`, `zoomOut()`, `goTo(nodeId)`, and `getBreadcrumb()` over a
`TileGrid`.

The canvas's `onTileClick` callback and the breadcrumb's click handler
(`ui/Breadcrumb.js`) both call a navigator and redraw the view. The
navigator has no DOM dependency, so plain unit tests cover all of the zoom
and breadcrumb behavior.

## The tile catalog and generation

`TilePalette` (`src/map/TilePalette.js`) is the built-in tile catalog. It is
built from the family tables in `src/map/TileCatalog.js`, and it keeps
terrain variants apart from connector pieces:

- Terrain types (grass, water, mountains, and other kinds) have several
  interchangeable variants, so a painted field does not look like a
  wallpaper pattern. `variantAt(type, x, y, rng)` chooses one from a hash of
  the cell position (`TileCatalog.variantIdAt`), and the random-variant brush
  paints the same pick. The tile codec stores a cell whose variant is that
  pick as its type alone (see [Persistence](persistence.md)).
- `variantAt` still draws from `rng` once, so the later draws of a seeded
  generator do not depend on the pick. `pickVariant(type, rng)` chooses a
  random variant for a caller that has no cell position.
- Road pieces are named connector pieces (a straight, a corner, a tee), not
  random variants. `getRoadPiece(kind)` looks one up by name.

Callers can register custom tiles with `addCustom` and `removeCustom`. A
custom tile cannot override a built-in tile, so custom tiles only extend the
catalog.

### Tile kinds

Some art has a meaning for the rules. The party cannot stand on a wall or on
an obstacle such as a pillar. A door is the authored way into a space, and
stairs and trapdoors connect one level to the next.

`src/map/TileKinds.js` is the only place in the code that knows these
meanings. `kindOf(imageRef)` gives the meaning of one image, and
`tileKind(tile)` gives the meaning of a whole tile. The topmost overlay with a
meaning decides, and the base image decides when no overlay has one.

`kindOf` matches whole references against the catalog instead of looking for
a word in a file name. A GM's own art called `interior-wall-h.svg` then stays
plain art, and a renamed built-in asset cannot change where the party can
walk.

A town wall segment and a corner tower are walls too. A gate and a water gate
are `plain`, so a landing or a new link can go on a gate but never on the
wall beside it. Everything outside the interior, furnishing, and town wall
sets (terrain, markers, custom images) is `plain`.

### Autotiling

`src/map/Autotile.js` picks connector overlay pieces for generated terrain,
so that coastlines, rivers, and roads join up on screen. Like the palette, it
is pure and takes its random number generator as an argument:

- `smoothCoastline` widens water until every shore outline matches a coast
  piece in the art set.
- `coastOverlays` and `coastKind` name the shoreline overlay for each land
  cell along the water.
- `ArmNetwork` records which edges of each cell a river or a road crosses,
  and `connectorKind` names the piece for a set of edges. A network stores
  edges, not covered cells. Two rivers that run side by side then stay two
  rivers, where a piece picked from the neighbor cells would join them.

### Climate model

The open-terrain archetypes (wilderness, highlands, frontier, desert,
wetlands, and island) share one climate model in
`src/map/GeneratorTerrain.js`. Seeded value noise from
`src/map/GeneratorNoise.js` gives three fields over the map: elevation,
moisture, and temperature.

`classifyBiome` turns the three values of a cell into a biome. Elevation
decides water, hills, and mountain first. Then temperature decides the cold
biomes, and moisture decides between desert, grass, forest, swamp, and
jungle.

Each archetype is a profile in `TERRAIN_PROFILES`. A profile gives the share
of the map that is water, hills, and mountain, a warmth, a wetness, and how
much colder the north edge is than the south edge. The water, hill, and
mountain lines come from quantiles of the elevation field, so a profile that
asks for 12% water gets about 12% on every seed. An island profile lowers the
land toward the edges and puts the whole border under water.

Each biome has its own tile art, and `BIOME_TERRAIN` gives each biome a
terrain class, for example forest for jungle and mountain for volcanic. The
generator rules read the class, so a road avoids a volcanic peak as it avoids
any mountain. `terrainTiles` draws the biome art of a cell, and the cell keeps
the class of its biome. A cell that a later step changes, for example to
farmland or to a pond, draws with the art of its new class.

Noise features scale with the map, at about one feature per nine tiles. A
large map then gets more lakes and ranges, not larger ones.

### Rivers

`src/map/GeneratorRivers.js` traces rivers after the coastline is smoothed. A
river starts on the hills or at the foot of a range, and each step goes to
the lowest free neighbor. A step can climb 0.02 of the elevation range, so a
river crosses small ripples in the noise.

A river ends where it meets water, leaves the map, or reaches another river.
A river that meets another river joins it as a tee, or as a cross where the
other river has a tee. The head of the river joins every river cell beside
it, so no two channels run side by side without a join.

A head beside both a river and water joins the river and drains into the
water. A river with no lower ground left ends in a pond, and the pond cell
becomes water.

### Sites and roads

After the rivers, `src/map/GeneratorSites.js` places the sites of an outdoor
map. A site is a place that people built: a settlement, a keep, or a dungeon.
Each site marks one tile with a marker and names the archetype of its own map
(`town`, `castle`, or `dungeon`). `siteCounts` sets how many of each a map
gets, from one settlement on a small map to five settlements, a keep, and a
dungeon on a vast map.

A settlement prefers grass near a river or a lake. A settlement with at least
four water cells within two cells of it is on the coast, and its town map gets
the `coast` environ, which makes the town a port (see
[Town layout](#town-layout)).

The first settlement takes the best spot, and on a map of 32 cells or more it
draws as a city, on the coast or not. Any other settlement on the coast draws
as a port. Each later settlement inland draws as a village with a chance of
one in two.

The keep prefers the foot of the hills, and the dungeon stands as far from
the settlements as it can. No site stands on a river, on a shoreline, or
within two cells of the border. The marker then hides no overlay, and a road
can reach the site from every side. Grass around each settlement turns into
farmland at random.

`roadAreas` in `src/map/GeneratorRoads.js` splits the map into areas that
roads can join, with bridges over straight river channels. A lake, a mountain
range, or a river bend can cut off a pocket of land. The settlements and the
keep all stand in the area with the most room for them, so that a road can
join them all.

`planSites` takes only an area with a cell on the border when such an area
has room, because a road from an area off the border cannot leave the map. A
map whose areas all stay off the border, such as an island, takes the area
with the most room. The dungeon has no road, so it can stand in any area.

When no cell meets the rules above, as on a small map crossed by a lake, the
sites can stand one cell from the border, and then beside the water. A map
with any open ground then gets its settlement. The small island map with seed
1266 is one map that needs this last rule.

`src/map/GeneratorRoads.js` routes roads with an A* search. Each terrain type
has a step cost in `ROAD_COST`, and a type that is not in the table, such as
water or mountain, takes no road. A step along an existing road is cheap, so a
new road joins the old one instead of running beside it.

A road crosses a river only over a straight channel, and it leaves the river
cell in the direction it entered. The crossing pieces (`bridge-h`,
`bridge-v`, `ford-h`, and `ford-v`) have only a straight channel, so for this
rule the search state is a cell plus the direction of entry.
`fordCrossings` in `src/map/GeneratorWilds.js` draws each crossing more than
three cells from every settlement as a ford.

`connectSites` joins the settlements and the keep as a minimum spanning tree
that grows from the first settlement. A site joins the tree only when a road
reaches it, so a site that no road can reach gets no road. The dungeon gets no
road.

`connectSites` then runs one road from the tree off the map edge, and a map of
32 cells or more gets a second exit far from the first. Each exit therefore
leads to every site in the tree, and the first exit becomes the entry of the
map. When no border cell of the area can take a road, `connectSites` skips
the exit search, because each search would cover the whole area and fail.

A map with no exit, such as an island with its whole border under water,
enters where `southLanding` in `src/map/GeneratorGround.js` says. That is the
land cell with no marker nearest the middle of the south border, where one row
north counts as two columns across. The cell is on the largest land mass
(`largestLand`), because an islet near the south shore can be closer, and a
party there cannot walk to the sites. The world uses the same search for its
entry.

### Town layout

`planTown` in `src/map/GeneratorTown.js` plans a town with no tiles.
`generateTown` draws the plan with `terrainTiles`, the same function that
draws the outdoor maps. The core of the town is the square of cells within
about three tenths of the map side from the central crossroads.

**River.** A town has a river with a chance of three in five. `townRiver`
runs it from one edge to the opposite edge, at least two cells from the
center row and column. The river moves one cell to the side at random, but
never on two rows in a row, so each bend has a straight channel beside it
where a bridge fits.

In a town of 22 cells or more, the river also keeps clear of the first ring
that the wall tries. It never runs along a side of that ring and never bends
on it, so where it meets the ring it goes straight through.

**Sea.** A town with the `coast` environ is a port. `townSea` puts water along
the north, east, or west border, and never the south border, because the
entry street starts there. The sea reaches about a tenth of the map side into
the map. Its depth changes by one cell at a time along the border, so the
shore bends.

`smoothCoastline` then fills each notch that the coast pieces cannot draw,
and `terrainTiles` draws the shore with `coastOverlays`, as on the outdoor
maps. The river of a port always runs at a right angle to the shore, so it
flows into the sea. Its cells under the water drop out of the network, and
the last channel drains into the sea.

A port of 8 cells has no river, because the sea and a river together leave
too little ground for its three buildings. Streets keep off the sea. Walls and
buildings also keep off the shore cells, because their art would hide the
shoreline.

**Docks.** `planDocks` in `src/map/GeneratorTownDocks.js` gives a port one
pier, or two on a map of 22 cells or more. It runs after `planWall` and before
`placeBuildings`. `dockSpots` lists each shore cell that has the straight
coast piece of the sea side, with no street, river, or wall on it or beside
it.

The pier runs straight out from that quay, with water on both sides of each
pier cell. Its length is one cell per ten cells of map side, from one to four.
Where the sea is deep enough, the pier stops one cell short of the open sea.

`planDocks` then routes a street inland from each spot with `routeRoad`, and
the spot with the shortest street wins. A dock street keeps off the shore
cells and the wall, and it never joins a gate, so a wall that `planWall`
accepted stays valid.

`generateTown` draws the quay over its coast piece in place of the street
piece, because the quay art draws its own street. It draws the pier as dock
overlays on the water tiles. The dock pieces have no rule meaning, so the
party can walk from the streets out to each pier head.

**Streets.** The streets use `routeRoad` with a `turn` cost of 0.6 for each
bend, so a street on open grass runs straight. The `heading` argument counts
the first step too, so a street that starts on the map edge goes straight
into the map.

The first street runs from the south edge to the crossroads, and its border
cell is the entry. Each later street runs from another edge to the nearest
street. A town of 14 cells or more has three ways out, and one of 22 cells or
more has four. No street leaves on the side of the sea, so a port of 22 cells
or more has three ways out.

In a town of 14 cells or more, about one lane for each five cells of map side
then runs from open ground in the core to the nearest street. A town of 8
cells gets no lane, because a lane there can take the ground that the three
core buildings need.

**Plaza.** The plaza paves the cells within one cell of the crossroads, or
within two on a map of 32 cells or more. The plaza cells get no street
overlay, so the streets open onto the cobbles.

**Buildings.** `placeBuildings` in `src/map/GeneratorTownBuildings.js` puts
the buildings on the plan. Each building fills a 2x2 block of open ground
beside a street or the plaza, and draws with span 2. When no such block is
free, a building takes the nearest free block off the streets.

`buildingList` gives the main set, which has one building for each thirty
cells of map area and never fewer than three. The core set (inn, tavern,
blacksmith, general store, and temple) takes the blocks nearest the
crossroads, so every medium town has an inn, a smith, and a temple. The
example campaign puts Bram, Sella, and Sister Alwyn in those three buildings
of Briarwick. The civic set comes next: a well or a fountain, and on a map of
22 cells or more a market and a town hall.

A town of 14 cells or more then gets a watermill on a block beside its river,
beside a street when one is free. It also gets a graveyard at the edge of the
core with a chance of three in five. Both go before the rest of the main set,
because the extras and the homes of a large town take every block beside the
river and at the edge of the core.

Extra buildings from `EXTRA_BUILDINGS` then take half of the remaining slots
of the main set, and homes take the rest. A town that wants more extras than
there are kinds repeats the list in a new random order, so each kind appears
once before any kind appears twice. A home is a house near the crossroads and
a cottage near the edge of the core.

Outside the core, one farm for each ten cells of map side takes a block, and
noise turns patches of the open ground into farmland. Then a windmill takes
the outlying block with the most farmland in the ring of cells around it.

**Wall.** A town of 22 cells or more gets a wall with a chance of one in two.
`planWall` in `src/map/GeneratorTownWall.js` tries the rings from
`wallRadii`: a square ring one cell past the core, then two cells past, then
on the core edge. `planTown` passes the first radius to `townRiver`, so a
river town gets a wall about as often as a dry town. The wall is planned after
the streets and before the buildings, so no building covers the wall.

`wallRing` refuses a ring where a street or the river meets a corner, runs
along the wall, or turns on it. A gate piece takes only a straight street,
and a water gate piece takes only a straight river. `wallRing` also refuses a
ring where a street crosses the wall on a bridge. No wall piece goes on the
sea or its shore, because the piece would draw over the shoreline.

The sea of a port covers the ground of the outer rings in most ports under 48
cells. A ring of a port that meets the shore therefore opens on the sea side.
`openRing` drops the side of the ring that faces the sea and extends the two
sides beside it toward the sea, up to the cell before the shore. The sea then
closes the town on that side.

Over seeds 1 to 2000, ports of 22 and 32 cells get a wall 49% and 50% of the
time, and inland towns 50% and 52%. A town whose streets, river, or sea fit no
ring gets no wall.

`generateTown` draws each wall piece as the overlay of its cell. A gate piece
replaces the street overlay under it, because the gate art draws its own
street, and a water gate replaces the river overlay in the same way.

### Interior layouts

Each interior generator carves a flat array of cell codes: void, floor, wall,
and a door in a horizontal or a vertical wall. The helpers in
`src/map/GeneratorInteriorMask.js` finish this mask.

`wrapWalls` turns each void cell beside floor into wall, in all eight
directions, so no floor cell touches the void. `maskTiles` then gives each
floor cell the floor variant that its position picks. It gives each wall cell
the piece from `wallKind` that joins the walls and doors beside it, and a
void cell gets no tile. A door counts as part of the wall around it, so the
wall pieces on each side of a door join through it.

**Dungeon.** A dungeon level (`src/map/GeneratorInteriors.js`) places
rectangular rooms that do not touch. About one room in three with sides of
five cells or more trims its corners and reads as round. Rooms grow with the
map.

`roomLinks` joins the room centers with a minimum spanning tree. It adds about
one loop for every seven rooms, between near rooms that the tree does not
join. Each corridor bends once, and a coin toss picks the order of its two
legs.

**Cave.** A cave level (`src/map/GeneratorCave.js`) grows with a cellular
automaton. Each cell starts as rock with a chance of 0.45. In each of four
rounds, a cell with five or more rock neighbors turns to rock, and a cell with
three or fewer opens.

Only the largest connected cavern stays, through `largestArea` in
`GeneratorInteriorMask.js`. The generator tries again when the cavern covers
less than a fifth of the map, up to six tries, and it keeps the largest cavern
of all the tries.

When that cavern has fewer than `MIN_CAVERN` (nine) cells, a room of three by
three cells in the middle takes its place. Every level then has room for both
of its stairs. A cave draws with `CAVE_ART` from `GeneratorInteriorMask.js`:
cave floors, one rough wall piece for every wall cell, and a cave mouth in
place of the border door.

**Stairs.** A dungeon level and a cave level finish the same way, in
`finishLevel`. A stairs level puts its stairs up on the `up` cell of its
layout. An edge level has no level above it, so it gets no stairs up.
Instead, it cuts a straight tunnel from the `up` cell to the nearest border
and sets a door there. `interiorExits` in `MapExits.js` accepts a door on the
border as a way out, so the party can walk back to the parent map.

The stairs down go on the cell farthest by walking distance from the way in.
The way in is the border door of an edge level and the stairs up of a stairs
level. Because the walk starts at the door, the stairs down of a one-room
level stay out of its tunnel.

The stairs down of a level lead to the level below through `childNodeId`.
The level lists a forced site for that level, and `expandTree` builds it (see
[Nested generation](#nested-generation)).

**Castle and building.** A castle and a building (`src/map/GeneratorHalls.js`)
fill the whole grid with a wall ring and a door in the middle of the south
wall. `hallLayout` splits the floor by binary space partition. Each split
draws a wall across one room, with one door in it, and each half can split
again.

The split cuts the longer side, so rooms stay near square. A new wall never
ends beside a door in the wall around its room, because that wall would block
the door from one side. A castle keeps rooms of at least three cells a side
and has stairs. A building keeps rooms of at least two cells a side, with no
stairs.

The stairs up of a castle lead to its upper floor, which `generateUpperFloor`
lays out with the same splits and no door. The upper floor's stairs down sit
in the corner above the castle's stairs up, and they are its entry.

The stairs down of a castle lead to one dungeon level. They go in the last
room, on the first cell that `stairsCell` accepts, corners first.
`stairsCell` refuses a cell beside a door, because a click on a linked tile
always follows the link, and the party could then never walk through that
door. It also refuses a cell whose loss cuts any floor off from the south
door.

A building has a cellar with a chance of `CELLAR_CHANCE` (three in ten). Its
trapdoor goes on the floor cell farthest from the door that `stairsCell`
accepts. The building picks that cell before the furnishings, so no obstacle
goes beside it, and a building with no cellar leaves the cell bare. The
`cellar` archetype in `MapGenerator.js` generates the cellar as a small
dungeon level that the party enters by its stairs up.

### Furnishings

Each interior generator then furnishes its map through
`src/map/GeneratorFurnish.js`. A furnishing is an overlay on a floor tile, and
`furnisher` refuses a cell where it does not fit.

An obstacle, such as a pillar, a table, a bed, or a bookshelf, never goes
beside a door or a staircase. After each obstacle, the furnisher walks the
level from the way in, and it takes the obstacle back when a floor cell
becomes unreachable. The walk never crosses a staircase, so an obstacle cannot
leave a staircase as the only way to a cell.

A castle puts a throne and two rows of pillars in its largest room. Each other
room of a castle gets a role at random: a bedroom, a dining room, a library, a
storeroom, a chapel, or an empty room.

A building takes its layout from its environ. A town sets the environ for
each building (`BUILDING_INTERIORS` in `GeneratorTown.js`), and
`generateNodeTiles` passes it to `generateBuilding`. `BUILDING_LAYOUTS` names
what goes in the room behind the door and the roles that the other rooms draw
from.

| Environ | Furnishings |
| --- | --- |
| Inn | Guest bedrooms |
| Temple | One open nave with an altar and a colonnade, and no inner walls |
| Barracks | A row of beds |
| Shop | A counter and its stock |
| Academy | Bookshelves and a table |
| Warehouse | Barrels and chests |
| House, or an environ with no layout | A hearth and a table in the room behind the door |

A dungeon level lines some large square rooms with pillars, and a cave level
gets small pools. Both scatter rubble, and the bottom level of each puts a
chest on the floor cell farthest from the way in.

### Nested generation

Every archetype returns `sites` beside its tiles. A site is a place on the map
that opens into a sub-map of its own. Its type is `GeneratedSite` in
`src/types/map.ts`. It lists the tiles that link to the sub-map, plus the
archetype, the kind, the environ, and the size preset of that map.

An outdoor map lists its settlements, its keep, its dungeon, and each cave
entrance, mine, and ruin (`siteMap` in `GeneratorSites.js`). A town lists
each building that has an inside, over all four cells of its art. A well, a
fountain, a market, and a graveyard are open ground, so they are not sites.

A dungeon or a cave level with stairs down lists a forced site for the level
below it. A building with a trapdoor lists a forced site for its cellar, and a
castle lists forced sites for its upper floor and its dungeons. A forced site
always gets its map, because its tile already leads up or down. A staircase
with no map behind it gives the party a way that goes nowhere, so no generator
places stairs or a trapdoor without a forced site.

**World.** `src/map/GeneratorWorld.js` is the world archetype. Its terrain
uses the `continent` profile, with rivers but no roads or settlements.
`partitionLand` splits the largest land mass into regions of about 80 cells
each, to a maximum of nine.

The first seed is a random cell, and each later seed is the cell farthest from
the seeds so far. Each region grows from its seed over land, one ring of
neighbors at a time, so a region is always one connected block. Each other
land mass of 12 cells or more becomes one region, and a smaller island is in
no region.

`regionFor` picks the archetype of each region from its terrain. Every tile
of a region links to the region map, so the region shows as one region group
on the world.

**Tree.** `expandTree` in `src/map/GeneratorTree.js` builds a map and its
sub-maps, breadth first. The top map draws from `mulberry32(seed)`. Each
sub-map draws from `mulberry32(childSeed(parentSeed, siteIndex))`, and never
from the random number generator of its parent. The top map is then the same
with or without its sub-maps, so the Generate preview builds the top map
alone.

`depth` limits the optional sites. `SUBMAP_BUDGET` stops the tree at 300
sub-maps, because each sub-map adds to the save. A vast world with every
level has 240 to 271 sub-maps over seeds 1 to 5. Its packed save is about
0.5 MiB of text. The browser stores two bytes per character, so the world
takes about 1 MiB of localStorage, and the save warns at 3 MiB.

The forced sub-maps count against the budget, and they take it first, so
that no stairs lead nowhere. `expandTree` generates each sub-map when it
takes the site, so it knows the forced sites of the new map at once.

An optional site costs its own map plus `forcedCost` of that map, which is one
for each forced site plus `levelsBelow` for the rest of its stack of levels.
The tree takes the site only when the whole cost fits, and a site that does
not fit gives its turn to the next one. The forced sub-maps of the top map
always get their maps, even past the budget.

`MAX_LEVELS` in `MapGenerator.js` limits a stack of dungeon or cave levels to
10, and the Levels field of the Generate dialog has the same limit. With no
limit, a vast dungeon of 500 levels builds 500 nodes.

**Regeneration.** When the GM regenerates a node that its parent reaches by
a staircase, the new node keeps that staircase. `stackPlace` in
`src/map/RegenerateNode.js` reads the stairway (`MapExits.stairwayTo`) and
counts the stairs down above the node for its level number.

`archetypesFor` in `MapGenerator.js` then offers a dungeon, a cave, or a
cellar for a level below, and the upper floor for a floor above. The
generator gives a level above 1 its stairs up. A castle or a building in
either place gets a door onto a floor with no outside, and a castle adds a
second upper floor and dungeon to the stack. `stackBase` removes the label
from the name of a regenerated level, so its new levels take the name of the
top of the stack.

**Names and ids.** `src/map/GeneratorNames.js` names each sub-map from its
own random number generator. A forced map takes the name of the map at the
top of its stack and adds its label, for example "Ashford Barrow (level 2)".
`expandTree` gets node ids from a `makeId` callback, and it refuses an id that
it gave out earlier in the same batch, so two new nodes never share an id.

### Generator modules

`MapGenerator` dispatches to the generator archetypes, which build on the
helpers below.

| Module | Contents |
| --- | --- |
| `GeneratorGround.js` | `wildTerrain`, the ground of the open maps, and `terrainTiles`, which the wilderness, the town, and the world all draw with |
| `GeneratorWilds.js` | The climate archetypes |
| `GeneratorSites.js`, `GeneratorRoads.js` | Sites and roads of the climate archetypes |
| `GeneratorTown.js` | The town |
| `GeneratorTownBuildings.js`, `GeneratorTownWall.js`, `GeneratorTownDocks.js` | A town's buildings, its wall, and the piers of a port |
| `GeneratorInteriors.js` | The dungeon level |
| `GeneratorCave.js` | The cave level |
| `GeneratorHalls.js` | The castle and the building |
| `GeneratorFurnish.js` | Furnishings for every interior |
| `GeneratorWorld.js` | The world |
| `GeneratorTree.js`, `GeneratorNames.js` | Building and naming the sub-maps |
| `RegionRepaint.js` | Repainting the block of a regenerated region on its parent map |

Every module is in `src/map/`. The example world in `campaign/ExampleWorld.js`
uses them too.

### Overlay stacks

A tile's `overlayRef` can be a single reference or a draw-ordered stack of
references, and `TileGrid.overlayList` reads both forms as a list. A river
mouth uses a stack, because the tile needs its shoreline piece and the river
channel drawn on top of it, and neither overlay can replace the other.

## Fog of war

Play mode hides the parts of a map that the party has not been near. The only
state behind this is the `revealed` flag on each tile. `src/map/FogOfWar.js`
is a set of pure functions over a MapNode that manage the flag:

- `revealAround(node, centerId, radius)` parses `centerId` as an `"x,y"` grid
  coordinate and reveals every tile within a Euclidean radius of it, so the
  revealed area is a disc instead of a square. Revealing only adds. A tile
  that is already revealed or outside the radius stays as it is, and moving
  away from an area never fogs it again.
- `revealAlong(node, tileIds, radius)` calls `revealAround` for each tile of
  a walk, so the party sees what it passes on a long walk.
- `withinRadius(tileId, centerId, radius)` applies the same Euclidean cutoff
  as a standalone predicate. `CreatureMap.creaturesNear` uses it.
- `hideAll(node)` resets a node to fully unrevealed, and `revealedCount(node)`
  counts the revealed tiles. The tests and the benchmarks use them, and no app
  code calls them.

### Marker range

The same Euclidean rule limits the markers. `MapMarkers` shows the encounter,
NPC, and point-of-interest markers only within a detection range of the party
tile and of every individual character token. The range
(`MapView.markerRange`, set from `PartyTracker.revealRadius`) is twice the
fog reveal radius. A marker can then be sensed a little beyond the fog edge,
but never from across the map. Outside Build mode, a node that the party is
not in shows no markers at all.

`markerAnchors` and `withinMarkerRange` in `MapMarkers.js` are the pure
halves of that rule, and `MapCanvas.markerVisible(tileId)` answers it for code
outside the render loop. The Play-mode hover tooltip in `app/mapHover.js`
calls it before it names the point-of-interest type or the NPCs on a tile. The
tooltip runs for a pointer hover and for the keyboard cursor, and without
that call either one would name what the map leaves unmarked. GM notes are
not limited, because the map does not draw them.

### Fog reads

The fog reads of a party step go through `TileIndex.js` and scan no tiles.
`exploredCount(node)` gives the "tiles explored" figure of the screen-reader
description. The count is kept on the tile layout, and the replace helpers
update it from the tiles that they flip.

`revealedIds(node)` is the lookup that the renderer uses to limit block art
and region tints, and it reads the `revealed` flag of the tile itself. Both
functions answer from the node that they are given, so a node that undo
brings back reads its own fog. The [Conventions](conventions.md) guide gives
the costs.

## The party

`PartyTracker` (`src/party/PartyTracker.js`) owns the party's
`PartyPosition`, which is a node id plus a tile id. It is the only object that
moves the party.

`moveTo(nodeId, tileId, path)` updates the position, calls `revealAlong` on
the tiles of the walk and `revealAround` on the target tile, and writes the revealed tiles straight back into the `TileGrid`
that the tracker was constructed with. The constructor also reveals around
the initial position, so a party never starts the campaign fogged in on its
own tile.

The `nodeId` of `moveTo` can differ from the party's current node. A move
between a parent map and a zoomed-in region (through `MapNavigator`) works the
same way as a move within one node. Each node's revealed state stays
separate, so exploring the barrow reveals nothing about the Barrowdowns.

### Walls and paths

`PartyTracker.moveTo` does not check the map, so the click path checks each
move. `onCellClick` in `app/mapTravel.js` calls `walkPath`, which asks
`MapPath.findPath(node, from, to)` for the walk from the tile of the mover
to the clicked tile. The mover is whoever the click moves. `findPath`
returns the tile ids of the walk, start and target included, or null when
no walk leads there. `hasOpenPath` is the boolean form.

`findPath` is a breadth-first search over the four side neighbors of each
cell. A step onto a tile that `TileKinds.isBlocked` rejects (a wall or an
obstacle) or that `TileKinds.isDeepWater` accepts stops the walk, and no
walk ends on such a tile. Diagonal steps are not allowed, so a walk cannot
pass between two wall pieces that touch at a corner. The first search
treats a tile with a `childNodeId` as blocked, so a walk past a shop in a
town does not cross the shop's tile. When that search finds nothing, a
second search allows link tiles, because on a region map a road can run
through a town tile.

An empty cell lets the walk through, so on a sparse hand-painted map a move
across a gap passes the check. The start tile is not checked, so a party that
stands on a wall after a repaint can walk off it.

A click on a wall or an obstacle moves nobody, in any tab, because no one
can stand there. When no walk leads to any other tile, a GM tab asks in a
confirm dialog and moves the party only when the GM accepts. The GM can
therefore still put the party past a wall or onto deep water. A player tab
shows a toast and moves nobody. A GM click on a fogged link tile also asks
first, because the GM cannot see that the tile leads into a building.

A walk of the whole party calls `app.actions.passTravelTime` with the
minutes from `time/TravelTime.js`, which prices a step by the depth of the
node in the world tree. The clock keeps the minutes inside the current
watch in the optional `GameClock.minutes` field, and `passTime` ticks timed
effects only for the whole watches that the walk finishes. A forced move
counts its steps along the grid.

A player's walk passes the `revealedOnly` option, so a fogged tile stops it
too. Fog gives an empty cell no revealed state, so an empty cell also stops a
player's walk. With no such option, a player could learn from a refused move
whether a way through the fog exists.

The check runs only when the mover stands in the node in view. A spectator
tab, a GM who views another node, the exit buttons, the teleport, and the
Place action skip it. A move that passes the check, or that the GM forces,
goes through `travelTo`, which reveals fog along the walk and takes exits
for every move.

### Individual character tokens and the split party

The party usually moves as one marker. `src/party/CharacterTokens.js` adds
individual characters over that shared position for the times when they split
up. A `Character.location` of null means "with the party", and the
character's token draws on the party's tile. A location that is not null is
the character's own tile.

- `characterTokens(characters, partyPosition, nodeId)` resolves the named
  tokens to draw on a node.
- `moveCharacter` moves one character.
- `recallAll` removes every individual location, which brings everyone back
  to the shared party position.
- `isSplit` and `characterPosition` support the regroup flow described
  below.

Movement permissions reuse `CharacterBinding.partyPermissions`.
`clickSubject` in `app/mapTravel.js` decides which character a map click
moves. While the party is split, the GM's clicks move the character selected
in the Party roster, and a tab bound to one player moves that player's
character.

A moved character's steps reveal fog through the same `revealAround` path.
The GM can also place any single character on any node through the roster's
place action, which reaches nodes that are not on screen.

When the GM picks a character in the roster while the party is split, the map
brings that character into view. `followCharacter` in `app/partyWiring.js`
resolves the character's `characterPosition` and passes it to
`centerOnLocation` in `app/mapWiring.js`. `centerOnLocation` moves to that
node if the view is elsewhere and centers the canvas on the tile at the
current zoom. It is the lighter half of `focusLocation`, with no tile
selection and no inspector, so it does not interrupt Play mode.

All of this individual movement depends on the `splitParty` flag. The flag
persists on `CampaignState`, is false by default, and changes through a
GM-only switch in the Party panel (`app/splitParty.js`).

While the switch is off, the app acts as if individual movement did not
exist:

- `syncPartyMarker` passes no tokens to the canvas, so only the shared marker
  draws.
- The roster hides its place action.
- A pick of a character leaves the view as it is.
- A GM's map click moves the whole party and brings everyone back to it.
- A bound player's map click does nothing.

When the GM turns the switch off while characters are scattered, the party
first regroups. The GM picks a member, and the party position moves to that
member's `characterPosition` (a `PartyTracker.moveTo` plus `recallAll`). A
cancelled pick leaves the switch on, so the app never has the switch off with
the party still split.

A character placed on a node that no longer exists, because the node was
deleted or is gone from a save that another tab adopted, is left out of the
pick through `regroupCandidates`. That character counts as standing with the
party. When nobody is left to pick, the party regroups at its own marker.

## Leaving a sub-region

Zooming in uses a tile's `childNodeId` plus
`EntryPoint.computeRegionEntryTile`. Leaving again uses `src/map/MapExits.js`,
a pure module whose entry point is `findExits(node, parent)`. It returns a
list of `MapExit` values (`src/types/map.ts`) of these kinds:

- `edge`: a side of the map that the party can walk off, one per side of the
  parent block that touches usable parent terrain. Only outdoor children have
  this kind. An `edge` exit with a `crossTileId` crosses a border into the
  region beside this one, instead of leading back to the parent (see
  [Border crossing](#border-crossing)).
- `tile`: a door or a staircase that leads out, with the `tileId` and a `via`
  of `door`, `stairs-up`, or `stairs-down`. Only interiors have this kind.
- `fallback`: no authored way out exists. `findExits` returns this as a
  single exit instead of an empty list, so a party can always leave a space
  that it walked into.

### The parent block

`blockFor` finds the block that a child covers in its parent, with a lookup
over `RegionGroups.findRegionGroups`. A parent can link one child from two
blocks that do not touch, such as a cave with two mouths. For that case,
`blockFor` takes an optional zoom-through tile and returns the block that
contains it. With no tile, it returns the first block.

`findExits` takes the same tile. It reports the sides of the block that
contains the tile, and the sides of every block when no tile is given.

That tile comes from the entry memory in `src/map/EntryMemory.js`. The memory
records one parent tile for each pair of traveler and child node, and it is
part of the save, under `entryTiles`. A traveler is the party, or one
character who has their own location while the party is split.

Two travelers can stand in one child after they came in by different blocks,
so one tile per node is not enough. `travelerFor` names the key. The key is
the party for the party marker and for a character who stands at it, and
`c:<id>` for a character with a location of their own.

`app/mapTravel.js` writes an entry when a tab that moves somebody zooms in. It
drops the entry when the party teleports in, because a teleport arrives
through no block. A whole-party move recalls every character, so it also
drops the character entries of the memory. Deleting or regenerating a node
drops the entries of the nodes that go with it.

### Exit tests

For an `edge` exit, a side counts when any cell of the block has an
orthogonal neighbor in the parent that has an `imageRef` and is not part of
the block itself. Diagonal contact past a corner does not count, because it
leaves the party nothing to step onto.

An interior's doors qualify when they open outward: on the grid border, or
beside a cell that the map leaves empty. An empty cell is the void that a
generated dungeon leaves around its rooms.

That test cannot tell the void from an unpainted courtyard inside a
hand-authored structure, so a door onto such a courtyard also reads as a way
out. To stop a courtyard from being a way out, the GM paints it.

### Stairway direction

`stairwayTo(parent, childNodeId)` tells which of the parent's tiles reaches a
child, and which tile kind in the child leads back along it:

- A parent that links through its own stairs down is the level above, so the
  child leaves through its stairs up.
- A parent that links through stairs up is the level below, as a keep's
  ground floor is to its upper story, so the child leaves through its stairs
  down.
- Any other kind of link, such as a town's door into a keep, is not a stacked
  level and has no stairway back.

Everything that depends on the direction reads this one answer. It decides
which tiles `interiorExits` treats as a way out, where
`computeRegionEntryTile` lands the party when it takes the stairs, and where
`computeParentReturnTile` puts the party when it comes back. It also decides
which way the badge's chevron points in `MapMarkers`, and what the Build
warning tells the GM to paint.

A parent that links the same child from both a stairs-down tile and a
stairs-up tile has two contradictory connections. The descent wins, because a
level below is the more common case.

The model has one return staircase per level. Every tile in the child of the
kind that leads back counts as an exit to the parent, and all of them land on
the parent's one linking stair tile. In the same way, the entry landing picks
the first matching stair in tile order. A second staircase meant to go
somewhere else needs its own link to a child node, which takes it out of the
exit list.

### Entry landing

`EntryPoint.computeRegionEntryTile(parent, child, childNodeId, party)` picks
the tile where the party lands in a child. A child that the parent reaches by
a staircase lands the party on its staircase back. Otherwise,
`computeEntryTile` projects the party's position beside the block onto the
matching side of the child.

An interior then lands the party on the outward door nearest that tile
(`nearestOutwardDoor`), with the same outward test that `interiorExits` uses.
A generated dungeon leaves void around its rooms, so the floor tile nearest
the approach side can be far from its door, and sometimes next to its stairs
down. An interior with no outward door and a region child both snap through
`resolveEntryTile` to the nearest walkable tile.

### Return landing

`EntryPoint.computeParentReturnTile(parent, child, exit, position)` mirrors
`computeRegionEntryTile`:

- Off an edge, the party's coordinate along that side of the child maps back
  onto the block's extent, and then one cell further out, onto the parent
  terrain that the side touches.
- Through a door, the model uses the same projection from the door's own
  coordinate.
- Along a stairway, the model uses the parent's tile at the other end of the
  stairway.

A block on the parent's own north or west edge projects to a coordinate of
-1. The function therefore limits the coordinate to the grid before the snap,
and the party lands beside the block instead of at the origin.

The edge and door cases snap through `resolveReturnTile`, the parent-side
match of `resolveEntryTile`. It picks the nearest painted tile that is not a
wall and does not belong to the block just left, because a landing back on the
block reads as never having left. The stairway case skips the snap, because
the parent's staircase *is* a tile of that block, and the snap rejects every
tile of that block.

### Border crossing

A painted region usually touches other regions on its parent map, as the
regions of the example world do. A party that walks off a side of a region
where another region lies beyond goes straight into that region. It does not
stop on the parent map between them. `findExits` takes the traveler's cell in
the node as an `at` option, plus a `nodeById` lookup, and
`RegionCrossing.crossingFor` decides each side from that cell.

The traveler's coordinate along the side maps back onto the block's extent
with `projectBack`, the same projection that the return landing uses. A
painted block has an uneven outline, so `sideCell` finds the block's
outermost cell in that row or column and steps one cell further out.

When that parent cell links to another child of the same parent, and that
child is not an interior, the exit targets the child and records the cell as
`crossTileId`. An interior does not count, because the party enters a
structure through its door.

Each side decides at the traveler's own row or column, so one side can lead
into a neighbor region at one point and back to the parent at another.
`syncExits` runs on every party step, so the arrow label changes as the party
walks along the side.

`EntryPoint.computeCrossingEntryTile` picks the landing. It projects the
crossing cell on both axes onto the grid of the new region with
`projectAlong`, relative to the block that contains the cell, and snaps the
result through `resolveEntryTile`. A party that crosses near a corner of a
block lands near the matching corner of the map.

`app/mapExitTravel.js` does the crossing. It reads the crossing cell again,
because the GM can relink the cell while the arrow is on screen. A cell that
no longer leads to an outdoor sibling only moves the view to the parent.

The crossing reveals the parent cell, so the players' parent map shows where
the party went. It then writes the cell into the entry memory for the new
region, so the exits of that region and a later return to the parent read the
block that the party came in by. A player tab sees the name of the region
across the border only after that parent cell is revealed. Until then, the
arrow reads "Cross the border".

### Drawing and taking an exit

`MapView` has an `exits` field, set through `MapCanvas.setExits`. These
modules read it:

- `MapDecorations` draws an outward chevron and a "Return to {name}" or
  "Cross into {name}" label in the gutter beyond each `edge` exit.
  `MapMarkers` draws a small chevron badge on each `tile` exit.
- `MapCanvasPointer` hit-tests the same bands on a click.
- `MapCanvasKeyboard` arms an exit when a cursor key leaves the cursor
  stopped at a border that has one. The band brightens, a live region says to
  press again, and only a second separate press of the same arrow moves the
  party. Key repeats neither arm nor confirm an exit, so an arrow key held
  down sends the cursor to the border and stops it there. Any other action
  (a cursor move, another key, a pointer touch, a loss of focus, a change in
  the exits) cancels the arming (`MapCanvas.disarmExit`).
- `ui/ExitList.js` mounts the same exits as real buttons over the viewport,
  hidden until one takes focus. Keyboard and screen-reader users travel with
  these buttons. A list that contains only a `fallback` exit stays open
  instead, because the canvas draws no arrow and no badge for a fallback.
  Without the open list, a pointer user in a sealed interior sees no way out.
  When the list changes while one of its buttons has focus, focus moves to
  the first remaining button.

### Exit bands

`exitBandGeometry` plus `edgeExitBand` in `src/map/ExitBands.js` compute the
band's rectangle once. The drawing code and the pointer both call them, so
the arrow that the GM sees and the rectangle that a click is tested against
cannot differ.

The band is a bounded pill centered on the traveler's row or column (the
exit's `along`), kept within the canvas. When the GM pans the map's border out
of view, the arrow stays at the viewport edge.

HTML over the canvas, such as the mini-map, catches a click before the canvas
does, so a band under it cannot be clicked. `MapCanvas.setOccluders` takes the
rectangles, in buffer pixels, that such HTML covers, and the view passes them
into the band geometry.

`avoidOccluders` then slides a covered band along its own side, to the
nearest place just before or just past an occluder that stays on the canvas
and clear of every occluder. A west band under the mini-map moves down below
it, and a north band moves right. When no place is clear, the band stays where
it is.

`app/mapWiring.js` converts the mini-map's client rectangle with
`clientRectToBuffer`. It does this from a `ResizeObserver` on the mini-map and
on each canvas resize.

### Exit travel

`exitToParent` in `app/mapExitTravel.js` does the travel, and it moves
whoever a click moves. That is the whole party for the GM, and one character
while the split-party switch is on. A spectator tab moves no one, and it
follows the camera out instead.

A `tile` exit also stays an ordinary tile to walk onto. It leads out only
once the mover already stands on it, because otherwise the party could never
stand in a doorway. The exit buttons take the same door in one press.

`syncExits` in `app/mapWiring.js` is the one place that computes the list
again, and it updates the canvas and the button list together. It runs from
`syncPartyMarker`, which every path that changes the node in view already
calls. It also runs from `resyncMapViews`, the authoring paths in
`app/mapAuthoring.js`, the zoom-in branch of `onCellClick`, and the mode
switch. `travel.currentExits` returns an empty list outside Play mode,
because authoring a map is not the same as traveling it.

### The Build warning

`syncExits` also updates `authoringWarning(node, parent)`, the sentence that
Build mode shows the GM about the node in view. It looks at the same links
from the parent's side, and it reports these problems in the order that the
GM has to solve them:

1. No parent tile links here at all. The node is unreachable, and players
   never see it, whatever is painted inside.
2. A linked outdoor child has its block in blank parent terrain, so no side
   has anything to walk off onto. The fix is on the parent, beside the tiles
   that link here, not in the child.
3. A linked interior is sealed, with nothing painted to leave through.

The link comes first because it also decides the later answers. A staircase
counts as a way out only in the direction that the link runs, so stair advice
before a link exists is a guess. Once a link exists, the warning names that
direction and no other. A crypt level gets told about its stairs up, an upper
story about its stairs down, and a keep entered through a town door about a
door alone.

These warnings describe an unfinished map. A party is never stranded, because
`findExits` gives Play mode a fallback either way, and the check writes
nothing to the node.

The `#build-warning` element is a permanent `role="status"` live region, and
CSS hides it while it is empty. Its writes are compared against the last
text, because `syncExits` runs on every party step and every paint stroke,
and an unchanged sentence would otherwise be announced again each time.

### Warning badges in the world tree

The Build world tree runs the same check on every node. A row whose
`authoringWarning` is not null gets a warning badge, with the sentence as its
tooltip and accessible name. An unlinked tile therefore flags the orphaned
child as soon as the link breaks, not when the GM next views it.

The warning is part of the tree's redraw signature, and `syncExits` also
updates the tree. A stroke on the parent can seal or unseal a child without a
change to the rail warning for the node in view. Outside Build mode, the check
returns null, so a Play-mode party step never pays for a world scan.

`authoringWarning` is memoized on the node and parent objects, and
`stairwayTo` answers every child of a parent from one scan cached on the
parent's tile list. A stroke changes one node, so the redraw after it
computes the warnings of that node and its children only. With 273 nodes, the
pass costs 0.02 ms, where it costs 1.1 ms without the memo.

Most branches of the tree start closed, so a warning can be on a row that the
GM cannot see. A closed row therefore shows the count of warnings in its
branch, and the count badge hides when the branch opens. The row of the
current node is never inside a closed branch, because a change of the current
node opens every row that `ancestorIds` returns for it.

A search uses `filterWorldTree`, which keeps each matching node and the path
to it. Both functions are in `map/WorldTree.js` beside `buildWorldTree`, and
both have unit tests.

## The mini-map

The mini-map is the small picture of the parent map in the top-left corner of
the map. `src/map/MiniMap.js` computes what it shows, and `src/ui/MiniMap.js`
draws it.

`miniMapView(node, parent, position, throughTileId)` returns the parent, the
block of parent cells that links to the node, and the parent cell of the
party. It uses `blockFor` with the tile that the traveler entered through, as
`findExits` does, so a child with two blocks in the parent marks the block
that the party came in by. The result is null for the world and for a node
that no parent tile links to, and the widget then hides.

`approximateCell` finds the party's parent cell. It scales each axis of the
child onto the bounding box of the block with `projectBack`, which the border
crossing also uses. A painted block can have any outline, so the point then
moves to the nearest cell of the block. When the party stands on the parent
map itself, its own cell is the answer.

`paintTerrain` in `src/map/MiniMap.js` draws each parent tile's base image
and overlays at a few pixels per tile, with fog for an unrevealed tile outside
Build mode. It draws from the widget's own `TileRaster`, so each ref
rasterizes once per tile size.

The example world has 2,602 images across 2,304 tiles, but only 62 distinct
refs. Drawn from the SVG itself, the pass costs about 100 ms, because every
draw runs the vector rasterizer again. Drawn from the rasters, it costs about
4 ms, and the rasters themselves cost about 7 ms once per session.

The widget keeps the pass in an offscreen canvas keyed on the parent node
object and the tile size. It keeps one such canvas for Build mode and one for
Play mode, so a switch back to either mode draws nothing new. Node objects
never change in place, so the terrain can change only with a new parent
object. A party step inside the child then copies the cached pixels and draws
only the block outline and the party dot.

`syncExits` in `app/mapWiring.js` calls the widget's `update`, because every
path that moves the party, changes the node in view, repaints the parent, or
switches the mode already calls `syncExits`.
