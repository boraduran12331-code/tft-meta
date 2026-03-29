// electron/services/NotificationEngine.ts
// Kapsamlı analiz motoru — Level/Roll kararı, clipboard comp tespiti, rakip counter önerisi
// TFTGameEngine tarafından delegate olarak kullanılır.

import { clipboard } from 'electron'
import { MetaComp, SET16_COMPS, detectComp } from './TFTMeta'
import type { TFTLiveState, TFTNotification } from './TFTGameEngine'

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type Decision = 'level' | 'roll' | 'econ' | 'hold'

export interface LevelRollDecision {
  action: Decision
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

export interface CompClipboardResult {
  comp: MetaComp
  suggestions: ItemSuggestion[]
  levelAdvice: string
}

// ─────────────────────────────────────────────────────────────────
// Level vs Roll Engine
// Comp stratejisine + mevcut duruma göre net karar üretir.
// ─────────────────────────────────────────────────────────────────

const XP_COST_BY_LEVEL: Record<number, number> = {
  2: 2, 3: 2, 4: 2, 5: 4, 6: 8, 7: 20, 8: 36, 9: 48, 10: 76,
}

export function decideLevelOrRoll(
  state: TFTLiveState,
  comp: MetaComp | null,
): LevelRollDecision | null {
  const { gold, level, hp, streak, round } = state
  if (gold == null || level == null) return null

  const [stage, roundNum] = round.split('-').map(Number)
  const aliveCount = state.players.filter(p => p.isAlive).length
  const hpCritical = hp != null && hp <= 15
  const hpLow      = hp != null && hp <= 30

  // ── PRIORITY 0: Critical HP — Roll everything ──────────────────
  if (hpCritical && gold >= 10) {
    return {
      action:  'roll',
      emoji:   '🩸',
      title:   'KRİTİK HP — Roll Et!',
      reason:  `HP: ${hp} — Hayatta kalmak için hemen roll yap`,
      urgency: 'critical',
    }
  }

  const compId = comp?.id ?? ''
  const isRerollComp  = compId.includes('reroll') || compId.includes('slow-roll')
  const isFast8Comp   = !isRerollComp && (compId.includes('arcana') || compId.includes('invoker') || compId.includes('gunner') || compId.includes('dominator'))

  // ── PRIORITY 1: Econ interest thresholds ──────────────────────
  // 50g faiz noktası — her şeyden önce gelir
  if (gold >= 48 && gold < 55 && !hpLow) {
    return {
      action:  'econ',
      emoji:   '💰',
      title:   '50g Faiz Noktası',
      reason:  `50g\'de kal — +5 altın faiz, level/roll bekliyebilir`,
      urgency: 'medium',
    }
  }
  for (const b of [10, 20, 30, 40] as const) {
    if (gold >= b - 1 && gold < b) {
      const needed = b - gold
      return {
        action:  'econ',
        emoji:   '🪙',
        title:   `${b}g Faiz Eşiği - ${needed}g Eksik`,
        reason:  `${needed} altın daha bekle → +${Math.floor(b / 10)} faiz kazanırsın`,
        urgency: 'low',
      }
    }
  }

  // ── PRIORITY 2: Reroll comp specific logic ─────────────────────
  if (isRerollComp) {
    if (level === 5 && stage >= 3 && gold >= 10) {
      return {
        action:  'roll',
        emoji:   '🎰',
        title:   'SLOW ROLL — Şimdi',
        reason:  `${comp?.name ?? 'Comp'}: Level 5\'te tut, roll yap (30g üstünde kal)`,
        urgency: 'high',
      }
    }
    if (level < 5 && XP_COST_BY_LEVEL[level + 1] && gold >= XP_COST_BY_LEVEL[level + 1]!) {
      return {
        action:  'level',
        emoji:   '⬆️',
        title:   `Level ${level + 1}\'e Yüksel`,
        reason:  `Slow roll için önce Level 5\'e ulaş`,
        urgency: 'high',
      }
    }
    if (level === 5 && gold < 30) {
      return {
        action:  'econ',
        emoji:   '💰',
        title:   'SLOW ROLL Econ',
        reason:  `30g eşiğini koru — ${30 - gold}g bekle`,
        urgency: 'medium',
      }
    }
  }

  // ── PRIORITY 3: Fast 8/9 comp logic ───────────────────────────
  if (isFast8Comp) {
    if (stage === 4 && roundNum >= 1 && level === 7 && gold >= 36) {
      return {
        action:  'level',
        emoji:   '⬆️',
        title:   'Level 8\'e Yüksel!',
        reason:  `${comp?.name ?? 'Comp'}: 4. aşamada Level 8 — 4-cost unit\'ler açılıyor`,
        urgency: 'high',
      }
    }
    if (stage >= 4 && level === 8 && gold >= 30) {
      return {
        action:  'roll',
        emoji:   '🎰',
        title:   '4-Cost Roll Zamanı',
        reason:  `Level 8\'de carry unit bul — ${gold}g al`,
        urgency: 'high',
      }
    }
    if (stage <= 3 && gold < 50) {
      return {
        action:  'econ',
        emoji:   '💰',
        title:   'Fast 8 Econ',
        reason:  comp?.econTip ?? '50g bekle, 4-2\'de full roll',
        urgency: 'low',
      }
    }
  }

  // ── PRIORITY 4: Generic level advice ──────────────────────────
  const xpCost = XP_COST_BY_LEVEL[level + 1]
  if (stage === 4 && level < 8 && xpCost && gold >= xpCost + 10) {
    return {
      action:  'level',
      emoji:   '⬆️',
      title:   `Level ${level + 1}\'e Yüksel`,
      reason:  comp?.levelTiming ?? `${xpCost}g harca, üst seviye unit\'ler al`,
      urgency: 'medium',
    }
  }

  // ── PRIORITY 5: Late-game last fight advice ────────────────────
  if (aliveCount <= 3 && hpLow && gold >= 20) {
    return {
      action:  'roll',
      emoji:   '🎯',
      title:   'Son Hamle — Roll Et',
      reason:  `${aliveCount} kişi kaldı, HP: ${hp} — son kozu oyna`,
      urgency: 'critical',
    }
  }

  // ── PRIORITY 6: Win streak — keep econ ────────────────────────
  if ((streak ?? 0) >= 3 && gold < 50) {
    return {
      action:  'econ',
      emoji:   '🔥',
      title:   'Galibiyet Serisi — Econ Yap',
      reason:  `${streak} tur galibiyet — seri devam ediyor, altın biriktir`,
      urgency: 'low',
    }
  }

  return null
}

// ─────────────────────────────────────────────────────────────────
// Item Suggestion Engine
// Board'daki bileşenlere ve comp'a göre item önerisi üretir.
// ─────────────────────────────────────────────────────────────────

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
  "Sterak's Gage":       ['B.F. Sword', "Giant's Belt"],
  'Shroud of Stillness': ['Chain Vest', 'Sparring Gloves'],
}

