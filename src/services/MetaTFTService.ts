/**
 * MetaProviderPipeline — v2
 *
 * Ingests TFT comp data from MetaTFT and normalizes it to our internal format.
 * All champions and items are resolved to CDragon IDs/icons for stable rendering.
 *
 * NORMALIZATION PIPELINE:
 *   MetaTFT comp JSON
 *     → extract unit names + items
 *     → resolve unit.name → CDragon character_id + iconUrl
 *     → resolve item names → CDragon item id + iconUrl
 *     → output NormalizedComp[]
 *
 * FALLBACK STRATEGY:
 *   1. Try MetaTFT live via __NEXT_DATA__ scraper
 *   2. Parse and normalize if successful
 *   3. Cache with timestamp
 *   4. If fails → return last cache or static FallbackComps
 */

import { type CompData, type UnitData, type PlacementMap } from '../store/appStore'
import { FALLBACK_COMPS } from './FallbackComps'
import {
  fetchSetIndex,
  type SetChampionIndex,
  fetchItemsData,
  getChampionIconUrl,
  getItemIconUrl,
  normalizeName,
  CURRENT_SET_KEY,
} from './CommunityDragonService'

export type ProvenanceType = 'LIVE' | 'CACHED' | 'FALLBACK'

export interface MetaPipelineResult {
  comps: CompData[]
  provenance: ProvenanceType
  source: string
  fetchedAt: number
  setKey: string
}

// ─── In-memory cache ─────────────────────────────────────
let lastSuccessfulResult: MetaPipelineResult | null = null
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// ─── Pro Comps — Direct API (no scraping!) ───────────────

const PRO_COMPS_URL = 'https://api-hc.metatft.com/tft-stat-api/pro-comps'
let proCompsCache: { comps: CompData[]; fetchedAt: number } | null = null
const PRO_COMPS_TTL_MS = 10 * 60 * 1000

export async function ingestProComps(setIndex: SetChampionIndex | null = null): Promise<CompData[]> {
  if (proCompsCache && Date.now() - proCompsCache.fetchedAt < PRO_COMPS_TTL_MS) {
    console.log('[ProComps] Returning cached pro comps')
    return proCompsCache.comps
  }

  const apiFetch = window.electronAPI?.metaTFT?.apiFetch
  if (!apiFetch) throw new Error('[ProComps] apiFetch IPC not available')

  console.log('[ProComps] Fetching live pro comps via IPC...')
  const raw: string = await apiFetch(PRO_COMPS_URL)
  const json = JSON.parse(raw)
  const comps = parseProCompsJson(json, setIndex)
  proCompsCache = { comps, fetchedAt: Date.now() }
  console.log(`[ProComps] ✅ ${comps.length} comps`)
  return comps
}

