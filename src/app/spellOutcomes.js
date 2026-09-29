import { riderSummary } from '../entities/Riders.js';
import { formatModifier } from '../entities/Modifiers.js';
import { durationInRounds } from '../entities/SpellTiming.js';
import { defenseNote } from '../entities/DamageDefenses.js';
import { chipTiming } from '../entities/TurnEffects.js';
import { currentParticipant } from '../combat/Initiative.js';
import { spawnSummons } from './summons.js';
import {
  applyToTarget,
  applyConditionToTarget,
  defendedDamage,
  findCombatant,
} from './combatants.js';
import { targetSummary } from './spellTargets.js';
import { spendRollRiders } from './riderSpend.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/spell.js').ChipUntil} ChipUntil */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */
/** @typedef {{ outcomes: object[], targets: import('../entities/Casting.js').CastTarget[] }} CastResult */

/**
 * Writing a resolved cast into the world: hit points, condition chips, the
 * damage a chip leaves for later turns, summoned creatures, and the log lines
 * the GM reads afterward. `spellCastResolve.js` rolls the cast and hands the
 * outcome here.
 */

/**
 * The parenthetical a log line carries when the caster's chips changed the
 * roll, or an empty string when they did not. A multi-projectile cast passes
 * one entry per ray, because each ray rolls the riders again, and the rays
 * that rolled nothing drop out.
 * @param {({ note: string } | null | undefined)[]} riders
 * @returns {string}
 */
function riderNote(riders) {
  const notes = riders.filter((r) => r?.note).map((r) => /** @type {{ note: string }} */ (r).note);
  return notes.length > 0 ? ` (${notes.join('; ')})` : '';
}

/**
 * The timing of a chip that ends at a turn boundary, read against the
 * running fight (see `TurnEffects.chipTiming`).
 * @param {AppContext} app
 * @param {ChipUntil} until
 * @param {string} casterId
 * @param {string} targetId
 * @returns {ReturnType<typeof chipTiming>}
 */
export function timingFor(app, until, casterId, targetId) {
  const combat = app.state.combat;
  return chipTiming(until, {
    casterId,
    targetId,
    actingId: combat ? (currentParticipant(combat)?.id ?? null) : null,
    inOrder: (id) => !!combat?.order.some((p) => p.id === id),
  });
}

/**
 * Leave a spell's later-turn damage on a target, on a chip named after the
 * spell. The chip ends at the boundary the spell names, which is the end of
 * the target's next turn unless it names another.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {string} casterId
 * @param {string} targetId
 * @param {DamagePart[]} damage the scaled dice
 * @param {ChipUntil | undefined} until
 */
function leaveOngoing(app, spell, casterId, targetId, damage, until) {
  const timing = timingFor(app, until ?? 'target-end', casterId, targetId);
  applyConditionToTarget(
    app,
    targetId,
    spell.name,
    timing.rounds,
    { spellId: spell.id, spellName: spell.name, casterId },
    null,
    { ...(timing.expires ? { expires: timing.expires } : {}), ongoing: { damage } },
  );
}

/**
 * Apply and log a resolved cast's outcomes: attack hits and misses, save
 * results with full, half, or no damage, and healing. Each target gets its
 * own log line, so a multi-target cast is auditable roll by roll. The toast
 * carries the summary. Damage and healing route to the same HP models the
 * weapon path uses.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {CastResult} result
 * @param {string} casterId the function stamps this id onto a condition this
 *   cast imposes, so the app can find the effect again when the caster stops
 *   holding the spell
 * @param {{ tracked?: boolean }} [options] `tracked` is true when the caster
 *   took up concentration on this cast. A summons that nothing concentrates on
 *   stays on the map until the GM removes it, and the log says so.
 */
