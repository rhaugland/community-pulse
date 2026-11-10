# Community Pulse

A read-only community health dashboard for Reddit moderators. Displays post volume trends, activity heatmaps, and engagement metrics for subreddits you moderate.

## What It Does

- Connects via Reddit OAuth2 (read-only scopes: `read`, `mysubreddits`)
- Fetches post metadata from your moderated subreddits
- Displays aggregate statistics: post volume over time, activity by hour, average engagement
- All data is cached in-memory with a 24-hour TTL and automatically purged

## What It Does NOT Do

- No posting, commenting, voting, or messaging
- No bot accounts or automated actions
- No long-term data storage or database
- No data export or third-party sharing
- No user profile tracking (author usernames are not stored)

## Why Not Devvit?

This is an external web dashboard that moderators access in their browser alongside Reddit, not an in-Reddit experience. Devvit apps are installed per-subreddit and render inside Reddit's UI. Community Pulse needs to:

1. Display a unified cross-subreddit view (Devvit scopes to a single subreddit)
2. Show time-series charts and heatmaps (Devvit's Blocks UI has no charting primitives)
3. Run as a standalone web app moderators bookmark and check independently

## Setup

1. Create a Reddit app at https://www.reddit.com/prefs/apps (select "web app")
2. Copy `.env.example` to `.env.local` and fill in credentials
3. `npm install && npm run dev`
4. Visit `http://localhost:3000` and click "Connect Reddit"

## Rate Limiting

- Maximum 60 requests per minute (Reddit's documented limit)
- Token bucket rate limiter with automatic queuing
- Respects `Retry-After` headers on 429 responses
- Dashboard refreshes are manual (no automated polling)

## Data Retention

- In-memory cache only, no database
- All post metadata expires after 24 hours
- Author usernames are stripped before caching
- Application restart clears all cached data
