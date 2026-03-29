// src/services/CommunityDragonService.ts

export const CURRENT_SET_KEY = 'TFTSet16'
export const TEAMPLANNER_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/tftchampions-teamplanner.json'
export const ITEMS_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/items.json'

export interface ChampionData {
  characterId: string;
  displayName: string;
  teamPlannerCode: number;
  hexIndex: string;  // 3-char hex from 1-based alphabetical index, e.g. "001", "064"
  sortIndex: number; // 1-based alphabetic
  cost: number;
  squareIconPath: string;
}

export type SetChampionIndex = {
  setKey: string;
  champions: ChampionData[];
  nameToCharacterId: Map<string, string>;
  characterIdToChampion: Map<string, ChampionData>;
}

export interface ItemData {
  id: number
  name: string
  nameId: string
  squareIconPath: string
}

// ─── Shared Utilities ──────────────────────────────────────

/**
 * Handle common MetaTFT aliases and CDragon ID quirks.
 */
export function normalizeName(name: string): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .trim()
    .replace(/['\u2019\u0027\u2018]/g, '') // apostrophes (Bel'Veth, Kog'Maw etc.)
    .replace(/[.\-–]/g, '')                 // dots, dashes
    .replace(/\s+/g, '')                    // spaces
    .replace(/[^a-z0-9]/g, '')              // extra safety
}

// ─── Main Fetch & Indexing ───────────────────────────────

const setIndexCache = new Map<string, SetChampionIndex>()

/**
 * Fetch and index TFT champions from CDragon for a specific set.
 * Returns a high-performance index object for the encoder.
 * Caches results in memory to avoid redundant network requests.
 */
export async function fetchSetIndex(setKey: string): Promise<SetChampionIndex> {
  if (setIndexCache.has(setKey)) {
    return setIndexCache.get(setKey)!
  }

  console.log(`[CDragon] Fetching set index for ${setKey} …`)
  const res = await fetch(TEAMPLANNER_URL)
  if (!res.ok) throw new Error(`[CDragon] teamplanner fetch failed: ${res.status}`)

  const data: Record<string, any[]> = await res.json()
  const rawChampions = data[setKey]
  
  // Guardrail: Ensure setKey exists and has data
  if (!Array.isArray(rawChampions) || rawChampions.length === 0) {
    throw new Error(`[CDragon] No team planner data found for setKey: ${setKey}`)
  }

  // 1. Sort by character_id alphabetically (THE ground truth for indexing)
  const sorted = [...rawChampions].sort((a, b) =>
    a.character_id.localeCompare(b.character_id)
  )

  const index: SetChampionIndex = {
    setKey,
    champions: [],
    nameToCharacterId: new Map(),
    characterIdToChampion: new Map()
  }

  sorted.forEach((c, i) => {
    const sortIndex = i + 1
    const hexIndex = sortIndex.toString(16).padStart(3, '0')
    const teamPlannerCode = Number(c.team_planner_code) || 0

    const champ: ChampionData = {
      characterId: c.character_id,
      displayName: c.display_name.trim(),
      teamPlannerCode,
      hexIndex,
      sortIndex,
      cost: c.tier,
      squareIconPath: c.squareIconPath || ''
    }

    index.champions.push(champ)
    index.characterIdToChampion.set(champ.characterId, champ)

    // Exact matches for various input formats
    const normDisplayName = normalizeName(champ.displayName)
    const normIdSuffix = normalizeName(champ.characterId.replace(/^TFT\d+_?/i, ''))

    // Map display name to characterId
    index.nameToCharacterId.set(normDisplayName, champ.characterId)
    
    // Map suffix to characterId (fallback for TFT16_Jinx inputs)
    if (!index.nameToCharacterId.has(normIdSuffix)) {
      index.nameToCharacterId.set(normIdSuffix, champ.characterId)
    }
    
    // Also map characterId directly
    index.nameToCharacterId.set(normalizeName(champ.characterId), champ.characterId)
    
    if (champ.teamPlannerCode > 0) {
      index.nameToCharacterId.set(champ.teamPlannerCode.toString(), champ.characterId)
    }
  })

  console.log(`[CDragon] Index built for ${setKey}: ${index.champions.length} units`)
  setIndexCache.set(setKey, index)
  return index
}

// ─── Icons & Items ───────────────────────────────────────

export function getChampionIconUrl(path: string): string {
  if (!path) return ''
  const cleanPath = path.replace('/lol-game-data/assets/', '').toLowerCase()
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${cleanPath}`
}

export async function fetchItemsData(): Promise<ItemData[]> {
  const res = await fetch(ITEMS_URL)
  if (!res.ok) throw new Error(`[CDragon] items fetch failed: ${res.status}`)
  const raw: any[] = await res.json()
  return raw.map(i => ({
    id: i.id,
    name: i.name,
    nameId: i.nameId,
    squareIconPath: i.squareIconPath
  }))
}

export function getItemIconUrl(path: string): string {
  if (!path) return ''
  const cleanPath = path.replace('/lol-game-data/assets/', '').toLowerCase()
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${cleanPath}`
}

// ─── TFT Item Recipe Data (CDragon TFT endpoint) ─────────────────────────────

const TFT_DATA_URL = 'https://raw.communitydragon.org/latest/cdragon/tft/en_us.json'

export interface TFTItem {
  apiName: string
  name: string
  composition: string[]   // e.g. ["TFT_Item_BFSword", "TFT_Item_TearOfTheGoddess"]
  iconPath: string        // CDragon game asset path
  iconUrl: string         // resolved URL
}

let tftItemCache: TFTItem[] | null = null

export async function fetchTFTItems(): Promise<TFTItem[]> {
  if (tftItemCache) return tftItemCache

  const res = await fetch(TFT_DATA_URL)
  if (!res.ok) throw new Error(`[CDragon] TFT data fetch failed: ${res.status}`)
  const d = await res.json()

  const items: TFTItem[] = (d.items ?? [])
    .filter((i: any) => i.apiName && i.apiName.startsWith('TFT_Item_'))
    .map((i: any): TFTItem => ({
      apiName: i.apiName,
      name: i.name ?? i.apiName,
      composition: i.composition ?? [],
      iconPath: i.icon ?? '',
      iconUrl: getTFTItemIconUrl(i.icon ?? ''),
    }))

  tftItemCache = items
  console.log(`[CDragon] Loaded ${items.length} TFT items (${items.filter(i => i.composition.length === 2).length} with recipes)`)
  return items
}

/** Convert CDragon in-game asset path to URL.
 *  Input:  "ASSETS/Maps/TFT/Icons/Items/Hexcore/TFT_Item_SpearOfShojin.TFT_Set13.tex"
 *  Output: "https://raw.communitydragon.org/latest/game/assets/maps/tft/icons/items/hexcore/tft_item_spearofshojin.tft_set13.png"
 */
export function getTFTItemIconUrl(iconPath: string): string {
  if (!iconPath) return ''
  const clean = iconPath.toLowerCase().replace(/\.tex$/, '.png')
  return `https://raw.communitydragon.org/latest/game/${clean}`
}