export function suggestItems(
  components: string[],
  comp: MetaComp | null,
  rawText?: string,
): ItemSuggestion[] {
  if (!comp || components.length < 2) return []

  const suggestions: ItemSuggestion[] = []
  const available = [...components]
  const manifesto = comp.itemManifesto.toLowerCase()
  
  // Units that are actually in the user's focus (from clipboard)
  const textLower = rawText?.toLowerCase() ?? ""
  const mentionedUnits = comp.keyUnits.filter(u => textLower.includes(u.toLowerCase()))

  for (const [itemName, [c1, c2]] of Object.entries(ITEM_RECIPES)) {
    const idx1 = available.indexOf(c1)
    const idx2 = c1 === c2
      ? available.indexOf(c2, idx1 + 1)
      : available.indexOf(c2)

    if (idx1 === -1 || idx2 === -1) continue

    // Does the comp care about this item?
    const isMainItem = manifesto.includes(itemName.toLowerCase()) ||
                       manifesto.includes(c1.toLowerCase()) ||
                       manifesto.includes(c2.toLowerCase())
    
    if (!isMainItem) continue

    // Find what unit this goes on
    let targetUnit = ""
    
    // 1. Check if specific unit is mentioned for this item in manifesto
    for (const unit of comp.keyUnits) {
      const uLower = unit.toLowerCase()
      if (manifesto.includes(uLower) && manifesto.includes(itemName.toLowerCase())) {
        // Preference for units in clipboard, or just the first match if live
        if (!rawText || mentionedUnits.includes(unit)) {
          targetUnit = unit
          break
        }
      }
    }

    // 2. Fallback to first mentioned unit in clipboard
    if (!targetUnit && mentionedUnits.length > 0) {
      targetUnit = mentionedUnits[0]!
    }

    // 3. Last fallback: avoid hardcoding a potentially wrong unit like "Lux"
    if (!targetUnit) {
      targetUnit = "Taşıyıcı"
    }

    suggestions.push({
      itemName,
      components: [c1, c2],
      targetUnit,
      reason: `${comp.name}: ${targetUnit}'e yerleştir`,
    })

    const removeIdx = [idx1, idx2].sort((a, b) => b - a)
    removeIdx.forEach(i => available.splice(i, 1))
  }

  return suggestions.slice(0, 3)
}

