import type {
  AlertEvent,
  Market,
  NoteAuditLog,
  PositionSnapshot,
  Trade,
  Wallet,
  WalletLabel,
  WatchlistEntry
} from "./types.js";

export const wallets: Wallet[] = [
  {
    id: "wallet-001",
    chain: "polygon",
    address: "0x3eae62bde2d83aba0fe84018921b2693ec645e6d",
    normalizedAddress: "0x3eae62bde2d83aba0fe84018921b2693ec645e6d",
    displayName: "Tokyo Temp Specialist",
    alias: "东京温度专家",
    bio: "过去三个月专注东京和首尔温度市场，入场节奏偏早。",
    firstSeenAt: "2023-09-12T09:00:00.000Z",
    strategyFocus: "东亚城市温度与短周期突发天气",
    teamNote: "适合做早盘方向验证。",
    watchlisted: true,
    createdAt: "2026-04-05T12:00:00.000Z",
    updatedAt: "2026-04-05T12:03:00.000Z",
    sourceType: "system",
    curationStatus: "active"
  },
  {
    id: "wallet-002",
    chain: "polygon",
    address: "0x0061f603a457754bae0241f1fb34f0ce6a5e8fd6",
    normalizedAddress: "0x0061f603a457754bae0241f1fb34f0ce6a5e8fd6",
    displayName: "Storm Rotation Desk",
    alias: "风暴轮动台",
    bio: "跨天气与新闻赛道切换较快，仓位弹性大。",
    firstSeenAt: "2024-01-18T11:30:00.000Z",
    strategyFocus: "风暴警报、极端天气和跨赛道轮动",
    teamNote: "强信号但噪音高，需要持续观察。",
    watchlisted: true,
    createdAt: "2026-04-05T12:10:00.000Z",
    updatedAt: "2026-04-05T12:12:00.000Z",
    sourceType: "system",
    curationStatus: "active"
  },
  {
    id: "wallet-003",
    chain: "polygon",
    address: "0x13bb56d959795a8b817fb9fa0a7a9c43c805c279",
    normalizedAddress: "0x13bb56d959795a8b817fb9fa0a7a9c43c805c279",
    displayName: "Stable Climate Curve",
    alias: "稳曲线气候仓",
    bio: "胜率稳定，几乎只做 weather，偏中等仓位滚动。",
    firstSeenAt: "2022-11-04T08:00:00.000Z",
    strategyFocus: "温度区间、降雨量和结算前再定价",
    teamNote: "可作为稳健对标样本。",
    watchlisted: false,
    createdAt: "2026-04-05T12:05:00.000Z",
    updatedAt: "2026-04-05T12:05:00.000Z",
    sourceType: "system",
    curationStatus: "active"
  },
  {
    id: "wallet-004",
    chain: "polygon",
    address: "0x87046cc15301a1eb23a62d5a53d44301c4963b94",
    normalizedAddress: "0x87046cc15301a1eb23a62d5a53d44301c4963b94",
    displayName: "Rapid Reversal Rain",
    alias: "追雨反手哥",
    bio: "喜欢在高热度天气事件中快进快出，容易追高。",
    firstSeenAt: "2024-10-21T14:12:00.000Z",
    strategyFocus: "突发降雨与短时温差波动",
    teamNote: "适合反向观察。",
    watchlisted: false,
    createdAt: "2026-04-05T12:15:00.000Z",
    updatedAt: "2026-04-05T12:15:00.000Z",
    sourceType: "system",
    curationStatus: "active"
  }
];

export const markets: Market[] = [
  {
    id: "market-001",
    slug: "tokyo-high-over-26-apr-06",
    title: "Tokyo high above 26C on April 6?",
    sector: "weather",
    location: "Tokyo",
    category: "temperature",
    openAt: "2026-04-05T00:00:00.000Z",
    closeAt: "2026-04-06T14:00:00.000Z",
    resolutionSource: "JMA official reading",
    peakVolumeAt: "2026-04-06T05:30:00.000Z",
    status: "open"
  },
  {
    id: "market-002",
    slug: "seoul-rain-over-20mm-apr-07",
    title: "Seoul rainfall above 20mm on April 7?",
    sector: "weather",
    location: "Seoul",
    category: "rainfall",
    openAt: "2026-04-05T12:00:00.000Z",
    closeAt: "2026-04-07T14:00:00.000Z",
    resolutionSource: "KMA official reading",
    peakVolumeAt: "2026-04-06T10:00:00.000Z",
    status: "open"
  },
  {
    id: "market-003",
    slug: "new-york-wind-alert-apr-08",
    title: "NYC wind alert issued by April 8?",
    sector: "weather",
    location: "New York",
    category: "wind",
    openAt: "2026-04-06T02:00:00.000Z",
    closeAt: "2026-04-08T18:00:00.000Z",
    resolutionSource: "NOAA alert bulletin",
    peakVolumeAt: "2026-04-06T18:00:00.000Z",
    status: "open"
  },
  {
    id: "market-004",
    slug: "berlin-freeze-apr-02",
    title: "Berlin frost before April 2?",
    sector: "weather",
    location: "Berlin",
    category: "temperature",
    openAt: "2026-03-31T00:00:00.000Z",
    closeAt: "2026-04-02T06:00:00.000Z",
    resolutionSource: "DWD official reading",
    peakVolumeAt: "2026-04-01T05:00:00.000Z",
    status: "resolved"
  }
];

