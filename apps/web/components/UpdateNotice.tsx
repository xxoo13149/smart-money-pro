"use client";

import { useEffect, useState } from "react";

import { Modal } from "./Modal";
import { UPDATE_NOTES, UPDATE_NOTICE_TITLE, UPDATE_NOTICE_VERSION } from "../lib/update-notice";

const DISMISS_KEY = "wsm_update_notice_dismissed";

export function UpdateNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISS_KEY) !== UPDATE_NOTICE_VERSION) {
        setOpen(true);
      }
    } catch {
      // localStorage 不可用时不打扰
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, UPDATE_NOTICE_VERSION);
    } catch {
      // 忽略
    }
    setOpen(false);
  };

  if (!open) {
    return null;
  }

  return (
    <Modal
      open={open}
      title={UPDATE_NOTICE_TITLE}
      description={`版本 ${UPDATE_NOTICE_VERSION} · 本次更新内容：`}
      onClose={dismiss}
      footer={
        <button type="button" className="primary-button small-button" onClick={dismiss}>
          知道了
        </button>
      }
    >
      <ul className="stack-list">
        {UPDATE_NOTES.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </Modal>
  );
}
