// src/services/TFTMetaFrontend.ts
// Frontend-safe copy of the SET16 board layouts.
// (The electron/services/TFTMeta.ts version is Electron-only)

export interface FrontendMetaComp {
  id: string
  traits: string[]
  positioningTip: string
  boardLayout: Record<number, 'carry' | 'tank' | 'support' | 'flex'>
}

export const SET16_COMPS: FrontendMetaComp[] = [
  {
    id: 'arcana-carry',
    traits: ['arcana', 'mage'],
    positioningTip: "Mage'ları arka sıraya koy, frontline önünde. Carry sol köşede.",
    boardLayout: {
      1: 'carry', 2: 'carry', 4: 'support', 5: 'flex',
      7: 'flex', 9: 'flex', 11: 'flex',
      14: 'tank', 16: 'tank',
      21: 'tank', 22: 'tank', 23: 'tank',
    },
  },
  {
    id: 'bruiser-frontline',
    traits: ['bruiser', 'guardian'],
    positioningTip: "Bruiser'ları ön sıraya yay, carry arka köşede gizli.",
    boardLayout: {
      0: 'carry', 2: 'support',
      8: 'flex', 10: 'flex',
      14: 'tank', 15: 'tank', 16: 'tank',
      21: 'tank', 22: 'tank', 23: 'tank', 24: 'tank',
    },
  },
  {
    id: 'strategist-reroll',
    traits: ['strategist', 'warrior'],
    positioningTip: "Warrior'ları orta hatta, Akali kenar/köşede atlı.",
    boardLayout: {
      0: 'carry', 1: 'flex',
      8: 'support', 10: 'carry',
      14: 'flex', 15: 'tank', 16: 'flex',
      21: 'tank', 22: 'tank', 23: 'tank',
    },
  },
  {
    id: 'dominator-vertical',
    traits: ['dominator', 'shape-shifter'],
    positioningTip: "Swain ortada, Vladimir yan yana. Galio ön sıra kalkan.",
    boardLayout: {
      0: 'support', 3: 'carry',
      8: 'flex', 9: 'carry', 11: 'flex',
      14: 'flex', 15: 'tank',
      21: 'tank', 22: 'tank', 23: 'flex',
    },
  },
  {
    id: 'bastion-sentinel',
    traits: ['bastion', 'sentinel'],
    positioningTip: "Sentinel'ları dışarıya koy, birbirinden 1 hex uzakta.",
    boardLayout: {
      0: 'carry', 6: 'carry',
      7: 'support', 13: 'support',
      14: 'tank', 20: 'tank',
      21: 'tank', 22: 'flex', 23: 'flex', 27: 'tank',
    },
  },
  {
    id: 'gunner-vertical',
    traits: ['gunner', 'marksman'],
    positioningTip: "Gunner'ları arka sol köşeye koy, gap filler önüne.",
    boardLayout: {
      0: 'carry', 1: 'carry', 2: 'carry',
      7: 'support', 8: 'flex',
      16: 'tank', 17: 'tank',
      21: 'tank', 22: 'tank',
    },
  },
  {
    id: 'invoker-magic',
    traits: ['invoker', 'mage'],
    positioningTip: "Invoker'ları 2. sıraya koy, mages arka saflarda.",
    boardLayout: {
      1: 'carry', 2: 'carry', 4: 'carry',
      8: 'support', 9: 'support', 11: 'flex',
      21: 'tank', 22: 'tank', 23: 'tank',
    },
  },
  {
    id: 'slayer-reroll',
    traits: ['slayer', 'renegade'],
    positioningTip: "Slayer'ları merkeze koy — her yöne atlayabilsinler.",
    boardLayout: {
      3: 'carry',
      9: 'carry', 10: 'flex', 11: 'flex',
      15: 'tank', 16: 'tank',
      21: 'tank', 22: 'tank', 24: 'support',
    },
  },
]
