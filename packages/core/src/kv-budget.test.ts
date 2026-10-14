import { afterEach, describe, expect, it, vi } from "vitest";

import {
  KV_DAILY_WRITE_LIMIT,
  createKvWriteBudget,
  isKvQuotaError,
  kvQuotaDay
} from "./kv-budget.js";

describe("isKvQuotaError", () => {
  it("识别 Cloudflare 的每日写入配额错误", () => {
    expect(isKvQuotaError(new Error("KV put() limit exceeded for the day."))).toBe(true);
  });

  it("识别裸字符串形式", () => {
    expect(isKvQuotaError("KV put() limit exceeded for the day.")).toBe(true);
  });

  it("识别 errors 数组里的配额文案", () => {
    const error = Object.assign(new Error("KV put() failed"), {
      errors: [{ code: 10029, message: "limit exceeded for the day" }]
    });
    expect(isKvQuotaError(error)).toBe(true);
  });

  it("普通写入失败不算配额耗尽，不能因此熔断", () => {
    expect(isKvQuotaError(new Error("KV put() failed: network error"))).toBe(false);
    expect(isKvQuotaError(new Error("KV get() failed"))).toBe(false);
    expect(isKvQuotaError(undefined)).toBe(false);
    expect(isKvQuotaError(null)).toBe(false);
  });
});

describe("kvQuotaDay", () => {
  it("按 UTC 日期取键，不能用本地时区", () => {
    // 本地时间可能还是前一天，但 KV 配额按 UTC 重置，用本地日期会算错剩余额度。
    expect(kvQuotaDay(new Date("2026-10-14T23:30:00.000Z"))).toBe("2026-10-14");
    expect(kvQuotaDay(new Date("2026-10-15T00:30:00.000Z"))).toBe("2026-10-15");
  });
});

describe("createKvWriteBudget", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("软上限之前一直放行", () => {
    const budget = createKvWriteBudget(3);
    expect(budget.tryAcquire()).toBe(true);
    budget.recordWrite();
    expect(budget.tryAcquire()).toBe(true);
    budget.recordWrite();
    expect(budget.tryAcquire()).toBe(true);
    budget.recordWrite();
    // 第三次用完就是上限，第四次必须停。
    expect(budget.tryAcquire()).toBe(false);
  });

  it("默认软上限留出余量，不打满硬额度", () => {
    const budget = createKvWriteBudget();
    const { softLimit } = budget.snapshot();
    expect(softLimit).toBeLessThan(KV_DAILY_WRITE_LIMIT);
  });

  it("软上限被夹在 1..硬额度内", () => {
    expect(createKvWriteBudget(0).snapshot().softLimit).toBe(1);
    expect(createKvWriteBudget(999_999).snapshot().softLimit).toBe(KV_DAILY_WRITE_LIMIT);
  });

  it("配额错误后立刻停写", () => {
    const budget = createKvWriteBudget(100);
    budget.recordWrite();
    expect(budget.tryAcquire()).toBe(true);
    budget.tripQuota("KV put() limit exceeded for the day.");
    expect(budget.tryAcquire()).toBe(false);
    expect(budget.snapshot().quotaExceeded).toBe(true);
    expect(budget.snapshot().quotaExceededReason).toContain("limit exceeded");
  });

  it("跨 UTC 日自动重置配额与计数", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T23:59:00.000Z"));
    const budget = createKvWriteBudget(2);
    budget.recordWrite();
    budget.recordWrite();
    budget.tripQuota("limit exceeded for the day");
    expect(budget.tryAcquire()).toBe(false);

    vi.setSystemTime(new Date("2026-10-15T00:01:00.000Z"));
    // 新的一天必须恢复，否则一次配额耗尽会让缓存永久停写。
    expect(budget.tryAcquire()).toBe(true);
    expect(budget.snapshot().writes).toBe(0);
    expect(budget.snapshot().quotaExceeded).toBe(false);
  });

  it("负数或小数计数不会把预算算坏", () => {
    const budget = createKvWriteBudget(5);
    budget.recordWrite(-3);
    budget.recordWrite(1.7);
    expect(budget.snapshot().writes).toBe(1);
    expect(budget.tryAcquire()).toBe(true);
  });

  it("reset 恢复初始状态", () => {
    const budget = createKvWriteBudget(2);
    budget.recordWrite();
    budget.recordWrite();
    budget.tripQuota("limit exceeded");
    budget.reset();
    expect(budget.tryAcquire()).toBe(true);
    expect(budget.snapshot().writes).toBe(0);
  });
});
