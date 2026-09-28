import { createCreature, defaultEnemyGear } from '../entities/Creature.js';
import { enemyArmor } from '../entities/EquipmentPresets.js';
import { defaultEnemyStats } from '../entities/Modifiers.js';

/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */
/** @typedef {import('../types/entities.js').EnemyTier} EnemyTier */
/** @typedef {import('../types/entities.js').EnemyWeapon} EnemyWeapon */
/** @typedef {import('./ExampleWorld.js').Place} Place */

/**
 * The options that a creature adds to its stats: gear, training, damage
 * defenses, and GM notes. Anything left out takes the default of
 * `createCreature`, and the gear takes the level and tier default.
 * @typedef {Omit<Parameters<typeof createCreature>[2], 'stats' | 'location'>} Kit
 */

/**
 * The gear of a beast or a monster: one natural melee attack and no armor.
 * Its stat block AC is its natural armor.
 * @param {string} name @param {number} count @param {number} sides
 * @param {string} damageType
 * @returns {{ weapon: EnemyWeapon, armor: null }}
 */
const natural = (name, count, sides, damageType) => ({
  weapon: { name, kind: 'melee', category: null, damage: [{ count, sides, damageType }] },
  armor: null,
});

/** @param {string[]} saves @param {string[]} skills */
const trained = (saves, skills) => ({ proficiencies: { saves, skills } });

/** @param {string[]} immune @param {string[]} [resist] @param {string[]} [vulnerable] */
const guards = (immune, resist = [], vulnerable = []) => ({
  defenses: { resist, vulnerable, immune },
});

const DAGGER = {
  name: 'Dagger',
  kind: /** @type {'melee'} */ ('melee'),
  category: /** @type {'simple'} */ ('simple'),
  damage: [{ count: 1, sides: 4, damageType: 'piercing' }],
};

// Stat block extras. An armored enemy sets DEX and an AC of 10 + DEX, so its
// worn armor gives the SRD AC: Leather Armor at DEX 14 is AC 13 and at DEX 12
// is AC 12. An unarmored enemy states its natural AC.
const GOBLIN = { DEX: 14, AC: 12 };
const BANDIT = { DEX: 12, AC: 11 };
const SKELETON = { DEX: 14, AC: 12 };
const WOLF = { AC: 13 };
const ZOMBIE = { AC: 8 };
const HARPY = { AC: 11 };
const SCORPION = { AC: 15 };
const DROWNED = { AC: 11 };

// The gear, training, and defenses of each kind of creature, shared by the
// placed creatures and the bestiary.
const SNEAK = trained([], ['stealth']);
const PACK = { ...natural('Bite', 2, 4, 'piercing'), ...trained([], ['perception', 'stealth']) };
const SKELETAL = guards(['poison'], [], ['bludgeoning']);
const ROTTING = {
  ...natural('Slam', 1, 6, 'bludgeoning'),
  ...guards(['poison']),
  ...trained(['WIS'], []),
};
const DROWNING = { ...natural('Slam', 1, 6, 'bludgeoning'), ...guards(['poison'], ['cold']) };
const HARPY_KIT = natural('Claws', 2, 4, 'slashing');
const SCORPION_KIT = natural('Claw', 1, 8, 'bludgeoning');
const WINTER_KIT = {
  ...natural('Bite', 2, 6, 'piercing'),
  ...guards(['cold']),
  ...trained([], ['perception', 'stealth']),
};
const CULTIST_KIT = trained([], ['deception', 'religion']);

/**
 * A placed enemy. It combines default ability scores for the level and tier
 * with the stat block extras (AC, and DEX for armored foes) a GM needs at the
 * table. Every enemy carries a challenge rating, which is what the
 * difficulty hint adds up.
 * @param {EnemyTier} tier
 */
const foe =
  (tier) =>
  /**
   * @param {string} id @param {string} name @param {number} hp
   * @param {number} level @param {number} cr @param {Place} place
   * @param {Record<string, number>} extras @param {Kit} [kit]
   * @returns {Creature}
   */
  (id, name, hp, level, cr, place, extras, kit = {}) =>
    createCreature(id, name, {
      disposition: 'hostile',
      maxHP: hp,
      stats: { ...defaultEnemyStats(level, tier), ...extras },
      location: place,
      level,
      tier,
      cr,
      ...kit,
    });

