# Naomi Tours and Travels — Booking App

This is a server-backed web app starter for Naomi Tours and Travels, Pune.

## Included
- Public customer booking page (no admin dashboard link exposes booking data)
- Private owner login backed by server-side session and password hash
- SQLite database for persistent bookings and owner-configurable rates
- Five services: Airport pickup/drop, Local Pune, Outstation, Full-day rental, Corporate
- Booking request -> owner confirms final fare -> mark Completed
- PDF receipt with no GST field and no signature
- SMTP email sends the PDF invoice to the customer email when owner marks the trip Completed
- CSV export, responsive page, Marathi/English language toggle (labels partially translated)
- Rate limiting on login and booking endpoints, HTTP security headers

## Run locally (Windows)
1. Install Node.js 20 or newer from https://nodejs.org/
2. Extract this ZIP to a folder.
3. Open Command Prompt / PowerShell in the extracted folder.
4. Run: `npm install`
5. Copy `.env.example` to `.env`.
6. Edit `.env`:
   - Set a long, unique `ADMIN_PASSWORD`.
   - Set a long random `SESSION_SECRET`.
   - Configure real SMTP details (see below) for automatic invoice email.
7. Run: `npm start`
8. Open `http://localhost:3000`

## Email setup
The app sends the PDF invoice only when the owner changes a booking status to Completed.
Configure these values in `.env` from your email provider:
- `SMTP_HOST`
- `SMTP_PORT` (often 587)
- `SMTP_SECURE` (`false` for STARTTLS on 587; often `true` on 465)
- `SMTP_USER`
- `SMTP_PASS` (use a provider app password where required)
- `MAIL_FROM`

If SMTP is not configured or delivery fails, the app marks the trip Completed and displays an error instead of claiming that email was sent.

## Production deployment checklist
This ZIP is application source, not a live hosted website. To serve real customers:
- Deploy to a Node.js host that supports persistent disk/storage for `naomi.sqlite`.
- Add environment variables through the host's secret settings; do not upload `.env`.
- Use HTTPS and set `NODE_ENV=production`.
- Set a strong `SESSION_SECRET` and unique admin password.
- Configure SMTP and test delivery to a real email address.
- Use persistent storage and backups for SQLite. For multi-instance hosting, use managed database/session storage.
- Set the hosting provider's session store instead of Express MemoryStore for production scale.
- Add a proper Marathi-font PDF font if Marathi content is ever included in invoices.
- Verify local tax/invoice requirements with an accountant; this app intentionally omits GST fields and signature as requested, but this does not determine whether GST or other legal details are required.

## Important
- Owner dashboard APIs require server-side login. The password is not stored in browser JavaScript.
- This is a deployable starter app; it is not automatically hosted by creating this ZIP.
- Do not use real customer data until you configure credentials, SMTP, HTTPS and persistent hosting.
