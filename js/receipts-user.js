import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import firebaseConfig from "./firebaseConfig.js";

(function () {
    const BORROW_RECORD_KEY = "growsauyou-borrow-record";
    const BORROW_HISTORY_KEY = "growsauyou-borrow-history";
    const BORROW_DOC_PATH = ["hereramin", "latestBorrow"];
    const BORROW_REQUESTS_COLLECTION = "borrow_requests";
    const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
    const receiptsList = document.getElementById("receiptsList");
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const useFirestore = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
    let activeTab = "borrowing";
    let borrowRecords = [];

    function setActiveTab(tabName) {
        activeTab = tabName;
        tabButtons.forEach((button) => {
            button.classList.toggle("active", button.dataset.tab === tabName);
        });
        renderRecords();
    }

    function loadBorrowHistory() {
        try {
            const raw = localStorage.getItem(BORROW_HISTORY_KEY);
            if (!raw) {
                return [];
            }
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

    function getStatus(record) {
        return record.status || "in_use";
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

    function getTabPanelHtml(record) {
        const status = getStatus(record);
        if (activeTab === "borrowing") {
            const showReturnBtn = status === "in_use";
            return `
                <div class="tab-panel active">
                    <h3>${status === "return_pending" ? "RETURN PENDING" : status === "return_approved" ? "RETURN APPROVED" : status === "return_rejected" ? "RETURN REJECTED" : "IN USE"}</h3>
                    ${showReturnBtn ? `<button type="button" class="status-action return-btn" data-return-id="${record.id}">RETURN <i class="fas fa-angle-right"></i></button>` : ""}
                </div>
            `;
        }

        if (activeTab === "returned") {
            const note = status === "return_pending"
                ? "Please wait for the admin update"
                : status === "return_approved"
                    ? "The admin approved your return."
                    : status === "return_rejected"
                        ? "Your return needs revision. Please contact admin."
                        : "No return request yet.";
            const title = status === "return_approved" ? "APPROVED" : status === "return_rejected" ? "REJECTED" : "RETURNED";
            return `
                <div class="tab-panel active">
                    <h3>${title}</h3>
                    <div class="status-note">${note}</div>
                </div>
            `;
        }

        const approved = status === "return_approved";
        return `
            <div class="tab-panel active">
                <h3>${approved ? "APPROVED!" : "FOR APPROVAL"}</h3>
                <div class="status-note">${approved ? "You can now borrow again." : "Wait for admin's approval"}</div>
                <a class="status-action borrow-again-btn ${approved ? "ready" : "disabled"}" href="${approved ? "../../hereramin/index.html" : "#"}" aria-disabled="${approved ? "false" : "true"}"><i class="fas fa-angle-left"></i> Borrow tool again</a>
            </div>
        `;
    }

    function renderRecords() {
        if (!borrowRecords.length) {
            receiptsList.innerHTML = `<article class="receipt-item"><div class="receipt-meta"><h2>NO BORROWS YET</h2><p>Create a HERE-RAMIN request first.</p></div></article>`;
            return;
        }

        receiptsList.innerHTML = sortByCreatedAtDesc(borrowRecords).map((record) => `
            <article class="receipt-item">
                <div class="receipt-tool">
                    <div class="receipt-thumb">
                        <img src="${resolveReceiptImage(record.tool?.image)}" alt="${record.tool?.name || "Tool"}">
                    </div>
                    <div class="receipt-meta">
                        <h2>${(record.tool?.name || "Tool").toUpperCase()}</h2>
                        <p>Requested by: ${record.borrower?.name || "N/A"}</p>
                        <p>Qty: ${record.tool?.quantity || 1}</p>
                    </div>
                </div>
                <div class="receipt-status">
                    ${getTabPanelHtml(record)}
                </div>
            </article>
        `).join("");
    }

    tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
            setActiveTab(button.dataset.tab);
        });
    });

    receiptsList.addEventListener("click", async (event) => {
        const returnBtn = event.target.closest("[data-return-id]");
        if (!returnBtn) {
            return;
        }
        const borrowId = returnBtn.getAttribute("data-return-id");
        if (!borrowId) {
            return;
        }

        borrowRecords = borrowRecords.map((record) => (
            record.id === borrowId ? { ...record, status: "return_pending" } : record
        ));
        saveBorrowHistory(borrowRecords);
        renderRecords();

        if (useFirestore) {
            try {
                await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, borrowId), { status: "return_pending" }, { merge: true });
            } catch (error) {
                console.warn("Could not update borrow status in Firestore.", error);
            }
        }

        setActiveTab("returned");
    });

    async function init() {
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

    init();
})();