/** An enemy of the rank and file, the common case. */
const mob = foe('mob');
/** An enemy above the rank and file: a named boss or a lieutenant. */
const legend = foe('legend');

/**
 * A reusable bestiary blueprint for the campaign's common enemies. The gear
 * is the level and tier default with the kit over it, stored explicitly,
 * because the merged template format has no absent-means-default rule.
 * Every template is a mob with a challenge rating, so a creature spawned
 * from one counts in the difficulty hint.
 * @param {string} id @param {string} name @param {number} hp
 * @param {number} level @param {number} cr
 * @param {Record<string, number>} extras @param {Partial<CreatureTemplate>} [kit]
 * @returns {CreatureTemplate}
 */
const template = (id, name, hp, level, cr, extras, kit = {}) => ({
  id,
  name,
  disposition: 'hostile',
  maxHP: hp,
  stats: { ...defaultEnemyStats(level, 'mob'), ...extras },
  level,
  tier: /** @type {EnemyTier} */ ('mob'),
  cr,
  ...defaultEnemyGear(level, 'mob'),
  ...kit,
});

/**
 * The enemies of the example world, from the wolves on the Vale Road to King
 * Ostrand in his tomb, each on the story place that `at` names.
 * @param {(name: string) => Place} at
 * @returns {Creature[]}
 */
