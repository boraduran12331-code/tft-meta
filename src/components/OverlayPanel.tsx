import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore, type CompData } from '../store/appStore'
import { fetchSetIndex, getChampionIconUrl, fetchItemsData, getItemIconUrl, normalizeName, fetchTFTItems } from '../services/CommunityDragonService'
import { generateTeamCode } from '../services/TeamCodeEncoder'
import { suggestItems, BASE_COMPONENTS } from '../services/ItemLogicAnalyzer'
import { BoardPlacementMap } from './BoardPlacementMap'
import { BoardMap } from './BoardMap'
import { ItemSuggestionEngine } from '../services/ItemSuggestionEngine'
import { getStageAdvice, estimateRoundFromTime } from '../services/StageCoach'
import { RivalPanel } from './RivalPanel'
import { SET16_COMPS } from '../services/TFTMetaFrontend'
import '../styles/overlay.css'

import { ingestMetaComps, ingestProComps } from '../services/MetaTFTService'
import { FALLBACK_COMPS } from '../services/FallbackComps'

// ── Tab bar ───────────────────────────────────────────────────────
const TABS = [
  { id: 'comps', label: '📊 Comps' },
  { id: 'rivals', label: '👁 Rakip' },
  { id: 'debug', label: '🐛 Debug' },
] as const

