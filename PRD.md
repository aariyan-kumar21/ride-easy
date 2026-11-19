# Product Requirements Document (PRD)

## Smart Priority-Based Cab & Auto Allocation System with Bengaluru Traffic Heatmap & Arrival Analytics

**Document Purpose:** Product and implementation specification for the Urban Ride Simulation prototype in Antigravity IDE.

---

## 1. Product Summary

The **Urban Ride Simulation** is an interactive, web-based urban mobility and dispatch simulation platform built for Bengaluru, India. Multiple passengers can submit ride requests concurrently. The system processes these requests using a dynamic, time-aware priority algorithm, evaluates road-network ETAs via OSRM, enforces vehicle seating capacity, and matches passengers with available cabs and auto-rickshaws.

Beyond core dispatching, the simulation integrates real-world traffic data through **TomTom Orbis Traffic Flow Raster Tiles API v2** to visualize live Bengaluru road congestion, and features an **Average Cab Arrival Analytics Engine** that calculates color-coded, peak-hour-aware arrival estimates across 15 key Bengaluru zones.

The application operates as a self-contained simulation with an in-memory data store, deterministic clock controls, customizable demo scenarios, and real-time Socket.IO synchronization.

---

## 2. Problem Statement

Urban ride-hailing networks face high contention, erratic ETAs, and dispatch imbalances during peak commute hours. Vulnerable commuter segments—such as senior citizens during busy daylight hours and women traveling alone late at night—frequently encounter safety concerns and prolonged wait times. Furthermore, group bookings are frequently canceled due to vehicle capacity mismatches.

This prototype demonstrates how:
1. **Dynamic, time-of-day priority rules** protect vulnerable passenger groups.
2. **Short-window batching** prevents race conditions and unfair booking-order advantages for simultaneous requests.
3. **Live traffic heatmaps and localized arrival analytics** provide transparency into urban congestion and dispatch feasibility.
4. **Capacity-aware fleet segmentation** isolates Cab and Auto pools while respecting vehicle passenger limits.

---

## 3. Goals & Objectives

1. **Simultaneous Request Handling:** Ingest concurrent ride requests and batch near-simultaneous bookings (3-second window) to evaluate priority fairly.
2. **Time-Aware Priority Hierarchy:**
   - **Daytime (05:00 AM – 08:59 PM):** Senior Citizens (Tier 1, +40 pts) > Women (Tier 2, +20 pts) > Regular (Tier 3, +0 pts).
   - **Nighttime (09:00 PM – 04:59 AM):** Women (Tier 1, +40 pts) > Senior Citizens (Tier 2, +20 pts) > Regular (Tier 3, +0 pts).
3. **Starvation Prevention:** Increment waiting bonus (+1 pt/min, capped at +30 pts) so long-waiting passengers are not indefinitely overtaken.
4. **Capacity & Fleet Filtering:** Strict separation between Cab (capacities 4–6) and Auto (capacity 3) pools; filter out vehicles with insufficient seating.
5. **Real-World Road Routing:** Calculate vehicle-to-pickup and pickup-to-destination routes and ETAs using OSRM, with graceful offline fallbacks.
6. **Live Bengaluru Traffic Heatmap:** Overlay live TomTom Orbis Traffic Flow raster tiles on OpenStreetMap via a secure backend proxy.
7. **Neighborhood Arrival Analytics:** Display color-coded arrival badges and statistical wait estimates across 15 major Bengaluru hubs, factoring in morning/evening rush-hour multipliers.
8. **Deduplication & Canonical State:** Ensure every booking maintains a single, permanent `bookingId` across all lifecycle transitions without duplicate UI cards or queue records.
9. **Manual Batch Allocation ("Assign Cabs"):** Allow staging multiple requests before triggering batch vehicle allocation on demand.
10. **Interactive Simulation Controls:** Run, pause, fast-forward (1x–5x), reset, and jump simulation time to test daytime vs. night-time priority switches on the fly.

---

## 4. Non-Goals

- **Real Driver Telemetry:** Vehicle locations and animations are client/server simulated; they do not consume real GPS feeds from commercial drivers.
- **Payment Processing:** No real or mock financial transactions, credit card processing, or fare metering.
- **Production Dispatching:** Prototype does not replace production ride-sharing engines (e.g., Uber, Ola, Namma Yatri).
- **Identity Verification:** Passenger demographics (category, gender, age) are synthetic simulation attributes, not verified via government IDs.

