import {
    Footprints,
    Moon,
    HeartPulse,
    Flame,
    Activity,
} from 'lucide-react'


function MetricCard({ icon, label, value, unit }) {
    return (
        <div className="card flex items-center gap-4 p-5">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-stone-800">
                {icon}
            </div>

            <div className="min-w-0">
                <p className="text-xs text-stone-500 uppercase tracking-wide">
                    {label}
                </p>

                <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-semibold text-white">
                        {value}
                    </span>

                    {unit && (
                        <span className="text-xs text-stone-400">
                            {unit}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}


export default function WearableOverview({ data }) {
    if (!data) return null

    return (
        <section className="space-y-4">

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-semibold text-white">
                        Lifestyle & Activity
                    </h2>

                    <p className="text-xs text-stone-500 mt-0.5">
                        Wearable health metrics
                    </p>
                </div>

                <span className="text-xs text-stone-500">
                    {data.date}
                </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">

                <MetricCard
                    icon={<Footprints size={20} className="text-emerald-400" />}
                    label="Steps"
                    value={data.steps?.toLocaleString()}
                />

                <MetricCard
                    icon={<Moon size={20} className="text-violet-400" />}
                    label="Sleep"
                    value={data.sleep_hours}
                    unit="hrs"
                />

                <MetricCard
                    icon={<HeartPulse size={20} className="text-red-400" />}
                    label="Resting HR"
                    value={data.resting_heart_rate}
                    unit="BPM"
                />

                <MetricCard
                    icon={<Activity size={20} className="text-blue-400" />}
                    label="Active"
                    value={data.active_minutes}
                    unit="min"
                />

                <MetricCard
                    icon={<Flame size={20} className="text-orange-400" />}
                    label="Calories"
                    value={data.calories_burned?.toLocaleString()}
                    unit="kcal"
                />

            </div>
        </section>
    )
}