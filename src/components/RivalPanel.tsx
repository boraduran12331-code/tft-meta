// src/components/RivalPanel.tsx
// Opponent scouting panel — rank, avg placement, top4 rate, favorite traits
// Data comes from Riot API match history (reference-only, no live board state)

import { useEffect, useCallback, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { scoutPlayer, formatTier, clearScoutCache, type ScoutedPlayer } from '../services/RiotAPIAdapter'

// ── Tier rank icon (text-based, works without assets) ──────────────
function TierBadge({ tier, rank }: { tier?: string; rank?: string }) {
  if (!tier) return <span style={styles.unranked}>Unranked</span>
  const t = tier.toUpperCase()
  const colorMap: Record<string, string> = {
    IRON: '#7b7b7b', BRONZE: '#ad5e2e', SILVER: '#8b9bb4', GOLD: '#f5a623',
    PLATINUM: '#00c4b0', EMERALD: '#2de068', DIAMOND: '#4da6ff',
    MASTER: '#a855f7', GRANDMASTER: '#ef4444', CHALLENGER: '#f5c842'
  }
  const color = colorMap[t] ?? '#9fa3b0'
  return (
    <span style={{ ...styles.tierBadge, color, borderColor: `${color}40` }}>
      {t.slice(0, 1)}{rank ?? ''}
    </span>
  )
}

// ── Threat level badge ─────────────────────────────────────────────
function ThreatBadge({ level }: { level?: 'S' | 'A' | 'B' | 'C' }) {
  if (!level) return null
  const config = {
    S: { bg: 'rgba(239,68,68,0.18)', color: '#f87171', label: '⚠ S' },
    A: { bg: 'rgba(245,166,35,0.18)', color: '#f5c842', label: 'A' },
    B: { bg: 'rgba(77,166,255,0.14)', color: '#74b8ff', label: 'B' },
    C: { bg: 'rgba(120,120,140,0.12)', color: '#9fa3b0', label: 'C' },
  }[level]
  return (
    <span style={{ ...styles.threatBadge, background: config.bg, color: config.color }}>
      {config.label}
    </span>
  )
}

// ── Mini placement dots ────────────────────────────────────────────
function PlacementDots({ placements }: { placements: number[] }) {
  const recent = placements.slice(0, 8)
  return (
    <div style={styles.placementDots}>
      {recent.map((p, i) => {
        const color = p <= 4 ? (p === 1 ? '#f5c842' : '#34d399') : '#ef4444'
        return (
          <span key={i} title={`#${p}`} style={{ ...styles.dot, background: color, opacity: p <= 4 ? 1 : 0.6 }}>
            {p}
          </span>
        )
      })}
    </div>
  )
}

// ── Single player row ──────────────────────────────────────────────
function PlayerRow({
  player,
  isNextOpponent,
  onRefresh,
}: {
  player: ScoutedPlayer
  isNextOpponent: boolean
  onRefresh: (name: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        ...styles.playerRow,
        background: isNextOpponent ? 'rgba(232,168,56,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isNextOpponent ? 'rgba(232,168,56,0.35)' : 'rgba(255,255,255,0.07)'}`,
      }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Row main line */}
      <div style={styles.playerRowMain}>
        {/* Left: opponent indicator + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          {isNextOpponent && (
            <span style={styles.nextOpponentIcon} title="Sonraki rakibiniz">⚔️</span>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={styles.playerName}>{player.summonerName}</div>
            {player.loading && (
              <div style={styles.loadingText}>inceleniyor…</div>
            )}
            {player.error && (
              <div style={styles.errorText}>{player.error}</div>
            )}
          </div>
        </div>

        {/* Right: tier + stats */}
        {!player.loading && !player.error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <TierBadge tier={player.tier} rank={player.rank} />
            {player.avgPlacement !== undefined && (
              <span style={styles.statChip}>ø {player.avgPlacement}</span>
            )}
            {player.top4Rate !== undefined && (
              <span style={{ ...styles.statChip, color: player.top4Rate >= 55 ? '#34d399' : '#9fa3b0' }}>
                TOP4 {player.top4Rate}%
              </span>
            )}
            <ThreatBadge level={player.threatLevel} />
          </div>
        )}

        {/* Refresh button */}
        {!player.loading && (
          <button
            style={styles.refreshBtn}
            onClick={(e) => { e.stopPropagation(); onRefresh(player.summonerName) }}
            title="Yenile"
          >
            ↻
          </button>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && !player.loading && !player.error && (
        <div style={styles.playerDetail}>
          {player.favoriteTraits && player.favoriteTraits.length > 0 && (
            <div style={styles.traitRow}>
              <span style={styles.detailLabel}>Favori Comp:</span>
              {player.favoriteTraits.map(trait => (
                <span key={trait} style={styles.traitTag}>{trait}</span>
              ))}
            </div>
          )}
          {player.recentPlacements && player.recentPlacements.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={styles.detailLabel}>Son {player.recentPlacements.length} maç:</span>
              <PlacementDots placements={player.recentPlacements} />
            </div>
          )}
          {player.winRate !== undefined && (
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Win Rate:</span>
              <span style={{ color: player.winRate >= 55 ? '#34d399' : '#9fa3b0' }}>{player.winRate}%</span>
            </div>
          )}
          {player.gamesAnalyzed !== undefined && (
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>İncelenen:</span>
              <span style={{ color: '#63666f' }}>{player.gamesAnalyzed} maç</span>
            </div>
          )}
          {formatTier(player.tier, player.rank, player.lp) !== 'Unranked' && (
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Rank:</span>
              <span>{formatTier(player.tier, player.rank, player.lp)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main RivalPanel ────────────────────────────────────────────────
export function RivalPanel() {
  const {
    scoutedPlayers,
    nextOpponent,
    riotApiKey,
    riotRegion,
    scoutingActive,
    setScoutedPlayers,
    updateScoutedPlayer,
    setScoutingActive,
  } = useAppStore()

  const [manualInput, setManualInput] = useState('')
  const [noApiKey, setNoApiKey] = useState(false)

  // Load Riot API key from Electron on mount
  useEffect(() => {
    window.electronAPI?.riotApi?.getKey().then((key: string) => {
      if (!key) setNoApiKey(true)
      else {
        useAppStore.getState().setRiotApiKey(key)
        setNoApiKey(false)
      }
    }).catch(() => setNoApiKey(true))

    window.electronAPI?.riotApi?.getRegion().then((region: string) => {
      useAppStore.getState().setRiotRegion(region)
    }).catch(() => {})
  }, [])

  // Listen for lobby participants from LCU → auto-scout
  useEffect(() => {
    if (!window.electronAPI?.lcu?.onLobbyParticipants) return
    const off = window.electronAPI.lcu.onLobbyParticipants((names: string[]) => {
      if (!names.length) return
      const apiKey = useAppStore.getState().riotApiKey
      if (!apiKey) return
      startScouting(names, apiKey)
    })
    return off
  }, [])

  const startScouting = useCallback(async (names: string[], apiKey: string) => {
    const region = useAppStore.getState().riotRegion
    setScoutingActive(true)

    // Initialize all as loading
    const initial: ScoutedPlayer[] = names.map(n => ({ summonerName: n, loading: true }))
    setScoutedPlayers(initial)

    // Scout each player and update progressively
    const promises = names.map(async (name) => {
      try {
        const result = await scoutPlayer(name, apiKey, region)
        updateScoutedPlayer(name, result)
      } catch (e) {
        updateScoutedPlayer(name, { loading: false, error: 'Scout failed' })
      }
    })

    await Promise.all(promises)
    setScoutingActive(false)
  }, [setScoutedPlayers, updateScoutedPlayer, setScoutingActive])

  const handleManualScout = async () => {
    const names = manualInput.split(/[\n,]+/).map(n => n.trim()).filter(Boolean)
    if (!names.length) return
    const apiKey = useAppStore.getState().riotApiKey
    if (!apiKey) { setNoApiKey(true); return }
    setManualInput('')
    await startScouting(names, apiKey)
  }

  const handleRefresh = async (name: string) => {
    clearScoutCache()
    const apiKey = useAppStore.getState().riotApiKey
    if (!apiKey) return
    const region = useAppStore.getState().riotRegion
    updateScoutedPlayer(name, { loading: true, error: undefined })
    const result = await scoutPlayer(name, apiKey, region)
    updateScoutedPlayer(name, result)
  }

  const handleClearAll = () => {
    setScoutedPlayers([])
    clearScoutCache()
  }

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>👁 Rakip Analizi</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {scoutingActive && <span style={styles.scanningBadge}>taranıyor…</span>}
          {scoutedPlayers.length > 0 && (
            <button style={styles.clearBtn} onClick={handleClearAll} title="Temizle">✕</button>
          )}
        </div>
      </div>

      {/* No API key warning */}
      {noApiKey && (
        <div style={styles.warningBox}>
          ⚠ Riot API key bulunamadı. Ayarlar &gt; Riot API Key bölümünden girin.
        </div>
      )}

      {/* Next opponent highlight */}
      {nextOpponent && (
        <div style={styles.nextOpponentBanner}>
          <span style={styles.nextOpponentEmoji}>⚔️</span>
          <div>
            <div style={styles.nextOpponentLabel}>Sonraki Rakibiniz</div>
            <div style={styles.nextOpponentName}>{nextOpponent.summonerName}</div>
            <div style={styles.nextOpponentPos}>#{nextOpponent.position}. sıra</div>
          </div>
          {scoutedPlayers.find(p =>
            p.summonerName.toLowerCase() === nextOpponent.summonerName.toLowerCase()
          ) && (() => {
            const p = scoutedPlayers.find(pp =>
              pp.summonerName.toLowerCase() === nextOpponent.summonerName.toLowerCase()
            )!
            return (
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <TierBadge tier={p.tier} rank={p.rank} />
                {p.avgPlacement !== undefined && (
                  <div style={{ fontSize: 10, color: '#9fa3b0', marginTop: 2 }}>ø {p.avgPlacement} place</div>
                )}
                <ThreatBadge level={p.threatLevel} />
              </div>
            )
          })()}
        </div>
      )}

      {/* Player list */}
      <div style={styles.playerList}>
        {scoutedPlayers.length === 0 && !scoutingActive && (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
            <div style={{ color: '#9fa3b0', fontSize: 12, textAlign: 'center' }}>
              Lobby'e girildiğinde rakipler otomatik taranır.
              <br />Ya da aşağıya summoner adı girin.
            </div>
          </div>
        )}
        {scoutedPlayers.map(player => (
          <PlayerRow
            key={player.summonerName}
            player={player}
            isNextOpponent={nextOpponent?.summonerName.toLowerCase() === player.summonerName.toLowerCase()}
            onRefresh={handleRefresh}
          />
        ))}
      </div>

      {/* Manual scout input */}
      <div style={styles.manualInput}>
        <textarea
          style={styles.textarea}
          placeholder="Summoner adları (virgülle veya satır satır)..."
          value={manualInput}
          onChange={e => setManualInput(e.target.value)}
          rows={2}
        />
        <button
          style={styles.scoutBtn}
          onClick={handleManualScout}
          disabled={!manualInput.trim()}
        >
          Tara
        </button>
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px 6px',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(255,255,255,0.02)',
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: '#9fa3b0',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  scanningBadge: {
    fontSize: 10,
    color: '#4da6ff',
    background: 'rgba(77,166,255,0.12)',
    border: '1px solid rgba(77,166,255,0.25)',
    borderRadius: 20,
    padding: '2px 8px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  clearBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#9fa3b0',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
    padding: '2px 6px',
    lineHeight: 1,
  },
  warningBox: {
    margin: 8,
    padding: '8px 10px',
    background: 'rgba(245,166,35,0.1)',
    border: '1px solid rgba(245,166,35,0.25)',
    borderRadius: 6,
    fontSize: 11,
    color: '#f5c842',
    lineHeight: 1.5,
  },
  nextOpponentBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '8px 8px 4px',
    padding: '10px 12px',
    background: 'rgba(232,168,56,0.08)',
    border: '1px solid rgba(232,168,56,0.3)',
    borderRadius: 8,
    cursor: 'default',
  },
  nextOpponentEmoji: { fontSize: 22, flexShrink: 0 },
  nextOpponentLabel: { fontSize: 9, color: '#e8a838', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 },
  nextOpponentName: { fontSize: 14, fontWeight: 600, color: '#f0f0f4' },
  nextOpponentPos: { fontSize: 10, color: '#9fa3b0' },
  playerList: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  playerRow: {
    borderRadius: 7,
    padding: '7px 10px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  playerRowMain: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  nextOpponentIcon: { fontSize: 12, flexShrink: 0 },
  playerName: {
    fontSize: 12,
    fontWeight: 500,
    color: '#f0f0f4',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 100,
  },
  loadingText: { fontSize: 10, color: '#4da6ff' },
  errorText: { fontSize: 10, color: '#ef4444' },
  tierBadge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid',
    whiteSpace: 'nowrap',
  },
  unranked: { fontSize: 10, color: '#63666f' },
  statChip: {
    fontSize: 10,
    color: '#9fa3b0',
    background: 'rgba(255,255,255,0.06)',
    padding: '2px 5px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
  },
  threatBadge: {
    fontSize: 9,
    fontWeight: 700,
    padding: '2px 5px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
  },
  refreshBtn: {
    background: 'transparent',
    border: 'none',
    color: '#63666f',
    cursor: 'pointer',
    fontSize: 13,
    padding: '0 2px',
    flexShrink: 0,
    lineHeight: 1,
  },
  playerDetail: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  detailRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: '#f0f0f4',
  },
  detailLabel: {
    fontSize: 10,
    color: '#63666f',
    minWidth: 70,
  },
  traitRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    fontSize: 11,
  },
  traitTag: {
    fontSize: 10,
    color: '#7c5cfc',
    background: 'rgba(124,92,252,0.12)',
    border: '1px solid rgba(124,92,252,0.25)',
    padding: '2px 6px',
    borderRadius: 20,
  },
  placementDots: {
    display: 'flex',
    gap: 3,
    flexWrap: 'wrap',
  },
  dot: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 700,
    color: '#000',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
    flex: 1,
  },
  manualInput: {
    display: 'flex',
    gap: 6,
    padding: '8px',
    borderTop: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(0,0,0,0.2)',
  },
  textarea: {
    flex: 1,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#f0f0f4',
    fontSize: 11,
    padding: '6px 8px',
    resize: 'none',
    outline: 'none',
    fontFamily: 'inherit',
  },
  scoutBtn: {
    background: 'rgba(124,92,252,0.8)',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    padding: '0 12px',
    flexShrink: 0,
  },
}
