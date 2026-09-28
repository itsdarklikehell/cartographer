/** Where one handout was bound, kept so an undo can bind it back.
 * `nodeId` null means the handout was campaign-wide, and `tileId` null means
 * it was bound to the whole node. A map edit that unbinds handouts records
 * these before it changes them. */
export interface HandoutBinding {
  handoutId: string;
  nodeId: string | null;
  tileId: string | null;
}

/** A lore snippet or read-aloud box that a GM attaches to a node and reveals to players. */
export interface Handout {
  id: string;
  title: string;
  /** Read-aloud or lore text shown when revealed. */
  body: string;
  /** Node the handout belongs to. Null means campaign-wide, and shows everywhere. */
  nodeId: string | null;
  /** One tile of `nodeId`. A player sees the handout only while the party
   * stands on that tile. Null means the whole node. Always null when
   * `nodeId` is null. */
  tileId: string | null;
  /** True when players can currently see the handout. Authored hidden, revealed on demand. */
  revealed: boolean;
  /** Optional attached image as a data URL, shown with the revealed body. */
  image: string | null;
  /** The character ids whose bound player tabs see the handout once it is
   * revealed. Null means every player tab, spectators included. */
  audience: string[] | null;
}

/** Who looks at the handout list: the GM, or a player tab and the
 * character it is bound to (null for a spectator tab). */
export interface HandoutViewer {
  gm: boolean;
  boundCharacterId: string | null;
}
