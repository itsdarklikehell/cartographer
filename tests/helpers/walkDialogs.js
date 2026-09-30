/**
 * Stand-ins for the walk dialogs of mapTravel.js, which need a document.
 * Each call records its message and resolves with the answer the test set:
 * `choice` for the Night question and `confirm` for a plain move confirm.
 * A test that clicks a walk into Night awaits `settle()` before it asserts,
 * because the answer arrives on a later tick.
 * @param {{ choice?: string, checked?: boolean, confirm?: boolean }} [answer]
 */
export function walkDialogs({ choice = 'walk', checked = false, confirm = true } = {}) {
  /** @type {{ message: string, choices: string[] }[]} */
  const asked = [];
  return {
    asked,
    choiceModal: async (
      /** @type {string} */ message,
      /** @type {{ value: string }[]} */ choices,
    ) => {
      asked.push({ message, choices: choices.map((c) => c.value) });
      return { choice, checked };
    },
    confirmModal: async (/** @type {string} */ message) => {
      asked.push({ message, choices: ['confirm'] });
      return confirm;
    },
  };
}

/** Wait for the answer of a stand-in dialog to reach the move. */
export const settle = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });
