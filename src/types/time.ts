/** In-game clock: a day counter, plus an index into the watches of a day. */
export interface GameClock {
  day: number;
  /** Index into the day's watches (see WATCHES in time/GameClock.js). */
  watch: number;
  /** Minutes spent inside the current watch by travel, 0 to 239. Absent at
   * the start of a watch. See advanceMinutes in time/GameClock.js. */
  minutes?: number;
}
