# Tap Runners

A real-time multiplayer sprint racer: tap to build speed, find your rhythm, and race 100, 200, 400, or 800 meters. The FastAPI server owns every runner's speed and distance; clients only send taps and render server snapshots.

## Requirements

- Python 3.11+
- Node.js 20.9+ and npm

## Run locally

Open two terminals from the project root.

### 1. Start the game server

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

On macOS/Linux, activate the environment with `source .venv/bin/activate`.

The server is available at `http://localhost:8001`; `GET /health` returns its health status.

### 2. Start the web client

```powershell
npm install
npm run dev
```

The root npm workspace installs the client dependencies and forwards `dev`, `build`, and `start` to the Next.js app. You can also run the client directly from `client` if preferred.

Open [http://localhost:3000](http://localhost:3000). By default, the browser connects to `ws://localhost:8001`. To point at a different server, set `NEXT_PUBLIC_WS_URL` before starting/building Next.js, for example:

```powershell
$env:NEXT_PUBLIC_WS_URL = "wss://your-game-server.example.com"
npm run dev
```

The HTTP room-creation URL is derived from the WebSocket URL (`ws:` → `http:`, `wss:` → `https:`).

## Play

1. Enter a runner name and create a room, or enter a friend's four-letter code.
2. Share the room URL or use **Copy Link** in the lobby. A visitor chooses a name before joining.
3. The host starts the race. Tap/click the large **RUN** control or press Space to accelerate.
4. Taps are server rate-limited. Evenly spaced taps earn a rhythm bonus; speed decays continuously.
5. The first runner to reach the selected sprint distance wins. Finished players can watch the remaining runners; results appear when everyone finishes or the 15-second finish window expires. The host can queue a rematch from the results screen.

Rooms support up to eight players and live in backend memory; if the backend restarts, active rooms are cleared. When MongoDB Atlas is configured, completed race results are saved and available from `GET /races`. MongoDB is not involved in the 30-tick-per-second game loop. A dropped client reconnects and attempts to rejoin its room; an active race cannot be rejoined.

The lobby defaults to 200 m. The host can change the distance to 100, 200, 400, or 800 m with the host-only WebSocket action `{"type":"setDistance","meters":200}`. Lobby broadcasts include `raceDistance`; the course finish line and distance markers rebuild to match. Race state contains each player's `distance`, `speed`, `lane`, `finished`, `finishTime`, and `finishPlace`. The server sends a sorted `results` message with finish time, average/top speed, tap count, and DNF status. Finish times and personal bests are shown in the client; personal bests are stored in local storage separately for each distance. The client renders a straight eight-lane track with a chase camera, countdown-synced start lights, and four distinct environments. Each theme has a dedicated builder under `client/lib/themes/`. The host can select a theme in the lobby; the server stores it in the room and broadcasts it to all players.

The room exit control opens an accessible confirmation dialog. Leaving intentionally removes the player from the room and does not attempt a reconnect; unexpected disconnects continue to use the reconnect behavior above. A host departure transfers host control, and an empty room is removed.

### Themes and visual check

Select a theme in the lobby as the host. Other players see the active theme but cannot change it. Switching themes rebuilds the environment and disposes the previous Three.js world.

For a quick visual check, join a room, choose each theme, then start a race:

- **Sunny Stadium:** enclosed tiered bowl and rear stands, canopies, colored crowd, four floodlight towers, live scoreboard, jumbotron, city skyline, banners, flags, and potted shrubs. No hills.
- **Candy Park:** lollipop and round candy trees, flower beds, picnic tables, striped tents, a rotating Ferris wheel and carousel, drifting balloons/clouds, string lights, small spectator groups, and lit purple hills.
- **Desert Run:** rolling dunes, mesas and rock arch, varied cacti, dry bushes, tumbleweeds, wooden fences, adobe homes, horizon pyramids, circling birds, and camel-side spectators.
- **Snow Peak:** lit alpine mountains, snow-covered pines, lodge cabins with animated chimney smoke, snowmen, an igloo, moving ski-lift chairs, an icy lake, rope barriers, winter spectators, and falling snow.
- **All themes:** check the straight track, lane lines and numbers, theme-styled distance signs every 50 m, and theme-specific start/finish arches. The HUD shows remaining distance on a light card and an orange tap button.
- **Multiplayer sync and cleanup:** open the room on two devices; change the theme on the host and confirm the guest world updates. Switch themes repeatedly and confirm old scenery does not remain.

## Project layout

```text
tap-runners/
├── server/
│   ├── .env.example
│   ├── database.py
│   ├── game.py
│   ├── main.py
│   └── requirements.txt
├── client/
│   ├── .env.example
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── package.json
│   └── next.config.mjs
├── render.yaml
└── README.md
```

## Deployment

### 1. Create MongoDB Atlas credentials

1. Create an Atlas cluster and a database user with read/write access to the game database.
2. Add the backend host to Atlas **Network Access**. If your Render plan does not provide stable outbound IPs, Atlas may require a broader IP rule; use a strong, dedicated database password and never put the URI in Vercel or source control.
3. Copy the Atlas connection string and replace its username/password placeholders. URL-encode special characters in the password.

`server/.env.example` lists the backend settings. Set these in Render; do not commit real values:

- `MONGODB_URI`: the Atlas connection string.
- `MONGODB_DATABASE`: database name, normally `tap_runners`.
- `ALLOWED_ORIGINS`: the exact Vercel site origin, such as `https://tap-runners.vercel.app` (no trailing slash). Include preview origins only if those deployments should be able to connect.

The service checks Atlas connectivity at startup. If `MONGODB_URI` is missing, the API still runs for local development, but it logs that race results are not being saved. If a configured URI cannot connect, startup fails with an actionable error rather than silently running without persistence.

### 2. Deploy the backend to Render

1. Push this project to a Git repository and create a Render **Blueprint** using the root `render.yaml`, or create a Python web service manually.
2. For a manual service use root directory `server`, build command `pip install -r requirements.txt`, start command `uvicorn main:app --host 0.0.0.0 --port $PORT`, and health-check path `/health`.
3. Set `MONGODB_URI`, `MONGODB_DATABASE`, and `ALLOWED_ORIGINS` in the Render environment settings.
4. Copy the deployed HTTPS service hostname, for example `https://tap-runners-api.onrender.com`. The WebSocket address uses `wss://` with the same hostname.

Keep the backend at **one instance**: active rooms are intentionally in server memory, and the current WebSocket game server does not synchronize rooms between replicas. Atlas stores completed results, not live room state. A restart clears live races. For multiple backend instances, a shared real-time store/pub-sub layer (for example Redis) is required in addition to the results database.

### 3. Deploy the frontend to Vercel

1. Import the Git repository into Vercel and set the project **Root Directory** to `client`.
2. Add `NEXT_PUBLIC_WS_URL` with the Render WebSocket URL, for example `wss://tap-runners-api.onrender.com`. Do not add MongoDB credentials to Vercel.
3. Deploy or redeploy after setting the variable; `NEXT_PUBLIC_` values are baked into the frontend build.
4. Copy the final Vercel origin into Render's `ALLOWED_ORIGINS`, then redeploy the backend if needed.

For local development, `client/.env.example` uses `ws://localhost:8001`; copy it to `client/.env.local` if you need to override the default. To test Atlas locally, copy `server/.env.example` to `server/.env`, replace its placeholders, then start Uvicorn with `--env-file .env` from the `server` directory. Keep real `.env` files private; they are ignored by Git.

`GET /health` reports the database connection status. `GET /races?limit=20` returns the latest completed results (limit 1–100); it returns HTTP 503 if Atlas is not configured or is unavailable.
