import React, { useEffect, useRef, useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────
export type NotifType = 'stage' | 'opponent' | 'item' | 'augment' | 'econ' | 'position' | 'shop' | 'carousel' | 'level' | 'clipboard'
export type Likelihood = 'confirmed' | 'high' | 'medium' | 'low' | 'recent'

export interface PossibleOpponent {
  name: string
  likelihood: Likelihood
  isRecent: boolean
  kills: number
  position: number
  traits?: string[]
}

export interface OpponentPrediction {
  candidates: PossibleOpponent[]
  confidence: 'confirmed' | 'high' | 'low' | 'uncertain'
  confirmedName: string | null
  round: string
}

export interface LevelRollDecision {
  action: 'level' | 'roll' | 'econ' | 'hold'
  emoji: string
  title: string
  reason: string
  urgency: 'low' | 'medium' | 'high' | 'critical'
}

export interface ItemSuggestion {
  itemName: string
  components: [string, string]
  targetUnit: string
  reason: string
}

export interface ClipboardCompResult {
  comp: { id: string; name: string; traits: string[]; keyUnits: string[]; itemManifesto: string; levelTiming: string }
  suggestions: ItemSuggestion[]
  levelAdvice: string
}

export interface TFTNotification {
  id: string
  type: NotifType
  emoji: string
  title: string
  body: string
  ttl?: number
  priority?: 'low' | 'normal' | 'high'
  opponentPrediction?: OpponentPrediction
  levelDecision?: LevelRollDecision
  clipboardComp?: ClipboardCompResult
}

interface TFTLiveState {
  round?: string
  gold?: number | null
  level?: number | null
  hp?: number | null
  streak?: number | null
  xp?: number | null
  xpToNextLevel?: number | null
  localPlayer?: string | null
  nextOpponent?: string | null
  nextOpponentPosition?: number | null
  players?: Array<{ summonerName: string; position: number; kills: number; isAlive: boolean }>
}

// ─── Theme ────────────────────────────────────────────────────────
const THEME: Record<NotifType, { border: string; glow: string; accent: string; bg: string; label: string }> = {
  stage:     { border: '#7c5cfc', glow: 'rgba(124,92,252,0.45)', accent: '#c4b0ff', bg: 'rgba(124,92,252,0.10)', label: 'STRATEJİ' },
  opponent:  { border: '#ff4040', glow: 'rgba(255,64,64,0.48)',  accent: '#ff9090', bg: 'rgba(255,64,64,0.10)',  label: 'RAKİP' },
  item:      { border: '#f5a623', glow: 'rgba(245,166,35,0.45)', accent: '#ffd070', bg: 'rgba(245,166,35,0.10)', label: 'İTEM' },
  shop:      { border: '#34d399', glow: 'rgba(52,211,153,0.4)',  accent: '#a7f3d0', bg: 'rgba(52,211,153,0.09)', label: 'MAĞAZA' },
  augment:   { border: '#00d4ff', glow: 'rgba(0,212,255,0.42)', accent: '#80eaff', bg: 'rgba(0,212,255,0.09)', label: 'AUGMENT' },
  econ:      { border: '#22c55e', glow: 'rgba(34,197,94,0.42)', accent: '#86efac', bg: 'rgba(34,197,94,0.09)', label: 'EKON' },
  position:  { border: '#f97316', glow: 'rgba(249,115,22,0.42)', accent: '#fdba74', bg: 'rgba(249,115,22,0.09)', label: 'POZİSYON' },
  carousel:  { border: '#c084fc', glow: 'rgba(192,132,252,0.42)', accent: '#e9d5ff', bg: 'rgba(192,132,252,0.09)', label: 'CAROUSEL' },
  level:     { border: '#38bdf8', glow: 'rgba(56,189,248,0.48)', accent: '#7dd3fc', bg: 'rgba(56,189,248,0.10)', label: 'LEVEL/ROLL' },
  clipboard: { border: '#a78bfa', glow: 'rgba(167,139,250,0.48)', accent: '#ddd6fe', bg: 'rgba(167,139,250,0.10)', label: 'KOPİ COMP' },
}

// ─── Likelihood config ────────────────────────────────────────────
const LIKELIHOOD_CFG: Record<Likelihood, { color: string; dot: string; label: string; opacity: number; barPct: number }> = {
  confirmed: { color: '#ff4040', dot: '🔴', label: 'KESİN',  opacity: 1,    barPct: 100 },
  high:      { color: '#ff6b35', dot: '🟠', label: 'YÜKSEK', opacity: 1,    barPct: 80  },
  medium:    { color: '#f5c518', dot: '🟡', label: 'ORTA',   opacity: 0.85, barPct: 55  },
  low:       { color: '#60a5fa', dot: '🔵', label: 'DÜŞÜK',  opacity: 0.65, barPct: 30  },
  recent:    { color: '#6b7280', dot: '⬛', label: 'SON',    opacity: 0.4,  barPct: 10  },
}

// ─── Advanced Opponent Panel ─────────────────────────────────────
function AdvancedOpponentPanel({ prediction }: { prediction: OpponentPrediction }) {
  const all = prediction.candidates.slice(0, 6)
  if (all.length === 0) return null
  const confidenceLabel = {
    confirmed: '✅ LCU Doğrulandı',
    high:      '🎯 Güvenilir Tahmin',
    low:       '~ Zayıf Tahmin',
    uncertain: '❓ Belirsiz',
  }[prediction.confidence]

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,64,64,0.12)', paddingTop: 7 }}>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(180,160,210,0.55)', marginBottom: 5 }}>
        {confidenceLabel} · {prediction.round}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {all.map(opp => {
          const cfg = LIKELIHOOD_CFG[opp.likelihood]
          return (
            <div key={opp.name} style={{ opacity: cfg.opacity }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <span style={{ fontSize: 7 }}>{cfg.dot}</span>
                <span style={{
                  fontSize: 10, fontWeight: opp.isRecent ? 400 : 600, flex: 1,
                  color: opp.isRecent ? 'rgba(160,160,180,0.5)' : cfg.color,
                  textDecoration: opp.isRecent ? 'line-through' : 'none',
                }}>{opp.name}</span>
                <span style={{ fontSize: 8, color: 'rgba(180,170,200,0.45)', letterSpacing: '0.04em' }}>{cfg.label}</span>
                {opp.kills > 0 && <span style={{ fontSize: 8, color: 'rgba(255,160,100,0.65)' }}>⚔{opp.kills}</span>}
                {opp.traits && opp.traits.length > 0 && (
                  <span style={{ fontSize: 7, color: 'rgba(160,180,220,0.55)' }}>{opp.traits.join('·')}</span>
                )}
              </div>
              {/* Probability bar */}
              <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden', marginLeft: 12 }}>
                <div style={{
                  height: '100%', borderRadius: 1,
                  background: `linear-gradient(90deg, ${cfg.color}, transparent)`,
                  width: `${cfg.barPct}%`,
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Level/Roll Decision Panel ─────────────────────────────────
const URGENCY_COLOR: Record<string, string> = {
  critical: '#ff4040',
  high:     '#f97316',
  medium:   '#f5c518',
  low:      '#34d399',
}

function LevelRollDecisionPanel({ decision }: { decision: LevelRollDecision }) {
  const color = URGENCY_COLOR[decision.urgency] ?? '#7c5cfc'
  const actionLabel = {
    level: '⬆️ LEVEL YUKARI',
    roll:  '🎰 ROLL YAP',
    econ:  '💰 EKON TUT',
    hold:  '⏳ BEKLE',
  }[decision.action]

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid rgba(56,189,248,0.12)', paddingTop: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          padding: '3px 10px', borderRadius: 6,
          background: `rgba(${color === '#ff4040' ? '255,64,64' : color === '#f97316' ? '249,115,22' : color === '#f5c518' ? '245,197,24' : '52,211,153'},0.15)`,
          border: `1px solid ${color}44`,
          fontSize: 11, fontWeight: 800, color, letterSpacing: '0.05em',
          ...(decision.urgency === 'critical' ? {
            animation: 'criticalPulse 1s ease-in-out infinite',
          } : {}),
        }}>
          {actionLabel}
        </div>
        <span style={{ fontSize: 9, color: 'rgba(200,195,220,0.6)', flex: 1, lineHeight: 1.3 }}>
          {decision.reason}
        </span>
      </div>
    </div>
  )
}

// ─── Clipboard Comp Panel ─────────────────────────────────────
function ClipboardCompPanel({ result }: { result: ClipboardCompResult }) {
  const { comp, suggestions, levelAdvice } = result
  return (
    <div style={{ marginTop: 8, borderTop: '1px solid rgba(167,139,250,0.12)', paddingTop: 7 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 5 }}>
        {comp.traits.slice(0, 4).map(t => (
          <span key={t} style={{
            fontSize: 8, fontWeight: 600, color: '#a78bfa',
            background: 'rgba(167,139,250,0.12)', borderRadius: 3, padding: '1px 5px',
          }}>{t}</span>
        ))}
      </div>
      {suggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
          {suggestions.slice(0, 2).map(s => (
            <div key={s.itemName} style={{ fontSize: 9, color: 'rgba(255,208,112,0.85)' }}>
              ⚗️ {s.components[0]} + {s.components[1]} → <strong>{s.itemName}</strong> → {s.targetUnit}
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 8, color: 'rgba(190,185,220,0.55)', fontStyle: 'italic' }}>⏱ {levelAdvice}</div>
    </div>
  )
}

// ─── Notification card ────────────────────────────────────────────
function NotifCard({ notif, onDismiss }: { notif: TFTNotification; onDismiss: () => void }) {
  const [phase, setPhase] = useState<'in' | 'show' | 'out'>('in')
  const th = THEME[notif.type] ?? THEME.stage
  const ttl = notif.ttl ?? 8000

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('show'), 20)
    const t2 = setTimeout(() => setPhase('out'), ttl - 400)
    const t3 = setTimeout(onDismiss, ttl)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  const isPriority = notif.priority === 'high' || notif.levelDecision?.urgency === 'critical'

  return (
    <div
      style={{
        ...({ WebkitAppRegion: 'no-drag' } as any),
        position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 12px 10px 15px', borderRadius: 10,
        // ── Glassmorphism card ──────────────────────────────────
        background: `rgba(15, 12, 28, 0.7)`,
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        border: `1px solid rgba(255, 255, 255, 0.08)`,
        boxShadow: `0 8px 32px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05)`,
        cursor: 'pointer',
        transition: 'opacity 0.3s ease, transform 0.4s cubic-bezier(0.34,1.4,0.64,1)',
        opacity: phase === 'show' ? 1 : 0,
        transform: `translateY(${phase === 'in' ? '-18px' : phase === 'out' ? '-10px' : '0'}) scale(${phase === 'show' ? 1 : 0.93})`,
        overflow: 'hidden',
      }}
      onClick={() => { setPhase('out'); setTimeout(onDismiss, 300) }}
    >
      {/* Left stripe */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: `linear-gradient(180deg, ${th.accent}, ${th.border})`,
        borderRadius: '10px 0 0 10px',
      }} />
      {/* Progress bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, height: 2, width: '100%',
        background: `linear-gradient(90deg, ${th.border}, ${th.accent})`,
        animation: `notifShrink ${ttl}ms linear forwards`,
        opacity: 0.6,
      }} />
      {/* Priority glow pulse */}
      {isPriority && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 10,
          background: `radial-gradient(ellipse at top, ${th.glow} 0%, transparent 60%)`,
          animation: 'notifGlowPulse 2s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}
      {/* Emoji */}
      <span style={{ fontSize: 20, lineHeight: 1.2, flexShrink: 0, marginLeft: 4, zIndex: 1 }}>{notif.emoji}</span>
      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
        <div style={{ marginBottom: 2 }}>
          <span style={{
            fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', color: th.accent,
            textShadow: `0 0 8px ${th.glow}`,
          }}>
            {THEME[notif.type]?.label ?? notif.type.toUpperCase()}
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f0f0f5', lineHeight: 1.35 }}>{notif.title}</div>
        {notif.body && (
          <div style={{ fontSize: 11, color: 'rgba(205,200,225,0.78)', marginTop: 3, lineHeight: 1.45 }}>{notif.body}</div>
        )}
        {/* Extended panels */}
        {notif.opponentPrediction && notif.type === 'opponent' && (
          <AdvancedOpponentPanel prediction={notif.opponentPrediction} />
        )}
        {notif.levelDecision && (notif.type === 'level' || notif.type === 'econ') && (
          <LevelRollDecisionPanel decision={notif.levelDecision} />
        )}
        {notif.clipboardComp && notif.type === 'clipboard' && (
          <ClipboardCompPanel result={notif.clipboardComp} />
        )}
      </div>
      {/* Dismiss */}
      <button
        style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.18)',
          cursor: 'pointer', fontSize: 13, padding: '0 2px', flexShrink: 0,
          lineHeight: 1, borderRadius: 4, transition: 'color 0.15s', zIndex: 1,
        }}
        onMouseEnter={e => { (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.7)' }}
        onMouseLeave={e => { (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.18)' }}
        onClick={e => { e.stopPropagation(); setPhase('out'); setTimeout(onDismiss, 280) }}
      >✕</button>
    </div>
  )
}

// ─── Mini stat components ──────────────────────────────────────────
function HPBar({ hp }: { hp: number }) {
  const pct = Math.max(0, Math.min(100, hp))
  const color = hp <= 20 ? '#ef4444' : hp <= 40 ? '#f97316' : '#22c55e'
  const isCritical = hp <= 20
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.5s',
          ...(isCritical ? { animation: 'hpPulse 1s ease-in-out infinite' } : {}),
        }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{hp}</span>
    </div>
  )
}

function XPBar({ xp, xpToNext }: { xp: number; xpToNext: number }) {
  const pct = xpToNext > 0 ? Math.round((xp / xpToNext) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 36, height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #60a5fa, #818cf8)', borderRadius: 2, transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontSize: 9, color: '#93c5fd' }}>{pct}%</span>
    </div>
  )
}

function StreakBadge({ streak }: { streak: number }) {
  const win = streak > 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      padding: '1px 5px', borderRadius: 4,
      background: win ? 'rgba(52,211,153,0.12)' : 'rgba(239,68,68,0.12)',
      border: `1px solid ${win ? 'rgba(52,211,153,0.25)' : 'rgba(239,68,68,0.25)'}`,
    }}>
      <span style={{ fontSize: 10 }}>{win ? '🔥' : '📉'}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: win ? '#34d399' : '#ef4444' }}>{Math.abs(streak)}</span>
    </div>
  )
}

