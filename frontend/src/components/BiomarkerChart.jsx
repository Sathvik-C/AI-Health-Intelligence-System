import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend
} from 'recharts'
import { format } from 'date-fns'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-stone-800 border border-stone-700 rounded-xl p-4 text-xs shadow-2xl min-w-[160px]">
      <p className="text-stone-400 mb-2 font-medium">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span className="font-mono font-bold">{p.value?.toFixed ? p.value.toFixed(2) : p.value}</span>
        </p>
      ))}
    </div>
  )
}

export default function BiomarkerChart({ historical = [], forecast = [], refMin, refMax, unit, anomalyIds = [] }) {
  const anomalySet = new Set(anomalyIds)

  const histData = historical.map(d => ({
    date: format(new Date(d.date), 'MMM yyyy'),
    fullDate: format(new Date(d.date), 'MMM d, yyyy'),
    actual: d.value,
    isAnomaly: anomalySet.has(d.id),
  }))

  const forecastData = forecast.map(d => ({
    date: format(new Date(d.date), 'MMM yyyy'),
    fullDate: format(new Date(d.date), 'MMM d, yyyy'),
    forecast: d.value,
  }))

  // Merge for continuous x-axis
  const lastHistPoint = histData[histData.length - 1]
  const combined = [
    ...histData,
    ...(lastHistPoint ? [{ ...lastHistPoint, forecast: lastHistPoint.actual }] : []),
    ...forecastData,
  ]

  const allValues = [...histData.map(d => d.actual), ...forecastData.map(d => d.forecast), refMin, refMax].filter(Boolean)
  const yMin = Math.min(...allValues) * 0.85
  const yMax = Math.max(...allValues) * 1.15

  return (
    <ResponsiveContainer width="100%" height={380}>
      <ComposedChart data={combined} margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
        <defs>
          <linearGradient id="refGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
          </linearGradient>
          <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />

        <XAxis
          dataKey="date"
          tick={{ fill: '#a1a1aa', fontSize: 12, fontWeight: 500 }}
          tickLine={false}
          axisLine={{ stroke: '#3f3f46' }}
          dy={10}
          padding={{ left: 30, right: 30 }}
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fill: '#a1a1aa', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(val) => `${val}${unit ? ` ${unit}` : ''}`}
          width={70}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: '#a1a1aa', paddingTop: 16 }}
          iconType="circle"
          iconSize={8}
        />

        {/* Reference band */}
        {refMin !== undefined && refMax !== undefined && (
          <Area
            data={combined}
            dataKey={() => [refMin, refMax]}
            fill="url(#refGradient)"
            stroke="none"
            name="Reference Range"
          />
        )}
        {refMax && <ReferenceLine y={refMax} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `Max ${refMax}`, position: 'right', fill: '#f59e0b', fontSize: 10 }} />}
        {refMin && <ReferenceLine y={refMin} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `Min ${refMin}`, position: 'right', fill: '#f59e0b', fontSize: 10 }} />}

        {/* Actual line with area fill */}
        <Area
          dataKey="actual"
          fill="url(#actualGradient)"
          stroke="none"
          connectNulls
          legendType="none"
        />
        <Line
          dataKey="actual"
          name="Actual"
          stroke="#0ea5e9"
          strokeWidth={3}
          dot={(props) => {
            const { cx, cy, payload } = props
            if (payload.isAnomaly) {
              return (
                <g key={`dot-${cx}`}>
                  <circle cx={cx} cy={cy} r={8} fill="#ef4444" fillOpacity={0.2} />
                  <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
                </g>
              )
            }
            return <circle key={`dot-${cx}`} cx={cx} cy={cy} r={4} fill="#0ea5e9" stroke="#0c4a6e" strokeWidth={2} />
          }}
          activeDot={{ r: 6, fill: '#0ea5e9', stroke: '#fff', strokeWidth: 2 }}
          connectNulls
        />

        {/* Forecast dashed line */}
        <Line
          dataKey="forecast"
          name="Forecast"
          stroke="#a78bfa"
          strokeWidth={2.5}
          strokeDasharray="8 4"
          dot={{ r: 4, fill: '#a78bfa', stroke: '#4c1d95', strokeWidth: 2 }}
          activeDot={{ r: 6, fill: '#a78bfa', stroke: '#fff', strokeWidth: 2 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