export const trades: Trade[] = [
  {
    id: "trade-001",
    walletId: "wallet-001",
    marketId: "market-001",
    side: "yes",
    outcome: "pending",
    price: 0.47,
    averagePrice1h: 0.53,
    sizeUsd: 1200,
    realizedPnlUsd: 0,
    enteredAt: "2026-04-06T03:40:00.000Z",
    marketPeakAt: "2026-04-06T05:30:00.000Z",
    sector: "weather"
  },
  {
    id: "trade-002",
    walletId: "wallet-001",
    marketId: "market-004",
    side: "no",
    outcome: "win",
    price: 0.41,
    averagePrice1h: 0.45,
    sizeUsd: 900,
    realizedPnlUsd: 320,
    enteredAt: "2026-04-01T01:15:00.000Z",
    exitedAt: "2026-04-02T06:05:00.000Z",
    marketPeakAt: "2026-04-01T05:00:00.000Z",
    sector: "weather"
  },
  {
    id: "trade-003",
    walletId: "wallet-001",
    marketId: "market-002",
    side: "yes",
    outcome: "win",
    price: 0.35,
    averagePrice1h: 0.4,
    sizeUsd: 1100,
    realizedPnlUsd: 540,
    enteredAt: "2026-04-06T08:30:00.000Z",
    exitedAt: "2026-04-07T14:10:00.000Z",
    marketPeakAt: "2026-04-06T10:00:00.000Z",
    sector: "weather"
  },
  {
    id: "trade-004",
    walletId: "wallet-002",
    marketId: "market-001",
    side: "no",
    outcome: "pending",
    price: 0.62,
    averagePrice1h: 0.55,
    sizeUsd: 4200,
    realizedPnlUsd: 0,
    enteredAt: "2026-04-06T05:20:00.000Z",
    marketPeakAt: "2026-04-06T05:30:00.000Z",
    sector: "weather"
  },
  {
    id: "trade-005",
    walletId: "wallet-002",
    marketId: "market-003",
    side: "yes",
    outcome: "loss",
    price: 0.68,
    averagePrice1h: 0.56,
    sizeUsd: 3700,
    realizedPnlUsd: -910,
    enteredAt: "2026-04-06T17:40:00.000Z",
    exitedAt: "2026-04-06T21:00:00.000Z",
    marketPeakAt: "2026-04-06T18:00:00.000Z",
    sector: "weather"
  },
  {
    id: "trade-006",
    walletId: "wallet-002",
    marketId: "market-002",
    side: "yes",
    outcome: "loss",
    price: 0.71,
    averagePrice1h: 0.58,
    sizeUsd: 1500,
    realizedPnlUsd: -450,
    enteredAt: "2026-04-06T09:50:00.000Z",
    exitedAt: "2026-04-07T14:08:00.000Z",
    marketPeakAt: "2026-04-06T10:00:00.000Z",
    sector: "weather"
  },
  {
    id: "trade-007",
    walletId: "wallet-003",
    marketId: "market-001",
    side: "yes",
    outcome: "pending",
    price: 0.49,
    averagePrice1h: 0.52,
    sizeUsd: 980,
    realizedPnlUsd: 0,
    enteredAt: "2026-04-06T02:00:00.000Z",
    marketPeakAt: "2026-04-06T05:30:00.000Z",
    sector: "weather"
  },
  {
    id: "trade-008",
    walletId: "wallet-003",
    marketId: "market-004",
    side: "no",
    outcome: "win",
    price: 0.44,
    averagePrice1h: 0.48,
    sizeUsd: 1050,
    realizedPnlUsd: 260,
    enteredAt: "2026-04-01T00:20:00.000Z",
    exitedAt: "2026-04-02T06:03:00.000Z",
    marketPeakAt: "2026-04-01T05:00:00.000Z",
    sector: "weather"
  },
  {
    id: "trade-009",
    walletId: "wallet-003",
    marketId: "market-002",
    side: "yes",
    outcome: "win",
    price: 0.42,
    averagePrice1h: 0.44,
    sizeUsd: 1000,
    realizedPnlUsd: 330,
    enteredAt: "2026-04-06T07:15:00.000Z",
    exitedAt: "2026-04-07T14:06:00.000Z",
    marketPeakAt: "2026-04-06T10:00:00.000Z",
    sector: "weather"
  },
  {
    id: "trade-010",
    walletId: "wallet-004",
    marketId: "market-002",
    side: "yes",
    outcome: "loss",
    price: 0.75,
    averagePrice1h: 0.57,
    sizeUsd: 640,
    realizedPnlUsd: -220,
    enteredAt: "2026-04-06T09:58:00.000Z",
    exitedAt: "2026-04-07T14:01:00.000Z",
    marketPeakAt: "2026-04-06T10:00:00.000Z",
    sector: "weather"
  },
  {
    id: "trade-011",
    walletId: "wallet-004",
    marketId: "market-002",
    side: "no",
    outcome: "pending",
    price: 0.28,
    averagePrice1h: 0.42,
    sizeUsd: 680,
    realizedPnlUsd: 0,
    enteredAt: "2026-04-06T10:10:00.000Z",
    marketPeakAt: "2026-04-06T10:00:00.000Z",
    sector: "weather"
  },
  {
    id: "trade-012",
    walletId: "wallet-004",
    marketId: "market-003",
    side: "yes",
    outcome: "loss",
    price: 0.67,
    averagePrice1h: 0.55,
    sizeUsd: 700,
    realizedPnlUsd: -180,
    enteredAt: "2026-04-06T18:10:00.000Z",
    exitedAt: "2026-04-06T19:30:00.000Z",
    marketPeakAt: "2026-04-06T18:00:00.000Z",
    sector: "weather"
  }
];

