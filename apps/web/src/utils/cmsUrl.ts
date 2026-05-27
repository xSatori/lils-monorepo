const DEFAULT_CMS_GRAPHQL_URL = 'https://cms.lilnouns.wtf/api/graphql';

export function getCmsGraphqlUrl(): string {
  return (import.meta.env.VITE_CMS_URL || DEFAULT_CMS_GRAPHQL_URL).trim();
}

export function getCmsOrigin(): string {
  const url = getCmsGraphqlUrl();
  try {
    const u = new URL(url);
    // If pointing directly to /api/graphql, drop the path
    return `${u.protocol}//${u.host}`;
  } catch {
    // Fallback: strip known suffix
    return url.replace('/api/graphql', '');
  }
}

export function normalizeCmsMediaUrl(rawUrl?: string, filename?: string): string | undefined {
  const origin = getCmsOrigin().replace(/\/$/, '');
  const candidates: string[] = [];

  console.log('[normalizeCmsMediaUrl] Input:', { rawUrl, filename, origin });

  // If rawUrl is already a complete URL, use it first (highest priority)
  if (rawUrl) {
    try {
      if (rawUrl.startsWith('http')) {
        // Full URL - use as-is
        candidates.push(rawUrl);
        
        // Also try the path with current origin if it's localhost
        const u = new URL(rawUrl);
        const path = u.pathname + (u.search || '');
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
          if (origin) {
            candidates.push(`${origin}${path}`);
          }
        }
      } else if (rawUrl.startsWith('/')) {
        // Absolute path - prepend origin
        if (origin) {
          candidates.push(`${origin}${rawUrl}`);
        } else {
          candidates.push(rawUrl);
        }
      } else if (!rawUrl.startsWith('http') && !rawUrl.startsWith('/')) {
        // Relative path without leading slash
        if (origin) {
          candidates.push(`${origin}/${rawUrl}`);
        } else {
          candidates.push(`/${rawUrl}`);
        }
      }
    } catch (error) {
      console.error('[normalizeCmsMediaUrl] Error processing rawUrl:', error, rawUrl);
    }
  }

  // If filename is provided, try Payload CMS API media path structure
  if (filename && origin) {
    // Payload CMS uses /api/media/file/{filename} for media files
    candidates.push(`${origin}/api/media/file/${filename}`);
    // Also try legacy paths as fallbacks
    candidates.push(`${origin}/media/${filename}`);
    candidates.push(`${origin}/uploads/${filename}`);
  } else if (filename) {
    // Relative paths
    candidates.push(`/api/media/file/${filename}`);
    candidates.push(`/media/${filename}`);
    candidates.push(`/uploads/${filename}`);
  }

  const result = candidates.find(Boolean);
  console.log('[normalizeCmsMediaUrl] Output:', { candidates, result });
  return result;
}
