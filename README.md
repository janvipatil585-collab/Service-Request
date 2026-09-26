# ServiceDesk Pro 🎫

> **Intelligent Service Request Management System** — Full-stack web application for handling employee/customer service requests with priority tracking, real-time notifications, and analytics.

[![Node.js](https://img.shields.io/badge/Node.js-v24-green)](https://nodejs.org) [![Express](https://img.shields.io/badge/Express-5.x-blue)](https://expressjs.com) [![SQLite](https://img.shields.io/badge/SQLite-3-lightblue)](https://sqlite.org) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## ✨ Features

- 🔐 **JWT Authentication** — Login, register, role-based access (Admin / Agent / User)
- 📊 **Dashboard Analytics** — Live stats, priority distribution chart, category breakdown
- 📋 **Ticket Management** — Create, view, update, assign, and close tickets
- 🏷️ **Priority System** — Critical / High / Medium / Low with visual color coding
- 💬 **Comments & Internal Notes** — Threaded comments + agent-only internal notes
- 📜 **Activity Audit Trail** — Full history of every change on each ticket
- 🔔 **Real-time Notifications** — Auto-polling bell icon with unread badge
- 🔍 **Filter & Search** — Filter by status, priority, category; search by title/number
- 📄 **Pagination** — Server-side pagination for large ticket volumes
- 📱 **Responsive Design** — Mobile-friendly with collapsible sidebar

---

## 🖥️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Express.js |
| **Database** | SQLite (via `better-sqlite3`) |
| **Auth** | JWT (`jsonwebtoken`) + bcrypt |
| **Frontend** | Vanilla HTML, CSS, JavaScript |
| **Styling** | Custom premium dark-mode CSS |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone the repo
git clone https://github.com/janvipatil585-collab/Service-Request.git
cd Service-Request

# Install dependencies
npm install

# Start the server
npm start
```

Visit **http://localhost:5000** in your browser.

---

## 🔑 Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@company.com | admin123 |
| Agent | sarah@company.com | sarah123 |
| User | emily@company.com | emily123 |

---

## 📁 Project Structure

```
├── server.js          # Express server + all API routes
├── db.js              # SQLite schema initialization
├── seed.js            # Demo data seeder
├── package.json
└── public/
    ├── index.html     # Single-page app
    ├── style.css      # Premium dark theme
    └── app.js         # Frontend logic (API calls, UI, routing)
```

## 🛠️ API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate user |
| POST | `/api/auth/register` | Register new user |
| GET | `/api/tickets` | List tickets (with filters) |
| POST | `/api/tickets` | Create new ticket |
| GET | `/api/tickets/:id` | Get ticket details |
| PATCH | `/api/tickets/:id` | Update ticket |
| DELETE | `/api/tickets/:id` | Delete ticket |
| POST | `/api/tickets/:id/comments` | Add comment |
| GET | `/api/stats` | Dashboard statistics |
| GET | `/api/notifications` | User notifications |

---

## 📄 License

MIT © Janvi Patil