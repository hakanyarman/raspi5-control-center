# Web Dashboard

React, TypeScript, Vite, Tailwind CSS, and shadcn/ui frontend for the Raspberry Pi Control Center.

## Development

Start the API from the repository root in one terminal:

```bash
npm run dev:api
```

Start the web app in another terminal:

```bash
npm run dev:web
```

Vite listens on port 5173 for LAN testing and proxies `/health` and `/api` requests to the API at `127.0.0.1:3001`. The API remains loopback-only.

## Checks

```bash
npm run lint --workspace=@raspi5-control-center/web
npm run build --workspace=@raspi5-control-center/web
```