// ─────────────────────────────────────────────────────────────────
// Clipboard Monitor
// TFT team kodu veya comp adını tespit eder.
// ─────────────────────────────────────────────────────────────────

// TFT team code regex (e.g. "TFT16_Arcana_Carry_v2" or just comp trait strings)
const TFT_CODE_PATTERN = /TFT\d+_[A-Za-z0-9_]+/
const TRAIT_PATTERN    = /\b(arcana|bruiser|strategist|dominator|bastion|gunner|invoker|slayer|mage|warrior|guardian|marksman|renegade|sentinel)\b/gi

export class ClipboardMonitor {
  private timer: ReturnType<typeof setInterval> | null = null
  private lastText = ''
  private readonly CHECK_MS = 1500

  start(onDetected: (result: CompClipboardResult, rawText: string) => void) {
    if (this.timer) return
    this.lastText = clipboard.readText()

    this.timer = setInterval(() => {
      try {
        const text = clipboard.readText()
        if (!text || text === this.lastText) return
        this.lastText = text

        const result = this.analyzeText(text)
        if (result) onDetected(result, text)
      } catch {
        // Clipboard read error — silent
      }
    }, this.CHECK_MS)
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  private analyzeText(text: string): CompClipboardResult | null {
    const textLower = text.toLowerCase()
    let bestComp: MetaComp | null = null
    let bestScore = 0

    // 1. Calculate scores for all comps to find the actual best match
    for (const comp of SET16_COMPS) {
      let score = 0
      
      // Name match (high weight)
      if (textLower.includes(comp.name.toLowerCase())) score += 10
      
      // Units match (medium weight)
      const matchedUnits = comp.keyUnits.filter(u => textLower.includes(u.toLowerCase()))
      score += matchedUnits.length * 5
      
      // Traits match (low weight)
      const matchedTraits = comp.traits.filter(t => textLower.includes(t.toLowerCase()))
      score += matchedTraits.length * 2

      if (score > bestScore) {
        bestScore = score
        bestComp = comp
      }
    }

    // 2. Special case: LCU/TFT Code pattern match overrides if high confidence
    const tftCodeMatch = text.match(TFT_CODE_PATTERN)
    if (tftCodeMatch) {
      const codeParts = tftCodeMatch[0]!.split('_').slice(1)
      const codeComp = this.findCompByKeywords(codeParts)
      if (codeComp) return this.buildResult(codeComp, text)
    }

    if (bestComp && bestScore >= 5) {
      return this.buildResult(bestComp, text)
    }

    return null
  }

  private findCompByKeywords(keywords: string[]): MetaComp | null {
    const lower = keywords.map(k => k.toLowerCase())
    let best: MetaComp | null = null
    let bestScore = 0

    for (const comp of SET16_COMPS) {
      const score = [
        ...comp.traits,
        ...comp.keyUnits.map(u => u.toLowerCase()),
        comp.id,
      ].filter(k => lower.some(l => k.includes(l) || l.includes(k))).length

      if (score > bestScore) { bestScore = score; best = comp }
    }
    return bestScore > 0 ? best : null
  }

  private buildResult(comp: MetaComp, rawText?: string): CompClipboardResult {
    return {
      comp,
      suggestions: [], // Will be enriched by caller with current components
      levelAdvice: comp.levelTiming,
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Counter Advice Generator
// Rakibin comp tipine göre counter ipucu üretir.
// ─────────────────────────────────────────────────────────────────

const COUNTER_TIPS: Record<string, string> = {
  'bruiser': 'Bruiser\'a karşı: Morellonomicon + Sunfire Cape ile sağlık azaltma ekle',
  'guardian': 'Guardian\'a karşı: Armor delici item\'lar (Last Whisper), mage öncelikli',
  'mage': 'Mage\'e karşı: Magic resist item (Dragon\'s Claw), Negatron Cloaks',
  'gunner': 'Gunner\'a karşı: Hızlı frontline, Gargoyle + tank stacking',
  'slayer': 'Slayer\'a karşı: Quicksilver (CC kır), frontline kalın tut',
  'marksman': 'Marksman\'a karşı: Frontline yoğunlaştır, assassin gap filler',
  'invoker': 'Invoker\'a karşı: Magic resist, Ionic Spark ile spell interrupt',
  'strategist': 'Strategist\'e karşı: Burst carry + Jeweled Gauntlet',
  'dominator': 'Dominator\'a karşı: Thornmail + damage mitigation',
  'sentinel': 'Sentinel\'a karşı: Anti-shield item\'lar, Grievous Wounds',
  'arcana': 'Arcana\'ya karşı: Frontline + dodge tank, Mage counter > Negatron',
  'renegade': 'Renegade\'e karşı: Erken burst, süslü unit önce kes',
  'bastion': 'Bastion\'a karşı: AP damage + Last Whisper, ignore frontline',
}

export function getCounterAdvice(enemyTraits: string[]): string | null {
  for (const trait of enemyTraits) {
    const lower = trait.toLowerCase()
    for (const [key, tip] of Object.entries(COUNTER_TIPS)) {
      if (lower.includes(key)) return tip
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────
// Notification builder helpers
// ─────────────────────────────────────────────────────────────────

export function buildLevelRollNotif(
  decision: LevelRollDecision,
  round: string,
  gold: number,
): TFTNotification {
  return {
    id: `lvlroll-${decision.action}-${round}-${Math.floor(gold / 10)}`,
    type: 'econ',
    emoji: decision.emoji,
    title: decision.title,
    body: decision.reason,
    ttl: decision.urgency === 'critical' ? 15000 : decision.urgency === 'high' ? 12000 : 8000,
    priority: decision.urgency === 'critical' ? 'high' : decision.urgency === 'high' ? 'high' : 'normal',
    levelDecision: decision,
  }
}

export function buildCompClipboardNotif(
  comp: MetaComp,
  suggestions: ItemSuggestion[],
): TFTNotification {
  const topSuggestion = suggestions[0]
  const body = topSuggestion
    ? `${topSuggestion.itemName}: ${topSuggestion.components.join(' + ')} → ${topSuggestion.targetUnit}`
    : `${comp.itemManifesto.slice(0, 80)}`

  return {
    id: `clipboard-comp-${comp.id}-${Date.now()}`,
    type: 'clipboard',
    emoji: '📋',
    title: `Kopyalanan: ${comp.name}`,
    body,
    ttl: 18000,
    priority: 'high',
    clipboardComp: {
      comp,
      suggestions,
      levelAdvice: comp.levelTiming,
    },
  }
}

export function buildCounterNotif(
  opponentName: string,
  traits: string[],
  placement: number,
  round: string,
): TFTNotification | null {
  const tip = getCounterAdvice(traits)
  if (!tip) return null

  const emoji = placement <= 4 ? '🔴' : '🟡'
  return {
    id: `counter-${opponentName}-${round}`,
    type: 'opponent',
    emoji,
    title: `${opponentName} — Counter`,
    body: tip,
    ttl: 14000,
    priority: 'high',
  }
}
