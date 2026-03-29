// electron/services/TFTMeta.ts
// Set 16 (Lore & Legends) meta database
// Augment/carousel/positioning tips for top comps.

export interface MetaComp {
  id: string
  name: string
  traits: string[]
  keyUnits: string[]
  augments: string[]
  carouselPriority: string
  itemManifesto: string
  positioningTip: string
  levelTiming: string
  econTip: string
  // Board layout: slot index → role ('carry'|'tank'|'support'|'flex')
  // TFT board = 4 rows × 7 cols, staggered hex, indexes row-major left-to-right
  // Row 0 = back row (your units' back), Row 3 = front row
  boardLayout?: Record<number, 'carry' | 'tank' | 'support' | 'flex'>
}

// Slot helpers: row 0-3 (back→front), col 0-6
export function slotIndex(row: number, col: number): number { return row * 7 + col }

export const SET16_COMPS: MetaComp[] = [
  {
    id: 'arcana-carry',
    name: 'Arcana Carry',
    traits: ['arcana','mage'],
    keyUnits: ['Lux','Malzahar','Xerath','Karma'],
    augments: ['Arcana Crest','Spellslinger','Jeweled Lotus','Mage Heart'],
    carouselPriority: 'Needlessly Large Rod, Tear of the Goddess',
    itemManifesto: "Lux/Xerath'a Rabadon's, Archangel's, Blue Buff",
    positioningTip: "Mage'ları arka sıraya koy, frontline önünde. Carry sol köşede.",
    levelTiming: "3-1'de 6 birim, 4-1'de Level 7, 4-2'de 50g roll",
    econTip: "50g econ bekle, 4-2'de tam roll",
    boardLayout: {
      // Row 0 (backline): carries + mages
      1: 'carry', 2: 'carry', 4: 'support', 5: 'flex',
      // Row 1 (mid-back): tanks + flex
      7: 'flex', 9: 'flex', 11: 'flex',
      // Row 2 (mid-front): tanks
      14: 'tank', 16: 'tank',
      // Row 3 (frontline): tanks
      21: 'tank', 22: 'tank', 23: 'tank',
    },
  },
  {
    id: 'bruiser-frontline',
    name: 'Bruiser Tank',
    traits: ['bruiser','guardian'],
    keyUnits: ['Darius','Malphite','Taric','Sett'],
    augments: ['Bruiser Crest','Living Forge','Courage of the Colossus','Guardian Soul'],
    carouselPriority: "Chain Vest, Giant's Belt",
    itemManifesto: "Darius'a Warmog's, Bramble Vest, Dragon's Claw",
    positioningTip: "Bruiser'ları ön sıraya yay, carry arka köşede gizli.",
    levelTiming: "3-1'de Level 5, 3-2'de slow roll, 4-1'de Level 6",
    econTip: "50g bekle, slow roll 3-2'den itibaren",
    boardLayout: {
      // Row 0 (backline): carry solo
      0: 'carry', 2: 'support',
      // Row 1: flex
      8: 'flex', 10: 'flex',
      // Row 2 (mid-front): bruisers
      14: 'tank', 15: 'tank', 16: 'tank',
      // Row 3 (frontline): heavy tanks  
      21: 'tank', 22: 'tank', 23: 'tank', 24: 'tank',
    },
  },
  {
    id: 'strategist-reroll',
    name: 'Strategist Reroll',
    traits: ['strategist','warrior'],
    keyUnits: ['Jarvan IV','Leona','Garen','Akali'],
    augments: ['Strategist Crest','Stand United','Titanic Force','Warrior Heart'],
    carouselPriority: 'B.F. Sword, Recurve Bow',
    itemManifesto: "Akali'ye IE, Bloodthirster. Jarvan'a Sunfire",
    positioningTip: "Warrior'ları orta hatta, Akali kenar/köşede atlı.",
    levelTiming: "Level 5'te 3-1 slow roll, 3-3'te stop roll",
    econTip: "30g'de tut, her round roll yap (slow roll)",
    boardLayout: {
      0: 'carry', 1: 'flex',
      8: 'support', 10: 'carry',
      14: 'flex', 15: 'tank', 16: 'flex',
      21: 'tank', 22: 'tank', 23: 'tank',
    },
  },
  {
    id: 'dominator-vertical',
    name: 'Dominator Synergy',
    traits: ['dominator','shape-shifter'],
    keyUnits: ['Vladimir','Mordekaiser','Galio','Swain'],
    augments: ['Dominator Crest','Giant Slayer','Titanic Strength','Shape-Shifter Heart'],
    carouselPriority: "Giant's Belt, Negatron Cloak",
    itemManifesto: "Vladimir'e Blue Buff, Morellonomicon. Swain'e Warmog's",
    positioningTip: "Swain ortada, Vladimir yan yana. Galio ön sıra kalkan.",
    levelTiming: "4-1'de Level 8, 4-2'de roll stop",
    econTip: "50g bekle, 4-2'de full roll",
    boardLayout: {
      0: 'support', 3: 'carry',
      8: 'flex', 9: 'carry', 11: 'flex',
      14: 'flex', 15: 'tank',
      21: 'tank', 22: 'tank', 23: 'flex',
    },
  },
  {
    id: 'bastion-sentinel',
    name: 'Bastion Sentinel',
    traits: ['bastion','sentinel'],
    keyUnits: ['Leona','Malphite','Poppy','Nautilus'],
    augments: ['Bastion Crest','Sentinel Crest','Irresistible Charm','Cybernetic Shell'],
    carouselPriority: 'Chain Vest, Sparring Gloves',
    itemManifesto: "Leona'ya Sunfire, Gargoyle. Poppy'ye Redemption",
    positioningTip: "Sentinel'ları dışarıya koy, birbirinden 1 hex uzakta.",
    levelTiming: "Level 5 2-2, 3-1'de slow roll",
    econTip: "Slow roll: 20g'de tut, her round 2-3 roll",
    boardLayout: {
      0: 'carry', 6: 'carry',
      7: 'support', 13: 'support',
      14: 'tank', 20: 'tank',
      21: 'tank', 22: 'flex', 23: 'flex', 27: 'tank',
    },
  },
  {
    id: 'gunner-vertical',
    name: 'Gunner Hyper',
    traits: ['gunner','marksman'],
    keyUnits: ['Miss Fortune','Jinx','Caitlyn','Ezreal'],
    augments: ['Gunner Crest','Cybernetic Implants','Marksman Soul','Piltover Protocol'],
    carouselPriority: 'B.F. Sword, Recurve Bow',
    itemManifesto: "Miss Fortune'ya Guinsoo, Hurricane, LW. Jinx'e Rageblade",
    positioningTip: "Gunner'ları arka sol köşeye koy, gap filler önüne.",
    levelTiming: "4-1'de Level 7, 4-2'de roll stop, 5-1'de Level 8",
    econTip: "50g bekle, 4-1'de full roll",
    boardLayout: {
      // Gunners back-left
      0: 'carry', 1: 'carry', 2: 'carry',
      7: 'support', 8: 'flex',
      // Frontline right side
      16: 'tank', 17: 'tank',
      21: 'tank', 22: 'tank',
    },
  },
  {
    id: 'invoker-magic',
    name: 'Invoker Magic',
    traits: ['invoker','mage'],
    keyUnits: ['Ryze','Syndra','Azir','Lissandra'],
    augments: ['Invoker Crest','Spellblade','Arcane Nullifying Orb','Mage Soul'],
    carouselPriority: 'Tear of the Goddess, Needlessly Large Rod',
    itemManifesto: "Ryze'ye Blue Buff, Archangel, Spear of Shojin",
    positioningTip: "Invoker'ları 2. sıraya koy, mages arka saflarda.",
    levelTiming: 'Level 6 3-1, 8 4-1, 9 5-1',
    econTip: '50g bekle, fast 8 oyna',
    boardLayout: {
      // Mages backline
      1: 'carry', 2: 'carry', 4: 'carry',
      // Invokers mid
      8: 'support', 9: 'support', 11: 'flex',
      // Tanks front
      21: 'tank', 22: 'tank', 23: 'tank',
    },
  },
  {
    id: 'slayer-reroll',
    name: 'Slayer Reroll',
    traits: ['slayer','renegade'],
    keyUnits: ['Katarina','Zed','Kayn','Samira'],
    augments: ["Slayer Crest","Knife's Edge","Last Stand","Renegade Heart"],
    carouselPriority: 'Sparring Gloves, B.F. Sword',
    itemManifesto: "Katarina'ya Jeweled Gauntlet, IE, Deathblade",
    positioningTip: "Slayer'ları merkeze koy — her yöne atlayabilsinler.",
    levelTiming: '3-1 slow roll at Level 5, stop 3-3',
    econTip: "20-30g bekle, 3-1'den itibaren roll",
    boardLayout: {
      3: 'carry',
      9: 'carry', 10: 'flex', 11: 'flex',
      15: 'tank', 16: 'tank',
      21: 'tank', 22: 'tank', 24: 'support',
    },
  },
]

// ── Carousel rounds ────────────────────────────────────────────────
export const CAROUSEL_ROUNDS = new Set(['1-3','2-5','3-5','4-5','5-5'])

// ── Augment rounds ─────────────────────────────────────────────────
export const AUGMENT_ROUNDS = new Set(['2-1','3-2','4-2'])

// ── Detect comp from trait strings (from Riot API match data) ──────
export function detectComp(traits: string[]): MetaComp | null {
  const lower = traits.map(t => t.toLowerCase())
  let best: MetaComp | null = null
  let bestScore = 0

  for (const comp of SET16_COMPS) {
    const score = comp.traits.filter(t => lower.some(l => l.includes(t))).length
    if (score > bestScore) { bestScore = score; best = comp }
  }
  return bestScore > 0 ? best : null
}

// ── Threat assessment ──────────────────────────────────────────────
export function assessThreat(placement: number): { emoji: string; label: string } {
  if (placement <= 2)  return { emoji: '🔴', label: 'Yüksek Tehdit' }
  if (placement <= 4)  return { emoji: '🟡', label: 'Orta Tehdit' }
  return { emoji: '🟢', label: 'Düşük Tehdit' }
}