export const positionSnapshots: PositionSnapshot[] = [
  {
    id: "position-001",
    walletId: "wallet-001",
    marketId: "market-001",
    capturedAt: "2026-04-06T06:00:00.000Z",
    exposureUsd: 1200,
    avgEntryPrice: 0.47,
    unrealizedPnlUsd: 115,
    side: "yes"
  },
  {
    id: "position-002",
    walletId: "wallet-002",
    marketId: "market-001",
    capturedAt: "2026-04-06T06:00:00.000Z",
    exposureUsd: 4200,
    avgEntryPrice: 0.62,
    unrealizedPnlUsd: -260,
    side: "no"
  },
  {
    id: "position-003",
    walletId: "wallet-003",
    marketId: "market-001",
    capturedAt: "2026-04-06T06:00:00.000Z",
    exposureUsd: 980,
    avgEntryPrice: 0.49,
    unrealizedPnlUsd: 66,
    side: "yes"
  },
  {
    id: "position-004",
    walletId: "wallet-004",
    marketId: "market-002",
    capturedAt: "2026-04-06T10:20:00.000Z",
    exposureUsd: 680,
    avgEntryPrice: 0.28,
    unrealizedPnlUsd: 42,
    side: "no"
  }
];

export const walletLabels: WalletLabel[] = [
  {
    id: "label-001",
    walletId: "wallet-001",
    kind: "alias",
    source: "user",
    name: "人物别名",
    value: "东京温度专家",
    createdAt: "2026-04-05T12:00:00.000Z"
  },
  {
    id: "label-002",
    walletId: "wallet-001",
    kind: "group",
    source: "user",
    name: "分组",
    value: "东京 weather 核心观察",
    createdAt: "2026-04-05T12:02:00.000Z"
  },
  {
    id: "label-003",
    walletId: "wallet-003",
    kind: "strategy",
    source: "user",
    name: "策略印象",
    value: "慢节奏稳曲线",
    createdAt: "2026-04-05T12:05:00.000Z"
  }
];

export const watchlistEntries: WatchlistEntry[] = [
  {
    id: "watch-001",
    walletId: "wallet-001",
    createdAt: "2026-04-05T12:00:00.000Z",
    note: "东京温度高频验证"
  },
  {
    id: "watch-002",
    walletId: "wallet-002",
    createdAt: "2026-04-05T12:10:00.000Z",
    note: "高弹性但噪音大"
  }
];

export const noteAuditLogs: NoteAuditLog[] = [
  {
    id: "audit-001",
    walletId: "wallet-001",
    action: "create_note",
    content: "过去 3 个月东京相关市场累计 +180%。",
    createdAt: "2026-04-05T12:03:00.000Z",
    actor: "Team Alpha"
  },
  {
    id: "audit-002",
    walletId: "wallet-002",
    action: "create_note",
    content: "赛道切换快，适合作为风险反例。",
    createdAt: "2026-04-05T12:12:00.000Z",
    actor: "Team Alpha"
  }
];

export const alertEvents: AlertEvent[] = [
  {
    id: "alert-001",
    walletId: "wallet-002",
    marketId: "market-001",
    sector: "weather",
    eventType: "position_surge",
    severity: "high",
    status: "open",
    side: "no",
    sizeDeltaUsd: 2650,
    priceDeviationPct: 12.7,
    historicalWinRate: 0.52,
    alertScore: 86,
    evidence: "单市场仓位相较 30 日均值放大 2.8 倍，并伴随价格劣势入场。",
    occurredAt: "2026-04-06T05:25:00.000Z",
    dedupeKey: "wallet-002-market-001-position-surge"
  },
  {
    id: "alert-002",
    walletId: "wallet-004",
    marketId: "market-002",
    sector: "weather",
    eventType: "high_frequency_reversal",
    severity: "medium",
    status: "open",
    side: "no",
    sizeDeltaUsd: 680,
    priceDeviationPct: -7.5,
    historicalWinRate: 0.32,
    alertScore: 73,
    evidence: "12 分钟内从 YES 翻到 NO，风格显著不稳定。",
    occurredAt: "2026-04-06T10:12:00.000Z",
    dedupeKey: "wallet-004-market-002-high-frequency-reversal"
  }
];
