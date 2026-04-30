"use client";

import Link, { type LinkProps } from "next/link";
import { forwardRef, type ComponentPropsWithoutRef, type MouseEvent } from "react";

type AnchorProps = Omit<ComponentPropsWithoutRef<"a">, keyof LinkProps | "href" | "onClick">;

export type AppLinkProps = AnchorProps &
  LinkProps & {
    fallbackDelayMs?: number;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  };

const isPlainLeftClick = (event: MouseEvent<HTMLAnchorElement>) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

const isSelfTarget = (target?: string) => !target || target === "_self";

export const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { href, onClick, replace, fallbackDelayMs = 250, ...props },
  ref
) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (event.defaultPrevented || !isPlainLeftClick(event)) {
      return;
    }

    if (!isSelfTarget(event.currentTarget.target) || event.currentTarget.hasAttribute("download")) {
      return;
    }

    if (typeof href !== "string") {
      return;
    }

    const currentHref = window.location.href;
    const destinationHref = new URL(href, currentHref);

    if (destinationHref.origin !== window.location.origin) {
      return;
    }

    window.setTimeout(() => {
      if (window.location.href !== currentHref) {
        return;
      }

      if (replace) {
        window.location.replace(destinationHref.toString());
        return;
      }

      window.location.assign(destinationHref.toString());
    }, fallbackDelayMs);
  };

  return <Link ref={ref} href={href} replace={replace} onClick={handleClick} {...props} />;
});
