import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend
} from 'recharts'
import { format } from 'date-fns'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <span className="font-mono font-bold">{p.value?.toFixed ? p.value.toFixed(2) : p.value}</span>
        </p>
      ))}
    </div>
  )
}

export default function BiomarkerChart({ historical = [], forecast = [], refMin, refMax, unit, anomalyIds = [] }) {
  const anomalySet = new Set(anomalyIds)

  const histData = historical.map(d => ({
    date: format(new Date(d.date), 'MMM d yy'),
    actual: d.value,
    isAnomaly: anomalySet.has(d.id),
  }))

  const forecastData = forecast.map(d => ({
    date: format(new Date(d.date), 'MMM d yy'),
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
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={combined} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
        <YAxis domain={[yMin, yMax]} tick={{ fill: '#94a3b8', fontSize: 11 }} unit={unit ? ` ${unit}` : ''} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />

        {/* Reference band */}
        {refMin !== undefined && refMax !== undefined && (
          <Area
            data={combined}
            dataKey={() => [refMin, refMax]}
            fill="#10b981"
            fillOpacity={0.07}
            stroke="none"
            name="Reference Range"
          />
        )}
        {refMax && <ReferenceLine y={refMax} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1} />}
        {refMin && <ReferenceLine y={refMin} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1} />}

        {/* Actual line */}
        <Line
          dataKey="actual"
          name="Actual"
          stroke="#0ea5e9"
          strokeWidth={2.5}
          dot={(props) => {
            const { cx, cy, payload } = props
            if (payload.isAnomaly) {
              return <circle key={`dot-${cx}`} cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#ef4444" />
            }
            return <circle key={`dot-${cx}`} cx={cx} cy={cy} r={3} fill="#0ea5e9" />
          }}
          connectNulls
        />

        {/* Forecast dashed line */}
        <Line
          dataKey="forecast"
          name="Forecast"
          stroke="#a78bfa"
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={{ r: 3, fill: '#a78bfa' }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
