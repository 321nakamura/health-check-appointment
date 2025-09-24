# Custom Web Reservation Form (Static)

This is a static reservation form you can deploy on GitHub Pages or any static hosting.

## Files
- `index.html` — main UI
- `app.js` — logic for slots, booking, CSV export
- `styles.css` — minimal styles (vanilla CSS)
- `slots.json` — example schedule with capacities per time slot
- `admin_password.txt` — (optional) simple shared secret for admin view (default: empty → no password)

## Key features
- Time-slot based booking with per-slot capacity and live remaining count
- Works fully static (no backend): data stored in `localStorage`
- Admin mode (`?admin=1`) for CSV export & reset
- CSV export: bookings_YYYYMMDD.csv
- Input validation & consent checkbox
- Simple anti-duplicate check (phone+email per slot)
- Japanese UI texts

## How to deploy (GitHub Pages)
1. Create a new repository (public): e.g., `booking-form`.
2. Upload these files to the repo root.
3. In GitHub settings → Pages → Deploy from branch (main / root).
4. Open your GitHub Pages URL to use the form.

## How to edit schedule
- Edit `slots.json`:
  - `date`: "YYYY/MM/DD"
  - `slots`: array of `{{"start": "HH:MM", "end": "HH:MM", "capacity": number}}`
- Multiple dates are allowed (array). The form shows a date picker.

## Notes / Limitations
- Because this is fully static, capacities are tracked per browser unless you use the admin "Export/Import" to sync data manually.
- For multi-user, online capacity control, you need a small backend (Google Apps Script webhook or Supabase). This version keeps things simple per your original request.
