import { useState } from 'react'
import { RefreshCw, Loader, TrendingUp, TrendingDown, Minus, FileQuestion, Bot, Cpu, UserCog, AlertTriangle, Sparkles } from 'lucide-react'

const STATUS = {
  improving: { label: 'Improving', cls: 'risk-green', icon: TrendingUp },
  stable: { label: 'Stable', cls: 'risk-blue', icon: Minus },
  mixed: { label: 'Mixed picture', cls: 'risk-yellow', icon: Minus },
  worsening: { label: 'Needs attention', cls: 'risk-red', icon: TrendingDown },
  insufficient_data: { label: 'Not enough data', cls: 'risk-blue', icon: FileQuestion },
}

function timeAgo(iso) {
  if (!iso) return ''
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString()
}

/** Top of the AI tab: one-glance verdict + regenerate + profile nudge. */
export default function SummaryCard({ data, loading, error, onGenerate, profile, onEditProfile }) {
  const [more, setMore] = useState(false)
  const ins = data?.insights
  const s = STATUS[ins?.overall_status] || STATUS.mixed
  const SIcon = s.icon
  const missing = profile?.missing || []

  return (
    <section className="card p-4 md:p-5 bg-gradient-to-br from-[#161a29] to-[#11131f]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {ins && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}>
                <SIcon size={11} /> {s.label}
              </span>
            )}
            {data && (
              <span className="inline-flex items-center gap-1 text-[10px] text-stone-500" title={data.error || ''}>
                {data.source === 'gemini' ? <Bot size={11} /> : <Cpu size={11} />}
                {data.source === 'gemini'
                  ? `Rewritten by Gemini (${data.model})`
                  : data.error ? 'Written by the app\'s rules — AI unavailable' : 'Written by the app\'s rules'} · {timeAgo(data.generated_at)}
              </span>
            )}
            {data?.is_stale && ins && (
              <button onClick={() => onGenerate(true)} className="text-[10px] font-semibold px-2 py-0.5 rounded-full border risk-yellow">
                New data — refresh
              </button>
            )}
          </div>

          {loading && !ins ? (
            <p className="text-sm text-stone-300 flex items-center gap-2 py-2"><Loader size={14} className="animate-spin text-brand-400" /> Reading your reports, wearables and medicines…</p>
          ) : ins ? (
            <>
              <h2 className="text-base md:text-lg font-semibold text-white leading-snug">{ins.headline}</h2>
              <p className={`text-xs md:text-[13px] text-stone-400 leading-relaxed ${more ? '' : 'line-clamp-2'}`}>{ins.summary}</p>
              {ins.summary?.length > 160 && (
                <button onClick={() => setMore(m => !m)} className="text-[11px] text-brand-400">{more ? 'Show less' : 'Read more'}</button>
              )}
            </>
          ) : (
            <p className="text-sm text-stone-300 py-1">Get a plain-language summary of everything in your health record.</p>
          )}
          {error && <p className="text-[11px] text-rose-400 flex items-center gap-1"><AlertTriangle size={11} /> {error}</p>}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={onEditProfile} className="btn-secondary text-xs px-2.5 py-1.5" title="Edit your health profile" aria-label="Edit your health profile">
          <UserCog size={13} />
          <span className="hidden sm:inline">Profile{profile ? ` ${profile.filled}/${profile.total}` : ''}</span>
        </button>
        {ins && data?.source !== 'gemini' && (
          <button
            onClick={() => onGenerate(true, true)}
            disabled={loading}
            className="btn-secondary text-xs px-2.5 py-1.5 shrink-0"
            title="Ask Gemini to rewrite these insights in plain words (uses one AI call)"
          >
            <Sparkles size={13} />
            <span className="hidden sm:inline">Rewrite with AI</span>
          </button>
        )}
        <button
          onClick={() => onGenerate(Boolean(ins))}
          disabled={loading}
          className={ins ? 'btn-secondary text-xs px-3 py-1.5 shrink-0' : 'btn-primary text-xs px-3.5 py-2 shrink-0'}
          title={ins ? 'Regenerate insights' : 'Generate insights'}
        >
          {loading ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          <span className="hidden sm:inline">{ins ? 'Refresh' : 'Generate'}</span>
        </button>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/[0.07] flex items-center justify-between gap-3">
          <p className="text-[11px] text-stone-400">
            <span className="text-amber-400 font-semibold">Profile {profile.filled}/{profile.total}</span> — add {missing.slice(0, 3).join(', ').toLowerCase()}
            {missing.length > 3 ? ` +${missing.length - 3} more` : ''} for more personal results.
          </p>
          <button onClick={onEditProfile} className="btn-ghost text-[11px] px-2 py-1 shrink-0"><UserCog size={12} /> Complete</button>
        </div>
      )}
    </section>
  )
}