export function applyOutcomes(app, spell, result, casterId, { tracked = false } = {}) {
  const kind = spell.effect.kind;
  const summary = targetSummary(result.targets);
  if (kind === 'attack') {
    applyAttack(app, spell, result, casterId);
    app.toasts.show(`${spell.name} on ${summary}.`);
    return;
  }
  if (kind === 'save') {
    applySave(app, spell, result, casterId);
    app.toasts.show(`${spell.name} on ${summary}.`);
    return;
  }
  if (kind === 'heal') {
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      app.actions.logEvent(
        'combat',
        `${spell.name} heals ${o.target.name} for ${o.healing.total} HP.`,
      );
      applyToTarget(app, o.target.id, o.healing.total, true);
    }
    app.toasts.show(`${spell.name} heals ${summary}.`);
    return;
  }
  if (kind === 'buff') {
    // A buff rolls nothing, so the whole cast is the chip it leaves. The chip
    // carries the same source a failed save writes, which is what lets
    // `endSpellEffects` sweep it when the caster stops concentrating.
    const rounds = durationInRounds(spell.duration);
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      const imposed = applyConditionToTarget(
        app,
        o.target.id,
        o.condition,
        rounds,
        { spellId: spell.id, spellName: spell.name, casterId },
        o.rider,
      );
      const adds = o.rider ? `: ${riderSummary(o.rider)}` : '';
      app.actions.logEvent(
        'combat',
        `${o.target.name} gains ${o.condition}${adds}${imposed ? '' : ' (untracked)'}.`,
      );
    }
    app.toasts.show(`${spell.name} on ${summary}.`);
    return;
  }
  if (kind === 'summons') {
    // The one outcome names the template and the count. The creatures land on
    // the tile of the party, which is the only place a cast can reach without
    // map distance.
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      const spawn = spawnSummons(app, spell, casterId, o);
      if ('error' in spawn) {
        app.toasts.show(spawn.error, { level: 'error' });
        return;
      }
      // An untracked summon has nothing holding it, so nothing will take it
      // away again. A spell with no concentration, and a creature caster, both
      // land here.
      const held = tracked ? '' : ' (untracked)';
      const tally = `${spawn.spawned.length} x ${spawn.template}`;
      app.actions.logEvent('combat', `${spell.name} summons ${tally}${held}.`);
      app.toasts.show(`${spell.name} summons ${tally}.`);
    }
    return;
  }
  app.toasts.show(`${spell.name} cast.`);
}

/**
 * Apply and log an attack spell's outcomes.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {CastResult} result
 * @param {string} casterId
 */
