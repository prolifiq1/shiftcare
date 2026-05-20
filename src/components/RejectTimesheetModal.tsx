"use client";

import { useRef } from "react";

type Action = (formData: FormData) => void | Promise<void>;

export function RejectTimesheetModal({
  action,
  hiddenFields,
  reasonField = "reason",
  title = "Reject timesheet",
  subtitle = "Are you sure you want to reject this timesheet?",
  triggerLabel = "Reject…",
}: {
  action: Action;
  hiddenFields: Record<string, string>;
  reasonField?: string;
  title?: string;
  subtitle?: string;
  triggerLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="h-btn h-btn-ghost h-btn-sm"
        onClick={() => ref.current?.showModal()}
      >
        {triggerLabel}
      </button>

      <dialog
        ref={ref}
        className="h-modal"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div
          style={{
            padding: "2rem 1.75rem 1.75rem",
            textAlign: "center",
            minWidth: 360,
            maxWidth: 460,
          }}
        >
          <div
            className="mx-auto flex items-center justify-center"
            style={{ width: 56, height: 56, borderRadius: "999px", background: "var(--base-03)" }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            {subtitle}
          </p>

          <form action={action} className="mt-5">
            {Object.entries(hiddenFields).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <textarea
              name={reasonField}
              required
              rows={4}
              maxLength={500}
              placeholder="What is your reason?"
              className="h-field h-focus w-full"
              style={{ minHeight: 110, padding: "12px", resize: "vertical", textAlign: "left", lineHeight: "1.4" }}
              autoFocus
            />
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => ref.current?.close()}
                className="h-btn h-btn-lg"
                style={{
                  background: "var(--base-03)",
                  color: "var(--text-primary)",
                }}
              >
                Dismiss
              </button>
              <button
                type="submit"
                className="h-btn h-btn-lg"
                style={{ background: "#e5573f", color: "#fff" }}
              >
                Reject
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
