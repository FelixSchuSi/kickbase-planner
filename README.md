# kickbase-planner

## local development

### frontend

```bash
python3 -m http.server 8000
```
Open `http://localhost:8000` in your browser.

### backend

```bash
npx wrangler dev
```
The worker runs on `http://localhost:8787/` by default.

## deployment

### frontend

```bash
git push
```
Deployment will be live at `https://felixschusi.github.io/kickbase-planner/`

### backend


```bash
wrangler deploy
```
Deployment will be live at `https://li-worker.better-kickbase.workers.dev/`


