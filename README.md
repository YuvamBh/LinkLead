# LinkLead

A self-hosted link tracking tool. Create short links, share them, and watch click analytics roll in - device, browser, location, referrer source, and more. No external database needed, everything runs locally via JSON files.

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

Copy the example env file and set your admin password:

```bash
cp .env.example .env.local
```

Then start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) - you'll be redirected to the login page.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `ADMIN_PASSWORD` | Password for the admin panel | `admin` |

## Deploy to Vercel

```bash
npx vercel
```

Set `ADMIN_PASSWORD` in your Vercel project environment variables after deploying.

## How It Works

1. Create a link in the admin panel (e.g. slug `launch2026` → `https://yoursite.com/product`)
2. Share `yourdomain.com/launch2026`
3. Every click gets logged with device info, geo data (via ip-api.com), and referrer
4. View analytics on the dashboard or drill into per-link stats

## Stack

- [Next.js 16](https://nextjs.org) - App Router with Route Handlers
- JSON file storage via Node's `fs` module
- [ua-parser-js](https://github.com/faisalman/ua-parser-js) - user agent parsing
- [ip-api.com](https://ip-api.com) - free IP geolocation (no API key needed)
- [Chart.js](https://www.chartjs.org) - dashboard charts
- Vanilla CSS dark mode design system