function Pill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 3,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 5, padding: '2px 7px',
    }}>
      <span style={{ fontSize: 8, color: 'rgba(180,170,200,0.5)', letterSpacing: '0.07em' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{value}</span>
    </div>
  )
}

// ─── Level/Roll Pill for HUD strip ────────────────────────────────
function LevelRollHudPill({ decision }: { decision: { action: string; urgency: string } | null }) {
  if (!decision) return null
  const color = (URGENCY_COLOR as any)[decision.urgency] ?? '#7c5cfc'
  const label = { level: '⬆️ LVL', roll: '🎰 ROLL', econ: '💰 EKON', hold: '⏳' }[decision.action] ?? '⬆️'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 5,
      background: `rgba(${color === '#ff4040' ? '255,64,64' : color === '#f97316' ? '249,115,22' : color === '#f5c518' ? '245,197,24' : '52,211,153'},0.12)`,
      border: `1px solid ${color}33`,
      ...(decision.urgency === 'critical' ? { animation: 'hudDecisionPulse 1.5s ease-in-out infinite' } : {}),
    }}>
      <span style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: '0.06em' }}>{label}</span>
    </div>
  )
}

// ─── HUD button ───────────────────────────────────────────────────
function HudBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick} title={title}
      style={{
        background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
        cursor: 'pointer', fontSize: 12, padding: '3px 6px', borderRadius: 4,
        transition: 'color 0.15s, background 0.15s', lineHeight: 1,
      }}
      onMouseEnter={e => { const el = e.currentTarget; el.style.color = 'rgba(255,255,255,0.9)'; el.style.background = 'rgba(255,255,255,0.08)' }}
      onMouseLeave={e => { const el = e.currentTarget; el.style.color = 'rgba(255,255,255,0.3)'; el.style.background = 'transparent' }}
    >{children}</button>
  )
}

