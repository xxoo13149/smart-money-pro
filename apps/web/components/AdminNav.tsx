"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/", label: "首页" },
  { href: "/imports", label: "导入中心" },
  { href: "/wallets", label: "地址库" },
  { href: "/alerts", label: "预警" },
  { href: "/runtime", label: "运行时" },
  { href: "/extension", label: "扩展" }
];

const isActivePath = (pathname: string, href: string) =>
  href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

export function AdminNav() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return (
    <nav className="nav" aria-label="Admin primary">
      {navItems.map((item) => {
        const isActive = isActivePath(pathname, item.href);
        const isPending = pendingHref === item.href && !isActive;
        const className = [
          "nav__link",
          isActive ? "nav__link--active" : "",
          isPending ? "nav__link--pending" : ""
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <Link
            key={item.href}
            href={item.href}
            className={className}
            onClick={() => setPendingHref(item.href)}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