export function OverlayPanel() {
  const {
    lcuConnected,
    gamePhase,
    overlayInteractive,
    comps,
    proComps,
    compsProvenance,
    compsSourceState,
    cdSetIndices,
    cdItems,
    activeSetKey,
    cdLoading,
    toastMessage,
    toastType,
    targetCompId,
    ownedComponents,
    selectedGameMode,
    searchQuery,
    activeCompFilter,
    activeTab,
    overlayCompact,
    debugMode,
    nextOpponent,
    scoutedPlayers,
    setComps,
    setProComps,
    setCdSetIndices,
    setCdItems,
    setCdLoading,
    setTargetCompId,
    setOwnedComponents,
    setSelectedGameMode,
    setSearchQuery,
    setActiveCompFilter,
    setActiveTab,
    setOverlayCompact,
    setNextOpponent,
    showToast,
    clearToast,
  } = useAppStore()

  // Unified notification push
  const pushNotif = (emoji: string, title: string, body: string, type = 'stage', ttl = 6000) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`
    if (window.electronAPI?.notif?.push) {
      window.electronAPI.notif.push({ id, type, emoji, title, body, ttl })
    } else {
      showToast(`${emoji} ${title} — ${body}`, 'info')
    }
  }

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [selectedCompId, setSelectedCompIdLocal] = useState<string | null>(null)
  const [itemEngine, setItemEngine] = useState<ItemSuggestionEngine | null>(null)
  const [tftItemIconMap, setTftItemIconMap] = useState<Map<string, string>>(new Map())
  const [gameRound, setGameRound] = useState<string>('1-1')
  const [gameGold, setGameGold] = useState<number>(0)
  const [gameLevel, setGameLevel] = useState<number>(1)
  const [gameHp, setGameHp] = useState<number>(100)
  const shownAdviceIds = useRef<Set<string>>(new Set())
  const [tftPlayers, setTftPlayers] = useState<Array<{summonerName: string; position: number; kills: number; deaths: number}>>([])
  const panelRef = useRef<HTMLDivElement>(null)

  const handleClose = useCallback(() => {
    if (window.electronAPI?.overlay?.hide) window.electronAPI.overlay.hide()
  }, [])

  // ── Load CDragon + MetaTFT comps on mount ─────────────────────
  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setComps(FALLBACK_COMPS, 'FALLBACK')
      setCdLoading(true)
      try {
        const [setIndex, itemsMap] = await Promise.all([
          fetchSetIndex(activeSetKey),
          fetchItemsData()
        ])
        if (cancelled) return

        const newIndices = new Map<string, typeof setIndex>()
        newIndices.set(activeSetKey, setIndex)
        setCdSetIndices(newIndices as any)

        const itemsDict = new Map()
        itemsMap.forEach(item => {
          if (!item?.nameId) return
          if (item.name) itemsDict.set(item.name.toLowerCase(), item)
          itemsDict.set(item.nameId.toLowerCase(), item)
          itemsDict.set(item.nameId.replace(/^TFT_Item_/i, '').toLowerCase(), item)
        })
        setCdItems(itemsDict)

        try {
          const metaResult = await ingestMetaComps()
          if (!cancelled) {
            setComps(metaResult.comps, metaResult.provenance)
          }
        } catch (metaErr) {
          console.warn('[Overlay] Live comps failed, keeping fallback:', metaErr)
        }

        try {
          const tftItems = await fetchTFTItems()
          if (!cancelled) {
            setItemEngine(new ItemSuggestionEngine(tftItems))
            const iconMap = new Map<string, string>()
            for (const item of tftItems) {
              if (item.iconUrl) iconMap.set(item.apiName, item.iconUrl)
            }
            setTftItemIconMap(iconMap)
          }
        } catch (e) {
          console.warn('[Overlay] TFT item recipes failed:', e)
        }

        ingestProComps(setIndex).then(pc => {
          if (!cancelled) setProComps(pc)
        }).catch(err => {
          console.warn('[Overlay] Pro Comps load failed:', err)
        })
      } catch (err) {
        console.error('[Overlay] CDragon failed:', err)
      } finally {
        if (!cancelled) setCdLoading(false)
      }
    }

    loadData()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => clearToast(), 3500)
    return () => clearTimeout(timer)
  }, [toastMessage, clearToast])

  // Stage Coach
  useEffect(() => {
    if (!lcuConnected) return
    const selectedComp = selectedCompId ? [...comps, ...proComps].find(c => c.id === selectedCompId) ?? null : null
    const advice = getStageAdvice({ round: gameRound, gold: gameGold, level: gameLevel, hp: gameHp, selectedComp })
    for (const a of advice) {
      if (!shownAdviceIds.current.has(a.id)) {
        shownAdviceIds.current.add(a.id)
        pushNotif(a.emoji, a.title, a.body, 'stage', 8000)
        break
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameRound, gameGold, gameLevel, gameHp])

  // LiveGame stats update
  useEffect(() => {
    if (!window.electronAPI?.livegame?.onStatsUpdate) return
    const off = window.electronAPI.livegame.onStatsUpdate((stats: any) => {
      if (stats?.gameTime != null) setGameRound(estimateRoundFromTime(stats.gameTime))
    })
    return off
  }, [])

  // TFT Round Change → players + next opponent notification
  useEffect(() => {
    if (!window.electronAPI?.livegame?.onTFTRoundChange) return
    const off = window.electronAPI.livegame.onTFTRoundChange((tftState: any) => {
      if (tftState?.estimatedRound) setGameRound(tftState.estimatedRound)
      if (tftState?.players) setTftPlayers(tftState.players)
      if (tftState?.nextOpponent) {
        const opp = tftState.nextOpponent
        setNextOpponent(opp)
        const advId = `opp-${tftState.estimatedRound}`
        if (!shownAdviceIds.current.has(advId)) {
          shownAdviceIds.current.add(advId)
          pushNotif('⚔️', `Sonraki Rakip: ${opp.summonerName}`, `${opp.position}. sıra · ${opp.kills ?? 0} eleme`, 'opponent', 8000)
        }
      }
    })
    return off
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Item Logic Analyzer
  useEffect(() => {
    if (targetCompId && ownedComponents.length > 0) {
      const target = comps.find(c => c.id === targetCompId)
      if (target) {
        const suggestion = suggestItems(ownedComponents, target)
        if (suggestion) {
          pushNotif('💡', 'Item Öneri', `${suggestion.targetUnit} için: ${suggestion.completedItem}`, 'item', 7000)
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedComponents, targetCompId])

  // ── Copy Team Code — via IPC clipboard (always reliable) ────────
  const handleCopyTeamCode = useCallback(
    async (comp: CompData, e: React.MouseEvent) => {
      e.stopPropagation()

      const activeIndex = cdSetIndices.get(activeSetKey)
      if (!activeIndex) {
        showToast(`❌ Set verisi yüklenmedi: ${activeSetKey}`, 'error')
        return
      }

      const unitNames = comp.units.map(u => u.name)
      const result = generateTeamCode(unitNames, activeIndex)

      if (result.missing.length > 0) {
        showToast(`⚠ Eksik birimler: ${result.missing.join(', ')}`, 'warning')
        return
      }

      // Use IPC clipboard — works even when overlay window is not focused
      try {
        const success = await window.electronAPI?.clipboard?.writeText(result.code)
        if (success) {
          showToast(`✅ Team Code kopyalandı!`, 'success')
          setCopyingId(comp.id)
          setTimeout(() => setCopyingId(null), 2000)
        }
      } catch (err) {
        showToast(`❌ Kopyalama hatası: ${(err as Error).message}`, 'error')
      }
    },
    [activeSetKey, cdSetIndices, showToast]
  )

  // ── Filtering ─────────────────────────────────────────────────
  const activeComps = activeCompFilter === 'PRO' ? proComps : comps

  const filteredComps = activeComps.filter(c => {
    if (activeCompFilter === 'META' && (c.gameMode || 'Ranked') !== selectedGameMode) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const inName = c.name.toLowerCase().includes(q)
      const inUnits = c.units.some(u => u.name.toLowerCase().includes(q))
      const inTraits = c.traits.some(t => t.toLowerCase().includes(q))
      const inAuthor = (c.author ?? '').toLowerCase().includes(q)
      if (!inName && !inUnits && !inTraits && !inAuthor) return false
    }
    return true
  })

  const tierComps = {
    S: filteredComps.filter(c => c.tier === 'S'),
    A: filteredComps.filter(c => c.tier === 'A'),
    B: filteredComps.filter(c => c.tier === 'B'),
    C: filteredComps.filter(c => c.tier === 'C'),
  }

  const toggleCollapse = (id: string) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))

  // ── Provenance badge ──────────────────────────────────────────
  const provenanceBadge = (prov: string) => {
    if (prov === 'LIVE') return <span style={overlayStyles.liveBadge}>● LIVE</span>
    if (prov === 'CACHED') return <span style={overlayStyles.cachedBadge}>◷ CACHED</span>
    return <span style={overlayStyles.fallbackBadge}>⚡ FALLBACK</span>
  }

  // ── Render: comps tab ─────────────────────────────────────────
  const renderCompsTab = () => (
    <>
      {/* Source Filter */}
      <div style={overlayStyles.filterBar}>
        {(['META', 'PRO'] as const).map(f => (
          <button
            key={f}
            onClick={() => setActiveCompFilter(f)}
            style={{
              ...overlayStyles.filterBtn,
              borderBottom: activeCompFilter === f ? '2px solid #7c5cfc' : '2px solid transparent',
              color: activeCompFilter === f ? '#e2d9ff' : '#9fa3b0',
              fontWeight: activeCompFilter === f ? 700 : 400,
            }}
          >
            {f === 'META' ? '📊 MetaTFT' : `🏆 Pro Comps${proComps.length > 0 ? ` (${proComps.length})` : ''}`}
          </button>
        ))}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', padding: '0 8px', alignItems: 'center' }}>
          {provenanceBadge(compsProvenance)}
        </div>
      </div>

      {/* Game mode tabs — META only */}
      {activeCompFilter === 'META' && (
        <div style={overlayStyles.modeBar}>
          {[
            { id: 'Ranked', label: '⚔️ Dereceli' },
            { id: 'Choncc', label: '🐲 Choncc' },
            { id: 'HyperRoll', label: '⚡ Hyper' }
          ].map(mode => (
            <button
              key={mode.id}
              onClick={() => setSelectedGameMode(mode.id as any)}
              style={{
                ...overlayStyles.modeBtn,
                borderBottom: selectedGameMode === mode.id ? '2px solid #7c5cfc' : '2px solid transparent',
                color: selectedGameMode === mode.id ? '#f0f0f4' : '#9fa3b0',
                fontWeight: selectedGameMode === mode.id ? 600 : 400,
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={overlayStyles.searchContainer}>
        <input
          type="text"
          placeholder="Şampiyon, comp veya trait ara..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={overlayStyles.searchInput}
        />
        {searchQuery && (
          <button style={overlayStyles.clearSearch} onClick={() => setSearchQuery('')}>✕</button>
        )}
      </div>

      {/* Comp list */}
      <div style={overlayStyles.compList}>
        {cdLoading && filteredComps.length === 0 && (
          <div style={overlayStyles.loadingState}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⟳</div>
            <div style={{ color: '#9fa3b0', fontSize: 12 }}>Meta verisi yükleniyor…</div>
          </div>
        )}
        {(['S', 'A', 'B', 'C'] as const).map(tier => {
          const tierList = tierComps[tier]
          if (tierList.length === 0) return null
          return (
            <div key={tier}>
              <div style={overlayStyles.tierHeader}>
                <span style={{ ...overlayStyles.tierBadge, ...tierColors[tier] }}>{tier}</span>
                <span style={{ color: '#63666f', fontSize: 11 }}>Tier — {tierList.length} comp</span>
              </div>
              {tierList.map((comp, i) => {
                const setIndex = cdSetIndices.get(activeSetKey)
                const missingUnits = setIndex
                  ? comp.units.filter(u => !setIndex.nameToCharacterId.has(normalizeName(u.name))).map(u => u.name)
                  : []
                const isInvalid = missingUnits.length > 0
                const isExpanded = !!collapsed[comp.id]

                return (
                  <div
                    key={comp.id}
                    style={{
                      ...overlayStyles.compCard,
                      animationDelay: `${i * 50}ms`,
                      border: isExpanded
                        ? '1px solid rgba(124,92,252,0.35)'
                        : '1px solid rgba(255,255,255,0.07)',
                      background: isExpanded
                        ? 'rgba(124,92,252,0.05)'
                        : 'rgba(255,255,255,0.03)',
                    }}
                    onClick={() => {
                      toggleCollapse(comp.id)
                      setSelectedCompIdLocal(comp.id)
                    }}
                    className="animate-fade-in"
                  >
                    {/* Card header */}
                    <div style={overlayStyles.cardHeader}>
                      <div style={overlayStyles.cardNameRow}>
                        <span style={{ ...overlayStyles.tierBadgeSmall, ...tierColors[tier] }}>{tier}</span>
                        <span style={overlayStyles.compName}>{comp.name}</span>
                        {comp.author && (
                          <span style={overlayStyles.authorTag}>by {comp.author}</span>
                        )}
                      </div>
                      <div style={overlayStyles.cardActions}>
                        <span style={overlayStyles.metaChip}>ø {comp.avgPlace.toFixed(1)}</span>
                        {comp.playRate > 0 && (
                          <span style={overlayStyles.metaChip}>{comp.playRate}%</span>
                        )}
                        {isInvalid && (
                          <span style={overlayStyles.invalidBadge} title={`Eksik: ${missingUnits.join(', ')}`}>
                            PARTIAL
                          </span>
                        )}
                        <button
                          style={{
                            ...overlayStyles.copyBtn,
                            background: copyingId === comp.id ? 'rgba(52,211,153,0.2)' : 'rgba(124,92,252,0.15)',
                            borderColor: copyingId === comp.id ? 'rgba(52,211,153,0.4)' : 'rgba(124,92,252,0.35)',
                            opacity: isInvalid ? 0.4 : 1,
                            cursor: isInvalid ? 'not-allowed' : 'pointer',
                          }}
                          onClick={e => handleCopyTeamCode(comp, e)}
                          disabled={isInvalid}
                          title={isInvalid ? `Eksik birimler: ${missingUnits.join(', ')}` : 'Team Planner\'a kopyala'}
                        >
                          {copyingId === comp.id ? '✅' : '📋'}
                        </button>
                      </div>
                    </div>

                    {/* Traits */}
                    <div style={overlayStyles.traitRow}>
                      {comp.traits.map(trait => (
                        <span key={trait} style={overlayStyles.traitTag}>{trait}</span>
                      ))}
                    </div>

                    {/* Champion icons — always visible */}
                    <div style={overlayStyles.unitRow}>
                      {comp.units.map((unit, unitIdx) => {
                        const setIndex = cdSetIndices.get(activeSetKey)
                        const charId = setIndex?.nameToCharacterId.get(normalizeName(unit.name))
                        const champData = unit.iconUrl ? null : (charId && setIndex ? setIndex.characterIdToChampion.get(charId) : null)
                        const iconUrl = unit.iconUrl ?? (champData ? getChampionIconUrl(champData.squareIconPath || champData.characterId) : null)

                        return (
                          <div key={`${unit.characterId ?? unit.name}-${unitIdx}`} style={overlayStyles.unitCell}>
                            <div
                              style={{
                                ...overlayStyles.unitIcon,
                                boxShadow: `0 0 0 2px ${costColors[unit.cost] ?? '#555'}`,
                              }}
                              title={`${unit.name} (${unit.cost}g)`}
                            >
                              {iconUrl ? (
                                <img
                                  src={iconUrl}
                                  alt={unit.name}
                                  loading="lazy"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                                />
                              ) : (
                                <span style={overlayStyles.unitFallback}>{unit.name.slice(0, 2)}</span>
                              )}
                            </div>
                            {/* Item icons */}
                            {unit.items && unit.items.length > 0 && (
                              <div style={overlayStyles.itemRow}>
                                {unit.items.map((item, idx) => {
                                  const itemName = typeof item === 'string' ? item : item.name
                                  let itemIcon: string | null = tftItemIconMap.get(itemName) ?? null
                                  if (!itemIcon) itemIcon = typeof item === 'object' && item.iconUrl ? item.iconUrl : null
                                  if (!itemIcon) {
                                    const key = itemName.toLowerCase().replace(/['\s.]/g, '')
                                    const matched = cdItems.get(itemName.toLowerCase()) || cdItems.get(key)
                                    if (matched?.squareIconPath) itemIcon = getItemIconUrl(matched.squareIconPath)
                                  }
                                  return itemIcon ? (
                                    <img
                                      key={idx}
                                      src={itemIcon}
                                      alt={itemName}
                                      title={itemName}
                                      style={overlayStyles.itemIcon}
                                    />
                                  ) : null
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <>
                        {activeCompFilter === 'META' && itemEngine && (() => {
                          const bisGuide = itemEngine.getBISGuide(comp)
                          const goals = itemEngine.getComponentGoals(comp)
                          if (bisGuide.length === 0 && goals.length === 0) return null
                          return (
                            <div style={overlayStyles.bisContainer}>
                              {bisGuide.length > 0 && (
                                <div style={{ padding: '6px 8px 4px' }}>
                                  <div style={overlayStyles.sectionMicro}>⚔️ BIS ITEMS</div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {bisGuide.map((entry, ei) => (
                                      <div key={ei} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={overlayStyles.bisUnitName}>{entry.unitName}</span>
                                        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                          {entry.items.map((item, ii) => (
                                            <div key={ii} title={item.displayName} style={overlayStyles.bisItem}>
                                              {item.iconUrl ? (
                                                <img src={item.iconUrl} alt={item.displayName} style={{ width: 14, height: 14, borderRadius: 2 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                              ) : (
                                                <span style={{ fontSize: 8, color: '#888' }}>{item.displayName.slice(0, 8)}</span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {goals.length > 0 && (
                                <div style={{ padding: '4px 8px 6px', borderTop: '1px solid #1a1a1a' }}>
                                  <div style={{ ...overlayStyles.sectionMicro, color: '#4da6ff' }}>🧩 KOMPONENT</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    {goals.slice(0, 8).map((goal, ri) => (
                                      <div key={ri} title={`${goal.shortName} ×${goal.count} → ${goal.usedIn.join(', ')}`}
                                        style={{ ...overlayStyles.goalItem, background: ri === 0 ? 'rgba(77,166,255,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${ri === 0 ? '#3a6a9c' : '#2a2a2a'}` }}>
                                        <span style={{ color: '#888', fontSize: 8 }}>{ri + 1}.</span>
                                        {goal.iconUrl && <img src={goal.iconUrl} alt={goal.shortName} style={{ width: 12, height: 12, borderRadius: 2 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                                        <span>{goal.shortName}</span>
                                        {goal.count > 1 && <span style={{ color: '#4da6ff', fontWeight: 700 }}>×{goal.count}</span>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })()}

                        {/* Board Map — META comps: check SET16_COMPS for boardLayout */}
                        {(() => {
                          const metaComp = SET16_COMPS.find(mc =>
                            comp.traits.some(t => mc.traits.some(mt => t.toLowerCase().includes(mt)))
                          )
                          if (!metaComp?.boardLayout) return null
                          return (
                            <BoardMap
                              boardLayout={metaComp.boardLayout}
                              positioningTip={metaComp.positioningTip}
                            />
                          )
                        })()}

                          <div style={{ padding: '8px 4px 4px', borderTop: '1px solid #222' }}>
                            <div style={overlayStyles.sectionMicro}>BOARD POZİSYONLARI</div>
                            {activeCompFilter === 'PRO' && comp.placementMap && Object.keys(comp.placementMap).length > 0 && (
                              <>
                                <BoardPlacementMap placementMap={comp.placementMap} />
                                {comp.notes && (
                                  <div style={{ fontSize: 10, color: '#9ca3af', padding: '4px 8px', lineHeight: 1.4, borderTop: '1px solid #222', marginTop: 4, whiteSpace: 'pre-wrap', maxHeight: 60, overflowY: 'auto' }}>
                                    {comp.notes}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </>
                      )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </>
  )

  // ── Render: debug tab ────────────────────────────────────────
  const renderDebugTab = () => {
    const setIndex = cdSetIndices.get(activeSetKey)
    return (
      <div style={{ padding: 12, fontSize: 11, color: '#9fa3b0', lineHeight: 1.8, overflowY: 'auto', flex: 1 }}>
        <div style={overlayStyles.sectionMicro}>🐛 DEBUG PANEL</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
          <tbody>
            {[
              ['Active Set', activeSetKey],
              ['Champions', setIndex ? `${setIndex.champions.length} yüklü` : '—'],
              ['Comps', `${comps.length} (${compsProvenance})`],
              ['Pro Comps', proComps.length],
              ['CDragon Loading', cdLoading ? '⟳ Yükleniyor' : '✅ Tamam'],
              ['Game Phase', gamePhase],
              ['LCU', lcuConnected ? '✅ Bağlı' : '❌ Bağlantı yok'],
              ['Round', gameRound],
              ['Next Opponent', nextOpponent?.summonerName ?? '—'],
              ['Scouts', scoutedPlayers.length],
            ].map(([k, v]) => (
              <tr key={String(k)}>
                <td style={{ color: '#63666f', width: 120, paddingBottom: 2 }}>{k}</td>
                <td style={{ color: '#f0f0f4' }}>{String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
      <div
        ref={panelRef}
        style={overlayStyles.panel}
      >
        {/* Header */}
        <div style={overlayStyles.header}>
          <div style={overlayStyles.brand}>
            <div style={overlayStyles.logo}>AG</div>
            <span style={overlayStyles.title}>Antigravity</span>
            {cdLoading && <span style={overlayStyles.loadingDot}>⟳</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...overlayStyles.statusDot, background: lcuConnected ? '#34d399' : '#555' }} title={lcuConnected ? 'LCU Bağlı' : 'LCU Yok'} />
            {/* Compact toggle */}
            <button
              onClick={() => {
                setOverlayCompact(!overlayCompact)
                window.electronAPI?.overlay?.setCompactMode(!overlayCompact)
              }}
              style={overlayStyles.iconBtn}
              title={overlayCompact ? 'Genişlet' : 'Küçült'}
            >
              {overlayCompact ? '⬆' : '⬇'}
            </button>
            <button
              onClick={handleClose}
              style={overlayStyles.iconBtn}
              title="Kapat"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={overlayStyles.tabBar}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                ...overlayStyles.tabBtn,
                borderBottom: activeTab === tab.id ? '2px solid #7c5cfc' : '2px solid transparent',
                color: activeTab === tab.id ? '#e2d9ff' : '#9fa3b0',
                fontWeight: activeTab === tab.id ? 600 : 400,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'comps' && renderCompsTab()}
          {activeTab === 'rivals' && <RivalPanel />}
          {activeTab === 'debug' && renderDebugTab()}
        </div>

        {/* scouting panel (live game) */}
        {activeTab === 'comps' && tftPlayers.length > 0 && (
          <div style={overlayStyles.scoutBar}>
            <div style={overlayStyles.sectionMicro}>
              👁 OYUN {gameRound && `— Round ${gameRound}`}
              {nextOpponent && <span style={{ color: '#e8a838', marginLeft: 8 }}>⚔️ {nextOpponent.summonerName}</span>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {tftPlayers.slice(0, 8).map(p => (
                <div
                  key={p.summonerName}
                  style={{
                    ...overlayStyles.playerChip,
                    background: nextOpponent?.summonerName === p.summonerName ? 'rgba(232,168,56,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${nextOpponent?.summonerName === p.summonerName ? '#8a6000' : '#222'}`,
                    opacity: p.deaths > 0 ? 0.5 : 1,
                  }}
                >
                  <span style={{ color: '#555', fontSize: 8 }}>#{p.position}</span>
                  <span style={{ maxWidth: 55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.summonerName}</span>
                  {p.kills > 0 && <span style={{ color: '#e85858', fontSize: 8 }}>💀{p.kills}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={overlayStyles.footer}>
          <span style={{ color: '#45484f', fontSize: 10 }}>
            {gamePhase === 'None' ? 'Oyun bekleniyor' : `Faz: ${gamePhase}`}
            {gameRound && gamePhase !== 'None' && <span style={{ color: '#7c5cfc', marginLeft: 6 }}>R{gameRound}</span>}
          </span>
          <span style={{ color: '#45484f', fontSize: 10 }}>⌥Space etkileşim</span>
        </div>

        {/* Interactive mode indicator */}
        {overlayInteractive && (
          <div style={overlayStyles.interactiveIndicator}>🎯 Etkileşim Aktif</div>
        )}

        {/* Toast */}
        {toastMessage && (
          <div style={{
            ...overlayStyles.toast,
            background: toastType === 'success' ? 'rgba(52,211,153,0.15)'
              : toastType === 'warning' ? 'rgba(245,166,35,0.15)'
              : toastType === 'error' ? 'rgba(239,68,68,0.15)'
              : 'rgba(77,166,255,0.15)',
            borderColor: toastType === 'success' ? '#34d399'
              : toastType === 'warning' ? '#f5a623'
              : toastType === 'error' ? '#ef4444'
              : '#4da6ff',
          }}>
            {toastMessage}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Style constants ───────────────────────────────────────────────
const tierColors: Record<string, React.CSSProperties> = {
  S: { background: 'rgba(245,200,66,0.18)', color: '#f5c842' },
  A: { background: 'rgba(52,211,153,0.14)', color: '#34d399' },
  B: { background: 'rgba(77,166,255,0.12)', color: '#74b8ff' },
  C: { background: 'rgba(160,160,160,0.10)', color: '#9fa3b0' },
}

const costColors: Record<number, string> = {
  1: '#9fa3b0', 2: '#34d399', 3: '#4da6ff', 4: '#a855f7', 5: '#f5c842'
}

const overlayStyles: Record<string, React.CSSProperties> = {
  panel: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(11,13,18,0.94)',
    backdropFilter: 'blur(24px) saturate(1.4)',
    WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
    fontFamily: "'Inter', -apple-system, sans-serif",
    overflow: 'hidden',
  } as any,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px 6px',
    WebkitAppRegion: 'drag',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(255,255,255,0.02)',
    flexShrink: 0,
  } as any,
  brand: { display: 'flex', alignItems: 'center', gap: 8 },
  logo: {
    width: 26, height: 26,
    background: 'linear-gradient(135deg, #7c5cfc, #4da6ff)',
    borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, fontWeight: 800, color: '#fff',
  },
  title: { fontSize: 13, fontWeight: 700, color: '#f0f0f4' },
  loadingDot: { fontSize: 14, color: '#7c5cfc', animation: 'spin 1s linear infinite' },
  statusDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    color: '#9fa3b0',
    cursor: 'pointer',
    fontSize: 14,
    padding: '2px 4px',
    lineHeight: 1,
    WebkitAppRegion: 'no-drag',
    borderRadius: 4,
    transition: 'color 0.15s',
  } as any,
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(0,0,0,0.2)',
    flexShrink: 0,
    WebkitAppRegion: 'no-drag',
  } as any,
  tabBtn: {
    flex: 1,
    padding: '7px 0',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 11,
    letterSpacing: '0.02em',
    transition: 'all 0.15s',
    WebkitAppRegion: 'no-drag',
  } as any,
  filterBar: {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(0,0,0,0.15)',
    WebkitAppRegion: 'no-drag',
    flexShrink: 0,
  } as any,
  filterBtn: {
    flex: 1,
    padding: '6px 0',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 11,
    transition: 'all 0.15s',
    WebkitAppRegion: 'no-drag',
  } as any,
  modeBar: {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    WebkitAppRegion: 'no-drag',
    flexShrink: 0,
  } as any,
  modeBtn: {
    flex: 1,
    padding: '6px 0',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 11,
    transition: 'all 0.15s',
  },
  searchContainer: {
    position: 'relative',
    padding: '6px 8px',
    background: 'rgba(0,0,0,0.3)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
    WebkitAppRegion: 'no-drag',
  } as any,
  searchInput: {
    width: '100%',
    padding: '5px 28px 5px 10px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#f0f0f4',
    fontSize: 12,
    outline: 'none',
    fontFamily: 'inherit',
  },
  clearSearch: {
    position: 'absolute',
    right: 14,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    color: '#63666f',
    cursor: 'pointer',
    fontSize: 12,
    padding: 0,
    lineHeight: 1,
  },
  compList: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 8px 4px',
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 16px',
    color: '#9fa3b0',
    fontSize: 12,
  },
  tierHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 2px 4px',
  },
  tierBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 800,
    flexShrink: 0,
  },
  tierBadgeSmall: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 800,
    flexShrink: 0,
  },
  compCard: {
    borderRadius: 8,
    padding: '8px 10px',
    marginBottom: 4,
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    animation: 'fadeIn 0.3s ease-out forwards',
    opacity: 0,
  } as any,
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 4,
  },
  cardNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    minWidth: 0,
    flexWrap: 'wrap',
  },
  compName: {
    fontSize: 12,
    fontWeight: 600,
    color: '#f0f0f4',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 120,
  },
  authorTag: { fontSize: 9, color: '#63666f', fontWeight: 400 },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  metaChip: {
    fontSize: 10,
    color: '#9fa3b0',
    background: 'rgba(255,255,255,0.05)',
    padding: '2px 5px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
  },
  invalidBadge: {
    fontSize: 9,
    fontWeight: 700,
    color: '#f87171',
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.3)',
    padding: '2px 4px',
    borderRadius: 4,
  },
  copyBtn: {
    border: '1px solid',
    borderRadius: 5,
    padding: '3px 7px',
    fontSize: 11,
    transition: 'all 0.15s',
    lineHeight: 1,
  },
  traitRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 3,
    marginBottom: 6,
  },
  traitTag: {
    fontSize: 9,
    color: '#9fa3b0',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '2px 5px',
    borderRadius: 20,
    whiteSpace: 'nowrap',
  },
  unitRow: {
    display: 'flex',
    gap: 5,
    flexWrap: 'wrap',
  },
  unitCell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  unitIcon: {
    width: 32,
    height: 32,
    borderRadius: 5,
    background: 'rgba(255,255,255,0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  unitFallback: {
    fontSize: 8,
    color: '#9fa3b0',
    fontWeight: 600,
  },
  itemRow: {
    display: 'flex',
    gap: 1,
  },
  itemIcon: {
    width: 13,
    height: 13,
    borderRadius: 2,
    border: '1px solid rgba(0,0,0,0.6)',
  },
  bisContainer: {
    borderTop: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(124,92,252,0.03)',
  },
  sectionMicro: {
    fontSize: 9,
    fontWeight: 600,
    color: '#7c5cfc',
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  bisUnitName: {
    fontSize: 9,
    color: '#9fa3b0',
    minWidth: 55,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  bisItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid #2a2a2a',
    borderRadius: 3,
    padding: '1px 3px',
  },
  goalItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    borderRadius: 4,
    padding: '2px 5px',
    fontSize: 9,
    color: '#ddd',
  },
  scoutBar: {
    borderTop: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(0,0,0,0.5)',
    padding: '6px 10px',
    flexShrink: 0,
  },
  playerChip: {
    fontSize: 9,
    padding: '2px 5px',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    color: '#ccc',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '5px 12px',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    background: 'rgba(0,0,0,0.3)',
    flexShrink: 0,
  },
  interactiveIndicator: {
    position: 'absolute' as const,
    bottom: 32,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(124,92,252,0.9)',
    color: '#fff',
    fontSize: 10,
    fontWeight: 600,
    padding: '4px 12px',
    borderRadius: 20,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
  toast: {
    position: 'absolute' as const,
    bottom: 44,
    left: 8,
    right: 8,
    padding: '8px 12px',
    borderRadius: 7,
    border: '1px solid',
    fontSize: 12,
    fontWeight: 500,
    color: '#f0f0f4',
    animation: 'slideUp 0.2s ease-out',
    zIndex: 999,
  },
  liveBadge: {
    fontSize: 9, fontWeight: 700,
    color: '#34d399', background: 'rgba(52,211,153,0.12)',
    border: '1px solid rgba(52,211,153,0.25)',
    padding: '2px 6px', borderRadius: 20,
  },
  cachedBadge: {
    fontSize: 9, fontWeight: 700,
    color: '#4da6ff', background: 'rgba(77,166,255,0.12)',
    border: '1px solid rgba(77,166,255,0.25)',
    padding: '2px 6px', borderRadius: 20,
  },
  fallbackBadge: {
    fontSize: 9, fontWeight: 700,
    color: '#f5a623', background: 'rgba(245,166,35,0.12)',
    border: '1px solid rgba(245,166,35,0.25)',
    padding: '2px 6px', borderRadius: 20,
  },
}
