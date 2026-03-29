// src/services/__tests__/TeamCodeEncoder.test.ts
import { describe, it, expect } from 'vitest'
import { generateTeamCode } from '../TeamCodeEncoder'
import { ChampionData, SetChampionIndex } from '../CommunityDragonService'

describe('Team Planner Encoder Contract', () => {
  // Define a mock set with deterministic sorting
  const mockChamps: ChampionData[] = [
    { 
      characterId: 'TFT16_Aatrox', 
      displayName: 'Aatrox', 
      hexIndex: '001', 
      sortIndex: 1, 
      cost: 5,
      squareIconPath: '', teamPlannerCode: 0 
    },
    { 
      characterId: 'TFT16_Ahri', 
      displayName: 'Ahri', 
      hexIndex: '002', 
      sortIndex: 2, 
      cost: 3,
      squareIconPath: '', teamPlannerCode: 0 
    },
    { 
      characterId: 'TFT16_Bard', 
      displayName: 'Bard', 
      hexIndex: '010', 
      sortIndex: 10, 
      cost: 2,
      squareIconPath: '', teamPlannerCode: 0 
    },
    { 
      characterId: 'TFT16_Zoe', 
      displayName: 'Zoe', 
      hexIndex: '064', 
      sortIndex: 100, 
      cost: 1,
      squareIconPath: '', teamPlannerCode: 0 
    }
  ]

  const mockIndex: SetChampionIndex = {
    setKey: 'TFTSet16',
    champions: mockChamps,
    nameToCharacterId: new Map([
      ['aatrox', 'TFT16_Aatrox'],
      ['ahri', 'TFT16_Ahri'],
      ['bard', 'TFT16_Bard'],
      ['zoe', 'TFT16_Zoe']
    ]),
    characterIdToChampion: new Map(mockChamps.map(c => [c.characterId, c]))
  }

  it('should encode a single champion into the first slot correctly (Golden Test)', () => {
    // Aatrox is 001. 10 slots of 3-chars.
    // Length: 2 (01) + 30 (slots) + 8 (TFTSet16) = 40 chars
    const result = generateTeamCode(['Aatrox'], mockIndex)
    
    const expected = '01001000000000000000000000000000TFTSet16'
    expect(result.code).toBe(expected)
    expect(result.resolved).toHaveLength(1)
    expect(result.resolved[0].characterId).toBe('TFT16_Aatrox')
  })

  it('should encode multiple champions and ignore order of input (Golden Test)', () => {
    // Ahri(002) and Zoe(064)
    const result = generateTeamCode(['Ahri', 'Zoe'], mockIndex)
    const expected = '01002064000000000000000000000000TFTSet16'
    expect(result.code).toBe(expected)
  })

  it('should handle unmapped (missing) champions with 000 placeholders', () => {
    const result = generateTeamCode(['UnknownChamp', 'Ahri'], mockIndex)
    // Unknown is 000, Ahri is 002
    const expected = '01000002000000000000000000000000TFTSet16'
    expect(result.code).toBe(expected)
    expect(result.missing).toContain('UnknownChamp')
  })

  it('should strictly limit to 10 slots and ignore extra units', () => {
    const manyUnits = Array(15).fill('Aatrox')
    const result = generateTeamCode(manyUnits, mockIndex)
    // Length must still be 40 (10 slots)
    expect(result.code).toHaveLength(40)
    // Content should be 10 times 001
    const slots = result.code.substring(2, 32)
    expect(slots).toBe('001'.repeat(10))
  })
})
