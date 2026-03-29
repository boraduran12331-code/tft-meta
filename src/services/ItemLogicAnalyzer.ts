import type { CompData } from '../store/appStore'

export const BASE_COMPONENTS = {
  B_F_SWORD: 'B.F. Sword',
  RECURVE_BOW: 'Recurve Bow',
  ROD: 'Needlessly Large Rod',
  TEAR: 'Tear of the Goddess',
  CHAIN_VEST: 'Chain Vest',
  CLOAK: 'Negatron Cloak',
  BELT: 'Giant\'s Belt',
  GLOVES: 'Sparring Gloves'
} as const

// Mock recipes of completed items for the MVP demo
export const ITEM_RECIPES: Record<string, string[]> = {
  'Bloodthirster': [BASE_COMPONENTS.B_F_SWORD, BASE_COMPONENTS.CLOAK],
  'Titans Resolve': [BASE_COMPONENTS.RECURVE_BOW, BASE_COMPONENTS.CHAIN_VEST],
  'Steraks Gage': [BASE_COMPONENTS.B_F_SWORD, BASE_COMPONENTS.BELT],
  'Blue Buff': [BASE_COMPONENTS.TEAR, BASE_COMPONENTS.TEAR],
  'Jeweled Gauntlet': [BASE_COMPONENTS.ROD, BASE_COMPONENTS.GLOVES],
  'Nashors Tooth': [BASE_COMPONENTS.RECURVE_BOW, BASE_COMPONENTS.BELT],
  'Rapid Firecannon': [BASE_COMPONENTS.RECURVE_BOW, BASE_COMPONENTS.RECURVE_BOW],
  'Infinity Edge': [BASE_COMPONENTS.B_F_SWORD, BASE_COMPONENTS.GLOVES],
  'Hand of Justice': [BASE_COMPONENTS.TEAR, BASE_COMPONENTS.GLOVES],
  'Ionic Spark': [BASE_COMPONENTS.ROD, BASE_COMPONENTS.CLOAK]
}

export interface ItemSuggestion {
  completedItem: string
  missingComponent: string
  currentComponents: string[]
  targetUnit: string
}

/**
 * suggestItems
 * Analyzes the user's currently owned components and suggests the next best component
 * or immediately craftable item based on the target Comp's BIS items.
 */
export function suggestItems(
  ownedComponents: string[],
  targetComp: CompData
): ItemSuggestion | null {
  if (!ownedComponents || ownedComponents.length === 0) return null

  // 1. Collect all target items we want from the units
  const targetNeeds: Array<{ unitName: string, item: string }> = []
  targetComp.units.forEach(unit => {
    if (unit.items && unit.items.length > 0) {
      unit.items.forEach(item => {
        // item can be a string or ItemRef object
        const itemName = typeof item === 'string' ? item : item.name
        if (itemName) targetNeeds.push({ unitName: unit.name, item: itemName })
      })
    }
  })

  // 2. Loop through our components and see if they fit any recipe
  for (const need of targetNeeds) {
    const recipe = ITEM_RECIPES[need.item]
    if (!recipe) continue // recipe not in DB yet

    const [compA, compB] = recipe

    const hasA = ownedComponents.includes(compA)
    const hasB = ownedComponents.includes(compB)

    // Can craft immediately?
    if (hasA && hasB && compA !== compB) {
      return {
        completedItem: need.item,
        missingComponent: 'HAZIR',
        currentComponents: [compA, compB],
        targetUnit: need.unitName
      }
    } else if (hasA && compA === compB && ownedComponents.filter(c => c === compA).length >= 2) {
      return {
        completedItem: need.item,
        missingComponent: 'HAZIR',
        currentComponents: [compA, compA],
        targetUnit: need.unitName
      }
    }
    
    // Missing one?
    else if (hasA) {
      return {
        completedItem: need.item,
        missingComponent: compB,
        currentComponents: [compA],
        targetUnit: need.unitName
      }
    } else if (hasB) {
      return {
        completedItem: need.item,
        missingComponent: compA,
        currentComponents: [compB],
        targetUnit: need.unitName
      }
    }
  }

  return null
}
