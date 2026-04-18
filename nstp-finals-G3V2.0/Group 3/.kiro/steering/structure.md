# Project Structure

```
/
├── firebase.json          # Firebase Hosting + Firestore config (public dir = src/)
├── firestore.rules        # Firestore security rules
├── .firebaserc            # Firebase project alias (growsauyou)
└── src/                   # Everything here is served publicly
    ├── index.html         # Home page — program listing, visitor/user/admin entry point
    ├── login.html         # Login page (email + Google OAuth) — inline <script type="module">
    ├── signup.html        # Volunteer registration — inline <script type="module">
    ├── user.html          # Volunteer dashboard (hours, programs, badges, certs)
    ├── admin.html         # Admin panel (tabbed: dashboard, volunteers, programs, analytics, etc.)
    ├── 404.html           # Firebase Hosting 404 page
    ├── css/
    │   ├── common.css     # Shared design tokens (CSS vars), navbar, buttons, stat cards
    │   ├── home.css       # Home page specific styles (carousel, cards, program list)
    │   ├── style.css      # Login/signup page styles
    │   ├── user.css       # User dashboard styles
    │   └── admin.css      # Admin panel styles
    └── js/
        ├── firebaseConfig.js  # Firebase app config — imported by all JS modules
        ├── index.js           # Home page logic (auth, program listing, join flow)
        ├── user.js            # Volunteer dashboard logic (Firestore listeners, skills, certs)
        └── admin.js           # Admin panel logic (volunteer mgmt, program CRUD, analytics)
```

## Conventions

- Each page has one corresponding JS file loaded as `<script type="module" src="js/*.js">`, except `login.html` and `signup.html` which use inline module scripts
- `firebaseConfig.js` is the single source of truth for Firebase credentials — always import it, never duplicate config
- All JS files initialize their own Firebase app instance via `initializeApp(firebaseConfig)`
- CSS custom properties are defined in `common.css` under `:root` — always use these tokens, never hardcode colors
- The `auth-pending` class on `<body>` hides content until auth state resolves; call `revealApp()` to remove it
- Role is normalized to lowercase via `normalizeRole()` before any comparison — never compare raw role strings
- Data flows: Firestore → in-memory variables → render functions. Always re-render after mutating data
- `admin/state` is the canonical Firestore document for admin-managed data; `volunteers/{uid}` is per-user
- localStorage is the fallback when on localhost or when Firestore is unavailable — keep both in sync
- Activity events are logged to `itanimAdminLogs` in localStorage via `logActivityEvent()` / `logUserActivity()`
