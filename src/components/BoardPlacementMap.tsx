/**
 * BoardPlacementMap.tsx
 *
 * Renders a TFT 4-row × 7-column staggered hex grid.
 *
 * Slot numbering (MetaTFT proto):
 *   Row 0 (front):  slots  0 – 6   (7 tiles, no offset)
 *   Row 1:          slots  7 – 13  (7 tiles, offset right by ~50%)
 *   Row 2:          slots 14 – 20  (7 tiles, no offset)
 *   Row 3 (back):   slots 21 – 27  (7 tiles, offset right by ~50%)
 *
 * The board is rendered bottom-to-top visually (row 3 = front row on screen,
 * matching how MetaTFT displays it).
 */

import React from 'react'
import type { PlacementMap, UnitData } from '../store/appStore'

// ─── Layout constants ───────────────────────────────────

const COLS = 7
const ROWS = 4
const HEX_SIZE = 44  // diameter in px
const HEX_GAP = 4
const COST_COLORS: Record<number, string> = {
  1: '#9ca3af',
  2: '#22c55e',
  3: '#3b82f6',
  4: '#a855f7',
  5: '#f59e0b',
}

// ─── Types ─────────────────────────────────────────────

interface BoardPlacementMapProps {
  placementMap: PlacementMap
  style?: React.CSSProperties
}

// ─── Component ─────────────────────────────────────────

export const BoardPlacementMap: React.FC<BoardPlacementMapProps> = ({ placementMap, style }) => {
  // Board dimensions: rows 3→0 are displayed bottom → top of screen
  const totalW = COLS * (HEX_SIZE + HEX_GAP) + HEX_SIZE / 2  // extra for offset cols
  const totalH = ROWS * (HEX_SIZE + HEX_GAP)

  return (
    <div
      style={{
        position: 'relative',
        width: totalW,
        height: totalH,
        margin: '8px auto',
        ...style,
      }}
    >
      {Array.from({ length: ROWS }, (_, rowIdx) =>
        Array.from({ length: COLS }, (_, colIdx) => {
          const slot = rowIdx * COLS + colIdx
          const unit = placementMap[slot]

          // Staggered offset: even rows are plain, odd rows are shifted right by half hex
          const isOddRow = rowIdx % 2 === 1
          const x = colIdx * (HEX_SIZE + HEX_GAP) + (isOddRow ? (HEX_SIZE + HEX_GAP) / 2 : 0)
          // Display bottom row (rowIdx=0) at the bottom visually
          const y = (ROWS - 1 - rowIdx) * (HEX_SIZE + HEX_GAP)

          return (
            <HexCell
              key={slot}
              x={x}
              y={y}
              unit={unit}
              slot={slot}
            />
          )
        })
      )}
    </div>
  )
}

// ─── Single hex cell ────────────────────────────────────

interface HexCellProps {
  x: number
  y: number
  unit?: UnitData
  slot: number
}

const HexCell: React.FC<HexCellProps> = ({ x, y, unit }) => {
  const borderColor = unit ? (COST_COLORS[unit.cost] ?? '#9ca3af') : '#2d3748'
  const hasUnit = !!unit

  return (
    <div
      title={unit ? `${unit.name} (slot)` : ''}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: HEX_SIZE,
        height: HEX_SIZE,
        borderRadius: '50%',
        border: `2px solid ${borderColor}`,
        backgroundColor: hasUnit ? 'rgba(15,17,25,0.85)' : 'rgba(15,17,25,0.35)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.15s',
        cursor: hasUnit ? 'default' : 'default',
        boxShadow: hasUnit ? `0 0 6px ${borderColor}55` : 'none',
      }}
      onMouseEnter={e => { if (hasUnit) (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
    >
      {unit ? (
        <UnitPortrait unit={unit} size={HEX_SIZE} />
      ) : (
        <div style={{ width: '60%', height: '60%', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.03)' }} />
      )}
    </div>
  )
}

// ─── Champion portrait inside hex ───────────────────────

interface UnitPortraitProps {
  unit: UnitData
  size: number
}

const UnitPortrait: React.FC<UnitPortraitProps> = ({ unit, size }) => {
  const [imgError, setImgError] = React.useState(false)

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {unit.iconUrl && !imgError ? (
        <img
          src={unit.iconUrl}
          alt={unit.name}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: '#9ca3af', textAlign: 'center', padding: 2,
        }}>
          {unit.name.substring(0, 4)}
        </div>
      )}
      {/* Item icons along the bottom edge */}
      {unit.items && unit.items.length > 0 && (
        <div style={{
          position: 'absolute', bottom: -2, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', gap: 1,
        }}>
          {unit.items.slice(0, 3).map((item, idx) => {
            const iconUrl = typeof item === 'object' ? (item as { iconUrl?: string }).iconUrl : undefined
            return iconUrl ? (
              <img
                key={idx}
                src={iconUrl}
                alt=""
                style={{ width: 12, height: 12, borderRadius: 2, border: '1px solid rgba(0,0,0,0.5)' }}
              />
            ) : null
          })}
        </div>
      )}
    </div>
  )
}