function applyAttack(app, spell, result, casterId) {
  const effect = /** @type {import('../types/spell.js').SpellAttackEffect} */ (spell.effect);
  // A one-roll rider on the caster is used up by the first attack it joins.
  const spent = /** @type {any[]} */ (result.outcomes).flatMap((o) =>
    [o.rider, ...(o.shots ?? []).map((/** @type {any} */ s) => s.rider)].flatMap(
      (r) => r?.spent ?? [],
    ),
  );
  spendRollRiders(app, casterId, { spent });
  // The damage the hits dealt after defenses, for a spell that drains it.
  let dealt = 0;
  for (const o of /** @type {any[]} */ (result.outcomes)) {
    // A multi-projectile cast logs the tally, not one line per ray. The
    // rolls are already aggregated per creature, and the damage carries
    // every ray's dice.
    if (o.shots) {
      const tally = `${o.hits} of ${o.fired} hit ${o.target.name}`;
      // Each ray rolls the caster's riders again, so the line names every
      // ray's dice. The tally itself prints no to-hit numbers, and this is
      // the only place the rays' own rolls are recorded.
      const rode = riderNote(o.shots.map((/** @type {any} */ s) => s.rider));
      // Each ray is its own hit, so the defenses apply to each one.
      const hits = /** @type {any[]} */ (o.shots)
        .filter((s) => s.damage)
        .map((s) => ({ crit: s.crit, ...defendedDamage(app, o.target.id, s.damage.byType) }));
      const defended = defenseNote(
        hits.flatMap((h) => h.notes),
        hits.reduce((n, h) => n + h.total, 0),
      );
      app.actions.logEvent(
        'combat',
        o.hits > 0
          ? `${spell.name}: ${tally}${rode} for ${o.damage.detail}${defended}.`
          : `${spell.name}: ${tally}${rode} (AC ${o.ac}).`,
      );
      // Each ray that lands is its own hit, so a concentrating target
      // saves once per ray and a dying one takes a failure per ray.
      for (const h of hits) applyToTarget(app, o.target.id, h.total, false, { crit: h.crit });
      dealt += hits.reduce((n, h) => n + h.total, 0);
      if (o.ongoing) {
        leaveOngoing(app, spell, casterId, o.target.id, o.ongoing, effect.ongoing?.until);
      }
      if (o.onHit) applyOnHit(app, spell, o, casterId);
      continue;
    }
    const verb = o.crit ? 'critically hits' : o.hit ? 'hits' : 'misses';
    // A rider on the caster changed the number, so both outcomes say so.
    const rode = riderNote([o.rider]);
    if (!o.hit) {
      // A spell that splashes on a miss still deals half its damage.
      const splash = o.halved
        ? defendedDamage(app, o.target.id, o.damage.byType, { halve: true })
        : null;
      const splashed = splash
        ? `, splashing for ${splash.total}${splash.notes.length ? ` (${splash.notes.join(', ')})` : ''}`
        : '';
      app.actions.logEvent(
        'combat',
        `${spell.name}: ${o.attack.total} to hit vs AC ${o.ac}${rode} — ${verb} ${o.target.name}${splashed}.`,
      );
      if (splash) applyToTarget(app, o.target.id, splash.total, false);
      dealt += splash?.total ?? 0;
      continue;
    }
    const taken = defendedDamage(app, o.target.id, o.damage?.byType ?? []);
    app.actions.logEvent(
      'combat',
      `${spell.name} ${verb} ${o.target.name}${rode} for ${o.damage?.detail || '0 damage'}` +
        `${defenseNote(taken.notes, taken.total)}.`,
    );
    applyToTarget(app, o.target.id, taken.total, false, { crit: o.crit });
    dealt += taken.total;
    if (o.ongoing) {
      leaveOngoing(app, spell, casterId, o.target.id, o.ongoing, effect.ongoing?.until);
    }
    if (o.onHit) applyOnHit(app, spell, o, casterId);
  }
  if (effect.drain) drainTo(app, spell, casterId, effect.drain, dealt);
}

/**
 * Apply and log what one hit brings besides its damage: a save against the
 * caster's DC, and the condition on a failure, or the condition alone when
 * the hit brings no save. The chip names the cast, so it goes when the
 * caster stops holding the spell, and it ends at the turn boundary the spell
 * names or after the spell's duration.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {any} o the target's attack outcome, with its `onHit` result
 * @param {string} casterId
 */
function applyOnHit(app, spell, o, casterId) {
  const effect = /** @type {import('../types/spell.js').SpellAttackEffect} */ (spell.effect);
  const onHit = /** @type {import('../types/spell.js').SpellOnHit} */ (effect.onHit);
  const hit = o.onHit;
  const name = o.target.name;
  const timing = onHit.until ? timingFor(app, onHit.until, casterId, o.target.id) : null;
  const imposed = hit.condition
    ? applyConditionToTarget(
        app,
        o.target.id,
        hit.condition,
        timing ? timing.rounds : durationInRounds(spell.duration),
        { spellId: spell.id, spellName: spell.name, casterId },
        null,
        timing?.expires ? { expires: timing.expires } : {},
      )
    : false;
  const cond = hit.condition ? `${hit.condition}${imposed ? '' : ' (untracked)'}` : '';
  if (!onHit.saveAbility) {
    app.actions.logEvent('combat', `${name} gains ${cond}.`);
    return;
  }
  const bonus = `${onHit.saveAbility} ${formatModifier(o.target.saveBonus ?? 0)}`;
  const rode = hit.rider ? `, ${hit.rider.note}` : '';
  const detail = hit.autoFailedBy ? hit.autoFailedBy : `${bonus}${rode}: ${hit.save.total}`;
  app.actions.logEvent(
    'combat',
    hit.saved
      ? `${name} saves DC ${hit.dc} (${detail}).`
      : `${name} fails DC ${hit.dc} (${detail}), ${cond}.`,
  );
  spendRollRiders(app, o.target.id, hit.rider);
}

