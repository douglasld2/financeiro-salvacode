# Contas a Receber - Accounts Receivable Manager

## Overview
A fullstack Accounts Receivable web application for software developers to manage project installments, SaaS subscriptions, and retainer fees. Built with a professional dark theme and BRL (Brazilian Real) formatting throughout. Includes role-based authentication (admin + client user).

## Tech Stack
- **Frontend**: React + Vite, Tailwind CSS, Radix UI (shadcn), TanStack Query
- **Backend**: Express.js (Node.js)
- **Database**: PostgreSQL with Drizzle ORM
- **Routing**: Wouter
- **Auth**: express-session + bcryptjs

## Project Structure
```
client/src/
  App.tsx                          - Main app with ThemeProvider, AuthProvider, and routing
  pages/
    home.tsx                       - Admin dashboard (all transactions)
    login.tsx                      - Login page (redirects by role)
    admin.tsx                      - Admin panel (user management)
    user-project.tsx               - Client view (linked project only)
    not-found.tsx                  - 404 page
  components/
    theme-provider.tsx             - Dark/light theme toggle
    dashboard-cards.tsx            - 4 KPI cards (30-day receivables, overdue, cashflow, SaaS)
    transaction-accordion.tsx      - Accordion grouped by client/project with progress bars
    create-transaction-dialog.tsx  - 2-step wizard: category selection → form
    saas-renewals.tsx              - SaaS renewal tracking card
  hooks/
    use-auth.tsx                   - Auth context: user, login, logout
  lib/
    format.ts                      - BRL formatting, date formatting, status helpers
    queryClient.ts                 - TanStack Query setup

server/
  index.ts       - Express server setup with session middleware
  routes.ts      - API endpoints (auth + transactions + users)
  storage.ts     - Database storage interface
  db.ts          - Drizzle PostgreSQL connection
  seed.ts        - Seed data + admin user creation
  auth.ts        - requireAuth / requireAdmin middleware
  email.ts       - SMTP email sending via nodemailer

shared/
  schema.ts      - Drizzle schema + Zod validation schemas (transactions + users)
```

## Data Model
- **Transaction**: id, description, client, clientEmail, clientWhatsapp, category (SAAS_SUBSCRIPTION | PROJECT_INSTALLMENT | RETAINER_FEE), amount, dueDate, status (PENDING | OVERDUE | PAID), installmentCurrent, installmentTotal, groupId
- **User**: id, username, password (hashed), name, email, phone, role (admin | user), groupIds (text[] nullable - links to multiple transaction groups)

## Authentication
- Session-based with express-session (SESSION_SECRET env var)
- Passwords hashed with bcryptjs (cost 10)
- Default admin: username `admin`, password `admin123` (created on first boot)
- Admin: sees all transactions, can create/edit/delete users, link multiple projects, set email/phone per user
- User: sees only transactions for their linked groupIds (multiple allowed)
- Collection buttons (WhatsApp/Email) resolve from user account email/phone first, fallback to transaction-level contact

## API Endpoints
- `POST /api/auth/login` - Login, returns user data
- `POST /api/auth/logout` - Destroy session
- `GET /api/auth/me` - Returns current user or 401
- `GET /api/users` - Admin: list users
- `POST /api/users` - Admin: create user
- `PATCH /api/users/:id` - Admin: update user (name, groupId, password)
- `DELETE /api/users/:id` - Admin: delete user
- `GET /api/groups` - Admin: list distinct transaction groups
- `GET /api/transactions` - Admin: all; User: filtered to their groupId
- `POST /api/transactions` - Admin only: create installment group
- `PATCH /api/transactions/:id` - Admin only: update status
- `POST /api/send-collection-email` - Admin only: send collection email

## Key Features
1. **Login System**: Single login page, redirects admin → dashboard, user → meu-projeto
2. **Admin Panel**: Create users, link to project groups, delete users
3. **User View**: Client sees only their linked project's transactions
4. **Wizard**: 2-step creation - choose category, then fill details; auto-generates installments
5. **Accordion View**: Grouped by client → project with progress bars
6. **Tabs**: A Receber (30 days), Em Atraso (overdue), Projetos (all active)
7. **Dashboard**: 4 KPI cards with cashflow forecasting
8. **SaaS Renewals**: Dedicated card for upcoming subscription renewals
9. **Dark Theme**: Professional dark mode with light mode toggle
10. **Collection via WhatsApp**: Opens wa.me/{phone} with pre-filled message for overdue installments
11. **Collection via Email**: Sends email via SMTP (nodemailer) for overdue installments

## Email Configuration
- Uses nodemailer with SMTP (server/email.ts)
- Requires secrets: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL

## Recent Changes
- 2026-02-06: Initial implementation of full MVP
- 2026-02-06: Added clientEmail and clientWhatsapp fields to transaction schema
- 2026-02-06: Added SMTP email sending for collection messages
- 2026-02-06: WhatsApp button directs to client's phone number with pre-filled message
- 2026-04-20: Added role-based auth system (admin + user), login page, admin panel, user project view
