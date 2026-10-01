# Recovery HQ — Credit Recovery War Room

Next.js 15 (UI + API in one project) · MongoDB (Mongoose) · deploys to Vercel as-is.

## What it does
- **Roles**: CEO (everything) and Staff with toggles — *Collector* (gets assigned groups, records payments) and/or *Data entry* (adds customers).
- **Customers**: AR value, credit start date, credit period → due date auto-calculated. Days since credit start, days overdue, aging. Paste-import from Excel/CSV.
- **Group & Assign (CEO)**: drag customers (or multi-select and drag many) into a group, set collect-from / deadline dates, assign 1+ collectors. Assigned customers are locked; click *Edit* to drag in/out again. Close a group to release unpaid customers back to the pool.
- **Collectors**: see only their assigned customers; record partial payments (200, 200, 200 … every one is logged with date/time) or *Not collected* with reason + promise date.
- **CEO dashboard (live, refreshes every 15 s)**: date range presets + custom, KPI cards, aging with editable 30/60/90(+add) values, single-KPI-by-multiple-dimensions card (Outstanding/Overdue/Collected/AR × Aging/Collector/Group/Customer/Credit period), daily trend, team ranking vs daily targets (🔴🟡🟢), group progress with who collected when / who missed / deadline passed, full customer table, live activity, promises due today, one-click **WhatsApp report**.
- **Users & Log Time**: login time, last activity, logout, used time, auto-logout count, device/IP, online now.
- **Security**: bcrypt passwords, httpOnly JWT cookie + server session; **auto logout after 30 min idle** (browser timer with 60 s warning *and* server-side check, so an unattended open tab is also expired).

## AR master import (Excel)
Customers → **Import AR master (Excel)** (CEO). Upload the .xlsx, pick the sheet (auto-picks “Master File”), check the column mapping, review the preview (company totals, file-total check, credit notes, “already collected” lines), keep **Remove old data first** ticked, import.
- One customer per company + customer name, with every invoice line kept (aging is per invoice).
- Credit notes / unapplied payments are set off against the customer's oldest invoices; customers whose credits exceed invoices are stored as *credit balance* so totals reconcile with the file.
- Lines marked “Already collected” are recorded as payments on the file's “as of” date.
- Settings → **Remove all customer data** wipes customers, groups, payments and promises (users stay).

## Promise to pay
Collector (or CEO) taps **Promise** on a customer: amount + date (e.g. 1,000 on 5 Oct). It is *not* collected — the dashboard shows it as minus in aging (outstanding − promised = net to chase), in the **Promised to pay / Broken promises** KPI cards and in the **Promise-to-pay tracker** (due today, next 7 days, broken, kept, keep-rate, 14-day inflow). When payments arrive they are matched to the oldest promise automatically and it turns *Kept*.

## Run locally
```bash
npm install
cp .env.example .env.local   # fill MONGODB_URI, JWT_SECRET, SETUP_KEY
npm run dev                   # http://localhost:3000 → /setup creates the CEO
```

## Deploy to Vercel
1. MongoDB Atlas → create a free cluster → Database Access: add a user → Network Access: allow `0.0.0.0/0` (Vercel IPs change) → Connect → Drivers → copy the URI and put `/recovery_hq` as the DB name.
2. Push this folder to GitHub → Vercel → *Add New Project* → import it (framework auto-detected: Next.js).
3. In **Settings → Environment Variables** add `MONGODB_URI`, `JWT_SECRET` (long random string), `SETUP_KEY`, `IDLE_MINUTES=30`.
4. Deploy → open `https://your-app.vercel.app/setup` → create the CEO account (needs SETUP_KEY) → sign in.
5. Optional: Settings → *Load demo data* to try everything (collectors: ruwan, nimali, kasun, dilani, suresh / `pass1234`; data entry: entry / `pass1234`).

## Structure
```
app/api/*          REST API (auth, users, customers, groups, collections, dashboard, my, sessions, settings, seed)
app/(app)/*        pages: dashboard, groups, customers, my, users, settings
app/login, setup   public pages
components/*       UI kit, drawers, charts, tables
lib/*              db, auth, jwt, metrics (aging / targets maths), formatting
models/index.js    Mongoose schemas: User, Customer, Group, Collection, Session, Setting
middleware.js      redirects signed-out users to /login
```
