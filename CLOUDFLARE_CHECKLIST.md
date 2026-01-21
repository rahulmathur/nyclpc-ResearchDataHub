# Cloudflare Pages – Settings Checklist

Use this to verify your Cloudflare setup when the deployed site shows "Disconnected" or API calls fail.

---

## 1. Project → **Settings** → **Builds & deployments**

| Setting | Use this | Notes |
|--------|----------|-------|
| **Framework preset** | `None` or `Create React App` | If CRA, it may prefill build/output; ensure they match below. |
| **Root directory** | `frontend` | Build runs from this folder. |
| **Build command** | `npm run build` or `npm ci && npm run build` | |
| **Build output directory** | `build` | Must match `frontend/build` after build. |
| **Root directory** (for output) | — | With root `frontend`, `build` means `frontend/build`. |

---

## 2. **Environment variables**

**Path:** Project → **Settings** → **Environment variables**

Add for **Production** (and **Preview** if you use branch deploys):

| Variable | Value | Required? |
|----------|-------|-----------|
| `BACKEND_URL` | `http://NYCLPC-RDH-Staging-env-1.eba-2rxzfa4v.us-east-1.elasticbeanstalk.com` | Optional; Function falls back to this if unset. |
| `NODE_VERSION` | `18` | Optional; `frontend/.nvmrc` also pins Node. |
| `ALLOWED_ORIGINS` | `*` or leave unset | Optional; `*` = allow all. |

**Important for `BACKEND_URL`:**
- Use `http://` (Beanstalk often has no valid HTTPS).
- **Do not** add a port (no `:5000` or `:80`). The host alone uses port 80.
- No trailing slash.

**Wrong:**
- `http://xxx.elasticbeanstalk.com:5000`
- `https://xxx.elasticbeanstalk.com` (if Beanstalk HTTPS is broken)
- `http://xxx.elasticbeanstalk.com/`

**Correct:**
- `http://NYCLPC-RDH-Staging-env-1.eba-2rxzfa4v.us-east-1.elasticbeanstalk.com`

---

## 3. **Functions and `wrangler.toml`**

- `frontend/functions/api/[[path]].js` should exist and proxy to `BACKEND_URL`.
- `frontend/wrangler.toml` should exist with `compatibility_flags = ["nodejs_compat"]` (fixes `process is not defined`).
- No need to configure Functions in the UI; the `functions/` folder is picked up automatically.

---

## 4. **Deployments**

- After changing **Environment variables**, trigger a **new deployment** (e.g. **Retry** or push a commit). Env vars are baked in at build/deploy time.
- If a deploy fails, use **Clear build cache** (in Builds & deployments) then redeploy.

---

## 5. **Quick test from the browser**

1. Open your Pages URL, e.g. `https://<your-project>.pages.dev`.
2. Go directly to:  
   `https://<your-project>.pages.dev/api/health`
3. You should see JSON, e.g.:  
   `{"status":"ok","database":"connected","dbType":"postgresql"}`

If you see:
- **`{"status":"ok","database":"connected",...}`** – Backend and proxy are fine; the app may be reading the response incorrectly.
- **`{"status":"error","database":"disconnected","error":"Backend unreachable",...}`** – The Function cannot reach Beanstalk (check `BACKEND_URL`, Beanstalk/ELB, no `:5000`).
- **5xx or "Failed to fetch"** – Function or build issue; check deploy logs.

---

## 6. **Debug tooltip on "Disconnected"**

After the latest frontend change, **hover over the red "Disconnected" label** in the header. A tooltip shows:

- **Request failed (e.g. HTTP 503):** `"Backend unreachable"` or similar → backend not reachable from the Function.
- **`Backend returned database: disconnected`** → Backend reached, but its DB connection failed (check Beanstalk env vars and RDS).
- **`Backend returned database: missing`** → Response shape unexpected; could be a proxy or backend change.

---

## 7. **If it still fails**

- In the deployed site, open **DevTools → Network**, log in, select the `health` request and check:
  - **Status** (200, 503, etc.)
  - **Response** body.
- In Cloudflare: **Deployments** → latest deploy → **View build log** (for build errors) and **Functions** log (if available).
- In AWS: Beanstalk **Logs** and RDS/security groups (DB and ELB must allow traffic as in `DEPLOYMENT.md`).
