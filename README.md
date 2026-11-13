# Smart Priority-Based Cab & Auto Allocation System

A full-stack, real-time web simulation demonstrating priority-aware, capacity-aware cab and auto allocation in a Bengaluru demo area using road-based OSRM routing, animated vehicle movement, and live Socket.IO dashboard synchronization.

See [PRD.md](./PRD.md) and [TECH_STACK.md](./TECH_STACK.md) for the complete specification.

---

## Technology Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES Modules), Leaflet.js, OpenStreetMap tiles, Lucide Icons
- **Backend:** Node.js, Express.js
- **Storage:** Centralized Backend In-Memory Store (fast, zero external database setup, deterministic simulation reset)
- **Real-time:** Socket.IO
- **Routing:** OSRM Driving Route API (with Haversine road-factor fallback)

---

## Project Structure

```text
Ride easy/
├── client/                     # HTML5, CSS3, Vanilla JS dispatch dashboard
│   ├── index.html
│   ├── css/
│   │   ├── style.css
│   │   └── responsive.css
│   └── js/
│       ├── api.js              # REST API client
│       ├── app.js              # App bootstrap & navigation
│       ├── booking.js          # Booking form & validation
│       ├── dashboard.js        # Stats, tables, simulation & scenario controls
│       ├── map.js              # Leaflet map, markers & multi-route layers
│       ├── seedData.js         # Bengaluru coordinates & seed reference
│       ├── socket.js           # Socket.IO client & reconnect sync
│       └── state.js            # Single source of truth store
├── server/
│   ├── src/
│   │   ├── config/             # env.js, db.js, priority.config.js
│   │   ├── controllers/        # health, vehicle, booking, admin, simulation
│   │   ├── middleware/         # Centralized error & 404 handling
│   │   ├── models/             # User, Vehicle, Booking Mongoose schemas
│   │   ├── routes/             # Express API routers
│   │   ├── seed/               # Idempotent seed script (seedData.js)
│   │   ├── services/           # priority, routing, allocation, simulation, scenario
│   │   ├── sockets/            # Socket.IO server & event handlers
│   │   ├── app.js              # Express app & static client serving
│   │   └── server.js           # HTTP + Socket.IO server & graceful shutdown
│   ├── tests/                  # Node.js built-in test suites
│   ├── .env.example
│   └── package.json
├── package.json                # Root convenience scripts
├── PRD.md
├── TECH_STACK.md
└── README.md
```

---

## Environment Variables

Copy `server/.env.example` to `server/.env` and configure as needed:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `5000` | Backend HTTP & Socket.IO server port |
| `CLIENT_ORIGIN` | `http://localhost:5500` | Allowed CORS origin for separate dev server |
| `OSRM_BASE_URL` | `https://router.project-osrm.org` | OSRM routing server base URL |
| `NODE_ENV` | `development` | Runtime environment (`development` / `production`) |
| `NIGHT_START_HOUR` | `22` | Optional start hour (24h) for night priority |
| `NIGHT_END_HOUR` | `6` | Optional end hour (24h) for night priority |

---

## Installation & Execution

### Prerequisites
- **Node.js** v18+ (tested on v24.14.0)
- Zero external database installation required (uses built-in high-performance backend in-memory storage)

### Setup & Run
1. **Install backend dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp server/.env.example server/.env
   ```

3. **Seed initial Bengaluru demo data (5 passengers, 10 vehicles, 5 bookings):**
   ```bash
   npm --prefix server run seed
   ```

4. **Start the application (from repository root):**
   ```bash
   npm start
   ```
   *(Or `npm run dev` for auto-reload with `node --watch`.)*

5. **Open the dashboard:**
   Navigate to `http://localhost:5000` (open in two tabs to observe live Socket.IO synchronization).

---

## Priority & Allocation Algorithm

### Priority Scoring (`server/src/services/priority.service.js`)
Every booking's priority is calculated strictly on the backend:
```text
priorityScore = categoryBonus + waitingTimeBonus
```
- **Senior Citizen:** `+40`
- **Woman during configured night hours (`22:00–06:00`):** `+30`
- **Regular passenger / Woman daytime:** `+0`
- **Waiting time aging:** `+1` per full minute waited since `createdAt`, capped at `+30`
- **Deterministic tie-breaking:** Highest `priorityScore` → earliest `createdAt` → `bookingId` ascending.

### Vehicle Matching & Concurrency (`server/src/services/allocation.service.js`)
1. Recalculate priority scores for all `requested` and `queued` bookings.
2. Filter vehicles where `status === 'available'`, `vehicleType` matches, and `capacity >= passengerCount`.
3. Query `routing.service.js` (OSRM `/route/v1/driving`) for road ETA from each eligible vehicle to pickup.
4. Select the lowest road-ETA vehicle and reserve it atomically with `Vehicle.findOneAndUpdate({ vehicleId, status: 'available', currentBookingId: null }, ...)`, serialized by an in-process mutex.
5. Roll back the vehicle reservation if booking persistence fails; otherwise place unmatched bookings in `queued` and automatically retry when vehicles become available or bookings cancel.

---

## Predefined Simulation Scenarios

Use the **Demo Scenario** selector in the **Simulation Controls** panel (or `POST /api/simulation/scenarios/:name/generate`):

1. **Normal Daytime (`normal_daytime`, 14:00):** 5 simultaneous requests (regular & senior) with available cabs and autos.
2. **Peak-Hour Demand (`peak_hour`, 18:15):** 10 staggered requests competing for 4 available vehicles, demonstrating priority ordering and waiting-queue retries.
3. **Night-Time Priority (`night_priority`, 22:30):** Simulated 10:30 PM clock demonstrating Senior (`+40`) and Woman Night (`+30`) priority rules.
4. **Group Booking (`group_booking`, 15:00):** Passenger counts `1–6` matched strictly against `3`-seat autos, `4`-seat cabs, and `6`-seat XL cabs.
5. **Vehicle Cancellation (`vehicle_cancellation`, 16:00):** Simulates an assigned vehicle going `offline` before pickup, safely releasing the booking and reassigning it to a backup vehicle.

---

## Running Tests

Run the backend unit test suite (Priority, Allocation, OSRM Routing, Simulation, and Demo Scenarios):

```bash
npm --prefix server test
```