function parseProCompsJson(json: any, setIndex: SetChampionIndex | null): CompData[] {
  const results: CompData[] = []
  if (!Array.isArray(json?.content?.comps)) return results

  // Build uuid → ref detail map
  const refsMap = new Map<string, any>()
  if (Array.isArray(json.refs)) {
    for (const ref of json.refs) {
      if (ref?.content_id) refsMap.set(ref.content_id, ref)
    }
  }

  for (const entry of json.content.comps) {
    try {
      const refPath: string = entry?.data?.$ref ?? ''
      const compId = refPath.replace('#/comp/', '')
      const ref = refsMap.get(compId)
      if (!ref) continue

      const unitPositions: Record<string, any> = ref.content?.unit_positions ?? {}
      const title: string = ref.metadata?.title ?? ref.content?.title ?? ''
      const author: string = ref.author?.riotid ?? 'Unknown'
      const notes: string = ref.content?.notes ?? ''
      const tier = (['S', 'A', 'B', 'C'].includes((entry.tier ?? '').toUpperCase())
        ? (entry.tier as 'S' | 'A' | 'B' | 'C')
        : 'B') as 'S' | 'A' | 'B' | 'C'

      const placementMap: PlacementMap = {}
      const units: UnitData[] = []
      const seen = new Set<string>()

      for (const [slotStr, slotData] of Object.entries(unitPositions)) {
        if (!slotData || (slotData as any).type !== 'unit') continue
        const slot = parseInt(slotStr, 10)
        if (isNaN(slot)) continue
        const apiName: string = (slotData as any).apiName ?? ''
        if (!apiName) continue

        const champion = setIndex?.characterIdToChampion.get(apiName)
        const iconUrl = champion
          ? getChampionIconUrl(champion.squareIconPath || champion.characterId)
          : undefined

        const rawItems: any[] = (slotData as any).items ?? []
        const items = rawItems
          .map((item: any) => {
            const n: string = typeof item === 'string' ? item : item.id ?? item.name ?? ''
            return n ? { name: n, iconUrl: getItemIconUrl(n) ?? undefined } : null
          })
          .filter(Boolean) as { name: string; iconUrl?: string }[]

        const unitData: UnitData = {
          name: champion?.displayName ?? apiName.replace(/^TFT\d+_/, '').replace(/([A-Z])/g, ' $1').trim(),
          cost: champion?.cost ?? 1,
          characterId: apiName,
          iconUrl,
          items,
        }

        placementMap[slot] = unitData
        if (!seen.has(apiName)) { seen.add(apiName); units.push(unitData) }
      }

      results.push({
        id: compId,
        name: title || `Pro Comp ${results.length + 1}`,
        tier,
        avgPlace: 0,
        playRate: 0,
        author,
        notes,
        traits: [],
        units,
        placementMap,
        gameMode: 'Ranked',
      })
    } catch (err) {
      console.warn('[ProComps] parse error:', err)
    }
  }
  return results
}

// ─── Main Entry Point ────────────────────────────────────

const CLUSTER_ID_URL   = 'https://api-hc.metatft.com/tft-comps-api/latest_cluster_id'
const CLUSTER_INFO_URL = 'https://api-hc.metatft.com/tft-comps-api/latest_cluster_info'
const COMP_BUILDS_URL  = 'https://api-hc.metatft.com/tft-comps-api/comp_builds'

