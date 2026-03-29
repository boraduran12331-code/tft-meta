# TFT Team Planner Team Code Format (V2)

## Overview
As of recent updates to Teamfight Tactics, the Team Planner tool accepts an encoded string that represents the team composition. This represents the "V2" format (often used by community sites like MetaTFT) starting with the prefix `02`.

This document explains exactly how to encode and decode this format, ensuring native compatibility with the official Riot game client.

## Standard V2 Code Architecture

A valid V2 standard string consists of exactly **40 characters**.
Example: `0234f35636835901733d352333000000TFTSet16`

It is structured functionally as:
1. **Version Prefix (2 characters):** `02`
2. **Payload (30 characters):** Exactly 10 slots representing up to 10 champions on the board. Each slot takes up **3 characters**.
3. **Set Key Suffix (Variable, e.g., 8 characters):** `TFTSet16`

### The 3-Character Slot System

The magic behind the `02` encoder is directly tied to the *CommunityDragon* JSON schema, specifically the `team_planner_code` property assigned to each specific champion.

Every slot represents the 3-character Hexadecimal (Base16) string of that integer. 
For example:
- **Ahri** has the `team_planner_code` integer **847**.
- In Hexadecimal, `847` converts to `34F` (lowercase `34f`).
- The 3-character payload slice for Ahri is therefore `"34f"`.

If the code is less than 3 characters long (for example, `47`), you pad the **left** side with zeros (resulting in `"02f"`).

### Empty Slots
Because the payload demands explicitly 10 slots (to match the limits of the in-game planner interface), any missing slots are populated with the placeholder sequence `"000"`.

## Detailed Encoding Algorithm

```javascript
function generateTftCodeV2(championNames, communityDragonIndex) {
  const codes = [];
  
  // Cut down to exactly 10 inputs max
  const units = championNames.slice(0, 10);

  units.forEach(unitName => {
    // 1. Look up the unit's exact character ID using CDragon's active set
    const championId = communityDragonIndex.nameToIdMap(unitName);
    
    // 2. Extract their specific team_planner_code integer
    const plannerCodeInt = communityDragonIndex.idToDetails(championId).team_planner_code;
    
    // 3. Convert integer to 3-char hexadecimal representation
    const hexSlice = plannerCodeInt.toString(16).padStart(3, '0');
    
    codes.push(hexSlice);
  });
  
  // 4. Backfill any empty remaining slots with "000"
  while(codes.length < 10) {
    codes.push('000');
  }

  // 5. Build final output string
  return `02${codes.join('')}${communityDragonIndex.activeSetKey}`;
}
```

## Known "Gotchas"
- **Do not sort alphabetically**: The order of the hex segments does not have to be strictly sorted by ID. The client planner processes them linearly to place units onto its grid.
- **Strict Set Adherence:** If you produce a hex code (like `004` acting as `Vayne`) inside a `TFTSet16` payload when Vayne is not actively whitelisted for Set 16 by Riot Server, the copy/paste transaction **will fail completely**. The string is validated rigidly within the bounds of the provided Set Suffix.

---
*Created by Antigravity AI Engine during macOS Native Comp Planner Development.*
