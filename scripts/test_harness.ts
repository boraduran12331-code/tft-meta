import { fetchSetIndex } from '../src/services/CommunityDragonService'
import { generateTeamCode } from '../src/services/TeamCodeEncoder'

async function runHarness() {
  console.log('--- STRICT TFT Team Code Verification Harness ---')
  
  const setKey = 'TFTSet16'
  const index = await fetchSetIndex(setKey)
  
  const comps = [
    {
      name: 'Set16 Spellcasters',
      units: ['Ahri', 'Annie', 'AurelionSol', 'Azir', 'Leblanc', 'Lux', 'Malzahar', 'Zoe']
    },
    {
      name: 'Set16 Bruisers',
      units: ['Aatrox', 'Darius', 'DrMundo', 'Garen', 'Illaoi', 'Sett', 'Vi', 'Warwick']
    },
    {
      name: 'Set16 Snipers',
      units: ['Aphelios', 'Ashe', 'Caitlyn', 'Jhin', 'Jinx', 'MissFortune', 'Tristana', 'Vayne']
    }
  ]
  
  for (const comp of comps) {
    const result = generateTeamCode(comp.units, index)
    
    console.log('\n=========================================')
    console.log(`Comp: ${comp.name}`)
    console.log('Inputs:', comp.units.join(', '))
    console.log('Resolved IDs:', result.resolved.map(r => r.characterId).join(', '))
    if (result.missing.length > 0) {
      console.log('❌ INVALID FOR COPY. Missing:', result.missing.join(', '))
    } else {
      console.log('✅ FULL MATCH. No missing units.')
      console.log('CODE TO TEST IN TFT CLIENT:')
      console.log(result.code)
    }
    console.log('=========================================')
  }
}

runHarness().catch(console.error)
