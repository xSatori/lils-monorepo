/**
 * Get the DAO version from environment variable
 * Defaults to 5 if not set (for local development)
 */
export function getDaoVersion(): number {
  const version = import.meta.env.VITE_DAO_VERSION
  if (version) {
    const parsed = parseInt(version, 10)
    if (!isNaN(parsed)) {
      return parsed
    }
  }
  // Default to 5 for local development
  return 5
}

/**
 * Check if DAO version supports candidates and topics.
 */
export function isDaoVersion5(): boolean {
  return getDaoVersion() >= 5
}

