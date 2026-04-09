import Link from "next/link";
import {
  shortenAddress,
  type AlertEvent,
  type Wallet,
  type WalletLabel,
  type WalletMetrics
} from "@weather-smart-money/core";

export const WalletPreview = ({
  wallet,
  metrics,
  labels,
  alerts
}: {
  wallet: Wallet;
  metrics: WalletMetrics;
  labels: WalletLabel[];
  alerts: AlertEvent[];
}) => (
  <Link href={`/wallets/${wallet.id}`} className="wallet-link">
    <article className="wallet-preview">
      <div className="subtle-row">
        <span className="eyebrow">{wallet.watchlisted ? "Watchlisted" : "Observation"}</span>
        <span>{alerts.length} red flags</span>
      </div>
      <div>
        <h3>{wallet.alias ?? wallet.displayName}</h3>
        <p className="wallet-preview__bio">{wallet.bio}</p>
        <div className="identity-address" style={{ marginTop: "0.4rem" }}>
          {shortenAddress(wallet.address)}
        </div>
      </div>
      <div className="wallet-preview__metrics">
        <span>Win {metrics.weatherWinRate}%</span>
        <span>Lead {metrics.averageEntryLeadMinutes}m</span>
        <span>Curve {metrics.stableCurveScore}</span>
      </div>
      <div className="badge-cluster">
        {labels.slice(0, 4).map((label) => (
          <span key={label.id} className="badge">
            {label.name}
          </span>
        ))}
      </div>
      <div className="wallet-preview__footer">
        <span>{wallet.strategyFocus}</span>
      </div>
    </article>
  </Link>
);
