# MiniSystem

MiniSystem is a dynamic web application designed to enhance MiniFRC by integrating notifications, providing detailed statistics, and controls for queuing/matches.

## Development

```sh
npm install
npm run db:migrate && npm run db:seed   # creates data/minisystem.db + admin/admin
npm run dev                             # http://localhost:3000
```

Useful scripts: `npm test`, `npm run typecheck`, `npm run lint`, `npm run format`.

## Deployment (Docker)

Everything — app, WebSockets, SQLite — runs in one container:

```sh
docker build -t minisystem .
docker run -d --name minisystem \
  -p 3000:3000 \
  -v minisystem-data:/data \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=change-me \
  minisystem
```

On boot the container applies database migrations and ensures the admin
account exists (restarting with `ADMIN_PASSWORD` set also resets a forgotten
password). The SQLite database lives on the `/data` volume — keep that volume
to keep your events.

Put a TLS-terminating reverse proxy (Caddy, nginx, Traefik) in front:

- HTTPS is required for the display camera (`getUserMedia`) and PWA install.
- The proxy must forward WebSocket upgrades for `/_ws`.

Example Caddyfile:

```
minisystem.example.com {
    reverse_proxy localhost:3000
}
```

(Caddy proxies WebSockets and provisions certificates automatically.)

## URLs at an event

| Page | URL | Who |
| --- | --- | --- |
| Admin dashboard | `/admin` | event staff |
| Field control panel | `/admin/events/<slug>/control` | scorekeeper |
| Audience display | `/display/<slug>` | venue screen (no login) |
| Judge scorer | `/judge/<slug>` | judges' phones (any login) |
| Team dashboard | `/team` | team accounts |
| Public event page | `/public/<slug>` | everyone |
| TV mode | `/public/<slug>/tv` | lobby screens (no login) |
