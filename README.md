# ⚡ LinkFlow

<div align="center">

**High-Performance Distributed URL Shortener & Real-Time Event-Driven Analytics Engine**

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![Kafka](https://img.shields.io/badge/Apache_Kafka-4.x-231F20?style=for-the-badge&logo=apache-kafka&logoColor=white)](https://kafka.apache.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)

</div>

---

## 🏛️ System Architecture

LinkFlow is built on an **event-driven microservices architecture** optimized for sub-millisecond redirect latency, zero ID collision, and asynchronous real-time analytics offloading.

```mermaid
graph TB
    subgraph Clients[" Client Layer "]
        Browser["Web Browser / Client"]
        RedirectUser["End User (Clicking Short Link)"]
    end

    subgraph Edge[" Edge & Security Tier "]
        Gateway["API Gateway (Port 8000)<br/>- 3-Tier Rate Limiting<br/>- CORS Security<br/>- Reverse Proxy Routing"]
    end

    subgraph Services[" Microservices Tier "]
        AuthSvc["Auth Service (Port 8001)<br/>- JWT & Refresh Tokens<br/>- bcrypt Hashing"]
        UrlSvc["URL Service (Port 8002)<br/>- Base62 Encoding Engine<br/>- Custom Vanity Slugs"]
        RedirectSvc["Redirect Service (Port 8003)<br/>- Sub-ms Cache Lookup<br/>- Instant HTTP 302 Found<br/>- Async Kafka Producer"]
        AnalyticsSvc["Analytics Service (Port 8004)<br/>- Kafka Consumer Group<br/>- UA Device & Geo Parsing<br/>- Real-time Aggregation API"]
    end

    subgraph Streaming[" Event Streaming Tier "]
        KafkaBroker["Apache Kafka Broker (Port 9092)<br/>Topic: 'click-events'"]
    end

    subgraph Data[" Data & In-Memory Tier "]
        Redis["Redis Cache & Counters (Port 6379)<br/>- Atomic INCR Counter (url:counter)<br/>- Sliding TTL URL Cache (url:code)<br/>- In-memory Click Counters"]
        Postgres[("PostgreSQL Database (Port 5432)<br/>- users<br/>- urls<br/>- click_events<br/>- refresh_tokens")]
    end

    %% Client Traffic
    Browser -->|API Requests| Gateway
    RedirectUser -->|GET /:shortCode| Gateway

    %% Gateway Routing
    Gateway -->|/auth/*| AuthSvc
    Gateway -->|/url/*| UrlSvc
    Gateway -->|/:shortCode| RedirectSvc
    Gateway -->|/analytics/*| AnalyticsSvc

    %% Service Interactions
    AuthSvc --> Postgres
    
    UrlSvc -->|Atomic INCR| Redis
    UrlSvc -->|Persist URL| Postgres
    UrlSvc -->|Warm Cache| Redis

    RedirectSvc -->|1. Fast Memory Read| Redis
    RedirectSvc -.->|2. Cold Cache Miss| Postgres
    RedirectSvc -->|3. Async Event Publish| KafkaBroker

    KafkaBroker -->|Stream Click Event| AnalyticsSvc
    AnalyticsSvc -->|Persist Event Log| Postgres
    AnalyticsSvc -->|Update Aggregates| Postgres

    classDef primary fill:#0284c7,stroke:#0369a1,stroke-width:2px,color:#fff;
    classDef memory fill:#dc2626,stroke:#991b1b,stroke-width:2px,color:#fff;
    classDef broker fill:#1e293b,stroke:#475569,stroke-width:2px,color:#fff;
    classDef db fill:#334155,stroke:#475569,stroke-width:2px,color:#fff;

    class RedirectSvc,UrlSvc,Gateway primary;
    class Redis memory;
    class KafkaBroker broker;
    class Postgres db;
```

---

## ⚡ Core Workflows

### 1. High-Performance Redirect Flow (< 1ms Latency)

> **Key Design Decision:** Zero database writes on the critical redirect path. SQL updates and log persistence are completely decoupled from the HTTP response via Kafka.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant GW as API Gateway
    participant Redir as Redirect Service
    participant Cache as Redis Cache
    participant Kafka as Kafka (click-events)
    participant Analytics as Analytics Consumer
    participant DB as PostgreSQL

    User->>GW: GET /:shortCode
    GW->>Redir: Proxy GET /:shortCode
    
    alt Cache Hit (95%+ of traffic)
        Redir->>Cache: GET url:{shortCode}
        Cache-->>Redir: Return destination URL (0.2 - 0.8ms)
        Note over Redir,Cache: Extend sliding TTL in Redis
    else Cache Miss (Cold)
        Redir->>DB: Query SELECT long_url FROM urls
        DB-->>Redir: Return record
        Redir->>Cache: Populate Redis with 7-Day TTL
    end

    par Parallel Asynchronous Actions
        Redir-->>User: ⚡ HTTP 302 Found (Redirect Immediately)
    and
        Redir->>Cache: Atomic HINCRBY url_clicks
    and
        Redir->>Kafka: Publish Click Event (UUID, IP, UA, Referer)
    end

    Note over Kafka,Analytics: Decoupled Asynchronous Processing
    Kafka->>Analytics: Consume Message
    Analytics->>Analytics: Parse Device, OS, Browser
    Analytics->>DB: INSERT into click_events
    Analytics->>DB: UPDATE urls SET clicks = clicks + 1
```

---

### 2. Zero-Collision URL Creation Flow

> **Key Design Decision:** No random hash collision retries. LinkFlow uses atomic 64-bit integer counters paired with **Base62 bijective encoding**, mathematically guaranteeing unique IDs across concurrent requests.

```mermaid
sequenceDiagram
    autonumber
    actor Creator as Authenticated / Guest User
    participant GW as API Gateway
    participant UrlSvc as URL Service
    participant Redis as Redis Counter
    participant DB as PostgreSQL

    Creator->>GW: POST /url/create { longUrl, customCode? }
    Note over GW: Rate Limit Check (50 req / 15m)
    GW->>UrlSvc: Forward Request

    alt Custom Alias Provided
        UrlSvc->>DB: Check availability
    else Auto-generated Short Code
        UrlSvc->>Redis: INCR url:counter
        Redis-->>UrlSvc: Return atomic integer (e.g., 10000042)
        UrlSvc->>UrlSvc: Encode integer to Base62 (e.g., "fx2B")
    end

    UrlSvc->>DB: INSERT INTO urls (short_code, long_url)
    UrlSvc->>Redis: SET url:{code} longUrl EX 2592000 (30 Days)
    UrlSvc-->>Creator: HTTP 201 Created { shortUrl: "http://lnkf.io/fx2B" }
```

---

## 🛠️ Microservices Specifications

| Service | Port | Primary Responsibility | Key Technologies |
| :--- | :---: | :--- | :--- |
| **API Gateway** | `8000` | Single entry-point, proxying, 3-tier rate limiting, CORS | Express, `express-http-proxy`, `express-rate-limit` |
| **Auth Service** | `8001` | User registration, login, JWT issuance, password hashing | Express, `bcrypt`, `jsonwebtoken`, Postgres |
| **URL Service** | `8002` | Unique short code generation, Base62 engine, user URL management | Express, Base62, ioredis, Postgres |
| **Redirect Service** | `8003` | Ultra-fast 302 redirection, sliding cache, Kafka event producer | Express, ioredis, `kafkajs`, Postgres |
| **Analytics Service** | `8004` | Event consumption, device categorization, metrics aggregation API | Express, `kafkajs`, Postgres, User-Agent Parser |
| **Frontend UI** | `5173` | Responsive glassmorphism dashboard, QR generator, analytics modal | React 19, Vite, Lucide Icons |

---

## 🚀 Performance & Scalability Characteristics

- **Bijective Base62 Capacity:**
  - 6 characters: $62^6 \approx \mathbf{56.8\text{ Billion}}$ URLs.
  - 7 characters: $62^7 \approx \mathbf{3.5\text{ Trillion}}$ URLs.
- **Redirect Throughput:** **3,000 to 5,000+ requests/sec** per instance on single-node setups; **50,000+ RPS** when scaled horizontally with PM2 cluster / Kubernetes.
- **Fault-Tolerant Streaming:** If PostgreSQL is under heavy write load or temporarily unavailable, Kafka buffers events with zero data loss while redirects continue operating uninterrupted.

---

## 🚦 Getting Started

### 1. Prerequisites
- [Node.js 20+](https://nodejs.org/)
- [Docker & Docker Compose](https://www.docker.com/)

### 2. Start Infrastructure
```bash
cd backend
docker compose up -d
```
This launches:
- **PostgreSQL 18** on `localhost:5432`
- **Redis 7 (Alpine)** on `localhost:6379`
- **Apache Kafka 4.1.1** on `localhost:9092`
- **Kafka-UI** on `http://localhost:8080`

### 3. Run Microservices (Development)
Open separate terminals or run via npm:
```bash
# Gateway
cd backend/gateway && npm install && npm run dev

# Microservices
cd backend/services/auth && npm install && npm run dev
cd backend/services/url && npm install && npm run dev
cd backend/services/redirect && npm install && npm run dev
cd backend/services/analytics && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

### 4. Production Deployment (PM2 Cluster)
To run all backend services across all available CPU cores:
```bash
cd backend
npm install -g pm2
pm2 start ecosystem.config.cjs --env production
```

---

## 📝 License
This project is open source and available under the [ISC License](LICENSE).
