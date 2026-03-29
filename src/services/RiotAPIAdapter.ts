// src/services/RiotAPIAdapter.ts
// Riot TFT API wrapper — rate-limited, cached, key stored via IPC

export interface RiotSummoner {
  puuid: string
  id: string
  accountId: string
  name: string
  profileIconId: number
  summonerLevel: number
}

export interface TFTLeagueEntry {
  tier: string       // e.g. "DIAMOND"
  rank: string       // e.g. "II"
  leaguePoints: number
  wins: number
  losses: number
}

export interface TFTMatchParticipant {
  puuid: string
  placement: number
  traits: Array<{ name: string; num_units: number; style: number }>
  units: Array<{ character_id: string; rarity: number; tier: number; items: number[] }>
  augments: string[]
  gold_left: number
  last_round: number
  level: number
}

export interface TFTMatchInfo {
  game_id: string
  game_datetime: number
  tft_set_number: number
  tft_set_core_name: string
  participants: TFTMatchParticipant[]
}

export interface ScoutedPlayer {
  summonerName: string
  puuid?: string
  tier?: string
  rank?: string
  lp?: number
  winRate?: number
  avgPlacement?: number
  top4Rate?: number
  gamesAnalyzed?: number
  favoriteTraits?: string[]
  recentPlacements?: number[]
  threatLevel?: 'S' | 'A' | 'B' | 'C'
  loading: boolean
  error?: string
}

