import type {
  WalletListPanelMode,
  WalletListQuery,
  WalletSavedViewQuery,
  WalletListSort,
  WalletListStatus,
  WalletSourceType
} from "@weather-smart-money/core";

type QueryLike =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

const DEFAULT_SORT: WalletListSort = "updated_desc";
// 默认 25 行：地址库每行都带完整画像，单页 100 行会让 page-data 响应膨胀到 1.7MB，
// 在 Workers Free 上既慢又容易触发资源限制。工具栏可切到 50/100。
const DEFAULT_LIMIT = 25;
const VALID_STATUSES = new Set<WalletListStatus>([
  "all",
  "active",
  "watchlist",
  "review_needed",
  "deleted"
]);
const VALID_SOURCES = new Set<WalletSourceType | "all">([
  "all",
  "manual",
  "finder",
  "ai",
  "file",
  "system"
]);
const VALID_SORTS = new Set<WalletListSort>(["updated_desc", "created_desc", "name_asc"]);
const VALID_PANELS = new Set<WalletListPanelMode>(["inspect", "edit"]);

const readValues = (source: QueryLike, key: string) => {
  if (source instanceof URLSearchParams) {
    return source.getAll(key);
  }

  const value = source[key];
  return Array.isArray(value) ? value : value ? [value] : [];
};

const readSingleValue = (source: QueryLike, key: string) => readValues(source, key)[0];

