# tl;dr

everything implemented as described in the google docs.
even the bonus section.


# Distributed Conversational AI Platform with Real-Time Observability

This repository contains a production-ready, highly optimized, distributed conversational AI ecosystem. Built using an event-driven, multi-provider architecture, the system handles real-time streaming conversations while piping redacted analytical and telemetry data through a custom SDK to an isolated Observatory dashboard.

---

## Core Microservices Architecture

The system is decoupled into three distinct folders, engineered to scale independently and maintain high isolation boundaries. The **Backend** hosts the actual ChatGPT clone frontend and the main conversational logic, utilizing WebSockets for continuous, low-latency streaming and handling conversation lifecycles natively (creating, listing, canceling, resuming). Embedded within this backend is our custom **SDK** package, which acts as an intermediate middleware intercepting and scrubbing sensitive user data at the edge. The SDK latches onto a singular webhook hook exposed by the isolated **Analytics Server (The Observatory)**. This webhook ingests two data streams—system logs (socket connection/disconnection lifecycles) and redacted chat messages—persisting them into an independent PostgreSQL instance and serving a dedicated analytics panel to calculate real-time platform retention and system health.

### Folder & Component Breakdown
* **`/backend` (Chat App & Logic):** Hosts the web application frontend alongside the backend core. It maintains full session state memory and features a multi-provider adapter interface (**Gemini, Groq, DeepSeek, OpenAI**) running on lowest tiers to control upstream token costs.
* **`/sdk` (Telemetry Engine):** A standalone, custom SDK published to npm (`npm install custom-sdk`) that handles edge PII redaction and structures tracking telemetry before it leaves the backend application thread.
* **`/analytics-server` (The Observatory):** A dedicated monitoring server that provisions a public webhook endpoint to ingest stream tracking data and renders a frontend dashboard visualizing user retention and platform performance metrics.

---

## Key Achievements & Bonus Deliverables Verified

* **Multi-Provider Support:** Standardized adapter layer accommodating Gemini, Groq, DeepSeek, and OpenAI.
* **Streaming Responses:** Implemented bidirectional WebSockets allowing real-time text output and immediate client-side stream cancellations.
* **Telemetry Dashboards:** Dedicated analytical views for **Latency, Throughput, and Error rates** inside the Observatory.
* **One-Command Setup:** Single script initialization via Docker Compose.
* **Event-Driven & Privacy-First:** Edge-based PII redaction pipeline decoupled from analytics storage via hooks.
* **Self-Hosted K3s Kubernetes Deployment:** Implemented on a resource-constrained VPS running an optimized K3s cluster. Pod footprints are strictly capped at **250MB RAM** to prevent OOM errors, ensuring stability on lightweight hardware.

---

## Quick Start Guide

### Local Deployment
Launch the entire distributed network with a single command from the project root:
```bash
docker compose up --build -d
```

need to update the env in thebackend folder for the  api keys with gemini and groq etc.
