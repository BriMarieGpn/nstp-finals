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
        
        // Exact UID match (most reliable)
        const uidMatch = (borrower.uid && user.uid && borrower.uid === user.uid);
        
        // Email match
        const emailMatch = borrower.email && user.email && String(borrower.email).toLowerCase() === String(user.email).toLowerCase();

        // Match by volunteer ID (common in i-tanim profiles)
        const volunteerId = String(user.volunteerID || user.volunteerId || user.id || '').trim().toLowerCase();
        const orgId = String(borrower.organizationId || borrower.organizationID || borrower.orgId || borrower.id || '').trim().toLowerCase();
        const orgIdMatch = volunteerId && orgId && (orgId === volunteerId || orgId.includes(volunteerId));

        // Match by name or organization name (fuzzy match)
        const uName = String(user.name || user.fullName || user.displayName || user.displayName || '').trim().toLowerCase();
        const orgName = String(borrower.organizationName || borrower.name || '').trim().toLowerCase();
        const nameMatch = uName && orgName && (orgName === uName || orgName.includes(uName) || uName.includes(orgName));

        // Match by contact/phone if available
        const userContact = String(user.contact || user.phone || user.mobile || '').replace(/\s|\-|\(|\)/g, '').toLowerCase();
        const borrowerContact = String(borrower.contact || borrower.phone || '').replace(/\s|\-|\(|\)/g, '').toLowerCase();
        const contactMatch = userContact && borrowerContact && (borrowerContact === userContact);

        const matched = uidMatch || emailMatch || orgIdMatch || nameMatch || contactMatch;
        console.log(`[Record Match] ID: ${record.id} | uidMatch: ${uidMatch} | emailMatch: ${emailMatch} | orgIdMatch: ${orgIdMatch} | nameMatch: ${nameMatch} | contactMatch: ${contactMatch} | Result: ${matched}`);
        return matched;
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
        console.log(`[Init] Loaded from localStorage:`, loadedRecords.length, "records");

        if (useFirestore) {
            try {
                const snapshot = await getDocs(collection(db, BORROW_REQUESTS_COLLECTION));
                const firestoreRecords = snapshot.docs
                    .map((entry) => ({ id: entry.id, ...entry.data() }))
                    .filter((record) => record.deleted !== true);
                console.log(`[Init] Loaded from Firestore:`, firestoreRecords.length, "records");
                
                // Merge Firestore records with localStorage to fill in missing images
                if (firestoreRecords.length > 0) {
                    const mergedRecords = firestoreRecords.map(fsRecord => {
                        // Try to find the same record in localStorage to get image data
                        const localRecord = loadedRecords.find(lr => lr && lr.id === fsRecord.id);
                        if (localRecord) {
                            console.log(`[Init] Merging images for record ${fsRecord.id} from localStorage`);
                            return {
                                ...fsRecord,
                                validIdImage: fsRecord.validIdImage || localRecord.validIdImage,
                                signatureImage: fsRecord.signatureImage || localRecord.signatureImage
                            };
                        }
                        return fsRecord;
                    });
                    loadedRecords = mergedRecords;
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
                        console.log(`[Init] Loaded latest from`, BORROW_DOC_PATH.join("/"));
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
                    console.log(`[Init] Using fallback from localStorage`);
                } catch (error) {
                    loadedRecords = [];
                }
            }
        }

        // Filter to only records belonging to the signed-in user (if available)
        console.log(`[Init] Filtering ${loadedRecords.length} records for user:`, currentUser?.email || currentUser?.uid);
        let filtered = (loadedRecords || []).filter((r) => r && r.deleted !== true && (!currentUser || isRecordForUser(r, currentUser)));
        console.log(`[Init] After filtering: ${filtered.length} records match user`);

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
                        console.log(`[Init] Added fallback record from localStorage:`, localLatest.id);
                    }
                }
            }
        } catch (e) {
            console.warn("[Init] Error processing localStorage fallback:", e);
        }

        // If still no records, show all records from loadedRecords as a last resort (for debugging)
        if (!filtered.length && loadedRecords.length > 0) {
            console.warn(`[Init] No filtered records found. Showing all ${loadedRecords.length} loaded records as fallback.`);
            filtered = loadedRecords;
        }

        borrowRecords = filtered.map((record, index) => ({
            id: record.id || `borrow-local-${index}`,
            status: record.status || "in_use",
            ...record
        }));
        console.log(`[Init] Final records to display: ${borrowRecords.length}`);
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
