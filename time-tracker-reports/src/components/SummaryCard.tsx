type SummaryCardProps = {
  title: string;
  value: string;
  hint?: string;
};

export default function SummaryCard({ title, value, hint }: SummaryCardProps) {
  return (
    <div className="rounded-xl bg-slate-800 p-4 shadow">
      <p className="text-sm uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

