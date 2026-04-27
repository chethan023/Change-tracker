import { useEffect, useMemo, useState } from "react";
import {
  Icon,
  IconButton,
  Avatar,
  ChangeTypeBadge,
  Kbd,
  userDisplayName,
  relTime,
  absTime,
} from "./primitives";
import { useAppShell } from "./shell";
import { toast } from "./toast";
import type { ChangeRecord } from "../lib/types";

// XML rendering helper kept around for potential downstream use; STEPXML
// payloads are no longer surfaced in the UI per product decision.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _buildXml(record: ChangeRecord, side: "before" | "after"): string[] | null {
  const v = side === "before" ? record.previous_value : record.current_value;
  const attr = record.attribute_id || "Value";
  const qualAttr = record.qualifier_id ? ` QualifierID="${record.qualifier_id}"` : "";
  const unitAttr = record.unit_id ? ` UnitID="${record.unit_id}"` : "";
  const type = record.change_element_type;

  if (type === "PRODUCT_CREATED" && side === "before") return null;
  if (type === "PRODUCT_DELETED" && side === "after") return null;

  if (type.startsWith("REFERENCE_") || type.startsWith("ASSET_") || type.startsWith("CLASSIFICATION_")) {
    const removed = (type.includes("REMOVED") || type.includes("UNLINKED") || type.includes("SUPPRESSED")) && side === "after";
    const added = (type.includes("ADDED") || type.includes("LINKED")) && side === "before";
    if (removed || added) return null;
    const refTag = type.includes("CLASSIFICATION")
      ? "ClassificationReference"
      : type.includes("ASSET")
      ? "AssetReference"
      : "ProductReference";
    return [
      `<Product ID="${record.step_product_id}">`,
      `  <${refTag} Type="${record.ref_type || "Ref"}">`,
      `    <TargetID>${record.target_id || v || ""}</TargetID>`,
      `  </${refTag}>`,
      `</Product>`,
    ];
  }

  const inner = v == null ? "" : String(v);
  return [
    `<Product ID="${record.step_product_id}">`,
    `  <Values>`,
    `    <Value AttributeID="${attr}"${qualAttr}${unitAttr}>`,
    `      ${inner || "<!-- no value -->"}`,
    `    </Value>`,
    `  </Values>`,
    `</Product>`,
  ];
}

// Word-level LCS diff
function wordDiff(a: string | null | undefined, b: string | null | undefined) {
  const aw = (a || "").split(/(\s+|,|\.|;|:|\/|-)/).filter(Boolean);
  const bw = (b || "").split(/(\s+|,|\.|;|:|\/|-)/).filter(Boolean);
  const n = aw.length, m = bw.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++)
      dp[i + 1][j + 1] = aw[i] === bw[j] ? dp[i][j] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const left: { t: string; k: "=" | "-" }[] = [];
  const right: { t: string; k: "=" | "+" }[] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (aw[i - 1] === bw[j - 1]) {
      left.unshift({ t: aw[i - 1], k: "=" });
      right.unshift({ t: bw[j - 1], k: "=" });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      left.unshift({ t: aw[i - 1], k: "-" });
      i--;
    } else {
      right.unshift({ t: bw[j - 1], k: "+" });
      j--;
    }
  }
  while (i > 0) { left.unshift({ t: aw[i - 1], k: "-" }); i--; }
  while (j > 0) { right.unshift({ t: bw[j - 1], k: "+" }); j--; }
  return { left, right };
}

