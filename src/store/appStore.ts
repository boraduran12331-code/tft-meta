import { create } from 'zustand'
import type { SetChampionIndex, ItemData } from '../services/CommunityDragonService'
import type { ScoutedPlayer } from '../services/RiotAPIAdapter'

export type GamePhase =
  | 'None'
  | 'Lobby'
  | 'Matchmaking'
  | 'ReadyCheck'
  | 'ChampSelect'
  | 'InProgress'
  | 'WaitingForStats'
  | 'EndOfGame'

export type GameMode = 'Ranked' | 'Choncc' | 'HyperRoll'
export type CompFilter = 'META' | 'PRO'
export type PlannerCompatibility = 'FULL_VALID' | 'PARTIAL' | 'INVALID' | 'UNCHECKED' | 'UNSUPPORTED_SET'
export type OverlayTab = 'comps' | 'rivals' | 'debug'

// TFT board slot (0-27, row-major on a 4-row x 7-col staggered hex grid)
export type PlacementMap = Record<number, UnitData>

export interface CompData {
  id: string
  name: string
  tier: 'S' | 'A' | 'B' | 'C'
  avgPlace: number
  playRate: number
  units: UnitData[]
  traits: string[]
  gameMode?: GameMode
  setKey?: string
  // Pro Comps extras
  author?: string
  notes?: string
  placementMap?: PlacementMap
}

export interface ItemRef {
  name: string
  iconUrl?: string
}

export interface UnitData {
  name: string
  cost: number
  characterId?: string   // CDragon character_id, e.g. "TFT16_Ahri"
  iconUrl?: string       // Resolved CDragon icon URL
  imageUrl?: string      // Legacy alias
  items?: (ItemRef | string)[]
}

// ── Augment stats ──────────────────────────────────────────────────
export interface AugmentStat {
  name: string
  apiName?: string
  iconUrl?: string
  avgPlace: number
  pickRate: number
  tier: 'S' | 'A' | 'B' | 'C'
}

interface AppState {
  // ── Connection ──────────────────────────────────────────────────
  lcuConnected: boolean
  leagueRunning: boolean
  gamePhase: GamePhase

  // ── Overlay ─────────────────────────────────────────────────────
  overlayInteractive: boolean
  overlayOpacity: number
  activeTab: OverlayTab
  overlayCompact: boolean

  // ── Meta data ───────────────────────────────────────────────────
  comps: CompData[]
  proComps: CompData[]
  compsProvenance: string
  compsSourceState: 'LIVE' | 'CACHED' | 'FALLBACK' | 'LOADING' | 'UNKNOWN'
  targetCompId: string | null
  selectedCompId: string | null
  activeCompFilter: CompFilter
  lastMetaRefreshAt: number | null
  plannerCompatibility: PlannerCompatibility

  // ── CDragon & Analyzer ──────────────────────────────────────────
  cdSetIndices: Map<string, SetChampionIndex>
  cdItems: Map<string, ItemData>
  activeSetKey: string
  availableSets: string[]
  cdLoading: boolean
  ownedComponents: string[]
  searchQuery: string

  // ── Rival / Scouting ────────────────────────────────────────────
  scoutedPlayers: ScoutedPlayer[]
  nextOpponent: { summonerName: string; position: number } | null
  riotApiKey: string
  riotRegion: string
  scoutingActive: boolean

  // ── Debug ───────────────────────────────────────────────────────
  debugMode: boolean
  lastError: string | null

  // ── Toast ───────────────────────────────────────────────────────
  toastMessage: string | null
  toastType: 'success' | 'warning' | 'error' | 'info'
  selectedGameMode: GameMode

  // ── Actions ─────────────────────────────────────────────────────
  setLcuConnected: (v: boolean) => void
  setLeagueRunning: (v: boolean) => void
  setGamePhase: (v: GamePhase) => void
  setOverlayInteractive: (v: boolean) => void
  setOverlayOpacity: (v: number) => void
  setActiveTab: (tab: OverlayTab) => void
  setOverlayCompact: (v: boolean) => void

  setComps: (comps: CompData[], provenance: string) => void
  setProComps: (comps: CompData[]) => void
  setTargetCompId: (id: string | null) => void
  setSelectedCompId: (id: string | null) => void
  setCompsSourceState: (s: AppState['compsSourceState']) => void
  setPlannerCompatibility: (v: PlannerCompatibility) => void
  setLastMetaRefreshAt: (ts: number) => void

