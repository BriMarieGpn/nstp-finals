# Tech Stack

## Frontend
- Vanilla HTML, CSS, JavaScript (ES modules) — no build step, no bundler
- Font: Poppins (Google Fonts implied by CSS usage)
- No frontend framework (no React, Vue, etc.)

## Backend / Infrastructure
- **Firebase Hosting** — serves the `src/` directory as the public root
- **Firebase Auth** — email/password + Google OAuth sign-in
- **Cloud Firestore** — primary database (real-time listeners via `onSnapshot`)
- **Firebase Storage** — used for program image uploads in `index.js`

## Firebase SDK
- Loaded via CDN (`https://www.gstatic.com/firebasejs/`)
- `index.js` and `user.js` use SDK version **10.7.1**
- `admin.js` and `login.html`/`signup.html` use SDK version **12.12.0**
- Imported as ES modules directly in `<script type="module">` tags

## Firestore Collections
| Collection | Purpose |
|---|---|
| `volunteers/{uid}` | Volunteer profiles (role, status, hours, programs) |
| `programs_empty/{id}` | Program documents synced from admin state |
| `admin/state` | Single document holding users, programs, certs, skills, restrictions, badges, notifications |

## Local Storage Keys (offline/localhost fallback)
| Key | Contents |
|---|---|
| `itanimUsers` | Volunteer array |
| `itanimPrograms` | Program array |
| `itanimCerts` | Certifications array |
| `itanimSkills` | Skills array |
| `itanimRestrictions` | Age/barangay restrictions object |
| `itanimBadges` | Badge threshold object |
| `itanimNotifications` | Notifications array |
| `itanimAdminLogs` | Activity log entries |
| `growsauyouRoleCache` | `{ uid, role }` — cached role to avoid Firestore round-trips |
| `growsauyouProfileCache` | Cached volunteer profile object |

## Deployment
```bash
# Deploy hosting only
firebase deploy --only hosting

# Deploy Firestore rules only
firebase deploy --only firestore:rules

# Deploy everything
firebase deploy
```

## Local Development
Open `src/index.html` directly via a local server (e.g. VS Code Live Server).  
On `localhost`/`127.0.0.1`, the app switches to **local program storage mode** — programs are read/written to `localStorage` instead of Firestore. Auth and volunteer profiles still use Firestore.

Local test accounts (localhost only):
- `admin@test.local` / `test123`
- `user@test.local` / `test123`
