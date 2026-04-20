const cache = new Map<string, string>();

export const fallbackAvatar = (u: string): string =>
  `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(u)}`;

export async function fetchTwitchAvatar(username: string): Promise<string> {
  const lower = username.toLowerCase();
  if (cache.has(lower)) return cache.get(lower)!;

  try {
    const res = await fetch(`/api/twitch/user/${encodeURIComponent(lower)}`);
    if (!res.ok) throw new Error("not ok");
    const data: { avatarUrl: string | null; displayName: string } = await res.json();
    const url = data.avatarUrl ?? fallbackAvatar(username);
    cache.set(lower, url);
    return url;
  } catch {
    return fallbackAvatar(username);
  }
}
