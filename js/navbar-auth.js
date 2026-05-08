import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
import firebaseConfig from "./firebaseConfig.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let authReady = false;
let isLoggedInState = false;

function normalizeRole(role) {
    return String(role || "user").toLowerCase().trim();
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
    return /hereramin\/index\.html|pages\/receipts\/|pages\/i-tanim\/user\.html|pages\/i-tanim\/admin\.html|\/i-tanim\/user\.html|\/i-tanim\/admin\.html/i.test(href);
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
        return;
    }

    // User is logged in - show Dashboard and Logout
    const dashboardHref = resolveDashboardUrl(role);
    navRight.innerHTML = `
        <a class="nav-auth-link" href="${dashboardHref}">Dashboard</a>
        <button class="nav-auth-link nav-auth-button" type="button" id="globalLogoutBtn">Logout</button>
    `;

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
                projectsEl.textContent = snap.size;
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
