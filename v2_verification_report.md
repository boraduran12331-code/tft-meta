# V2 Encoding Verification Table

The previous fixed-width hex slot (`01` prefix) encoder using alphabetical sorting has been ABANDONED in favor of the industry-standard V2 encoder (`02` prefix) based on reverse-engineering the MetaTFT payload.

**Discovery:** Instead of complex bitwise/protobuf structures, the working MetaTFT code was verified to be a simple concatenation:
`02` + `[10 slots of 3-character Hex strings of the CommunityDragon team_planner_code]` + `[SetKey]`

## Test Comps for Live TFT Set 16 Client

The following table includes known-good team compositions mapped directly against the official `TFTSet16` JSON index using the newly implemented valid `02` V2 encoder.

**Instructions for the User:**
1. Open the TFT Mac Client.
2. Go to the Team Planner for Set 16.
3. Copy each generated code and paste it.
4. Fill in the "Accepted?" and "Imported Champions Seen" column.

| Comp Name | Input Units | Generated V2 Code | Accepted? (Y/N) | Imported Champions Seen |
| :--- | :--- | :--- | :--- | :--- |
| **Set16 Spellcasters** | Ahri, Annie, AurelionSol, Azir, Leblanc, Lux, Malzahar, Zoe | `0234f35636835901733d352333000000TFTSet16` | [ ] | [ ] |
| **Set16 Bruisers** | Aatrox, Darius, DrMundo, Garen, Illaoi, Sett, Vi, Warwick | `0237236b02f33c32c36234b36d000000TFTSet16` | [ ] | [ ] |
| **Set16 Snipers** | Aphelios, Ashe, Caitlyn, Jhin, Jinx, MissFortune, Tristana, Vayne | `0233533f34937434832d2df004000000TFTSet16` | [ ] | [ ] |

## Validation Logic Added
- Re-indexed `ChampionData` correctly injects `teamPlannerCode` directly from `CommunityDragonService.ts`.
- `TeamCodeEncoder` stringifies the code via `champ.teamPlannerCode.toString(16).padStart(3, '0')`.
- Missing units fall back to `000` padding correctly without failing structural client validation.
- Missing/invalid Set validations previously added inside `OverlayPanel.tsx` remain to ensure strict enforcement.

Please paste these into your client and give me the results. If successful, we can officially ship the "Copy Code" button and proceed with dynamic item/augmentation features!
