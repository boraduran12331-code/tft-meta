// src/services/TeamCodeEncoder.ts

import { SetChampionIndex, normalizeName } from './CommunityDragonService'

export type EncodeResult = {
  code: string;
  resolved: Array<{ input: string; characterId: string; teamPlannerCode: number }>;
  missing: string[];
}

export type DecodeResult = {
  isValid: boolean;
  version: string;
  units: string[];
  setKey: string;
}

/**
 * Generates a TFT Team Planner V2 code.
 * Format: 02 + [3-char hex per champion based on team_planner_code] + setKey
 */
export function generateTeamCode(
  championNames: string[],
  index: SetChampionIndex
): EncodeResult {
  const result: EncodeResult = {
    code: '',
    resolved: [],
    missing: []
  }

  const slots: string[] = []
  const inputsToProcess = championNames.slice(0, 10)

  for (const inputName of inputsToProcess) {
    const norm = normalizeName(inputName)
    const characterId = index.nameToCharacterId.get(norm)
    const champ = characterId ? index.characterIdToChampion.get(characterId) : null

    if (champ && champ.teamPlannerCode > 0) {
      result.resolved.push({ 
        input: inputName, 
        characterId: champ.characterId, 
        teamPlannerCode: champ.teamPlannerCode 
      })
      slots.push(champ.teamPlannerCode.toString(16).padStart(3, '0'))
    } else {
      result.missing.push(inputName)
      slots.push('000') // Placeholder for unmapped champion
    }
  }

  while (slots.length < 10) {
    slots.push('000')
  }

  // Concatenate version (02) + 10x 3-char hex + setKey
  result.code = `02${slots.join('')}${index.setKey}`

  if (result.missing.length > 0) {
    console.warn(`[TeamCode] Encoding V2 partial: ${result.missing.length} missing units.`, result)
  } else {
    console.log(`[TeamCode] Encoding V2 success: ${result.code}`)
  }

  return result
}

/**
 * Decodes a V2 Team Planner code to its unit names and setKey.
 */
export function decodeTeamCode(code: string, index: SetChampionIndex): DecodeResult {
  const result: DecodeResult = {
    isValid: false,
    version: '02',
    units: [],
    setKey: index.setKey
  }

  if (!code.startsWith('02') || !code.endsWith(index.setKey)) {
    return result
  }

  const content = code.substring(2, code.length - index.setKey.length)
  if (content.length !== 30) {
    return result
  }

  for (let i = 0; i < 10; i++) {
    const hex = content.substring(i * 3, i * 3 + 3)
    if (hex !== '000') {
      const codeInt = parseInt(hex, 16)
      const charId = index.nameToCharacterId.get(codeInt.toString())
      if (charId) {
        const champ = index.characterIdToChampion.get(charId)
        if (champ) {
          result.units.push(champ.displayName)
        }
      } else {
         result.units.push(`Unknown(${codeInt})`)
      }
    }
  }

  result.isValid = true
  return result
}
