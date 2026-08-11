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
- **Transaction**: id, description, client, clientEmail, clientWhatsapp, clientCpfCnpj, category (SAAS_SUBSCRIPTION | PROJECT_INSTALLMENT | RETAINER_FEE | DATABASE_BACKUP), amount, dueDate, status (PENDING | OVERDUE | PAID), installmentCurrent, installmentTotal, groupId, interestRate (%/mês), lateFee (% fixa), earlyDiscount (%), earlyDiscountDays (int), asaasChargeId (cache)
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

## Billing Adjustments & Asaas PIX
- Each transaction stores its own juros/multa/desconto rates (configured per project in the create wizard; defaults: 1% juros/mês, 2% multa, 0% desconto, 7 dias antecipação)
- `server/billing.ts` calculates adjusted amount on demand: `daily_interest = interestRate/30 * daysLate`; fine = `base * lateFee`; discount applies when paying ≥ earlyDiscountDays before due
- Collection flow (overdue installments only):
  1. Admin clicks WhatsApp or Email button
  2. Frontend calls `POST /api/transactions/:id/collection-preview` which recalculates amount and (if ASAAS_API_KEY set) creates/refreshes an Asaas PIX charge for the adjusted value
  3. Preview dialog shows breakdown (base, interest, fine, discount, total), PIX copy-paste code, and rendered message
  4. WhatsApp: opens wa.me with message containing PIX code | Email: server sends via SMTP with same message
- `server/asaas.ts` wraps Asaas sandbox API (`https://api-sandbox.asaas.com/v3`): findOrCreateCustomer (searches by cpfCnpj then email; falls back to test CPF in sandbox), createPixCharge → returns PIX payload + QR code base64
- Phone numbers normalized to 10-11 digits (Brazilian DDD format) before sending to Asaas to avoid validation errors

## Backups Section
- DATABASE_BACKUP category behaves like SAAS recurring billing (monthly, X months or 12 if indefinite)
- Dedicated "Backups" tab on home page with its own "Novo Backup" button (skips category step in wizard)
- Backups are excluded from Projetos / A Receber / Em Atraso tabs and from KPI cards (they're paid automatically by a third party — no collection needed)
- Collection buttons (WhatsApp/Email/Pagar) are hidden on backup rows; "Pagar" becomes "Recebido"
- API blocks collection-preview and send-collection-email for DATABASE_BACKUP with 400 "Backups não geram cobrança"
- For backups, `client` is the primary paying/service-provider company (e.g. OSPREY), while `clientCpfCnpj` identifies the end company receiving the backup. One payer can contain multiple backup groups, each with its own CNPJ.
- The Backups tab shows only overdue items and pending items due in the current month; future installments stay hidden.

## WhatsApp API (Meta Cloud API)
- `server/whatsapp.ts`: envia mensagem de texto via Meta Graph API v19.0
- Requer secrets: `WHATSAPP_TOKEN` (token permanente do sistema) e `WHATSAPP_PHONE_NUMBER_ID` (ID do número no Meta Business)
- `GET /api/config` (admin): retorna `{ whatsappConfigured, asaasConfigured }` — frontend usa para decidir o comportamento do botão
- `POST /api/send-whatsapp` (admin): valida parcela em atraso → chama `resolvePixForTransaction` → envia mensagem diretamente via API
- Normalização do número: adiciona prefixo `55` (Brasil) se ausente; a Meta API aceita E.164
- Frontend: quando `whatsappConfigured=true`, o botão no diálogo de cobrança muda de "Abrir WhatsApp" para "Enviar Agora" (envia direto sem abrir app); quando `false`, mantém comportamento anterior de redirect `wa.me`
- Para ativar: criar secrets `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` no Replit (dev) e no Google Secret Manager como `SF_WHATSAPP_TOKEN` / `SF_WHATSAPP_PHONE_NUMBER_ID` (prod)

## Recent Changes
- 2026-02-06: Initial implementation of full MVP
- 2026-02-06: Added clientEmail and clientWhatsapp fields to transaction schema
- 2026-02-06: Added SMTP email sending for collection messages
- 2026-02-06: WhatsApp button directs to client's phone number with pre-filled message
- 2026-04-20: Added role-based auth system (admin + user), login page, admin panel, user project view
- 2026-05-21: Backups section + juros/multa/desconto + Asaas PIX integration (see sections above)
- 2026-05-04: Full CRUD audit and bug fixes:
  - Server timezone forced to America/Sao_Paulo via `server/tz.ts`; due dates stored at noon local to avoid timezone day-shift
  - Installment amounts distributed in cents so totals always match (100/3 = 33.34 + 33.33 + 33.33)
  - Month overflow handled (Jan 31 + 1 month = Feb 28/29)
  - Overdue detection uses `lt(dueDate, startOfTodayLocal)` so transactions due today are not marked overdue until tomorrow
  - API errors parsed as JSON in client `apiRequest` for clean Portuguese toast messages
  - User view (`user-project.tsx`) passes `readOnly` to hide admin-only Pagar/WhatsApp/Email buttons
  - Self-deletion blocked; deleting the last admin blocked
  - `createTransactionDialog` startDate defaults to local date components (not UTC ISO string)
