# LinkLead

A smart, self-hosted link tracking and analytics platform. Create short links, share them, and watch detailed click analytics roll in in real-time. LinkLead tracks device types, browsers, deep geolocation, referrer sources, and more. 

Designed for speed and scale: LinkLead uses **Supabase (PostgreSQL)** as the primary database, backed by **Upstash Redis** for blazing fast redirect caching in production. It also features a multi-tenant architecture so you can invite other users, and everyone only sees their own data. For local development, it gracefully falls back to local JSON files so you can build and test without setting up any databases!

## Features

- **Short links at your domain** - `yourdomain.com/your-slug`
- **Zero-latency redirects** - Uses Next.js 15 `after()` to process telemetry in the background so users are never slowed down.
- **Deep Analytics** - Tracks device type, OS, browser, and version.
- **Advanced Geolocation** - Country, region, city, latitude/longitude, ISP, timezone, and even reverse geocoding to the street address!
- **Traffic Source Detection** - Identifies traffic from Twitter, Instagram, LinkedIn, Facebook, Reddit, etc.
- **Multi-Tenant Architecture** - Invite your team. Everyone logs in with their own email and password and manages their own isolated links.
- **AI Categorization** - Automatically tags and categorizes your links using OpenAI.

## Getting Started

### Local Development

Running LinkLead locally is incredibly simple because it uses local JSON files for storage by default. You don't need to connect Supabase or Redis just to mess around locally.

```bash
git clone https://github.com/yourusername/linklead.git
cd linklead
npm install
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with any credentials (local dev uses a relaxed auth check so you can get straight to building). Your links and clicks will be saved to the `data/` folder.

## Deploying to Production (Vercel)

When you deploy to production, LinkLead automatically switches to using Supabase and Redis for true persistence and speed.

### 1. Set up Supabase (Database & Auth)
1. Create a project at [supabase.com](https://supabase.com).
2. Grab your `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from the Project Settings -> API section.
3. Run the SQL schema to create the `links` and `clicks` tables (see `scripts/schema.sql` or the provided SQL in the project).
4. Create your admin user account via the Supabase Auth dashboard or by running `node scripts/createAdminUser.js your@email.com YourPassword123!`.

### 2. Set up Upstash Redis (Caching)
1. Sign up at [console.upstash.com](https://console.upstash.com).
2. Create a new Redis database.
3. Grab the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

### 3. Deploy
Deploy to Vercel and add your environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `OPENAI_API_KEY` (for AI link categorization)

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key (Public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key (Admin) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |
| `OPENAI_API_KEY` | Used for the AI categorization and advisor features |

## Architecture & Stack

- **[Next.js 16](https://nextjs.org)** - App Router with Route Handlers and Server Actions
- **[Supabase](https://supabase.com)** - PostgreSQL database and multi-tenant Authentication
- **[Upstash Redis](https://upstash.com)** - Persistent key-value caching layer for blazing fast `/[slug]` redirects
- **[ua-parser-js](https://github.com/faisalman/ua-parser-js)** - User agent parsing
- **[ip-api.com](https://ip-api.com)** - Free IP geolocation 
- **[OpenStreetMap Nominatim](https://nominatim.org)** - Reverse geocoding for deep street-level analytics
- **Vanilla CSS** - A highly customized, glassmorphism-inspired dark mode design system
