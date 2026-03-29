/**
 * StageCoach — Antigravity TFT Companion
 *
 * Real-time stage-based advice engine.
 * Triggered by LCU livegame events (round, gold, HP, level).
 *
 * Advice triggers:
 *  - Carousel rounds: comp-specific item priority
 *  - Econ thresholds: interest breakpoints
 *  - Level-up windows: when to push levels
 *  - HP danger: force-reroll decisions
 */

import type { CompData } from '../store/appStore'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GameState {
  round: string        // e.g. "3-5"
  gold: number
  level: number
  hp: number
  selectedComp: CompData | null
}

export interface CoachAdvice {
  id: string           // unique so we don't re-toast the same advice
  priority: 'info' | 'warning' | 'urgent'
  emoji: string
  title: string
  body: string
  triggerRound?: string
}

// ─── Round Parsing ────────────────────────────────────────────────────────────

export function parseRound(roundStr: string): { stage: number; round: number } {
  const [s, r] = (roundStr || '1-1').split('-').map(Number)
  return { stage: s || 1, round: r || 1 }
}

export function estimateRoundFromTime(gameTimeSec: number): string {
  // Approximate round timing (TFT Set 16 standard)
  const breakpoints: [number, string][] = [
    [0, '1-1'], [33, '1-2'], [66, '1-3'],
    [120, '2-1'], [150, '2-2'], [180, '2-3'], [210, '2-4'], [240, '2-5'],
    [300, '3-1'], [330, '3-2'], [360, '3-3'], [390, '3-4'], [420, '3-5'], [450, '3-6'],
    [510, '4-1'], [540, '4-2'], [570, '4-3'], [600, '4-4'], [630, '4-5'], [660, '4-6'],
    [720, '5-1'], [750, '5-2'], [780, '5-3'], [810, '5-4'], [840, '5-5'], [870, '5-6'],
  ]

  let last = '1-1'
  for (const [t, r] of breakpoints) {
    if (gameTimeSec >= t) last = r
  }
  return last
}

// ─── Interest Breakpoints ─────────────────────────────────────────────────────

export function getInterestGold(gold: number): number {
  if (gold >= 50) return 5
  if (gold >= 40) return 4
  if (gold >= 30) return 3
  if (gold >= 20) return 2
  if (gold >= 10) return 1
  return 0
}

// ─── Core Advice Engine ───────────────────────────────────────────────────────

export function getStageAdvice(state: GameState): CoachAdvice[] {
  const advice: CoachAdvice[] = []
  const { stage, round } = parseRound(state.round)
  const { gold, level, hp, selectedComp } = state

  // ── Econ / Interest breakpoints ──────────────────────────────────────────
  const interest = getInterestGold(gold)
  const nearBreakpoint = [10, 20, 30, 40, 50].find(bp => gold >= bp - 2 && gold < bp)
  if (nearBreakpoint && round !== 1) {
    advice.push({
      id: `econ-${nearBreakpoint}-${state.round}`,
      priority: 'info',
      emoji: '💰',
      title: `${nearBreakpoint - gold}g uzakta — ${nearBreakpoint}g faiz`,
      body: `${nearBreakpoint}g eşiğinde ${nearBreakpoint / 10}g faiz alırsın. Mümkünse bekle.`,
    })
  }

  // ── Low HP danger ─────────────────────────────────────────────────────────
  if (hp <= 20 && stage >= 4) {
    advice.push({
      id: `low-hp-${state.round}`,
      priority: 'urgent',
      emoji: '🚨',
      title: `${hp} can — kritik!`,
      body: 'Agresif reroll yap. Yenilmek oyunu kaybettirir.',
    })
  }

  // ── Level-up windows ──────────────────────────────────────────────────────
  if (stage === 3 && round === 2 && level < 6) {
    advice.push({
      id: 'lvl6-window',
      priority: 'info',
      emoji: '⬆️',
      title: 'Level 6 zamanı',
      body: '3-2\'de 6\'ya çıkmak en verimli timing. 4\'lü trait açmayı dene.',
    })
  }
  if (stage === 4 && round === 1 && level < 7) {
    advice.push({
      id: 'lvl7-window',
      priority: 'info',
      emoji: '⬆️',
      title: 'Level 7 push?',
      body: `${gold}g var. 4-1'de 7'ye çıkmak güçlü unitler için pencere açar.`,
    })
  }
  if (stage === 4 && round >= 2 && level < 8 && gold >= 50) {
    advice.push({
      id: 'fast8-window',
      priority: 'warning',
      emoji: '⚡',
      title: 'Fast 8 fırsatı',
      body: `${gold}g ile 8'e basabilirsin. ${selectedComp ? `${selectedComp.name} için 4-5 maliyet carry ara.` : '4-5 maliyet carry ara.'}`,
    })
  }

  // ── Comp-specific advice ──────────────────────────────────────────────────
  if (selectedComp) {
    // Carousel round — suggest what component to take
    if (round === 1 && stage >= 2) {
      const bisItems = selectedComp.units.flatMap(u => u.items || [])
      const topItemName = bisItems[0] ? (typeof bisItems[0] === 'string' ? bisItems[0] : bisItems[0].name) : null
      if (topItemName) {
        advice.push({
          id: `carousel-${state.round}`,
          priority: 'info',
          emoji: '🎠',
          title: 'Carousel önceliği',
          body: `${selectedComp.name} için önce komponenti al.`,
          triggerRound: state.round,
        })
      }
    }

    // Stage 3-5 reroll if A/S tier
    if (stage === 3 && round >= 5 && (selectedComp.tier === 'S' || selectedComp.tier === 'A') && level >= 6) {
      advice.push({
        id: 'reroll-35',
        priority: 'warning',
        emoji: '🎲',
        title: `${selectedComp.name} — reroll window`,
        body: `3-5'te 6'da reroll çok verimli. En az ${selectedComp.units.slice(0,2).map(u => u.name).join(' & ')} üçleme hedefle.`,
      })
    }
  }

  // ── Streak advice ──────────────────────────────────────────────────────────
  if (stage === 2 && round >= 3 && gold < 30) {
    advice.push({
      id: 'econ-early',
      priority: 'info',
      emoji: '📈',
      title: 'Econ koru',
      body: '2. aşamada reroll yapma. Altını biriktir, 3-2\'ye maxed econ ile gir.',
    })
  }

  return advice
}
