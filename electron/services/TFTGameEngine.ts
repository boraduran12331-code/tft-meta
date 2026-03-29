// electron/services/TFTGameEngine.ts
// Real-time TFT intelligence engine — Electron main process only.
// Polls port 2999 (Riot Live Client API) + LCU for actionable in-game data.
// Policy-safe: only reads data intentionally surfaced by Riot's own public APIs.

import { EventEmitter } from 'events'
import https from 'https'

import { AUGMENT_ROUNDS, CAROUSEL_ROUNDS, MetaComp, assessThreat, detectComp } from './TFTMeta'
import { OpponentPrediction, OpponentPredictor, PossibleOpponent } from './OpponentPredictor'
import {
  ClipboardMonitor,
  LevelRollDecision,
  CompClipboardResult,
  ItemSuggestion,
  decideLevelOrRoll,
  suggestItems,
  buildLevelRollNotif,
  buildCompClipboardNotif,
  buildCounterNotif,
} from './NotificationEngine'

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type NotifType = 'stage' | 'opponent' | 'item' | 'augment' | 'econ' | 'position' | 'shop' | 'carousel' | 'level' | 'clipboard'

export interface TFTNotification {
  id: string
  type: NotifType
  emoji: string
  title: string
  body: string
  ttl?: number
  priority?: 'low' | 'normal' | 'high'
  opponentPrediction?: OpponentPrediction   // structured data for UI rendering
  levelDecision?: LevelRollDecision          // level vs roll karar verisi
  clipboardComp?: CompClipboardResult        // clipboard'dan tespit edilen comp
}

export interface TFTPlayer {
  summonerName: string
  position: number
  kills: number
  deaths: number
  isAlive: boolean
}

export interface TFTLiveState {
  gameTime: number
  round: string
  gameMode: string
  gold: number | null
  level: number | null
  xp: number | null
  xpToNextLevel: number | null
  hp: number | null
  streak: number | null
  localPlayer: string | null
  players: TFTPlayer[]
  nextOpponent: string | null
  nextOpponentPosition: number | null
  boardUnits: Array<{ characterId: string; name: string; tier: number; items: string[]; position: { x: number; y: number } }> | null
  shopUnits: Array<{ characterId: string; name: string; cost: number; owned: boolean; available: boolean }> | null
  components: string[] | null
  activeTraits: string[] | null
  opponentPrediction?: OpponentPrediction
}

interface CoachTarget {
  compName: string
  units: string[]
  keyItems: Record<string, string[]>
}

// ─────────────────────────────────────────────────────────────────
// Round timing (derived from game clock)
// ─────────────────────────────────────────────────────────────────

const ROUND_BREAKPOINTS: [number, string][] = [
  [0,'1-1'],[33,'1-2'],[66,'1-3'],
  [120,'2-1'],[150,'2-2'],[180,'2-3'],[210,'2-4'],[240,'2-5'],
  [300,'3-1'],[330,'3-2'],[360,'3-3'],[390,'3-4'],[420,'3-5'],[450,'3-6'],
  [510,'4-1'],[540,'4-2'],[570,'4-3'],[600,'4-4'],[630,'4-5'],[660,'4-6'],
  [720,'5-1'],[750,'5-2'],[780,'5-3'],[810,'5-4'],[840,'5-5'],
  [900,'6-1'],[930,'6-2'],[960,'6-3'],[990,'6-4'],
  [1080,'7-1'],[1110,'7-2'],[1140,'7-3'],
]

function estimateRound(t: number): string {
  let r = '1-1'
  for (const [threshold, label] of ROUND_BREAKPOINTS) {
    if (t >= threshold) r = label
  }
  return r
}

// ─────────────────────────────────────────────────────────────────
// Riot API routing tables
// ─────────────────────────────────────────────────────────────────

const ROUTING: Record<string, string> = {
  EUW: 'europe', EUNE: 'europe', TR: 'europe', RU: 'europe',
  NA: 'americas', BR: 'americas', LAN: 'americas', LAS: 'americas',
  KR: 'asia', JP: 'asia', OCE: 'sea',
}
const PLATFORM: Record<string, string> = {
  EUW: 'euw1.api.riotgames.com', EUNE: 'eun1.api.riotgames.com',
  TR: 'tr1.api.riotgames.com',   NA: 'na1.api.riotgames.com',
  KR: 'kr.api.riotgames.com',   JP: 'jp1.api.riotgames.com',
  BR: 'br1.api.riotgames.com',  LAN: 'la1.api.riotgames.com',
  LAS: 'la2.api.riotgames.com', OCE: 'oc1.api.riotgames.com',
  RU: 'ru.api.riotgames.com',
}

// ─────────────────────────────────────────────────────────────────
// Econ / shop / item helper functions
// ─────────────────────────────────────────────────────────────────

