import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, setDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import firebaseConfig from "./firebaseConfig.js";

(function () {
    const BORROW_RECORD_KEY = "growsauyou-borrow-record";
    const BORROW_HISTORY_KEY = "growsauyou-borrow-history";
    const BORROW_DOC_PATH = ["hereramin", "latestBorrow"];
    const BORROW_REQUESTS_COLLECTION = "borrow_requests";
    const adminReceiptsList = document.getElementById("adminReceiptsList");
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const useFirestore = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
    let borrowRecords = [];

    function isAdminEmail(email) {
        return String(email || '').toLowerCase().includes('admin');
    }

    // Check authentication and admin role
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            showPermissionDenied("You must be logged in to access this page.");
            return;
        }

        try {
            let userDoc = await getDoc(doc(db, 'volunteers', user.uid));
            if (!userDoc.exists()) {
                const fallbackQuery = query(collection(db, 'volunteers'), where('email', '==', user.email));
                const fallbackSnap = await getDocs(fallbackQuery);
                if (!fallbackSnap.empty) {
                    userDoc = fallbackSnap.docs[0];
                }
            }
            const role = userDoc.exists() ? String(userDoc.data().role || '').toLowerCase().trim() : 'user';
            if (role !== 'admin' && !isAdminEmail(user.email)) {
                showPermissionDenied("You do not have permission to access this admin page.");
                return;
            }

            // User is admin, proceed with loading data
            initializeAdminPanel();
        } catch (error) {
            console.error("Error checking admin role:", error);
            showPermissionDenied("Error verifying permissions. Please try again.");
        }
    });

    function showPermissionDenied(message) {
        document.body.classList.remove('auth-pending');
        const gate = document.getElementById('authLoadingGate');
        if (gate) {
            gate.style.opacity = '0';
            gate.style.visibility = 'hidden';
            gate.style.pointerEvents = 'none';
        }

        const main = document.querySelector('main.receipts-shell');
        if (main) {
            main.innerHTML = `
                <div class="permission-denied">
                    <h1>Access Denied</h1>
                    <p>${message}</p>
                    <div class="permission-actions">
                        <a href="user.html" class="user-view-link">Go to User View</a>
                        <a href="../i-tanim/login.html" class="login-link">Login</a>
                    </div>
                </div>
            `;
        }
    }

    function initializeAdminPanel() {
        // Load and initialize admin panel data
        loadBorrowHistory();
        loadBorrowRecords();
        renderRecords();
    }

    async function loadBorrowRecords() {
        let loadedRecords = loadBorrowHistory();

        if (useFirestore) {
            try {
                const snapshot = await getDocs(collection(db, BORROW_REQUESTS_COLLECTION));
                const firestoreRecords = snapshot.docs
                    .map((entry) => ({ id: entry.id, ...entry.data() }))
                    .filter((record) => record.deleted !== true);
                if (firestoreRecords.length > 0) {
                    loadedRecords = firestoreRecords;
                    saveBorrowHistory(loadedRecords);
                    localStorage.setItem(BORROW_RECORD_KEY, JSON.stringify(sortByCreatedAtDesc(loadedRecords)[0]));
                } else {
                    const borrowDocRef = doc(db, BORROW_DOC_PATH[0], BORROW_DOC_PATH[1]);
                    const latestSnap = await getDoc(borrowDocRef);
                    if (latestSnap.exists()) {
                        const latest = latestSnap.data();
                        loadedRecords = [latest];
                        saveBorrowHistory(loadedRecords);
                        localStorage.setItem(BORROW_RECORD_KEY, JSON.stringify(latest));
                    }
                }
            } catch (error) {
                console.warn("Could not load HERE-RAMIN record from Firestore.", error);
            }
        }

        if (!loadedRecords.length) {
            const fallbackLatest = localStorage.getItem(BORROW_RECORD_KEY);
            if (fallbackLatest) {
                try {
                    loadedRecords = [JSON.parse(fallbackLatest)];
                } catch (error) {
                    loadedRecords = [];
                }
            }
        }

        borrowRecords = loadedRecords
            .filter((record) => record.deleted !== true)
            .map((record, index) => ({
                id: record.id || `borrow-local-${index}`,
                status: record.status || "in_use",
                ...record
            }));
        renderRecords();
    }

    function loadBorrowHistory() {
        try {
            const raw = localStorage.getItem(BORROW_HISTORY_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function saveBorrowHistory(records) {
        localStorage.setItem(BORROW_HISTORY_KEY, JSON.stringify(records));
    }

    function sortByCreatedAtDesc(records) {
        return [...records].sort((a, b) => {
            const aTime = new Date(a.createdAt || 0).getTime();
            const bTime = new Date(b.createdAt || 0).getTime();
            return bTime - aTime;
        });
    }

    function resolveReceiptImage(imageValue) {
        const fallback = "../../assets/images/shovel.png";
        const raw = String(imageValue || "").trim();
        if (!raw) return fallback;
        if (raw.startsWith("data:")) return raw;
        if (/^https?:\/\//i.test(raw)) return raw;

        const cleaned = raw.replace(/^\.\//, "");
        if (cleaned.startsWith("../../") || cleaned.startsWith("../")) return cleaned;
        if (cleaned.startsWith("assets/images/")) return `../../${cleaned}`;
        if (!cleaned.includes("/")) return `../../assets/images/${cleaned}`;

        const baseName = cleaned.replace(/^.*[\\/]/, "");
        return `../../assets/images/${baseName}`;
    }

    function statusInfo(status) {
        if (status === "return_pending") return { label: "PENDING", note: "User requested a return. Review and approve/reject.", className: "pending" };
        if (status === "return_approved") return { label: "APPROVED", note: "Return approved. User can now borrow again.", className: "approved" };
        if (status === "return_rejected") return { label: "REJECTED", note: "Return rejected. User must follow up.", className: "rejected" };
        return { label: "IN USE", note: "Tool is currently borrowed and in use.", className: "" };
    }

    function renderRecords() {
        if (!borrowRecords.length) {
            adminReceiptsList.innerHTML = `<article class="admin-card"><p class="admin-note">No borrow requests yet.</p></article>`;
            return;
        }

        adminReceiptsList.innerHTML = sortByCreatedAtDesc(borrowRecords).map((record) => {
            const state = statusInfo(record.status || "in_use");
            return `
                <article class="admin-card">
                    <header class="admin-card-header">
                        <h2>Return Request</h2>
                        <span class="admin-status ${state.className}">${state.label}</span>
                    </header>
                    <div class="admin-card-body">
                        <div class="receipt-thumb admin-thumb">
                            <img src="${resolveReceiptImage(record.tool?.image)}" alt="${record.tool?.name || "Tool"}">
                        </div>
                        <div class="admin-meta">
                            <h3>${record.tool?.name || "Tool"}</h3>
                            <p>Requested by: ${record.borrower?.name || "N/A"}</p>
                            <p>Qty: ${record.tool?.quantity || 1}</p>
                        </div>
                    </div>
                    <div class="admin-actions">
                        <button type="button" class="status-action admin-btn neutral" data-state-id="${record.id}" data-next-state="in_use">Mark In Use</button>
                        <button type="button" class="status-action admin-btn neutral" data-state-id="${record.id}" data-next-state="return_pending">Mark Pending</button>
                        <button type="button" class="status-action admin-btn approve" data-state-id="${record.id}" data-next-state="return_approved">Approve Return</button>
                        <button type="button" class="status-action admin-btn reject" data-state-id="${record.id}" data-next-state="return_rejected">Reject Return</button>
                        <button type="button" class="status-action admin-btn danger" data-delete-id="${record.id}">Delete Record</button>
                    </div>
                    <p class="admin-note">${state.note}</p>
                </article>
            `;
        }).join("");
    }

    adminReceiptsList.addEventListener("click", async (event) => {
        const deleteButton = event.target.closest("[data-delete-id]");
        if (deleteButton) {
            const recordIdToDelete = deleteButton.getAttribute("data-delete-id");
            if (!recordIdToDelete) return;
            if (!window.confirm("Delete this receipt record? This cannot be undone.")) return;

            borrowRecords = borrowRecords.filter((record) => record.id !== recordIdToDelete);
            saveBorrowHistory(borrowRecords);
            renderRecords();

            if (useFirestore) {
                try {
                    await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, recordIdToDelete), { deleted: true, deletedAt: new Date().toISOString() }, { merge: true });
                } catch (error) {
                    console.warn("Could not mark receipt as deleted in Firestore.", error);
                }
            }
            return;
        }

        const button = event.target.closest("[data-state-id][data-next-state]");
        if (!button) {
            return;
        }
        const recordId = button.getAttribute("data-state-id");
        const nextState = button.getAttribute("data-next-state");
        if (!recordId || !nextState) {
            return;
        }

        borrowRecords = borrowRecords.map((record) => (
            record.id === recordId ? { ...record, status: nextState } : record
        ));
        saveBorrowHistory(borrowRecords);
        renderRecords();

        if (useFirestore) {
            try {
                await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, recordId), { status: nextState }, { merge: true });
            } catch (error) {
                console.warn("Could not update borrow status in Firestore.", error);
            }
        }
    });
})();
