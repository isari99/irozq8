import { logger } from "./logger";

interface TwitchToken {
  token: string;
  expiresAt: number;
}

interface TwitchUser {
  avatarUrl: string | null;
  displayName: string;
}

let tokenCache: TwitchToken | null = null;
const userCache = new Map<string, { data: TwitchUser; fetchedAt: number }>();
const USER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getAppToken(): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  try {
    const res = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 300) * 1000,
    };
    return tokenCache.token;
  } catch (err) {
    logger.error({ err }, "Failed to get Twitch app token");
    return null;
  }
}

async function getTwitchUserFromIvr(username: string): Promise<TwitchUser> {
  try {
    const res = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(username)}`, {
      headers: { "User-Agent": "RosePlatform/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { avatarUrl: null, displayName: username };
    const data: any = await res.json();
    // IVR v2 returns an array
    const user = Array.isArray(data) ? data[0] : data;
    if (!user || !user.login) return { avatarUrl: null, displayName: username };
    return {
      avatarUrl: user.logo ?? null,
      displayName: user.displayName ?? username,
    };
  } catch {
    return { avatarUrl: null, displayName: username };
  }
}

export async function getTwitchUser(username: string): Promise<TwitchUser> {
  const lower = username.toLowerCase();

  const cached = userCache.get(lower);
  if (cached && Date.now() - cached.fetchedAt < USER_CACHE_TTL) {
    return cached.data;
  }

  const token = await getAppToken();
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!token || !clientId) {
    const result = await getTwitchUserFromIvr(lower);
    userCache.set(lower, { data: result, fetchedAt: Date.now() });
    return result;
  }

  try {
    const res = await fetch(`https://api.twitch.tv/helix/users?login=${lower}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId,
      },
    });
    if (!res.ok) return { avatarUrl: null, displayName: username };
    const data: any = await res.json();
    const user = data?.data?.[0];
    if (!user) return { avatarUrl: null, displayName: username };

    const result: TwitchUser = {
      avatarUrl: user.profile_image_url ?? null,
      displayName: user.display_name ?? username,
    };
    userCache.set(lower, { data: result, fetchedAt: Date.now() });
    return result;
  } catch (err) {
    logger.error({ err, username }, "Failed to fetch Twitch user");
    return { avatarUrl: null, displayName: username };
  }
}
