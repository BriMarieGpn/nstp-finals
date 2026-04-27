import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
import firebaseConfig from "./i-tanim/firebaseConfig.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let authReady = false;
let isLoggedInState = false;

// Detect current page location to determine proper relative paths
function getPathContext() {
    const path = window.location.pathname.toLowerCase();
    
    if (path.includes("/i-tanim/") || path.includes("\\i-tanim\\")) {
        return { context: "itanim-portal", depth: 4 };
    } else if (path.includes("/hereramin/")) {
        return { context: "hereramin", depth: 1 };
    } else if (path.includes("/greencommunity/")) {
        return { context: "greencommunity", depth: 1 };
    } else if (path.includes("/pages/")) {
        return { context: "pages", depth: 2 };
    }
    
    return { context: "root", depth: 0 };
}

function buildPath(relativePath, pathContext) {
    const { context, depth } = pathContext;
    
    if (context === "itanim-portal") {
        return "../../../../" + relativePath;
    } else if (context === "hereramin" || context === "greencommunity") {
        return "../" + relativePath;
    } else if (context === "pages") {
        return "../../" + relativePath;
    }
    
    return relativePath;
}

const pathContext = getPathContext();

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
        path.includes("/pages/i-tanim/user") ||
        path.includes("/pages/i-tanim/admin") ||
        (path.includes("/i-tanim/") && (path.includes("user.html") || path.includes("admin.html")))
    );
}

function isProtectedHref(href) {
    return /hereramin\/index\.html|pages\/receipts\/|pages\/i-tanim\/user\.html|pages\/i-tanim\/admin\.html|\/i-tanim\/user\.html|\/i-tanim\/admin\.html|user\.html|admin\.html/i.test(href);
}

function resolveLoginUrl() {
    const { context } = pathContext;
    
    if (context === "itanim-portal") {
        return "login.html";
    } else if (context === "pages") {
        return "login.html";
    } else if (context === "hereramin" || context === "greencommunity") {
        return buildPath("I-TANIM/nstp-finals-G3V2.0/Group 3/src/login.html", pathContext);
    }
    
    return buildPath("I-TANIM/nstp-finals-G3V2.0/Group 3/src/login.html", pathContext);
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
        const loginHref = buildPath("I-TANIM/nstp-finals-G3V2.0/Group 3/src/login.html", pathContext);
        const signupHref = buildPath("I-TANIM/nstp-finals-G3V2.0/Group 3/src/signup.html", pathContext);

        navRight.innerHTML = `
            <a class="nav-auth-link" href="${loginHref}">Login</a>
            <a class="nav-auth-link" href="${signupHref}">Register</a>
        `;
        return;
    }

    const { context } = pathContext;
    let dashboardHref;
    
    if (context === "itanim-portal") {
        dashboardHref = "user.html";
    } else if (context === "pages") {
        dashboardHref = "user.html";
    } else {
        dashboardHref = buildPath("I-TANIM/nstp-finals-G3V2.0/Group 3/src/user.html", pathContext);
    }

    navRight.innerHTML = `
        <a class="nav-auth-link" href="${dashboardHref}" title="View Dashboard">Dashboard</a>
        <button class="nav-auth-link nav-auth-button" type="button" id="globalLogoutBtn">Logout</button>
    `;

    document.getElementById("globalLogoutBtn")?.addEventListener("click", async () => {
        try {
            await signOut(auth);
            const loginHref = buildPath("I-TANIM/nstp-finals-G3V2.0/Group 3/src/login.html", pathContext);
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