function enemies(at) {
  return [
    // Field enemies on the overworld, one type for each biome.
    mob('goblin-scout', 'Goblin Scout', 7, 1, 0.25, at('goblinScout'), GOBLIN, SNEAK),
    mob('gray-wolf-1', 'Gray Wolf', 11, 1, 0.25, at('wolf1'), WOLF, PACK),
    mob('gray-wolf-2', 'Gray Wolf', 11, 1, 0.25, at('wolf2'), WOLF, PACK),
    mob('bandit-1', 'Roadside Bandit', 11, 1, 0.125, at('bandit1'), BANDIT),
    mob('bandit-2', 'Roadside Bandit', 11, 1, 0.125, at('bandit2'), BANDIT),
    mob('bog-zombie-1', 'Bog Zombie', 22, 2, 0.25, at('bogZombie1'), ZOMBIE, ROTTING),
    mob('bog-zombie-2', 'Bog Zombie', 22, 2, 0.25, at('bogZombie2'), ZOMBIE, ROTTING),
    mob('hill-harpy', 'Harpy', 24, 2, 1, at('harpy'), HARPY, HARPY_KIT),
    mob('giant-scorpion', 'Giant Scorpion', 26, 3, 3, at('scorpion'), SCORPION, SCORPION_KIT),
    mob('winter-wolf', 'Winter Wolf', 34, 3, 3, at('winterWolf'), { AC: 13 }, WINTER_KIT),
    // The crew of the Gull, Corvin's lost boat, walk the Saltmere docks.
    mob('drowned-watchman-1', 'Drowned Sailor', 22, 2, 0.5, at('drowned1'), DROWNED, {
      ...DROWNING,
      notes: 'Crew of the Gull. Each one still wears a sack of pale Hollowvein silver on its belt.',
    }),
    mob('drowned-watchman-2', 'Drowned Sailor', 22, 2, 0.5, at('drowned2'), DROWNED, DROWNING),
    mob(
      'hollowvein-knocker',
      'The Knocker in the Vein',
      30,
      3,
      2,
      at('knocker'),
      { AC: 14 },
      {
        ...natural('Claws', 1, 8, 'slashing'),
        ...trained([], ['perception', 'stealth']),
        ...guards([], ['bludgeoning']),
        notes:
          'A spirit that the wardens bound to the silver of the vein. It sleeps while the vein wards are whole. The diggers of the Castellan broke them, and it killed the last shift. It knocks three times before it strikes. A character who reads the sigils in the notes of Tam Hollowell can bind it again with a DC 13 Arcana check instead of a fight.',
      },
    ),
    legend(
      'grelka',
      'Grelka the Mire Hag',
      45,
      4,
      3,
      at('grelka'),
      { AC: 15 },
      {
        ...natural('Claws', 2, 8, 'slashing'),
        ...trained([], ['arcana', 'deception', 'perception', 'stealth']),
      },
    ),
    // The Northmarch: the raiders who toppled the wardstone.
    mob('goblin-raider-1', 'Goblin Raider', 7, 1, 0.25, at('raider1'), GOBLIN, SNEAK),
    mob('goblin-raider-2', 'Goblin Raider', 7, 1, 0.25, at('raider2'), GOBLIN, SNEAK),
    // Chain Mail, the legend default below level 5, gives AC 16.
    legend(
      'snagtooth',
      'Chieftain Snagtooth',
      36,
      3,
      1,
      at('snagtooth'),
      {},
      {
        ...trained([], ['intimidation', 'stealth']),
        notes:
          'Paid in pale silver ingots stamped with the thorn of House Vane. He never met his patron. A hooded rider brings the orders and the silver to the camp at each new moon. He surrenders at half hit points and trades the orders for his life.',
      },
    ),
    legend(
      'skalvyr',
      'Skalvyr the Wyvern',
      68,
      5,
      6,
      at('skalvyr'),
      { AC: 16 },
      {
        ...natural('Stinger', 2, 6, 'piercing'),
        ...trained([], ['perception']),
      },
    ),
    // Thornhold: the shade in the hall, and the Pale-sworn in the dungeons.
    legend(
      'crypt-shade',
      'The Crypt Shade',
      40,
      4,
      3,
      at('shade'),
      { AC: 14 },
      {
        ...natural('Withering Touch', 2, 6, 'necrotic'),
        ...guards(
          ['necrotic', 'poison'],
          ['acid', 'cold', 'fire', 'lightning', 'thunder'],
          ['radiant'],
        ),
        ...trained([], ['stealth']),
        notes:
          'The shade of Edric Vane, the warden who sealed the barrow. It woke when the pale seal left the crypt, and it attacks anyone who carries House Vane blood or the Vane signet. Once put down, it leaves the crypt ledger open on the high table.',
      },
    ),
    mob('pale-sworn-1', 'Pale-sworn Cultist', 9, 1, 0.125, at('cultist1'), BANDIT, {
      ...CULTIST_KIT,
      weapon: DAGGER,
      role: 'Pale-sworn',
      notes: 'A Thornhold servant who hears the crown through the Castellan. Guards her ledger.',
    }),
    mob('pale-sworn-2', 'Pale-sworn Acolyte', 16, 2, 0.25, at('cultist2'), BANDIT, {
      ...CULTIST_KIT,
      role: 'Pale-sworn',
      class: 'cleric',
      casterLevel: 1,
      spellbook: {
        cantrips: ['sacred-flame', 'guidance'],
        known: ['bane', 'inflict-wounds'],
        prepared: ['bane', 'inflict-wounds'],
      },
    }),
    // The barrow: the pickets, the wight, and King Ostrand at his tomb.
    mob('barrow-skeleton-1', 'Barrow Skeleton', 13, 1, 0.25, at('skeleton1'), SKELETON, SKELETAL),
    mob('barrow-skeleton-2', 'Barrow Skeleton', 13, 1, 0.25, at('skeleton2'), SKELETON, SKELETAL),
    // Studded Leather at DEX 14 gives AC 14.
    legend(
      'grave-wight',
      'Grave Wight',
      45,
      4,
      3,
      at('wight'),
      { DEX: 14, AC: 12 },
      {
        armor: enemyArmor('Studded Leather'),
        ...guards(['poison'], ['necrotic']),
        ...trained([], ['perception', 'stealth']),
      },
    ),
    // Plate, the legend default from level 5, gives AC 18.
    legend(
      'ostrand',
      'King Ostrand the Risen',
      110,
      8,
      8,
      at('ostrand'),
      {},
      {
        ...guards(['poison'], ['necrotic']),
        ...trained(['STR', 'CON', 'WIS'], ['athletics', 'intimidation', 'perception']),
        notes:
          'Crowned in pale Hollowvein silver. He speaks to the Castellan in her dreams, and he knows what the party has said near any wight or skeleton. While all five wardstones stand, he has disadvantage on attack rolls against a creature that carries the warding key.',
      },
    ),
  ];
}

