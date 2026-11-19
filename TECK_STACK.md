# Tech Stack — Smart Priority-Based Cab & Auto Allocation System

## 1. Project Overview

The **Urban Ride Simulation** is an interactive mobility simulation and dispatch platform modeled on Bengaluru's urban transit landscape. The architecture combines real-time event broadcasting, road-network routing, server-side dynamic priority scheduling, live traffic raster tile proxying from **TomTom Orbis API v2**, and local arrival time statistical analytics.

---

## 2. Technology Stack Breakdown

| Layer | Technology | Version / Standard | Responsibility |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | HTML5, CSS3, Vanilla JavaScript | ES6+ Modern | Booking interface, interactive map, live queue boards, responsive panels, Lucide icons |
| **Mapping Engine** | Leaflet.js | 1.9.4 | Interactive map rendering, custom z-index panes, animated vehicle markers, route polylines, arrival badges |
| **Map Base Tiles** | OpenStreetMap (OSM) | Standard Carto | Base road map tiles |
| **Traffic Heatmap** | TomTom Orbis Traffic API v2 | Raster Flow Tiles | Real-time road congestion raster tiles styled with `style=light` |
| **Road Routing** | OSRM (Open Source Routing Machine) | Route v1 Driving | Real road routes, polyline geometries, road distances, and travel durations |
| **Backend Runtime** | Node.js | v20+ / v24+ | Server runtime environment |
| **Web Framework** | Express.js | 4.19+ | REST API routing, static frontend hosting, TomTom proxy, middleware |
| **Real-Time Gateway** | Socket.IO | 4.7+ | Bi-directional WebSocket communication for live bookings, vehicle telemetry, and analytics |
| **Data Storage** | In-Memory Repository + Local JSON | Custom Store | High-performance in-memory state (`memoryStore.js`) + debounced file persistence for analytics (`server/data/analytics.json`) |
| **Testing Framework**| Node.js Native Test Runner | `node --test` | Automated unit tests, priority queue tests, scenario verifications (58/58 passing) |
| **Icons & Design** | Lucide Icons | 0.344+ | Clean SVG dashboard and transport status icons |

---

## 3. High-Level Architecture

```text
+-------------------------------------------------------------------------------+
|                             CLIENT (Browser)                                  |
|                                                                               |
|   +-----------------------+   +-------------------------------------------+   |
|   |  Booking Panel        |   |   Leaflet Map (Bengaluru Centered)        |   |
|   |  - Individual / Group |   |   - Base OSM Tiles (z-index 200)          |   |
|   |  - 15 Hub Autocomplete|   |   - TomTom Traffic Layer (z-index 300)    |   |
|   |  - Wait-time Card     |   |   - OSRM Route Polylines (z-index 400)    |   |
|   +-----------------------+   |   - Vehicle & Passenger Pins (z-index 600)|   |
|   +-----------------------+   |   - Arrival Badges & Popups (z-index 700) |   |
|   |  Active Rides & Queue |   +-------------------------------------------+   |
|   |  - "Assign Cabs" Btn  |   +-------------------------------------------+   |
|   |  - Priority Indicators|   |   Top Nav: Simulation | Traffic | Arrival |   |
|   +-----------------------+   +-------------------------------------------+   |
+-------------------------------------------------------------------------------+
           |                                                      ^
    HTTP REST / JSON                                    Socket.IO Events
           v                                                      |
+-------------------------------------------------------------------------------+
|                       BACKEND SERVER (Node.js + Express)                      |
|                                                                               |
|   +--------------------+  +--------------------+  +-----------------------+   |
|   |  Booking Controller|  | Allocation Engine  |  | Priority Engine       |   |
|   |  - Canonical ID    |  | - Capacity Filter  |  | - Day / Night Schedule|   |
|   |  - Deduplication   |  | - Proximity (OSRM) |  | - 3s Batch Window     |   |
|   +--------------------+  +--------------------+  +-----------------------+   |
|   +--------------------+  +--------------------+  +-----------------------+   |
|   | Traffic Proxy      |  | Analytics Service  |  | Simulation Service    |   |
|   | - TomTom Orbis v2  |  | - 15 Area Averages |  | - Polyline Animator   |   |
|   | - 3-min TTL Cache  |  | - Peak Multiplier  |  | - Clock & Speed       |   |
|   +--------------------+  +--------------------+  +-----------------------+   |
|                                                                               |
|   +------------------------------------+  +-------------------------------+   |
|   | In-Memory Store (memoryStore.js)   |  | Debounced Analytics Storage   |   |
|   | - Fast, zero-DB setup for testing  |  | - server/data/analytics.json  |   |
|   +------------------------------------+  +-------------------------------+   |
+-------------------------------------------------------------------------------+
      |                              |                              |
      v                              v                              v
+---------------+              +---------------+              +-----------------+
| TomTom API    |              | OSRM Public   |              | OpenStreetMap   |
| Traffic Flow  |              | Routing API   |              | Tile Server     |
+---------------+              +---------------+              +-----------------+
```