  setCdSetIndices: (indices: Map<string, SetChampionIndex>) => void
  setCdItems: (items: Map<string, ItemData>) => void
  setActiveSetKey: (setKey: string) => void
  setAvailableSets: (sets: string[]) => void
  setCdLoading: (v: boolean) => void
  setOwnedComponents: (items: string[]) => void
  setSearchQuery: (q: string) => void
  setSelectedGameMode: (m: GameMode) => void
  setActiveCompFilter: (f: CompFilter) => void

  setScoutedPlayers: (players: ScoutedPlayer[]) => void
  updateScoutedPlayer: (name: string, data: Partial<ScoutedPlayer>) => void
  setNextOpponent: (opp: AppState['nextOpponent']) => void
  setRiotApiKey: (key: string) => void
  setRiotRegion: (region: string) => void
  setScoutingActive: (v: boolean) => void

  setDebugMode: (v: boolean) => void
  setLastError: (e: string | null) => void

  showToast: (message: string, type?: AppState['toastType']) => void
  clearToast: () => void
}

export const useAppStore = create<AppState>((set) => ({
  // ── Initial state ──────────────────────────────────────────────
  lcuConnected: false,
  leagueRunning: false,
  gamePhase: 'None',
  overlayInteractive: false,
  overlayOpacity: 0.92,
  activeTab: 'comps',
  overlayCompact: false,

  comps: [],
  proComps: [],
  compsProvenance: 'UNKNOWN',
  compsSourceState: 'UNKNOWN',
  targetCompId: null,
  selectedCompId: null,
  activeCompFilter: 'META',
  lastMetaRefreshAt: null,
  plannerCompatibility: 'UNCHECKED',

  cdSetIndices: new Map(),
  cdItems: new Map(),
  activeSetKey: 'TFTSet16',
  availableSets: ['TFTSet16'],
  cdLoading: false,
  ownedComponents: [],
  searchQuery: '',

  scoutedPlayers: [],
  nextOpponent: null,
  riotApiKey: '',
  riotRegion: 'EUW',
  scoutingActive: false,

  debugMode: false,
  lastError: null,

  toastMessage: null,
  toastType: 'info',
  selectedGameMode: 'Ranked',

  // ── Actions ────────────────────────────────────────────────────
  setLcuConnected: (v) => set({ lcuConnected: v }),
  setLeagueRunning: (v) => set({ leagueRunning: v }),
  setGamePhase: (v) => set({ gamePhase: v }),
  setOverlayInteractive: (v) => set({ overlayInteractive: v }),
  setOverlayOpacity: (v) => set({ overlayOpacity: v }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setOverlayCompact: (v) => set({ overlayCompact: v }),

  setComps: (comps, provenance) => set({ comps, compsProvenance: provenance }),
  setProComps: (comps) => set({ proComps: comps }),
  setTargetCompId: (id) => set({ targetCompId: id }),
  setSelectedCompId: (id) => set({ selectedCompId: id }),
  setCompsSourceState: (s) => set({ compsSourceState: s }),
  setPlannerCompatibility: (v) => set({ plannerCompatibility: v }),
  setLastMetaRefreshAt: (ts) => set({ lastMetaRefreshAt: ts }),

  setCdSetIndices: (cdSetIndices) => set({ cdSetIndices }),
  setCdItems: (cdItems) => set({ cdItems }),
  setActiveSetKey: (activeSetKey) => set({ activeSetKey }),
  setAvailableSets: (availableSets) => set({ availableSets }),
  setCdLoading: (v) => set({ cdLoading: v }),
  setOwnedComponents: (items) => set({ ownedComponents: items }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSelectedGameMode: (m) => set({ selectedGameMode: m }),
  setActiveCompFilter: (f) => set({ activeCompFilter: f }),

  setScoutedPlayers: (players) => set({ scoutedPlayers: players }),
  updateScoutedPlayer: (name, data) => set((state) => ({
    scoutedPlayers: state.scoutedPlayers.map(p =>
      p.summonerName.toLowerCase() === name.toLowerCase() ? { ...p, ...data } : p
    )
  })),
  setNextOpponent: (opp) => set({ nextOpponent: opp }),
  setRiotApiKey: (key) => set({ riotApiKey: key }),
  setRiotRegion: (region) => set({ riotRegion: region }),
  setScoutingActive: (v) => set({ scoutingActive: v }),

  setDebugMode: (v) => set({ debugMode: v }),
  setLastError: (e) => set({ lastError: e }),

  showToast: (message, type = 'info') => set({ toastMessage: message, toastType: type }),
  clearToast: () => set({ toastMessage: null }),
}))
