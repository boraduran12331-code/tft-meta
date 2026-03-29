import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import '../styles/control-panel.css'

interface OverlayState {
  isVisible: boolean
  isInteractive: boolean
}

interface HotkeyState {
  interactKey: string
  visibilityKey: string
}

// Modifier keys → display label
const MOD_LABELS: Record<string, string> = {
  'Alt': '⌥',
  'Ctrl': '⌃',
  'Shift': '⇧',
  'Meta': '⌘',
}

function formatHotkey(key: string): string {
  return key
    .split('+')
    .map(part => MOD_LABELS[part] ?? part)
    .join(' + ')
}

export function ControlPanel() {
  const {
    lcuConnected,
    gamePhase,
    overlayOpacity,
    setOverlayOpacity,
  } = useAppStore()

  const [overlayState, setOverlayState] = useState<OverlayState>({
    isVisible: false,
    isInteractive: false,
  })
  const [hotkeys, setHotkeys] = useState<HotkeyState>({
    interactKey: 'Alt+Space',
    visibilityKey: 'Alt+H',
  })

  // Hotkey editing
  const [editingKey, setEditingKey] = useState<'interact' | 'visibility' | null>(null)
  const [listeningKeys, setListeningKeys] = useState<string[]>([])
  const [hotkeyError, setHotkeyError] = useState<string | null>(null)
  const captureRef = useRef<HTMLDivElement>(null)

  // ─── Load initial state ───────────────────────────────────
  useEffect(() => {
    ;(async () => {
      if (!window.electronAPI) return
      try {
        const state = await window.electronAPI.overlay.getState()
        if (state) setOverlayState({ isVisible: state.isVisible, isInteractive: state.isInteractive })
        const keys = await window.electronAPI.overlay.getHotkeys()
        if (keys) setHotkeys(keys)
      } catch {}
    })()
  }, [])

  // ─── Subscribe to overlay state changes ───────────────────
  useEffect(() => {
    if (!window.electronAPI) return

    const unsubState = window.electronAPI.overlay.onStateChanged((s) => {
      setOverlayState({ isVisible: s.isVisible, isInteractive: s.isInteractive })
    })
    const unsubKeys = window.electronAPI.overlay.onHotkeysChanged((k) => {
      setHotkeys(k)
    })

    return () => {
      unsubState()
      unsubKeys()
    }
  }, [])

  // ─── Hotkey capture ───────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!editingKey) return
    e.preventDefault()
    e.stopPropagation()

    const special: Record<string, string> = {
      ' ': 'Space',
      'Escape': 'Escape',
      'Enter': 'Return',
    }

    const keyName = special[e.key] ?? e.key
    const mods: string[] = []
    if (e.altKey) mods.push('Alt')
    if (e.ctrlKey) mods.push('Ctrl')
    if (e.shiftKey) mods.push('Shift')
    if (e.metaKey) mods.push('Meta')

    // Cancel with Escape
    if (keyName === 'Escape' && mods.length === 0) {
      setEditingKey(null)
      setListeningKeys([])
      return
    }

    // Only modifier pressed — still composing
    if (['Alt', 'Control', 'Shift', 'Meta'].includes(e.key)) {
      setListeningKeys(mods)
      return
    }

    const combo = [...mods, keyName].join('+')
    setListeningKeys(mods)
    commitHotkey(combo)
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

    if (editingKey === 'interact') {
      result = await window.electronAPI?.overlay.setInteractKey(combo)
    } else if (editingKey === 'visibility') {
      result = await window.electronAPI?.overlay.setVisibilityKey(combo)
    }

    setEditingKey(null)
    setListeningKeys([])

    if (result && !result.success) {
      setHotkeyError(result.error ?? 'Tuş atanamadı')
    }
  }

  // ─── Overlay Controls ─────────────────────────────────────
  const handleToggleVisibility = () => {
    window.electronAPI?.overlay.toggleVisibilityNow()
  }

  const handleToggleInteractive = () => {
    window.electronAPI?.overlay.toggleInteractiveNow()
  }

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    setOverlayOpacity(val)
    window.electronAPI?.overlay.setOpacity(val)
  }

  const startEditingKey = (type: 'interact' | 'visibility') => {
    setHotkeyError(null)
    setListeningKeys([])
    setEditingKey(type)
  }

  // ─── Render ───────────────────────────────────────────────
  const { isVisible, isInteractive } = overlayState

  return (
    <div className="control-root">
      {/* Title bar drag zone */}
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
        <div className="hero-version">v0.1.0</div>
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
            <span className="status-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.5 }}>
                <path d="M8 1L10 5.5L15 6.2L11.5 9.5L12.4 14.5L8 12L3.6 14.5L4.5 9.5L1 6.2L6 5.5L8 1Z" fill="currentColor" />
              </svg>
              Faz
            </span>
          </div>
          <span className="status-value">{gamePhase === 'None' ? 'Oyun dışı' : gamePhase}</span>
        </div>
      </div>

      {/* ── Overlay Kontrolleri ── */}
      <div className="control-section">
        <div className="section-label">Overlay Kontrol</div>

        {/* Show / Hide / Interactive buttons */}
        <div className="overlay-btn-row">
          <button
            className={`overlay-action-btn ${isVisible ? 'active' : ''}`}
            onClick={handleToggleVisibility}
            title={isVisible ? 'Overlay gizle' : 'Overlay göster'}
          >
            <span className="btn-icon">{isVisible ? '👁' : '🙈'}</span>
            <span>{isVisible ? 'Gizle' : 'Göster'}</span>
          </button>

          <button
            className={`overlay-action-btn ${isInteractive ? 'interactive-active' : ''}`}
            onClick={handleToggleInteractive}
            title={isInteractive ? 'Tıklama-geçirgen modunu etkinleştir' : 'Etkileşim modunu etkinleştir'}
          >
            <span className="btn-icon">{isInteractive ? '🎯' : '👻'}</span>
            <span>{isInteractive ? 'Etkileşim' : 'Geçirgen'}</span>
          </button>
        </div>
      </div>

      {/* ── Opaklık ── */}
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
            onChange={handleOpacityChange}
            className="opacity-slider"
          />
        </div>
      </div>

      {/* ── Tuş Atamaları ── */}
      <div className="control-section">
        <div className="section-label">Kısayol Tuşları</div>

        {hotkeyError && (
          <div className="hotkey-error">⚠ {hotkeyError}</div>
        )}

        {/* Interact hotkey */}
        <div className="glass-card control-item hotkey-item">
          <div className="control-item-row">
            <span className="control-item-label">Etkileşim Modu</span>
            {editingKey === 'interact' ? (
              <div
                ref={captureRef}
                className="hotkey-capture"
                tabIndex={0}
              >
                {listeningKeys.length > 0
                  ? listeningKeys.map(k => MOD_LABELS[k] ?? k).join(' + ') + ' + ...'
                  : 'Tuşa bas… (Esc = iptal)'}
              </div>
            ) : (
              <button
                className="hotkey-badge-btn"
                onClick={() => startEditingKey('interact')}
                title="Tıkla ve yeni tuş ata"
              >
                {formatHotkey(hotkeys.interactKey)}
                <span className="edit-icon">✎</span>
              </button>
            )}
          </div>
        </div>

        {/* Visibility hotkey */}
        <div className="glass-card control-item hotkey-item">
          <div className="control-item-row">
            <span className="control-item-label">Gizle / Göster</span>
            {editingKey === 'visibility' ? (
              <div
                ref={captureRef}
                className="hotkey-capture"
                tabIndex={0}
              >
                {listeningKeys.length > 0
                  ? listeningKeys.map(k => MOD_LABELS[k] ?? k).join(' + ') + ' + ...'
                  : 'Tuşa bas… (Esc = iptal)'}
              </div>
            ) : (
              <button
                className="hotkey-badge-btn"
                onClick={() => startEditingKey('visibility')}
                title="Tıkla ve yeni tuş ata"
              >
                {formatHotkey(hotkeys.visibilityKey)}
                <span className="edit-icon">✎</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="control-footer">
        <span>Antigravity AI © 2026</span>
        <span className="footer-dot">·</span>
        <span>TFT Set 16: Lore &amp; Legends</span>
      </div>
    </div>
  )
}