---

## 5. Target Users and Interfaces

### 5.1 Passenger Booking Interface
- **Pickup & Destination Selection:** Autocomplete dropdown of 15 predefined Bengaluru tech and commercial hubs with coordinates, or custom coordinates.
- **Booking Mode (Individual vs. Group):**
  - **Individual:** Automatically locks and hides passenger count to 1 passenger.
  - **Group:** Unlocks passenger count selector (2 to 6 passengers).
- **Vehicle Type:** Independent selection of Cab or Auto-rickshaw.
- **Passenger Category:** Senior Citizen, Woman, or Regular.
- **Dynamic Pickup Arrival Card:** Real-time display of estimated arrival time, congestion rating, and peak-hour alerts for the selected pickup area.
- **Booking Status Card:** Shows assigned vehicle, driver profile, road ETA, animated route progress, and trip status.

### 5.2 Dispatch & Simulation Map
- **Interactive Leaflet Map:** Centered on Bengaluru with OpenStreetMap base layer.
- **Dedicated Leaflet Panes:**
  - `trafficPane` (`zIndex: 300`, `pointer-events: none`): TomTom Traffic Flow Raster tiles.
  - Overlay Routes (`zIndex: 400`): OSRM animated polylines.
  - Markers (`zIndex: 600`): Custom passenger pins, yellow cab icons, and green/yellow auto-rickshaws.
  - Badges & Popups (`zIndex: 700`): Arrival analytics map badges and interactive tooltips.
- **Top Navigation Bar:**
  - `Simulation`: Centers and scrolls to the live simulation map.
  - `Traffic Heatmap`: One-click On/Off toggle for TomTom traffic raster overlay.
  - `Arrival Time`: One-click On/Off toggle for neighborhood arrival badges.
- **Map Legend & Peak Hour Alerts:** Visual indicators for traffic flow (Green/Yellow/Orange/Red) and simulation rush-hour warnings.

### 5.3 Admin & Fleet Dashboard
- **Active Rides & Waiting Queue:** Real-time list of all active rides and prioritized waiting queues separated by vehicle pool.
- **Manual Batch Allocation Button ("Assign Cabs"):** Allows queuing multiple passenger requests and allocating vehicles simultaneously upon click.
- **Simulation Clock & Controls:** Play/Pause, speed slider (1x, 2x, 5x), time picker, and one-click demo scenario triggers.
- **System Metrics:** Live counts for total bookings, assigned rides, queued requests, available fleet, and average response times.

---

## 6. Core Functional Requirements

### FR-1: Booking Creation & Validation
- Validate required fields: pickup location, destination, vehicle type, passenger category, and passenger count.
- Enforce booking mode: Individual mode sets `passengerCount = 1`; Group mode validates `2 <= passengerCount <= 6`.
- Auto-rickshaws are limited to a maximum capacity of 3 passengers; group bookings > 3 passengers automatically mandate cabs.
- Assign a permanent, collision-free `bookingId` (e.g., `BK-XXXXXX`) retained across the entire booking lifecycle.

### FR-2: Time-Aware Dynamic Priority Engine
- Priority score is computed dynamically on the server:
  $$\text{priorityScore} = \text{categoryBonus} + \text{waitingTimeBonus}$$
- **Daytime Schedule (05:00 AM to 08:59 PM):**
  - Senior Citizen: $+40$ points (Tier 1)
  - Woman: $+20$ points (Tier 2)
  - Regular Passenger: $+0$ points (Tier 3)
- **Nighttime Schedule (09:00 PM to 04:59 AM):**
  - Woman: $+40$ points (Tier 1)
  - Senior Citizen: $+20$ points (Tier 2)
  - Regular Passenger: $+0$ points (Tier 3)
- **Booking Batch Window:** Bookings received within a configurable 3-second window are grouped into the same batch and sorted by category priority rather than arrival millisecond.
- **Waiting Time Bonus:** $+1$ point per full elapsed minute in queue, capped at $+30$ points.
- **Clock Dependency:** Priority calculations strictly use the simulated clock as the single source of truth; changing simulation time immediately recalculates and reorders queued passengers.

