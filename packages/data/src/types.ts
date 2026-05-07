import type { D1Database, KVNamespace } from "@cloudflare/workers-types";
import type {
  AdminExtensionInviteStatus,
  ChainId,
  WalletAiProviderMeta,
  WalletFinderAiInsight,
  WalletCurationStatus,
  WalletListQuery,
  WalletListSort,
  WalletLabelKind,
  WalletLabelSource,
  WalletSourceType
} from "@weather-smart-money/core";

export type D1DatabaseLike = D1Database;
export type KVNamespaceLike = KVNamespace;

export type DatasetKey = "address_labels" | "finder_ai";

export interface WalletInput {
  chain?: ChainId;
  address: string;
  displayName: string;
  alias?: string;
  bio?: string;
  strategyFocus?: string;
  teamNote?: string;
  firstSeenAt?: string;
  sourceType?: WalletSourceType;
  curationStatus?: WalletCurationStatus;
  lastImportedAt?: string;
  importBatchId?: string;
}

export interface WalletListFilters extends WalletListQuery {}

export interface WalletUpdate {
  address?: string;
  displayName?: string;
  alias?: string | null;
  bio?: string | null;
  strategyFocus?: string | null;
  teamNote?: string | null;
  firstSeenAt?: string;
  sourceType?: WalletSourceType;
  curationStatus?: WalletCurationStatus;
  lastImportedAt?: string | null;
  importBatchId?: string | null;
}

export interface WalletDeleteInput {
  actor?: string;
  reason?: string | null;
}

export interface WalletLabelInput {
  name: string;
  value: string;
  kind?: WalletLabelKind;
  source?: WalletLabelSource;
  evidence?: string;
  verificationNote?: string;
  sourceNote?: string;
}

export interface WalletLabelPatchInput {
  name?: string;
  value?: string;
  kind?: WalletLabelKind;
  source?: WalletLabelSource;
  evidence?: string;
  verificationNote?: string;
  sourceNote?: string;
}

export interface ExtensionInviteRecord {
  code: string;
  memberLabel: string;
  status: AdminExtensionInviteStatus;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string | null;
  boundUserId?: string | null;
  boundUserEmail?: string | null;
  boundAt?: string | null;
}

export interface ExtensionUserRecord {
  id: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  inviteCode?: string | null;
  memberLabel?: string | null;
  boundAt?: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  disabledAt?: string | null;
}

export interface ExtensionSessionRecord {
  id: string;
  refreshTokenHash: string;
  memberLabel: string;
  inviteCode: string;
  userId?: string | null;
  userEmail?: string | null;
  deviceLabel?: string | null;
  extensionVersion?: string | null;
  refreshExpiresAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string | null;
}

export interface WalletSavedViewRecord {
  id: string;
  name: string;
  scope: "team";
  queryJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletImportBatchRecord {
  id: string;
  sourceType: WalletSourceType;
  sourceName?: string | null;
  provider?: WalletAiProviderMeta["provider"] | null;
  model?: string | null;
  fallbackUsed: boolean;
  actor: string;
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  createdAt: string;
}

export interface WalletFinderAiInsightInput extends Omit<WalletFinderAiInsight, "walletId" | "createdAt" | "updatedAt"> {
  importBatchId?: string;
}

export interface WalletPageInput extends WalletListFilters {
  sort?: WalletListSort;
  limit?: number;
  cursor?: string;
}

export interface DataEnvironment {
  SMART_MONEY_DB: D1DatabaseLike;
  SMART_MONEY_CACHE?: KVNamespaceLike;
  ADMIN_BASE_URL: string;
  PUBLIC_EXTENSION_BASE_URL?: string;
}
