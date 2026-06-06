/**
 * Safe localStorage helpers.
 * All keys are automatically prefixed with `codex_`.
 * All operations are wrapped in try/catch — corrupt JSON or a full/disabled
 * localStorage will never crash the app.
 */

export function storageGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`codex_${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(`codex_${key}`, JSON.stringify(value));
  } catch {
    // localStorage full or disabled — fail silently
  }
}

export function storageClear(key: string): void {
  try {
    localStorage.removeItem(`codex_${key}`);
  } catch {
    // fail silently
  }
}

/** Returns a human-readable relative timestamp like "2 hours ago" */
export function timeAgo(isoString: string): string {
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60)  return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)  return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days === 1)    return 'yesterday';
    return `${days} days ago`;
  } catch {
    return '';
  }
}
