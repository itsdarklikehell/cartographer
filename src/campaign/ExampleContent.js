import { exampleParty } from './ExampleParty.js';
import { createCreature, defaultEnemyGear } from '../entities/Creature.js';
import { enemyArmor } from '../entities/EquipmentPresets.js';
import { createClock } from '../time/GameClock.js';
import { defaultEnemyStats } from '../entities/Modifiers.js';

/** @typedef {import('../types/entities.js').EnemyTier} EnemyTier */
/** @typedef {import('../types/entities.js').EnemyWeapon} EnemyWeapon */
/** @typedef {import('../types/entities.js').EnemyArmor} EnemyArmor */
/** @typedef {import('./ExampleWorld.js').ExampleWorld} ExampleWorld */
/** @typedef {{ weapon?: EnemyWeapon | null, armor?: EnemyArmor | null }} Gear */

/**
 * The gear of a beast or a monster: one natural melee attack and no armor.
 * Its stat block AC is its natural armor.
 * @param {string} name @param {number} count @param {number} sides
 * @param {string} damageType
 * @returns {Gear}
 */
const natural = (name, count, sides, damageType) => ({
  weapon: { name, kind: 'melee', category: null, damage: [{ count, sides, damageType }] },
  armor: null,
});

const BITE = natural('Bite', 2, 4, 'piercing');
const GREAT_BITE = natural('Bite', 2, 6, 'piercing');
const CLAWS = natural('Claws', 2, 4, 'slashing');
const PINCER = natural('Claw', 1, 8, 'bludgeoning');
const SLAM = natural('Slam', 1, 6, 'bludgeoning');

// Stat block extras. An armored enemy sets DEX and an AC of 10 + DEX, so its
// worn armor gives the SRD AC: Leather Armor at DEX 14 is AC 13 and at DEX 12
// is AC 12. An unarmored enemy states its natural AC.
const GOBLIN = { DEX: 14, AC: 12, Speed: 30 };
const BANDIT = { DEX: 12, AC: 11, Speed: 30 };
const SKELETON = { DEX: 14, AC: 12, Speed: 30 };
const WOLF = { AC: 13, Speed: 40 };
const WINTER_WOLF = { AC: 13, Speed: 50 };
const ZOMBIE = { AC: 8, Speed: 20 };
const HARPY = { AC: 11, Speed: 20 };
const SCORPION = { AC: 15, Speed: 40 };
const DROWNED = { AC: 11, Speed: 20, Swim: 30 };

/**
 * A placed enemy. It combines default ability scores for the level and tier
 * with the stat block extras (AC, Speed, and more) a GM needs at the table.
 * The gear is the level and tier default, and `gear` replaces either piece.
 * Every enemy carries a challenge rating, which is what the difficulty hint
 * adds up.
 * @param {string} id @param {string} name @param {number} hp
 * @param {number} level @param {EnemyTier} tier @param {number} cr
 * @param {string} nodeId @param {string} tileId
 * @param {Record<string, number>} extras @param {Gear} gear
 */
const enemy = (id, name, hp, level, tier, cr, nodeId, tileId, extras, gear) =>
  createCreature(id, name, {
    disposition: 'hostile',
    maxHP: hp,
    stats: { ...defaultEnemyStats(level, tier), ...extras },
    location: { nodeId, tileId },
    level,
    tier,
    cr,
    ...gear,
  });

/** A placed enemy of the rank and file, the common case. Same fields as
 * `enemy`, with the mob tier implied.
 * @param {string} id @param {string} name @param {number} hp
 * @param {number} level @param {number} cr
 * @param {string} nodeId @param {string} tileId
 * @param {Record<string, number>} extras @param {Gear} [gear] */
const mob = (id, name, hp, level, cr, nodeId, tileId, extras, gear = {}) =>
  enemy(id, name, hp, level, 'mob', cr, nodeId, tileId, extras, gear);

/** A placed enemy above the rank and file: a named boss or a lieutenant. Same
 * fields as `mob`, with the legend tier implied.
 * @param {string} id @param {string} name @param {number} hp
 * @param {number} level @param {number} cr
 * @param {string} nodeId @param {string} tileId
 * @param {Record<string, number>} extras @param {Gear} [gear] */
