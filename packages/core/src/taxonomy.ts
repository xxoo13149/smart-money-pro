import type { AlertEventType } from "./types.js";
import type {
  AddressLabelBadge,
  WalletLabelKind,
  WalletPrimarySignalKind
} from "./types.js";

export const SYSTEM_LABEL_NAMES = [
  ">1年老钱包",
  "胜率>=60%",
  "Weather专精",
  "早期入场型",
  "PnL曲线稳健",
  "高频反手",
  "赛道切换中"
] as const;

export const ALERT_EVENT_META: Record<
  AlertEventType,
  { label: string; description: string }
> = {
  sector_rotation: {
    label: "赛道切换",
    description: "近 7 天 weather 占比下降并出现非 weather 交易偏移。"
  },
  position_surge: {
    label: "仓位突增",
    description: "单市场或日内总敞口相较历史基线明显放大。"
  },
  chasing_entry: {
    label: "追高入场",
    description: "入场价格显著劣于该市场过去 1 小时均价。"
  },
  drawdown_streak: {
    label: "异常连败",
    description: "近 10 到 20 笔表现显著弱化，盈亏比同步恶化。"
  },
  high_frequency_reversal: {
    label: "高频反手",
    description: "短时间内同一地址多次翻转方向，风格不稳定。"
  }
};

export const PRIMARY_SIGNAL_KIND_PRIORITY: Record<WalletPrimarySignalKind, number> =
  {
    payout_region: 500,
    winrate_region: 400,
    frequency_region: 300,
    geo_specialty: 200,
    trader_archetype: 100
  };

export const PRIMARY_SIGNAL_LABEL_KINDS = new Set<WalletLabelKind>([
  "payout_region",
  "winrate_region",
  "frequency_region",
  "geo_specialty",
  "trader_archetype"
]);

export const LABEL_KIND_PRIORITY: Partial<Record<WalletLabelKind, number>> = {
  payout_region: 700,
  winrate_region: 620,
  frequency_region: 540,
  geo_specialty: 460,
  trader_archetype: 380,
  new_wallet_signal: 300,
  early_entry_signal: 220,
  activity_level: 120
};

const BADGE_TONE_PRIORITY: Record<AddressLabelBadge["tone"], number> = {
  alert: 40,
  watch: 30,
  danger: 25,
  "ai-review": 22,
  accent: 50,
  neutral: 10
};

const FALLBACK_PRIORITY = 0;

export const isPrimarySignalLabelKind = (
  kind?: WalletLabelKind
): kind is WalletPrimarySignalKind =>
  kind !== undefined && PRIMARY_SIGNAL_LABEL_KINDS.has(kind);

export const getPrimarySignalPriority = (kind?: WalletLabelKind) =>
  isPrimarySignalLabelKind(kind) ? PRIMARY_SIGNAL_KIND_PRIORITY[kind] : FALLBACK_PRIORITY;

export const getLabelKindPriority = (kind?: WalletLabelKind) =>
  kind ? LABEL_KIND_PRIORITY[kind] ?? getPrimarySignalPriority(kind) : FALLBACK_PRIORITY;

export const normalizeWalletLabelText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "")
    .replace(/[、，,;；:：/|()[\]{}【】<>《》"'`]/gu, "");

export const getWalletLabelDisplayKey = (kind: WalletLabelKind | undefined, text: string) =>
  `${kind ?? "group"}:${normalizeWalletLabelText(text)}`;

export const getAddressBadgePriority = (badge: Pick<
  AddressLabelBadge,
  "priority" | "kind" | "isPrimary" | "tone"
>) =>
  (badge.priority ?? 0) +
  getLabelKindPriority(badge.kind) +
  (badge.isPrimary ? 200 : 0) +
  (BADGE_TONE_PRIORITY[badge.tone] ?? 0);

export const compareAddressBadges = (left: AddressLabelBadge, right: AddressLabelBadge) =>
  getAddressBadgePriority(right) - getAddressBadgePriority(left) ||
  left.text.localeCompare(right.text, "zh-CN");

export const sortAddressBadges = <T extends AddressLabelBadge>(badges: readonly T[]) =>
  [...badges].sort(compareAddressBadges);

export const dedupeAddressBadges = <T extends AddressLabelBadge>(badges: readonly T[]) => {
  const seen = new Set<string>();
  return badges.filter((badge) => {
    const key = getWalletLabelDisplayKey(badge.kind, badge.text);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};
