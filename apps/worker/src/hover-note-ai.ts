import { type AddressSummary } from "@weather-smart-money/core";

import type { Env } from "./env";
import { hashValue } from "./utils";

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const AI_NOTE_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const AI_NOTE_FAIL_TTL_SECONDS = 15 * 60;
const AI_NOTE_BATCH_SIZE = 8;
const AI_NOTE_TIMEOUT_MS = 10_000;
const AI_NOTE_OUTPUT_MAX = 160;
const PROMPT_VERSION = "v2";
const MAX_STATUS_BADGES = 2;
const MAX_OFFICIAL_TAGS = 4;
const MAX_AI_TAGS = 5;
const MAX_TEXT_FIELD = 100;

type EvidenceLevel = "high" | "medium" | "low";

type SummaryWithOptionalDetails = AddressSummary & {
  bio?: string;
  teamNote?: string;
};

type CachedHoverNote = {
  summaryText: string;
  model: string;
  generatedAt: string;
};

type HoverNotePromptItem = {
  normalizedAddress: string;
  officialTags: string[];
  officialNoteText?: string;
  aiTags: string[];
  rawAiFactsText?: string;
  strategyFocus?: string;
  noteSnippet?: string;
  teamNote?: string;
  bio?: string;
  watchlisted: boolean;
  statusBadges: string[];
};

type HoverNoteResponseItem = {
  normalizedAddress?: string;
  summaryText?: string;
  evidenceLevel?: EvidenceLevel;
  hasConflict?: boolean;
  needsReview?: boolean;
};

type PreparedSummary<T extends SummaryWithOptionalDetails> = {
  summary: T;
  promptItem: HoverNotePromptItem;
  cacheKey: string;
  failCacheKey: string;
};

export type WorkerWaitUntilContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type AiHoverNoteOptions = {
  executionContext?: WorkerWaitUntilContext;
  backgroundOnMiss?: boolean;
};

const SYSTEM_PROMPT = `
你不是打标签模型，也不是投资分析师。
你只负责把已有结构化事实改写成简洁、自然、克制的中文说明，给扩展 hover card 直接展示。

目标：
1. 上面的结构化标签负责真相层。
2. 你写的说明负责翻译层。
3. 这段说明要帮助用户快速明白：它像什么、为什么值得看、当前要留意什么。

硬性规则：
1. 只能使用输入里明确出现的信息，不得补充未提供的标签、数字、因果、动机、时间判断。
2. 信息优先级必须遵守：官方/人工信息 > AI 标签 > 自由文本备注。
3. 不要重复地址、名称、标签列表本身，要把它们翻译成自然语言。
4. 不要写投资建议，不要夸张，不要营销口吻，不要模型口头禅。
5. 如果信息不足，就明确写当前仅见有限信号、更适合作为观察样本，不要装得很确定。
6. 如果信息冲突，不要强行统一口径，要直接提示现有信号存在分歧，建议复核。
7. 输出 2 句为主，必要时 3 句；总长度控制在 60 到 110 个中文字符，最多 120 个中文字符。
8. 第一句先给身份画像或优势定位，第二句解释主要价值或行为特征，第三句只在必要时补风险或关注点。
9. 语气要像研究同事，常用“更像、偏向、当前、值得关注、观察、复核”，少用绝对化表达。
10. 不要 markdown、不要列表、不要引号、不要 emoji。

返回 JSON，格式固定如下：
{"items":[{"normalizedAddress":"0x...","summaryText":"...","evidenceLevel":"high|medium|low","hasConflict":false,"needsReview":false}]}
`.trim();

