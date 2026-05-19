# Employee Time Tracker — Setup Guide

## 1. Install dependencies

```bash
cd employee-time-tracker
npm install
```

## 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Where to find it |
|---|---|
| `AZURE_AD_CLIENT_ID` | Azure Portal → App registrations → your app → Overview |
| `AZURE_AD_CLIENT_SECRET` | App registrations → Certificates & secrets → New client secret |
| `AZURE_AD_TENANT_ID` | Azure Portal → App registrations → your app → Overview |
| `NEXTAUTH_SECRET` | Run: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3000` for dev, your domain for production |
| `ADMIN_EMAILS` | Comma-separated list of admin email addresses |

## 3. Azure AD App Registration (step-by-step)

1. Go to [portal.azure.com](https://portal.azure.com) → **Azure Active Directory** → **App registrations** → **New registration**
2. Name: `Time Tracker` (or anything)
3. Supported account types: **Accounts in this organizational directory only**
4. Redirect URI: `Web` → `http://localhost:3000/api/auth/callback/azure-ad`
5. Click **Register**
6. Copy **Application (client) ID** → `AZURE_AD_CLIENT_ID`
7. Copy **Directory (tenant) ID** → `AZURE_AD_TENANT_ID`
8. Go to **Certificates & secrets** → **New client secret** → copy the value → `AZURE_AD_CLIENT_SECRET`
9. Go to **API permissions** → ensure `User.Read` (Microsoft Graph) is present → Grant admin consent

### For production deployment, also add:
- Redirect URI: `https://yourdomain.com/api/auth/callback/azure-ad`

## 4. Set up the database

```bash
# Create tables
npm run db:push

# Seed the 14 default tasks
npm run db:seed
```

## 5. Run the app

```bash
npm run dev
# Open http://localhost:3000
```

## 6. Set admin users

In `.env`, add admin emails:
```
ADMIN_EMAILS=you@yourcompany.com,manager@yourcompany.com
```

These users will automatically get the **Admin** role the next time they sign in.
To promote an existing user immediately, run:
```bash
npm run db:studio
# Open the User table and change role from "employee" to "admin"
```

## Production deployment

1. Change `DATABASE_URL` in `.env` to a PostgreSQL connection string
2. In `prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`
3. Run `npm run db:push` to create PostgreSQL tables
4. Run `npm run db:seed`
5. Deploy to Vercel, Azure App Service, or any Node.js host

## Features summary

| Feature | Details |
|---|---|
| Login | Azure AD (Microsoft) sign-in with employee emails |
| Log time | 14 pre-defined tasks + add custom tasks |
| Time format | Type `30m`, `1h`, `1:30`, or `1.5` |
| Edit entries | Change any entry inline — click Save All |
| History | Browse past entries by date range |
| Admin panel | See all employees, who submitted vs who hasn't |
| Export | CSV export per day from admin panel |
