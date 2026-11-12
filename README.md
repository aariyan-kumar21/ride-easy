# Smart Priority-Based Cab & Auto Allocation System

A full-stack web simulation demonstrating priority-aware, capacity-aware cab and auto allocation with road-based ETA routing, animated vehicle movement, and real-time dispatch dashboards.

See [PRD.md](./PRD.md) and [TECH_STACK.md](./TECH_STACK.md) for the full specification.

## Project Structure

```text
Ride easy/
├── client/                 # HTML5, CSS3, Vanilla JS frontend
│   ├── index.html
│   ├── css/
│   │   ├── style.css
│   │   └── responsive.css
│   ├── js/
│   │   ├── app.js
│   │   ├── map.js
│   │   ├── booking.js
│   │   ├── dashboard.js
│   │   └── socket.js
│   └── assets/
├── server/                 # Node.js + Express backend
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── sockets/
│   │   ├── app.js
│   │   └── server.js
│   ├── .env.example
│   └── package.json
├── package.json            # Root convenience scripts
├── .gitignore
├── PRD.md
├── TECH_STACK.md
└── README.md
```

## Prerequisites

- **Node.js** (v18+ recommended; tested on v24.14.0)
- **npm** (v9+ recommended)

## Setup Instructions

1. **Install backend dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Configure environment variables:**
   Copy `server/.env.example` to `server/.env` and adjust values if needed:
   ```bash
   cp server/.env.example server/.env
   ```
   Variables:
   - `PORT` (default `5000`)
   - `MONGODB_URI` (default `mongodb://127.0.0.1:27017/smart_cab_simulation`)
   - `CLIENT_ORIGIN` (default `http://localhost:5500`)
   - `OSRM_BASE_URL` (default `https://router.project-osrm.org`)
   - `NODE_ENV` (default `development`)

## Running the Application

From the repository root:

```bash
npm start
```

Or with file-watch auto-reload (Node `--watch`):

```bash
npm run dev
```

You can also run directly inside `server/`:

```bash
cd server
npm start
```

The Express server serves both the API and the static `client/` frontend at:
- Frontend UI: `http://localhost:5000`
- Health Check API: `http://localhost:5000/api/health`

*(If you also serve `client/` separately on `http://localhost:5500` via Live Server, CORS is pre-configured for `CLIENT_ORIGIN`.)*

## Verification

1. Start the server (`npm start`).
2. Check `GET /api/health` (e.g. `curl http://localhost:5000/api/health`) — expects HTTP `200` with `{ "status": "ok", ... }`.
3. Open `http://localhost:5000` in a browser — the dashboard loads and the top-right status badge shows `Backend: OK`.

