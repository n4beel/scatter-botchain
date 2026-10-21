"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";

export type NavItem = { href: string; label: string };

interface PageShellProps {
  children: React.ReactNode;
  nav?: NavItem[];
  title?: string;
  description?: string;
}

/**
 * Rail shell: a persistent left column carrying the procedure.
 *
 * Scatter is a three-step operation — paste, check, send — and the rail keeps those steps on
 * screen the whole time rather than scrolling them away. On a phone the rail becomes a horizontal
 * strip at the top rather than a drawer: three steps fit across 320px, and a drawer would hide
 * the one thing worth keeping visible.
 */
const STEPS = ["Paste the list", "Check the total", "Send once"];

export default function PageShell({ children, nav = [], title, description }: PageShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col md:flex-row" style={{ minHeight: "100dvh" }}>
      <aside
        className="flex-shrink-0 md:w-[260px] flex md:flex-col gap-0 md:gap-8 px-5 py-4 md:py-7 md:justify-between"
        style={{ background: "#0B0E11", borderRight: "1px solid var(--border-subtle)" }}
      >
        <div className="flex md:flex-col items-center md:items-stretch gap-4 md:gap-8 w-full">
          <Link href="/" className="flex items-center gap-2.5 no-underline flex-shrink-0">
            <svg aria-hidden="true" viewBox="0 0 100 100" style={{ width: "20px", height: "20px" }}>
              <rect x="12" y="38" width="22" height="22" rx="3" fill="var(--accent)" />
              <rect x="40" y="22" width="22" height="22" rx="3" fill="var(--accent)" opacity="0.75" />
              <rect x="40" y="56" width="22" height="22" rx="3" fill="var(--accent)" opacity="0.75" />
              <rect x="68" y="38" width="22" height="22" rx="3" fill="var(--accent)" opacity="0.5" />
            </svg>
            <span className="text-[16px] font-semibold tracking-[-0.02em]">{app.name}</span>
          </Link>

          <ol className="hidden md:flex flex-col gap-3">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-baseline gap-3">
                <span
                  className="mono text-[11px] flex-shrink-0"
                  style={{ color: "var(--accent)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  {step}
                </span>
              </li>
            ))}
          </ol>

          {nav.length > 1 && (
            <nav className="flex md:flex-col gap-1">
              {nav.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className="nav-link px-3 py-2 text-[13px] no-underline"
                    style={{
                      borderRadius: "3px",
                      background: active ? "var(--bg-elevated)" : "transparent",
                      color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="flex-1 md:hidden" />
          <div className="hidden md:block" style={{ marginTop: "auto" }} />
        </div>

        <div className="hidden md:flex flex-col gap-3">
          <NetworkBadge />
          <ConnectButton />
          <div className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            <BuiltOnBotChain style={{ color: "var(--text-secondary)" }} />
            <a href="https://botchain.ai" target="_blank" rel="noreferrer">botchain.ai</a>
            <a href="https://scan.botchain.ai" target="_blank" rel="noreferrer">BOT Chain Explorer</a>
          </div>
        </div>

        <div className="flex md:hidden items-center gap-2 flex-shrink-0">
          <NetworkBadge />
          <div style={{ width: "140px" }}><ConnectButton /></div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-5 py-6 md:px-9 md:py-9">
        {(title || description) && (
          <div className="mb-7">
            {title && <h1 className="text-[26px]" style={{ color: "var(--text-primary)" }}>{title}</h1>}
            {description && (
              <p className="mt-2 text-[14px]" style={{ color: "var(--text-secondary)", maxWidth: "62ch" }}>
                {description}
              </p>
            )}
          </div>
        )}
        <div style={{ maxWidth: "820px" }}>{children}</div>

        <div
          className="md:hidden mt-10 pt-5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]"
          style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}
        >
          <BuiltOnBotChain style={{ color: "var(--text-secondary)" }} />
          <a href="https://botchain.ai" target="_blank" rel="noreferrer">botchain.ai</a>
          <a href="https://scan.botchain.ai" target="_blank" rel="noreferrer">BOT Chain Explorer</a>
        </div>
      </main>
    </div>
  );
}
