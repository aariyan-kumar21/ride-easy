# Ride easy Simulation 🚖

A priority-based cab and auto allocation simulation designed to improve ride availability, reduce passenger waiting times, and provide smarter vehicle allocation based on passenger priority, location, and seating capacity.

## 📌 Project Overview

Finding an available and affordable cab or auto can be difficult during peak hours and in crowded areas. Commuters often experience long waiting times, ride cancellations, unpredictable fares, and uncertainty about vehicle arrival.

**Ride easy Simulation** is a prototype that demonstrates an intelligent cab and auto allocation system. It considers passenger categories, simulation time, vehicle availability, proximity, and seating capacity to allocate suitable vehicles efficiently.

> This is an academic simulation prototype. It does not book real-world rides or connect to actual drivers.

## ✨ Key Features

- **Ride Booking:** Supports individual and group ride requests.
- **Priority-Based Allocation:** Gives different priority levels based on passenger category and simulation time.
- **Smart Vehicle Matching:** Allocates suitable nearby vehicles based on availability and seating capacity.
- **Cab and Auto Support:** Maintains separate allocation queues for cabs and autos.
- **Dynamic Waiting Queue:** Automatically updates passenger queue positions.
- **Interactive Map:** Displays passengers, cabs, autos, and assigned routes.
- **Vehicle Movement Simulation:** Animates vehicles along their assigned routes.
- **Live ETA Updates:** Displays estimated pickup and destination arrival times.
- **Ride Status Notifications:** Shows booking, assignment, pickup, and ride completion updates.
- **Simulation Controls:** Allows users to change simulation time, control simulation speed, and complete simulations.
- **Dashboard Analytics:** Displays active requests, total vehicles, assigned vehicles, and available vehicles.

## 🧠 Design Thinking Process

The project follows the five stages of Design Thinking.

### 1. Empathize

Identified the challenges faced by:
- Daily commuters.
- Senior citizens.
- Women travelling at night.
- Students.
- Groups travelling together.

**Key pain points:**
- Long waiting times.
- Frequent ride cancellations.
- Unpredictable fares.
- Uncertain vehicle arrival times.
- Safety concerns during nighttime travel.
- Difficulty finding vehicles with sufficient seating capacity.

### 2. Define

**Problem Statement**

People often struggle to find affordable and available autos or cabs, especially during peak hours and in crowded areas. Long waiting times, frequent ride cancellations, unpredictable fares, and uncertainty about vehicle arrival create inconvenience for commuters. Additionally, senior citizens face accessibility challenges, women may have safety concerns while travelling at night, and groups often struggle to find vehicles with sufficient seating capacity. There is a need for an intelligent transportation system that provides efficient, reliable, and priority-based vehicle allocation.

**How Might We?**

How might we develop a smart cab and auto allocation system that considers passenger priority, time of travel, location, vehicle availability, waiting time, and seating capacity to reduce waiting times and improve the commuting experience?

### 3. Ideate

Different ideation techniques were explored:

- Brainstorming
- SCAMPER
- Crazy 8s
- Mind Mapping

**Selected Idea:** Smart Priority-Based Cab and Auto Allocation System.

### 4. Prototype

Developed an interactive simulation featuring:
- Passenger booking interface.
- Interactive city map.
- Multiple simulated passengers and vehicles.
- Priority-based booking queues.
- Automatic cab and auto allocation.
- Route visualization and vehicle movement.
- ETA and ride-status updates.
- Simulation controls and dashboard overview.

### 5. Test

The prototype can be tested using different scenarios:

- Multiple passengers booking simultaneously.
- Daytime and nighttime priority changes.
- More bookings than available vehicles.
- Different passenger counts and vehicle capacities.
- Automatic allocation when vehicles become available.
- Queue reordering and unique queue positions.
- Prevention of duplicate bookings and vehicle assignments.

## ⚙️ Priority-Based Allocation Logic

The allocation system uses the selected simulation time to determine passenger priority.

| Simulation Time | Priority Order |
|---|---|
| Daytime | Senior Citizens → Women → Regular Passengers |
| Nighttime | Women → Senior Citizens → Regular Passengers |

### Allocation Workflow

1. A passenger submits a ride request.
2. The system identifies passenger category, pickup, drop-off, passenger count, and vehicle type.
3. The booking enters the appropriate cab or auto queue.
4. The queue is sorted according to the applicable priority rules and waiting-time fairness logic.
5. The system identifies available vehicles with sufficient seating capacity.
6. The nearest suitable vehicle is assigned.
7. If no suitable vehicle is available, the passenger remains in the waiting queue.
8. When a vehicle becomes available, the waiting queue is processed again.
9. The system updates vehicle movement, ETA, pickup, drop-off, and ride completion.

**Queue Management:** Priority tier and queue position are treated separately. Multiple passengers can share the same priority tier, but every booking receives a unique queue position within its vehicle-type queue.

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| HTML | Application structure |
| CSS | Styling and responsive UI |
| JavaScript | Frontend functionality |
| Node.js | Backend runtime |
| Express.js | Backend APIs |
| Socket.IO | Real-time communication |
| Leaflet.js | Interactive map |
| OpenStreetMap | Map data and tiles |
| OSRM API | Road-based routing and ETA estimation |
| In-memory storage | Runtime simulation data |

**Database:** The current prototype uses in-memory storage instead of MongoDB. Data may reset when the server restarts.

## 🏗️ System Architecture

```text
             Passenger / Admin
                    |
                    v
             Frontend Dashboard
          (Booking + Map + Controls)
                    |
                    v
             Node.js + Express
                    |
                    v
              Booking Manager
                    |
                    v
            Priority Queue Manager
                    |
                    v
           Vehicle Allocation Engine
                    |
             +------+------+
             |             |
             v             v
       Vehicle Check    Route / ETA
       & Availability    (OSRM API)
             |             |
             +------+------+
                    |
                    v
              Trip Simulation
            (Movement + Status)
                    |
                    v
                Socket.IO
                    |
                    v
          Live Dashboard Updates
```

## 🗺️ Mapping and Routing

- Leaflet.js provides interactive maps and vehicle markers.
- OpenStreetMap provides map tiles.
- OSRM provides road-based routes, distance, and estimated travel duration.
- Vehicle movement is simulated along the generated routes.

Public map and routing services have usage limits and policies. Production deployment may require dedicated hosting.

## 📂 Project Structure

The project is organized around frontend and backend responsibilities. The exact folder structure may vary depending on the implementation.

```text
project/
│
├── client/
│   ├── components/
│   ├── map/
│   └── ...
│
├── server/
│   ├── routes/
│   ├── services/
│   └── ...
│
├── README.md
└── package.json
```

Refer to the actual project files for the definitive structure.

## 🔮 Future Enhancements

- Persistent database integration.
- User authentication and role-based access.
- Real-time GPS tracking.
- Traffic-aware ETA estimation.
- Fare estimation and transparency.
- Advanced cancellation and reassignment handling.
- Demand prediction and analytics.
- Accessibility-focused pickup options.

## ⚠️ Limitations

- This is a simulation, not a real-world ride-hailing platform.
- Passenger and vehicle locations are simulated.
- ETA values are estimates.
- In-memory data does not persist after server restarts.
- Passenger categories are provided as simulation inputs and are not independently verified.
- The priority policy is a prototype concept and requires further evaluation before real-world deployment.

## 🎓 Academic Project

**Ride easy Simulation** is a Design Thinking and software prototyping project that explores how priority-based allocation, intelligent vehicle matching, and real-time simulation can improve the commuting experience.
