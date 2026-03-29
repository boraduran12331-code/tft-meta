/**
 * ItemSuggestionEngine — Antigravity TFT Companion
 *
 * Builds a lookup table from CDragon TFT item data and provides:
 *  - BIS item → component breakdown (what to pick on carousel)
 *  - Per-comp component priority list
 *  - Stage-based advice hooks
 */

import type { TFTItem } from './CommunityDragonService'
import type { CompData } from '../store/appStore'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComponentInfo {
  apiName: string          // e.g. "TFT_Item_BFSword"
  shortName: string        // e.g. "B.F. Sword"
  iconUrl: string
}

export interface BISEntry {
  unitName: string
  unitCharacterId: string
  items: ItemBuildEntry[]
}

export interface ItemBuildEntry {
  apiName: string          // e.g. "TFT_Item_SpearOfShojin"
  displayName: string      // e.g. "Spear of Shojin"
  iconUrl: string
  components: ComponentInfo[]  // the 2 components that make it
}

export interface ComponentGoal {
  apiName: string
  shortName: string
  iconUrl: string
  count: number            // how many copies needed across all BIS
  usedIn: string[]         // which item names this contributes to
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPONENT_SHORT_NAMES: Record<string, string> = {
  'TFT_Item_BFSword':            'B.F. Sword',
  'TFT_Item_RecurveBow':         'Recurve Bow',
  'TFT_Item_ChainVest':          'Chain Vest',
  'TFT_Item_NegatronCloak':      'Negatron Cloak',
  'TFT_Item_NeedlesslyLargeRod': 'Needlessly Large Rod',
  'TFT_Item_TearOfTheGoddess':   'Tear of Goddess',
  'TFT_Item_GiantsBelt':         "Giant's Belt",
  'TFT_Item_SparringGloves':     'Sparring Gloves',
  'TFT_Item_Spatula':            'Spatula',
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class ItemSuggestionEngine {
  /** apiName → TFTItem (full list) */
  private itemMap = new Map<string, TFTItem>()

  constructor(tftItems: TFTItem[]) {
    for (const item of tftItems) {
      this.itemMap.set(item.apiName, item)
    }
  }

  /** Resolve a component's info (short name + icon). */
  private resolveComponent(apiName: string): ComponentInfo {
    const item = this.itemMap.get(apiName)
    return {
      apiName,
      shortName: COMPONENT_SHORT_NAMES[apiName] ?? item?.name ?? apiName.replace(/^TFT_Item_/, ''),
      iconUrl: item?.iconUrl ?? '',
    }
  }

  /** Build full BIS guide for a comp. */
  getBISGuide(comp: CompData): BISEntry[] {
    const guide: BISEntry[] = []

    for (const unit of comp.units) {
      if (!unit.items || unit.items.length === 0) continue

      const itemEntries: ItemBuildEntry[] = unit.items.map(rawItem => {
        const apiName = typeof rawItem === 'string' ? rawItem : rawItem.name
        const tftItem = this.itemMap.get(apiName)
        const displayName = tftItem?.name ?? apiName.replace(/^TFT_Item_/, '').replace(/([A-Z])/g, ' $1').trim()
        const iconUrl = tftItem?.iconUrl ?? (typeof rawItem === 'object' ? rawItem.iconUrl ?? '' : '')

        const components: ComponentInfo[] = (tftItem?.composition ?? []).map(c => this.resolveComponent(c))

        return { apiName, displayName, iconUrl, components }
      })

      guide.push({
        unitName: unit.name,
        unitCharacterId: unit.characterId ?? unit.name,
        items: itemEntries,
      })
    }

    return guide
  }

  /** Aggregate all required components for a comp, sorted by priority. */
  getComponentGoals(comp: CompData): ComponentGoal[] {
    const guide = this.getBISGuide(comp)
    const tally = new Map<string, ComponentGoal>()

    for (const entry of guide) {
      for (const item of entry.items) {
        for (const comp of item.components) {
          const existing = tally.get(comp.apiName)
          if (existing) {
            existing.count++
            if (!existing.usedIn.includes(item.displayName)) existing.usedIn.push(item.displayName)
          } else {
            tally.set(comp.apiName, {
              apiName: comp.apiName,
              shortName: comp.shortName,
              iconUrl: comp.iconUrl,
              count: 1,
              usedIn: [item.displayName],
            })
          }
        }
      }
    }

    // Sort: most-needed components first
    return [...tally.values()].sort((a, b) => b.count - a.count)
  }
}
