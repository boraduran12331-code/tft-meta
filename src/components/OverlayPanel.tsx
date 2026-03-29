import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore, type CompData } from '../store/appStore'
import { fetchSetIndex, getChampionIconUrl, fetchItemsData, getItemIconUrl, normalizeName, fetchTFTItems } from '../services/CommunityDragonService'
import { generateTeamCode } from '../services/TeamCodeEncoder'
import { suggestItems, BASE_COMPONENTS } from '../services/ItemLogicAnalyzer'
import { BoardPlacementMap } from './BoardPlacementMap'
import { ItemSuggestionEngine } from '../services/ItemSuggestionEngine'
import { getStageAdvice, estimateRoundFromTime } from '../services/StageCoach'
import '../styles/overlay.css'

import { ingestMetaComps, ingestProComps } from '../services/MetaTFTService'
import { FALLBACK_COMPS } from '../services/FallbackComps'


export function OverlayPanel() {
  const {
    lcuConnected,
    gamePhase,
    overlayInteractive,
    comps,
    proComps,
    compsProvenance,
    cdSetIndices,
    cdItems,
    activeSetKey,
    cdLoading,
    toastMessage,
    targetCompId,
    ownedComponents,
    selectedGameMode,
    searchQuery,
    activeCompFilter,
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
    showToast,
    clearToast,
  } = useAppStore()

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null)
  const [itemEngine, setItemEngine] = useState<ItemSuggestionEngine | null>(null)
  const [tftItemIconMap, setTftItemIconMap] = useState<Map<string, string>>(new Map())
  const [gameRound, setGameRound] = useState<string>('1-1')
  const [gameGold, setGameGold] = useState<number>(0)
  const [gameLevel, setGameLevel] = useState<number>(1)
  const [gameHp, setGameHp] = useState<number>(100)
  const shownAdviceIds = useRef<Set<string>>(new Set())
  const [tftPlayers, setTftPlayers] = useState<Array<{summonerName: string; position: number; kills: number; deaths: number}>>([])
  const [nextOpponent, setNextOpponent] = useState<{summonerName: string; position: number} | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const handleClose = useCallback(() => {
    if (window.electronAPI?.overlay?.hide) {
      window.electronAPI.overlay.hide()
    }
  }, [])

  // Load CDragon, MetaTFT comps AND Pro Comps — run once on mount
  useEffect(() => {
    let cancelled = false

    async function loadData() {
      // PHASE 1: Show fallback comps immediately so overlay is never blank
      setComps(FALLBACK_COMPS, 'FALLBACK')

      setCdLoading(true)
      try {
        // PHASE 2: Fetch CDragon data (needed for icon URLs)
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
          if (!item || !item.nameId) return
          if (item.name) itemsDict.set(item.name.toLowerCase(), item)
          itemsDict.set(item.nameId.toLowerCase(), item)
          itemsDict.set(item.nameId.replace(/^TFT_Item_/i, '').toLowerCase(), item)
        })
        setCdItems(itemsDict)

        // PHASE 3: Fetch live MetaTFT comps (may take a moment)
        try {
          const metaResult = await ingestMetaComps()
          if (!cancelled) {
            setComps(metaResult.comps, metaResult.provenance)
            console.log(`[Overlay] ✅ Live comps: ${metaResult.comps.length} (${metaResult.provenance})`)
          }
        } catch (metaErr) {
          console.warn('[Overlay] Live comps failed, keeping fallback:', metaErr)
        }

        // PHASE 4: TFT item recipes (for BIS guide + item icon resolution)
        try {
          const tftItems = await fetchTFTItems()
          if (!cancelled) {
            setItemEngine(new ItemSuggestionEngine(tftItems))
            // Build apiName → iconUrl map for unit item icon rendering
            const iconMap = new Map<string, string>()
            for (const item of tftItems) {
              if (item.iconUrl) iconMap.set(item.apiName, item.iconUrl)
            }
            setTftItemIconMap(iconMap)
            console.log(`[Overlay] ✅ TFT item icons: ${iconMap.size}`)
          }
        } catch (e) {
          console.warn('[Overlay] TFT item recipes failed:', e)
        }

        // PHASE 5: Pro Comps (non-blocking)
        ingestProComps(setIndex).then(pc => {
          if (!cancelled) {
            setProComps(pc)
            console.log(`[Overlay] ✅ Pro Comps: ${pc.length}`)
          }
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

  // Stage Coach — fire advice when game state changes
  useEffect(() => {
    if (!lcuConnected) return
    const selectedComp = selectedCompId ? [...comps, ...proComps].find(c => c.id === selectedCompId) ?? null : null
    const advice = getStageAdvice({ round: gameRound, gold: gameGold, level: gameLevel, hp: gameHp, selectedComp })
    for (const a of advice) {
      if (!shownAdviceIds.current.has(a.id)) {
        shownAdviceIds.current.add(a.id)
        showToast(`${a.emoji} ${a.title} — ${a.body}`)
        break // one toast at a time
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameRound, gameGold, gameLevel, gameHp])

  // LCU livegame stats → populate game state
  useEffect(() => {
    if (!window.electronAPI?.livegame?.onStatsUpdate) return
    const off = window.electronAPI.livegame.onStatsUpdate((stats: any) => {
      if (stats?.gameTime != null) {
        setGameRound(estimateRoundFromTime(stats.gameTime))
      }
    })
    return off
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // TFT Round Change → update players + next opponent toast
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
          showToast(`⚔️ Sonraki Rakip: ${opp.summonerName} (${opp.position}. sıra)`)
        }
      }
    })
    return off
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Item Logic Analyzer Hook
  useEffect(() => {
    if (targetCompId && ownedComponents.length > 0) {
      const target = comps.find(c => c.id === targetCompId)
      if (target) {
        const suggestion = suggestItems(ownedComponents, target)
        if (suggestion) {
          showToast(`💡 ${suggestion.targetUnit} için: ${suggestion.missingComponent === 'HAZIR' ? suggestion.completedItem + ' hazır!' : suggestion.completedItem + ' yapabilirsin (' + suggestion.missingComponent + ' eksik)'}`)
        }
      }
    }
  }, [ownedComponents, targetCompId, comps, showToast])

  // ─── Handle copy team code ─────────────────────────────
  const handleCopyTeamCode = useCallback(
    async (comp: CompData, e: React.MouseEvent) => {
      e.stopPropagation() // don't toggle collapse

      if (!activeSetKey || !cdSetIndices) {
        showToast('❌ Error: Set data not loaded yet.')
        return
      }

      const activeIndex = cdSetIndices.get(activeSetKey)
      if (!activeIndex) {
        showToast(`❌ Error: Index not found for ${activeSetKey}`)
        return
      }

      const unitNames = comp.units.map(u => u.name)
      const { code, missing } = generateTeamCode(unitNames, activeIndex)

      if (missing.length > 0) {
        showToast(`❌ Missing units: ${missing.join(', ')}`)
        return
      }

      try {
        await navigator.clipboard.writeText(code)
        showToast(`✅ Copied Team Code!`)
        setCopyingId(comp.id)
        setTimeout(() => setCopyingId(null), 2000)
      } catch (err) {
        showToast(`❌ Failed to copy: ${(err as Error).message}`)
      }
    },
    [activeSetKey, cdSetIndices, showToast]
  )

  // Active comp list — depends on filter
  const activeComps = activeCompFilter === 'PRO' ? proComps : comps

  const filteredComps = activeComps.filter(c => {
    // Game Mode filter only applies to META comps
    if (activeCompFilter === 'META' && (c.gameMode || 'Ranked') !== selectedGameMode) return false

    // Filter by Search Query
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
    S: filteredComps.filter((c) => c.tier === 'S'),
    A: filteredComps.filter((c) => c.tier === 'A'),
    B: filteredComps.filter((c) => c.tier === 'B'),
    C: filteredComps.filter((c) => c.tier === 'C'),
  }

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="overlay-root" style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
      <div 
        className="overlay-panel" 
        ref={panelRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          margin: 0,
          borderRadius: 0,
          border: 'none'
        }}
      >
        {/* Header — draggable natively by Electron */}
        <div className="overlay-header" style={{ WebkitAppRegion: 'drag' } as any}>
          <div className="overlay-brand">
            <div className="overlay-logo">AG</div>
            <span className="overlay-title">Antigravity</span>
          </div>
          <div className="overlay-status" style={{ flex: 1, justifyContent: 'flex-end', display: 'flex', gap: '8px' }}>
            <span className={`status-dot ${lcuConnected ? 'connected' : 'disconnected'}`} />
            <span>{lcuConnected ? 'Bağlı' : 'Bekleniyor'}</span>
            <button 
              onClick={handleClose} 
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontSize: '16px',
                lineHeight: '1',
                padding: '0 4px',
                marginLeft: '8px',
                WebkitAppRegion: 'no-drag'
              } as any}
              title="Overlay'i Gizle"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ─── Source Filter: MetaTFT Comps vs Pro Comps ─── */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border-tertiary)',
          background: '#111318',
          WebkitAppRegion: 'no-drag'
        } as any}>
          {(['META', 'PRO'] as const).map(f => (
            <button
              key={f}
              onClick={() => setActiveCompFilter(f)}
              style={{
                flex: 1,
                padding: '7px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: activeCompFilter === f ? '2px solid #7c5cfc' : '2px solid transparent',
                color: activeCompFilter === f ? '#e2d9ff' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: activeCompFilter === f ? 700 : 400,
                letterSpacing: '0.05em',
                transition: 'all 0.2s'
              }}
            >
              {f === 'META' ? '📊 MetaTFT Comps' : `🏆 Pro Comps${proComps.length > 0 ? ` (${proComps.length})` : ''}`}
            </button>
          ))}
        </div>

        {/* Game Mode Tabs — only shown in META mode */}
        {activeCompFilter === 'META' && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-tertiary)', background: 'var(--color-bg-elevated)', WebkitAppRegion: 'no-drag' } as any}>
          {[
            { id: 'Ranked', label: '⚔️ Dereceli' },
            { id: 'Choncc', label: '🐲 Choncc' },
            { id: 'HyperRoll', label: '⚡ Hyper Roll' }
          ].map(mode => (
            <button
              key={mode.id}
              onClick={() => setSelectedGameMode(mode.id as any)}
              style={{
                flex: 1,
                padding: '8px 0',
                background: 'transparent',
                border: 'none',
                borderBottom: selectedGameMode === mode.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: selectedGameMode === mode.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: selectedGameMode === mode.id ? 600 : 400,
                transition: 'all 0.2s'
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
        )}

        {/* Search Bar */}
        <div style={{ padding: '6px 12px', background: 'var(--color-bg-panel)', borderBottom: '1px solid #222', WebkitAppRegion: 'no-drag' } as any}>
          <input 
            type="text" 
            placeholder="Şampiyon, Meta veya Özellik ara..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '6px 10px', 
              borderRadius: '6px', 
              border: '1px solid #333', 
              background: '#1a1a1a', 
              color: '#fff',
              fontSize: '12px',
              outline: 'none'
            }}
          />
        </div>

        {/* MVP Component testing bar */}
        {overlayInteractive && (
          <div className="component-bar" style={{ display: 'flex', gap: '4px', padding: '6px 12px', overflowX: 'auto', background: 'rgba(0,0,0,0.5)', WebkitAppRegion: 'no-drag' } as any}>
            <span style={{ fontSize: '10px', color: '#888', alignSelf: 'center', marginRight: '4px' }}>MVP ITEM:</span>
            {Object.values(BASE_COMPONENTS).map(compName => (
              <button 
                key={compName}
                onClick={() => setOwnedComponents([...ownedComponents, compName])}
                style={{ fontSize: '10px', padding: '4px 6px', background: '#222', border: '1px solid #444', color: '#fff', cursor: 'pointer', borderRadius: '4px', whiteSpace: 'nowrap' }}
                title={compName}
              >
                + {compName.split(' ')[0]} 
              </button>
            ))}
            {ownedComponents.length > 0 && (
              <button onClick={() => setOwnedComponents([])} style={{ fontSize: '10px', marginLeft: 'auto', background: '#422', border: '1px solid #844', color: '#fdd', cursor: 'pointer', borderRadius: '4px' }}>
                Temizle ({ownedComponents.length})
              </button>
            )}
          </div>
        )}

        {/* Comp List */}
        <div className="overlay-content" style={{ flex: 1, overflowY: 'auto' }}>
          {(['S', 'A', 'B', 'C'] as const).map((tier) => {
            const tierList = tierComps[tier]
            if (tierList.length === 0) return null

            return (
              <div key={tier}>
                <div className="section-label">
                  <span className={`tier-badge ${tier.toLowerCase()}`}>{tier}</span>
                  {' '}Tier — {tierList.length} comp
                </div>

                {tierList.map((comp, i) => {
                  const setIndex = cdSetIndices.get(activeSetKey)
                  const missingUnits = setIndex 
                    ? comp.units.filter(u => !setIndex.nameToCharacterId.has(normalizeName(u.name))).map(u => u.name)
                    : []
                  const isInvalid = missingUnits.length > 0

                  return (
                    <div
                      key={comp.id}
                      className="comp-card animate-fade-in"
                      style={{ animationDelay: `${i * 60}ms` }}
                      onClick={() => {
                        toggleCollapse(comp.id)
                        setSelectedCompId(comp.id)
                      }}
                    >
                      <div className="comp-card-header">
                        <div className="comp-name">
                          <span className={`tier-badge ${tier.toLowerCase()}`}>{tier}</span>
                          {comp.name}
                          {comp.author && (
                            <span style={{ fontSize: '9px', color: '#888', marginLeft: 4, fontWeight: 400 }}>
                              by {comp.author}
                            </span>
                          )}
                        </div>
                        <div className="comp-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div className="comp-meta">
                            ø {comp.avgPlace.toFixed(1)} · {comp.playRate}%
                          </div>
                          {isInvalid && (
                            <div className="comp-invalid-badge" title={`Set'te eksik birimler: ${missingUnits.join(', ')}`} style={{ fontSize: '9px', fontWeight: 'bold', color: '#ffaaaa', background: 'rgba(255,0,0,0.15)', border: '1px solid #882222', padding: '2px 4px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                              INVALID
                            </div>
                          )}
                          {/* Copy Team Code Button */}
                          <button
                            className={`copy-code-btn ${copyingId === comp.id ? 'copied' : ''}`}
                            onClick={(e) => handleCopyTeamCode(comp, e)}
                            title={`Copy Team to Planner`}
                            disabled={isInvalid}
                            style={{ 
                              opacity: isInvalid ? 0.4 : 1,
                              cursor: isInvalid ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {copyingId === comp.id ? '✅' : '📋'}
                          </button>
                        </div>
                      </div>

                    {/* Traits */}
                    <div className="comp-traits">
                      {comp.traits.map((trait) => (
                        <span key={trait} className="trait-tag">
                          {trait}
                        </span>
                      ))}
                    </div>

                    {/* Units */}
                    {collapsed[comp.id] && (
                      <>
                      <div className="comp-units">
                        {comp.units.map((unit, unitIdx) => {
                          // Use pre-resolved iconUrl from pipeline first, fallback to live CDragon lookup
                          const setIndex = cdSetIndices.get(activeSetKey)
                          const charId = setIndex?.nameToCharacterId.get(normalizeName(unit.name))
                          const champData = unit.iconUrl ? null : (charId && setIndex ? setIndex.characterIdToChampion.get(charId) : null)
                          const iconUrl = unit.iconUrl ?? (champData ? getChampionIconUrl(champData.squareIconPath || champData.characterId) : null)

                          return (
                            <div
                              key={`${unit.characterId || unit.name}-${unitIdx}`}
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                            >
                              <div
                                className={`unit-icon cost-${unit.cost}`}
                                title={`${unit.name} (${unit.cost}g)`}
                              >
                                {iconUrl ? (
                                  <img
                                    src={iconUrl}
                                    alt={unit.name}
                                    loading="lazy"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none'
                                      ;(e.target as HTMLImageElement).parentElement!
                                        .querySelector('.unit-fallback')
                                        ?.classList.add('visible')
                                    }}
                                  />
                                ) : null}
                                <span className="unit-fallback">{unit.name.slice(0, 2)}</span>
                              </div>
                              
                              {/* Items Row — handles ItemRef objects and plain strings */}
                              {unit.items && unit.items.length > 0 && (
                                <div style={{ display: 'flex', gap: '2px', marginTop: '-8px', zIndex: 2 }}>
                                  {unit.items.map((item, idx) => {
                                    const itemName = typeof item === 'string' ? item : item.name
                                    
                                    // 1. TFT item icon map (from fetchTFTItems — most reliable)
                                    let itemIcon: string | null = tftItemIconMap.get(itemName) ?? null
                                    
                                    // 2. Fallback: pipeline-attached direct URL
                                    if (!itemIcon) {
                                      itemIcon = typeof item === 'object' && item.iconUrl ? item.iconUrl : null
                                    }
                                    
                                    // 3. Last resort: cdItems LoL map (for non-TFT items)
                                    if (!itemIcon) {
                                      const key = itemName.toLowerCase().replace(/['\s\.]/g, '')
                                      const matchedItem = cdItems.get(itemName.toLowerCase()) || cdItems.get(key) || cdItems.get(`tft_item_${key}`)
                                      if (matchedItem?.squareIconPath) {
                                        itemIcon = getItemIconUrl(matchedItem.squareIconPath)
                                      }
                                    }
                                    
                                    return itemIcon ? (
                                      <img 
                                        key={idx} 
                                        src={itemIcon} 
                                        alt={itemName}
                                        title={itemName}
                                        style={{ width: '14px', height: '14px', borderRadius: '3px', border: '1px solid #111' }} 
                                      />
                                    ) : null
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* ─── BIS Item Build Guide (META comps with engine) ─── */}
                      {activeCompFilter === 'META' && itemEngine && (() => {
                        const bisGuide = itemEngine.getBISGuide(comp)
                        const goals = itemEngine.getComponentGoals(comp)
                        if (bisGuide.length === 0 && goals.length === 0) return null
                        return (
                          <div style={{ borderTop: '1px solid #222', background: 'rgba(124,92,252,0.04)' }}>
                            {/* Per-unit item builds */}
                            {bisGuide.length > 0 && (
                              <div style={{ padding: '6px 8px 4px' }}>
                                <div style={{ fontSize: '9px', color: '#7c5cfc', letterSpacing: '0.1em', marginBottom: '6px' }}>⚔️ ŞAMPİYON ITEM BUILD</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {bisGuide.map((entry, ei) => (
                                    <div key={`${comp.id}-unit-${entry.unitCharacterId}-${ei}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontSize: '9px', color: '#aaa', minWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {entry.unitName}
                                      </span>
                                      <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
                                        {entry.items.map((item, ii) => (
                                          <div key={`${entry.unitCharacterId}-item-${item.apiName}-${ii}`} title={`${item.displayName} = ${item.components.map(c=>c.shortName).join(' + ')}`}
                                            style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(255,255,255,0.06)', border: '1px solid #2a2a2a', borderRadius: '3px', padding: '1px 3px' }}>
                                            {item.iconUrl ? (
                                              <img src={item.iconUrl} alt={item.displayName} style={{ width: '14px', height: '14px', borderRadius: '2px' }}
                                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                            ) : (
                                              <span style={{ fontSize: '8px', color: '#888', maxWidth: '50px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {item.displayName.slice(0, 8)}
                                              </span>
                                            )}
                                            {item.components.length === 2 && (
                                              <span style={{ fontSize: '8px', color: '#555' }}>
                                                {item.components.map(c => {
                                                  const ico = tftItemIconMap.get(c.apiName)
                                                  return ico ? null : c.shortName.split(' ')[0]
                                                }).filter(Boolean).join('+')}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Component priority row */}
                            {goals.length > 0 && (
                              <div style={{ padding: '4px 8px 6px', borderTop: bisGuide.length > 0 ? '1px solid #1a1a1a' : undefined }}>
                                <div style={{ fontSize: '9px', color: '#5ca8fc', letterSpacing: '0.1em', marginBottom: '4px' }}>🧩 KOMPONENT TOPLAMA SİRASI</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                  {goals.slice(0, 9).map((goal, ri) => (
                                    <div key={`${comp.id}-goal-${goal.apiName}-${ri}`} title={`${goal.shortName} ×${goal.count} → ${goal.usedIn.join(', ')}`}
                                      style={{ display: 'flex', alignItems: 'center', gap: '3px', background: ri === 0 ? 'rgba(92,168,252,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${ri === 0 ? '#3a6a9c' : '#2a2a2a'}`, borderRadius: '4px', padding: '2px 5px', fontSize: '9px', color: '#ddd' }}>
                                      <span style={{ color: '#888', fontSize: '8px' }}>{ri + 1}.</span>
                                      {goal.iconUrl && (
                                        <img src={goal.iconUrl} alt={goal.shortName} style={{ width: '12px', height: '12px', borderRadius: '2px' }}
                                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                      )}
                                      <span>{goal.shortName}</span>
                                      {goal.count > 1 && <span style={{ color: '#5ca8fc', fontWeight: 700 }}>×{goal.count}</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {/* ─── Placement Map (Pro Comps only) ─── */}
                      {activeCompFilter === 'PRO' && comp.placementMap && Object.keys(comp.placementMap).length > 0 && (
                        <div style={{ padding: '8px 4px 4px', borderTop: '1px solid #222' }}>
                          <div style={{ fontSize: '9px', color: '#666', textAlign: 'center', marginBottom: 4, letterSpacing: '0.1em' }}>BOARD POZISYONLARI</div>
                          <BoardPlacementMap placementMap={comp.placementMap} />
                          {comp.notes && (
                            <div style={{ fontSize: '9px', color: '#9ca3af', padding: '4px 8px', lineHeight: 1.4, borderTop: '1px solid #222', marginTop: 4, whiteSpace: 'pre-wrap', maxHeight: 60, overflowY: 'auto' }}>
                              {comp.notes}
                            </div>
                          )}
                        </div>
                      )}
                      </>
                    )}
                  </div>
                )})}
              </div>
            )
          })}
        </div>

        {/* ─── TFT Scouting Panel (only during game) ─── */}
        {tftPlayers.length > 0 && (
          <div style={{ borderTop: '1px solid #1a1a1a', background: 'rgba(0,0,0,0.7)', padding: '6px 8px' }}>
            <div style={{ fontSize: '9px', color: '#666', letterSpacing: '0.1em', marginBottom: '4px' }}>
              👁 OYUN DURUMU {gameRound && `— Round ${gameRound}`}
              {nextOpponent && <span style={{ color: '#e8a838', marginLeft: '8px' }}>⚔️ Rakip: {nextOpponent.summonerName}</span>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
              {tftPlayers.slice(0, 8).map(p => (
                <div key={p.summonerName}
                  style={{
                    fontSize: '9px', padding: '2px 5px', borderRadius: '3px',
                    background: nextOpponent?.summonerName === p.summonerName ? 'rgba(232,168,56,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${nextOpponent?.summonerName === p.summonerName ? '#8a6000' : '#222'}`,
                    color: p.deaths > 0 ? '#666' : '#ccc',
                    display: 'flex', alignItems: 'center', gap: '3px'
                  }}>
                  <span style={{ color: '#555', fontSize: '8px' }}>#{p.position}</span>
                  <span style={{ maxWidth: '55px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.summonerName}</span>
                  {p.kills > 0 && <span style={{ color: '#e85858', fontSize: '8px' }}>💀{p.kills}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="overlay-footer">
          <span>
            {gamePhase === 'None' ? 'Oyun bekleniyor' : `Faz: ${gamePhase}`}
            {gameRound && gamePhase !== 'None' && <span style={{ color: '#7c5cfc', marginLeft: '6px' }}>R{gameRound}</span>}
          </span>
          <div className="hotkey-hint">
            <kbd>⌥</kbd><kbd>Space</kbd> etkileşim
          </div>
        </div>

        {/* Interactive mode indicator */}
        {overlayInteractive && (
          <div className="interactive-indicator">
            🎯 Etkileşim Modu Aktif — ⌥Space ile kapat
          </div>
        )}

        {/* Toast notification */}
        {toastMessage && (
          <div className="toast-notification animate-toast">
            {toastMessage}
          </div>
        )}
      </div>
    </div>
  )
}