function getEconTip(gold: number, level: number, streak: number, round: string): TFTNotification | null {
  const [stage] = round.split('-').map(Number)
  const now = Date.now()

  if (gold >= 48 && gold < 55)
    return { id: `econ-50g-${Math.floor(now / 60000)}`, type: 'econ', emoji: '💰',
      title: 'Faiz Noktası: 50g', body: "50g'de bekle — +5 altın faiz alıyorsun", ttl: 8000 }

  for (const b of [10, 20, 30, 40]) {
    if (gold >= b - 2 && gold < b)
      return { id: `econ-${b}g-${Math.floor(now / 90000)}`, type: 'econ', emoji: '🪙',
        title: `Faiz Eşiği: ${b}g`, body: `${b - gold} altınla +${Math.floor(b / 10)} faiz`, ttl: 7000 }
  }

  if (level === 7 && stage >= 4)
    return { id: `lvl8-s${stage}`, type: 'stage', emoji: '⬆️',
      title: 'Level 8 Zamanı', body: "4-cost birimler için L8'e yüksel", ttl: 8000 }

  if (streak >= 3)
    return { id: `streak-win-${streak}-${Math.floor(now / 120000)}`, type: 'econ', emoji: '🔥',
      title: `${streak} Galibiyet Serisi!`, body: 'Seri bonus korunuyor — savunmayı koru', ttl: 7000 }

  if (streak <= -3)
    return { id: `streak-lose-${Math.abs(streak)}-${Math.floor(now / 120000)}`, type: 'econ', emoji: '📉',
      title: `${Math.abs(streak)} Kayıp Serisi`, body: 'LP koru, econ yap, agresif roll', ttl: 7000 }

  return null
}

function getShopTip(
  shop: TFTLiveState['shopUnits'],
  target: CoachTarget | null,
  _level: number | null,
  gold: number | null,
): TFTNotification | null {
  if (!shop || !target || gold == null) return null
  const unitNames = target.units.map(u => u.toLowerCase())
  const hits = shop.filter(s => {
    const n = s.name.toLowerCase()
    return s.available && !s.owned && unitNames.some(u => n.includes(u) || u.includes(n))
  })
  if (!hits.length) return null
  const best = hits[0]!
  return {
    id: `shop-${best.characterId}-${Date.now()}`, type: 'shop', emoji: '🛒',
    title: gold >= best.cost ? `Al: ${best.name}` : `Hedef: ${best.name}`,
    body: gold >= best.cost
      ? `Compunda gerekli — ${best.cost}g, hemen al!`
      : `${best.cost}g gerekiyor — ${best.cost - gold}g eksik`,
    ttl: 10000, priority: gold >= best.cost ? 'high' : 'normal',
  }
}

const ITEM_RECIPES: Record<string, [string, string]> = {
  'Infinity Edge':        ['B.F. Sword', 'Sparring Gloves'],
  'Spear of Shojin':     ['B.F. Sword', 'Tear of the Goddess'],
  "Rabadon's Deathcap":  ['Needlessly Large Rod', 'Needlessly Large Rod'],
  'Blue Buff':            ['Tear of the Goddess', 'Tear of the Goddess'],
  "Archangel's Staff":   ['Tear of the Goddess', 'Needlessly Large Rod'],
  "Guinsoo's Rageblade": ['Recurve Bow', 'Needlessly Large Rod'],
  "Runaan's Hurricane":  ['Recurve Bow', 'Sparring Gloves'],
  'Rapid Firecannon':    ['Recurve Bow', 'Recurve Bow'],
  'Statikk Shiv':        ['Tear of the Goddess', 'Recurve Bow'],
  'Bramble Vest':        ['Chain Vest', 'Chain Vest'],
  "Dragon's Claw":       ['Negatron Cloak', 'Negatron Cloak'],
  "Warmog's Armor":      ["Giant's Belt", "Giant's Belt"],
  'Sunfire Cape':        ['Chain Vest', "Giant's Belt"],
  'Gargoyle Stoneplate': ['Chain Vest', 'Negatron Cloak'],
  'Bloodthirster':       ['B.F. Sword', "Giant's Belt"],
  'Hextech Gunblade':    ['B.F. Sword', 'Negatron Cloak'],
  'Ionic Spark':         ['Tear of the Goddess', 'Negatron Cloak'],
  'Morellonomicon':      ['Needlessly Large Rod', "Giant's Belt"],
  'Redemption':          ['Tear of the Goddess', "Giant's Belt"],
  'Hand of Justice':     ['Sparring Gloves', 'Tear of the Goddess'],
  'Quicksilver':         ['Sparring Gloves', 'Negatron Cloak'],
  'Jeweled Gauntlet':    ['Needlessly Large Rod', 'Sparring Gloves'],
  "Zeke's Herald":       ['B.F. Sword', 'Recurve Bow'],
  'Crownguard':          ['Chain Vest', 'Needlessly Large Rod'],
  'Edge of Night':       ['B.F. Sword', 'Chain Vest'],
  'Last Whisper':        ['Recurve Bow', "Giant's Belt"],
  "Titan's Resolve":     ['Recurve Bow', 'Chain Vest'],
  'Adaptive Helm':       ['Negatron Cloak', 'Tear of the Goddess'],
  "Locket of the Iron Solari": ['Chain Vest', 'Needlessly Large Rod'],
  "Thief's Gloves":      ['Sparring Gloves', 'Sparring Gloves'],
  "Zz'Rot Portal":       ["Giant's Belt", 'Negatron Cloak'],
  "Sterak's Gage":       ['B.F. Sword', "Giant's Belt"],
  'Shroud of Stillness': ['Chain Vest', 'Sparring Gloves'],
}