/**
 * The people of the Marches. The `role` of each one shows to the players, so
 * it names only what the town knows. The secrets live in the GM notes. The
 * party starts with Dorn's caravan, Wren owes Corvin a run, and Aldric
 * served House Vane, so those four are known from the start.
 * @param {(name: string) => Place} at
 * @returns {Creature[]}
 */
function people(at) {
  return [
    createCreature('caravan-master-dorn', 'Dorn', {
      role: 'Caravan master, stranded at the crossroads',
      disposition: 'neutral',
      met: true,
      notes:
        'Blunt and impatient. He came west from the Eastmarch with six crates sealed in gray wax and a fee paid twice over not to open them. They go to "the Castellan, Thornhold". He does not know what is inside, and he does not want to know. He points anyone capable at Bram in Briarwick.',
      stats: { STR: 12, CON: 14, CHA: 12 },
      location: at('dorn'),
    }),
    createCreature('innkeeper-bram', 'Bram', {
      role: 'Innkeeper, the Waystation at Briarwick',
      disposition: 'friendly',
      notes:
        'Knows every road and gossips freely for a warm meal. First to mention the raids, the open graves, and the hermit Odo. A rider from Thornhold pays him to hold letters for Dorn.',
      stats: { INT: 12, WIS: 14, CHA: 13 },
      location: at('bram'),
    }),
    createCreature('reeve-maera', 'Reeve Maera', {
      role: 'Reeve of Briarwick',
      disposition: 'neutral',
      notes:
        'Keeps the shire records. She knows the pale crown as the seal of King Ostrand, and she knows that the seal lies in the Thornhold crypt. Wax this fresh means that someone took it out. The hand of the orders is familiar to her, but she cannot place it (DC 15 Insight to see that she fears to name a Vane).',
      stats: { INT: 14, WIS: 15, CHA: 12 },
      location: at('maera'),
    }),
    createCreature('sella-the-smith', 'Sella', {
      role: 'Blacksmith of Briarwick',
      disposition: 'friendly',
      notes:
        'Buys ore and sells and repairs arms. She can recast a broken warding key, but only from pale silver out of Hollowvein or the lost tithe of the Silver Road. She sold a key mold of the old pattern to a Thornhold rider last spring and regrets it.',
      stats: { STR: 15, CON: 14 },
      location: at('sella'),
    }),
    createCreature('sister-alwyn', 'Sister Alwyn', {
      role: 'Priestess of the Dawn, Briarwick temple',
      disposition: 'friendly',
      notes:
        'She wrote to the temple for Mirelle. The graves in her yard were opened from the inside. She blesses weapons against the risen dead: for one day, a blessed weapon deals radiant damage.',
      stats: { INT: 12, WIS: 16, CHA: 14 },
      location: at('alwyn'),
    }),
    createCreature('farmer-hedda', 'Hedda', {
      role: 'Farmer, the big steading on the south road',
      disposition: 'friendly',
      notes:
        'Sells provisions and knows every field hand in the vale. She saw the burned farm the night it went up. The raiders worked in silence, in files, and a hooded rider on a gray horse watched from the road.',
      stats: { CON: 14, WIS: 13 },
      location: at('hedda'),
    }),
    createCreature('hermit-odo', 'Odo', {
      role: 'Hermit of Graypeak',
      disposition: 'neutral',
      notes:
        'The last of the warden line that keeps the warding key. Half-deaf and stubborn. He will not come down while Skalvyr hunts over the hermitage, and he gives the key only to someone who swears the oath of the wardens. He knows that one other key can open the door: a counter-key cut from the same silver.',
      stats: { CON: 13, INT: 13, WIS: 16 },
      location: at('odo'),
    }),
    createCreature('harbormaster-petra', 'Harbormaster Petra', {
      role: 'Harbormaster of Saltmere',
      disposition: 'neutral',
      notes:
        'Runs the port and taxes what Corvin thinks she cannot see. She pays 10 gp a head for the drowned dead. Her tide log shows that they first walked on the night the Gull sank off the pier head.',
      stats: { STR: 12, WIS: 14, CHA: 13 },
      location: at('petra'),
    }),
    createCreature('corvin-the-smuggler', 'Corvin', {
      role: 'Smuggler, the Drowned Lantern in Saltmere',
      disposition: 'neutral',
      met: true,
      notes:
        'Sells anything. A buyer who pays under a pale seal hired him to ship Hollowvein silver east, and the Gull went down with the last load. He calls in the marker of Wren: one run to Thornhold with a sealed box. He wants to know who his buyer is, because the buyer owes him a boat.',
      stats: { DEX: 15, INT: 13, CHA: 14 },
      location: at('corvin'),
    }),
    createCreature('lord-aldemar', 'Lord Aldemar Vane', {
      role: 'Lord of Thornhold',
      disposition: 'neutral',
      met: true,
      notes:
        "Proud and in denial. He calls the raids peasant panic and says that his house's ward cannot fail. He trusts his cousin Irenne with the keep and its keys. He softens only when he sees the pale seal on the orders, and he opens the crypt ledger once the shade in his hall is put down.",
      stats: { STR: 14, INT: 12, WIS: 13, CHA: 15 },
      location: at('aldemar'),
    }),
    createCreature('castellan-irenne', 'Castellan Irenne Vane', {
      role: 'Castellan of Thornhold, cousin to Lord Aldemar',
      disposition: 'neutral',
      met: true,
      notes:
        'The hidden hand. For a year the crown of Ostrand has spoken to her in dreams, and she took the pale seal from the crypt to write his orders. She paid Snagtooth to topple a wardstone and burn the farms, bought Hollowvein silver through Corvin, and had a counter-key cut in the east. The key waits in the sealed crates of Dorn. She is courteous and helpful, and she asks the party to carry her letters. Set her hostile when she is unmasked. She flees to the barrow before she fights.',
      level: 5,
      tier: 'legend',
      cr: 2,
      maxHP: 44,
      stats: { STR: 10, DEX: 14, CON: 14, INT: 13, WIS: 12, CHA: 17 },
      weapon: DAGGER,
      armor: enemyArmor('Leather Armor'),
      ...trained(['WIS', 'CHA'], ['deception', 'insight', 'persuasion']),
      class: 'warlock',
      casterLevel: 5,
      spellbook: {
        cantrips: ['eldritch-blast', 'chill-touch'],
        known: ['hellish-rebuke', 'hold-person', 'invisibility', 'fear'],
        prepared: ['hellish-rebuke', 'hold-person', 'invisibility', 'fear'],
      },
      location: at('irenne'),
    }),
  ];
}

