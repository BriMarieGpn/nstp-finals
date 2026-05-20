import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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
    const auth = getAuth(app);
    const useFirestore = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
    let activeTab = "borrowing";
    let borrowRecords = [];
    let currentUserGlobal = null;

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

    function isRecordForUser(record, user) {
        if (!user || !record) return false;
        const borrower = record.borrower || {};
        const uidMatch = (borrower.uid && user.uid && borrower.uid === user.uid) || (borrower.id && user.uid && borrower.id === user.uid);
        const emailMatch = borrower.email && user.email && String(borrower.email).toLowerCase() === String(user.email).toLowerCase();

        // Match by volunteer ID (common in i-tanim profiles)
        const volunteerId = String(user.volunteerID || user.volunteerId || '').trim().toLowerCase();
        const fallbackVolunteerId = `grw-${String(user.id || '').substring(0,5).toLowerCase()}`;
        const orgId = String(borrower.organizationId || borrower.organizationID || borrower.orgId || borrower.id || '').trim().toLowerCase();
        const orgIdMatch = volunteerId && orgId && (orgId === volunteerId || orgId === fallbackVolunteerId);

        // Match by name or organization name
        const uName = String(user.name || user.fullName || user.displayName || '').trim().toLowerCase();
        const orgName = String(borrower.organizationName || borrower.name || '').trim().toLowerCase();
        const nameMatch = uName && orgName && (orgName === uName || orgName.includes(uName) || uName.includes(orgName));

        // Match by contact/phone if available
        const userContact = String(user.contact || user.phone || user.mobile || '').replace(/\s|\-|\(|\)/g, '').toLowerCase();
        const borrowerContact = String(borrower.contact || borrower.phone || '').replace(/\s|\-|\(|\)/g, '').toLowerCase();
        const contactMatch = userContact && borrowerContact && (borrowerContact === userContact || borrowerContact.includes(userContact) || userContact.includes(borrowerContact));

        return uidMatch || emailMatch || orgIdMatch || nameMatch || contactMatch;
    }

    function renderRecords() {
        if (!borrowRecords.length) {
            receiptsList.innerHTML = `<article class="receipt-item"><div class="receipt-meta"><h2>NO BORROWS YET</h2><p>Create a HERE-RAMIN request first.</p></div></article>`;
            return;
        }

        receiptsList.innerHTML = sortByCreatedAtDesc(borrowRecords).map((record) => {
            const isMine = currentUserGlobal && isRecordForUser(record, currentUserGlobal);
            const borrowerName = (record.borrower && (record.borrower.name || record.borrower.organizationName || record.borrower.organization || record.borrower.organizationName)) || record.userEmail || 'Unknown';
            const requestedByLabel = isMine ? (currentUserGlobal.displayName || currentUserGlobal.email || 'You') : borrowerName;

            return `
            <article class="receipt-item">
                <div class="receipt-tool">
                    <div class="receipt-thumb">
                        <img src="${resolveReceiptImage(record.tool?.image)}" alt="${record.tool?.name || "Tool"}">
                    </div>
                    <div class="receipt-meta">
                        <h2>${(record.tool?.name || "Tool").toUpperCase()}</h2>
                        <p>Requested by: ${requestedByLabel}</p>
                        <p>Qty: ${record.tool?.quantity || 1}</p>
                    </div>
                </div>
                <div class="receipt-status">
                    ${getTabPanelHtml(record)}
                </div>
            </article>
        `}).join("");
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

    async function init(currentUser) {
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

        // Filter to only records belonging to the signed-in user (if available)
        let filtered = (loadedRecords || []).filter((r) => r && r.deleted !== true && (!currentUser || isRecordForUser(r, currentUser)));

        // If there are no filtered records but we have a local-most-recent borrow, include it as a fallback
        try {
            const localLatestRaw = localStorage.getItem(BORROW_RECORD_KEY);
            if (localLatestRaw) {
                const localLatest = JSON.parse(localLatestRaw);
                if (localLatest && localLatest.id) {
                    const existsInLoaded = (loadedRecords || []).some(lr => lr && (lr.id === localLatest.id));
                    const alreadyIncluded = filtered.some(fr => fr.id === localLatest.id);
                    if (!alreadyIncluded && (existsInLoaded || !filtered.length)) {
                        // Prefer the loaded version if present, else use localLatest
                        const toAdd = (loadedRecords || []).find(lr => lr && lr.id === localLatest.id) || localLatest;
                        filtered = [toAdd].concat(filtered);
                    }
                }
            }
        } catch (e) {
            // ignore JSON parse errors
        }

        borrowRecords = filtered.map((record, index) => ({
            id: record.id || `borrow-local-${index}`,
            status: record.status || "in_use",
            ...record
        }));
        renderRecords();
        document.body.classList.remove('auth-pending');
    }

    // Require auth to show user-specific borrow records
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            receiptsList.innerHTML = `<article class="receipt-item"><div class="receipt-meta"><h2>Not signed in</h2><p>Please <a href="../../pages/i-tanim/login.html">login</a> to view your borrows.</p></div></article>`;
            document.body.classList.remove('auth-pending');
            return;
        }
        currentUserGlobal = user;
        document.body.classList.remove('auth-pending');
        init(user);
    });
})();
