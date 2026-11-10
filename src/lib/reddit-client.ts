/**
 * Reddit OAuth2 client for Community Pulse.
 *
 * Read-only access to post metadata and subreddit lists.
 * Complies with Reddit's Responsible Builder Policy:
 *   - Proper User-Agent header
 *   - Rate limiting: 60 requests/minute (token bucket)
 *   - Data minimization: no author PII, no post body stored
 *   - 24-hour TTL on all cached data
 *   - OAuth2 with minimal scopes (read, mysubreddits)
 */

// -- Types --------------------------------------------------------------------

export interface PostMetadata {
  id: string;
  subreddit: string;
  title: string;
  createdUtc: number;
  score: number;
  numComments: number;
  permalink: string;
  fetchedAt: number; // Unix ms, for TTL enforcement
}

export interface SubredditInfo {
  name: string;
  displayName: string;
  subscribers: number;
  description: string;
}

interface TokenState {
  accessToken: string;
  expiresAt: number;
}

// -- Rate Limiter (token bucket, 60 req/min) ----------------------------------

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly max: number;
  private readonly refillRate: number;
  private queue: Array<() => void> = [];
  private draining = false;

  constructor(maxPerMinute: number) {
    this.max = maxPerMinute;
    this.tokens = maxPerMinute;
    this.lastRefill = Date.now();
    this.refillRate = maxPerMinute / 60_000;
  }

  private refill() {
    const now = Date.now();
    this.tokens = Math.min(this.max, this.tokens + (now - this.lastRefill) * this.refillRate);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.drain();
    });
  }

  private drain() {
    if (this.draining) return;
    this.draining = true;
    const iv = setInterval(() => {
      this.refill();
      while (this.queue.length > 0 && this.tokens >= 1) {
        this.tokens -= 1;
        this.queue.shift()!();
      }
      if (this.queue.length === 0) {
        clearInterval(iv);
        this.draining = false;
      }
    }, 250);
  }
}

// -- In-Memory Cache with TTL -------------------------------------------------

const DATA_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class PostCache {
  private store: Map<string, PostMetadata[]> = new Map();

  set(subreddit: string, posts: PostMetadata[]) {
    this.store.set(subreddit, posts);
  }

  get(subreddit: string): PostMetadata[] | null {
    const posts = this.store.get(subreddit);
    if (!posts) return null;
    const fresh = posts.filter((p) => Date.now() - p.fetchedAt < DATA_TTL_MS);
    if (fresh.length === 0) {
      this.store.delete(subreddit);
      return null;
    }
    this.store.set(subreddit, fresh);
    return fresh;
  }

  getAll(): PostMetadata[] {
    const all: PostMetadata[] = [];
    for (const [sub, posts] of this.store) {
      const fresh = posts.filter((p) => Date.now() - p.fetchedAt < DATA_TTL_MS);
      if (fresh.length === 0) {
        this.store.delete(sub);
      } else {
        this.store.set(sub, fresh);
        all.push(...fresh);
      }
    }
    return all;
  }

  clear() {
    this.store.clear();
  }
}

// -- Client -------------------------------------------------------------------

const USER_AGENT = `web:community-pulse:v1.0.0 (by /u/${process.env.REDDIT_USERNAME || "community_pulse_bot"})`;
const rateLimiter = new RateLimiter(60);
const cache = new PostCache();

let tokenState: TokenState | null = null;
let refreshToken: string | null = process.env.REDDIT_REFRESH_TOKEN || null;

export function setRefreshToken(token: string) {
  refreshToken = token;
}

export function hasAuth(): boolean {
  return !!refreshToken;
}

async function getAccessToken(): Promise<string> {
  if (tokenState && Date.now() < tokenState.expiresAt - 30_000) {
    return tokenState.accessToken;
  }

  if (!refreshToken) {
    throw new Error("No refresh token. Complete OAuth flow first.");
  }

  const clientId = process.env.REDDIT_CLIENT_ID || "";
  const clientSecret = process.env.REDDIT_CLIENT_SECRET || "";
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  tokenState = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return tokenState.accessToken;
}

async function apiGet(path: string): Promise<any> {
  await rateLimiter.acquire();
  const token = await getAccessToken();

  const res = await fetch(`https://oauth.reddit.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT,
    },
  });

  if (res.status === 429) {
    const wait = parseInt(res.headers.get("Retry-After") || "5", 10);
    await new Promise((r) => setTimeout(r, Math.min(wait * 1000, 60_000)));
    return apiGet(path);
  }

  if (!res.ok) {
    throw new Error(`Reddit API ${res.status} on ${path}`);
  }

  return res.json();
}

// -- Public API ---------------------------------------------------------------

/**
 * Fetch post metadata from a subreddit.
 * Returns sanitized data: no author usernames, no post body.
 */
export async function fetchPosts(subreddit: string, limit = 25): Promise<PostMetadata[]> {
  const cached = cache.get(subreddit);
  if (cached) return cached;

  const sub = subreddit.replace(/^r\//, "");
  const data = await apiGet(`/r/${sub}/new?limit=${limit}&raw_json=1`);
  const now = Date.now();

  const posts: PostMetadata[] = (data?.data?.children || []).map((c: any) => ({
    id: c.data.id,
    subreddit: c.data.subreddit_name_prefixed || `r/${sub}`,
    title: c.data.title,
    createdUtc: c.data.created_utc,
    score: c.data.score,
    numComments: c.data.num_comments,
    permalink: `https://reddit.com${c.data.permalink}`,
    fetchedAt: now,
  }));

  cache.set(subreddit, posts);
  return posts;
}

/**
 * Get subreddits the authenticated user moderates.
 */
export async function getModeratedSubs(): Promise<SubredditInfo[]> {
  const data = await apiGet("/subreddits/mine/moderator?limit=100");
  return (data?.data?.children || []).map((c: any) => ({
    name: c.data.display_name_prefixed,
    displayName: c.data.display_name,
    subscribers: c.data.subscribers,
    description: (c.data.public_description || "").slice(0, 200),
  }));
}

/**
 * Get all cached posts across all subreddits, TTL-enforced.
 */
export function getAllCachedPosts(): PostMetadata[] {
  return cache.getAll();
}

/**
 * Clear all cached data.
 */
export function clearCache() {
  cache.clear();
}

/**
 * Build the Reddit OAuth2 authorization URL.
 */
export function getAuthUrl(state: string): string {
  const clientId = process.env.REDDIT_CLIENT_ID || "";
  const redirectUri = process.env.REDDIT_REDIRECT_URI || "http://localhost:3000/api/auth/callback";
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    state,
    redirect_uri: redirectUri,
    duration: "permanent",
    scope: "read mysubreddits",
  });
  return `https://www.reddit.com/api/v1/authorize?${params}`;
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCode(code: string): Promise<void> {
  const clientId = process.env.REDDIT_CLIENT_ID || "";
  const clientSecret = process.env.REDDIT_CLIENT_SECRET || "";
  const redirectUri = process.env.REDDIT_REDIRECT_URI || "http://localhost:3000/api/auth/callback";
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    throw new Error(`Code exchange failed: ${res.status}`);
  }

  const data = await res.json();
  tokenState = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  refreshToken = data.refresh_token;
}