const compactText = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const clampText = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3).trimEnd()}...`;

const uniqueTexts = (values: Array<string | undefined>, limit: number) =>
  Array.from(new Set(values.map((value) => compactText(value)).filter(Boolean))).slice(0, limit);

const cutField = (value: string, maxLength = MAX_TEXT_FIELD) => clampText(compactText(value), maxLength);

const buildBadgeText = (badge: { text: string; metricText?: string }) => {
  const text = compactText(badge.text);
  const metricText = compactText(badge.metricText);
  if (!text) {
    return "";
  }
  return metricText ? `${text} (${metricText})` : text;
};

const buildPromptItem = (summary: SummaryWithOptionalDetails): HoverNotePromptItem | null => {
  const hoverCard = summary.hoverCard;
  if (!hoverCard) {
    return null;
  }
  if (compactText(hoverCard.aiNarrativeNoteText)) {
    return null;
  }

  const officialTags = uniqueTexts(hoverCard.officialTags.map((badge) => buildBadgeText(badge)), MAX_OFFICIAL_TAGS);
  const aiTags = uniqueTexts(hoverCard.aiTags.map((badge) => buildBadgeText(badge)), MAX_AI_TAGS);
  const statusBadges = uniqueTexts((summary.statusBadges ?? []).map((badge) => badge.text), MAX_STATUS_BADGES);
  const strategyFocus = cutField(summary.strategyFocus ?? "");
  const noteSnippet = cutField(summary.noteSnippet ?? "");
  const teamNote = cutField(summary.teamNote ?? "");
  const bio = cutField(summary.bio ?? "");
  const officialNoteText = cutField(hoverCard.officialNoteText ?? "");
  const rawAiFactsText = cutField(hoverCard.aiStatsNoteText ?? "");

  const hasUsefulInput =
    officialTags.length > 0 ||
    aiTags.length > 0 ||
    statusBadges.length > 0 ||
    Boolean(strategyFocus) ||
    Boolean(noteSnippet) ||
    Boolean(teamNote) ||
    Boolean(bio) ||
    Boolean(officialNoteText) ||
    Boolean(rawAiFactsText);

  const hasEnoughEvidence =
    officialTags.length > 0 ||
    aiTags.length >= 2 ||
    Boolean(strategyFocus) ||
    Boolean(teamNote) ||
    Boolean(officialNoteText);

  if (!hasUsefulInput || !hasEnoughEvidence) {
    return null;
  }

  return {
    normalizedAddress: summary.normalizedAddress,
    officialTags,
    officialNoteText: officialNoteText || undefined,
    aiTags,
    rawAiFactsText: rawAiFactsText || undefined,
    strategyFocus: strategyFocus || undefined,
    noteSnippet: noteSnippet || undefined,
    teamNote: teamNote || undefined,
    bio: bio || undefined,
    watchlisted: summary.watchlisted,
    statusBadges
  };
};

const splitIntoBatches = <T,>(items: T[], size: number) => {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};

const getConfig = (env: Env) => {
  const apiKey = compactText(env.DEEPSEEK_API_KEY);
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    baseUrl: compactText(env.DEEPSEEK_BASE_URL) || DEFAULT_DEEPSEEK_BASE_URL,
    model: compactText(env.DEEPSEEK_MODEL) || DEFAULT_DEEPSEEK_MODEL
  };
};

const buildCacheKey = (model: string, inputHash: string, normalizedAddress: string) => {
  const modelKey = model.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `hover-ai-note:${PROMPT_VERSION}:${modelKey}:${inputHash}:${normalizedAddress}`;
};

const buildFailCacheKey = (model: string, inputHash: string, normalizedAddress: string) => {
  const modelKey = model.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `hover-ai-note-fail:${PROMPT_VERSION}:${modelKey}:${inputHash}:${normalizedAddress}`;
};

const extractContentText = (payload: unknown) => {
  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : compactText((part as { text?: string })?.text)))
      .join("")
      .trim();
  }
  return "";
};

const parseDeepSeekResult = (payload: unknown) => {
  const rawText = extractContentText(payload);
  if (!rawText) {
    return [] as HoverNoteResponseItem[];
  }

  const parsed = JSON.parse(rawText) as { items?: HoverNoteResponseItem[] };
  return Array.isArray(parsed.items) ? parsed.items : [];
};

const applyNarrativeNotes = <T extends SummaryWithOptionalDetails>(
  summaries: T[],
  noteByAddress: Map<string, string>
) =>
  summaries.map((summary) => {
    if (!summary.hoverCard) {
      return summary;
    }

    const nextNote = noteByAddress.get(summary.normalizedAddress);
    if (!nextNote || compactText(summary.hoverCard.aiNarrativeNoteText)) {
      return summary;
    }

    return {
      ...summary,
      hoverCard: {
        ...summary.hoverCard,
        aiNarrativeNoteText: nextNote
      }
    };
  });

const prepareSummary = async <T extends SummaryWithOptionalDetails>(
  config: NonNullable<ReturnType<typeof getConfig>>,
  summary: T
): Promise<PreparedSummary<T> | null> => {
  const promptItem = buildPromptItem(summary);
  if (!promptItem) {
    return null;
  }

  const inputHash = await hashValue(JSON.stringify(promptItem));
  return {
    summary,
    promptItem,
    cacheKey: buildCacheKey(config.model, inputHash, summary.normalizedAddress),
    failCacheKey: buildFailCacheKey(config.model, inputHash, summary.normalizedAddress)
  };
};

const callDeepSeekBatch = async (
  config: NonNullable<ReturnType<typeof getConfig>>,
  batch: HoverNotePromptItem[]
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), AI_NOTE_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 1200,
        thinking: {
          type: "disabled"
        },
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          {
            role: "user",
            content: JSON.stringify({ items: batch })
          }
        ]
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.warn("deepseek hover-note request failed", {
        status: response.status,
        model: config.model,
        payload
      });
      return {
        items: [] as HoverNoteResponseItem[],
        failed: true
      };
    }

    return {
      items: parseDeepSeekResult(payload),
      failed: false
    };
  } catch (error) {
    console.warn("deepseek hover-note request error", {
      model: config.model,
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      items: [] as HoverNoteResponseItem[],
      failed: true
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const loadCachedNotes = async (
  env: Env,
  preparedSummaries: PreparedSummary<SummaryWithOptionalDetails>[]
) => {
  const rows = await Promise.all(
    preparedSummaries.map(async (prepared) => {
      const cached = await env.SMART_MONEY_CACHE.get(prepared.cacheKey, "json");
      return [prepared.summary.normalizedAddress, (cached ?? null) as CachedHoverNote | null] as const;
    })
  );

  const result = new Map<string, CachedHoverNote>();
  rows.forEach(([normalizedAddress, cached]) => {
    if (cached?.summaryText) {
      result.set(normalizedAddress, cached);
    }
  });
  return result;
};

const writeCachedNotes = async (
  env: Env,
  config: NonNullable<ReturnType<typeof getConfig>>,
  preparedByAddress: Map<string, PreparedSummary<SummaryWithOptionalDetails>>,
  generated: Map<string, string>
) => {
  const generatedAt = new Date().toISOString();
  await Promise.all(
    Array.from(generated.entries()).map(async ([normalizedAddress, summaryText]) => {
      const prepared = preparedByAddress.get(normalizedAddress);
      if (!prepared) {
        return;
      }

      await env.SMART_MONEY_CACHE.put(
        prepared.cacheKey,
        JSON.stringify({
          summaryText,
          model: config.model,
          generatedAt
        } satisfies CachedHoverNote),
        {
          expirationTtl: AI_NOTE_CACHE_TTL_SECONDS
        }
      );
    })
  );
};

const loadFailedSummaries = async (
  env: Env,
  preparedSummaries: PreparedSummary<SummaryWithOptionalDetails>[]
) => {
  const entries = await Promise.all(
    preparedSummaries.map(async (prepared) => {
      const failed = await env.SMART_MONEY_CACHE.get(prepared.failCacheKey);
      return failed ? prepared.summary.normalizedAddress : null;
    })
  );
  return new Set(entries.filter(Boolean) as string[]);
};

const writeFailedSummaries = async (
  env: Env,
  preparedSummaries: PreparedSummary<SummaryWithOptionalDetails>[]
) => {
  await Promise.all(
    preparedSummaries.map((prepared) =>
      env.SMART_MONEY_CACHE.put(prepared.failCacheKey, "1", {
        expirationTtl: AI_NOTE_FAIL_TTL_SECONDS
      })
    )
  );
};

const generateMissingNotes = async (
  env: Env,
  config: NonNullable<ReturnType<typeof getConfig>>,
  preparedSummaries: PreparedSummary<SummaryWithOptionalDetails>[]
) => {
  const generated = new Map<string, string>();
  if (preparedSummaries.length === 0) {
    return generated;
  }

  const batchResults = await Promise.all(
    splitIntoBatches(preparedSummaries, AI_NOTE_BATCH_SIZE).map(async (batch) => {
      const result = await callDeepSeekBatch(
        config,
        batch.map((prepared) => prepared.promptItem)
      );
      if (result.failed) {
        await writeFailedSummaries(env, batch);
      }
      return result;
    })
  );

  batchResults.forEach((batchResult) => {
    batchResult.items.forEach((item) => {
      const normalizedAddress = compactText(item.normalizedAddress);
      const summaryText = clampText(compactText(item.summaryText), AI_NOTE_OUTPUT_MAX);
      if (!normalizedAddress || !summaryText) {
        return;
      }
      generated.set(normalizedAddress, summaryText);
    });
  });

  return generated;
};

export const enrichAddressSummariesWithAiHoverNotes = async <T extends SummaryWithOptionalDetails>(
  env: Env,
  summaries: T[],
  options?: AiHoverNoteOptions
) => {
  const config = getConfig(env);
  if (!config || summaries.length === 0) {
    return summaries;
  }

  const preparedSummaries = (
    await Promise.all(summaries.map((summary) => prepareSummary(config, summary)))
  ).filter((prepared): prepared is PreparedSummary<T> => Boolean(prepared));
  if (preparedSummaries.length === 0) {
    return summaries;
  }

  const cached = await loadCachedNotes(env, preparedSummaries);
  const failedAddresses = await loadFailedSummaries(env, preparedSummaries);
  const pending = preparedSummaries.filter(
    (prepared) =>
      !cached.has(prepared.summary.normalizedAddress) && !failedAddresses.has(prepared.summary.normalizedAddress)
  );

  const cachedNotes = new Map(
    Array.from(cached.entries()).map(([normalizedAddress, entry]) => [normalizedAddress, entry.summaryText] as const)
  );

  if (pending.length > 0 && options?.backgroundOnMiss && options.executionContext) {
    const pendingByAddress = new Map(
      pending.map((prepared) => [prepared.summary.normalizedAddress, prepared] as const)
    );
    options.executionContext.waitUntil(
      (async () => {
        const generated = await generateMissingNotes(env, config, pending);
        if (generated.size > 0) {
          await writeCachedNotes(env, config, pendingByAddress, generated);
        }
      })()
    );

    return cachedNotes.size > 0 ? applyNarrativeNotes(summaries, cachedNotes) : summaries;
  }

  const generated = pending.length > 0 ? await generateMissingNotes(env, config, pending) : new Map<string, string>();

  if (generated.size > 0) {
    const pendingByAddress = new Map(
      pending.map((prepared) => [prepared.summary.normalizedAddress, prepared] as const)
    );
    await writeCachedNotes(env, config, pendingByAddress, generated);
  }

  if (cached.size === 0 && generated.size === 0) {
    return summaries;
  }

  const noteByAddress = new Map<string, string>(cachedNotes);
  generated.forEach((summaryText, normalizedAddress) => {
    noteByAddress.set(normalizedAddress, summaryText);
  });

  return applyNarrativeNotes(summaries, noteByAddress);
};
