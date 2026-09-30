/** What produced a travelogue entry, used only to tag and style rows. */
export type LogEntryKind = 'travel' | 'combat' | 'note' | 'rest' | 'roll';

/** One automatically recorded event in the party's travelogue. */
export interface LogEntry {
  id: string;
  /** Epoch milliseconds when the event was logged. */
  at: number;
  kind: LogEntryKind;
  /** The line the GM reads. */
  message: string;
  /** True when `message` names something only the GM sees, such as a foe's
   * exact HP or save bonus. A Player tab shows `player` in its place, or
   * leaves the entry out. Absent means every viewer reads `message`. */
  gm?: true;
  /** The line a Player tab shows for a GM-only entry. Absent on a GM-only
   * entry means a Player tab leaves the entry out. */
  player?: string;
}

/** Who may read a logged line. `player` is the line a Player tab shows in
 * place of the GM's, and it marks the entry GM-only too. */
export interface LogOptions {
  gm?: boolean;
  player?: string;
}