---

## 4. Backend Module Breakdown

### 4.1 Allocation Service (`server/src/services/allocation.service.js`)
- **Capacity Enforcement:** Evaluates `vehicle.capacity >= booking.passengerCount`.
- **Fleet Pool Separation:** Cabs and Auto-rickshaws are matched exclusively against their respective pools.
- **Nearest Road ETA:** Ingests distance matrices from OSRM to assign the closest vehicle.
- **Atomic Locking:** Ensures vehicles are locked synchronously during assignment to prevent race conditions.
- **Manual Batch Allocation ("Assign Cabs"):** Allows queuing multiple pending bookings and allocating all eligible requests simultaneously upon user trigger.

### 4.2 Priority Engine (`server/src/services/priority.service.js`)
- **Simulation Time Dependency:** Priority evaluates against the simulated clock rather than host machine time.
- **Daytime Schedule (05:00 AM – 08:59 PM):**
  1. Senior Citizens: $+40$ bonus (Tier 1)
  2. Women: $+20$ bonus (Tier 2)
  3. Regular Passengers: $+0$ bonus (Tier 3)
- **Nighttime Schedule (09:00 PM – 04:59 AM):**
  1. Women: $+40$ bonus (Tier 1)
  2. Senior Citizens: $+20$ bonus (Tier 2)
  3. Regular Passengers: $+0$ bonus (Tier 3)
- **3-Second Batch Window:** Groups near-simultaneous bookings into batches, sorting strictly by category priority within each batch.
- **Waiting-Time Score:** Adds $+1$ point per elapsed minute in queue (capped at $+30$).

### 4.3 Traffic Proxy Service (`server/src/services/traffic.service.js`)
- Targets the official TomTom Orbis Traffic Flow Raster API:
  `https://api.tomtom.com/maps/orbis/traffic/flow/raster/tile/${z}/${x}/${y}?apiVersion=2&style=light`
- Injects `TomTom-Api-Key` strictly via HTTP request header (`TomTom-Api-Key: <key>`), never exposing keys in URLs or frontend client code.
- In-memory 3-minute TTL cache minimizes redundant external API calls and rate-limiting.
- Graceful 1x1 transparent PNG fallback if the API key is unconfigured or upstream calls fail.

### 4.4 Analytics Service (`server/src/services/analytics.service.js`)
- Tracks average cab arrival times across 15 designated Bengaluru urban sectors.
- **Hybrid Baseline & Statistical Average:** Uses precomputed baseline until an area records $\ge 5$ completed trip arrivals, transitioning to the dynamic moving average.
- **Rush-Hour Multiplier ($1.35\times$):** Automatically adjusts arrival estimates during morning (07:30 AM – 11:00 AM) and evening (04:30 PM – 08:30 PM) rush hours.
- Persists analytics data locally in `server/data/analytics.json`.