export default function DiffViewer() {
  const record = useAppShell((s) => s.diffRecord);
  const siblings = useAppShell((s) => s.diffSiblings);
  const close = useAppShell((s) => s.closeDiff);
  const step = useAppShell((s) => s.stepDiff);

  const [copied, setCopied] = useState<string | null>(null);

  const idx = record ? siblings.findIndex((r) => r.id === record.id) : -1;
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < siblings.length - 1;

  const diff = useMemo(
    () => wordDiff(record?.previous_value, record?.current_value),
    [record]
  );

  useEffect(() => {
    if (!record) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "j" || e.key === "ArrowDown") { if (hasNext) { e.preventDefault(); step(1); } }
      else if (e.key === "k" || e.key === "ArrowUp") { if (hasPrev) { e.preventDefault(); step(-1); } }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [record, hasNext, hasPrev, close, step]);

  if (!record) return null;

  const copy = (label: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 1080,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
          animation: "modal-in 280ms var(--ease-spring)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <h3 style={{ fontSize: 20, margin: 0, fontFamily: "var(--font-mono)", letterSpacing: "-0.005em" }}>
                {record.step_product_id}
              </h3>
              <ChangeTypeBadge type={record.change_element_type} />
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--fg-tertiary)",
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <Avatar userId={record.changed_by || "system"} size={18} />
              <span>{userDisplayName(record.changed_by)}</span>
              <span>·</span>
              <span>{relTime(record.change_date)}</span>
              <span>·</span>
              <span className="mono">{absTime(record.change_date)}</span>
              {record.attribute_id && (
                <>
                  <span>·</span>
                  <code className="mono">
                    {record.attribute_id}
                    {record.qualifier_id ? ` · ${record.qualifier_id}` : ""}
                  </code>
                </>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <IconButton icon="chevron-up" title="Previous (k)" onClick={() => step(-1)} disabled={!hasPrev} style={{ opacity: hasPrev ? 1 : 0.3 }} />
            <IconButton icon="chevron-down" title="Next (j)" onClick={() => step(1)} disabled={!hasNext} style={{ opacity: hasNext ? 1 : 0.3 }} />
            <IconButton icon="x" title="Close (Esc)" onClick={close} />
          </div>
        </div>

        {/* Value summary */}
        {(record.previous_value != null || record.current_value != null) && (
          <div
            style={{
              padding: "18px 24px",
              borderBottom: "1px solid var(--border-subtle)",
              background: "var(--bg-subtle)",
            }}
          >
            <div className="label-sm" style={{ marginBottom: 8 }}>Value change</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, alignItems: "center" }}>
              <div
                style={{
                  background: "var(--diff-before-bg)",
                  border: "1px solid rgba(255,59,48,0.2)",
                  borderLeft: "3px solid var(--diff-before-line)",
                  padding: "14px 16px",
                  borderRadius: 10,
                  minHeight: 60,
                }}
              >
                <div className="label-sm" style={{ color: "var(--diff-before-fg)", marginBottom: 6 }}>Previous</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--fg)", fontWeight: 500, wordBreak: "break-word" }}>
                  {record.previous_value ? (
                    diff.left.map((t, k) => (
                      <span key={k} className={t.k === "-" ? "tok-del" : ""}>{t.t}</span>
                    ))
                  ) : (
                    <span style={{ color: "var(--fg-quaternary)", fontStyle: "italic" }}>(none)</span>
                  )}
                </div>
              </div>
              <Icon name="arrow-right" size={22} color="var(--fg-tertiary)" />
              <div
                style={{
                  background: "var(--diff-after-bg)",
                  border: "1px solid rgba(52,199,89,0.2)",
                  borderLeft: "3px solid var(--diff-after-line)",
                  padding: "14px 16px",
                  borderRadius: 10,
                  minHeight: 60,
                }}
              >
                <div className="label-sm" style={{ color: "var(--diff-after-fg)", marginBottom: 6 }}>Current</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--fg)", fontWeight: 500, wordBreak: "break-word" }}>
                  {record.current_value ? (
                    diff.right.map((t, k) => (
                      <span key={k} className={t.k === "+" ? "tok-add" : ""}>{t.t}</span>
                    ))
                  ) : (
                    <span style={{ color: "var(--fg-quaternary)", fontStyle: "italic" }}>(none)</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* The STEPXML split/unified/raw diff body that used to live here was
            removed at product request — raw payload fragments must not be
            shown to end users. Header metadata and the Previous → Current
            value comparison above are sufficient for review. */}

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            gap: 10,
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--bg-muted)",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              color: "var(--fg-tertiary)",
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <Kbd>J</Kbd>
            <Kbd>K</Kbd> navigate · <Kbd>Esc</Kbd> close
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                copy("link", `${window.location.origin}${window.location.pathname}#change-${record.id}`);
                toast({ tone: "success", title: "Link copied" });
              }}
            >
              <Icon name={copied === "link" ? "check" : "link-2"} size={13} /> Share link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