// ─── Main Component ───────────────────────────────────────────────
export default function NotificationBar() {
  const [notifs, setNotifs]       = useState<TFTNotification[]>([])
  const [game, setGame]           = useState<TFTLiveState>({})
  const [connected, setConnected] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [hidden, setHidden]       = useState(false)
  const [hudDecision, setHudDecision] = useState<{ action: string; urgency: string } | null>(null)
  const seenIds = useRef<Set<string>>(new Set())
  const api = (window as any).electronAPI

  // ── Push notification (dedup by id) ──────────────────────────
  const push = useCallback((n: TFTNotification) => {
    if (seenIds.current.has(n.id)) {
      setNotifs(prev => prev.map(e => e.id === n.id ? n : e))
      return
    }
    seenIds.current.add(n.id)
    setNotifs(prev => [n, ...prev].slice(0, 6))

    // Update HUD decision pill for level/econ type
    if (n.levelDecision) {
      setHudDecision({ action: n.levelDecision.action, urgency: n.levelDecision.urgency })
      setTimeout(() => setHudDecision(null), (n.ttl ?? 8000) + 2000)
    }
  }, [])

  const dismiss = (id: string) => setNotifs(prev => prev.filter(n => n.id !== id))

  // ── IPC: passthrough signal ───────────────────────────────────
  useEffect(() => {
    if (!api?.notif) return
    if (notifs.length === 0 && !minimized) api.notif.notifyEmpty?.()
    else api.notif.notifyActive?.()
  }, [notifs.length, minimized])

  // ── IPC: incoming notifications ───────────────────────────────
  useEffect(() => {
    if (!api?.notif?.onNotification) return
    return api.notif.onNotification((n: TFTNotification) => push(n))
  }, [push])

  // ── IPC: LCU connection ───────────────────────────────────────
  useEffect(() => {
    if (!api?.lcu) return
    const offC = api.lcu.onConnected(() => setConnected(true))
    const offD = api.lcu.onDisconnected(() => { setConnected(false); setGame({}) })
    api.lcu.getStatus?.().then((s: any) => setConnected(s?.connected ?? false)).catch(() => {})
    return () => { offC?.(); offD?.() }
  }, [])

  // ── IPC: TFT live state ───────────────────────────────────────
  useEffect(() => {
    if (!api?.livegame?.onTFTState) return
    return api.livegame.onTFTState((state: TFTLiveState) => {
      setGame(prev => ({
        ...prev,
        round:                state.round                ?? prev.round,
        gold:                 state.gold                 ?? prev.gold,
        level:                state.level                ?? prev.level,
        hp:                   state.hp                   ?? prev.hp,
        streak:               state.streak               ?? prev.streak,
        xp:                   state.xp                   ?? prev.xp,
        xpToNextLevel:        state.xpToNextLevel        ?? prev.xpToNextLevel,
        localPlayer:          state.localPlayer          ?? prev.localPlayer,
        nextOpponent:         state.nextOpponent         ?? prev.nextOpponent,
        nextOpponentPosition: state.nextOpponentPosition ?? prev.nextOpponentPosition,
        players:              state.players              ?? prev.players,
      }))
    })
  }, [])

  // ── Demo notifications ────────────────────────────────────────
  useEffect(() => {
    const demos: TFTNotification[] = [
      {
        id: 'd0', type: 'stage', emoji: '🟢',
        title: 'Antigravity Hazır',
        body: 'Gerçek zamanlı bildirim sistemi aktif ✓',
        ttl: 6000,
      },
      {
        id: 'd1', type: 'level', emoji: '⬆️',
        title: 'Level 8\'e Yüksel!',
        body: 'Fast 8 comp için 4-cost unitler açılıyor',
        ttl: 10000,
        levelDecision: {
          action: 'level', emoji: '⬆️',
          title: 'Level 8\'e Yüksel!',
          reason: 'Arcana Carry: 4. aşamada Level 8 — 4-cost unit\'ler açılıyor',
          urgency: 'high',
        },
      },
      {
        id: 'd2', type: 'clipboard', emoji: '📋',
        title: 'Kopyalanan: Arcana Carry',
        body: 'Rabadon\'s: NLR + NLR → Lux\'e ver',
        ttl: 14000,
        clipboardComp: {
          comp: {
            id: 'arcana-carry', name: 'Arcana Carry',
            traits: ['arcana','mage'], keyUnits: ['Lux','Malzahar','Xerath'],
            itemManifesto: "Lux/Xerath'a Rabadon's, Archangel's, Blue Buff",
            levelTiming: "3-1'de 6 birim, 4-1'de Level 7, 4-2'de 50g roll",
          },
          suggestions: [
            { itemName: "Rabadon's Deathcap", components: ['Needlessly Large Rod','Needlessly Large Rod'], targetUnit: 'Lux', reason: 'Arcana Carry: Lux\'e yerleştir' },
            { itemName: 'Blue Buff', components: ['Tear of the Goddess','Tear of the Goddess'], targetUnit: 'Xerath', reason: 'Arcana Carry: Xerath\'e yerleştir' },
          ],
          levelAdvice: "4-2'de full roll, Level 8 hedef",
        },
      },
      {
        id: 'd3', type: 'econ', emoji: '💰',
        title: '50g Faiz Noktası',
        body: '50g\'de kal — +5 altın faiz, roll bekliyebilir',
        ttl: 8000,
        levelDecision: {
          action: 'econ', emoji: '💰', title: '50g Faiz Noktası',
          reason: '50g\'de kal — +5 altın faiz, level/roll bekliyebilir',
          urgency: 'medium',
        },
      },
      {
        id: 'd4', type: 'opponent', emoji: '🎯',
        title: 'Olası Rakipler — Tur 3-2',
        body: '~ Zayıf Tahmin',
        ttl: 12000,
        opponentPrediction: {
          candidates: [
            { name: 'Oyuncu A', likelihood: 'high',   isRecent: false, kills: 3, position: 1, traits: ['Bruiser', 'Guardian'] },
            { name: 'Oyuncu B', likelihood: 'medium', isRecent: false, kills: 1, position: 2, traits: ['Mage'] },
            { name: 'Oyuncu C', likelihood: 'recent', isRecent: true,  kills: 2, position: 3 },
            { name: 'Oyuncu D', likelihood: 'low',    isRecent: false, kills: 0, position: 4 },
          ],
          confidence: 'low', confirmedName: null, round: '3-2',
        },
      },
      {
        id: 'd5', type: 'item', emoji: '⚗️',
        title: "Öğe Önerisi: Rabadon's Deathcap",
        body: 'Needlessly Large Rod + Needlessly Large Rod → Lux\'e ver',
        ttl: 14000, priority: 'high',
      },
      {
        id: 'd6', type: 'augment', emoji: '💎',
        title: 'Augment 1 — Seç!',
        body: 'Öncelik: Arcana Crest › Spellslinger',
        ttl: 20000, priority: 'high',
      },
    ]
    let idx = 0
    const fire = () => {
      const base = demos[idx % demos.length]!
      push({ ...base, id: `demo-${idx}-${Date.now()}` })
      idx++
    }
    const t0 = setTimeout(fire, 800)
    const iv = setInterval(fire, 9000)
    return () => { clearTimeout(t0); clearInterval(iv) }
  }, [push])

  // ── Dynamic mouse passthrough ─────────────────────────────────
  useEffect(() => {
    let last = false
    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const interactive = !!el && el !== document.documentElement && el !== document.body &&
        (el as HTMLElement).style?.pointerEvents !== 'none'
      if (interactive === last) return
      last = interactive
      if (interactive) api?.notif?.notifyActive?.()
      else api?.notif?.notifyEmpty?.()
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  const hasGame = connected && (game.round || game.gold != null || game.hp != null)

  // ── CSS animations ────────────────────────────────────────────
  const styles = `
    @keyframes notifShrink { from { width: 100%; } to { width: 0%; } }
    @keyframes notifGlowPulse { 0%,100% { opacity: 0.15; } 50% { opacity: 0.35; } }
    @keyframes hpPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    @keyframes criticalPulse { 0%,100% { box-shadow: none; } 50% { box-shadow: 0 0 12px rgba(255,64,64,0.6); } }
    @keyframes hudDecisionPulse { 0%,100% { opacity: 0.8; } 50% { opacity: 1; transform: scale(1.03); } }
    @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    * { box-sizing: border-box; }
    ::-webkit-scrollbar { display: none; }
  `

  // ── HIDDEN state (collapsed pill) ────────────────────────────
  if (hidden) {
    return (
      <div
        style={{
          ...({ WebkitAppRegion: 'no-drag' } as any),
          position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(10,6,22,0.82)',
          backdropFilter: 'blur(20px) saturate(140%)',
          WebkitBackdropFilter: 'blur(20px) saturate(140%)',
          border: '1px solid rgba(124,92,252,0.28)',
          borderTop: 'none', borderRadius: '0 0 10px 10px',
          padding: '5px 16px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)', zIndex: 9999,
          fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
        }}
        onClick={() => setHidden(false)}
      >
        <style>{styles}</style>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: 'rgba(124,92,252,0.8)' }}>⬡ AG</span>
        {notifs.length > 0 && (
          <span style={{ background: '#ff4040', color: '#fff', borderRadius: 10, fontSize: 9, fontWeight: 700, padding: '1px 6px' }}>
            {notifs.length}
          </span>
        )}
        <span style={{ fontSize: 10, color: 'rgba(200,190,230,0.45)' }}>▼</span>
      </div>
    )
  }

  // ── FULL HUD ──────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      fontFamily: "'Inter', 'SF Pro Display', -apple-system, system-ui, sans-serif",
      userSelect: 'none',
    }}>
      <style>{styles}</style>

      {/* ═══ HUD strip ═══════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '5px 10px 5px 8px',
        // ── Glassmorphism HUD strip ──────────────────────────────
        background: 'rgba(15, 12, 28, 0.7)',
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
        minHeight: 34, position: 'relative',
      }}>

        {/* Drag area */}
        <div style={{
          ...({ WebkitAppRegion: 'drag' } as any),
          position: 'absolute', top: 0, left: 0, right: 110, bottom: 0,
          cursor: 'grab',
        }} />

        {/* Grip dots */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', opacity: 0.25, flexShrink: 0, zIndex: 1, pointerEvents: 'none' }}>
          {[0, 1, 2].map(i => <div key={i} style={{ width: 14, height: 1.5, background: '#aaa', borderRadius: 2 }} />)}
        </div>

        {/* Logo */}
        <div style={{
          fontSize: 9, fontWeight: 900, letterSpacing: '0.18em',
          background: 'linear-gradient(90deg, #7c5cfc, #c084fc)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          flexShrink: 0, zIndex: 1, pointerEvents: 'none',
        }}>⬡ ANTIGRAVITY</div>

        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)', flexShrink: 0, zIndex: 1, pointerEvents: 'none' }} />

        {/* Game stats */}
        <div style={{ display: 'flex', gap: 5, flex: 1, alignItems: 'center', zIndex: 1, ...({ WebkitAppRegion: 'no-drag' } as any) }}>
          {hasGame ? (
            <>
              {game.round    && <Pill label="ROUND" value={game.round}        color="#a78bfa" />}
              {game.gold  != null && <Pill label="💰" value={`${game.gold}g`}     color="#f5a623" />}
              {game.level != null && <Pill label="LVL" value={`${game.level}`}    color="#60a5fa" />}
              {game.hp    != null && <HPBar hp={game.hp} />}
              {game.xp != null && game.xpToNextLevel != null && <XPBar xp={game.xp} xpToNext={game.xpToNextLevel} />}
              {game.streak != null && game.streak !== 0 && <StreakBadge streak={game.streak} />}

              {/* Level/Roll HUD decision pill */}
              <LevelRollHudPill decision={hudDecision} />

              {game.nextOpponent && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5,
                  background: 'rgba(255,64,64,0.10)', border: '1px solid rgba(255,64,64,0.22)',
                  maxWidth: 130, overflow: 'hidden',
                }}>
                  <span style={{ fontSize: 9 }}>⚔️</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#ff9090', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {game.nextOpponent}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 10, color: 'rgba(150,140,180,0.5)', letterSpacing: '0.05em' }}>
              {connected ? 'Oyun bekleniyor...' : 'TFT bağlantısı yok...'}
            </div>
          )}
        </div>

        {/* Notification badge */}
        {notifs.length > 0 && (
          <div style={{
            ...({ WebkitAppRegion: 'no-drag' } as any),
            background: 'rgba(124,92,252,0.18)', border: '1px solid rgba(124,92,252,0.38)',
            borderRadius: 10, fontSize: 9, fontWeight: 700, color: '#c4b0ff',
            padding: '1px 6px', flexShrink: 0, zIndex: 2,
          }}>
            {notifs.length}
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', gap: 1, ...({ WebkitAppRegion: 'no-drag' } as any), zIndex: 10, position: 'relative' }}>
          <HudBtn title="Test bildirimi" onClick={() => {
            const types: NotifType[] = ['econ','item','augment','carousel','stage','opponent','level','clipboard']
            const t = types[Math.floor(Math.random() * types.length)]!
            push({ id: `test-${Date.now()}`, type: t, emoji: '🔔', title: `Test: ${t}`, body: 'Bildirim sistemi çalışıyor ✓', ttl: 5000 })
          }}>⚡</HudBtn>
          <HudBtn title={minimized ? 'Bildirimleri göster' : 'Bildirimleri gizle'} onClick={() => setMinimized(m => !m)}>
            {minimized ? '▼' : '▲'}
          </HudBtn>
          <HudBtn title="Barı gizle (tıklayarak geri aç)" onClick={() => setHidden(true)}>✕</HudBtn>
        </div>
      </div>

      {/* ═══ Notification cards ══════════════════════════════════════ */}
      {!minimized && notifs.length > 0 && (
        <div style={{
          ...({ WebkitAppRegion: 'no-drag' } as any),
          display: 'flex', flexDirection: 'column', gap: 5,
          padding: '6px 8px 8px',
        }}>
          {notifs.map(n => (
            <NotifCard key={n.id} notif={n} onDismiss={() => dismiss(n.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
