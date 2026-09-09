# LinkLead

A self-hosted link tracking tool. Create short links, share them, and watch click analytics roll in - device, browser, location, referrer source, and more. No external database needed for local dev - everything runs via JSON files. In production it uses Upstash Redis for persistent storage.

## Features

- Short links at your domain - `yourdomain.com/your-slug`
- Real-time click analytics dashboard
- Tracks device type, OS, browser, and version
- IP geolocation - country, city, latitude/longitude, ISP, timezone
- Traffic source detection (Twitter, Instagram, LinkedIn, Facebook, Reddit, etc.)
- CSV export of all click data
- Password-protected admin panel
- Per-link analytics pages

## Getting Started

```bash
git clone https://github.com/yourusername/linklead.git
cd linklead
npm install
```

Copy the example env file and fill in your values:

```bash
cp .env.example .env.local
```

Then start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and you will be redirected to the login page.

The app uses JSON files in `data/` locally so you do not need Redis for development.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `ADMIN_PASSWORD` | Password for the admin panel | `admin` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint | not set (uses JSON files) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token | not set (uses JSON files) |

## Deploy to Vercel

### 1. Set up Upstash Redis (free)

1. Sign up at [console.upstash.com](https://console.upstash.com)
2. Create a new Redis database
3. Copy the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from the REST API section

### 2. Deploy

```bash
npx vercel --prod
```

### 3. Add environment variables

In your Vercel project settings, add:
- `ADMIN_PASSWORD` - something strong
- `UPSTASH_REDIS_REST_URL` - from Upstash console
- `UPSTASH_REDIS_REST_TOKEN` - from Upstash console

Then redeploy and you are good to go.

## How It Works

1. Create a link in the admin panel (e.g. slug `launch2026` pointing to `https://yoursite.com/product`)
2. Share `yourdomain.com/launch2026`
3. Every click gets logged with device info, geo data (via ip-api.com), and referrer source
4. View analytics on the dashboard or drill into per-link stats

## Storage

| Environment | Storage | Persistence |
|---|---|---|
| Local dev | JSON files in `data/` | Permanent on disk |
| Vercel with Redis | Upstash Redis | Permanent |
| Vercel without Redis | `/tmp` directory | Resets on cold start |

## Stack

- [Next.js 16](https://nextjs.org) - App Router with Route Handlers
- [Upstash Redis](https://upstash.com) - persistent key-value storage in production
- [ua-parser-js](https://github.com/faisalman/ua-parser-js) - user agent parsing
- [ip-api.com](https://ip-api.com) - free IP geolocation (no API key needed)
- [Chart.js](https://www.chartjs.org) - dashboard charts
- Vanilla CSS dark mode design system
