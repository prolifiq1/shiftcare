export const DOC_KINDS = [
  { value: "DBS_ENHANCED", label: "DBS (Enhanced)" },
  { value: "RIGHT_TO_WORK", label: "Right to work" },
  { value: "ID_PROOF", label: "Photo ID" },
  { value: "TRAINING", label: "Training certificate" },
  { value: "QUALIFICATION", label: "Qualification" },
  { value: "TIMESHEET", label: "Timesheet" },
  { value: "OTHER", label: "Other" },
] as const;

export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // 6 MB

export function kindLabel(value: string): string {
  return DOC_KINDS.find((k) => k.value === value)?.label ?? value.replace(/_/g, " ");
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function docStatusPill(status: string): string {
  // maps to StatusPill tones already handled by PILL_MAP fallbacks
  return status;
}