/**
 * Give the caster of a draining spell its share of the damage the hits
 * dealt, after the targets' defenses. Half rounds down.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {string} casterId
 * @param {import('../types/spell.js').SpellDrain} drain
 * @param {number} dealt
 */
function drainTo(app, spell, casterId, drain, dealt) {
  const regained = drain === 'half' ? Math.floor(dealt / 2) : dealt;
  // A caster that left the campaign has no hit points to regain.
  const found = findCombatant(app, casterId);
  if (!found || regained <= 0) return;
  app.actions.logEvent('combat', `${found.entity.name} regains ${regained} HP from ${spell.name}.`);
  applyToTarget(app, casterId, regained, true);
}

/**
 * Apply and log a save spell's outcomes.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {CastResult} result
 * @param {string} casterId
 */
function applySave(app, spell, result, casterId) {
  // A failed save's condition rides for as long as the spell lasts. The
  // structured duration gives this length in rounds. An open-ended
  // duration leaves the chip for the GM to clear. A spell that names a turn
  // boundary ends the chip there instead.
  const rounds = durationInRounds(spell.duration);
  const effect = /** @type {import('../types/spell.js').SpellSaveEffect} */ (spell.effect);
  const ability = effect.saveAbility;
  for (const o of /** @type {any[]} */ (result.outcomes)) {
    if (o.unaffectedBy) {
      app.actions.logEvent('combat', `${o.target.name} is unaffected (${o.unaffectedBy}).`);
      continue;
    }
    const verdict = o.saved ? 'saves' : 'fails';
    // The log names the bonus alongside the roll, the same way an attack
    // log names the ability and proficiency behind its number.
    const bonus = `${ability} ${formatModifier(o.target.saveBonus ?? 0)}`;
    // The chip records the cast that wrote it. This lets the app end the
    // effect when the caster stops holding the spell, and lets a repeated
    // save roll against it. The app uses the bonus stamped here only for a
    // target whose own save it cannot read. It re-derives a character's
    // bonus at retry time.
    const timing = effect.until ? timingFor(app, effect.until, casterId, o.target.id) : null;
    const imposed = o.condition
      ? applyConditionToTarget(
          app,
          o.target.id,
          o.condition,
          timing ? timing.rounds : rounds,
          {
            spellId: spell.id,
            spellName: spell.name,
            casterId,
            saveAbility: ability,
            saveDC: o.dc,
            saveBonus: o.target.saveBonus ?? 0,
            ...(effect.saveEnds ? { saveEnds: true } : {}),
          },
          o.conditionRider,
          {
            ...(timing?.expires ? { expires: timing.expires } : {}),
            ...(o.ongoing ? { ongoing: { damage: o.ongoing } } : {}),
          },
        )
      : false;
    const cond = o.condition ? `, ${o.condition}${imposed ? '' : ' (untracked)'}` : '';
    // A rider the target already held changed the roll, so the line states it.
    const rode = o.rider ? `, ${o.rider.note}` : '';
    // A chip that fails the save outright threw no die, so the line names
    // the chip where the roll would have gone.
    const detail = o.autoFailedBy ? o.autoFailedBy : `${bonus}${rode}: ${o.save.total}`;
    // A save that negates the damage leaves nothing for the defenses to
    // change. Otherwise they apply per type, after the halving of a save.
    const taken =
      o.taken > 0
        ? defendedDamage(app, o.target.id, o.damage.byType, { halve: o.saved })
        : { total: 0, notes: [] };
    const defended = taken.notes.length > 0 ? ` (${taken.notes.join(', ')})` : '';
    app.actions.logEvent(
      'combat',
      `${o.target.name} ${verdict} DC ${o.dc} (${detail}) — takes ${taken.total} damage` +
        `${defended}${cond}.`,
    );
    applyToTarget(app, o.target.id, taken.total, false);
    spendRollRiders(app, o.target.id, o.rider);
    // Later-turn damage with no condition to ride gets a chip of its own.
    if (o.ongoing && !o.condition) {
      leaveOngoing(app, spell, casterId, o.target.id, o.ongoing, effect.ongoing?.until);
    }
  }
}