### 4.5 Simulation & Vehicle Movement (`server/src/services/simulation.service.js`)
- Interpolates vehicle markers along multi-coordinate OSRM road geometry.
- Controls simulation clock and state transitions (`available` $\to$ `assigned` $\to$ `to_pickup` $\to$ `arrived` $\to$ `on_trip` $\to$ `completed`).
- Supports pause, resume, 1x–5x speed scaling, and time jumps without losing vehicle progress.

### 4.6 Routing Service (`server/src/services/routing.service.js`)
- Interfaces with OSRM HTTP endpoint (`/route/v1/driving/{coords}?overview=full&geometries=geojson`).
- Inverts `[lng, lat]` coordinates from GeoJSON to Leaflet `[lat, lng]`.
- Implements fallback road calculations when network is offline.

---

## 5. Map Layer & Stacking Architecture

To guarantee that traffic congestion heatmaps never obstruct vehicle movement, passenger markers, or route lines, Leaflet's pane hierarchy is explicitly managed:

```text
Leaflet Map Container
 ├── tilePane (z-index: 200)       --> OpenStreetMap Base Layer
 ├── trafficPane (z-index: 300)    --> TomTom Traffic Flow Raster Tiles (pointer-events: none)
 ├── overlayPane (z-index: 400)    --> OSRM Route Polylines (Trip & Pickup Paths)
 ├── markerPane (z-index: 600)     --> Animated Cabs/Autos & Passenger Markers
 └── popupPane / Badges (z-index: 700) --> Arrival Badges & Interactive Popups
```

---

## 6. Real-Time WebSocket Events (Socket.IO)

| Event Name | Direction | Payload Summary | Description |
| :--- | :--- | :--- | :--- |
| `booking:created` | Server $\to$ Clients | `{ booking }` | Broadcast newly submitted booking |
| `booking:updated` | Server $\to$ Clients | `{ booking }` | Broadcast status, priority, or driver update |
| `booking:cancelled` | Server $\to$ Clients | `{ bookingId, vehicleId }` | Broadcast ride cancellation |
| `vehicle:updated` | Server $\to$ Clients | `{ vehicle }` | Broadcast vehicle availability or status change |
| `vehicle:location` | Server $\to$ Clients | `{ vehicleId, location, heading }` | Real-time vehicle coordinates during movement |
| `queue:updated` | Server $\to$ Clients | `{ queue: Booking[] }` | Broadcast recalculated waiting queue |
| `analytics:updated` | Server $\to$ Clients | `{ areaId, metrics }` | Push refreshed arrival estimates |
| `simulation:clock` | Server $\to$ Clients | `{ currentTime, isPeakHour }` | Broadcast updated simulation time |

---

## 7. Directory Structure

