const sizeUnits = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < sizeUnits.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${sizeUnits[unit]}`;
}

export function formatGigabytes(bytes: number | null): string {
  if (bytes === null) return "unknown";
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function relativeTime(unixSeconds: number): string {
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - unixSeconds));
  if (seconds < 45) return "just now";
  if (seconds < 90) return "a minute ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days < 45) return days === 1 ? "1 day ago" : `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 18) return months === 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.round(months / 12);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

// long windows paths are useless when the tail (exe name) is what is cut off
export function middleTruncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const keep = max - 3;
  const head = Math.ceil(keep * 0.52);
  const tail = keep - head;
  return `${text.slice(0, head)}...${text.slice(text.length - tail)}`;
}

export function initials(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}