// ── Rate limiter (20/s, 100/2min) ────────────────────────────────
class RateQueue {
  private queue: Array<() => Promise<void>> = []
  private processing = false
  private callsThisSecond = 0
  private callsThisWindow = 0
  private secondTimer: ReturnType<typeof setTimeout> | null = null
  private windowTimer: ReturnType<typeof setTimeout> | null = null

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try { resolve(await fn()) } catch (e) { reject(e) }
      })
      this.processQueue()
    })
  }

  private async processQueue() {
    if (this.processing) return
    this.processing = true
    while (this.queue.length > 0) {
      if (this.callsThisSecond >= 20 || this.callsThisWindow >= 100) {
        await sleep(200)
        continue
      }
      const fn = this.queue.shift()!
      this.callsThisSecond++
      this.callsThisWindow++

      if (!this.secondTimer) {
        this.secondTimer = setTimeout(() => {
          this.callsThisSecond = 0
          this.secondTimer = null
        }, 1000)
      }
      if (!this.windowTimer) {
        this.windowTimer = setTimeout(() => {
          this.callsThisWindow = 0
          this.windowTimer = null
        }, 120_000)
      }
      await fn()
    }
    this.processing = false
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

const rateQueue = new RateQueue()

// ── API Fetch via IPC (bypasses CORS, uses main process HTTPS) ───
async function apiFetch(url: string, apiKey: string): Promise<any> {
  const apiFetchIPC = window.electronAPI?.metaTFT?.apiFetch
  if (!apiFetchIPC) throw new Error('apiFetch IPC not available')
  const raw: string = await apiFetchIPC(`${url}${url.includes('?') ? '&' : '?'}api_key=${apiKey}`)
  return JSON.parse(raw)
}

// ── Platform routing ──────────────────────────────────────────────
// NA1, EUW1, EUN1, KR, BR1, JP1, LA1, LA2, OC1, RU, TR1
function regionToHost(region: string): string {
  const map: Record<string, string> = {
    NA: 'na1', EUW: 'euw1', EUNE: 'eun1', KR: 'kr',
    BR: 'br1', JP: 'jp1', LAN: 'la1', LAS: 'la2', OCE: 'oc1', RU: 'ru', TR: 'tr1'
  }
  return map[region.toUpperCase()] ?? 'euw1'
}
function regionToContinent(platformHost: string): string {
  const euPlatforms = ['euw1','eun1','ru','tr1']
  const asPlatforms = ['kr','jp1']
  if (euPlatforms.includes(platformHost)) return 'europe'
  if (asPlatforms.includes(platformHost)) return 'asia'
  const sePlatforms = ['oc1']
  if (sePlatforms.includes(platformHost)) return 'sea'
  return 'americas' // na1, br1, la1, la2
}

// ── Player cache ──────────────────────────────────────────────────
const playerCache = new Map<string, { data: ScoutedPlayer; fetchedAt: number }>()
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

// ── Main public API ───────────────────────────────────────────────

export async function scoutPlayer(
  summonerName: string,
  apiKey: string,
  region = 'EUW'
): Promise<ScoutedPlayer> {
  const cacheKey = `${region}:${summonerName.toLowerCase()}`
  const cached = playerCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data
  }

  const platform = regionToHost(region)
  const continent = regionToContinent(platform)
  const base = `https://${platform}.api.riotgames.com`
  const matchBase = `https://${continent}.api.riotgames.com`

  const result: ScoutedPlayer = { summonerName, loading: true }

  try {
    // 1. Summoner lookup
    const summoner: RiotSummoner = await rateQueue.enqueue(() =>
      apiFetch(`${base}/tft/summoner/v1/summoners/by-name/${encodeURIComponent(summonerName)}`, apiKey)
    )
    result.puuid = summoner.puuid

    // 2. League rank
    try {
      const entries: TFTLeagueEntry[] = await rateQueue.enqueue(() =>
        apiFetch(`${base}/tft/league/v1/entries/by-summoner/${summoner.id}`, apiKey)
      )
      if (entries.length > 0) {
        const e = entries[0]
        result.tier = e.tier
        result.rank = e.rank
        result.lp = e.leaguePoints
        const total = e.wins + e.losses
        result.winRate = total > 0 ? Math.round((e.wins / total) * 100) : 0
      }
    } catch { /* rank is optional */ }

    // 3. Recent match history (last 20 TFT games)
    try {
      const matchIds: string[] = await rateQueue.enqueue(() =>
        apiFetch(`${matchBase}/tft/match/v1/matchlist/by-puuid/${summoner.puuid}?count=20`, apiKey)
      )

      // Fetch up to 10 match details in parallel (batched)
      const matchDetails: TFTMatchInfo[] = []
      const toFetch = matchIds.slice(0, 10)
      for (const matchId of toFetch) {
        try {
          const detail: TFTMatchInfo = await rateQueue.enqueue(() =>
            apiFetch(`${matchBase}/tft/match/v1/matches/${matchId}`, apiKey)
          )
          matchDetails.push(detail)
        } catch { /* skip failed match */ }
      }

      // Parse stats for this player
      const placements: number[] = []
      const traitCounts = new Map<string, number>()

      for (const match of matchDetails) {
        const me = match.participants.find(p => p.puuid === summoner.puuid)
        if (!me) continue
        placements.push(me.placement)
        for (const trait of me.traits) {
          if (trait.style > 0) {
            const clean = trait.name.replace(/^TFT\d+_/, '')
            traitCounts.set(clean, (traitCounts.get(clean) ?? 0) + 1)
          }
        }
      }

      if (placements.length > 0) {
        result.gamesAnalyzed = placements.length
        result.avgPlacement = parseFloat(
          (placements.reduce((a, b) => a + b, 0) / placements.length).toFixed(2)
        )
        result.top4Rate = Math.round(
          (placements.filter(p => p <= 4).length / placements.length) * 100
        )
        result.recentPlacements = placements
      }

      // Top 3 favorite traits
      result.favoriteTraits = [...traitCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([trait]) => trait)

      // Threat level based on avg placement
      const avg = result.avgPlacement ?? 4.5
      result.threatLevel = avg <= 3.0 ? 'S' : avg <= 3.8 ? 'A' : avg <= 4.5 ? 'B' : 'C'

    } catch (e) {
      console.warn(`[RiotAPI] Match history failed for ${summonerName}:`, e)
    }

    result.loading = false
    playerCache.set(cacheKey, { data: result, fetchedAt: Date.now() })
    return result

  } catch (err) {
    return {
      ...result,
      loading: false,
      error: (err as Error).message.includes('404')
        ? 'Summoner not found'
        : 'API Error'
    }
  }
}

export async function scoutPlayers(
  names: string[],
  apiKey: string,
  region = 'EUW'
): Promise<ScoutedPlayer[]> {
  // Scout all players but don't block on each — return progressively
  return Promise.all(names.map(name => scoutPlayer(name, apiKey, region)))
}

export function clearScoutCache() {
  playerCache.clear()
}

// ── Tier display helper ───────────────────────────────────────────
export function formatTier(tier?: string, rank?: string, lp?: number): string {
  if (!tier) return 'Unranked'
  const tierShort = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase()
  if (!rank) return tierShort
  return `${tierShort} ${rank}${lp !== undefined ? ` · ${lp} LP` : ''}`
}
