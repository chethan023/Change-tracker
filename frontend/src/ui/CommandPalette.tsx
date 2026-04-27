import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Icon, Kbd } from "./primitives";
import { useAppShell } from "./shell";
import { fetchChanges } from "../lib/api";

interface Command {
  group: string;
  id: string;
  label: string;
  desc?: string;
  icon: string;
  action: () => void;
}

export default function CommandPalette() {
  const open = useAppShell((s) => s.commandOpen);
  const close = useAppShell((s) => s.closeCommand);
  const openDiff = useAppShell((s) => s.openDiff);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  const { data: recent } = useQuery({
    queryKey: ["changes", "recent"],
    queryFn: () => fetchChanges({ limit: 8 }),
    enabled: open,
  });

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { group: "Navigate", id: "dashboard", label: "Go to Dashboard", icon: "layout-dashboard", action: () => navigate("/") },
      { group: "Navigate", id: "snapshots", label: "Go to Ingests", icon: "archive", action: () => navigate("/snapshots") },
      { group: "Navigate", id: "alerts", label: "Go to Alerts", icon: "bell", action: () => navigate("/notifications") },
      { group: "Navigate", id: "products", label: "Go to Products", icon: "package", action: () => navigate("/products") },
      { group: "Navigate", id: "settings", label: "Go to Settings", icon: "settings", action: () => navigate("/settings") },
      { group: "Actions", id: "new-rule", label: "Create notification rule", icon: "plus", action: () => navigate("/notifications?new=1") },
    ];
    const records: Command[] = (recent?.items || []).slice(0, 6).map((r) => ({
      group: "Recent changes",
      id: `rec-${r.id}`,
      label: `${r.step_product_id} · ${r.attribute_id || r.ref_type || "—"}`,
      desc: r.change_element_type.toLowerCase().replace(/_/g, " "),
      icon: "git-compare",
      action: () => openDiff(r, recent?.items || []),
    }));
    return [...base, ...records];
  }, [recent, navigate, openDiff]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(s) || c.desc?.toLowerCase().includes(s)
    );
  }, [q, commands]);

  useEffect(() => { setIdx(0); }, [q, open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); filtered[idx]?.action(); close(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, filtered, idx, close]);

  if (!open) return null;

  // group items for display, preserving order
  const groups: { label: string; items: (Command & { _i: number })[] }[] = [];
  let lastGroup: string | null = null;
  filtered.forEach((c, i) => {
    if (c.group !== lastGroup) {
      groups.push({ label: c.group, items: [] });
      lastGroup = c.group;
    }
    groups[groups.length - 1].items.push({ ...c, _i: i });
  });

  return (
    <div className="cmdk-backdrop" onClick={close}>
      <div className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
        <div style={{ position: "relative", borderBottom: "1px solid var(--border-subtle)" }}>
          <Icon name="search" size={18} style={{ position: "absolute", left: 18, top: 20, color: "var(--fg-tertiary)" }} />
          <input
            className="cmdk-input"
            autoFocus
            placeholder="Jump to a screen, run a command, or find a change…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div style={{ maxHeight: 420, overflow: "auto", padding: "8px 0" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "28px 20px", textAlign: "center", color: "var(--fg-tertiary)", fontSize: 13 }}>
              No matches.
            </div>
          )}
          {groups.map((g) => (
            <Fragment key={g.label}>
              <div className="cmdk-group-label">{g.label}</div>
              {g.items.map((c) => (
                <div
                  key={c.id}
                  className={`cmdk-item ${c._i === idx ? "active" : ""}`}
                  onMouseEnter={() => setIdx(c._i)}
                  onClick={() => { c.action(); close(); }}
                >
                  <Icon name={c.icon} size={15} color="var(--fg-tertiary)" />
                  <div style={{ flex: 1 }}>
                    <div>{c.label}</div>
                    {c.desc && <div className="desc">{c.desc}</div>}
                  </div>
                  {c._i === idx && <Icon name="corner-down-left" size={13} color="var(--fg-tertiary)" />}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
        <div
          style={{
            padding: "8px 14px",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--bg-muted)",
            display: "flex",
            gap: 14,
            fontSize: 11,
            color: "var(--fg-tertiary)",
          }}
        >
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span><Kbd>↵</Kbd> select</span>
          <span><Kbd>Esc</Kbd> close</span>
        </div>
      </div>
    </div>
  );
}
