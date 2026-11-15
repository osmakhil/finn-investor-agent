"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Brief", icon: "M4 6h16M4 12h10M4 18h7" },
  { href: "/alerts", label: "Alerts", icon: "M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6zM10 19a2 2 0 0 0 4 0" },
  { href: "/research", label: "Research", icon: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" },
];

export default function TabBar() {
  const p = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-[480px]">
        {TABS.map((t) => {
          const on = t.href === "/" ? p === "/" : p.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${on ? "text-ink" : "text-mute"}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
