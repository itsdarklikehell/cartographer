/** @typedef {import('../types/time.js').GameClock} GameClock */

/**
 * The named watches that divide one in-game day, in order. A day advances
 * one watch at a time. Rolling past the last watch increases the day by one.
 * @type {string[]}
 */
export const WATCHES = ['Dawn', 'Morning', 'Midday', 'Afternoon', 'Dusk', 'Night'];

/** @returns {GameClock} A fresh clock at the dawn of day 1. */
export function createClock() {
  return { day: 1, watch: 0 };
}

/**
 * Advance the clock by `watches` watches, rolling the day over as needed.
 * The function treats negative values as zero. The clock never runs
 * backward.
 * @param {GameClock} clock
 * @param {number} [watches]
 * @returns {GameClock}
 */
export function advanceWatches(clock, watches = 1) {
  const total = clock.watch + Math.max(0, Math.floor(watches));
  return withMinutes(
    { day: clock.day + Math.floor(total / WATCHES.length), watch: total % WATCHES.length },
    clock.minutes ?? 0,
  );
}

/** The length of one watch: six watches make a 24-hour day. */
export const MINUTES_PER_WATCH = 240;

/**
 * Advance the clock by a number of minutes. Minutes add up inside the
 * current watch, so many short walks move the clock the way one long walk
 * does. The function treats negative values as zero.
 * @param {GameClock} clock
 * @param {number} minutes
 * @returns {GameClock}
 */
export function advanceMinutes(clock, minutes) {
  const total = (clock.minutes ?? 0) + Math.max(0, Math.floor(minutes));
  const watched = advanceWatches(
    { day: clock.day, watch: clock.watch },
    Math.floor(total / MINUTES_PER_WATCH),
  );
  return withMinutes(watched, total % MINUTES_PER_WATCH);
}

/**
 * A clock with its minute count set. A clock at the start of a watch keeps
 * no `minutes` field, so a save of a clock that never moved by minutes
 * stays as it is.
 * @param {GameClock} clock
 * @param {number} minutes
 * @returns {GameClock}
 */
function withMinutes(clock, minutes) {
  return minutes > 0 ? { ...clock, minutes } : clock;
}

/**
 * Advance to the next Dawn: the start of the next day if the clock is
 * already past dawn. A long rest calls this function. If the clock is
 * exactly at Dawn already, the function still advances a full day, so a
 * long rest always takes time.
 * @param {GameClock} clock
 * @returns {GameClock}
 */
export function advanceToDawn(clock) {
  return { day: clock.day + 1, watch: 0 };
}

/**
 * @param {GameClock} clock
 * @returns {string} For example "Day 3, Dusk".
 */
export function formatClock(clock) {
  return `Day ${clock.day}, ${WATCHES[clock.watch] ?? WATCHES[0]}`;
}

/**
 * How many watches pass from one clock reading to a later one. A long rest
 * from Dusk to the next Dawn is two watches.
 * @param {GameClock} from
 * @param {GameClock} to
 * @returns {number}
 */
export function watchesBetween(from, to) {
  return Math.max(0, (to.day - from.day) * WATCHES.length + to.watch - from.watch);
}

/**
 * A spoken length of time, in hours and minutes: "30 minutes", "1 hour",
 * "4 hours 30 minutes". Zero or less reads "0 minutes".
 * @param {number} minutes
 * @returns {string}
 */
export function formatMinutes(minutes) {
  const total = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  /** @param {number} n @param {string} unit */
  const count = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  const parts = [hours ? count(hours, 'hour') : '', rest || !hours ? count(rest, 'minute') : ''];
  return parts.filter(Boolean).join(' ');
}
