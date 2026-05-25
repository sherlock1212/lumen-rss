## Why Cloudflare Workers (not the Pi) for this app

Your usual stack (Pi + Docker Compose + Cloudflared) is great for self-contained services like Jellyfin, Home Assistant, or a Node.js API. **This app is different**: it was built specifically to run on Cloudflare Workers. The server entry (`src/server.ts`), the RSS proxy (`src/routes/api/feed.ts`), and the SSR pipeline all use the Workers runtime — not Node.js.

To run it on your Pi, you'd have to:
- Change the build target away from Cloudflare
- Rewrite `src/server.ts` for Node
- Build an ARM64 Docker image
- Add a cloudflared ingress rule

To run it on Cloudflare Workers, you'd have to:
- Run two commands

Workers is also **free** for this kind of traffic (100,000 requests/day) and faster (it runs at every Cloudflare edge worldwide, not from your house). Since you already use Cloudflare for the tunnel, you already have an account.

**Recommendation: deploy to Workers.** The Pi stays for everything else you already host on it.

---

## What you'll do, step by step

### 1. Get the code on your computer

Easiest path — connect GitHub:

1. In Lovable, click the **+** button in the chat input (bottom-left) → **GitHub** → **Connect project**. Authorize and pick a repo name.
2. On your computer (Mac/Linux/Windows with git installed):
   ```bash
   git clone https://github.com/<your-username>/<repo-name>.git lumen
   cd lumen
   ```
3. Install Bun (a faster Node.js): https://bun.sh — one-line installer.
4. Install dependencies:
   ```bash
   bun install
   ```

### 2. Fill in your real Firebase config

Open `src/lib/firebase.ts`. You'll see four `"REPLACE_ME"` strings. Replace them with the values from **Firebase Console → Project Settings → Your apps → Web app → SDK setup and configuration**. Save.

### 3. Log in to Cloudflare from the terminal

```bash
bunx wrangler login
```

A browser window opens. Click **Allow**. The terminal confirms you're logged in.

### 4. (Optional) rename the app

Open `wrangler.jsonc`. Change `"name": "tanstack-start-app"` to something you like, e.g. `"lumen"`. This will be the subdomain.

### 5. Deploy

```bash
bun run build
bunx wrangler deploy
```

The last command prints a URL like:

```
https://lumen.<your-cloudflare-account>.workers.dev
```

That URL is your live site. Open it.

### 6. Tell Firebase the new URL is allowed

Sign-in won't work yet because Firebase blocks unknown origins:

1. **Firebase Console → Authentication → Settings → Authorized domains → Add domain** → paste `lumen.<your-account>.workers.dev`.
2. **Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client ID → Edit**:
   - Under **Authorized JavaScript origins**, add `https://lumen.<your-account>.workers.dev`
   - Under **Authorized redirect URIs**, add `https://lumen.<your-account>.workers.dev/__/auth/handler`
3. Save. Sign-in works now.

### 7. (Optional) Use a nice hostname like `lumen.yourdomain.com`

Since your domain is already on Cloudflare (that's how Cloudflared works):

1. Cloudflare dashboard → **Workers & Pages** → click your worker → **Settings** → **Domains & Routes** → **Add → Custom Domain**.
2. Type `lumen.yourdomain.com`. Click **Add**.
3. Cloudflare creates the DNS record and SSL certificate automatically (≈30 seconds).
4. Repeat step 6 above for the new hostname (add it to Firebase + Google Cloud).

**Important:** Do **not** add a Cloudflared tunnel rule for this. The Worker is already on Cloudflare's network — adding a tunnel hop would route traffic through your Pi for no reason and make it slower. Tunnels are for things hosted on your Pi; Workers are direct.

### 8. Future updates

When you change the code (in Lovable or locally):

```bash
git pull              # if you edited in Lovable
bun run build
bunx wrangler deploy
```

That's the whole loop. Optionally, set up a GitHub Action to auto-deploy on every push — Cloudflare has a one-click template for it.

---

## What you can ignore

- `Dockerfile`, `docker-compose.yml`, ARM64 images — none of it applies. Workers handles the runtime.
- Cloudflared ingress rules for this app — Workers doesn't go through your tunnel.
- Server resource limits, restarts, port forwarding — all handled by Cloudflare.

## When the Pi *would* make sense

Only if you outgrow the free Workers limits (very unlikely for a personal RSS reader) or want full data sovereignty. In that case it's a separate project: switch the build target to Node, write a Dockerfile, run on the Pi, route through your existing tunnel. Happy to plan that later if you ever need it.