const normalizeLabels = (values?: string[]) =>
  Array.from(
    new Set(
      (values ?? [])
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

export const clampWalletListLimit = (value?: number) => {
  if (!value || Number.isNaN(value)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(200, Math.trunc(value)));
};

export const normalizeWalletListQuery = (input?: Partial<WalletListQuery>): WalletListQuery => {
  const normalizedLabels = normalizeLabels(input?.labels);
  const normalizedVersion = input?.version?.trim() || undefined;
  const normalizedStatus =
    input?.status && VALID_STATUSES.has(input.status) ? input.status : "all";
  const normalizedSource =
    input?.source && VALID_SOURCES.has(input.source) ? input.source : "all";
  const normalizedSort =
    input?.sort && VALID_SORTS.has(input.sort) ? input.sort : DEFAULT_SORT;
  const normalizedSelected = input?.selected?.trim() || undefined;
  const normalizedPanel =
    normalizedSelected && input?.panel && VALID_PANELS.has(input.panel) ? input.panel : undefined;

  return {
    q: input?.q?.trim() || undefined,
    view: input?.view?.trim() || undefined,
    status: normalizedStatus,
    source: normalizedSource,
    batch: input?.batch?.trim() || undefined,
    labels: normalizedLabels.length > 0 ? normalizedLabels : undefined,
    version: normalizedVersion,
    sort: normalizedSort,
    cursor: input?.cursor?.trim() || undefined,
    limit: clampWalletListLimit(input?.limit),
    includeDeleted: Boolean(input?.includeDeleted),
    createdAfter: input?.createdAfter?.trim() || undefined,
    createdBefore: input?.createdBefore?.trim() || undefined,
    selected: normalizedSelected,
    panel: normalizedPanel
  };
};

export const parseWalletListQueryInput = (
  source: QueryLike
): Partial<WalletListQuery> => {
  const limitRaw = readSingleValue(source, "limit");
  const parsedLimit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const statusRaw = readSingleValue(source, "status");
  const sourceRaw = readSingleValue(source, "source");
  const sortRaw = readSingleValue(source, "sort");
  const panelRaw = readSingleValue(source, "panel");

  return {
    q: readSingleValue(source, "q"),
    view: readSingleValue(source, "view"),
    status: statusRaw && VALID_STATUSES.has(statusRaw as WalletListStatus)
      ? (statusRaw as WalletListStatus)
      : undefined,
    source: sourceRaw && VALID_SOURCES.has(sourceRaw as WalletSourceType | "all")
      ? (sourceRaw as WalletSourceType | "all")
      : undefined,
    batch: readSingleValue(source, "batch"),
    labels: readValues(source, "labels"),
    version: readSingleValue(source, "version"),
    sort: sortRaw && VALID_SORTS.has(sortRaw as WalletListSort)
      ? (sortRaw as WalletListSort)
      : undefined,
    cursor: readSingleValue(source, "cursor"),
    limit: parsedLimit,
    includeDeleted: readSingleValue(source, "includeDeleted") === "true",
    createdAfter: readSingleValue(source, "createdAfter"),
    createdBefore: readSingleValue(source, "createdBefore"),
    selected: readSingleValue(source, "selected"),
    panel: panelRaw && VALID_PANELS.has(panelRaw as WalletListPanelMode)
      ? (panelRaw as WalletListPanelMode)
      : undefined
  };
};

export const parseWalletListQuery = (source: QueryLike): WalletListQuery =>
  normalizeWalletListQuery(parseWalletListQueryInput(source));

export const resolveWalletListQuery = (
  input?: Partial<WalletListQuery>,
  savedViewQuery?: WalletSavedViewQuery
) =>
  normalizeWalletListQuery({
    ...savedViewQuery,
    ...input,
    q: input?.q !== undefined ? input.q : savedViewQuery?.q,
    status: input?.status !== undefined ? input.status : savedViewQuery?.status,
    source: input?.source !== undefined ? input.source : savedViewQuery?.source,
    batch: input?.batch !== undefined ? input.batch : savedViewQuery?.batch,
    labels: input?.labels !== undefined ? input.labels : savedViewQuery?.labels,
    version: input?.version !== undefined ? input.version : savedViewQuery?.version,
    sort: input?.sort !== undefined ? input.sort : savedViewQuery?.sort,
    cursor: input?.cursor,
    limit: input?.limit !== undefined ? input.limit : savedViewQuery?.limit,
    includeDeleted:
      input?.includeDeleted !== undefined
        ? input.includeDeleted
        : savedViewQuery?.includeDeleted,
    createdAfter:
      input?.createdAfter !== undefined ? input.createdAfter : savedViewQuery?.createdAfter,
    createdBefore:
      input?.createdBefore !== undefined ? input.createdBefore : savedViewQuery?.createdBefore,
    selected: input?.selected,
    panel: input?.panel
  });

export const toWalletListDataQuery = (query?: WalletListQuery): WalletListQuery => {
  const normalized = normalizeWalletListQuery(query);
  return {
    ...normalized,
    selected: undefined,
    panel: undefined
  };
};

export const sanitizeWalletSavedViewQuery = (
  query?: Partial<WalletListQuery>
): WalletSavedViewQuery => {
  const normalized = normalizeWalletListQuery(query);
  return {
    q: normalized.q,
    status: normalized.status,
    source: normalized.source,
    batch: normalized.batch,
    labels: normalized.labels,
    version: normalized.version,
    sort: normalized.sort,
    limit: normalized.limit,
    includeDeleted: normalized.includeDeleted,
    createdAfter: normalized.createdAfter,
    createdBefore: normalized.createdBefore
  };
};

export const stringifyWalletListQuery = (query?: WalletListQuery) => {
  const normalized = normalizeWalletListQuery(query);
  const params = new URLSearchParams();

  if (normalized.q) params.set("q", normalized.q);
  if (normalized.view) params.set("view", normalized.view);
  if (normalized.status && normalized.status !== "all") params.set("status", normalized.status);
  if (normalized.source && normalized.source !== "all") params.set("source", normalized.source);
  if (normalized.batch) params.set("batch", normalized.batch);
  if (normalized.sort && normalized.sort !== DEFAULT_SORT) params.set("sort", normalized.sort);
  if (normalized.cursor) params.set("cursor", normalized.cursor);
  if (normalized.limit && normalized.limit !== DEFAULT_LIMIT) {
    params.set("limit", String(normalized.limit));
  }
  if (normalized.includeDeleted) params.set("includeDeleted", "true");
  if (normalized.createdAfter) params.set("createdAfter", normalized.createdAfter);
  if (normalized.createdBefore) params.set("createdBefore", normalized.createdBefore);
  normalized.labels?.forEach((label) => params.append("labels", label));
  if (normalized.version) params.set("version", normalized.version);
  if (normalized.selected) params.set("selected", normalized.selected);
  if (normalized.selected && normalized.panel) params.set("panel", normalized.panel);

  return params;
};
