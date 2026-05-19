"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_KINDS, MAX_UPLOAD_BYTES } from "@/lib/documents";

type Props = {
  workerId?: string;
  bookingId?: string;
  fixedKind?: string;
  withMeta?: boolean;
  accept?: string;
};

const ACCEPT_DEFAULT = ".pdf,.png,.jpg,.jpeg,.webp,.heic";

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function Uploader({ workerId, bookingId, fixedKind, withMeta, accept }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState(fixedKind ?? "DBS_ENHANCED");
  const [label, setLabel] = useState("");
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function pick(f: File | null) {
    setError("");
    setDone(false);
    setPct(0);
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      setError(`File too large — max ${fmtSize(MAX_UPLOAD_BYTES)}.`);
      return;
    }
    setFile(f);
    upload(f);
  }

  function upload(f: File) {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("kind", fixedKind ?? kind);
    if (label) fd.append("label", label);
    if (workerId) fd.append("workerId", workerId);
    if (bookingId) fd.append("bookingId", bookingId);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setPct(100);
        setDone(true);
        setTimeout(() => {
          setFile(null);
          setDone(false);
          setPct(0);
          setLabel("");
          router.refresh();
        }, 900);
      } else {
        let msg = "Upload failed.";
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
        setError(msg);
        setFile(null);
      }
    };
    xhr.onerror = () => { setError("Network error — please retry."); setFile(null); };
    xhr.send(fd);
  }

  function reset() {
    setFile(null);
    setPct(0);
    setDone(false);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-3">
      {withMeta && !fixedKind && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="h-label">Document type</label>
            <select className="h-field h-focus" value={kind} onChange={(e) => setKind(e.target.value)}>
              {DOC_KINDS.filter((k) => k.value !== "TIMESHEET").map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="h-label">Label / reference (optional)</label>
            <input className="h-field h-focus" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. DBS cert no." />
          </div>
        </div>
      )}

      {!file ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0] ?? null); }}
          className="flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
          style={{
            border: `1.5px dashed ${drag ? "var(--brand-500)" : "var(--border-strong)"}`,
            background: drag ? "var(--brand-50)" : "var(--bg-canvas)",
            borderRadius: "var(--radius-large)",
            padding: "2.25rem 1.5rem",
          }}
        >
          <div
            className="flex items-center justify-center mb-4"
            style={{ width: 52, height: 52, borderRadius: "999px", background: "var(--base-03)" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 14.9A4 4 0 0 0 7 22h11a4 4 0 0 0 1-7.87" />
              <path d="M8.5 9.5 12 6l3.5 3.5" />
              <path d="M12 6v10" />
            </svg>
          </div>
          <div className="text-base">
            <span className="font-semibold" style={{ color: "var(--brand-600)" }}>Click to upload</span>{" "}
            <span style={{ color: "var(--text-secondary)" }}>or drag and drop</span>
          </div>
          <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            PDF or image, up to {fmtSize(MAX_UPLOAD_BYTES)}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={accept ?? ACCEPT_DEFAULT}
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </div>
      ) : (
        <div
          className="flex items-center gap-3"
          style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-large)", padding: "1rem 1.125rem" }}
        >
          <div
            className="flex items-center justify-center shrink-0 text-[10px] font-bold text-white"
            style={{ width: 40, height: 44, borderRadius: 6, background: "#e5573f" }}
          >
            {(file.name.split(".").pop() || "DOC").slice(0, 4).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{file.name}</div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>{fmtSize(file.size)}</div>
            <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: "var(--base-03)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: "var(--brand-500)", transition: "width .2s ease" }}
              />
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-3" style={{ minWidth: 52, justifyContent: "flex-end" }}>
            {done ? (
              <span
                className="flex items-center justify-center"
                style={{ width: 24, height: 24, borderRadius: "999px", background: "var(--brand-500)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
            ) : (
              <>
                <span className="text-sm h-num" style={{ color: "var(--text-secondary)" }}>{pct}%</span>
                <button type="button" onClick={reset} title="Cancel" aria-label="Cancel">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm rounded-lg px-3 py-2.5" style={{ background: "var(--status-danger-bg)", color: "var(--status-danger-fg)", border: "1px solid var(--status-danger-border)" }}>
          {error}
        </div>
      )}
    </div>
  );
}

export function DeleteDoc({ id, label = "Delete" }: { id: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    setBusy(true);
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert("Could not delete the document.");
  }
  return (
    <button type="button" onClick={del} disabled={busy} className="h-link text-xs" style={{ color: "var(--status-danger-fg)" }}>
      {busy ? "Deleting…" : label}
    </button>
  );
}
