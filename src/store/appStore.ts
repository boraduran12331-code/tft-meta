import { create } from 'zustand'
import type { SetChampionIndex, ItemData } from '../services/CommunityDragonService'

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

interface AppState {
  // Connection
  lcuConnected: boolean
  leagueRunning: boolean
  gamePhase: GamePhase

  // Overlay
  overlayInteractive: boolean
  overlayOpacity: number

  // Meta data
  comps: CompData[]
  proComps: CompData[]
  compsProvenance: string
  targetCompId: string | null
  activeCompFilter: CompFilter

  // CDragon & Analyzer
  cdSetIndices: Map<string, SetChampionIndex>
  cdItems: Map<string, ItemData>
  activeSetKey: string
  cdLoading: boolean
  ownedComponents: string[]
  searchQuery: string

  // Toast
  toastMessage: string | null
  selectedGameMode: GameMode

  // Actions
  setLcuConnected: (connected: boolean) => void
  setLeagueRunning: (running: boolean) => void
  setGamePhase: (phase: GamePhase) => void
  setOverlayInteractive: (interactive: boolean) => void
  setOverlayOpacity: (opacity: number) => void
  setComps: (comps: CompData[], provenance: string) => void
  setProComps: (comps: CompData[]) => void
  setTargetCompId: (id: string | null) => void
  setCdSetIndices: (indices: Map<string, SetChampionIndex>) => void
  setCdItems: (items: Map<string, ItemData>) => void
  setActiveSetKey: (setKey: string) => void
  setCdLoading: (loading: boolean) => void
  setOwnedComponents: (items: string[]) => void
  setSearchQuery: (query: string) => void
  setSelectedGameMode: (mode: GameMode) => void
  setActiveCompFilter: (filter: CompFilter) => void
  showToast: (message: string) => void
  clearToast: () => void
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  lcuConnected: false,
  leagueRunning: false,
  gamePhase: 'None',
  overlayInteractive: false,
  overlayOpacity: 0.92,
  comps: [],
  proComps: [],
  compsProvenance: 'UNKNOWN',
  targetCompId: null,
  activeCompFilter: 'META',
  cdSetIndices: new Map(),
  cdItems: new Map(),
  activeSetKey: 'TFTSet16',
  cdLoading: false,
  ownedComponents: [],
  searchQuery: '',
  toastMessage: null,
  selectedGameMode: 'Ranked',

  // Actions
  setLcuConnected: (connected) => set({ lcuConnected: connected }),
  setLeagueRunning: (running) => set({ leagueRunning: running }),
  setGamePhase: (phase) => set({ gamePhase: phase as GamePhase }),
  setOverlayInteractive: (interactive) => set({ overlayInteractive: interactive }),
  setOverlayOpacity: (opacity) => set({ overlayOpacity: opacity }),
  setComps: (comps, provenance) => set({ comps, compsProvenance: provenance }),
  setProComps: (proComps) => set({ proComps }),
  setTargetCompId: (id) => set({ targetCompId: id }),
  setCdSetIndices: (cdSetIndices) => set({ cdSetIndices }),
  setCdItems: (cdItems) => set({ cdItems }),
  setActiveSetKey: (activeSetKey) => set({ activeSetKey }),
  setCdLoading: (loading) => set({ cdLoading: loading }),
  setOwnedComponents: (items) => set({ ownedComponents: items }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedGameMode: (mode) => set({ selectedGameMode: mode }),
  setActiveCompFilter: (filter) => set({ activeCompFilter: filter }),
  showToast: (message) => set({ toastMessage: message }),
  clearToast: () => set({ toastMessage: null }),
}))