const legend = (id, name, hp, level, cr, nodeId, tileId, extras, gear = {}) =>
  enemy(id, name, hp, level, 'legend', cr, nodeId, tileId, extras, gear);

/**
 * A townsperson or story figure, placed or roaming.
 * @param {string} id @param {string} name
 * @param {Parameters<typeof createCreature>[2]} options
 */
const person = (id, name, options) => createCreature(id, name, options);

/**
 * A reusable bestiary blueprint for the campaign's common enemies. The gear
 * is the level and tier default with `gear` over it, stored explicitly,
 * because the merged template format has no absent-means-default rule.
 * Every template is a mob, and it carries its challenge rating, so a creature
 * spawned from one counts in the difficulty hint.
 * @param {string} id @param {string} name @param {number} hp
 * @param {number} level @param {number} cr
 * @param {Record<string, number>} extras @param {Gear} [gear]
 * @returns {import('../types/creature.js').CreatureTemplate}
 */
const template = (id, name, hp, level, cr, extras, gear = {}) => ({
  id,
  name,
  disposition: 'hostile',
  maxHP: hp,
  stats: { ...defaultEnemyStats(level, 'mob'), ...extras },
  level,
  tier: /** @type {EnemyTier} */ ('mob'),
  cr,
  ...defaultEnemyGear(level, 'mob'),
  ...gear,
});

/**
 * A lookup of the story places of the example world. A name that the world
 * did not place throws, so a typo fails the build instead of leaving a
 * creature nowhere.
 * @param {ExampleWorld} world
 * @returns {(name: string) => import('./ExampleWorld.js').Place}
 */
function placer(world) {
  return (name) => {
    const place = world.places[name];
    if (!place) throw new Error(`The example world has no place named ${name}.`);
    return { ...place };
  };
}

/**
 * Everything that populates the example world: the party, placed enemies,
 * the quest chain, the NPCs of Briarwick, Saltmere, and Thornhold, handouts,
 * and the bestiary. It takes the built maps, so NPCs and bosses land on the
 * story places that ExampleRegions.js chose. The maps come from
 * ExampleWorld.js. Campaigns.js combines the two halves.
 * @param {ExampleWorld} world
 * @returns {Omit<import('./Campaigns.js').Campaign, 'grid'>}
 */
