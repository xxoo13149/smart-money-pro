export const Metric = ({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) => (
  <div>
    <div className="metric-value">
      {value}
      {suffix && <span style={{ fontSize: "1rem", marginLeft: "0.25rem" }}>{suffix}</span>}
    </div>
    <div className="metric-label">{label}</div>
  </div>
);
