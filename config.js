// ─────────────────────────────────────────────────────────────
//  Game config — edit values here. This file is read by both the
//  browser and server.js (restart the server after editing).
// ─────────────────────────────────────────────────────────────
window.GAME_CONFIG = {
  // Rarity tiers, lowest → highest. Each tier is one planet "hub" in the
  // mind-map sky. Higher tier = higher altitude.
  //   maxShare : an answer reaches this tier if at most this fraction of
  //              players picked it (0.05 = 5%). Must decrease down the list.
  RARITY_LEVELS: [
    { id: 'common',       name: 'Common',       color: '#9aa5b1', planet: 'planet00', maxShare: 1.00 },
    { id: 'uncommon',     name: 'Uncommon',     color: '#5fd38d', planet: 'planet01', maxShare: 0.50 },
    { id: 'rare',         name: 'Rare',         color: '#4aa8ff', planet: 'planet02', maxShare: 0.35 },
    { id: 'epic',         name: 'Epic',         color: '#b36bff', planet: 'planet03', maxShare: 0.20 },
    { id: 'legendary',    name: 'Legendary',    color: '#ffb84a', planet: 'planet04', maxShare: 0.10 },
    { id: 'mythic',       name: 'Mythic',       color: '#ff5f7e', planet: 'planet05', maxShare: 0.05 },
    { id: 'transcendent', name: 'Transcendent', color: '#7ff6ff', planet: 'planet06', maxShare: 0.02 },
  ],

  // Set to false to ignore all seed counts below and rank on real answers only.
  USE_SEEDS: true,

  // Questions. Players pick one option; rarity comes from how few people
  // picked the same one.
  //   id      : stored in the database. Don't change it once people have
  //             answered, or their answers become orphaned.
  //   options : { 'Answer text': seedCount }. The seed count is the number
  //             of pretend responses that option starts with. They're added
  //             to real answers (never stored in the database), so rarity
  //             works from the very first player. Use 0 for no head start.
  QUESTIONS: [
    { id: 'fruit', text: 'Pick a fruit.', options: {
      'Apple': 40, 'Banana': 30, 'Mango': 18, 'Kiwi': 8, 'Dragonfruit': 3, 'Durian': 1 } },
    { id: 'superpower', text: 'Choose a superpower.', options: {
      'Flight': 38, 'Teleportation': 30, 'Invisibility': 22, 'Talking to animals': 8, 'Perfect pitch': 2 } },
    { id: 'planet', text: 'Which planet would you visit?', options: {
      'Mars': 45, 'Saturn': 22, 'Jupiter': 15, 'Neptune': 10, 'Venus': 5, 'Pluto (still counts)': 3 } },
    { id: 'colour', text: 'Pick a colour.', options: {
      'Blue': 42, 'Black': 20, 'Green': 18, 'Red': 15, 'Mauve': 4, 'Chartreuse': 1 } },
    { id: 'pet', text: 'Your ideal pet?', options: {
      'Dog': 48, 'Cat': 35, 'Capybara': 10, 'Axolotl': 6, 'Tarantula': 1 } },
    { id: 'breakfast', text: 'Best breakfast?', options: {
      'Eggs': 32, 'Toast': 25, 'Nothing, just coffee': 20, 'Cereal': 15, 'Leftover pizza': 6, 'Congee': 2 } },
    { id: 'era', text: 'Which era would you time-travel to?', options: {
      'Dinosaurs': 35, 'The year 3000': 30, 'Ancient Egypt': 20, 'The 1980s': 12, 'Medieval Europe': 3 } },
  ],

  // Sprite frame in kenney_tiny-city tilemap_packed.png used for the player.
  PLAYER_FRAME: 108,

  // Number of answer "branches" drawn off each planet in the mind map.
  BRANCHES_PER_TIER: 3,
};