```text
Ride easy/
├── client/
│   ├── assets/
│   │   ├── cab-icon.png               # Custom yellow cab marker
│   │   └── auto-icon.png              # Custom auto-rickshaw marker
│   ├── css/
│   │   ├── style.css                  # Light-purple theme & component styles
│   │   └── responsive.css             # Mobile & tablet media queries
│   ├── js/
│   │   ├── api.js                     # REST API client wrapper
│   │   ├── app.js                     # Application entry point & Lucide init
│   │   ├── booking.js                 # Booking form, Individual/Group & 15 locations
│   │   ├── dashboard.js               # Admin controls, queue rendering, clock
│   │   ├── map.js                     # Leaflet map, TomTom layer, arrival badges
│   │   ├── seedData.js                # Initial mock locations & vehicles
│   │   ├── socket.js                  # Socket.IO client event handlers
│   │   ├── state.js                   # Client-side single source of truth
│   │   └── toast.js                   # Notification toasts
│   ├── vendor/
│   │   ├── leaflet.js / leaflet.css   # Local Leaflet bundle
│   │   └── lucide.min.js              # SVG icon library
│   └── index.html                     # Main application layout & navbar
├── server/
│   ├── data/
│   │   └── analytics.json             # Persisted arrival analytics data
│   ├── src/
│   │   ├── config/
│   │   │   └── env.js                 # Environment variables loader
│   │   ├── controllers/               # Express route controllers
│   │   ├── middleware/
│   │   │   └── errorHandler.js        # Global error and 404 handlers
│   │   ├── models/
│   │   │   ├── Booking.js             # Booking data model & schema
│   │   │   ├── Vehicle.js             # Vehicle data model & schema
│   │   │   └── memoryStore.js         # Canonical in-memory state store
│   │   ├── routes/
│   │   │   ├── analytics.routes.js    # Arrival analytics API endpoints
│   │   │   ├── booking.routes.js      # Booking & allocation endpoints
│   │   │   ├── simulation.routes.js   # Clock & simulation controls
│   │   │   ├── traffic.routes.js      # TomTom proxy endpoints
│   │   │   └── vehicle.routes.js      # Fleet listing & updates
│   │   ├── seed/
│   │   │   └── seedData.js            # Initial Bengaluru coordinates & fleet
│   │   ├── services/
│   │   │   ├── allocation.service.js  # Dispatch & vehicle assignment logic
│   │   │   ├── analytics.service.js   # Bengaluru arrival analytics engine
│   │   │   ├── priority.service.js    # Time-based priority & batch window
│   │   │   ├── routing.service.js     # OSRM routing interface
│   │   │   ├── simulation.service.js  # Vehicle animation & clock loop
│   │   │   └── traffic.service.js     # TomTom Orbis v2 proxy & tile cache
│   │   ├── sockets/
│   │   │   └── socket.handler.js      # WebSocket server event publisher
│   │   ├── app.js                     # Express app configuration & static server
│   │   └── server.js                  # HTTP server & Socket.IO initialization
│   ├── tests/                         # 58 automated unit & integration tests
│   │   ├── allocation.service.test.js
│   │   ├── analytics.test.js
│   │   ├── deduplication_scenarios.test.js
│   │   ├── dynamic_priority_scenarios.test.js
│   │   ├── mandatory_queue_scenarios.test.js
│   │   ├── predefined_scenarios.test.js
│   │   ├── priority.service.test.js
│   │   ├── routing.service.test.js
│   │   └── simulation.service.test.js
│   ├── .env                           # Server configuration (git-ignored)
│   ├── .env.example                   # Environment template
│   └── package.json                   # Server scripts and dependencies
├── PRD.md                             # Product Requirements Document
├── TECH_STACK.md                      # Technical Stack Specification
└── README.md                          # Quickstart & Verification Guide
```

---

## 8. Environment Configuration (`server/.env`)

```env
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5000
OSRM_BASE_URL=https://router.project-osrm.org
TOMTOM_API_KEY=your_tomtom_api_key_here
```

- `TOMTOM_API_KEY`: API key for TomTom Orbis Traffic Flow Raster Tiles API v2.
- `PORT`: Server port (default `5000`).
- `CLIENT_ORIGIN`: Allowed CORS origin for client access.

---

## 9. Key Engineering Decisions & Best Practices

1. **Server-Side API Key Shielding:** The TomTom API key is stored strictly on the server in `.env`. Frontend requests call `/api/traffic/tiles/:z/:x/:y.png`, preventing API key leaks in client bundle or network inspection tabs.
2. **Canonical `bookingId` Deduplication:** Every booking has a single canonical ID retained throughout its lifecycle (`requested` $\to$ `waiting` $\to$ `assigned` $\to$ `arrived` $\to$ `on_trip` $\to$ `completed`). Queue updates update existing entities in place, eliminating ghost cards.
3. **Dedicated Map Panes:** Leaflet's `createPane('trafficPane')` isolates raster tiles at `zIndex: 300` with `pointer-events: none`, guaranteeing traffic visualization never hijacks mouse interactions or hides vehicle icons.
4. **Zero-Database Fast Setup:** The in-memory store allows immediate local startup and high-frequency automated testing without requiring local MongoDB installations or running database daemons.
5. **Favicon Suppression:** Browser favicon requests are silenced with `<link rel="icon" href="data:,">` and Express `GET /favicon.ico` returning HTTP 204 No Content, preventing stale cached browser icons.
