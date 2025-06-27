# **TeamBoard API** 🚀

[![Swagger Docs](https://img.shields.io/badge/docs-openapi-blue?logo=swagger)](https://teamboard-api.onrender.com/api-docs)
[![CI](https://github.com/tyxgx/teamboard-api/actions/workflows/ci.yml/badge.svg)](https://github.com/tyxgx/teamboard-api/actions/workflows/ci.yml)
[![Render Deployment](https://img.shields.io/badge/render-live-success?logo=render&label=render)](https://teamboard-api.onrender.com)

**A secure, role-based board and comment management system**  
✅ **Deployed on Render** (Cloud Hosting)  
✅ **Dockerized** (Containerized for easy deployment)

---

## 🔹 Features

- ✅ **User Authentication** (Signup, Login with JWT)
- ✅ **Role-Based Access Control (RBAC)** (Admin & Member roles)
- ✅ **Board & Comment Management**
- ✅ **PostgreSQL Database** (Prisma ORM)
- ✅ **Swagger Docs** (Auto-generated API documentation)
- ✅ **Docker Support** (Easy containerization)
- ✅ **Render Deployment** (Live API access)
- ✅ **CI with GitHub Actions** (build, migrate, seed, test)
- ✅ **Prettier + ESLint** (code formatting & linting)

---

## **📌 Table of Contents**

1. [Live Deployment](#-live-deployment)
2. [Docker Setup](#-docker-setup)
3. [API Endpoints](#-api-endpoints)
4. [Testing Guide (Postman)](#-testing-guide-postman)
5. [Local Development](#-local-development)
6. [Database Schema](#-database-schema)
7. [Swagger API Docs](#-swagger-api-docs)
8. [Project Setup & Quality Tools](#-project-setup--quality-tools)

---

## **🌐 Live Deployment (Render)**

🔗 **Base URL:** `https://teamboard-api.onrender.com`

### How to Use:

1. `POST /api/auth/signup`
2. `POST /api/auth/login` (returns token)
3. Add `Authorization: Bearer <token>` to protected routes

---

## **🐳 Docker Setup**

### 1. Build & Run locally

```bash
docker build -t teamboard-api .
docker run -p 5000:5000 -e DATABASE_URL=... -e JWT_SECRET=... teamboard-api

2. Docker Compose Setup

version: '3.8'
services:
  api:
    build: .
    ports:
      - '5000:5000'
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/teamboard
      - JWT_SECRET=your_jwt_secret
    depends_on:
      - db
  db:
    image: postgres:13
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=teamboard
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
volumes:
  postgres_data:

Run:

docker-compose up


⸻

🔗 API Endpoints

1️⃣ Authentication

Endpoint	Method	Description
/api/auth/signup	POST	Register a new user
/api/auth/login	POST	Login & receive a JWT token

2️⃣ Board Management

Endpoint	Method	Description	Access
/api/boards	POST	Create board	Admin only
/api/boards	GET	List all boards	Authenticated
/api/boards/:id	GET	Get board with comments	Authenticated

3️⃣ Comment System

Endpoint	Method	Description
/api/comments	POST	Add comment
/api/comments/:boardId	GET	Get comments for a board


⸻

🔍 Testing Guide (Postman)

🔐 Authentication

POST /api/auth/signup
{
  "name": "User",
  "email": "test@example.com",
  "password": "test123",
  "role": "MEMBER"
}

POST /api/auth/login
{
  "email": "test@example.com",
  "password": "test123"
}

📋 Boards & Comments

POST /api/boards
Headers: Authorization: Bearer <token>
Body: { "name": "Project X" }

POST /api/comments
Headers: Authorization: Bearer <token>
Body: { "content": "Nice!", "visibility": "EVERYONE", "boardId": "<id>" }


⸻

💻 Local Development

npm install
npx prisma migrate dev
npm run dev


⸻

🗃 Database Schema

model User {
  id       String   @id @default(uuid())
  name     String
  email    String   @unique
  password String
  role     Role
  comments Comment[]
}

model Board {
  id       String    @id @default(uuid())
  name     String
  adminId  String
  comments Comment[]
}

model Comment {
  id           String   @id @default(uuid())
  content      String
  visibility   Visibility
  createdById  String
  boardId      String
  createdBy    User     @relation(fields: [createdById], references: [id])
  board        Board    @relation(fields: [boardId], references: [id])
}


⸻

📖 Swagger API Docs

🔗 https://teamboard-api.onrender.com/api-docs
Try out every endpoint from your browser!

⸻

✅ Project Setup & Quality Tools

🧪 Testing
	•	Jest tests for all core modules (auth, boards, comments, RBAC)
	•	Seeded test user: valid@example.com / test123

✅ ESLint + Prettier
	•	ESLint with TypeScript rules
	•	Run checks with:

npm run lint     # Highlights warnings
npm run format   # Auto-formats code



⚙️ GitHub Actions CI
	•	Runs on each push to main
	•	Pipeline:
	•	✅ Install & build
	•	✅ Prisma migrate + seed
	•	✅ Run full test suite

⸻

📜 License

MIT License – Use freely, contribute gladly!

⸻
```