/**
 * Every creature of the example campaign: the enemies and the people, in one
 * list.
 * @param {(name: string) => Place} at
 * @returns {Creature[]}
 */
export function exampleCreatures(at) {
  return [...enemies(at), ...people(at)];
}

/**
 * The bestiary of the example campaign: a template for each common enemy, so
 * a GM can spawn more of them.
 * @returns {CreatureTemplate[]}
 */
export function exampleBestiary() {
  return [
    template('goblin', 'Goblin', 7, 1, 0.25, GOBLIN, SNEAK),
    template('gray-wolf', 'Gray Wolf', 11, 1, 0.25, WOLF, PACK),
    template('bandit', 'Bandit', 11, 1, 0.125, BANDIT),
    template('bog-zombie', 'Bog Zombie', 22, 2, 0.25, ZOMBIE, ROTTING),
    template('harpy', 'Harpy', 24, 2, 1, HARPY, HARPY_KIT),
    template('giant-scorpion', 'Giant Scorpion', 26, 3, 3, SCORPION, SCORPION_KIT),
    template('winter-wolf', 'Winter Wolf', 34, 3, 3, { AC: 13 }, WINTER_KIT),
    template('barrow-skeleton', 'Barrow Skeleton', 13, 1, 0.25, SKELETON, SKELETAL),
    template('drowned-sailor', 'Drowned Sailor', 22, 2, 0.5, DROWNED, DROWNING),
    template('pale-sworn', 'Pale-sworn Cultist', 9, 1, 0.125, BANDIT, {
      ...CULTIST_KIT,
      weapon: DAGGER,
      role: 'Pale-sworn',
    }),
  ];
}
