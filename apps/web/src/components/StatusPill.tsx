export default function StatusPill({ ok }: { ok: boolean | null }) {
  const cls = ok === null ? "bg-slate-200 text-slate-700" : ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800";
  const label = ok === null ? "No data" : ok ? "Up" : "Down";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