function getItemTip(components: string[], target: CoachTarget | null): TFTNotification | null {
  if (!target || components.length < 2) return null
  for (const [itemName, [c1, c2]] of Object.entries(ITEM_RECIPES)) {
    if (!components.includes(c1) || !components.includes(c2)) continue
    for (const [unit, bis] of Object.entries(target.keyItems)) {
      if (bis.some(i => i.toLowerCase().includes(itemName.toLowerCase()))) {
        return {
          id: `item-craft-${itemName}-${Date.now()}`, type: 'item', emoji: '⚗️',
          title: `Birleştir: ${itemName}`,
          body: `${c1} + ${c2} → ${unit}'e yerleştir`,
          ttl: 12000, priority: 'high',
        }
      }
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────
// Main Engine
// ─────────────────────────────────────────────────────────────────

export class TFTGameEngine extends EventEmitter {
  // Connectivity
  private lcuPort: number | null = null
  private lcuPassword: string | null = null
  private riotApiKey = ''
  private riotRegion = 'TR'

  // Poll lifecycle
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private isRunning = false
  private readonly POLL_MS = 2000

  // State tracking
  private lastState: TFTLiveState | null = null
  private seenNotifIds = new Set<string>()
  private coachTarget: CoachTarget | null = null

  // Per-game tracking
  private firstTickDone = false
  private prevPlayerDeaths = new Map<string, number>()

  // Opponent prediction
  private predictor = new OpponentPredictor()
  private lastPrediction: OpponentPrediction | null = null

  // PUUID registry (from lobby session — pre-game)
  private playerPuuids = new Map<string, string>()

  // Local comp detection (from Riot API match history)
  private localPlayerComp: MetaComp | null = null
  private localPlayerPuuid: string | null = null

  // Riot API enrichment cache (5 min TTL)
  private compCache = new Map<string, { ts: number; traits: string[]; placement: number }>()

  // Clipboard monitor for comp detection
  private clipboardMonitor = new ClipboardMonitor()

  // Level/Roll decision tracking (avoid spam)
  private lastLevelRollDecision: { action: string; round: string } | null = null
  private lastDecisionTick = 0
  private readonly DECISION_COOLDOWN_MS = 25000

  // ── Setters ──────────────────────────────────────────────────

  setLCUCredentials(port: number, password: string) {
    this.lcuPort = port
    this.lcuPassword = password
  }

  setRiotApiKey(key: string, region: string) {
    this.riotApiKey = key
    this.riotRegion = region
    console.log(`[TFTGameEngine] API key set, region: ${region} → ${ROUTING[region] ?? 'europe'}`)
  }

  setCoachTarget(target: CoachTarget | null) {
    this.coachTarget = target
  }

  setLobbyParticipants(participants: Array<{ summonerName: string; puuid?: string }>) {
    for (const p of participants) {
      if (p.puuid && p.summonerName) {
        this.playerPuuids.set(p.summonerName.toLowerCase(), p.puuid)
        console.log(`[TFTGameEngine] PUUID cached: ${p.summonerName}`)
      }
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  start() {
    if (this.isRunning) return
    this.isRunning = true
    console.log('[TFTGameEngine] Starting...')
    this.pollTimer = setInterval(() => this.tick(), this.POLL_MS)
    this.tick()

    // Start clipboard monitoring
    this.clipboardMonitor.start((result, rawText) => {
      console.log(`[TFTGameEngine] 📋 Clipboard comp detected: ${result.comp.name}`)
      // Enrich with current component suggestions if we have board state
      const lastState = this.lastState
      if (lastState?.components) {
        result.suggestions = suggestItems(lastState.components, result.comp, rawText)
      }
      const notif = buildCompClipboardNotif(result.comp, result.suggestions)
      this.fireNotifs([notif])
      this.emit('comp-clipboard', result)

      // If no target comp set, use clipboard comp for item suggestions
      if (!this.coachTarget) {
        this.coachTarget = {
          compName: result.comp.name,
          units: result.comp.keyUnits,
          keyItems: {},  // will be populated from itemManifesto
        }
        console.log(`[TFTGameEngine] 🎯 Coach target set from clipboard: ${result.comp.name}`)
      }
    })
  }

  stop() {
    this.isRunning = false
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
    this.clipboardMonitor.stop()
    this.lastState = null
    this.seenNotifIds.clear()
    this.firstTickDone = false
    this.prevPlayerDeaths.clear()
    this.predictor.reset()
    this.lastPrediction = null
    this.localPlayerComp = null
    this.localPlayerPuuid = null
    this.lastLevelRollDecision = null
    this.lastDecisionTick = 0
    console.log('[TFTGameEngine] Stopped.')
    this.emit('stopped')
  }

  getLiveState() { return this.lastState }
  getLastPrediction() { return this.lastPrediction }

  // ── Main poll tick ────────────────────────────────────────────

  private async tick() {
    try {
      const state = await this.buildLiveState()
      if (!state) return
      const prev = this.lastState
      this.lastState = state
      this.emit('state', state)
      await this.generateNotifications(state, prev)
    } catch {
      // Game not active or API unreachable — silent fail
    }
  }

  // ── Build live state ──────────────────────────────────────────

  private async buildLiveState(): Promise<TFTLiveState | null> {
    const [gameStats, allData] = await Promise.all([
      this.fetch2999<any>('/liveclientdata/gamestats').catch(() => null),
      this.fetch2999<any>('/liveclientdata/allgamedata').catch(() => null),
    ])
    if (!gameStats) return null

    const gameTime: number = gameStats.gameTime ?? 0
    const round = estimateRound(gameTime)
    const gameMode: string = gameStats.gameMode ?? 'TFT'

    // Parse players from port 2999
    const rawPlayers: any[] = allData?.allPlayers ?? []
    const players: TFTPlayer[] = rawPlayers
      .map((p: any, i: number) => ({
        summonerName: p.summonerName ?? p.riotIdGameName ?? `Player${i + 1}`,
        position: i + 1,
        kills: p.scores?.kills ?? 0,
        deaths: p.scores?.deaths ?? 0,
        isAlive: !(p.isDead ?? false),
      }))
      .sort((a, b) => a.deaths - b.deaths || b.kills - a.kills)

    players.forEach((p, i) => { p.position = i + 1 })

    const localPlayer: string | null = allData?.activePlayer?.summonerName ?? null

    // ── LCU bonus data ─────────────────────────────────────────
    let gold: number | null = null
    let level: number | null = null
    let xp: number | null = null
    let xpToNextLevel: number | null = null
    let hp: number | null = null
    let streak: number | null = null
    let shopUnits: TFTLiveState['shopUnits'] = null
    let boardUnits: TFTLiveState['boardUnits'] = null
    let components: string[] | null = null
    let activeTraits: string[] | null = null
    let lcuOpponent: string | null = null  // explicit LCU signal (crossed-swords)

    if (this.lcuPort && this.lcuPassword) {
      const [matchData, boardData] = await Promise.all([
        this.fetchLCU<any>('/lol-tft/v1/local_player/tft-match-data').catch(() => null),
        this.fetchLCU<any>('/lol-tft/v1/local_player/tft-board').catch(() => null),
      ])

      if (matchData) {
        gold          = matchData.gold   ?? matchData.localPlayer?.gold   ?? null
        level         = matchData.level  ?? matchData.localPlayer?.level  ?? null
        xp            = matchData.xp     ?? null
        xpToNextLevel = matchData.xpToNextLevel ?? null
        hp            = matchData.hp     ?? matchData.localPlayer?.health ?? null
        streak        = matchData.streak ?? matchData.localPlayer?.streak ?? null

        const rawOpp = matchData.nextOpponent ?? matchData.opponent ??
          matchData.nextRoundOpponent ?? matchData.currentOpponent ??
          matchData.localPlayer?.nextOpponent ?? null
        if (typeof rawOpp === 'string' && rawOpp.trim()) {
          lcuOpponent = rawOpp.trim()
        } else if (rawOpp?.summonerName) {
          lcuOpponent = rawOpp.summonerName
        } else if (rawOpp?.displayName) {
          lcuOpponent = rawOpp.displayName
        }

        if (Array.isArray(matchData.shop)) {
          shopUnits = matchData.shop.map((s: any) => ({
            characterId: s.characterId ?? s.id ?? '',
            name: s.name ?? s.displayName ?? s.characterId ?? 'Unknown',
            cost: s.cost ?? s.price ?? 0,
            owned: s.owned ?? false,
            available: s.available !== false && !s.sold,
          }))
        }
      }

      if (boardData) {
        boardUnits = (boardData.board ?? boardData.pieces ?? []).map((u: any) => ({
          characterId: u.characterId ?? u.id ?? '',
          name: u.name ?? u.displayName ?? 'Unknown',
          tier: u.tier ?? u.starLevel ?? 1,
          items: (u.items ?? []).map((i: any) => typeof i === 'string' ? i : (i.name ?? '')),
          position: { x: u.position?.x ?? 0, y: u.position?.y ?? 0 },
        }))
        const benchItems: string[] = (boardData.bench ?? [])
          .flatMap((u: any) => (u.items ?? []).map((i: any) => typeof i === 'string' ? i : (i.name ?? '')))
        components = benchItems.length > 0 ? benchItems : null
      }
    }

    // ── Extract active traits (2999 as fallback, LCU as primary if available) ──
    if (localPlayer) {
      const activePlayerObj = rawPlayers.find((p: any) =>
        (p.summonerName ?? p.riotIdGameName ?? '').toLowerCase() === localPlayer.toLowerCase()
      )
      if (activePlayerObj?.traits) {
        activeTraits = activePlayerObj.traits
          .filter((t: any) => (t.tier_current ?? 0) > 0)
          .map((t: any) => (t.name ?? '').replace(/^Set\d+_/, '').toLowerCase())
      }
    }

    const aliveOpps = players.filter(p => p.isAlive)
    const prediction = localPlayer
      ? this.predictor.predict(localPlayer, aliveOpps, lcuOpponent, round)
      : null
    if (prediction) this.lastPrediction = prediction

    return {
      gameTime, round, gameMode,
      gold, level, xp, xpToNextLevel, hp, streak,
      localPlayer,
      players,
      nextOpponent: lcuOpponent ?? prediction?.confirmedName ?? null,
      nextOpponentPosition: null,
      boardUnits, shopUnits, components,
      activeTraits,
      opponentPrediction: prediction ?? undefined,
    }
  }

  // ── Notification generation ───────────────────────────────────

  private async generateNotifications(cur: TFTLiveState, prev: TFTLiveState | null) {
    const notifs: TFTNotification[] = []
    const [stage] = cur.round.split('-').map(Number)
    const aliveCount = cur.players.filter(p => p.isAlive).length

    // ── 1. GAME CONNECTED (first tick) ─────────────────────────
    if (!this.firstTickDone) {
      this.firstTickDone = true
      for (const p of cur.players) this.prevPlayerDeaths.set(p.summonerName, p.deaths)

      notifs.push({
        id: 'game-connected',
        type: 'stage', emoji: '🟢',
        title: `Oyun Bağlandı — ${cur.round}`,
        body: `${aliveCount} oyuncu aktif${cur.localPlayer ? ` · ${cur.localPlayer}` : ''}`,
        ttl: 8000, priority: 'high',
      })

      // Kick off local comp detection from live traits
      if (cur.activeTraits && cur.activeTraits.length > 0) {
        this.processLiveCompDetection(cur.activeTraits)
      } else if (cur.localPlayer) {
        // Fallback to match history if board is empty (early game)
        this.detectLocalComp(cur.localPlayer).catch(() => {})
      }

      this.fireNotifs(notifs)
      return
    }

    if (!prev) return
    const roundChanged = cur.round !== prev.round

    // ── 1.5 Real-time Comp Detection Update ───────────────────
    if (cur.activeTraits && cur.activeTraits.length > 0) {
      const traitsChanged = JSON.stringify(cur.activeTraits) !== JSON.stringify(prev.activeTraits)
      if (traitsChanged || roundChanged) {
        this.processLiveCompDetection(cur.activeTraits)
      }
    }

    // ── 2. PLAYER ELIMINATED ───────────────────────────────────
    for (const p of cur.players) {
      const prevD = this.prevPlayerDeaths.get(p.summonerName) ?? 0
      const isLocal = p.summonerName.toLowerCase() === (cur.localPlayer ?? '').toLowerCase()
      if (p.deaths > prevD && !isLocal) {
        this.prevPlayerDeaths.set(p.summonerName, p.deaths)
        notifs.push({
          id: `elim-${p.summonerName}-${p.deaths}`,
          type: 'position', emoji: '💀',
          title: `${p.summonerName} Elendi`,
          body: `${aliveCount} oyuncu kaldı — ${p.kills} eleme yaptı`,
          ttl: 6000,
        })
      }
    }

    // ── 3. ROUND CHANGE ────────────────────────────────────────
    if (roundChanged) {
      for (const p of cur.players) this.prevPlayerDeaths.set(p.summonerName, p.deaths)

      // ── Carousel ─────────────────────────────────────────────
      if (CAROUSEL_ROUNDS.has(cur.round)) {
        const comp = this.localPlayerComp
        notifs.push({
          id: `carousel-${cur.round}`,
          type: 'carousel', emoji: '🎠',
          title: `🎠 Carousel — ${cur.round}`,
          body: comp
            ? `${comp.name} → Al: ${comp.carouselPriority}`
            : 'Eksik item bileşenine ya da en pahalı bileşene odaklan',
          ttl: 15000, priority: 'high',
        })
      }

      // ── Augment ───────────────────────────────────────────────
      if (AUGMENT_ROUNDS.has(cur.round)) {
        const comp = this.localPlayerComp
        const augNum = cur.round === '2-1' ? 1 : cur.round === '3-2' ? 2 : 3
        notifs.push({
          id: `augment-${cur.round}`,
          type: 'augment', emoji: '💎',
          title: `💎 Augment ${augNum} — Seç!`,
          body: comp
            ? `Öncelik: ${comp.augments.slice(0, 2).join(' › ')}`
            : 'Econ, combat, veya utility augment seç',
          ttl: 20000, priority: 'high',
        })
      }

      // ── Opponent prediction ───────────────────────────────────
      const prediction = cur.opponentPrediction
      if (prediction && cur.localPlayer) {
        const top = prediction.candidates.filter(c => !c.isRecent).slice(0, 3)
        const confirmed = prediction.candidates.find(c => c.likelihood === 'confirmed')

        if (confirmed) {
          // LCU confirmed signal — definite
          notifs.push({
            id: `opp-confirmed-${cur.round}`,
            type: 'opponent', emoji: '⚔️',
            title: `⚔️ Sonraki Rakip: ${confirmed.name}`,
            body: `Kesinleşti · ${confirmed.kills} eleme · ${aliveCount} oyuncu kaldı`,
            ttl: 12000, priority: 'high',
            opponentPrediction: prediction,
          })
          // Async enrichment
          this.enrichOpponents([confirmed], cur.round).catch(() => {})
        } else if (prediction.confidence !== 'uncertain' && top.length > 0) {
          // Probabilistic — signal clearly labeled
          const highChance = top.filter(c => c.likelihood === 'high')
          const topNames = top.map(c => `${c.name}(${
            c.likelihood === 'high' ? '↑↑' : c.likelihood === 'medium' ? '↑' : '↓'
          })`).join(', ')
          notifs.push({
            id: `opp-likely-${cur.round}`,
            type: 'opponent', emoji: '🎯',
            title: highChance.length === 1
              ? `🎯 Büyük İhtimal: ${highChance[0]!.name}`
              : `🎯 Olası Rakipler — Tur ${cur.round}`,
            body: `${topNames} · Tahmin (garantili değil)`,
            ttl: 12000,
            opponentPrediction: prediction,
          })
          // Async enrich top candidate
          if (highChance.length > 0) this.enrichOpponents(highChance.slice(0, 1), cur.round).catch(() => {})
        } else {
          // Uncertain — show all alive without false claims
          notifs.push({
            id: `opp-uncertain-${cur.round}`,
            type: 'opponent', emoji: '❓',
            title: `Rakip Belirsiz — Tur ${cur.round}`,
            body: `${aliveCount} oyuncu sağ · Tahmin güvenilir değil`,
            ttl: 8000,
            opponentPrediction: prediction,
          })
        }
      }

      // ── Stage coaching ────────────────────────────────────────
      const [prevStage] = prev.round.split('-').map(Number)
      if (stage !== prevStage) {
        const comp = this.localPlayerComp
        if (stage === 2)
          notifs.push({ id: 'stage-2', type: 'econ', emoji: '💰',
            title: '2. Aşama — Econ', body: comp?.econTip ?? "50g'ye ulaş, faiz al", ttl: 9000 })
        if (stage === 3)
          notifs.push({ id: 'stage-3', type: 'stage', emoji: '⏳',
            title: '3. Aşama', body: comp ? `${comp.name}: ${comp.levelTiming}` : 'Comp planını belirle', ttl: 10000 })
        if (stage === 4)
          notifs.push({ id: 'stage-4', type: 'stage', emoji: '📈',
            title: '4. Aşama — High Roll', body: comp ? `${comp.name}: ${comp.levelTiming}` : "Level 8'e yüksel", ttl: 10000 })
        if (stage === 5)
          notifs.push({ id: 'stage-5', type: 'stage', emoji: '🚀',
            title: '5. Aşama', body: comp ? `${comp.name}: ${comp.levelTiming}` : `${aliveCount} kişi kaldı, 5-cost`, ttl: 10000, priority: 'high' })
      }

      // ── Milestones ────────────────────────────────────────────
      const prevAlive = prev.players.filter(p => p.isAlive).length
      if (aliveCount <= 4 && prevAlive > 4)
        notifs.push({ id: `top4-${cur.round}`, type: 'stage', emoji: '🏆',
          title: 'Top 4!', body: "LP kazanıyorsun — en iyi comp'unu oyna", ttl: 9000 })
      if (aliveCount <= 2 && prevAlive > 2)
        notifs.push({ id: `final2-${cur.round}`, type: 'stage', emoji: '🎯',
          title: 'Final! 1v1', body: 'Son 2 kişi — tüm gücünü kullan!', ttl: 8000, priority: 'high' })

      // ── Positioning tip (once per stage) ─────────────────────
      if (this.localPlayerComp) {
        notifs.push({
          id: `pos-tip-${stage}`,
          type: 'position', emoji: '🧠',
          title: `${this.localPlayerComp.name} — Yerleşim`,
          body: this.localPlayerComp.positioningTip,
          ttl: 10000,
        })
      }

      // ── Standings ─────────────────────────────────────────────
      const topKiller = [...cur.players].filter(p => p.isAlive).sort((a, b) => b.kills - a.kills)[0]
      if (topKiller && topKiller.kills > 0) {
        notifs.push({
          id: `standings-${cur.round}`,
          type: 'position', emoji: '📊',
          title: `Tur ${cur.round} — ${aliveCount} oyuncu`,
          body: `En aktif: ${topKiller.summonerName} (${topKiller.kills} eleme)`,
          ttl: 7000,
        })
      }
    }

    // ── 4. LCU bonus notifications ─────────────────────────────
    if (cur.gold != null && cur.level != null && cur.streak != null) {
      const tip = getEconTip(cur.gold, cur.level, cur.streak, cur.round)
      if (tip) notifs.push(tip)
    }
    if (cur.shopUnits && this.coachTarget) {
      const tip = getShopTip(cur.shopUnits, this.coachTarget, cur.level, cur.gold)
      if (tip) notifs.push(tip)
    }
    if (cur.components && this.coachTarget) {
      const tip = getItemTip(cur.components, this.coachTarget)
      if (tip) notifs.push(tip)
    }
    if (cur.hp != null && cur.hp <= 15) {
      notifs.push({
        id: `hp-danger-${Math.floor(cur.hp)}`,
        type: 'stage', emoji: '🩸',
        title: `HP Kritik: ${cur.hp}`,
        body: "Hata yapma — en güçlü comp'unu oyna",
        ttl: 8000, priority: 'high',
      })
    }

    // ── 5. Level / Roll karar motoru ───────────────────────────
    const now = Date.now()
    if (cur.gold != null && cur.level != null &&
        (now - this.lastDecisionTick) > this.DECISION_COOLDOWN_MS) {
      const lvlComp = this.localPlayerComp
      const decision = decideLevelOrRoll(cur, lvlComp)
      if (decision) {
        const sameAsLast = this.lastLevelRollDecision?.action === decision.action &&
                           this.lastLevelRollDecision?.round === cur.round
        if (!sameAsLast) {
          notifs.push(buildLevelRollNotif(decision, cur.round, cur.gold))
          this.lastLevelRollDecision = { action: decision.action, round: cur.round }
          this.lastDecisionTick = now
        }
      }
    }

    // ── 6. Item suggestions from components + detected comp ─────
    if (cur.components && cur.components.length >= 2) {
      const targetComp = this.localPlayerComp
      if (targetComp) {
        const suggestions = suggestItems(cur.components, targetComp)
        for (const sug of suggestions.slice(0, 1)) { // max 1 per tick
          notifs.push({
            id: `item-sug-${sug.itemName}-${cur.round}`,
            type: 'item', emoji: '⚗️',
            title: `Öğe Önerisi: ${sug.itemName}`,
            body: `${sug.components[0]} + ${sug.components[1]} → ${sug.targetUnit}'e ver`,
            ttl: 14000, priority: 'high',
          })
        }
      }
    }

    this.fireNotifs(notifs)
  }

  private processLiveCompDetection(traits: string[]) {
    const detected = detectComp(traits)
    if (detected && detected.name !== this.localPlayerComp?.name) {
      this.localPlayerComp = detected
      console.log(`[TFTGameEngine] 🎯 Live comp detected: ${detected.name}`)
      this.fireNotifs([{
        id: `comp-detected-live-${detected.id}-${Math.floor(Date.now() / 60000)}`,
        type: 'stage', emoji: '🎯',
        title: `Comp Tespit: ${detected.name}`,
        body: `${detected.traits.join(' · ')} | ${detected.itemManifesto}`,
        ttl: 12000,
        priority: 'high',
      }])
    }
  }

  private fireNotifs(notifs: TFTNotification[]) {
    for (const n of notifs) {
      if (!this.seenNotifIds.has(n.id)) {
        this.seenNotifIds.add(n.id)
        this.emit('notification', n)
        console.log(`[TFTGameEngine] 🔔 ${n.type.toUpperCase()} — ${n.title}`)
      }
    }
    if (this.seenNotifIds.size > 300) {
      const arr = [...this.seenNotifIds]
      arr.splice(0, 150).forEach(id => this.seenNotifIds.delete(id))
    }
  }

  // ── Local comp detection (from last TFT match) ────────────────

  private async detectLocalComp(playerName: string) {
    const puuid = await this.resolvePuuid(playerName)
    if (!puuid) return
    this.localPlayerPuuid = puuid

    const routing = ROUTING[this.riotRegion] ?? 'europe'
    const key = this.riotApiKey
    if (!key) return

    const matchIds = await this.riotGET<string[]>(
      `${routing}.api.riotgames.com`,
      `/tft/match/v1/matches/by-puuid/${puuid}/ids?count=1`,
      key
    ).catch(() => [] as string[])
    if (!matchIds.length) return

    const match = await this.riotGET<any>(
      `${routing}.api.riotgames.com`,
      `/tft/match/v1/matches/${matchIds[0]!}`,
      key
    ).catch(() => null)
    if (!match) return

    const participant = (match?.info?.participants ?? []).find((p: any) => p.puuid === puuid)
    if (!participant) return

    const traitNames: string[] = (participant.traits ?? [])
      .filter((t: any) => (t.tier_current ?? 0) > 0)
      .map((t: any) => (t.name ?? '').replace(/^Set\d+_/, '').toLowerCase())

    const detected = detectComp(traitNames)
    if (detected) {
      this.localPlayerComp = detected
      console.log(`[TFTGameEngine] 🎯 Local comp: ${detected.name}`)
      this.fireNotifs([{
        id: 'comp-detected',
        type: 'stage', emoji: '🎯',
        title: `Comp Tespit: ${detected.name}`,
        body: `${detected.traits.join(' · ')} | ${detected.itemManifesto}`,
        ttl: 12000,
      }])
    }
  }

  // ── Opponent enrichment via Riot API ──────────────────────────

  async fetchOpponentComp(name: string): Promise<{ traits: string[]; placement: number } | null> {
    if (!this.riotApiKey) return null
    const cacheKey = name.toLowerCase()
    const cached = this.compCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < 300_000) return cached

    const puuid = await this.resolvePuuid(name)
    if (!puuid) return null

    const routing = ROUTING[this.riotRegion] ?? 'europe'
    const key = this.riotApiKey

    const matchIds = await this.riotGET<string[]>(
      `${routing}.api.riotgames.com`,
      `/tft/match/v1/matches/by-puuid/${puuid}/ids?count=5`,
      key
    ).catch(() => [] as string[])
    if (!matchIds.length) return null

    const match = await this.riotGET<any>(
      `${routing}.api.riotgames.com`,
      `/tft/match/v1/matches/${matchIds[0]!}`,
      key
    ).catch(() => null)
    if (!match) return null

    const participant = (match?.info?.participants ?? []).find((p: any) => p.puuid === puuid)
    if (!participant) return null

    const traits: string[] = (participant.traits ?? [])
      .filter((t: any) => (t.tier_current ?? 0) > 0 && t.num_units > 0)
      .sort((a: any, b: any) => b.num_units - a.num_units)
      .slice(0, 3)
      .map((t: any) => (t.name ?? '').replace(/^Set\d+_/, '').replace(/_/g, ' '))

    const placement: number = participant.placement ?? 0
    const result = { traits, placement, ts: Date.now() }
    this.compCache.set(cacheKey, result)
    return result
  }

  private async enrichOpponents(opponents: PossibleOpponent[], round: string) {
    for (const opp of opponents) {
      const comp = await this.fetchOpponentComp(opp.name).catch(() => null)
      if (!comp) continue
      const { emoji, label } = assessThreat(comp.placement)

      // Scout notification with rich data
      this.fireNotifs([{
        id: `scout-${opp.name}-${round}`,
        type: 'opponent', emoji,
        title: `${opp.name} — ${label}`,
        body: [
          comp.traits.length ? comp.traits.join(' · ') : 'Trait verisi yok',
          `Son maç: ${comp.placement}. sıra`,
        ].join(' | '),
        ttl: 12000,
      }])

      // Counter advice notification
      if (comp.traits.length > 0) {
        const counterNotif = buildCounterNotif(opp.name, comp.traits, comp.placement, round)
        if (counterNotif) this.fireNotifs([counterNotif])
      }
    }
  }

  // ── PUUID resolution ──────────────────────────────────────────

  private async resolvePuuid(name: string): Promise<string | null> {
    const cached = this.playerPuuids.get(name.toLowerCase())
    if (cached) return cached

    if (!this.riotApiKey) return null
    const routing = ROUTING[this.riotRegion] ?? 'europe'
    const platform = PLATFORM[this.riotRegion] ?? PLATFORM['EUW']!
    const key = this.riotApiKey

    try {
      const parts = name.split('#')
      if (parts.length === 2 && parts[1]) {
        const acc = await this.riotGET<any>(
          `${routing}.api.riotgames.com`,
          `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(parts[0]!)}/${encodeURIComponent(parts[1]!)}`,
          key
        )
        if (acc?.puuid) { this.playerPuuids.set(name.toLowerCase(), acc.puuid); return acc.puuid }
      } else {
        // No tagline — summoner v4 (works on most regions, TR included)
        const s = await this.riotGET<any>(
          platform,
          `/lol/summoner/v4/summoners/by-name/${encodeURIComponent(name)}`,
          key
        )
        if (s?.puuid) {
          this.playerPuuids.set(name.toLowerCase(), s.puuid)
          console.log(`[TFTGameEngine] summonerV4 PUUID: ${name}`)
          return s.puuid
        }
      }
    } catch { }
    return null
  }

  // ── HTTP helpers ──────────────────────────────────────────────

  private fetch2999<T>(path: string): Promise<T> {
    return this.fetchJSON(`https://127.0.0.1:2999${path}`, null, null)
  }

  private fetchLCU<T>(path: string): Promise<T> {
    if (!this.lcuPort || !this.lcuPassword) return Promise.reject(new Error('No LCU creds'))
    return this.fetchJSON(`https://127.0.0.1:${this.lcuPort}${path}`, 'riot', this.lcuPassword)
  }

  private fetchJSON<T>(url: string, user: string | null, pass: string | null): Promise<T> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (user && pass) headers['Authorization'] = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
      const req = https.get(url, { rejectUnauthorized: false, headers, timeout: 2000 }, res => {
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
        let d = ''
        res.on('data', c => d += c)
        res.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    })
  }

  private riotGET<T>(host: string, path: string, key: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        { hostname: host, path, headers: { 'X-Riot-Token': key }, rejectUnauthorized: false },
        res => {
          let d = ''
          res.on('data', c => d += c)
          res.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
        }
      )
      req.on('error', reject)
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')) })
    })
  }
}
