import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
import firebaseConfig from "./firebaseConfig.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let authReady = false;
let isLoggedInState = false;
let hasResolvedAuth = false;

function normalizeRole(role) {
    return String(role || "user").toLowerCase().trim();
}

function revealApp() {
    if (hasResolvedAuth) return;
    hasResolvedAuth = true;
    document.body.classList.remove('auth-pending');
    // Also directly hide the gate so CSS transitions can't block it
    const gate = document.getElementById('authLoadingGate');
    if (gate) { 
        gate.style.opacity = '0'; 
        gate.style.visibility = 'hidden'; 
        gate.style.pointerEvents = 'none'; 
    }
    const content = document.getElementById('appContent');
    if (content) { 
        content.style.opacity = '1'; 
        content.style.pointerEvents = ''; 
    }
}

async function getProfile(user) {
    if (!user) {
        return null;
    }

    try {
        let userDoc = await getDoc(doc(db, "volunteers", user.uid));
        if (!userDoc.exists() && user.email) {
            const fallbackQuery = query(collection(db, "volunteers"), where("email", "==", user.email));
            const fallbackSnap = await getDocs(fallbackQuery);
            if (!fallbackSnap.empty) {
                userDoc = fallbackSnap.docs[0];
            }
        }

        if (userDoc.exists()) {
            return userDoc.data();
        }
    } catch (error) {
        console.warn("Could not load navbar profile", error);
    }

    return { role: "user" };
}

function getCurrentPageName() {
    const path = window.location.pathname.replace(/\\/g, "/");
    return path.split("/").pop() || "index.html";
}

function isProtectedCurrentPage() {
    const path = window.location.pathname.replace(/\\/g, "/").toLowerCase();
    return (
        path.includes("/hereramin/") ||
        path.includes("/pages/receipts/") ||
        path.endsWith("/pages/i-tanim/user.html") ||
        path.endsWith("/pages/i-tanim/admin.html")
    );
}

function isProtectedHref(href) {
    return /hereramin\/index\.html|hereramin\/admin\.html|pages\/receipts\/|pages\/i-tanim\/user\.html|pages\/i-tanim\/admin\.html|\/i-tanim\/user\.html|\/i-tanim\/admin\.html/i.test(href);
}

function buildAppUrl(path) {
    return new URL(path, window.location.origin).toString();
}

function resolveLoginUrl() {
    return buildAppUrl('/pages/i-tanim/login.html');
}

function resolveSignupUrl() {
    return buildAppUrl('/pages/i-tanim/signup.html');
}

function resolveDashboardUrl(role) {
    return buildAppUrl(role === 'admin' ? '/pages/i-tanim/admin.html' : '/pages/i-tanim/user.html');
}

function attachProtectedLinkGuards() {
    const protectedLinks = Array.from(document.querySelectorAll("a[href]")).filter((link) => {
        const href = link.getAttribute("href") || "";
        return isProtectedHref(href);
    });

    protectedLinks.forEach((link) => {
        if (link.dataset.authGuardBound === "true") {
            return;
        }

        link.dataset.authGuardBound = "true";
        link.addEventListener("click", async (event) => {
            // Check authentication status before navigation
            if (!authReady) {
                event.preventDefault();
                window.location.href = resolveLoginUrl();
                return;
            }

            // Re-check auth state to ensure session is still valid
            const currentUser = auth.currentUser;
            if (!currentUser) {
                event.preventDefault();
                window.location.href = resolveLoginUrl();
                return;
            }

            // Additional check: verify user still exists in database
            try {
                const profile = await getProfile(currentUser);
                if (!profile) {
                    event.preventDefault();
                    await signOut(auth);
                    window.location.href = resolveLoginUrl();
                    return;
                }
            } catch (error) {
                console.warn("Session validation failed", error);
                event.preventDefault();
                await signOut(auth);
                window.location.href = resolveLoginUrl();
                return;
            }
        });
    });
}

function wireBackButtons() {
    document.querySelectorAll(".subpage-back, .backLink").forEach((button) => {
        if (button.dataset.backBound === "true") {
            return;
        }

        button.dataset.backBound = "true";
        button.dataset.fallbackHref = button.getAttribute("href") || "";

        button.addEventListener("click", (event) => {
            const fallbackHref = button.dataset.fallbackHref;
            const sameOriginReferrer = document.referrer && new URL(document.referrer).origin === window.location.origin;

            if (sameOriginReferrer && window.history.length > 1) {
                event.preventDefault();
                window.history.back();
                return;
            }

            if (!fallbackHref) {
                event.preventDefault();
            }
        });
    });
}

