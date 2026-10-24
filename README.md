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


## Booking notifications (Resend + Twilio)

When a booking is saved, the server attempts to send an email to the customer and owner, an SMS to the customer and owner, and a WhatsApp message to the customer and owner. Notification failures are logged in Render Logs and do not cancel the saved booking. Configure these values in Render → service → Environment:

- `OWNER_EMAIL=naomitoursntravels@gmail.com`
- `OWNER_PHONE=7972899919` (replace if the owner wants a different mobile)
- `RESEND_API_KEY` and `MAIL_FROM` (sender must be verified in Resend; use a domain you own and verify it for customer delivery)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM` (a Twilio SMS-capable sender)
- `TWILIO_WHATSAPP_FROM` (approved WhatsApp sender, or `whatsapp:+14155238886` for Twilio Sandbox testing)

### Provider setup and important restrictions

1. Create a Resend account, add and verify a domain you control, create an API key, and set `MAIL_FROM` to an address on that verified domain. Without a verified sender/domain, customer email delivery may be rejected. The Resend test sender is only for limited testing, not general customer delivery.
2. Create a Twilio account and configure an SMS-capable sender. Trial accounts may only send to verified recipient numbers and messages may include trial limitations; paid messaging charges apply.
3. For WhatsApp sandbox testing, join the Twilio Sandbox from each test recipient by sending the exact join phrase shown in the Twilio Console. For production, set up and approve a WhatsApp sender/templates. Business-initiated WhatsApp messages may require approved templates and applicable user consent.
4. Obtain customer consent before sending marketing messages. These are transactional booking updates only; do not message people who have not supplied the contact details for the booking.
5. After setting variables, commit code changes to GitHub and deploy the latest commit on Render. Test using your own email and phone first. Review Render Logs for `[notify] ... sent` or failure details. Never share provider API keys in GitHub or chat.

Render Free instances can sleep, and their local filesystem is ephemeral; this starter's SQLite database is not suitable for production booking records on Render Free. Add persistent/managed database storage before accepting real bookings.