export function buildExampleContent(world) {
  const at = placer(world);
  /** @param {string} name @returns {[string, string]} */
  const spot = (name) => {
    const { nodeId, tileId } = at(name);
    return [nodeId, tileId];
  };
  return {
    party: at('start'),
    // Nobody has traveled yet, so no child has been entered through a tile.
    entryTiles: {},
    characters: exampleParty(),
    creatures: [
      // Field enemies on the overworld, one type for each biome.
      mob('goblin-scout', 'Goblin Scout', 7, 1, 0.25, ...spot('goblinScout'), GOBLIN),
      mob('gray-wolf-1', 'Gray Wolf', 11, 1, 0.25, ...spot('wolf1'), WOLF, BITE),
      mob('gray-wolf-2', 'Gray Wolf', 11, 1, 0.25, ...spot('wolf2'), WOLF, BITE),
      mob('bandit-1', 'Roadside Bandit', 11, 1, 0.125, ...spot('bandit1'), BANDIT),
      mob('bandit-2', 'Roadside Bandit', 11, 1, 0.125, ...spot('bandit2'), BANDIT),
      mob('bog-zombie-1', 'Bog Zombie', 22, 2, 0.25, ...spot('bogZombie1'), ZOMBIE, SLAM),
      mob('bog-zombie-2', 'Bog Zombie', 22, 2, 0.25, ...spot('bogZombie2'), ZOMBIE, SLAM),
      mob('hill-harpy', 'Harpy', 24, 2, 1, ...spot('harpy'), HARPY, CLAWS),
      mob('giant-scorpion', 'Giant Scorpion', 26, 3, 3, ...spot('scorpion'), SCORPION, PINCER),
      mob('winter-wolf', 'Winter Wolf', 34, 3, 3, ...spot('winterWolf'), WINTER_WOLF, GREAT_BITE),
      // The bay: drowned dead walk the shallows below Saltmere, and
      // something knocks in the abandoned silver mine.
      mob('drowned-watchman-1', 'Drowned Watchman', 22, 2, 0.5, ...spot('drowned1'), DROWNED, SLAM),
      mob('drowned-watchman-2', 'Drowned Watchman', 22, 2, 0.5, ...spot('drowned2'), DROWNED, SLAM),
      mob(
        'hollowvein-knocker',
        'The Knocker in the Vein',
        30,
        3,
        2,
        ...spot('knocker'),
        {
          AC: 14,
          Speed: 30,
        },
        natural('Claws', 1, 8, 'slashing'),
      ),
      // Minor bosses: the mire hag in the southern marsh, the goblin chieftain
      // at his camp, and the wyvern over the hermitage.
      legend(
        'grelka',
        'Grelka the Mire Hag',
        45,
        4,
        3,
        ...spot('grelka'),
        {
          AC: 15,
          Speed: 30,
        },
        natural('Claws', 2, 8, 'slashing'),
      ),
      mob('goblin-raider-1', 'Goblin Raider', 7, 1, 0.25, ...spot('raider1'), GOBLIN),
      mob('goblin-raider-2', 'Goblin Raider', 7, 1, 0.25, ...spot('raider2'), GOBLIN),
      // Chain Mail, the legend default below level 5, gives AC 16.
      legend('snagtooth', 'Chieftain Snagtooth', 36, 3, 1, ...spot('snagtooth'), { Speed: 30 }),
      legend(
        'skalvyr',
        'Skalvyr the Wyvern',
        68,
        5,
        6,
        ...spot('skalvyr'),
        {
          AC: 16,
          Speed: 20,
          Fly: 80,
        },
        natural('Stinger', 2, 6, 'piercing'),
      ),
      // The barrow: pickets, the seneschal, and the major boss at the tomb.
      mob('barrow-skeleton-1', 'Barrow Skeleton', 13, 1, 0.25, ...spot('skeleton1'), SKELETON),
      mob('barrow-skeleton-2', 'Barrow Skeleton', 13, 1, 0.25, ...spot('skeleton2'), SKELETON),
      // Studded Leather at DEX 14 gives AC 14.
      legend(
        'grave-wight',
        'Grave Wight',
        45,
        4,
        3,
        ...spot('wight'),
        { DEX: 14, AC: 12, Speed: 30 },
        { armor: enemyArmor('Studded Leather') },
      ),
      // Thornhold: the shade of the warden who sealed the barrow, risen in
      // the keep's own hall now that the ward is failing.
      legend(
        'crypt-shade',
        'The Crypt Shade',
        40,
        4,
        3,
        ...spot('shade'),
        {
          AC: 14,
          Speed: 30,
        },
        natural('Withering Touch', 2, 6, 'necrotic'),
      ),
      // Plate, the legend default from level 5, gives AC 18.
      legend('ostrand', 'King Ostrand the Risen', 110, 8, 8, ...spot('ostrand'), { Speed: 30 }),
      // The people of the Marches share the same list as the field enemies.
      person('caravan-master-dorn', 'Dorn', {
        role: 'Caravan master, stranded at the crossroads',
        disposition: 'neutral',
        notes:
          'Blunt and impatient. Pays for road news, and points anyone who looks capable at Bram in Briarwick.',
        stats: { STR: 12, CON: 14, CHA: 12 },
        location: at('dorn'),
      }),
      person('innkeeper-bram', 'Bram', {
        role: 'Innkeeper, the Waystation at Briarwick',
        disposition: 'friendly',
        notes:
          'Knows every road north and gossips freely for a warm meal. First to mention the raids, the open graves, and the hermit Odo.',
        stats: { INT: 12, WIS: 14, CHA: 13 },
        location: at('bram'),
      }),
      person('reeve-maera', 'Reeve Maera', {
        role: 'Reeve of Briarwick',
        disposition: 'neutral',
        notes:
          "Keeps the shire records. Recognizes the pale crown as King Ostrand's seal — and knows the barrow was warded shut for a reason.",
        stats: { INT: 14, WIS: 15, CHA: 12 },
        location: at('maera'),
      }),
      person('sella-the-smith', 'Sella', {
        role: 'Blacksmith of Briarwick',
        disposition: 'friendly',
        notes:
          'Buys ore, sells and repairs arms. Can reforge the warding key if it comes back from the barrow broken — but only from Hollowvein silver, and the mine stands abandoned.',
        stats: { STR: 15, CON: 14 },
        location: at('sella'),
      }),
      person('sister-alwyn', 'Sister Alwyn', {
        role: 'Priestess of the Dawn, Briarwick temple',
        disposition: 'friendly',
        notes:
          'Blesses weapons against the risen dead once the party learns what walks in the barrow. Quietly terrified of the open graves.',
        stats: { INT: 12, WIS: 16, CHA: 14 },
        location: at('alwyn'),
      }),
      person('hermit-odo', 'Odo', {
        role: 'Hermit, keeper of the warding key',
        disposition: 'neutral',
        notes:
          "Half-deaf and stubborn. Won't leave the hermitage while Skalvyr circles; hands over the key once the wyvern is dealt with.",
        stats: { CON: 13, INT: 13, WIS: 16 },
        location: at('odo'),
      }),
      person('harbormaster-petra', 'Harbormaster Petra', {
        role: 'Harbormaster of Saltmere',
        disposition: 'neutral',
        notes:
          'Runs the port and taxes what Corvin thinks she cannot see. Pays a bounty on the drowned dead and keeps the tide-log that shows they walk up-current from the river mouth.',
        stats: { STR: 12, WIS: 14, CHA: 13 },
        location: at('petra'),
      }),
      person('corvin-the-smuggler', 'Corvin', {
        role: 'Smuggler, working out of the Saltmere taproom',
        disposition: 'neutral',
        notes:
          'Sells anything, including his chart of the coast. Refuses cargo bound near the barrow and will say why for coin: his last crew there came back one man short, and the man came back anyway.',
        stats: { DEX: 15, INT: 13, CHA: 14 },
        location: at('corvin'),
      }),
      person('lord-aldemar', 'Lord Aldemar Vane', {
        role: 'Lord of Thornhold, heir to the wardens',
        disposition: 'hostile',
        notes:
          "Proud and in denial: the raids are peasant panic and his house's ward cannot fail. Softens only when shown Snagtooth's orders under the pale seal; opens the crypt ledger once the shade in his hall is put down.",
        stats: { STR: 14, INT: 12, WIS: 13, CHA: 15 },
        // A hostile story figure rather than a fight, but the difficulty hint
        // counts every hostile creature, so he carries the rating of a noble.
        cr: 0.125,
        location: at('aldemar'),
      }),
      person('farmer-hedda', 'Hedda', {
        role: 'Farmer, the big steading on the south road',
        disposition: 'friendly',
        notes:
          'Sells provisions and knows every field hand between Briarwick and the coast. Saw the burned farm the night it went up: the raiders worked in silence, in files, to a drum nobody was beating.',
        stats: { CON: 14, WIS: 13 },
        location: at('hedda'),
      }),
    ],
    travelog: [],
    quests: [
      {
        id: 'rumors-at-the-waystation',
        title: 'Rumors at the Waystation',
        notes:
          "Dorn's caravan is stuck at the crossroads until the roads are safe. Ask Bram at the Waystation inn in Briarwick what has the north country spooked.",
        status: 'active',
        revealed: true,
        objectives: [
          { id: 'o1', text: 'Find Bram at the Waystation inn', done: false, hidden: false },
          { id: 'o2', text: 'Learn what has the north spooked', done: false, hidden: false },
          { id: 'o3', text: 'Bram names the hermit Odo', done: false, hidden: true },
        ],
        links: [
          { kind: 'place', nodeId: 'briarwick', tileId: null },
          { kind: 'creature', creatureId: 'innkeeper-bram' },
          { kind: 'creature', creatureId: 'caravan-master-dorn' },
        ],
      },
      {
        id: 'wolves-on-the-highway',
        title: 'Wolves on the Highway',
        notes:
          'A wolf pack has been running down travelers on the east highway below the Graypeak foothills. Drive it off so the caravans can move again.',
        status: 'active',
        revealed: true,
        objectives: [
          { id: 'o1', text: 'Find the pack on the east highway', done: false, hidden: false },
          { id: 'o2', text: 'Drive the wolves off', done: false, hidden: false },
          { id: 'o3', text: 'Dorn pays and moves his caravan', done: false, hidden: true },
        ],
        links: [{ kind: 'creature', creatureId: 'caravan-master-dorn' }],
      },
      {
        id: 'the-goblin-raids',
        title: 'The Goblin Raids',
        notes:
          'Goblins out of the Northmarch have burned two farms. Find their camp in the deep forest and deal with Chieftain Snagtooth — then search the camp. The raids are far too organized for goblins.',
        status: 'active',
        revealed: false,
        objectives: [
          { id: 'o1', text: 'Find the goblin camp', done: false, hidden: false },
          { id: 'o2', text: 'Deal with Chieftain Snagtooth', done: false, hidden: false },
          { id: 'o3', text: 'Search the camp for his orders', done: false, hidden: true },
        ],
        links: [{ kind: 'place', nodeId: 'northmarch', tileId: null }],
      },
      {
        id: 'the-pale-seal',
        title: "The Pale King's Seal",
        notes:
          "Snagtooth's orders bear a pale crown pressed into gray wax. Bring them to Reeve Maera in Briarwick; she keeps the shire records of the barrow and the king inside it.",
        status: 'active',
        revealed: false,
        objectives: [],
        links: [],
      },
      {
        id: 'the-hermit-of-graypeak',
        title: 'The Hermit of Graypeak',
        notes:
          "Odo the hermit keeps the warding key that seals the barrow's door. He hasn't come down for supplies since the wyvern Skalvyr nested above his hermitage.",
        status: 'active',
        revealed: false,
        objectives: [],
        links: [],
      },
      {
        id: 'the-mire-hags-bargain',
        title: "The Mire Hag's Bargain (optional)",
        notes:
          "Grelka the mire hag brews a grave-ward that turns a wight's chill. She trades fair, but never for coin — she names her price when asked, and it is always strange.",
        status: 'active',
        revealed: false,
        objectives: [],
        links: [],
      },
      {
        id: 'dead-water',
        title: 'Dead Water',
        notes:
          "Drowned sailors are walking the shallows of Saltmere's bay, and the fishing fleet won't put out. Harbormaster Petra pays by the head — and wants to know why the dead are coming up-current, from the river's mouth.",
        status: 'active',
        revealed: false,
        objectives: [],
        links: [],
      },
      {
        id: 'the-lord-of-thornhold',
        title: 'The Lord of Thornhold',
        notes:
          "House Vane swore the ward that sealed the barrow, and Lord Aldemar calls the raids peasant panic. Bring him Snagtooth's sealed orders as proof; the crypt ledger of Thornhold records how the sealing was done, and something in his own hall does not want it read.",
        status: 'active',
        revealed: false,
        objectives: [],
        links: [],
      },
      {
        id: 'the-hollowvein-knocking',
        title: 'The Hollowvein Knocking (optional)',
        notes:
          'The Hollowvein — the mine whose silver crowned Ostrand — was abandoned mid-shift when something in the dark began knocking back. Sella needs Hollowvein silver if the warding key is ever to be reforged.',
        status: 'active',
        revealed: false,
        objectives: [],
        links: [],
      },
      {
        id: 'the-wardstone-circle',
        title: 'The Wardstone Circle (optional)',
        notes:
          'One of the five wardstones in the northern forest lies toppled, and the ward on the barrow fails with it. Raising the fallen stone will not hold Ostrand — but it will thin his court, and his reach past the barrow door with it.',
        status: 'active',
        revealed: false,
        objectives: [],
        links: [],
      },
      {
        id: 'the-barrow-king',
        title: 'The Barrow of the Old King',
        notes:
          'King Ostrand has risen and his reach is spreading. Take the warding key into the barrow, put down his risen court, and end him at his tomb.',
        status: 'active',
        revealed: false,
        objectives: [],
        links: [],
      },
    ],
    clock: createClock(),
    handouts: [
      {
        id: 'waystation-rumor',
        title: 'A Rumor at the Waystation',
        body: '"Goblins, aye — but goblins don\'t march in files, and they don\'t carry writs. Something up in the old barrow has been giving orders." — Bram, over a mug',
        nodeId: 'world',
        revealed: false,
        image: null,
        tileId: null,
        audience: null,
      },
      {
        id: 'snagtooth-orders',
        title: "Snagtooth's Orders",
        body: 'A crumpled writ in a cramped, elegant hand: "Burn the farms. Keep the road watched. Let none reach the mountain hermit before my crown is brought to me." It is sealed with a pale crown pressed into gray wax.',
        nodeId: 'northmarch',
        revealed: false,
        image: null,
        tileId: null,
        audience: null,
      },
      {
        id: 'odos-warning',
        title: "Odo's Warning",
        body: '"The key turns a lock, not a king. Ostrand was buried with his sword, his crown, and his pride — the ward kept folk out, but it kept him in just as well. Break it, go down, and finish what the old rites could not."',
        nodeId: 'graypeak',
        revealed: false,
        image: null,
        tileId: null,
        audience: null,
      },
      {
        id: 'barrow-inscription',
        title: 'Inscription over the Barrow Door',
        body: 'Carved in the old tongue above the lintel: "HERE LIES OSTRAND, KING OF THE MARCHES, WHO WOULD NOT LIE STILL. SEALED IN THE FORTIETH YEAR. PRAY THE WARD OUTLASTS HIS PATIENCE."',
        nodeId: 'barrow',
        revealed: false,
        image: null,
        tileId: null,
        audience: null,
      },
      {
        id: 'legend-of-ostrand',
        title: 'The Legend of King Ostrand',
        body: 'Every fireside in the Marches tells it differently, but the bones agree: a king who beggared his shires building a tomb grander than his keep, crowned in pale silver, sealed in by his own council — and patient.',
        nodeId: null,
        revealed: false,
        image: null,
        tileId: null,
        audience: null,
      },
      {
        id: 'smugglers-chart',
        title: "A Smuggler's Chart",
        body: "Corvin's coast chart, greasy and precise. Every landing on the bay is marked with a price — except one reach of the river mouth, crossed out entirely. Over the barrow inland someone has inked a pale crown and, beneath it: NO CARGO. NOT FOR TRIPLE.",
        nodeId: 'saltmere',
        revealed: false,
        image: null,
        tileId: null,
        audience: null,
      },
      {
        id: 'crypt-ledger',
        title: 'The Crypt Ledger of Thornhold',
        body: 'The sealing, in the first Vane\'s own hand: "Five stones raised and sworn at the circle. A key cut of Hollowvein silver, the same vein that crowned him — like binds like. The door holds while the circle stands and a warden\'s line keeps the key. We do not write where the key is kept. He listens."',
        nodeId: 'thornhold',
        revealed: false,
        image: null,
        tileId: null,
        audience: null,
      },
      {
        id: 'wardens-oath',
        title: "The Wardens' Oath",
        body: 'Cut into the tallest wardstone, worn shallow: "WHILE STONE STANDS AND SILVER SLEEPS, THE KING KEEPS HIS BED. FIVE SWORE. FIVE KEEP." Below, much newer, scratched as if with a knife-point: "four".',
        nodeId: 'world',
        revealed: false,
        image: null,
        tileId: null,
        audience: null,
      },
    ],
    bestiary: [
      template('goblin', 'Goblin', 7, 1, 0.25, GOBLIN),
      template('gray-wolf', 'Gray Wolf', 11, 1, 0.25, WOLF, BITE),
      template('bandit', 'Bandit', 11, 1, 0.125, BANDIT),
      template('bog-zombie', 'Bog Zombie', 22, 2, 0.25, ZOMBIE, SLAM),
      template('harpy', 'Harpy', 24, 2, 1, HARPY, CLAWS),
      template('giant-scorpion', 'Giant Scorpion', 26, 3, 3, SCORPION, PINCER),
      template('winter-wolf', 'Winter Wolf', 34, 3, 3, WINTER_WOLF, GREAT_BITE),
      template('barrow-skeleton', 'Barrow Skeleton', 13, 1, 0.25, SKELETON),
      template('drowned-watchman', 'Drowned Watchman', 22, 2, 0.5, DROWNED, SLAM),
    ],
    splitParty: false,
    combat: null,
  };
}
