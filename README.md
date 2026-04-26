<div align="center">

# 🚗 RideSync

**A Full-Stack Real-Time Ride Coordination & Tracking Platform**

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](#)
[![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)](#)
[![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)](#)
[![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](#)
[![Mapbox](https://img.shields.io/badge/Mapbox-000000?style=for-the-badge&logo=mapbox&logoColor=white)](#)
[![Render](https://img.shields.io/badge/Render-46E3B7?style=for-the-badge&logo=render&logoColor=white)](#)

*Synchronize routes, track live locations, and ensure rider safety—all in real-time.*

</div>

---

## 🚀 Live Demo

Experience the platform live: **[RideSync on Render](https://ridesynk.onrender.com)**  
*(Note: As this is hosted on a free tier, initial loads might take 30-50 seconds to spin up from sleep.)*

---

## ✨ Features

### 🚦 Core Features
* **Ride Management System**: Seamlessly create, join, and manage group rides.
* **Role-Based Access Control**: Differentiated permissions for Ride Admins (creators) and Members.
* **Secure Authentication**: Robust session-based authentication managed via Passport.js.
* **Responsive Mobile-First UI**: Seamless user experience across devices rendered natively with EJS templates and modern CSS.

### 🗺️ Advanced Features
* **Dynamic Routing System**: Adaptive map routing using Mapbox Directions API.
  * *Before Ride*: Displays a visual dotted path from the rider to the start source.
  * *During Ride*: Route dynamically shifts to track from the Admin's live location to the final destination.
* **Proximity-Based Logic**: Map UI cleans up intelligently (e.g., hides start route when a rider is within an ~80m radius of the source).
* **Emergency SOS System**: Instant panic alerts broadcasted to all active ride members, triggering popup warnings, audio alerts, and sharing exact live coordinates.
* **Performance Optimizations**: Implemented lazy loading, cached calculations, and efficient MongoDB geospatial queries to ensure smooth platform performance.

### ⚡ Real-Time Features
* **Live Location Tracking**: High-frequency coordinate syncing utilizing Socket.IO.
* **Multi-User Synchronization**: Render all active group members dynamically on a single map canvas simultaneously.
* **Group Chat System**: Instant messaging room isolated to ride members, persisting history via MongoDB and broadcasting real-time updates.

---

## 🏗️ Architecture Overview

RideSync utilizes a robust asynchronous architecture optimized for real-time throughput:

1. **Client Layer (Views & Public)**: Renders a stateful UI utilizing EJS, Vanilla JS, and Mapbox GL. Communicates with the backend via REST (fetching historical data) and WebSockets (real-time data).
2. **Transport Layer (Socket.IO + Express)**: Express handles standard HTTP requests, authentications, and view routing. Socket.IO maintains persistent connections for bidirectional, low-latency communication (chat, location sharing, SOS).
3. **Data Layer (MongoDB)**: Mongoose schemas strictly define models for Users, Rides, Messages, and SOS Logs. Features geospatial operators for location storage and retrieval.

---

## ⚙️ Installation & Setup

Follow these steps to run RideSync locally on your machine.

### Prerequisites
* [Node.js](https://nodejs.org/) (v16+)
* [MongoDB](https://www.mongodb.com/) (Local or Atlas)
* [Mapbox Account](https://www.mapbox.com/) (For Access Token)

### Step-by-Step

**1. Clone the repository**
```bash
git clone https://github.com/yourusername/ridesync.git
cd ridesync
```

**2. Install dependencies**
```bash
npm install
```

**3. Configure Environment Variables**
Create a `.env` file in the root directory and add the variables listed in the Environment Variables section.

**4. Start the application**
```bash
# For development with nodemon
node server.js
```
The application will be available at `http://localhost:8080`.

---

## 🔑 Environment Variables

| Variable | Description | Example |
| :--- | :--- | :--- |
| `PORT` | Running port for the Node server | `3000` |
| `MONGO_URI` | MongoDB Connection String | `mongodb://localhost:27017/ridesync` |
| `SESSION_SECRET` | Secret key for Passport.js sessions | `super_secret_session_key` |
| `MAPBOX_ACCESS_TOKEN` | API Token for Mapbox GL JS | `pk.eyJ1Ijoi...` |

---

## 📡 API / Socket Events

The real-time engine is powered by specific WebSocket events keeping clients consistently synchronized.

| Event Name | Direction | Payload Description | Purpose |
| :--- | :--- | :--- | :--- |
| `joinRide` | Client → Server | `{ rideId, userId }` | Subscribes client socket to a specific ride room. |
| `sendLocation` | Client → Server | `{ lat, lng, userId, rideId }` | Emits current GPS coordinates from user device. |
| `receiveLocation`| Server → Client | `{ lat, lng, userId }` | Broadcasts updated coordinates to all room members. |
| `sendMessage` | Client → Server | `{ rideId, text, senderId }` | Dispatch a new chat message to the group. |
| `receiveMessage` | Server → Client | `{ messageDocument }` | Delivers formatted message to all active chats. |
| `sosAlert` | Client → Server | `{ lat, lng, userInfo }` | High-priority event triggering immediate broadcast. |

---

## 📂 Folder Structure

```text
ridesync/
├── config/             # Database and third-party configuration
├── controllers/        # Core business logic (Rides, Chat, SOS, Users)
├── cron/               # Scheduled automated tasks (ride completion, cleanup)
├── models/             # Mongoose schemas (User, Ride, Message, SOS)
├── public/             # Static assets (CSS, images, client JS scripts)
├── routes/             # Express route definitions
├── socket/             # Socket.IO connection handling and event mapping
├── utils/              # Helper functions (Geo-calculations, Error Handling)
├── views/              # EJS Templates (Auth, Map, Dashboard, Includes)
├── server.js           # Application entry point
└── package.json        # Project metadata and dependencies
```

---

## 🧪 Edge Cases Handled

To ensure production-level reliability, RideSync specifically catches and handles:

1. **Reconnection & State Recovery**: If a user drops a cellular connection, Socket.io gracefully buffers events, seamlessly reconnecting and pulling the latest chat/location state from MongoDB without requiring a page refresh.
2. **Admin Offline Fallback**: If the ride Admin loses connection, the dynamic routing algorithm intelligently pauses destination rewrites and holds the last known coordinates to prevent map crashing or misdirection for members.
3. **Ghost Users**: Implemented a CRON job (`cron/deleteUsers.js`, `cron/ridecompeletion.js`) architecture to clean up orphaned data and automatically conclude rides if an admin fails to formally end the session.
4. **Data Race Conditions**: Strict backend validation payload sequences ensure that rapid location emissions (spamming) do not cause UI stuttering via local debounce strategies.

---

## 🔮 Future Improvements

- [ ] **PWA Support**: Convert current web architecture into a Progressive Web App for background location execution and native app feel.
- [ ] **Push Notifications**: Integrate Firebase Cloud Messaging (FCM) to deliver SOS or chat alerts even if the browser is closed.
- [ ] **Route Optimization AI**: Suggest alternative meetup nodes if current admin route encounters heavy MapBox traffic events.
- [ ] **Polyline Snapping**: Enhance location accuracy using MapBox Directions matching API to snap erratic GPS dots perfectly to road networks.

---

<div align="center">
  <i>Built with ❤️ by a passionate engineer</i>
</div>
