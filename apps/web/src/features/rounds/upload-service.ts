export function configuredRoundsUploadBase(configured = import.meta.env.VITE_ROUNDS_UPLOAD_API_URL) {
  const base = configured?.trim().replace(/\/+$/, "");
  if (!base || base.includes("\\") || /[?#]/.test(base)) return undefined;
  if (/^\/(?!\/)/.test(base)) return base;
  try {
    const url = new URL(base);
    return url.protocol === "https:" && !url.username && !url.password ? base : undefined;
  } catch {
    return undefined;
  }
}

export function roundsUploadBase() {
  const base = configuredRoundsUploadBase();
  if (!base) throw new Error("Sponsored media uploads are unavailable. Configure the rounds upload service before creating a round or publishing media.");
  return base;
}