### FR-3: Vehicle Matching & Allocation Engine
- **Pool Isolation:** Cab requests search only the Cab fleet; Auto requests search only the Auto fleet.
- **Capacity Filter:** Vehicles with `capacity < passengerCount` are excluded from matching.
- **Proximity & ETA Ranking:** Filter eligible available vehicles and rank by OSRM road travel duration to passenger pickup.
- **Atomic Reservation:** Backend locks the chosen vehicle to prevent double-assignment under concurrent requests.
- **Manual Allocation Mode:** If batch allocation mode is active, requests remain in `requested` state until the admin clicks "Assign Cabs", which resolves all pending requests against available vehicles in priority order.

### FR-4: Waiting Queue Management & Deduplication
- Unmatched requests transition to `waiting` (queued) status.
- Each vehicle pool maintains its own deterministic, 1-based sequential queue (`#1, #2, #3, ...`) with no duplicate positions.
- When an on-trip vehicle reaches its destination and returns to `available`, the allocation engine immediately triggers reassignment for the highest-ranking queued request.
- The system guarantees zero duplicate records: state updates update existing entities in memory and frontend DOM by `bookingId`.

### FR-5: Real-Time Bengaluru Traffic Heatmap (TomTom Orbis v2)
- Integrate TomTom Orbis Traffic Flow Raster Tiles API v2:
  `https://api.tomtom.com/maps/orbis/traffic/flow/raster/tile/{z}/{x}/{y}?apiVersion=2&style=light`
- Backend proxy endpoint `/api/traffic/tiles/:z/:x/:y.png` handles upstream requests, passing `TomTom-Api-Key` securely via HTTP header.
- Implements an in-memory 3-minute TTL tile cache and returns standard PNG buffers with `x-traffic-fallback: false`.
- If the upstream service is unreachable or unconfigured, gracefully serve a transparent 1x1 PNG fallback without UI disruption.
- Top navbar "Traffic Heatmap" button toggles the overlay on and off directly on the simulation map.

### FR-6: Bengaluru Average Cab Arrival Analytics
- Covers 15 predefined Bengaluru urban hubs: Indiranagar, Koramangala, Whitefield, MG Road, HSR Layout, Electronic City, Jayanagar, Marathahalli, Malleshwaram, Hebbal, Rajajinagar, Banashankari, Bellandur, BTM Layout, and Yelahanka.
- **Hybrid Statistical Model:**
  - Initial baseline ETA per zone derived from simulated road distances and local congestion indices.
  - Once an area logs $\ge 5$ completed trip arrivals, the system computes the running statistical mean of actual vehicle arrival durations.
- **Peak Hour Multiplier ($1.35\times$):**
  - Morning Peak: 07:30 AM – 11:00 AM
  - Evening Peak: 04:30 PM – 08:30 PM
- **Map Visualization:** Top navbar "Arrival Time" button toggles color-coded Leaflet badges on area centroids:
  - Green: $\le 5$ min
  - Yellow: $6 - 8$ min
  - Orange: $9 - 12$ min
  - Red: $> 12$ min
- Local debounced JSON persistence (`server/data/analytics.json`).

### FR-7: Vehicle Movement & Route Simulation
- Fetch realistic road polylines from OSRM (`/route/v1/driving/`).
- Animate vehicle markers along geometry coordinates at configurable simulation speeds.
- Vehicle state transitions:
  $$\text{available} \longrightarrow \text{assigned} \longrightarrow \text{to\_pickup} \longrightarrow \text{arrived} \longrightarrow \text{on\_trip} \longrightarrow \text{completed} \longrightarrow \text{available}$$
- Pause, resume, and speed modifications preserve exact intermediate vehicle coordinates along the polyline.

### FR-8: Real-Time WebSockets Synchronization
- Broadcast state changes via Socket.IO:
  - `booking:created`, `booking:updated`, `booking:cancelled`
  - `vehicle:updated`, `vehicle:location`
  - `queue:updated`
  - `analytics:updated`
  - `simulation:clock`, `simulation:speed`
- Client state updates reactively without full page refreshes.

---

## 7. Data Models & Schemas