export async function ingestMetaComps(): Promise<MetaPipelineResult> {
  // Return fresh cache if still valid
  if (
    lastSuccessfulResult &&
    lastSuccessfulResult.provenance === 'LIVE' &&
    Date.now() - lastSuccessfulResult.fetchedAt < CACHE_TTL_MS
  ) {
    console.log('[MetaPipeline] Returning cached live data')
    return { ...lastSuccessfulResult, provenance: 'CACHED' }
  }

  let setIndex: SetChampionIndex | null = null
  try {
    const [fetchedIndex] = await Promise.all([fetchSetIndex(CURRENT_SET_KEY), fetchItemsData()])
    setIndex = fetchedIndex
  } catch (err) {
    console.error('[MetaPipeline] CDragon preload failed:', err)
  }

  // Fetch from MetaTFT cluster API via Electron IPC (bypasses CORS)
  try {
    const apiFetch = window.electronAPI?.metaTFT?.apiFetch
    if (!apiFetch) throw new Error('apiFetch IPC not available')

    console.log('[MetaPipeline] Fetching MetaTFT cluster API via IPC...')
    const idRaw: string = await apiFetch(CLUSTER_ID_URL)
    const idJson = JSON.parse(idRaw)
    const clusterId: number = idJson.cluster_id
    const tftSet: string = idJson.tft_set ?? CURRENT_SET_KEY

    const infoRaw: string = await apiFetch(`${CLUSTER_INFO_URL}?cluster_id=${clusterId}`)
    const infoJson = JSON.parse(infoRaw)
    const clusters: any[] = infoJson?.cluster_info?.cluster_details?.clusters ?? []
    if (!clusters.length) throw new Error('empty clusters')

    // Also fetch comp_options for avg_place and count (tier calculation)
    let optionsMap: Record<string, { avg: number; count: number }> = {}
    try {
      const optRaw: string = await apiFetch(`https://api-hc.metatft.com/tft-comps-api/comp_options?cluster_id=${clusterId}`)
      const optJson = JSON.parse(optRaw)
      for (const [compId, bySize] of Object.entries(optJson?.options ?? {})) {
        const sizes = bySize as Record<string, any[]>
        // Pick the largest size bucket with best avg
        let best: any = null
        for (const arr of Object.values(sizes)) {
          if (Array.isArray(arr) && arr.length > 0 && (!best || arr[0].avg < best.avg)) {
            best = arr[0]
          }
        }
        if (best) optionsMap[compId] = { avg: best.avg, count: best.count }
      }
    } catch { /* optional */ }

    // Fetch builds for top items (optional, best-effort)
    let buildsMap: Record<string, any> = {}
    try {
      const ids = clusters.map((c: any) => c.Cluster).join(',')
      const bRaw: string = await apiFetch(`${COMP_BUILDS_URL}?cluster_id=${clusterId}&comp_id=${ids}`)
      const bJson = JSON.parse(bRaw)
      buildsMap = bJson?.results ?? {}
      // Debug: show raw structure of first comp build
      const firstKey = Object.keys(buildsMap)[0]
      if (firstKey) {
        console.log(`[MetaPipeline] builds sample key="${firstKey}":`, JSON.stringify(buildsMap[firstKey]).slice(0, 300))
      }
    } catch (e) { console.warn('[MetaPipeline] builds fetch failed:', e) }

    const comps = parseClusterComps(clusters, buildsMap, optionsMap, tftSet, setIndex)
    if (!comps.length) throw new Error('parsed 0 comps')
    // Debug: log item distribution
    const withItems = comps.filter(c => c.units.some(u => u.items && u.items.length > 0)).length
    console.log(`[MetaPipeline] Comps with unit items: ${withItems}/${comps.length}`)
    if (comps[0]) {
      const sample = comps[0]
      console.log(`[MetaPipeline] Sample comp "${sample.name}": ${sample.units.length} units, first unit items:`, sample.units[0]?.items?.map((i:any) => i.name ?? i))
    }

    const result: MetaPipelineResult = {
      comps, provenance: 'LIVE', source: 'MetaTFT API',
      fetchedAt: Date.now(), setKey: tftSet,
    }
    lastSuccessfulResult = result
    console.log(`[MetaPipeline] ✅ ${comps.length} comps (cluster ${clusterId})`)
    return result
  } catch (err) {
    console.warn('[MetaPipeline] Cluster API failed:', (err as Error).message)
  }


  // Use last cache regardless of age
  if (lastSuccessfulResult) {
    console.log('[MetaPipeline] Returning stale cache')
    return { ...lastSuccessfulResult, provenance: 'CACHED' }
  }

  // Final fallback — normalize static comps with CDragon icons
  console.log('[MetaPipeline] Using static fallback comps')
  const normalizedFallback = normalizeFallback(FALLBACK_COMPS, setIndex)
  return {
    comps: normalizedFallback,
    provenance: 'FALLBACK',
    source: 'Static Snapshot',
    fetchedAt: Date.now(),
    setKey: CURRENT_SET_KEY,
  }
}

// ─── Cluster API Parser ─────────────────────────────────────────────

