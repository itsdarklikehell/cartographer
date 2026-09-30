import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackerType, chipSlants, dropOnce, spentOnce } from '../src/entities/ChipSlants.js';
import { modeReasons, rollMode } from '../src/entities/ConditionEffects.js';

const FAERIE = {
  name: 'Faerie Fire',
  mods: { attacksAgainst: /** @type {const} */ ('advantage') },
};
const BLUR = { name: 'Blur', mods: { attacksAgainst: /** @type {const} */ ('disadvantage') } };
const BOLT = {
  name: 'Guiding Bolt',
  mods: { attacksAgainst: /** @type {const} */ ('advantage'), once: true },
};
const MOCKED = {
  name: 'Vicious Mockery',
  mods: { attacks: /** @type {const} */ ('disadvantage'), once: true },
};
const WARD = {
  name: 'Protection from Evil and Good',
  mods: {
    attacksAgainst: /** @type {const} */ ('disadvantage'),
    attackerTypes: ['fiend', 'undead'],
  },
};

test('a target chip slants attacks against its holder', () => {
  assert.equal(rollMode({ target: [FAERIE], kind: 'attack' }), 'advantage');
  assert.equal(rollMode({ target: [BLUR], kind: 'attack' }), 'disadvantage');
  // The two cancel to a straight roll under the 5e rule.
  assert.equal(rollMode({ target: [FAERIE, BLUR], kind: 'attack' }), 'normal');
  assert.equal(modeReasons({ target: [FAERIE], kind: 'attack' }), 'Faerie Fire advantage');
});

test('a roller chip slants its holder attacks and nothing else', () => {
  assert.equal(rollMode({ roller: [MOCKED], kind: 'attack' }), 'disadvantage');
  // An attacksAgainst chip on the roller does not slant its own attack.
  assert.equal(rollMode({ roller: [FAERIE], kind: 'attack' }), null);
  // A save or a check reads no attack slant.
  assert.equal(rollMode({ roller: [MOCKED], kind: 'save', ability: 'DEX' }), null);
  assert.equal(rollMode({ roller: [MOCKED], target: [FAERIE], kind: 'check' }), null);
});

test('an attacker type list limits the slant to those attackers', () => {
  assert.equal(rollMode({ target: [WARD], kind: 'attack', rollerType: 'fiend' }), 'disadvantage');
  assert.equal(
    rollMode({ target: [WARD], kind: 'attack', rollerType: ' Undead ' }),
    'disadvantage',
  );
  assert.equal(rollMode({ target: [WARD], kind: 'attack', rollerType: 'humanoid' }), null);
  // An attacker with no type matches no list.
  assert.equal(rollMode({ target: [WARD], kind: 'attack' }), null);
});

test('chipSlants reads both sides and skips chips with no mods', () => {
  const found = chipSlants({ roller: [MOCKED, { name: 'Poisoned' }], target: [BOLT] });
  assert.deepEqual(
    found.map((f) => [f.condition.name, f.slant, f.from]),
    [
      ['Vicious Mockery', 'disadvantage', 'roller'],
      ['Guiding Bolt', 'advantage', 'target'],
    ],
  );
  assert.deepEqual(chipSlants({}), []);
});

test('spentOnce names the one-shot chips an attack roll uses up', () => {
  assert.deepEqual(spentOnce({ roller: [MOCKED], target: [BOLT, FAERIE] }), {
    roller: ['Vicious Mockery'],
    target: ['Guiding Bolt'],
  });
  // A ward that does not apply to this attacker is not used up.
  assert.deepEqual(spentOnce({ target: [{ ...WARD, mods: { ...WARD.mods, once: true } }] }), {
    roller: [],
    target: [],
  });
});

test('dropOnce removes only the named one-shot chips', () => {
  const plain = { name: 'Guiding Bolt' };
  const list = [BOLT, plain, FAERIE];
  assert.deepEqual(dropOnce(list, ['Guiding Bolt']), [plain, FAERIE]);
  assert.equal(dropOnce(list, []), list);
  // Nothing matched, so the same list comes back.
  assert.equal(dropOnce(list, ['Faerie Fire']), list);
});

test('attackerType reads a creature type, and a character counts as humanoid', () => {
  const undead = { disposition: 'hostile', creatureType: 'undead' };
  assert.equal(attackerType(undead), 'undead');
  assert.equal(attackerType({ disposition: 'hostile', creatureType: ' Fiend ' }), 'fiend');
  assert.equal(attackerType({ disposition: 'hostile', creatureType: 'robot' }), undefined);
  assert.equal(attackerType({ disposition: 'hostile' }), undefined);
  assert.equal(attackerType({ name: 'Hero' }), 'humanoid');
  assert.equal(attackerType(null), undefined);
});

test('Protection from Evil and Good gives an undead attacker disadvantage', () => {
  const skeleton = { disposition: 'hostile', creatureType: 'undead' };
  const query = { target: [WARD], kind: /** @type {const} */ ('attack') };
  assert.equal(rollMode({ ...query, rollerType: attackerType(skeleton) }), 'disadvantage');
  // A party character attacks as a humanoid, which the ward does not list.
  assert.equal(rollMode({ ...query, rollerType: attackerType({ name: 'Hero' }) }), null);
});

test('the chips of Hypnotic Pattern and Charm Person give no slant and stay on a spent roll', () => {
  const pattern = {
    name: 'Incapacitated',
    source: { spellName: 'Hypnotic Pattern', endsOnDamage: true },
  };
  const charm = { name: 'Charmed', source: { spellName: 'Charm Person' } };
  const target = [BOLT, pattern, charm];
  const found = chipSlants({ target });
  assert.deepEqual(
    found.map((f) => f.condition),
    [BOLT],
  );
  const spent = spentOnce({ target });
  assert.deepEqual(spent.target, ['Guiding Bolt']);
  assert.deepEqual(dropOnce(target, spent.target), [pattern, charm]);
});
