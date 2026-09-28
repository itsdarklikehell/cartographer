/** @typedef {import('../types/handout.js').Handout} Handout */

/**
 * The lore handouts of the example campaign. Each one starts hidden, and the
 * GM reveals it when the party finds it.
 * @returns {Handout[]}
 */
export function exampleHandouts() {
  return [
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
  ];
}
