export default function GaugeMeter({ score = 0, label = '', size = 120 }) {
  const clamped = Math.max(0, Math.min(100, score))
  const angle = (clamped / 100) * 180 - 90 // -90 to 90 degrees

  const color = clamped < 35 ? '#10b981' : clamped < 65 ? '#f59e0b' : '#ef4444'
  const colorClass = clamped < 35 ? 'text-emerald-400' : clamped < 65 ? 'text-amber-400' : 'text-red-400'
  const riskLabel = clamped < 35 ? 'Low' : clamped < 65 ? 'Moderate' : 'High'

  const r = size / 2 - 8
  const cx = size / 2
  const cy = size / 2

  // Arc path
  const startX = cx - r
  const startY = cy
  const endX = cx + r
  const endY = cy

  const needleX = cx + r * 0.7 * Math.cos(((angle) * Math.PI) / 180)
  const needleY = cy + r * 0.7 * Math.sin(((angle) * Math.PI) / 180)

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
        {/* Background arc */}
        <path
          d={`M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}`}
          fill="none"
          stroke="#334155"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Colored arc */}
        <path
          d={`M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${Math.PI * r * (clamped / 100)} ${Math.PI * r}`}
        />
        {/* Needle */}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4" fill={color} />
      </svg>
      <div className={`text-2xl font-bold font-mono ${colorClass}`}>{clamped}</div>
      <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${
        clamped < 35 ? 'risk-green' : clamped < 65 ? 'risk-yellow' : 'risk-red'
      }`}>{riskLabel} Risk</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  )
}
