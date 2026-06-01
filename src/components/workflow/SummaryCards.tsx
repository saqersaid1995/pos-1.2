interface SummaryCardsProps {
  counts: Record<string, number>;
}

const SECTIONS = [
  { key: "total",           label: "نشطة",   color: undefined },
  { key: "received",        label: "مستلمة",  color: undefined },
  { key: "ready-for-pickup",label: "جاهزة",   color: "#10B981" },
  { key: "delivered",       label: "مسلمة",   color: undefined },
  { key: "urgent",          label: "عاجلة",   color: "#F59E0B" },
];

export default function SummaryCards({ counts }: SummaryCardsProps) {
  return (
    <div
      style={{
        display: "flex",
        borderRadius: 10,
        border: "0.5px solid var(--border-subtle)",
        background: "var(--bg-elevated)",
        overflow: "hidden",
      }}
    >
      {SECTIONS.map((s, i) => (
        <div key={s.key} style={{ display: "flex", flex: 1 }}>
          {i > 0 && (
            <div style={{ width: 1, background: "var(--border-subtle)", alignSelf: "stretch" }} />
          )}
          <div
            style={{
              flex: 1,
              padding: "12px 16px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                fontFamily: "monospace",
                lineHeight: 1,
                color: s.color || "var(--text-primary)",
              }}
            >
              {counts[s.key] ?? 0}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
              {s.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
