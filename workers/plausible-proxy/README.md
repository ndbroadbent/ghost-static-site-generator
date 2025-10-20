# Plausible Analytics Proxy Worker

This Cloudflare Worker proxies requests to Plausible Analytics to bypass ad blockers.

## Deployed URL

The worker is deployed at: **https://pa-ndbr.nathan-f77.workers.dev**

## Endpoints

- `https://pa-ndbr.nathan-f77.workers.dev/js/script.js` - Proxies the Plausible script
- `https://pa-ndbr.nathan-f77.workers.dev/api/event` - Proxies analytics events

## Usage in HTML

```html
<script defer
  data-domain="madebynathan.com"
  data-api="https://pa-ndbr.nathan-f77.workers.dev/api/event"
  src="https://pa-ndbr.nathan-f77.workers.dev/js/script.js">
</script>
```

## Deployment

From the root directory:

```bash
npm run worker:deploy
```

Or from this directory:

```bash
wrangler deploy
```

## Local Development

```bash
npm run worker:dev
# or
wrangler dev
```

## Monitoring

View live logs:

```bash
npm run worker:tail
# or
wrangler tail
```
