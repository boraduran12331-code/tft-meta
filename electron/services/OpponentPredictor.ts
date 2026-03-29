// electron/services/OpponentPredictor.ts
// Probabilistic "Possible Next Opponents" system for TFT.
//
// Design principles:
// - NEVER claim certainty unless we have an explicit in-game signal (LCU crossed-swords field)
// - Track recent opponents per round to build recency penalty
// - Use alive count to calibrate deprioritization window
// - Expose structured likelihood data (high/medium/low) for UI

export type Likelihood = 'confirmed' | 'high' | 'medium' | 'low' | 'recent'

export interface PossibleOpponent {
  name: string
  likelihood: Likelihood
  isRecent: boolean       // greyed out in UI
  kills: number           // from live data
  position: number        // current standing
  traits?: string[]       // from Riot API enrichment (optional)
  lastPlacement?: number  // from Riot API enrichment (optional)
}

export interface OpponentPrediction {
  candidates: PossibleOpponent[]
  confidence: 'confirmed' | 'high' | 'low' | 'uncertain'
  confirmedName: string | null  // set only when LCU provides explicit signal
  round: string
}

/**
 * Recency window: how many recent opponents to deprioritize
 * based on how many players are still alive.
 */
function recencyWindow(aliveCount: number): number {
  if (aliveCount >= 8) return 4
  if (aliveCount === 7) return 3
  if (aliveCount >= 5) return 2
  return 1  // late game → round-robin-like, only skip very last
}

export class OpponentPredictor {
  // recentOpponents[0] = most recent, [last] = least recent
  private recentOpponents: string[] = []
  private currentRound = ''

  /**
   * Call this whenever we detect the local player was in a combat.
   * `opponent` is who we just fought.
   */
  recordFight(opponent: string) {
    // Prepend, dedup, cap at 7
    this.recentOpponents = [
      opponent,
      ...this.recentOpponents.filter(n => n !== opponent),
    ].slice(0, 7)
  }

  /**
   * Reset tracking at game start.
   */
  reset() {
    this.recentOpponents = []
    this.currentRound = ''
  }

  /**
   * Main prediction entry point.
   *
   * @param localPlayer   - local player's summoner name
   * @param alivePlayers  - all alive players (incl. local)
   * @param lcuOpponent   - explicit opponent name from LCU (null if unavailable)
   * @param round         - current round string e.g. "3-2"
   */
  predict(
    localPlayer: string,
    alivePlayers: Array<{ summonerName: string; kills: number; position: number; isAlive: boolean }>,
    lcuOpponent: string | null,
    round: string,
  ): OpponentPrediction {
    this.currentRound = round
    const aliveCount = alivePlayers.length
    const window = recencyWindow(aliveCount)
    const recentSet = new Set(this.recentOpponents.slice(0, window).map(n => n.toLowerCase()))

    // Filter out local player
    const candidates = alivePlayers.filter(
      p => p.summonerName.toLowerCase() !== localPlayer.toLowerCase()
    )

    if (candidates.length === 0) {
      return { candidates: [], confidence: 'uncertain', confirmedName: null, round }
    }

    // -- CASE 1: LCU confirmed opponent --
    if (lcuOpponent) {
      const confirmed = candidates.find(
        p => p.summonerName.toLowerCase() === lcuOpponent.toLowerCase()
      )
      const others = candidates.filter(
        p => p.summonerName.toLowerCase() !== lcuOpponent.toLowerCase()
      )
      return {
        confirmedName: lcuOpponent,
        confidence: 'confirmed',
        round,
        candidates: [
          ...(confirmed ? [{
            name: confirmed.summonerName,
            likelihood: 'confirmed' as Likelihood,
            isRecent: false,
            kills: confirmed.kills,
            position: confirmed.position,
          }] : []),
          ...others.map(p => ({
            name: p.summonerName,
            likelihood: 'low' as Likelihood,
            isRecent: recentSet.has(p.summonerName.toLowerCase()),
            kills: p.kills,
            position: p.position,
          })),
        ],
      }
    }

    // -- CASE 2: No confirmed signal — probabilistic scoring --
    //
    // Score formula:
    //   base = 100
    //   recent penalty: -60 for most recent, -45 for 2nd, -30 for 3rd, -15 for 4th
    //   kill bonus: +5 * kills (strong players are more likely to have survived)
    //   position penalty: -(position-1) * 2 (higher standing = slightly less likely ghost)

    const recentList = this.recentOpponents.slice(0, window)

    const scored = candidates.map(p => {
      let score = 100
      const recencyIdx = recentList.findIndex(r => r.toLowerCase() === p.summonerName.toLowerCase())
      if (recencyIdx !== -1) {
        const penalty = Math.max(15, 60 - recencyIdx * 15)
        score -= penalty
      }
      score += p.kills * 5
      score -= (p.position - 1) * 2
      return { player: p, score, isRecent: recencyIdx !== -1 && recencyIdx < window }
    })

    scored.sort((a, b) => b.score - a.score)

    const maxScore = scored[0]?.score ?? 100
    const minScore = scored[scored.length - 1]?.score ?? 0
    const range = maxScore - minScore || 1

    const mapped: PossibleOpponent[] = scored.map(({ player, score, isRecent }) => {
      const normalized = (score - minScore) / range   // 0..1
      let likelihood: Likelihood
      if (isRecent) {
        likelihood = 'recent'
      } else if (normalized > 0.66) {
        likelihood = 'high'
      } else if (normalized > 0.33) {
        likelihood = 'medium'
      } else {
        likelihood = 'low'
      }
      return {
        name: player.summonerName,
        likelihood,
        isRecent,
        kills: player.kills,
        position: player.position,
      }
    })

    // Confidence level: if all scores are very similar → uncertain
    const highCount = mapped.filter(m => m.likelihood === 'high').length
    let confidence: OpponentPrediction['confidence']
    if (range < 15)          confidence = 'uncertain'
    else if (highCount >= 3) confidence = 'uncertain'  // too many "high" → no real signal
    else if (highCount === 1) confidence = 'high'
    else                     confidence = 'low'

    return { candidates: mapped, confidence, confirmedName: null, round }
  }
}
