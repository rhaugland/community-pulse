"use client";

import { useState, useEffect } from "react";

interface PostMetadata {
  id: string;
  subreddit: string;
  title: string;
  createdUtc: number;
  score: number;
  numComments: number;
  permalink: string;
  fetchedAt: number;
}

interface SubredditInfo {
  name: string;
  displayName: string;
  subscribers: number;
  description: string;
}

// -- Aggregate helpers --------------------------------------------------------

function postsByHour(posts: PostMetadata[]): number[] {
  const hours = new Array(24).fill(0);
  for (const p of posts) {
    const h = new Date(p.createdUtc * 1000).getHours();
    hours[h]++;
  }
  return hours;
}

function postsBySubreddit(posts: PostMetadata[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of posts) {
    counts[p.subreddit] = (counts[p.subreddit] || 0) + 1;
  }
  return counts;
}

function avgScore(posts: PostMetadata[]): number {
  if (posts.length === 0) return 0;
  return Math.round(posts.reduce((sum, p) => sum + p.score, 0) / posts.length);
}

function avgComments(posts: PostMetadata[]): number {
  if (posts.length === 0) return 0;
  return Math.round(posts.reduce((sum, p) => sum + p.numComments, 0) / posts.length);
}

// -- Components ---------------------------------------------------------------

function HourChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((count, hour) => (
        <div key={hour} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-sm bg-blue-500 transition-all"
            style={{ height: `${(count / max) * 100}%`, minHeight: count > 0 ? 4 : 0 }}
          />
          {hour % 4 === 0 && (
            <span className="text-[10px] text-zinc-500">{hour}h</span>
          )}
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

// -- Main Page ----------------------------------------------------------------

export default function Home() {
  const [subs, setSubs] = useState<SubredditInfo[]>([]);
  const [posts, setPosts] = useState<PostMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check auth status on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "success") {
      setAuthed(true);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  async function loadSubreddits() {
    const res = await fetch("/api/subreddits");
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    const data = await res.json();
    if (data.subreddits) {
      setSubs(data.subreddits);
      setAuthed(true);
    }
  }

  async function refreshData() {
    setLoading(true);
    setError(null);
    try {
      await loadSubreddits();
      // Fetch posts for each moderated sub
      const allPosts: PostMetadata[] = [];
      for (const sub of subs.slice(0, 10)) {
        try {
          const res = await fetch(`/api/posts?sub=${sub.displayName}&limit=25`);
          const data = await res.json();
          if (data.posts) allPosts.push(...data.posts);
        } catch {
          // Skip failed subs
        }
      }
      setPosts(allPosts);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubreddits();
  }, []);

  const hourData = postsByHour(posts);
  const subCounts = postsBySubreddit(posts);

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Community Pulse</h1>
          <p className="text-zinc-400 mb-6">Community health dashboard for Reddit moderators</p>
          <a
            href="/api/auth"
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-500 transition"
          >
            Connect Reddit
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Community Pulse</h1>
          <p className="text-sm text-zinc-400">
            Monitoring {subs.length} subreddit{subs.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={refreshData}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-500 disabled:opacity-50 transition"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </header>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 p-3 rounded-lg text-sm mb-6">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Total Posts" value={posts.length} />
        <StatCard label="Subreddits" value={Object.keys(subCounts).length} />
        <StatCard label="Avg Score" value={avgScore(posts)} />
        <StatCard label="Avg Comments" value={avgComments(posts)} />
      </div>

      {/* Activity by Hour */}
      {posts.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 mb-4">Activity by Hour (UTC)</h2>
          <HourChart data={hourData} />
        </div>
      )}

      {/* Posts by Subreddit */}
      {Object.keys(subCounts).length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 mb-4">Posts by Subreddit</h2>
          <div className="space-y-2">
            {Object.entries(subCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([sub, count]) => (
                <div key={sub} className="flex items-center gap-3">
                  <span className="text-sm w-40 truncate">{sub}</span>
                  <div className="flex-1 bg-zinc-800 rounded-full h-4 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full rounded-full transition-all"
                      style={{
                        width: `${(count / Math.max(...Object.values(subCounts))) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm text-zinc-400 w-8 text-right">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Moderated Subreddits */}
      {subs.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-zinc-400 mb-4">Your Moderated Subreddits</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {subs.map((s) => (
              <div key={s.name} className="bg-zinc-800/50 rounded-lg p-3">
                <div className="font-semibold text-sm">{s.name}</div>
                <div className="text-xs text-zinc-500">
                  {s.subscribers.toLocaleString()} subscribers
                </div>
                {s.description && (
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{s.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {posts.length === 0 && !loading && (
        <div className="text-center py-20 text-zinc-500">
          <p className="text-lg font-semibold mb-2">No data yet</p>
          <p className="text-sm">Click Refresh to load post data from your moderated subreddits</p>
        </div>
      )}

      <footer className="mt-12 pt-6 border-t border-zinc-800 text-center text-xs text-zinc-600">
        All data cached in-memory with 24h TTL. No author PII stored. Read-only access.
      </footer>
    </main>
  );
}
