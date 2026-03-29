// src/services/TeamCodeEncoder.ts
// Pure, strategy-based TFT Team Planner code encoder.
// No network calls. No side effects. Testable.

import { SetChampionIndex, normalizeName } from './CommunityDragonService'

export type PlannerCompatibility = 'FULL_VALID' | 'PARTIAL' | 'INVALID'

export type EncodeResult = {
  code: string
  resolved: Array<{
    input: string
    characterId: string
    numericValue: number
    encodedValue: string     // 3-char hex, e.g. "01f"
  }>
  missing: string[]
  compatibility: PlannerCompatibility
  strategyUsed: 'team_planner_code_v2'
  setKey: string
}

export type DecodeResult = {
  isValid: boolean
  version: string
  units: string[]
  setKey: string
}

/**
 * Generates a TFT Team Planner V2 code.
 *
 * Format: "02" + [10 slots × 3-char hex of team_planner_code] + setKey
 *
 * Rules:
 *  - FULL_VALID: all units resolved, all have non-zero teamPlannerCode
 *  - PARTIAL:    some units missing from index
 *  - INVALID:    setKey unknown or >10 units total unresolvable
 *
 * This strategy was reverse-engineered from MetaTFT clipboard output.
 * It uses the `team_planner_code` field from CDragon's tftchampions-teamplanner.json.
 */
export function generateTeamCode(
  championNames: string[],
  index: SetChampionIndex
): EncodeResult {
  const result: EncodeResult = {
    code: '',
    resolved: [],
    missing: [],
    compatibility: 'FULL_VALID',
    strategyUsed: 'team_planner_code_v2',
    setKey: index.setKey,
  }

  const slots: string[] = []
  const inputsToProcess = championNames.slice(0, 10)

  for (const inputName of inputsToProcess) {
    const norm = normalizeName(inputName)
    const characterId = index.nameToCharacterId.get(norm)
    const champ = characterId ? index.characterIdToChampion.get(characterId) : null

    if (champ && champ.teamPlannerCode > 0) {
      const encodedValue = champ.teamPlannerCode.toString(16).padStart(3, '0')
      result.resolved.push({
        input: inputName,
        characterId: champ.characterId,
        numericValue: champ.teamPlannerCode,
        encodedValue,
      })
      slots.push(encodedValue)
    } else {
      result.missing.push(inputName)
      slots.push('000')
    }
  }

  // Pad to exactly 10 slots
  while (slots.length < 10) slots.push('000')

  result.code = `02${slots.join('')}${index.setKey}`

  // Set compatibility
  if (result.missing.length === 0 && result.resolved.length > 0) {
    result.compatibility = 'FULL_VALID'
  } else if (result.resolved.length > 0) {
    result.compatibility = 'PARTIAL'
  } else {
    result.compatibility = 'INVALID'
  }

  if (result.missing.length > 0) {
    console.warn(`[TeamCode] V2 PARTIAL: ${result.missing.length} units missing.`, result.missing)
  } else {
    console.log(`[TeamCode] V2 FULL_VALID: ${result.code}`)
  }

  return result
}

/**
 * Decodes a V2 Team Planner code back to unit names.
 */
export function decodeTeamCode(code: string, index: SetChampionIndex): DecodeResult {
  const result: DecodeResult = {
    isValid: false,
    version: '02',
    units: [],
    setKey: index.setKey,
  }

  if (!code.startsWith('02') || !code.endsWith(index.setKey)) return result

  const content = code.substring(2, code.length - index.setKey.length)
  if (content.length !== 30) return result

  for (let i = 0; i < 10; i++) {
    const hex = content.substring(i * 3, i * 3 + 3)
    if (hex === '000') continue
    const codeInt = parseInt(hex, 16)
    // Find champion by teamPlannerCode
    const champ = [...index.champions.values()].find(c => c.teamPlannerCode === codeInt)
    if (champ) {
      result.units.push(champ.displayName)
    } else {
      result.units.push(`Unknown(${codeInt})`)
    }
  }

  result.isValid = true
  return result
}
