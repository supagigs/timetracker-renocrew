type SummaryCardProps = {
  title: string;
  value: string;
  hint?: string;
};

export default function SummaryCard({ title, value, hint }: SummaryCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

