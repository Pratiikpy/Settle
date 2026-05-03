"use client";

/**
 * WAVE_6 — mobile bottom tab.
 *
 * Replaces the sidebar on <768px. Shows the first 4 items of the
 * active surface's primary nav section + a "More" trigger that opens
 * the full sidebar IA in a drawer.
 *
 * Sticky bottom-of-viewport, safe-area-inset aware, only visible on
 * <md per Tailwind class.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { W6Logo, type W6Surface } from "@settle/ui";
import { NAV_BY_SURFACE } from "../lib/w6-surface";
import { W6Icon } from "./w6-icons";

interface W6BottomTabProps {
  surface: W6Surface;
  unread?: number | undefined;
}

export function W6BottomTab({ surface, unread }: W6BottomTabProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sections = NAV_BY_SURFACE[surface];
  const primary = sections[0]?.items.slice(0, 4) ?? [];

  return (
    <>
      <nav
        aria-label="Primary mobile"
        className="flex md:hidden"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          padding: "8px 12px calc(8px + env(safe-area-inset-bottom)) 12px",
          background: "rgba(253, 253, 253, 0.95)",
          backdropFilter: "blur(10px)",
          borderTop: "1px solid var(--w6-rule)",
        }}
      >
        {primary.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/" &&
              item.href !== "/dashboard" &&
              pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href + item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "8px 4px",
                borderRadius: 10,
                color: active ? "var(--w6-ink)" : "var(--w6-ink-4)",
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                textDecoration: "none",
                background: active ? "var(--w6-rule-2)" : "transparent",
                transition: "background 140ms, color 140ms",
              }}
            >
              <span style={{ position: "relative" }}>
                <W6Icon name={item.icon} size={20} />
                {item.badgeKey === "unread" && unread && unread > 0 ? (
                  <span
                    style={{
                      position: "absolute",
                      top: -2,
                      right: -6,
                      minWidth: 14,
                      height: 14,
                      padding: "0 3px",
                      borderRadius: 999,
                      background: "var(--w6-bad)",
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {unread}
                  </span>
                ) : null}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="More navigation"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            padding: "8px 4px",
            color: "var(--w6-ink-4)",
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          <span style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "currentColor",
              }}
            />
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "currentColor",
              }}
            />
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "currentColor",
              }}
            />
          </span>
          <span>More</span>
        </button>
      </nav>

      <AnimatePresence>
        {drawerOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setDrawerOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                zIndex: 30,
              }}
            />
            <motion.aside
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 31,
                maxHeight: "78vh",
                overflowY: "auto",
                background: "var(--w6-bg)",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: "20px 16px calc(20px + env(safe-area-inset-bottom)) 16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <W6Logo size={20} />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="w6-btn w6-btn-ghost w6-btn-sm"
                >
                  Close
                </button>
              </div>
              {sections.map((section, idx) => (
                <div key={idx} style={{ marginBottom: 8 }}>
                  {section.section ? (
                    <div
                      className="w6-eyebrow"
                      style={{ padding: "10px 4px 6px", fontSize: 10.5 }}
                    >
                      {section.section}
                    </div>
                  ) : null}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {section.items.map((item) => (
                      <Link
                        key={item.href + item.label}
                        href={item.href}
                        onClick={() => setDrawerOpen(false)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "12px 10px",
                          borderRadius: 10,
                          color: "var(--w6-ink)",
                          fontSize: 14,
                          fontWeight: 500,
                          textDecoration: "none",
                        }}
                      >
                        <W6Icon name={item.icon} size={18} />
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
