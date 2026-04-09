"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

export const ResolveAlertButton = ({ alertId }: { alertId: string }) => {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      className="secondary-button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await fetch(`/api/alerts/${alertId}/resolve`, { method: "POST" });
        setPending(false);
        startTransition(() => router.refresh());
      }}
    >
      {pending ? "处理中..." : "标记已处理"}
    </button>
  );
};
