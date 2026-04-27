import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import firebaseConfig from "./firebaseConfig.js";

(function () {
    const BORROW_RECORD_KEY = "growsauyou-borrow-record";
    const BORROW_HISTORY_KEY = "growsauyou-borrow-history";
    const BORROW_DOC_PATH = ["hereramin", "latestBorrow"];
    const BORROW_REQUESTS_COLLECTION = "borrow_requests";
    const adminReceiptsList = document.getElementById("adminReceiptsList");
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const useFirestore = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
    let borrowRecords = [];

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
                            <img src="${record.tool?.image || "../../assets/images/shovel.png"}" alt="${record.tool?.name || "Tool"}">
                        </div>
                        <div class="admin-meta">
                            <h3>${record.tool?.name || "Tool"}</h3>
                            <p>Requested by: ${record.borrower?.name || "N/A"}</p>
                            <p>Qty: ${record.tool?.quantity || 1}</p>
                        </div>
                    </div>
                    <div class="admin-actions">
                        <button type="button" class="status-action admin-btn neutral" data-state-id="${record.id}" data-next-state="return_pending">Mark Pending</button>
                        <button type="button" class="status-action admin-btn approve" data-state-id="${record.id}" data-next-state="return_approved">Approve Return</button>
                        <button type="button" class="status-action admin-btn reject" data-state-id="${record.id}" data-next-state="return_rejected">Reject Return</button>
                    </div>
                    <p class="admin-note">${state.note}</p>
                </article>
            `;
        }).join("");
    }

    adminReceiptsList.addEventListener("click", async (event) => {
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

    async function init() {
        let loadedRecords = loadBorrowHistory();

        if (useFirestore) {
            try {
                const snapshot = await getDocs(collection(db, BORROW_REQUESTS_COLLECTION));
                const firestoreRecords = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
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

        borrowRecords = loadedRecords.map((record, index) => ({
            id: record.id || `borrow-local-${index}`,
            status: record.status || "in_use",
            ...record
        }));
        renderRecords();
    }

    init();
})();
