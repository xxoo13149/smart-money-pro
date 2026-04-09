import type { AlertEvent } from "@weather-smart-money/core";

const SEVERITY_COLORS: Record<AlertEvent["severity"], string> = {
  critical: "#f25f5c",
  high: "#ffb347",
  medium: "#4fd1c5",
  low: "#9bcdf1"
};

export const AlertRow = ({ alert }: { alert: AlertEvent }) => (
  <div className="alert-row">
    <div>
      <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>{alert.eventType.replace(/_/g, " ")}</div>
      <div style={{ color: "rgba(226, 233, 255, 0.72)", fontSize: "0.84rem", lineHeight: 1.5 }}>
        {alert.evidence}
      </div>
    </div>
    <div style={{ textAlign: "right" }}>
      <div className="alert-row__severity" style={{ color: SEVERITY_COLORS[alert.severity] }}>
        {alert.severity}
      </div>
      <div className="action-pill">{alert.alertScore} pts</div>
    </div>
  </div>
);
