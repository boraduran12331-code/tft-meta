// src/components/BoardMap.tsx
// Visual 4×7 staggered hex TFT board map.
// Used to show comp positioning in the Overlay panel.

import React from 'react'

// Role → color
const ROLE_COLOR: Record<string, { fill: string; border: string; label: string }> = {
  carry:   { fill: 'rgba(255,64,64,0.22)',   border: '#ff4040', label: 'Carry' },
  tank:    { fill: 'rgba(59,130,246,0.2)',   border: '#3b82f6', label: 'Tank' },
  support: { fill: 'rgba(34,197,94,0.18)',   border: '#22c55e', label: 'Support' },
  flex:    { fill: 'rgba(245,166,35,0.18)',  border: '#f5a623', label: 'Flex' },
  empty:   { fill: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)', label: '' },
}

interface BoardMapProps {
  // boardLayout: slot index (row*7+col) → role
  boardLayout: Record<number, 'carry' | 'tank' | 'support' | 'flex'>
  positioningTip?: string
}

export function BoardMap({ boardLayout, positioningTip }: BoardMapProps) {
  const rows = 4
  const cols = 7
  // Hex size in px
  const HW = 28   // hex width
  const HH = 26   // hex height
  const GAP = 3   // gap between hexes
  const OFFSET = (HW + GAP) / 2  // odd-row offset for stagger

  const totalW = cols * (HW + GAP) + OFFSET
  const totalH = rows * (HH + GAP) + 4

  const slots = Object.keys(boardLayout).map(Number)

  // Legend
  const roles = [...new Set(Object.values(boardLayout))]

  return (
    <div style={{ padding: '6px 8px 8px' }}>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(180,170,200,0.6)', marginBottom: 6 }}>
        ⬡ BOARD POZİSYONU
      </div>

      {/* Board */}
      <div style={{ overflowX: 'auto' }}>
        <svg
          width={totalW}
          height={totalH}
          style={{ display: 'block' }}
        >
          {Array.from({ length: rows }, (_, row) =>
            Array.from({ length: cols }, (_, col) => {
              const idx = row * cols + col
              const role = boardLayout[idx]
              const cfg = role ? ROLE_COLOR[role] : ROLE_COLOR.empty
              // Stagger: front row (row 3) is "front", back row (row 0) is "back"
              // Visually render row 0 at top (back), row 3 at bottom (front)
              const px = col * (HW + GAP) + (row % 2 === 1 ? OFFSET : 0)
              const py = row * (HH + GAP)

              return (
                <g key={idx}>
                  <rect
                    x={px}
                    y={py}
                    width={HW}
                    height={HH}
                    rx={5}
                    fill={cfg.fill}
                    stroke={cfg.border}
                    strokeWidth={role ? 1.5 : 0.5}
                  />
                  {role && (
                    <text
                      x={px + HW / 2}
                      y={py + HH / 2 + 3.5}
                      textAnchor="middle"
                      fontSize={8}
                      fontWeight={700}
                      fill={cfg.border}
                      fontFamily="'Inter', system-ui, sans-serif"
                    >
                      {role.slice(0, 1).toUpperCase()}
                    </text>
                  )}
                </g>
              )
            })
          )}
          {/* Row labels */}
          {['← ARKA', '', '', 'ÖN →'].map((label, r) => (
            label ? (
              <text
                key={r}
                x={totalW - 2}
                y={r * (HH + GAP) + HH / 2 + 4}
                textAnchor="end"
                fontSize={6}
                fill="rgba(180,170,200,0.3)"
                fontFamily="'Inter', system-ui, sans-serif"
              >
                {label}
              </text>
            ) : null
          ))}
        </svg>
      </div>

      {/* Legend */}
      {roles.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
          {roles.map(role => {
            const cfg = ROLE_COLOR[role]
            return (
              <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: cfg.fill, border: `1px solid ${cfg.border}` }} />
                <span style={{ fontSize: 8, color: 'rgba(180,170,200,0.7)' }}>{cfg.label}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Tip text */}
      {positioningTip && (
        <div style={{ fontSize: 9, color: 'rgba(180,170,200,0.6)', marginTop: 5, lineHeight: 1.4, fontStyle: 'italic' }}>
          💡 {positioningTip}
        </div>
      )}

      {slots.length === 0 && (
        <div style={{ fontSize: 9, color: 'rgba(150,140,180,0.4)', textAlign: 'center', padding: '8px 0' }}>
          Dizilim verisi yok
        </div>
      )}
    </div>
  )
}