### 7.1 Booking Entity
```typescript
interface Booking {
  bookingId: string;                 // Permanent canonical ID (e.g. BK-1001)
  passengerName: string;
  category: 'senior' | 'woman' | 'regular';
  vehicleType: 'cab' | 'auto';
  passengerCount: number;            // 1 for Individual; 2-6 for Group
  isGroup: boolean;
  pickup: { lat: number; lng: number; label: string };
  destination: { lat: number; lng: number; label: string };
  status: 'requested' | 'waiting' | 'assigned' | 'to_pickup' | 'arrived' | 'on_trip' | 'completed' | 'cancelled';
  priorityScore: number;
  priorityBreakdown: {
    categoryBonus: number;
    waitingTimeBonus: number;
    timeWindow: 'daytime' | 'nighttime';
  };
  queuePosition?: number;            // 1-based index when queued
  vehicleId?: string;                // Assigned vehicle ID
  routeGeometry?: [number, number][]; // Decoded Leaflet [lat, lng] array
  estimatedPickupMinutes?: number;
  routeDistanceMeters?: number;
  createdAt: number;                 // Simulation epoch ms
  updatedAt: number;
}
```

### 7.2 Vehicle Entity
```typescript
interface Vehicle {
  id: string;                        // e.g. CAB-01, AUTO-02
  vehicleType: 'cab' | 'auto';
  capacity: number;                  // Cab: 4-6, Auto: 3
  status: 'available' | 'assigned' | 'to_pickup' | 'arrived' | 'on_trip' | 'offline';
  location: { lat: number; lng: number };
  heading?: number;
  currentBookingId?: string | null;
}
```

### 7.3 Area Arrival Analytics Entity
```typescript
interface AreaArrivalAnalytics {
  areaId: string;                    // e.g. 'koramangala'
  areaName: string;                  // 'Koramangala'
  lat: number;
  lng: number;
  averageArrivalMinutes: number;
  sampleCount: number;
  isPeakHour: boolean;
  statusColor: 'green' | 'yellow' | 'orange' | 'red';
  lastUpdated: string;
}
```

---

## 8. API Specifications

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/bookings` | Submit new single or group ride request |
| `GET` | `/api/bookings` | List all active and historical bookings |
| `GET` | `/api/bookings/:id` | Retrieve specific booking details |
| `POST` | `/api/bookings/:id/cancel` | Cancel eligible booking and release vehicle |
| `POST` | `/api/bookings/allocate-pending`| Trigger manual batch allocation ("Assign Cabs") |
| `GET` | `/api/vehicles` | List all vehicles with current coordinates and status |
| `GET` | `/api/queue` | List current priority-sorted waiting queue |
| `GET` | `/api/traffic/tiles/:z/:x/:y.png` | Proxy TomTom Orbis Traffic Flow raster tile |
| `GET` | `/api/traffic/status` | Check TomTom API key configuration & cache health |
| `GET` | `/api/analytics/arrival-times` | Get live average arrival times for all 15 areas |
| `GET` | `/api/analytics/arrival-times/:areaId` | Get detailed arrival metrics for a specific area |
| `POST` | `/api/simulation/start` | Start/resume simulation clock and vehicles |
| `POST` | `/api/simulation/pause` | Pause simulation clock and movement |
| `POST` | `/api/simulation/speed` | Adjust speed multiplier (1x, 2x, 5x) |
| `POST` | `/api/simulation/clock` | Update simulated time-of-day |
| `POST` | `/api/simulation/reset` | Reset simulation state to initial seed |
| `GET` | `/favicon.ico` | Returns HTTP 204 No Content (favicon suppression) |

---

## 9. Quality & Reliability Requirements

1. **Automated Test Suite:** Comprehensive test suite run with native Node.js test runner (`node --test tests/*.test.js`), maintaining 58/58 passing unit and integration tests across:
   - Priority Calculation Engine
   - Time-Based Dynamic Allocation Scenarios
   - 10 Mandatory Priority Queue Scenarios
   - Deduplication & Canonical Booking ID Scenarios
   - Smart Cab & Auto Allocation Engine
   - Bengaluru Traffic & Arrival Analytics Engine
   - OSRM Routing Service
   - Predefined Demo Scenarios
   - Vehicle Movement Simulation Service
2. **Deterministic Queue Resolution:** Equal priority scores broken deterministically by earliest booking timestamp, followed by alphanumeric `bookingId`.
3. **No Duplicate UI Elements:** Frontend uses dictionary/keyed state maps (`bookingsMap[id]`) to guarantee zero duplicate cards or map markers.
4. **Resilient Routing & Traffic Fallbacks:** If external OSRM or TomTom APIs fail or timeout, the backend gracefully falls back to transparent tiles and mathematical road approximations without throwing unhandled exceptions.
5. **Clean Presentation:** No external or stale favicons displayed; custom Leaflet panes ensure clean visual hierarchy at all zoom levels.