function renderNavRight(user, role) {
    const navRight = document.querySelector(".nav-right");
    if (!navRight) {
        return;
    }

    const pageName = getCurrentPageName();
    if (!user) {
        const loginHref = pageName === "login.html" ? buildAppUrl('/pages/i-tanim/login.html') : resolveLoginUrl();
        const signupHref = pageName === "signup.html" ? buildAppUrl('/pages/i-tanim/signup.html') : resolveSignupUrl();

        navRight.innerHTML = `
            <a class="nav-auth-link" href="${loginHref}">Login</a>
            <a class="nav-auth-link" href="${signupHref}">Register</a>
        `;

        // Hide admin link if exists
        const adminLink = document.getElementById("adminLink");
        if (adminLink) adminLink.style.display = "none";

        return;
    }

    // User is logged in - show Dashboard and Logout
    const dashboardHref = resolveDashboardUrl(role);
    const adminHref = buildAppUrl('/hereramin/admin.html');
    navRight.innerHTML = `
        <a class="nav-auth-link" href="${dashboardHref}">Dashboard</a>
        ${role === 'admin' ? `<a class="nav-auth-link" href="${adminHref}">Admin</a>` : ''}
        <button class="nav-auth-link nav-auth-button" type="button" id="globalLogoutBtn">Logout</button>
    `;

    // Show admin link for hereramin if user is admin
    const adminLink = document.getElementById("adminLink");
    if (adminLink) {
        adminLink.style.display = role === 'admin' ? "inline-block" : "none";
        if (role === 'admin') {
            adminLink.href = adminHref;
        }
    }

    document.getElementById("globalLogoutBtn")?.addEventListener("click", async () => {
        try {
            await signOut(auth);
            window.location.href = resolveLoginUrl();
        } catch (error) {
            console.error("Logout failed", error);
            alert("Logout failed. Please try again.");
        }
    });
}

wireBackButtons();
attachProtectedLinkGuards();

// Periodic session validation (every 5 minutes)
setInterval(async () => {
    if (auth.currentUser && authReady) {
        try {
            const profile = await getProfile(auth.currentUser);
            if (!profile) {
                console.warn("Session expired - user profile not found");
                await signOut(auth);
                window.location.href = resolveLoginUrl();
            }
        } catch (error) {
            console.warn("Session validation failed", error);
            await signOut(auth);
            window.location.href = resolveLoginUrl();
        }
    }
}, 5 * 60 * 1000); // 5 minutes

// Function to update main page stats
function updateMainPageStats() {
    const projectsEl = document.getElementById('mainProjectsCount');
    const membersEl = document.getElementById('mainCommunityMembersCount');
    
    if (!projectsEl && !membersEl) {
        return; // Not on main page
    }

    // Update projects count
    if (projectsEl) {
        onSnapshot(
            collection(db, 'programs'),
            (snap) => {
                const activePrograms = snap.docs.filter(doc => {
                    const data = doc.data();
                    return data.status !== 'archived';
                });
                projectsEl.textContent = activePrograms.length;
            },
            (err) => {
                console.warn('Could not load projects count', err);
                projectsEl.textContent = '—';
            }
        );
    }

    // Update community members count
    if (membersEl) {
        onSnapshot(
            collection(db, 'volunteers'),
            (snap) => {
                const count = snap.size;
                membersEl.textContent = count > 100 ? '100+' : count.toString();
            },
            (err) => {
                console.warn('Could not load volunteers count', err);
                membersEl.textContent = '—';
            }
        );
    }
}

// Wait for DOM to be ready before setting up auth listener
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupAuth();
        updateMainPageStats();
    });
} else {
    setupAuth();
    updateMainPageStats();
}

// Hard fallback: if auth gate is still showing after 3s, reveal anyway
setTimeout(() => {
    if (document.body.classList.contains('auth-pending')) {
        console.warn('[navbar-auth] Auth gate fallback triggered after 3s');
        revealApp();
    }
}, 3000);

function setupAuth() {
    onAuthStateChanged(auth, async (user) => {
        authReady = true;
        isLoggedInState = Boolean(user);
        const profile = await getProfile(user);
        const role = normalizeRole(profile?.role || "user");

        renderNavRight(user, role);
        attachProtectedLinkGuards();

        if (!user && isProtectedCurrentPage()) {
            window.location.href = resolveLoginUrl();
        }

        // Reveal app after auth is resolved
        revealApp();
    });
}

// Function to handle Explore Programs button click
window.explorePrograms = async function() {
    if (!authReady) {
        // If auth is not ready yet, redirect to index as visitor
        window.location.href = "pages/i-tanim/index.html";
        return;
    }

    const user = auth.currentUser;
    if (user) {
        // User is signed in, redirect to i-tanim index as user
        window.location.href = "pages/i-tanim/index.html";
    } else {
        // User is not signed in, redirect to i-tanim index as visitor
        window.location.href = "pages/i-tanim/index.html";
    }
};