function parseClusterComps(
  clusters: any[],
  buildsMap: Record<string, any>,
  optionsMap: Record<string, { avg: number; count: number }>,
  _setKey: string,
  setIndex: SetChampionIndex | null
): CompData[] {
  const results: CompData[] = []

  for (const cluster of clusters) {
    try {
      const compId = String(cluster.Cluster)

      // name is an array of {name, score, type} objects — use name_string for display
      const rawName = cluster.name_string ?? cluster.name
      const name: string = (typeof rawName === 'string' ? rawName : `Comp ${compId}`)
        .replace(/TFT\d+_/g, '').replace(/,/g, ' ·')

      // units_string and traits_string use ", " separator (comma+space)
      const unitsRaw: string[] = (cluster.units_string ?? '')
        .split(',').map((s: string) => s.trim()).filter(Boolean)
      const traitsRaw: string[] = (cluster.traits_string ?? '')
        .split(',').map((s: string) => s.trim()).filter(Boolean)

      const traits = traitsRaw.map((t: string) => {
        // e.g. "TFT16_Demacia_3" → "Demacia 3"
        const base = t.replace(/^TFT\d+_/, '')
        const parts = base.split('_')
        const count = parts[parts.length - 1]
        const traitName = parts.slice(0, -1).join(' ')
        return `${traitName} ${count}`
      })

      // avg_place and count from comp_options (more accurate than cluster_info)
      const opts = optionsMap[compId]
      const avgPlace: number = parseFloat((opts?.avg ?? 4.0).toFixed(2))
      const playCount: number = opts?.count ?? 0

      let tier: 'S' | 'A' | 'B' | 'C' = 'B'
      if (avgPlace <= 3.0) tier = 'S'
      else if (avgPlace <= 3.8) tier = 'A'
      else if (avgPlace >= 5.0) tier = 'C'

      const topItems = new Map<string, string[]>()
      const builds: any[] = buildsMap[compId]?.builds ?? []
      for (const build of builds) {
        const u: string = build.unit ?? ''
        if (u && !topItems.has(u)) topItems.set(u, build.buildName ?? [])
      }

      const units: UnitData[] = unitsRaw.map(apiName => {
        const champion = setIndex?.characterIdToChampion.get(apiName)
        const iconUrl = champion
          ? getChampionIconUrl(champion.squareIconPath || champion.characterId)
          : undefined
        const items = (topItems.get(apiName) ?? []).map(id => ({
          name: id,
          iconUrl: undefined as string | undefined, // resolved by OverlayPanel via cdItems
        }))
        return {
          name: champion?.displayName ?? apiName.replace(/^TFT\d+_/, '').replace(/([A-Z])/g, ' $1').trim(),
          cost: champion?.cost ?? 1,
          characterId: apiName,
          iconUrl,
          items,
        } as UnitData
      })

      const playRate = parseFloat(((playCount / 1000000) * 100).toFixed(2))
      results.push({ id: compId, name, tier, avgPlace, playRate, traits, units, gameMode: 'Ranked' })
    } catch (err) {
      console.warn('[MetaPipeline] cluster parse error:', err)
    }
  }

  return results.sort((a, b) => {
    const o = { S: 0, A: 1, B: 2, C: 3 }
    return (o[a.tier] - o[b.tier]) || (a.avgPlace - b.avgPlace)
  })
}

// ─── Fallback normalizer ─────────────────────────────────

function normalizeFallback(comps: CompData[], setIndex: SetChampionIndex | null): CompData[] {
  return comps.map(comp => ({
    ...comp,
    units: comp.units.map(unit => {
      const charId = setIndex?.nameToCharacterId.get(normalizeName(unit.name))
      const champion = charId && setIndex ? setIndex.characterIdToChampion.get(charId) : undefined
      const resolvedIconUrl = champion ? getChampionIconUrl(champion.squareIconPath || champion.characterId) : undefined
      const iconUrl = resolvedIconUrl ?? unit.iconUrl

      const items = (unit.items ?? []).map(item => {
        if (typeof item === 'string') {
          return { name: item, iconUrl: getItemIconUrl(item) ?? undefined }
        }
        return item
      })

      return {
        ...unit,
        characterId: champion?.characterId ?? unit.characterId,
        iconUrl,
        items,
      }
    }),
  }))
}
