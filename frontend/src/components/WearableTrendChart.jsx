import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts'


export default function WearableTrendChart({ data }) {
    if (!data || data.length === 0) {
        return (
            <div className="card text-center py-10 text-stone-500">
                No wearable trend data available.
            </div>
        )
    }

    const chartData = data.map(item => ({
        ...item,
        displayDate: new Date(item.date).toLocaleDateString(
            'en-US',
            {
                month: 'short',
                day: 'numeric',
            }
        ),
    }))

    return (
        <div className="card">

            <div className="mb-4">
                <h2 className="text-sm font-semibold text-white">
                    Activity & Sleep Trends
                </h2>

                <p className="text-xs text-stone-500 mt-0.5">
                    Last 30 days
                </p>
            </div>

            <div className="h-80">

                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={chartData}
                        margin={{
                            top: 5,
                            right: 10,
                            left: 0,
                            bottom: 5,
                        }}
                    >

                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#292524"
                        />

                        <XAxis
                            dataKey="displayDate"
                            tick={{
                                fill: '#78716c',
                                fontSize: 11,
                            }}
                            axisLine={false}
                            tickLine={false}
                        />

                        <YAxis
                            yAxisId="left"
                            tick={{
                                fill: '#78716c',
                                fontSize: 11,
                            }}
                            axisLine={false}
                            tickLine={false}
                        />

                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            tick={{
                                fill: '#78716c',
                                fontSize: 11,
                            }}
                            axisLine={false}
                            tickLine={false}
                        />

                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1c1917',
                                border: '1px solid #44403c',
                                borderRadius: '8px',
                                color: '#fff',
                            }}
                        />

                        <Legend />

                        <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="steps"
                            name="Steps"
                            stroke="#34d399"
                            strokeWidth={2}
                            dot={false}
                        />

                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="sleep_hours"
                            name="Sleep (hrs)"
                            stroke="#a78bfa"
                            strokeWidth={2}
                            dot={false}
                        />

                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="resting_heart_rate"
                            name="Resting HR"
                            stroke="#f87171"
                            strokeWidth={2}
                            dot={false}
                        />

                    </LineChart>
                </ResponsiveContainer>

            </div>
        </div>
    )
}