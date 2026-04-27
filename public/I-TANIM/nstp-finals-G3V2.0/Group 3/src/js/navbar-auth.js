import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
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
    return path.includes("user.html") || path.includes("admin.html");
}

function isProtectedHref(href) {
    return /user\.html|admin\.html/i.test(href);
}

function resolveLoginUrl() {
    const fromNav = document.querySelector(".nav-auth-link[href*='login.html']")?.getAttribute("href");
    if (fromNav) {
        return new URL(fromNav, window.location.href).toString();
    }
    return "login.html";
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
        link.addEventListener("click", (event) => {
            if (!authReady) {
                event.preventDefault();
                window.location.href = resolveLoginUrl();
                return;
            }

            if (isLoggedInState) {
                return;
            }

            event.preventDefault();
            window.location.href = resolveLoginUrl();
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
        const loginHref = pageName === "login.html" ? "login.html" : navRight.querySelector("a[href*='login.html']")?.getAttribute("href") || "login.html";
        const signupHref = pageName === "signup.html" ? "signup.html" : navRight.querySelector("a[href*='signup.html']")?.getAttribute("href") || "signup.html";

        navRight.innerHTML = `
            <a class="nav-auth-link" href="${loginHref}">Login</a>
            <a class="nav-auth-link" href="${signupHref}">Register</a>
        `;
        return;
    }

    navRight.innerHTML = `
        <a class="nav-auth-link" href="user.html" title="View Dashboard">Dashboard</a>
        <button class="nav-auth-link nav-auth-button" type="button" id="globalLogoutBtn">Logout</button>
    `;

    document.getElementById("globalLogoutBtn")?.addEventListener("click", async () => {
        try {
            await signOut(auth);
            const loginHref = navRight.querySelector("a[href*='login.html']")?.getAttribute("href") || "login.html";
            window.location.href = loginHref;
        } catch (error) {
            console.error("Logout failed", error);
            alert("Logout failed. Please try again.");
        }
    });
}

wireBackButtons();
attachProtectedLinkGuards();

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
