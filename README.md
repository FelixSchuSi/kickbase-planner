# kickbase-planner

## local development

Start or restart the frontend and both backend workers together:

```bash
./dev.sh
```

They run in the background on ports 8000, 8787, and 8788. Open
`http://localhost:8000`; logs are in `.dev/*.log`. Run the script again to
restart them. Requires Bash, Python 3, Node/npm, `lsof`, and `setsid` (Linux).

### frontend

```bash
python3 -m http.server 8000
```
Open `http://localhost:8000` in your browser.

### backend

Run each worker in a separate terminal.

LigaInsider:

```bash
npx wrangler dev
```
The worker runs on `http://localhost:8787/` by default.

Kickbase API proxy:

```bash
npx wrangler dev --config wrangler.kickbase.toml
```
The proxy runs on `http://localhost:8788/`. The frontend automatically uses it
when opened on `localhost` or `127.0.0.1`.

## deployment

### frontend

```bash
git push
```
Deployment will be live at `https://felixschusi.github.io/kickbase-planner/`

### backend

LigaInsider:

```bash
wrangler deploy
```
Deployment will be live at `https://li-worker.better-kickbase.workers.dev/`

Kickbase API proxy (deploy this before publishing the frontend):

```bash
npx wrangler deploy --config wrangler.kickbase.toml
```

The expected URL is `https://kickbase-worker.better-kickbase.workers.dev/`.
If Wrangler prints a different URL, update `src/config.js` to match, keeping
the `/v4` suffix.

All Kickbase API calls follow this route:
frontend → Kickbase Worker `/v4/...` → `https://api.kickbase.com/v4/...`.
The worker handles CORS preflights and forwards request bodies, bearer tokens,
and API response statuses without caching responses. Its upstream host is fixed.

Allowed frontend origins are configured in `wrangler.kickbase.toml` under
`ALLOWED_ORIGINS`. The defaults cover GitHub Pages and local development on
port 8000. Add your origin there if you use another domain or local port, then
redeploy the worker.

## tests

```bash
node --test tests/*.test.mjs
```
