// 插件版本更新通知：每个版本只弹一次，可关闭，不影响原有界面。
export const EXTENSION_UPDATE_NOTICE_VERSION = "2026.10.10-v2";

export const EXTENSION_UPDATE_NOTES: string[] = [
  "管理后台首页重做：工作量 KPI、来源与版本分布、重点市场可视化、盯防地址榜单",
  "地址库新增版本筛选，标签筛选改为弹窗多选",
  "兼容 Finder 新标签体系与钱包画像数据（盈亏/胜率/城市仓位/行为模式入库可查）"
];

const DISMISS_KEY = "wsmx_update_notice_dismissed";

const shouldShow = async (): Promise<boolean> => {
  try {
    const stored = await chrome.storage.local.get(DISMISS_KEY);
    return stored[DISMISS_KEY] !== EXTENSION_UPDATE_NOTICE_VERSION;
  } catch {
    return false;
  }
};

const dismiss = async () => {
  try {
    await chrome.storage.local.set({ [DISMISS_KEY]: EXTENSION_UPDATE_NOTICE_VERSION });
  } catch {
    // 忽略
  }
};

export const maybeShowUpdateNotice = async (root: HTMLElement = document.body) => {
  if (!(await shouldShow())) {
    return;
  }

  const notice = document.createElement("div");
  notice.className = "wsmx-update-notice";
  notice.innerHTML = `
    <div class="wsmx-update-notice__head">
      <strong>版本更新 ${EXTENSION_UPDATE_NOTICE_VERSION}</strong>
      <button type="button" class="wsmx-update-notice__close" aria-label="关闭更新通知">×</button>
    </div>
    <ul class="wsmx-update-notice__list">
      ${EXTENSION_UPDATE_NOTES.map((note) => `<li>${note}</li>`).join("")}
    </ul>
  `;

  const close = () => {
    notice.remove();
    void dismiss();
  };
  notice.querySelector(".wsmx-update-notice__close")?.addEventListener("click", close);

  root.prepend(notice);
};
