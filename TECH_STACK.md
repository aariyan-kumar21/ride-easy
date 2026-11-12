# Tech Stack --- Smart Priority-Based Cab & Auto Allocation System

## 1. Project Overview

A web-based simulation that demonstrates how multiple ride requests can
be prioritized and matched with available cabs/autos. The system uses
simulated passenger and vehicle locations, road-based routing, animated
vehicle movement, and real-time dashboard updates.

## 2. Technology Stack

  -----------------------------------------------------------------------
  Layer                   Technology              Responsibility
  ----------------------- ----------------------- -----------------------
  Frontend                HTML5, CSS3, Vanilla    Booking interface,
                          JavaScript              dashboards, map
                                                  controls, simulation UI

  Backend                 Node.js, Express.js     REST APIs, booking
                                                  lifecycle, allocation
                                                  engine

  Database                MongoDB, Mongoose       Persist users,
                                                  vehicles, bookings, and
                                                  trip records

  Real-time updates       Socket.IO               Push booking, queue,
                                                  vehicle-location, and
                                                  trip-status changes

  Map rendering           Leaflet.js              Interactive map,
                                                  markers, polylines,
                                                  popups

  Map data                OpenStreetMap           Street map tiles

  Routing                 OSRM Routing API        Road routes, route
                                                  distance, and estimated
                                                  travel duration

  Development             Antigravity IDE, Git    AI-assisted development
                                                  and version control
  -----------------------------------------------------------------------

## 3. High-Level Architecture

``` text
Passenger / Driver / Admin Web Interfaces
                  |
          HTML + CSS + JavaScript
                  |
          REST API (HTTP/JSON)
                  |
          Node.js + Express Backend
          |          |           |
     Booking     Allocation    Trip/Queue
     Manager      Engine       Manager
          |          |           |
          +----------+-----------+
                     |
          +----------+-----------+
          |          |           |
       MongoDB    Socket.IO     OSRM
       Storage    Live Events   Routing
                     |
              Leaflet Map UI
          +----------+-----------+
          |                      |
     Vehicle markers         Route/ETA display
     and movement             on OSM map
```

## 4. Main Backend Modules

-   **Booking Manager:** Validates and creates ride requests; updates
    booking states.
-   **Priority Engine:** Calculates request priority using configured
    rules.
-   **Cab Matching Engine:** Filters vehicles by availability and
    capacity, then ranks suitable vehicles by road ETA.
-   **Queue Manager:** Maintains unmatched requests and retries
    allocation when a suitable vehicle becomes available.
-   **Trip Manager:** Handles pickup, trip start, destination arrival,
    and vehicle release.
-   **Simulation Engine:** Advances simulated vehicle positions along
    route geometry.
-   **Real-time Gateway:** Publishes state changes through Socket.IO.

## 5. Map and Routing Workflow

1.  Display a selected Bengaluru map area using Leaflet and
    OpenStreetMap tiles.
2.  Place simulated passenger and vehicle markers using
    latitude/longitude coordinates.
3.  Request a route from OSRM using vehicle and passenger coordinates.
4.  Convert OSRM GeoJSON coordinates from `[longitude, latitude]` to
    Leaflet's `[latitude, longitude]`.
5.  Draw the route as a polyline and calculate ETA from the returned
    route duration.
6.  Animate the vehicle marker along the route using the simulation
    engine.
7.  Recalculate the route when the simulation changes a destination or
    trip phase.

**Important:** OSRM's public demo server and OpenStreetMap's public tile
service are suitable for a student prototype with modest usage, not
unrestricted production traffic. Keep routing behind a backend service
so the provider can be changed later. Do not hard-code API secrets in
frontend code.

## 6. Suggested Data Models

### User

-   `id`
-   `name`
-   `category` --- `senior`, `woman`, `regular`
-   `pickup` --- `{ lat, lng, label }`
-   `destination` --- `{ lat, lng, label }`
-   `passengerCount`
-   `createdAt`

### Cab

-   `id`
-   `vehicleType` --- `cab`, `auto`
-   `location` --- `{ lat, lng }`
-   `capacity`
-   `status` --- `available`, `assigned`, `to_pickup`, `on_trip`,
    `offline`
-   `currentBookingId`

### Booking

-   `id`
-   `userId`
-   `vehicleId`
-   `status` --- `requested`, `queued`, `assigned`, `to_pickup`,
    `on_trip`, `completed`, `cancelled`
-   `priorityScore`
-   `estimatedPickupMinutes`
-   `routeDistanceMeters`
-   `createdAt`
-   `updatedAt`

For a simple classroom simulation, seed data can be loaded from JSON.
MongoDB can persist the current simulation state.

## 7. Real-Time Events

Suggested Socket.IO events:

  -----------------------------------------------------------------------
  Event                   Direction               Purpose
  ----------------------- ----------------------- -----------------------
  `booking:created`       Client → Server         Submit a booking
                                                  request

  `booking:updated`       Server → Clients        Publish booking status
                                                  changes

  `cab:location`          Server → Clients        Publish simulated cab
                                                  position

  `cab:status`            Server → Clients        Publish cab
                                                  availability/status

  `queue:updated`         Server → Clients        Refresh waiting queue

  `simulation:state`      Server → Clients        Publish pause, resume,
                                                  or speed state
  -----------------------------------------------------------------------

Validate all client-originated events on the server. The server should
remain the source of truth for allocation and vehicle status.

## 8. Development Structure

``` text
smart-cab-allocation/
├── client/
│   ├── index.html
│   ├── css/
│   ├── js/
│   │   ├── app.js
│   │   ├── map.js
│   │   ├── booking.js
│   │   └── socket.js
│   └── assets/
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   │   ├── allocation.service.js
│   │   │   ├── priority.service.js
│   │   │   ├── routing.service.js
│   │   │   └── simulation.service.js
│   │   ├── sockets/
│   │   └── app.js
│   └── package.json
├── docs/
│   ├── PRD.md
│   └── TECH_STACK.md
└── README.md
```

## 9. Environment Configuration

Use a server-side `.env` file for configuration:

``` env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/smart_cab_simulation
CLIENT_ORIGIN=http://localhost:5500
OSRM_BASE_URL=https://router.project-osrm.org
```

Add `.env` to `.gitignore`. Never commit credentials or private
connection strings.

## 10. Key Engineering Decisions

-   Keep allocation logic on the backend; never trust a
    browser-calculated priority or cab assignment.
-   Reserve a cab atomically so two simultaneous bookings cannot receive
    the same vehicle.
-   Use a deterministic tie-breaker, such as earliest request time, when
    priority scores are equal.
-   Use road ETA rather than straight-line distance when routing data is
    available.
-   If OSRM is unavailable, use a clearly labelled fallback estimate for
    the demo rather than blocking the simulation.
-   Keep simulation time and movement speed configurable so the demo can
    be accelerated.
-   Make the simulation reproducible with seeded users, cabs, and
    booking scenarios.
