export type QuestStatus = 'active' | 'completed';

/** One step of a quest, checked off as the party completes it. */
export interface QuestObjective {
  /** Unique within its quest. */
  id: string;
  text: string;
  done: boolean;
  /** True when only a GM tab shows the objective, even on a revealed quest. */
  hidden: boolean;
}

/**
 * A reference from a quest to a place or a creature of the campaign. A place
 * names a node, and optionally one tile of that node. Null means the whole map.
 */
export type QuestLink =
  | { kind: 'place'; nodeId: string; tileId: string | null }
  | { kind: 'creature'; creatureId: string };

/**
 * A link that a node edit removed from a quest, with the position it had in
 * the quest's list, so an undo can put it back.
 */
export interface QuestLinkRef {
  questId: string;
  index: number;
  link: QuestLink;
}

/** A GM-authored quest, tracked across sessions. */
export interface Quest {
  id: string;
  title: string;
  /** Free-form GM notes: leads and session recaps. Only a GM tab shows them. */
  notes: string;
  status: QuestStatus;
  /** True when players can see the quest title and status. Authored hidden, revealed on demand. */
  revealed: boolean;
  /** The steps of the quest, in the order the GM set. Empty on older saves. */
  objectives: QuestObjective[];
  /** The places and creatures the quest involves. Only a GM tab shows them. Empty on older saves. */
  links: QuestLink[];
  /** The ids of the quests that completing this one offers to reveal. Only a GM tab shows them. */
  unlocks: string[];
  /** What completing the quest pays. `per` says whether gp and xp go to each character or split as a total. */
  reward?: QuestReward;
}

/** A quest reward in gold pieces and experience points. */
export interface QuestReward {
  gp: number;
  xp: number;
  per: 'each' | 'total';
}
