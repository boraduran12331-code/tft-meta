import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import '../styles/control-panel.css'

interface OverlayState { isVisible: boolean; isInteractive: boolean }
interface HotkeyState { interactKey: string; visibilityKey: string }

const MOD_LABELS: Record<string, string> = {
  'Alt': '⌥', 'Ctrl': '⌃', 'Shift': '⇧', 'Meta': '⌘',
}

function formatHotkey(key: string): string {
  return key.split('+').map(p => MOD_LABELS[p] ?? p).join(' + ')
}

const SUPPORTED_SETS = [
  { key: 'TFTSet16', label: 'Set 16 — Lore & Legends' },
  { key: 'TFTSet4_Act2', label: 'Set 4.5 — Revival' },
]

const REGIONS = ['EUW', 'NA', 'KR', 'EUNE', 'BR', 'JP', 'LAN', 'LAS', 'OCE', 'TR', 'RU']

export function ControlPanel() {
  const {
    lcuConnected,
    gamePhase,
    overlayOpacity,
    activeSetKey,
    debugMode,
    riotApiKey,
    riotRegion,
    setOverlayOpacity,
    setActiveSetKey,
    setDebugMode,
    setRiotApiKey,
    setRiotRegion,
  } = useAppStore()

  const [overlayState, setOverlayState] = useState<OverlayState>({ isVisible: false, isInteractive: false })
  const [hotkeys, setHotkeys] = useState<HotkeyState>({ interactKey: 'Alt+Space', visibilityKey: 'Alt+H' })
  const [editingKey, setEditingKey] = useState<'interact' | 'visibility' | null>(null)
  const [listeningKeys, setListeningKeys] = useState<string[]>([])
  const [hotkeyError, setHotkeyError] = useState<string | null>(null)
  const captureRef = useRef<HTMLDivElement>(null)

  // Riot API key
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState(riotRegion || 'EUW')

  // Load initial state
  useEffect(() => {
    ;(async () => {
      if (!window.electronAPI) return
      try {
        const state = await window.electronAPI.overlay.getState()
        if (state) setOverlayState({ isVisible: state.isVisible, isInteractive: state.isInteractive })
        const keys = await window.electronAPI.overlay.getHotkeys()
        if (keys) setHotkeys(keys)
        const key = await window.electronAPI.riotApi?.getKey()
        if (key) {
          setApiKeyInput(key)
          setRiotApiKey(key)
        }
        const region = await window.electronAPI.riotApi?.getRegion()
        if (region) {
          setSelectedRegion(region)
          setRiotRegion(region)
        }
      } catch { /* ignore */ }
    })()
  }, [setRiotApiKey, setRiotRegion])

  // Subscribe to overlay state changes
  useEffect(() => {
    if (!window.electronAPI) return
    const unsubState = window.electronAPI.overlay.onStateChanged((s) => {
      setOverlayState({ isVisible: s.isVisible, isInteractive: s.isInteractive })
    })
    const unsubKeys = window.electronAPI.overlay.onHotkeysChanged((k) => setHotkeys(k))
    return () => { unsubState(); unsubKeys() }
  }, [])

  // Hotkey capture
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!editingKey) return
    e.preventDefault()
    e.stopPropagation()
    const special: Record<string, string> = { ' ': 'Space', 'Escape': 'Escape', 'Enter': 'Return' }
    const keyName = special[e.key] ?? e.key
    const mods: string[] = []
    if (e.altKey) mods.push('Alt')
    if (e.ctrlKey) mods.push('Ctrl')
    if (e.shiftKey) mods.push('Shift')
    if (e.metaKey) mods.push('Meta')
    if (keyName === 'Escape' && mods.length === 0) { setEditingKey(null); setListeningKeys([]); return }
    if (['Alt', 'Control', 'Shift', 'Meta'].includes(e.key)) { setListeningKeys(mods); return }
    commitHotkey([...mods, keyName].join('+'))
  }, [editingKey])

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (!editingKey) return
    const mods: string[] = []
    if (e.altKey) mods.push('Alt')
    if (e.ctrlKey) mods.push('Ctrl')
    if (e.shiftKey) mods.push('Shift')
    if (e.metaKey) mods.push('Meta')
    setListeningKeys(mods)
  }, [editingKey])

  useEffect(() => {
    if (editingKey) {
      window.addEventListener('keydown', handleKeyDown, true)
      window.addEventListener('keyup', handleKeyUp, true)
      captureRef.current?.focus()
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
    }
  }, [editingKey, handleKeyDown, handleKeyUp])

  const commitHotkey = async (combo: string) => {
    setHotkeyError(null)
    let result: { success: boolean; error?: string } | undefined
    if (editingKey === 'interact') result = await window.electronAPI?.overlay.setInteractKey(combo)
    else if (editingKey === 'visibility') result = await window.electronAPI?.overlay.setVisibilityKey(combo)
    setEditingKey(null)
    setListeningKeys([])
    if (result && !result.success) setHotkeyError(result.error ?? 'Tuş atanamadı')
  }

  const handleSaveApiKey = async () => {
    await window.electronAPI?.riotApi?.setKey(apiKeyInput)
    setRiotApiKey(apiKeyInput)
    setApiKeySaved(true)
    setTimeout(() => setApiKeySaved(false), 2000)
  }

  const handleRegionChange = async (region: string) => {
    setSelectedRegion(region)
    await window.electronAPI?.riotApi?.setRegion(region)
    setRiotRegion(region)
  }

  const handleSetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setActiveSetKey(e.target.value)
  }

  const { isVisible, isInteractive } = overlayState

  return (
    <div className="control-root">
      <div className="titlebar-drag" />

      {/* Hero */}
      <div className="control-hero">
        <div className="hero-logo">
          <span className="hero-logo-icon">AG</span>
          <div>
            <h1 className="hero-title">Antigravity</h1>
            <p className="hero-subtitle">TFT Mac Companion</p>
          </div>
        </div>
        <div className="hero-version">v0.2.0</div>
      </div>

      {/* Status cards */}
      <div className="status-grid">
        <div className="glass-card status-card">
          <div className="status-card-header">
            <span className={`status-dot ${lcuConnected ? 'connected' : 'disconnected'}`} />
            <span className="status-label">League</span>
          </div>
          <span className="status-value">{lcuConnected ? 'Çalışıyor' : 'Algılanmadı'}</span>
        </div>
        <div className="glass-card status-card">
          <div className="status-card-header">
            <span className={`status-dot ${lcuConnected ? 'connected' : 'disconnected'}`} />
            <span className="status-label">LCU API</span>
          </div>
          <span className="status-value">{lcuConnected ? 'Bağlı' : 'Bağlantı yok'}</span>
        </div>
        <div className="glass-card status-card">
          <div className="status-card-header">
            <span className="status-label">Faz</span>
          </div>
          <span className="status-value">{gamePhase === 'None' ? 'Oyun dışı' : gamePhase}</span>
        </div>
      </div>

      {/* Overlay Controls */}
      <div className="control-section">
        <div className="section-label">Overlay Kontrol</div>
        <div className="overlay-btn-row">
          <button
            className={`overlay-action-btn ${isVisible ? 'active' : ''}`}
            onClick={() => window.electronAPI?.overlay.toggleVisibilityNow()}
            title={isVisible ? 'Overlay gizle' : 'Overlay göster'}
          >
            <span className="btn-icon">{isVisible ? '👁' : '🙈'}</span>
            <span>{isVisible ? 'Gizle' : 'Göster'}</span>
          </button>
          <button
            className={`overlay-action-btn ${isInteractive ? 'interactive-active' : ''}`}
            onClick={() => window.electronAPI?.overlay.toggleInteractiveNow()}
            title={isInteractive ? 'Geçirgen moda geç' : 'Etkileşim modunu aç'}
          >
            <span className="btn-icon">{isInteractive ? '🎯' : '👻'}</span>
            <span>{isInteractive ? 'Etkileşim' : 'Geçirgen'}</span>
          </button>
          <button
            className={`overlay-action-btn ${debugMode ? 'active' : ''}`}
            onClick={() => setDebugMode(!debugMode)}
            title="Debug modunu aç/kapat"
          >
            <span className="btn-icon">🐛</span>
            <span>Debug</span>
          </button>
        </div>
      </div>

      {/* TFT Set Selector */}
      <div className="control-section">
        <div className="section-label">Aktif Set</div>
        <div className="glass-card control-item">
          <select
            value={activeSetKey}
            onChange={handleSetChange}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 7,
              color: '#f0f0f4',
              fontSize: 13,
              outline: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {SUPPORTED_SETS.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Opacity */}
      <div className="control-section">
        <div className="section-label">Görünüm</div>
        <div className="glass-card control-item">
          <div className="control-item-row">
            <span className="control-item-label">Overlay Opaklığı</span>
            <span className="control-item-value">{Math.round(overlayOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.3"
            max="1"
            step="0.05"
            value={overlayOpacity}
            onChange={e => {
              const val = parseFloat(e.target.value)
              setOverlayOpacity(val)
              window.electronAPI?.overlay.setOpacity(val)
            }}
            className="opacity-slider"
          />
        </div>
      </div>

      {/* Hotkeys */}
      <div className="control-section">
        <div className="section-label">Kısayol Tuşları</div>
        {hotkeyError && <div className="hotkey-error">⚠ {hotkeyError}</div>}
        {(['interact', 'visibility'] as const).map(type => (
          <div key={type} className="glass-card control-item hotkey-item">
            <div className="control-item-row">
              <span className="control-item-label">{type === 'interact' ? 'Etkileşim Modu' : 'Gizle / Göster'}</span>
              {editingKey === type ? (
                <div ref={captureRef} className="hotkey-capture" tabIndex={0}>
                  {listeningKeys.length > 0
                    ? listeningKeys.map(k => MOD_LABELS[k] ?? k).join(' + ') + ' + …'
                    : 'Tuşa bas… (Esc = iptal)'}
                </div>
              ) : (
                <button
                  className="hotkey-badge-btn"
                  onClick={() => { setHotkeyError(null); setListeningKeys([]); setEditingKey(type) }}
                >
                  {formatHotkey(type === 'interact' ? hotkeys.interactKey : hotkeys.visibilityKey)}
                  <span className="edit-icon">✎</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Riot API Settings */}
      <div className="control-section">
        <div className="section-label">Riot API (Rakip Scouting)</div>
        <div className="glass-card control-item" style={{ gap: 8, display: 'flex', flexDirection: 'column' }}>
          {/* Region */}
          <div className="control-item-row">
            <span className="control-item-label">Sunucu</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {REGIONS.map(r => (
                <button
                  key={r}
                  onClick={() => handleRegionChange(r)}
                  style={{
                    fontSize: 10,
                    padding: '2px 7px',
                    borderRadius: 4,
                    border: '1px solid',
                    cursor: 'pointer',
                    background: selectedRegion === r ? 'rgba(124,92,252,0.2)' : 'rgba(255,255,255,0.04)',
                    borderColor: selectedRegion === r ? 'rgba(124,92,252,0.5)' : 'rgba(255,255,255,0.1)',
                    color: selectedRegion === r ? '#e2d9ff' : '#9fa3b0',
                    fontWeight: selectedRegion === r ? 700 : 400,
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {/* API Key input */}
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type={showApiKey ? 'text' : 'password'}
                placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 30px 7px 10px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  color: '#f0f0f4',
                  fontSize: 11,
                  outline: 'none',
                  fontFamily: 'monospace',
                }}
              />
              <button
                onClick={() => setShowApiKey(v => !v)}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#63666f',
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: 0,
                }}
              >
                {showApiKey ? '🙈' : '👁'}
              </button>
            </div>
            <button
              onClick={handleSaveApiKey}
              style={{
                background: apiKeySaved ? 'rgba(52,211,153,0.2)' : 'rgba(124,92,252,0.2)',
                border: `1px solid ${apiKeySaved ? 'rgba(52,211,153,0.4)' : 'rgba(124,92,252,0.4)'}`,
                borderRadius: 6,
                color: apiKeySaved ? '#34d399' : '#e2d9ff',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                padding: '0 12px',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {apiKeySaved ? '✅ Kaydedildi' : 'Kaydet'}
            </button>
          </div>
          <div style={{ fontSize: 10, color: '#45484f', lineHeight: 1.5 }}>
            Anahtarınız şifreli olarak saklanır. developer.riotgames.com adresinden edinebilirsiniz.
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="control-footer">
        <span>Antigravity AI © 2026</span>
        <span className="footer-dot">·</span>
        <span>{SUPPORTED_SETS.find(s => s.key === activeSetKey)?.label ?? activeSetKey}</span>
      </div>
    </div>
  )
}
