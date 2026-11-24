import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

export function RoundsStatus({
  kind,
  children,
  iconClassName,
}: {
  kind: "loading" | "error" | "success" | "info";
  children: React.ReactNode;
  iconClassName?: string;
}) {
  const Icon =
    kind === "loading"
      ? Loader2
      : kind === "success"
        ? CheckCircle2
        : AlertTriangle;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
      className={`flex items-start gap-3 rounded-xl border p-4 paragraph-sm ${
        kind === "error"
          ? "border-semantic-negative/40 bg-semantic-negative/5"
          : "border-border-primary bg-background-ternary"
      }`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${kind === "loading" ? "animate-spin" : ""} ${iconClassName || ""}`}
        aria-hidden="true"
      />
      <div>{children}</div>
    </div>
  );
}

export function shortenAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
