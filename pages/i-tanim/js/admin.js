import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, doc, deleteDoc, setDoc, updateDoc, onSnapshot, collection, getDocs, getDoc, query, where, arrayUnion, arrayRemove, addDoc } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
import firebaseConfig from "./firebaseConfig.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const useFirestore = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
const adminStateDoc = doc(db, 'admin', 'state');
const HERERAMIN_TOOLS_COLLECTION = 'tools';
let hasResolvedAuth = false;
let authReadyPromise = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    console.log('[admin.js] Auth state changed:', user ? `${user.email} (uid: ${user.uid})` : 'logged out');
    unsubscribe();
    resolve(user);
  });
});
let realtimeInitialized = false;
const ACTIVE_TAB_KEY = 'growsauyouAdminActiveTab';

const ROLE_CACHE_KEY = 'growsauyouRoleCache';

const defaultImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='280' viewBox='0 0 500 280'%3E%3Crect width='500' height='280' fill='%23546B41'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Segoe UI, sans-serif' font-size='24' fill='%23FFF8EC'%3EImage unavailable%3C/text%3E%3C/svg%3E";

function normalizeRole(role) {
    return String(role || '').toLowerCase().trim();
}

function normalizeStatus(status) {
    return String(status || 'pending').toLowerCase().trim();
}

function normalizeDisplayName(name, maxLength = 24) {
    const trimmed = String(name || '').trim().replace(/\s+/g, ' ');
    if (!trimmed) return 'Unnamed user';
    if (trimmed.length <= maxLength) return trimmed;
    return trimmed.slice(0, maxLength - 1).trimEnd() + '…';
}

function getLatestCertificatesByUser(certs) {
    const latestByUser = new Map();
    (Array.isArray(certs) ? certs : []).forEach((cert) => {
        const userId = cert.userId || cert.userEmail || cert.id;
        const score = new Date(cert.updatedAt || cert.requestedAt || cert.createdAt || 0).getTime();
        const existing = latestByUser.get(userId);
        if (!existing || score > existing.score) {
            latestByUser.set(userId, { cert, score });
        }
    });
    return Array.from(latestByUser.values()).map((entry) => entry.cert);
}

function isAdminEmail(email) {
    const val = String(email || '').toLowerCase();
    return val.includes('admin');
}

function revealApp() {
    document.body.classList.remove('auth-pending');
    // Also directly hide the gate so CSS transitions can't block it
    const gate = document.getElementById('authLoadingGate');
    if (gate) { gate.style.opacity = '0'; gate.style.visibility = 'hidden'; gate.style.pointerEvents = 'none'; }
    const content = document.getElementById('appContent');
    if (content) { content.style.opacity = '1'; content.style.pointerEvents = ''; }
}

function redirectOnce(path) {
    if (hasResolvedAuth) return;
    hasResolvedAuth = true;
    window.location.href = path;
}

function cacheRole(uid, role) {
    try {
        localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ uid, role: normalizeRole(role) }));
    } catch {
        // ignore cache errors
    }
}

function getCachedRole(uid) {
    try {
        const raw = localStorage.getItem(ROLE_CACHE_KEY);
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (!cached || cached.uid !== uid) return null;
        return normalizeRole(cached.role);
    } catch {
        return null;
    }
}

function renderAdminShell() {
    const fns = [updateDashboard, updateAnalytics, updateVolunteers, loadRestrictionsUI,
                 updateSkills, updateBadges, updateCertifications, updateNotifications, updateHereRaminTools, updateHereRaminReceipts, updateHereRaminAnalytics, updateOrgVerificationRecords, updateOrgVerificationAnalytics];
    fns.forEach(fn => { try { fn(); } catch(e) { console.warn('renderAdminShell:', fn.name, e); } });
    // Fetch live programs from Firestore on load
    fetchAndRenderPrograms().catch(() => {});
    // Init Firestore realtime listeners once
    if (!realtimeInitialized) {
        realtimeInitialized = true;
        try { initFirestoreAdminState(); } catch(e) { console.warn('initFirestoreAdminState', e); }
        try { loadCertificatesFromFirestore(); } catch(e) { console.warn('loadCertificatesFromFirestore', e); }
        try { watchCertificateRequests(); } catch(e) { console.warn('watchCertificateRequests', e); }
    }
    try { initAdminAttachmentPreview(); } catch(e) {}
}

// Data structures
let users = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
let programs = JSON.parse(localStorage.getItem('itanimPrograms') || '[]');
let certifications = JSON.parse(localStorage.getItem('itanimCerts') || '[]');
let skills = JSON.parse(localStorage.getItem('itanimSkills') || '[]');
let restrictions = JSON.parse(localStorage.getItem('itanimRestrictions') || '{"minAge":18,"validBarangays":"All"}');
let badgeThresholds = JSON.parse(localStorage.getItem('itanimBadges') || '{"bronze":10,"silver":25,"gold":50,"platinum":100}');
let notifications = JSON.parse(localStorage.getItem('itanimNotifications') || '[]');
const programsKey = "itanimPrograms";
let hereRaminTools = [];
let hereRaminToolsUnsubscribe = null;

function refreshLocalAdminCache() {
    try {
        const localUsers = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
        const localPrograms = JSON.parse(localStorage.getItem('itanimPrograms') || '[]');
        if (Array.isArray(localUsers)) users = localUsers;
        if (Array.isArray(localPrograms)) programs = localPrograms;
    } catch {
        // ignore parse issues, keep current in-memory values
    }
}


// Save functions
async function saveAdminStateToFirestore() {
    if (!useFirestore) return;
    try {
        await setDoc(adminStateDoc, {
            users,
            programs,
            certifications,
            skills,
            restrictions,
            badgeThresholds,
            notifications
        }, { merge: true });
    } catch (err) {
        console.warn('Could not save admin state to Firestore', err);
    }
}

function saveUsers() {
    localStorage.setItem('itanimUsers', JSON.stringify(users));
    saveAdminStateToFirestore();
}
function savePrograms() {
    localStorage.setItem('itanimPrograms', JSON.stringify(programs));
    saveAdminStateToFirestore();
    // Always sync to homepage programs after saving
    syncProgramsFromPrograms();
}
function updateTasks() {
    // Placeholder for task list updates in admin dashboard.
    // If task management is later added, populate or refresh task UI here.
    const taskList = document.getElementById('taskList');
    if (taskList) {
        taskList.innerHTML = '<p>Task list refresh complete.</p>';
    }
}

function syncProgramsFromTasks() {
    // Placeholder mapping for task-sync workflows.
    // This function exists to prevent errors when admin loads and is not currently using task sync.
    return;
}
function saveCerts() {
    certifications.forEach((cert) => {
        cert.status = normalizeStatus(cert.status);
    });
    localStorage.setItem('itanimCerts', JSON.stringify(certifications));
    
    // Save certificates to Firestore
    if (useFirestore) {
        console.log(`📝 Saving ${certifications.length} certificates to Firestore...`);
        certifications.forEach((cert) => {
            try {
                const certRef = doc(db, 'certificates', cert.id);
                setDoc(certRef, cert, { merge: true }).then(() => {
                    console.log(`💾 Saved cert ${cert.id} - Status: ${cert.status}`);
                }).catch(err => {
                    console.warn('Could not save certificate to Firestore:', cert.id, err);
                });
            } catch (error) {
                console.warn('Could not save certificate to Firestore:', cert.id, error);
            }
        });
    }
    
    saveAdminStateToFirestore();
}
function saveSkills() {
    localStorage.setItem('itanimSkills', JSON.stringify(skills));
    saveAdminStateToFirestore();
}
function saveRestrictions() {
    localStorage.setItem('itanimRestrictions', JSON.stringify(restrictions));
    saveAdminStateToFirestore();
}
function saveBadges() {
    localStorage.setItem('itanimBadges', JSON.stringify(badgeThresholds));
    saveAdminStateToFirestore();
}
function saveNotifications() {
    localStorage.setItem('itanimNotifications', JSON.stringify(notifications));
    saveAdminStateToFirestore();
}

async function initFirestoreAdminState() {
    if (!useFirestore) {
        console.warn('Firestore is not configured for admin panel. Using local demo data only.');
        return;
    }

    try {
        onSnapshot(adminStateDoc, (snapshot) => {
            if (!snapshot.exists()) {
                console.warn('Firestore admin state document not found. Local data will be used.');
                return;
            }
            const data = snapshot.data();
            if (!data) return;
            users = Array.isArray(data.users) ? data.users : users;
            programs = Array.isArray(data.programs) ? data.programs : programs;
            // certifications loaded separately from certificates collection
            skills = Array.isArray(data.skills) ? data.skills : skills;
            restrictions = data.restrictions || restrictions;
            badgeThresholds = data.badgeThresholds || badgeThresholds;
            notifications = Array.isArray(data.notifications) ? data.notifications : notifications;

            // Merge Firestore programs with local cache so newly added local programs
            // are not lost when changing tabs or when snapshots arrive late.
            let localPrograms = [];
            try {
                localPrograms = JSON.parse(localStorage.getItem('itanimPrograms') || '[]');
            } catch {
                localPrograms = [];
            }
            const firestorePrograms = Array.isArray(data.programs) ? data.programs : [];
            const mergedProgramsById = new Map();
            firestorePrograms.forEach((p) => mergedProgramsById.set(p.id, p));
            localPrograms.forEach((p) => mergedProgramsById.set(p.id, p));
            programs = Array.from(mergedProgramsById.values()).map(program => ({
                ...program,
                name: program.name || program.title || 'Untitled Program',
                assigned: Array.isArray(program.assigned) ? program.assigned : Array.isArray(program.joined) ? program.joined : [],
                joined: Array.isArray(program.joined) ? program.joined : Array.isArray(program.assigned) ? program.assigned : [],
                maxVolunteers: program.maxVolunteers ?? 0,
                status: program.status || 'active'
            }));
            updateDashboard();
            updateAnalytics();
            updateVolunteers();
            loadRestrictionsUI();
            updateSkills();
            updatePrograms();
            updateBadges();
            updateCertifications();
            updateNotifications();
            syncProgramsFromPrograms();
        });

        // Live-sync volunteers so hours are always reflected in dashboard analytics.
        // Live-sync volunteers so hours are always reflected in dashboard analytics.
        onSnapshot(collection(db, 'volunteers'), (volunteersSnap) => {
            const firestoreUsers = [];
            volunteersSnap.forEach((volunteerDoc) => {
                const data = volunteerDoc.data();
                firestoreUsers.push({
                    id: volunteerDoc.id,
                    volunteerID: data.volunteerID || data.volunteerId || '',
                    name: data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || 'Volunteer',
                    email: data.email || '',
                    age: data.age || '',
                    barangay: data.barangay || data.address || '',
                    skills: data.skills || [],
                    status: normalizeStatus(data.status),
                    hours: Number(data.hours || 0),
                    badge: data.badge || 'None',
                    enrolledPrograms: data.enrolledPrograms || [],
                    completedPrograms: data.completedPrograms || [],
                    createdAt: data.createdAt || data.registeredAt || null,
                    pendingValidation: data.pendingValidation || [],
                    absentPrograms: data.absentPrograms || []
                });
            });

            // Merge Firestore users with local users
            const localUsers = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
            const mergedUsers = new Map();

            // Add all local users first
            localUsers.forEach(user => mergedUsers.set(user.id, user));

            // Override with Firestore users (they take priority)
            firestoreUsers.forEach(user => mergedUsers.set(user.id, user));

            users = Array.from(mergedUsers.values());

            // Save merged data back to localStorage
            localStorage.setItem('itanimUsers', JSON.stringify(users));

            updateVolunteers();
            updateDashboard();
            updateAnalytics();
            updateVolunteerProgramParticipants();
        });
        console.log('Firestore admin state initialized');
    } catch (err) {
        console.warn('Firestore admin state listener failed, falling back to local data', err);
        // Fallback to local users if Firestore fails
        users = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
        updateVolunteers();
        updateDashboard();
        updateAnalytics();
        updateVolunteerProgramParticipants();
    }
}

// Load certificates from Firestore collection
async function loadCertificatesFromFirestore() {
    if (!useFirestore) return;
    
    try {
        const certificatesSnapshot = await getDocs(collection(db, 'certificates'));
        const uniqueCerts = new Map();
        
        // Load ONLY from Firestore (don't merge with stale localStorage)
        certificatesSnapshot.docs.forEach(doc => {
            const cert = { id: doc.id, ...doc.data(), status: normalizeStatus(doc.data()?.status) };
            uniqueCerts.set(cert.id, cert);
        });
        
        certifications = Array.from(uniqueCerts.values());
        localStorage.setItem('itanimCerts', JSON.stringify(certifications));
        console.log('✅ Loaded certificates from Firestore:', certifications.length, 'unique records');
        updateCertifications();
    } catch (error) {
        console.warn('Could not load certificates from Firestore:', error);
    }
}

function watchCertificateRequests() {
    if (!useFirestore) return;
    try {
        const certCollection = collection(db, 'certificates');
        onSnapshot(certCollection, (snapshot) => {
            // Build a deduplicated map using the cert ID as key (newest wins)
            const uniqueCerts = new Map();
            snapshot.docs.forEach(doc => {
                const cert = { id: doc.id, ...doc.data(), status: normalizeStatus(doc.data()?.status) };
                uniqueCerts.set(cert.id, cert);
            });
            // Replace certifications with unique entries only from Firestore
            certifications = Array.from(uniqueCerts.values());
            certifications.forEach(cert => { cert.status = normalizeStatus(cert.status); });
            localStorage.setItem('itanimCerts', JSON.stringify(certifications));
            updateCertifications();
            console.log('✅ Real-time certificate requests updated:', certifications.length, 'unique records');
        });
    } catch (error) {
        console.warn('Could not watch certificate requests:', error);
    }
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
    });
}

function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const parsed = new URL(url.trim());
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (err) {
        return false;
    }
}

function attachmentFromUrl(url) {
    const safeUrl = url.trim();
    let name = safeUrl.split('/').pop().split('?')[0] || 'Pasted Image';
    try {
        name = decodeURIComponent(name);
    } catch (err) {
        // ignore decode errors
    }
    return {
        name: name || 'Pasted Image',
        type: 'image/url',
        size: 0,
        dataUrl: safeUrl
    };
}

function renderProgramAttachmentPreview(attachments, containerId = 'programAttachmentPreview') {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!Array.isArray(attachments) || attachments.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.classList.add('attachment-preview-grid');
    container.innerHTML = attachments.map(att => `
        <div class="attachment-preview-card">
            <img src="${att.dataUrl}" alt="${att.name}">
            <div class="attachment-preview-name">${att.name}</div>
        </div>
    `).join('');
}

function renderTaskAttachmentPreview(attachments) {
    // Alias for compatibility with task attachment handling
    renderProgramAttachmentPreview(attachments);
}

async function getAttachmentsFromInput(inputId = 'programAttachments', urlInputId = null) {
    const attachments = [];
    const input = document.getElementById(inputId);
    if (input && input.files && input.files.length > 0) {
        const files = Array.from(input.files);
        for (const file of files) {
            const dataUrl = await readFileAsDataUrl(file);
            attachments.push({ name: file.name, type: file.type, size: file.size, dataUrl });
        }
    }

    if (urlInputId) {
        const urlInput = document.getElementById(urlInputId);
        const urlValue = urlInput?.value?.trim();
        if (urlValue) {
            const urls = urlValue.split(/\s*,\s*|\s+/).filter(Boolean);
            for (const url of urls) {
                if (isValidImageUrl(url)) {
                    attachments.push(attachmentFromUrl(url));
                }
            }
        }
    }

    return attachments;
}

function clearAttachmentInput(inputId = 'programAttachments', containerId = 'programAttachmentPreview', urlInputId = null) {
    const input = document.getElementById(inputId);
    if (input) input.value = '';
    if (urlInputId) {
        const urlInput = document.getElementById(urlInputId);
        if (urlInput) urlInput.value = '';
    }
    renderProgramAttachmentPreview([], containerId);
}

async function syncProgramsFromPrograms() {
    // Mirror programs -> public "Available Programs" list (index.js reads this key in offline mode)
    const programDocs = programs.map(p => ({
        id: p.id,
        title: p.name,
        hours: String(p.hours ?? ''),
        requirement: p.requirement || 'None',
        desc: p.desc || '',
        image: (p.attachments && p.attachments[0] && p.attachments[0].dataUrl) ? p.attachments[0].dataUrl : defaultImage,
        joined: p.joined || [],
        skills: p.skills || [],
        _source: 'program'
    }));
    localStorage.setItem(programsKey, JSON.stringify(programs));

    if (!useFirestore) return;

    try {
        // Upsert each program directly into the 'programs' collection by its ID
        const addPromises = programs.map(async (program) => {
            const firestoreData = {
                name: program.name,
                title: program.name,
                hours: program.hours,
                requirement: program.requirement || 'None',
                desc: program.desc || '',
                image: (program.attachments && program.attachments[0] && program.attachments[0].dataUrl) ? program.attachments[0].dataUrl : defaultImage,
                joined: program.joined || [],
                pendingJoins: program.pendingJoins || [],
                skills: program.skills || [],
                status: program.status || 'active',
                maxVolunteers: program.maxVolunteers || 0
            };
            return setDoc(doc(db, 'programs', program.id), firestoreData, { merge: true });
        });
        await Promise.all(addPromises);
        console.log('Successfully synced', programs.length, 'programs to Firestore');
    } catch (err) {
        console.warn('Could not sync programs to Firestore', err);
    }
}

// Tab switching
function showTab(tabName) {
    // Support new sidebar layout (ad-tab-* IDs) as well as legacy tab-content
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // New sidebar layout
    document.querySelectorAll('.ad-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.ad-sidenav__item[data-tab]').forEach(a => {
        a.classList.toggle('ad-sidenav__item--active', a.dataset.tab === tabName);
    });
    const newTab = document.getElementById('ad-tab-' + tabName);
    if (newTab) newTab.classList.add('active');

    // Legacy: safely add active to old tab-btn if it exists
    const legacyBtn = document.querySelector(`button[onclick="showTab('${tabName}')"]`);
    if (legacyBtn) legacyBtn.classList.add('active');
    const legacyContent = document.getElementById(tabName);
    if (legacyContent) legacyContent.classList.add('active');

    try {
        localStorage.setItem(ACTIVE_TAB_KEY, tabName);
    } catch {
        // ignore storage errors
    }
    updateTab(tabName);
}

function getCurrentActiveTab() {
    const active = document.querySelector('.ad-tab.active') || document.querySelector('.tab-content.active');
    if (active) {
        // strip 'ad-tab-' prefix if present
        return active.id.replace('ad-tab-', '');
    }
    return 'dashboard';
}

function restoreActiveTab() {
    let tab = 'dashboard';
    try {
        tab = localStorage.getItem(ACTIVE_TAB_KEY) || 'dashboard';
    } catch {
        tab = 'dashboard';
    }
    showTab(tab);
}
// Update tab content
function updateTab(tabName) {
    try {
        switch(tabName) {
            case 'dashboard': updateDashboard(); break;
            case 'analytics': updateAnalytics(); updateHereRaminAnalytics(); break;
            case 'volunteers': updateVolunteers(); break;
            case 'restrictions': updateRestrictions(); break;
            case 'skills': updateSkills(); break;
            case 'programs': updateAccounts(); break;
            case 'hereramin': updateHereRaminTools(); updateHereRaminReceipts(); break;
            case 'org-verification': updateOrgVerificationRecords(); updateOrgVerificationAnalytics(); break;
            case 'badges': updateBadges(); break;
            case 'certifications': updateCertifications(); break;
            case 'notifications': updateNotifications(); break;
            case 'taskvalidation': updateVolunteers(); break;
            case 'settings': updateRestrictions(); updateSkills(); updateNotifications(); break;
        }
    } catch(e) { console.warn('updateTab error:', tabName, e); }
}

const HERE_RAMIN_CATEGORIES = [
    'Soil Preparation',
    'Planting & Propagation',
    'Watering & Irrigation',
    'Pruning & Maintenance',
    'Harvesting',
    'Pest Control',
    'Protective & Safety',
    'General Tools'
];
const BORROW_REQUESTS_COLLECTION = 'borrow_requests';
let hereRaminBorrowRecords = [];
let hereRaminReceiptsUnsubscribe = null;
let organizationVerifications = [];
let orgVerificationsUnsubscribe = null;
let hereRaminEditingToolId = null;
let hereRaminUploadedImageDataUrl = '';
let hereRaminModalEditingToolId = null;
let hereRaminModalUploadedImageDataUrl = '';

function slugifyToolName(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function normalizeToolDoc(toolId, data) {
    const toolName = String(data.tool_name || data.name || toolId || 'Tool').trim();
    const qtyAvailable = Number(data.quantity_available ?? data.quantity ?? data.quantity_total ?? 0);
    const qtyTotal = Number(data.quantity_total ?? qtyAvailable);
    const statusText = String(data.status_ || data.status || '').toLowerCase().trim();
    const hasExplicitAvailable = typeof data.available === 'boolean';
    const available = hasExplicitAvailable ? data.available : (qtyAvailable > 0 && statusText !== 'unavailable' && statusText !== 'borrowed');

    return {
        id: toolId,
        tool_name: toolName,
        category: data.category || 'General Tools',
        image_url: data.image_url || data.image || '',
        wikihow_url: data.wikihow_url || '',
        description: data.description || '',
        quantity_available: Math.max(0, Number.isFinite(qtyAvailable) ? qtyAvailable : 0),
        quantity_total: Math.max(0, Number.isFinite(qtyTotal) ? qtyTotal : 0),
        available,
        status_: available ? 'Available' : 'Unavailable'
    };
}

function normalizeBorrowStatus(status) {
    return String(status || 'in_use').toLowerCase().trim();
}

function normalizeBorrowRecord(record) {
    return {
        id: record.id,
        status: normalizeBorrowStatus(record.status),
        borrower: record.borrower || {},
        tool: record.tool || {},
        schedule: record.schedule || {},
        purpose: record.purpose || '',
        validIdImage: record.validIdImage || record.idImage || '',
        signatureImage: record.signatureImage || '',
        createdAt: record.createdAt || new Date(0).toISOString(),
        archived: Boolean(record.archived),
        deleted: Boolean(record.deleted)
    };
}

function resetHereRaminToolForm() {
    const nameInput = document.getElementById('hrToolName');
    const categoryInput = document.getElementById('hrToolCategory');
    const imageInput = document.getElementById('hrToolImageUrl');
    const wikiHowInput = document.getElementById('hrToolWikiHowUrl');
    const descriptionInput = document.getElementById('hrToolDescription');
    const qtyAvailableInput = document.getElementById('hrToolQtyAvailable');
    const qtyTotalInput = document.getElementById('hrToolQtyTotal');
    const imageFileInput = document.getElementById('hrToolImageFile');
    const imagePreview = document.getElementById('hrToolImagePreview');
    const saveBtn = document.getElementById('hrToolSaveBtn');

    hereRaminEditingToolId = null;
    hereRaminUploadedImageDataUrl = '';
    if (nameInput) nameInput.value = '';
    if (categoryInput) categoryInput.value = HERE_RAMIN_CATEGORIES[0];
    if (imageInput) imageInput.value = '';
    if (wikiHowInput) wikiHowInput.value = '';
    if (descriptionInput) descriptionInput.value = '';
    if (qtyAvailableInput) qtyAvailableInput.value = '1';
    if (qtyTotalInput) qtyTotalInput.value = '1';
    if (imageFileInput) imageFileInput.value = '';
    if (imagePreview) {
        imagePreview.src = '';
        imagePreview.style.display = 'none';
    }
    if (saveBtn) saveBtn.textContent = 'Add Tool';
}

function resetHereRaminToolModalForm() {
    const nameInput = document.getElementById('hrModalToolName');
    const categoryInput = document.getElementById('hrModalToolCategory');
    const imageInput = document.getElementById('hrModalToolImageUrl');
    const wikiHowInput = document.getElementById('hrModalToolWikiHowUrl');
    const descriptionInput = document.getElementById('hrModalToolDescription');
    const qtyAvailableInput = document.getElementById('hrModalToolQtyAvailable');
    const qtyTotalInput = document.getElementById('hrModalToolQtyTotal');
    const imageFileInput = document.getElementById('hrModalToolImageFile');
    const imagePreview = document.getElementById('hrModalToolImagePreview');
    const saveBtn = document.getElementById('hrModalSaveBtn');

    hereRaminModalEditingToolId = null;
    hereRaminModalUploadedImageDataUrl = '';
    renderHereRaminCategoryOptions('hrModalToolCategory');
    if (nameInput) nameInput.value = '';
    if (categoryInput) categoryInput.value = HERE_RAMIN_CATEGORIES[0];
    if (imageInput) imageInput.value = '';
    if (wikiHowInput) wikiHowInput.value = '';
    if (descriptionInput) descriptionInput.value = '';
    if (qtyAvailableInput) qtyAvailableInput.value = '1';
    if (qtyTotalInput) qtyTotalInput.value = '1';
    if (imageFileInput) imageFileInput.value = '';
    if (imagePreview) {
        imagePreview.src = '';
        imagePreview.style.display = 'none';
    }
    if (saveBtn) saveBtn.textContent = 'Update Tool';
}

function showHereRaminToolEditModal(toolId) {
    const tool = hereRaminTools.find((entry) => entry.id === toolId);
    if (!tool) return;

    const modal = document.getElementById('hereRaminToolModal');
    const title = document.getElementById('hrModalTitle');
    const nameInput = document.getElementById('hrModalToolName');
    const categoryInput = document.getElementById('hrModalToolCategory');
    const imageInput = document.getElementById('hrModalToolImageUrl');
    const wikiHowInput = document.getElementById('hrModalToolWikiHowUrl');
    const descriptionInput = document.getElementById('hrModalToolDescription');
    const qtyAvailableInput = document.getElementById('hrModalToolQtyAvailable');
    const qtyTotalInput = document.getElementById('hrModalToolQtyTotal');
    const imagePreview = document.getElementById('hrModalToolImagePreview');
    const saveBtn = document.getElementById('hrModalSaveBtn');

    if (!modal) return;
    hereRaminModalEditingToolId = toolId;
    hereRaminModalUploadedImageDataUrl = '';
    renderHereRaminCategoryOptions('hrModalToolCategory');
    if (title) title.textContent = 'Edit HERE-RAMIN Tool';
    if (nameInput) nameInput.value = tool.tool_name || '';
    if (categoryInput) categoryInput.value = tool.category || 'General Tools';
    if (imageInput) imageInput.value = tool.image_url || '';
    if (wikiHowInput) wikiHowInput.value = tool.wikihow_url || '';
    if (descriptionInput) descriptionInput.value = tool.description || '';
    if (qtyAvailableInput) qtyAvailableInput.value = String(tool.quantity_available ?? 0);
    if (qtyTotalInput) qtyTotalInput.value = String(tool.quantity_total ?? 1);
    if (imagePreview) {
        if (tool.image_url) {
            imagePreview.src = tool.image_url;
            imagePreview.style.display = 'block';
        } else {
            imagePreview.src = '';
            imagePreview.style.display = 'none';
        }
    }
    if (saveBtn) saveBtn.textContent = 'Update Tool';
    modal.style.display = 'flex';
}

function closeHereRaminToolEditModal() {
    const modal = document.getElementById('hereRaminToolModal');
    if (modal) modal.style.display = 'none';
    resetHereRaminToolModalForm();
}

async function saveHereRaminToolFromModal() {
    const nameInput = document.getElementById('hrModalToolName');
    const categoryInput = document.getElementById('hrModalToolCategory');
    const imageInput = document.getElementById('hrModalToolImageUrl');
    const wikiHowInput = document.getElementById('hrModalToolWikiHowUrl');
    const descriptionInput = document.getElementById('hrModalToolDescription');
    const qtyAvailableInput = document.getElementById('hrModalToolQtyAvailable');
    const qtyTotalInput = document.getElementById('hrModalToolQtyTotal');

    const toolName = (nameInput?.value || '').trim();
    const category = (categoryInput?.value || '').trim() || 'General Tools';
    const imageUrl = (imageInput?.value || '').trim();
    const wikiHowUrl = (wikiHowInput?.value || '').trim();
    const description = (descriptionInput?.value || '').trim();
    const qtyAvailable = Number(qtyAvailableInput?.value || 0);
    const qtyTotal = Number(qtyTotalInput?.value || 0);

    if (!toolName) {
        alert('Tool name is required.');
        return;
    }
    if (!Number.isFinite(qtyAvailable) || !Number.isFinite(qtyTotal) || qtyAvailable < 0 || qtyTotal <= 0 || qtyAvailable > qtyTotal) {
        alert('Please enter valid quantities (available must be between 0 and total).');
        return;
    }
    const docId = hereRaminModalEditingToolId || slugifyToolName(toolName) || `tool-${Date.now()}`;
    const payload = {
        tool_name: toolName,
        category,
        image_url: hereRaminModalUploadedImageDataUrl || imageUrl,
        wikihow_url: wikiHowUrl,
        description,
        quantity_available: qtyAvailable,
        quantity_total: qtyTotal,
        available: qtyAvailable > 0,
        status_: qtyAvailable > 0 ? 'Available' : 'Unavailable',
        updated_at: new Date().toISOString()
    };

    try {
        await setDoc(doc(db, HERERAMIN_TOOLS_COLLECTION, docId), payload, { merge: true });
        logAction('hereramin_tool_edit', `Edited HERE-RAMIN tool: "${toolName}"`, { toolId: docId, category });
        closeHereRaminToolEditModal();
    } catch (error) {
        console.error('Failed to update HERE-RAMIN tool', error);
        alert('Failed to update tool: ' + (error.message || error));
    }
}

async function handleHereRaminToolModalImageFile(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
        hereRaminModalUploadedImageDataUrl = await readImageAsDataUrl(file);
        const imagePreview = document.getElementById('hrModalToolImagePreview');
        if (imagePreview) {
            imagePreview.src = hereRaminModalUploadedImageDataUrl;
            imagePreview.style.display = 'block';
        }
    } catch (error) {
        console.error('Failed to load modal image preview', error);
        alert('Could not read the selected image file.');
    }
}

async function readImageAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read image file'));
        reader.readAsDataURL(file);
    });
}

function renderHereRaminCategoryOptions(selectId = 'hrToolCategory') {
    const categorySelect = document.getElementById(selectId);
    if (!categorySelect) return;
    const current = categorySelect.value;
    categorySelect.innerHTML = HERE_RAMIN_CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join('');
    if (current && HERE_RAMIN_CATEGORIES.includes(current)) {
        categorySelect.value = current;
    } else {
        categorySelect.value = HERE_RAMIN_CATEGORIES[0];
    }
}

function updateHereRaminTools() {
    renderHereRaminCategoryOptions();

    const list = document.getElementById('hereRaminToolsList');
    if (!list) return;

    if (!hereRaminTools.length) {
        list.innerHTML = '<div style="padding:14px 18px;opacity:0.6;font-family:\'Montserrat\',sans-serif;font-size:0.85rem;">No HERE-RAMIN tools found.</div>';
        return;
    }

    list.innerHTML = hereRaminTools.map((tool) => `
        <div class="ad-task-row hr-tools-row">
            <span style="font-weight:600;">${tool.tool_name}</span>
            <span>${tool.category || 'General Tools'}</span>
            <span>${tool.quantity_available ?? 0}</span>
            <span>${tool.quantity_total ?? 0}</span>
            <span>${tool.available ? 'Available' : 'Unavailable'}</span>
            <span style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="edit-btn" onclick="editHereRaminTool('${tool.id}')">Edit</button>
                <button class="archive-btn" onclick="toggleHereRaminToolAvailability('${tool.id}')">${tool.available ? 'Disable' : 'Enable'}</button>
                <button class="delete-btn" onclick="deleteHereRaminTool('${tool.id}')">Delete</button>
            </span>
        </div>
    `).join('');
}

function updateHereRaminReceipts() {
    const list = document.getElementById('hereRaminReceiptsList');
    if (!list) return;

    if (!hereRaminBorrowRecords.length) {
        list.innerHTML = '<div style="padding:14px 18px;opacity:0.6;font-family:\'Montserrat\',sans-serif;font-size:0.85rem;">No HERE-RAMIN receipt requests yet.</div>';
        return;
    }

    const rows = [...hereRaminBorrowRecords]
        .filter((record) => !record.deleted && !record.archived)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (!rows.length) {
        list.innerHTML = '<div style="padding:14px 18px;opacity:0.6;font-family:\'Montserrat\',sans-serif;font-size:0.85rem;">No active borrower requests.</div>';
        return;
    }
    list.innerHTML = rows.map((record) => `
        <div class="ad-task-row hr-receipts-row">
            <span>${record.borrower?.organizationName || record.borrower?.name || record.borrower?.organization || 'Unknown'}</span>
            <span>${record.tool?.name || 'Tool'}</span>
            <span>${record.tool?.quantity || 1}</span>
            <span>${(record.status||'').replace(/_/g, ' ')}</span>
            <span>${record.schedule?.returnDate || '-'}</span>
            <span style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="edit-btn" onclick="openBorrowDetail('${record.id}')">View</button>
                <button class="archive-btn" onclick="updateHereRaminReceiptStatus('${record.id}','in_use')">In Use</button>
                <button class="archive-btn" onclick="updateHereRaminReceiptStatus('${record.id}','return_pending')">Pending</button>
                <button class="approve-btn" onclick="updateHereRaminReceiptStatus('${record.id}','return_approved')">Approve</button>
                <button class="reject-btn" onclick="updateHereRaminReceiptStatus('${record.id}','return_rejected')">Reject</button>
                <button class="archive-btn" onclick="archiveHereRaminBorrower('${record.id}')">Archive</button>
                <button class="delete-btn" onclick="deleteHereRaminBorrower('${record.id}')">Delete</button>
            </span>
        </div>
    `).join('');
}

function updateHereRaminAnalytics() {
    const total = hereRaminBorrowRecords.length;
    const pending = hereRaminBorrowRecords.filter((record) => record.status === 'return_pending').length;
    const approved = hereRaminBorrowRecords.filter((record) => record.status === 'return_approved').length;
    const borrowedCountByTool = {};
    hereRaminBorrowRecords.forEach((record) => {
        const toolName = String(record.tool?.name || 'Unknown Tool').trim() || 'Unknown Tool';
        borrowedCountByTool[toolName] = (borrowedCountByTool[toolName] || 0) + 1;
    });
    const mostBorrowed = Object.entries(borrowedCountByTool)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const totalEl = document.getElementById('hrTotalRequests');
    const pendingEl = document.getElementById('hrPendingReturns');
    const approvedEl = document.getElementById('hrApprovedReturns');
    const topBorrowedEl = document.getElementById('hrTopBorrowedTools');

    if (totalEl) totalEl.textContent = String(total);
    if (pendingEl) pendingEl.textContent = String(pending);
    if (approvedEl) approvedEl.textContent = String(approved);
    if (topBorrowedEl) {
        topBorrowedEl.innerHTML = mostBorrowed.length
            ? mostBorrowed.map(([tool, count], index) => `<div style="margin-bottom:4px;">${index + 1}. ${tool} - ${count} borrow${count > 1 ? 's' : ''}</div>`).join('')
            : 'No borrow activity yet.';
    }
}

function listenToHereRaminTools() {
    if (hereRaminToolsUnsubscribe) return;

    hereRaminToolsUnsubscribe = onSnapshot(
        collection(db, HERERAMIN_TOOLS_COLLECTION),
        (snapshot) => {
            hereRaminTools = snapshot.docs.map((entry) => normalizeToolDoc(entry.id, entry.data()));
            hereRaminTools.sort((a, b) => a.tool_name.localeCompare(b.tool_name));
            updateHereRaminTools();
        },
        (error) => {
            console.warn('Could not watch HERE-RAMIN tools', error);
            updateHereRaminTools();
        }
    );
}

async function loadHereRaminReceiptsOnce() {
    if (!useFirestore) return;

    try {
        const snapshot = await getDocs(collection(db, BORROW_REQUESTS_COLLECTION));
        hereRaminBorrowRecords = snapshot.docs.map((entry) => normalizeBorrowRecord({ id: entry.id, ...entry.data() }));
        updateHereRaminReceipts();
        updateHereRaminAnalytics();
    } catch (error) {
        console.warn('Could not load HERE-RAMIN receipts fallback', error);
    }
}

function listenToHereRaminReceipts() {
    if (hereRaminReceiptsUnsubscribe || !useFirestore) return;

    hereRaminReceiptsUnsubscribe = onSnapshot(
        collection(db, BORROW_REQUESTS_COLLECTION),
        (snapshot) => {
            hereRaminBorrowRecords = snapshot.docs.map((entry) => normalizeBorrowRecord({ id: entry.id, ...entry.data() }));
            updateHereRaminReceipts();
            updateHereRaminAnalytics();
        },
        (error) => {
            console.warn('Could not watch HERE-RAMIN receipts', error);
            updateHereRaminReceipts();
            updateHereRaminAnalytics();
            loadHereRaminReceiptsOnce();
        }
    );

    loadHereRaminReceiptsOnce();
}

// ── ORGANIZATION VERIFICATION FUNCTIONS ──
function updateOrgVerificationRecords() {
    const list = document.getElementById('orgVerificationList');
    if (!list) return;

    if (!organizationVerifications.length) {
        list.innerHTML = '<div style="padding:14px 18px;opacity:0.6;font-family:\'Montserrat\',sans-serif;font-size:0.85rem;">No organization verification requests yet.</div>';
        return;
    }

    const rows = [...organizationVerifications]
        .filter((record) => !record.deleted && !record.archived)
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    if (!rows.length) {
        list.innerHTML = '<div style="padding:14px 18px;opacity:0.6;font-family:\'Montserrat\',sans-serif;font-size:0.85rem;">No active organization requests.</div>';
        return;
    }
    list.innerHTML = rows.map((record) => `
        <div class="ad-task-row">
            <span>${record.borrower?.orgName || record.organization?.name || 'Unknown'}</span>
            <span>${record.borrower?.orgHead || record.organization?.head || '-'}</span>
            <span>${record.status || 'pending'}</span>
            <span>${record.submittedAt ? new Date(record.submittedAt).toLocaleDateString() : '-'}</span>
            <span style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="edit-btn" onclick="openOrgVerificationDetail('${record.id}')">View</button>
                <button class="approve-btn" onclick="updateOrgVerificationStatusDirect('${record.id}','approved')">Approve</button>
                <button class="reject-btn" onclick="updateOrgVerificationStatusDirect('${record.id}','rejected')">Reject</button>
                <button class="delete-btn" onclick="deleteOrgVerification('${record.id}')">Delete</button>
            </span>
        </div>
    `).join('');
}

function updateOrgVerificationAnalytics() {
    const total = organizationVerifications.length;
    const pending = organizationVerifications.filter((record) => record.status === 'pending' || !record.status).length;
    const approved = organizationVerifications.filter((record) => record.status === 'approved').length;

    const totalEl = document.getElementById('orgTotalRequests');
    const pendingEl = document.getElementById('orgPendingRequests');
    const approvedEl = document.getElementById('orgApprovedRequests');

    if (totalEl) totalEl.textContent = String(total);
    if (pendingEl) pendingEl.textContent = String(pending);
    if (approvedEl) approvedEl.textContent = String(approved);
}

function listenToOrgVerifications() {
    if (orgVerificationsUnsubscribe || !useFirestore) return;

    orgVerificationsUnsubscribe = onSnapshot(
        query(collection(db, BORROW_REQUESTS_COLLECTION), where('borrowType', '==', 'organization')),
        (snapshot) => {
            organizationVerifications = snapshot.docs.map((entry) => ({
                id: entry.id,
                ...entry.data()
            }));
            updateOrgVerificationRecords();
            updateOrgVerificationAnalytics();
        },
        (error) => {
            console.warn('Could not watch organization verifications', error);
            updateOrgVerificationRecords();
            updateOrgVerificationAnalytics();
        }
    );
}

let currentOrgVerificationId = null;

function openOrgVerificationDetail(recordId) {
    const record = organizationVerifications.find(r => r.id === recordId);
    if (!record) {
        alert('Organization verification request not found.');
        return;
    }

    currentOrgVerificationId = recordId;

    // Populate org info
    document.getElementById('ov-org-name').textContent = record.borrower?.orgName || record.organization?.name || '-';
    document.getElementById('ov-org-head').textContent = record.borrower?.orgHead || record.organization?.head || '-';
    document.getElementById('ov-submitted-date').textContent = record.submittedAt ? new Date(record.submittedAt).toLocaleString() : '-';

    // Populate documents section
    const docsEl = document.getElementById('ov-documents');
    let docsHtml = '<div style="line-height:1.8;">';
    docsHtml += '<div><strong>Organization Name:</strong> ' + (record.borrower?.orgName || record.organization?.name || '-') + '</div>';
    docsHtml += '<div><strong>Organization Head:</strong> ' + (record.borrower?.orgHead || record.organization?.head || '-') + '</div>';
    if (record.tool && record.tool.name) {
        docsHtml += '<div><strong>Tool Requested:</strong> ' + record.tool.name + '</div>';
    }
    if (record.schedule && record.schedule.borrowDate) {
        docsHtml += '<div><strong>Borrow Date:</strong> ' + record.schedule.borrowDate + '</div>';
    }
    if (record.schedule && record.schedule.returnDate) {
        docsHtml += '<div><strong>Return Date:</strong> ' + record.schedule.returnDate + '</div>';
    }
    docsHtml += '</div>';
    docsEl.innerHTML = docsHtml;

    // Set current status
    document.getElementById('ov-status-select').value = record.status || 'pending';

    // Show modal
    document.getElementById('orgVerificationModal').style.display = 'flex';
}

function closeOrgVerificationModal() {
    document.getElementById('orgVerificationModal').style.display = 'none';
    currentOrgVerificationId = null;
}

async function updateOrgVerificationStatus() {
    if (!currentOrgVerificationId) return;

    const newStatus = document.getElementById('ov-status-select').value;
    try {
        await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, currentOrgVerificationId), {
            status: newStatus,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        closeOrgVerificationModal();
        updateOrgVerificationRecords();
        updateOrgVerificationAnalytics();
    } catch (error) {
        console.error('Failed to update organization verification status', error);
        alert('Failed to update status: ' + (error.message || error));
    }
}

async function updateOrgVerificationStatusDirect(recordId, newStatus) {
    try {
        await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, recordId), {
            status: newStatus,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        updateOrgVerificationRecords();
        updateOrgVerificationAnalytics();
    } catch (error) {
        console.error('Failed to update organization verification status', error);
        alert('Failed to update status: ' + (error.message || error));
    }
}

async function archiveOrgVerification() {
    if (!currentOrgVerificationId) return;
    if (!confirm('Archive this organization verification request?')) return;

    try {
        await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, currentOrgVerificationId), {
            archived: true,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        closeOrgVerificationModal();
        updateOrgVerificationRecords();
        updateOrgVerificationAnalytics();
    } catch (error) {
        console.error('Failed to archive organization verification', error);
        alert('Failed to archive: ' + (error.message || error));
    }
}

async function deleteOrgVerification(recordId) {
    if (!recordId) recordId = currentOrgVerificationId;
    if (!recordId) return;
    if (!confirm('Permanently delete this organization verification request?')) return;

    try {
        await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, recordId), {
            deleted: true,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        if (currentOrgVerificationId === recordId) closeOrgVerificationModal();
        updateOrgVerificationRecords();
        updateOrgVerificationAnalytics();
    } catch (error) {
        console.error('Failed to delete organization verification', error);
        alert('Failed to delete: ' + (error.message || error));
    }
}

async function addHereRaminTool() {
    const nameInput = document.getElementById('hrToolName');
    const categoryInput = document.getElementById('hrToolCategory');
    const imageInput = document.getElementById('hrToolImageUrl');
    const wikiHowInput = document.getElementById('hrToolWikiHowUrl');
    const descriptionInput = document.getElementById('hrToolDescription');
    const qtyAvailableInput = document.getElementById('hrToolQtyAvailable');
    const qtyTotalInput = document.getElementById('hrToolQtyTotal');

    const toolName = (nameInput?.value || '').trim();
    const category = (categoryInput?.value || '').trim() || 'General Tools';
    const imageUrl = (imageInput?.value || '').trim();
    const wikiHowUrl = (wikiHowInput?.value || '').trim();
    const description = (descriptionInput?.value || '').trim();
    const qtyAvailable = Number(qtyAvailableInput?.value || 0);
    const qtyTotal = Number(qtyTotalInput?.value || 0);

    if (!toolName) {
        alert('Tool name is required.');
        return;
    }
    if (!Number.isFinite(qtyAvailable) || !Number.isFinite(qtyTotal) || qtyAvailable < 0 || qtyTotal <= 0 || qtyAvailable > qtyTotal) {
        alert('Please enter valid quantities (available must be between 0 and total).');
        return;
    }

    const docId = hereRaminEditingToolId || slugifyToolName(toolName) || `tool-${Date.now()}`;
    const payload = {
        tool_name: toolName,
        category,
        image_url: hereRaminUploadedImageDataUrl || imageUrl,
        wikihow_url: wikiHowUrl,
        description,
        quantity_available: qtyAvailable,
        quantity_total: qtyTotal,
        available: qtyAvailable > 0,
        status_: qtyAvailable > 0 ? 'Available' : 'Unavailable',
        updated_at: new Date().toISOString()
    };

    try {
        await setDoc(doc(db, HERERAMIN_TOOLS_COLLECTION, docId), payload, { merge: true });
        logAction(hereRaminEditingToolId ? 'hereramin_tool_edit' : 'hereramin_tool_add', `${hereRaminEditingToolId ? 'Edited' : 'Added'} HERE-RAMIN tool: "${toolName}"`, { toolId: docId, category });
        resetHereRaminToolForm();
    } catch (error) {
        console.error('Failed to add HERE-RAMIN tool', error);
        alert('Failed to add tool: ' + (error.message || error));
    }
}

function editHereRaminTool(toolId) {
    showHereRaminToolEditModal(toolId);
}

async function toggleHereRaminToolAvailability(toolId) {
    const tool = hereRaminTools.find((entry) => entry.id === toolId);
    if (!tool) return;
    const nextAvailable = !tool.available;
    const nextQtyAvailable = nextAvailable ? Math.max(1, tool.quantity_available || 1) : 0;
    try {
        await setDoc(doc(db, HERERAMIN_TOOLS_COLLECTION, toolId), {
            available: nextAvailable,
            quantity_available: nextQtyAvailable,
            status_: nextAvailable ? 'Available' : 'Unavailable',
            updated_at: new Date().toISOString()
        }, { merge: true });
        logAction('hereramin_tool_toggle', `Updated HERE-RAMIN tool availability: "${tool.tool_name}" -> ${nextAvailable ? 'available' : 'unavailable'}`, { toolId });
    } catch (error) {
        console.error('Failed to update HERE-RAMIN tool availability', error);
        alert('Failed to update availability: ' + (error.message || error));
    }
}

async function deleteHereRaminTool(toolId) {
    const tool = hereRaminTools.find((entry) => entry.id === toolId);
    if (!tool) return;
    if (!confirm(`Delete "${tool.tool_name}" from HERE-RAMIN tools?`)) return;
    try {
        await deleteDoc(doc(db, HERERAMIN_TOOLS_COLLECTION, toolId));
        logAction('hereramin_tool_delete', `Deleted HERE-RAMIN tool: "${tool.tool_name}"`, { toolId });
    } catch (error) {
        console.error('Failed to delete HERE-RAMIN tool', error);
        alert('Failed to delete tool: ' + (error.message || error));
    }
}

async function updateHereRaminReceiptStatus(recordId, nextState) {
    try {
        await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, recordId), {
            status: nextState,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        logAction('hereramin_receipt_status', `Updated HERE-RAMIN receipt ${recordId} -> ${nextState}`, { recordId, nextState });
        updateHereRaminReceipts();
        updateHereRaminAnalytics();
    } catch (error) {
        console.error('Failed to update HERE-RAMIN receipt status', error);
        alert('Failed to update receipt status: ' + (error.message || error));
    }
}

async function archiveHereRaminBorrower(recordId) {
    if (!confirm('Archive this borrower record?')) return;
    try {
        await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, recordId), {
            archived: true,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        updateHereRaminReceipts();
        updateHereRaminAnalytics();
    } catch (error) {
        console.error('Failed to archive borrower record', error);
        alert('Failed to archive borrower record: ' + (error.message || error));
    }
}

async function deleteHereRaminBorrower(recordId) {
    if (!confirm('Delete this borrower record?')) return;
    try {
        await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, recordId), {
            deleted: true,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        updateHereRaminReceipts();
        updateHereRaminAnalytics();
    } catch (error) {
        console.error('Failed to delete borrower record', error);
        alert('Failed to delete borrower record: ' + (error.message || error));
    }
}

async function clearHereRaminBorrowers() {
    const activeRows = hereRaminBorrowRecords.filter((record) => !record.deleted && !record.archived);
    if (!activeRows.length) {
        alert('No active borrowers to clear.');
        return;
    }
    if (!confirm(`Archive ${activeRows.length} borrower record(s)?`)) return;

    try {
        await Promise.all(activeRows.map((record) => setDoc(doc(db, BORROW_REQUESTS_COLLECTION, record.id), {
            archived: true,
            updatedAt: new Date().toISOString()
        }, { merge: true })));
    } catch (error) {
        console.error('Failed to clear borrower records', error);
        alert('Failed to clear borrowers: ' + (error.message || error));
    }
}

// ── BORROW REQUEST DETAIL MODAL FUNCTIONS ──
let currentBorrowDetailId = null;

function openBorrowDetail(recordId) {
    const record = hereRaminBorrowRecords.find(r => r.id === recordId);
    if (!record) {
        alert('Borrow request not found.');
        return;
    }

    currentBorrowDetailId = recordId;

    // Populate borrower info
    // Populate borrower info — prefer organizationName, then name, then fallback fields
    const borrowerDisplayName = record.borrower?.organizationName || record.borrower?.name || record.userEmail || record.borrower?.organization || '-';
    document.getElementById('bd-borrower-name').textContent = borrowerDisplayName;
    document.getElementById('bd-borrower-age').textContent = record.borrower?.age || '-';
    // Use contact fallbacks
    document.getElementById('bd-borrower-contact').textContent = record.borrower?.contact || record.borrower?.phone || record.contact || '-';
    document.getElementById('bd-borrower-address').textContent = record.borrower?.address || record.borrower?.location || '-';

    // Populate tool info
    document.getElementById('bd-tool-name').textContent = record.tool?.name || '-';
    document.getElementById('bd-tool-qty').textContent = record.tool?.quantity || '-';
    document.getElementById('bd-tool-purpose').textContent = record.purpose || '-';

    // Populate schedule
    document.getElementById('bd-borrow-date').textContent = record.schedule?.borrowDate || '-';
    document.getElementById('bd-return-date').textContent = record.schedule?.returnDate || '-';

    // Populate images
    const idImg = document.getElementById('bd-id-image');
    const idLink = document.getElementById('bd-id-link');
    const sigImg = document.getElementById('bd-signature-image');
    
    const idSrc = record.validIdImage || record.organizationLetterPreview || record.organizationLetter || record.idImage || '';
    const isImage = /^data:image\//.test(idSrc) || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(idSrc);
    if (idSrc) {
        if (isImage) {
            idImg.src = idSrc;
            idImg.style.display = 'block';
            if (idLink) idLink.style.display = 'none';
        } else {
            idImg.style.display = 'none';
            if (idLink) {
                idLink.href = idSrc;
                idLink.style.display = 'inline-block';
                idLink.textContent = 'Open valid ID / document';
            }
        }
    } else {
        idImg.style.display = 'none';
        if (idLink) idLink.style.display = 'none';
    }

    if (record.signatureImage) {
        sigImg.src = record.signatureImage;
        sigImg.style.display = 'block';
    } else {
        sigImg.style.display = 'none';
    }

    // Set current status
    document.getElementById('bd-status-select').value = record.status || 'in_use';

    // Show modal
    document.getElementById('borrowDetailModal').style.display = 'flex';
}

function closeBorrowDetailModal() {
    document.getElementById('borrowDetailModal').style.display = 'none';
    currentBorrowDetailId = null;
}

async function updateBorrowDetailStatus() {
    if (!currentBorrowDetailId) return;

    const newStatus = document.getElementById('bd-status-select').value;
    try {
        await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, currentBorrowDetailId), {
            status: newStatus,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        closeBorrowDetailModal();
        updateHereRaminReceipts();
    } catch (error) {
        console.error('Failed to update borrow request status', error);
        alert('Failed to update status: ' + (error.message || error));
    }
}

async function archiveBorrowDetail() {
    if (!currentBorrowDetailId) return;
    if (!confirm('Archive this borrower request?')) return;

    try {
        await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, currentBorrowDetailId), {
            archived: true,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        closeBorrowDetailModal();
        updateHereRaminReceipts();
    } catch (error) {
        console.error('Failed to archive borrow request', error);
        alert('Failed to archive: ' + (error.message || error));
    }
}

async function deleteBorrowDetail() {
    if (!currentBorrowDetailId) return;
    if (!confirm('Permanently delete this borrower request?')) return;

    try {
        await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, currentBorrowDetailId), {
            deleted: true,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        closeBorrowDetailModal();
        updateHereRaminReceipts();
    } catch (error) {
        console.error('Failed to delete borrow request', error);
        alert('Failed to delete: ' + (error.message || error));
    }
}

// Dashboard
function updateDashboard() {
    const totalVolunteers = users.filter(u => normalizeStatus(u.status) === 'approved').length;
    const pendingApps = users.filter(u => normalizeStatus(u.status) === 'pending').length;
    const approvedUsers = users.filter(u => normalizeStatus(u.status) === 'approved').length;
    const rejectedUsers = users.filter(u => normalizeStatus(u.status) === 'rejected').length;
    const activePrograms = programs.filter(p => p.status === 'active').length;
    const completedPrograms = programs.filter(p => p.status === 'completed').length;

    document.getElementById('totalVolunteers').textContent = totalVolunteers;
    document.getElementById('pendingApps').textContent = pendingApps;
    document.getElementById('approvedUsers').textContent = approvedUsers;
    document.getElementById('rejectedUsers').textContent = rejectedUsers;
    document.getElementById('activePrograms').textContent = activePrograms;
    document.getElementById('completedPrograms').textContent = completedPrograms;

    // Populate dashboard task overview tables
    if (typeof window.refreshAdminDashboard === 'function') {
        window.refreshAdminDashboard(programs);
    }
}

// Analytics
function updateAnalytics() {
    const totalHours = users.reduce((sum, u) => sum + (u.hours || 0), 0);
    const activeVolunteers = users.filter(u => normalizeStatus(u.status) === 'approved' && u.hours > 0).length;
    const inactiveVolunteers = users.filter(u => normalizeStatus(u.status) === 'approved' && u.hours === 0).length;
    const completedProgramsCount = programs.filter(p => p.status === 'completed').length;
    const totalPrograms = programs.length;
    const completionRate = totalPrograms > 0 ? Math.round((completedProgramsCount / totalPrograms) * 100) : 0;

    document.getElementById('totalHours').textContent = `${totalHours} hours`;
    document.getElementById('activeInactive').textContent = `${activeVolunteers} active, ${inactiveVolunteers} inactive`;
    document.getElementById('completionRate').textContent = `${completionRate}%`;

    // Top programs
    const programCounts = {};
    programs.forEach(p => {
        if (p.status === 'completed') {
            programCounts[p.name] = (programCounts[p.name] || 0) + 1;
        }
    });
    const topPrograms = Object.entries(programCounts).sort((a,b) => b[1] - a[1]).slice(0, 3);
    document.getElementById('topPrograms').innerHTML = topPrograms.length > 0
        ? topPrograms.map(([name, count]) => `<li>${name}: ${count} completions</li>`).join('')
        : '<li>No completed programs yet.</li>';

    // Badge distribution
    const badges = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0, None: 0 };
    users.forEach(u => {
        badges[u.badge || 'None']++;
    });
    document.getElementById('badgeChart').innerHTML = Object.entries(badges).map(([badge, count]) => `<div>${badge}: ${count}</div>`).join('');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const newThisMonth = users.filter((u) => {
        if (!u.createdAt) return false;
        const createdDate = new Date(u.createdAt);
        return !Number.isNaN(createdDate.getTime()) && createdDate >= monthStart;
    }).length;
    document.getElementById('volunteerGrowth').textContent = `Growth over time: +${newThisMonth} this month`;

    // Refresh analytics charts in new layout
    if (typeof window.refreshAnalyticsCharts === 'function') {
        window.refreshAnalyticsCharts(users, programs);
    }
}

// Volunteers
function updateVolunteers() {
    // Keep volunteers/programs in sync with latest Program Management changes.
    refreshLocalAdminCache();

    const list = document.getElementById('volunteerList');
    const statusFilter = document.getElementById('volunteerStatusFilter')?.value || 'approved';
    const programFilterValue = document.getElementById('volunteerProgramFilter')?.value || '';
    const filteredUsers = statusFilter === 'all'
        ? users
        : users.filter((u) => normalizeStatus(u.status) === statusFilter);
    const filteredByProgram = programFilterValue
        ? filteredUsers.filter((u) => isVolunteerInProgram(u, programFilterValue))
        : filteredUsers;
    const selectedProgram = programs.find((p) => p.id === programFilterValue);
    const programNameLabel = selectedProgram ? ` for ${selectedProgram.name || selectedProgram.title || 'Selected Program'}` : '';

    // Pending validation section — volunteers who submitted tasks for admin review
    const pendingValidationItems = [];
    users.forEach(u => {
        (u.pendingValidation || []).forEach(programId => {
            const prog = programs.find(p => p.id === programId);
            pendingValidationItems.push({ user: u, programId, programName: prog ? (prog.name || prog.title) : programId });
        });
    });

    const pendingValidationHTML = pendingValidationItems.length > 0 ? `
        <div style="margin-bottom:20px; padding:16px; border-radius:14px; background:rgba(255,248,236,0.12); border:1px solid rgba(255,248,236,0.2);">
            <strong style="display:block;margin-bottom:12px;">⏳ Pending Task Validation (${pendingValidationItems.length})</strong>
            ${pendingValidationItems.map(item => `
                <div class="volunteer-item" style="margin-bottom:10px;">
                    <div>
                        <strong>${item.user.name}</strong> submitted <em>${item.programName}</em> for validation<br>
                        <small>Hours: ${item.user.hours || 0} | Badge: ${item.user.badge || 'None'}</small>
                    </div>
                    <div>
                        <button class="approve-btn" onclick="approveTaskValidation('${item.programId}','${item.user.id}')">Approve ✓</button>
                        <button class="reject-btn" onclick="rejectTaskValidation('${item.programId}','${item.user.id}')">Reject ✗</button>
                    </div>
                </div>
            `).join('')}
        </div>
    ` : '';
    list.innerHTML = pendingValidationHTML + `
        <div class="volunteer-section">
            <div class="volunteer-card">
                <strong>${statusFilter === 'pending' ? 'Pending Volunteers' : `Volunteers (${statusFilter})`}${programNameLabel}</strong>
                ${filteredByProgram.length > 0 ? filteredByProgram.map(u => `
                    <div class="volunteer-item">
                        <div>
                            <strong>${u.name}</strong><br>
                            Email: ${u.email}<br>
                            Age: ${u.age}, Barangay: ${u.barangay}<br>
                            Skills: ${Array.isArray(u.skills) ? u.skills.join(', ') : ''}<br>
                            Enrolled: ${Array.isArray(u.enrolledPrograms) ? u.enrolledPrograms.join(', ') : 'None'}<br>
                            Completed: ${Array.isArray(u.completedPrograms) ? u.completedPrograms.join(', ') : 'None'}<br>
                            Status: ${normalizeStatus(u.status)}, Hours: ${u.hours || 0}, Badge: ${u.badge || 'None'}
                        </div>
                        <div>
                            ${normalizeStatus(u.status) === 'pending' ? `
                                <button class="approve-btn" onclick="approveUser('${u.id}')">Approve</button>
                                <button class="reject-btn" onclick="rejectUser('${u.id}')">Reject</button>
                            ` : ''}
                        </div>
                    </div>
                `).join('') : `<div>No Participants in this view yet for ${statusFilter}${programNameLabel}</div>`}
            </div>
        </div>
    `;

    updateVolunteerProgramFilter();
    updateVolunteerProgramParticipants();
    updateAttendanceProgramOptions();

    // Refresh task validation tab
    if (typeof window.refreshTaskValidation === 'function') {
        window.refreshTaskValidation(users, programs);
    }
}

function updateVolunteerProgramFilter() {
    // Always pull latest program list from local cache source.
    refreshLocalAdminCache();

    const filter = document.getElementById('volunteerProgramFilter');
    if (!filter) return;
    filter.innerHTML = programs.map(program => `
        <option value="${program.id}">${program.name || program.title || 'Untitled Program'}</option>
    `).join('');
    if (!filter.value || !programs.some(p => p.id === filter.value)) {
        filter.value = programs.length > 0 ? programs[0].id : '';
    }
    updateVolunteerProgramParticipants();
}

function updateAttendanceProgramOptions() {
    const select = document.getElementById('attendanceProgramSelect');
    const qrSelect = document.getElementById('qrAssignProgramSelect');
    const html = programs.map((program) => `
        <option value="${program.id}">${program.name || program.title || 'Untitled Program'}</option>
    `).join('');
    if (select) {
        select.innerHTML = html;
        if (!select.value && programs.length > 0) {
            select.value = programs[0].id;
        }
    }
    if (qrSelect) {
        qrSelect.innerHTML = html;
        if (!qrSelect.value && programs.length > 0) {
            qrSelect.value = programs[0].id;
        }
    }
    updateAttendanceVolunteerOptions();
}

function updateAttendanceVolunteerOptions() {
    const programSelect = document.getElementById('attendanceProgramSelect');
    const volunteerSelect = document.getElementById('attendanceVolunteerSelect');
    if (!programSelect || !volunteerSelect) return;
    const programId = programSelect.value;
    const official = getOfficialParticipantsForProgram(programId);
    volunteerSelect.innerHTML = official.map((u) => `
        <option value="${u.id}">${u.name} (${u.email || 'no email'})</option>
    `).join('');
}

function getOfficialParticipantsForProgram(programId) {
    // Officially joined means: program.joined contains userId AND volunteer is approved
    const program = programs.find(p => p.id === programId) || {};
    const joined = Array.isArray(program.joined) ? program.joined : [];
    return users.filter((u) =>
        normalizeStatus(u.status) === 'approved' &&
        joined.includes(u.id)
    );
}

function getPendingParticipantsForProgram(programId) {
    const program = programs.find(p => p.id === programId) || {};
    const pending = Array.isArray(program.pendingJoins) ? program.pendingJoins : [];
    return users.filter((u) =>
        normalizeStatus(u.status) === 'approved' &&
        pending.includes(u.id)
    );
}

function isVolunteerInProgram(user, programId) {
    const program = programs.find(p => p.id === programId) || {};
    const joined = Array.isArray(program.joined) ? program.joined : [];
    const pending = Array.isArray(program.pendingJoins) ? program.pendingJoins : [];
    return joined.includes(user.id)
        || pending.includes(user.id)
        || (Array.isArray(user.completedPrograms) && user.completedPrograms.includes(programId));
}

function isFinishedForProgram(user, programId) {
    return Array.isArray(user.completedPrograms) && user.completedPrograms.includes(programId);
}

function updateVolunteerProgramParticipants() {
    refreshLocalAdminCache();

    const filter = document.getElementById('volunteerProgramFilter');
    const statusFilter = document.getElementById('volunteerStatusFilter')?.value || 'all';
    const participantContainer = document.getElementById('programParticipantList');
    if (!filter || !participantContainer) return;

    const programId = filter.value;
    const joinStatusFilter = 'all';
    const program = programs.find(p => p.id === programId) || {};
    const official = getOfficialParticipantsForProgram(programId).filter((u) =>
        statusFilter === 'all' || normalizeStatus(u.status) === statusFilter
    );
    const pending = getPendingParticipantsForProgram(programId).filter((u) =>
        statusFilter === 'all' || normalizeStatus(u.status) === statusFilter
    );

    const finishedOfficial = official.filter((u) => isFinishedForProgram(u, programId));
    const notFinishedOfficial = official.filter((u) => !isFinishedForProgram(u, programId));

    let shown = official;
    if (joinStatusFilter === 'pending') shown = pending;
    if (joinStatusFilter === 'finished') shown = finishedOfficial;
    if (joinStatusFilter === 'not_finished') shown = notFinishedOfficial;
    if (joinStatusFilter === 'all') shown = [...official, ...pending];

    participantContainer.innerHTML = `
        <div style="padding: 16px; border-radius: 14px; background: rgba(255,255,255,0.08); margin-bottom: 18px;">
            <strong>Participants for:</strong> ${program.name || program.title || 'Selected Program'}<br>
            <small>
                Official: ${official.length} • Pending: ${pending.length} • Finished: ${finishedOfficial.length}
            </small>
        </div>
        ${shown.length > 0 ? shown.map(user => {
            const inPending = Array.isArray(program.pendingJoins) && program.pendingJoins.includes(user.id);
            const inOfficial = Array.isArray(program.joined) && program.joined.includes(user.id);
            const finished = isFinishedForProgram(user, programId);
            return `
            <div class="volunteer-item">
                <div>
                    <strong>${user.name}</strong><br>
                    Email: ${user.email || 'N/A'}<br>
                    Hours: ${user.hours || 0}<br>
                    Completed Programs: ${Array.isArray(user.completedPrograms) ? user.completedPrograms.join(', ') : 'None'}
                </div>
                <div>
                    ${inPending ? `
                        <button class="approve-btn" onclick="approveJoinRequest('${programId}','${user.id}')">Approve join</button>
                        <button class="reject-btn" onclick="rejectJoinRequest('${programId}','${user.id}')">Reject</button>
                    ` : finished ? `
                        <span style="display:inline-block;padding:8px 12px;border-radius:12px;background:#5cb85c;color:#fff;">Finished</span>
                    ` : inOfficial ? `
                        <button class="approve-btn" onclick="markVolunteerCompleted('${programId}','${user.id}')">Mark finished</button>
                    ` : `
                        <span style="display:inline-block;padding:8px 12px;border-radius:12px;background:#6c757d;color:#fff;">Not official</span>
                    `}
                </div>
            </div>
        `;
        }).join('') : '<div>No participants in this view yet.</div>'}
    `;
}

function onVolunteerProgramFilterChange() {
    updateVolunteers();
    updateVolunteerProgramParticipants();
    updateAttendanceProgramOptions();
}

function onVolunteerStatusFilterChange() {
    updateVolunteers();
    updateVolunteerProgramParticipants();
}

window.forceSyncData = () => {
    const cacheKeys = [
        'itanimUsers',
        'itanimPrograms',
        'itanimCerts',
        'itanimSkills',
        'itanimRestrictions',
        'itanimBadges',
        'itanimNotifications'
    ];
    cacheKeys.forEach((key) => localStorage.removeItem(key));
    users = [];
    programs = [];
    certifications = [];
    skills = [];
    restrictions = { minAge: 18, validBarangays: 'All' };
    badgeThresholds = { bronze: 10, silver: 25, gold: 50, platinum: 100 };
    notifications = [];

    updateDashboard();
    updateAnalytics();
    updatePrograms();
    updateVolunteers();
    updateVolunteerProgramFilter();
    updateVolunteerProgramParticipants();
    updateAttendanceProgramOptions();

    if (typeof fetchAndRenderPrograms === 'function') {
        fetchAndRenderPrograms();
    }

    // Force a clean UI load after clearing cached state.
    alert('Local admin cache cleared. Reloading the page to fetch fresh Firestore data.');
    window.location.reload();
};

async function approveJoinRequest(programId, userId) {
    const program = programs.find(p => p.id === programId);
    const user = users.find(u => u.id === userId);
    if (!program || !user) {
        alert('Program or user not found.');
        return;
    }
    if (normalizeStatus(user.status) !== 'approved') {
        alert('User must be approved before joining programs.');
        return;
    }

    program.pendingJoins = Array.isArray(program.pendingJoins) ? program.pendingJoins : [];
    program.joined = Array.isArray(program.joined) ? program.joined : [];

    program.pendingJoins = program.pendingJoins.filter((id) => id !== userId);
    if (!program.joined.includes(userId)) {
        program.joined.push(userId);
    }

    user.enrolledPrograms = Array.isArray(user.enrolledPrograms) ? user.enrolledPrograms : [];
    if (!user.enrolledPrograms.includes(programId)) {
        user.enrolledPrograms.push(programId);
    }

    savePrograms();
    saveUsers();

    if (useFirestore) {
        try {
            await setDoc(doc(db, 'programs', programId), {
                joined: program.joined,
                pendingJoins: program.pendingJoins
            }, { merge: true });
            await setDoc(doc(db, 'volunteers', userId), {
                enrolledPrograms: arrayUnion(programId)
            }, { merge: true });
        } catch (err) {
            console.warn('Could not sync join approval to Firestore', err);
        }
    }

    updateVolunteerProgramParticipants();
    alert(`${user.name} is now officially joined to ${program.name || program.title}.`);
}

let qrScannerStream = null;
let qrScannerTimer = null;

function openQrScanner() {
    const scanner = document.getElementById('qrScannerContainer');
    if (!scanner) return;
    scanner.style.display = 'block';
    startQrScanner();
}

function closeQrScanner() {
    const scanner = document.getElementById('qrScannerContainer');
    if (scanner) {
        scanner.style.display = 'none';
    }
    stopQrScanner();
}

async function startQrScanner() {
    const status = document.getElementById('qrScannerStatus');
    const video = document.getElementById('qrScannerVideo');
    if (!video) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Camera access is not supported by this browser.');
        return;
    }

    try {
        qrScannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = qrScannerStream;
        await video.play();
        if (status) status.textContent = 'Scanning for QR code...';

        qrScannerTimer = window.setInterval(() => {
            scanQrFrame().catch((err) => console.warn('QR scan frame error', err));
        }, 300);
    } catch (err) {
        console.warn('QR scanner camera access failed with environment camera', err);
        // Try fallback without facingMode
        try {
            qrScannerStream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = qrScannerStream;
            await video.play();
            if (status) status.textContent = 'Scanning for QR code (fallback camera)...';

            qrScannerTimer = window.setInterval(() => {
                scanQrFrame().catch((err) => console.warn('QR scan frame error', err));
            }, 300);
        } catch (fallbackErr) {
            console.warn('QR scanner camera access failed completely', fallbackErr);
            if (status) {
                status.textContent = 'Camera access denied or unavailable. Please allow camera permission.';
            }
            alert('Cannot open camera. Please allow access or use the registry ID field instead.');
        }
    }
}

function stopQrScanner() {
    if (qrScannerTimer) {
        window.clearInterval(qrScannerTimer);
        qrScannerTimer = null;
    }
    if (qrScannerStream) {
        qrScannerStream.getTracks().forEach((track) => track.stop());
        qrScannerStream = null;
    }
    const video = document.getElementById('qrScannerVideo');
    if (video) {
        video.srcObject = null;
    }
}

async function decodeQrFromFrame(imageData, width, height) {
    console.log('Decoding QR from frame, jsQR defined:', typeof jsQR);
    if (typeof jsQR !== 'undefined') {
        const result = jsQR(imageData.data, width, height);
        console.log('jsQR result:', result);
        return result;
    }

    if ('BarcodeDetector' in window) {
        try {
            const detector = new BarcodeDetector({ formats: ['qr_code'] });
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.putImageData(imageData, 0, 0);
            const bitmap = await createImageBitmap(canvas);
            const results = await detector.detect(bitmap);
            if (results && results.length) {
                console.log('BarcodeDetector result:', results[0].rawValue);
                return { data: results[0].rawValue };
            }
        } catch (err) {
            console.warn('BarcodeDetector QR fallback failed', err);
        }
    }

    return null;
}

async function scanQrFrame() {
    const video = document.getElementById('qrScannerVideo');
    const canvas = document.getElementById('qrScannerCanvas');
    const status = document.getElementById('qrScannerStatus');
    if (!video || !canvas || !status) return;
    if (video.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
        console.log('Video not ready for scanning');
        return;
    }
    if (!video.videoWidth || !video.videoHeight) {
        console.log('Video dimensions not available');
        return;
    }

    console.log('Scanning QR frame...');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = await decodeQrFromFrame(imageData, imageData.width, imageData.height);

    if (code && code.data) {
        console.log('QR code detected:', code.data);
        const rawId = String(code.data || '').trim();
        const volunteerInput = document.getElementById('qrVolunteerIdInput');
        if (volunteerInput) {
            volunteerInput.value = rawId;
        }
        if (status) status.textContent = `QR captured: ${rawId}. Click Assign to complete.`;
        stopQrScanner();
    } else {
        console.log('No QR code found in frame');
    }
}

async function assignVolunteerByQr() {
    const programSelect = document.getElementById('qrAssignProgramSelect');
    const volunteerInput = document.getElementById('qrVolunteerIdInput');
    if (!programSelect || !volunteerInput) return;
    const programId = programSelect.value;
    const volunteerId = String(volunteerInput.value || '').trim();
    if (!programId || !volunteerId) {
        alert('Please select a program and enter a volunteer registry ID.');
        return;
    }

    const program = programs.find((p) => p.id === programId);
    const lookupId = volunteerId.toLowerCase();
    const user = users.find((u) => {
        const volunteerIdValue = String(u.volunteerID || '').trim().toLowerCase();
        const userIdValue = String(u.id || '').trim().toLowerCase();
        const fallbackVolunteerIdValue = `grw-${String(u.id || '').substring(0, 5).toLowerCase()}`;
        const emailValue = String(u.email || '').trim().toLowerCase();
        return volunteerIdValue === lookupId
            || userIdValue === lookupId
            || fallbackVolunteerIdValue === lookupId
            || emailValue === lookupId;
    });
    if (!program || !user) {
        console.warn('[assignVolunteerByQr] lookup failed', {
            programId,
            volunteerId,
            usersCount: users.length,
            programsCount: programs.length,
            sampleUsers: users.slice(0, 5).map((u) => ({ id: u.id, volunteerID: u.volunteerID, email: u.email }))
        });
        alert('Program or volunteer not found. Check the registry ID/email and selected program.');
        return;
    }
    if (normalizeStatus(user.status) !== 'approved') {
        alert('Volunteer must be approved before assignment.');
        return;
    }

    program.joined = Array.isArray(program.joined) ? program.joined : [];
    if (!program.joined.includes(user.id)) {
        program.joined.push(user.id);
    }
    user.enrolledPrograms = Array.isArray(user.enrolledPrograms) ? user.enrolledPrograms : [];
    if (!user.enrolledPrograms.includes(programId)) {
        user.enrolledPrograms.push(programId);
    }

    savePrograms();
    saveUsers();

    if (useFirestore) {
        try {
            await setDoc(doc(db, 'programs', programId), {
                joined: program.joined
            }, { merge: true });
            await setDoc(doc(db, 'volunteers', user.id), {
                enrolledPrograms: arrayUnion(programId)
            }, { merge: true });
        } catch (err) {
            console.warn('Could not sync volunteer assignment to Firestore', err);
        }
    }

    updateVolunteerProgramParticipants();
    updateVolunteers();
    updateDashboard();
    updateAnalytics();
    alert(`${user.name} has been assigned to ${program.name || program.title}.`);
}

async function rejectJoinRequest(programId, userId) {
    const program = programs.find(p => p.id === programId);
    const user = users.find(u => u.id === userId);
    if (!program || !user) {
        alert('Program or user not found.');
        return;
    }

    program.pendingJoins = Array.isArray(program.pendingJoins) ? program.pendingJoins : [];
    program.pendingJoins = program.pendingJoins.filter((id) => id !== userId);

    savePrograms();

    if (useFirestore) {
        try {
            await setDoc(doc(db, 'programs', programId), {
                pendingJoins: program.pendingJoins
            }, { merge: true });
        } catch (err) {
            console.warn('Could not sync join rejection to Firestore', err);
        }
    }

    updateVolunteerProgramParticipants();
    alert(`Join request removed for ${user.name}.`);
}

async function markVolunteerCompleted(programId, userId) {
    const program = programs.find(p => p.id === programId);
    const user = users.find(u => u.id === userId);
    if (!program || !user) {
        alert('Program or user not found.');
        return;
    }
    program.joined = Array.isArray(program.joined) ? program.joined : [];
    if (!program.joined.includes(userId)) {
        alert('Only officially joined volunteers can be marked finished.');
        return;
    }
    user.enrolledPrograms = Array.isArray(user.enrolledPrograms) ? user.enrolledPrograms : [];
    user.completedPrograms = Array.isArray(user.completedPrograms) ? user.completedPrograms : [];
    if (user.completedPrograms.includes(programId)) {
        alert('This participant is already marked finished.');
        return;
    }
    user.completedPrograms.push(programId);
    // Remove from pendingValidation if present
    user.pendingValidation = Array.isArray(user.pendingValidation) ? user.pendingValidation.filter(id => id !== programId) : [];
    user.hours = (user.hours || 0) + (program.hours || 0);
    // Auto-update badge based on admin-defined thresholds
    updateBadge(user);
    saveUsers();

    if (useFirestore) {
        try {
            await setDoc(doc(db, 'volunteers', userId), {
                hours: user.hours,
                badge: user.badge || 'None',
                enrolledPrograms: arrayUnion(programId),
                completedPrograms: arrayUnion(programId),
                pendingValidation: user.pendingValidation
            }, { merge: true });
        } catch (err) {
            console.warn('Could not update volunteer completion in Firestore', err);
        }
    }

    // Send notification to volunteer
    sendNotification(
        `Your completion of "${program.name || program.title}" has been approved! ${program.hours || 0} hours added to your total.`,
        'program',
        user.email
    );

    // Ask admin whether to issue certification immediately
    const grantCert = confirm(`Do you want to issue a completion certificate for ${user.name} now?\n\nOK = Yes, issue certification now.\nCancel = No, leave the user able to request certification later.`);
    if (grantCert) {
        await issueApprovedCertificationForCompletion(user, program);
    }

    updateVolunteerProgramParticipants();
    updateVolunteers();
    updateDashboard();
    updateAnalytics();
    alert(`${user.name} has been marked finished for ${program.name || program.title}. Hours updated.`);
}

async function issueApprovedCertificationForCompletion(user, program) {
    if (!user || !program) return;

    const existingCert = certifications.find((c) => c.userId === user.id && c.programId === program.id);
    const now = new Date();
    const timestamp = now.toISOString();
    const approvedCert = existingCert || {
        id: `cert-${Date.now()}`,
        userId: user.id,
        userEmail: user.email || '',
        programId: program.id,
        programTitle: program.name || program.title || '',
        status: 'approved',
        reason: `Approved by admin upon completion of ${program.name || program.title}.`,
        proofDetails: `Admin verified completion and issued certificate on ${now.toLocaleDateString()}.`,
        requestedAt: timestamp,
        hoursAtRequest: Number(user.hours || 0),
        completedProgramsAtRequest: Array.isArray(user.completedPrograms) ? user.completedPrograms.length : 0,
        badgeAtRequest: user.badge || 'None'
    };

    approvedCert.status = 'approved';
    approvedCert.issuedDate = timestamp.slice(0, 10);
    approvedCert.approvedAt = timestamp;
    approvedCert.updatedAt = timestamp;
    approvedCert.validUntil = `${now.getFullYear() + 1}-12-31`;
    approvedCert.certificateType = user?.badge && user.badge !== 'None' ? 'with_badge' : 'without_badge';
    approvedCert.name = approvedCert.name || 'Volunteer Certification';
    approvedCert.description = approvedCert.description || `Approved certification for ${user?.name || approvedCert.userEmail || 'volunteer'}`;
    approvedCert.adminNote = approvedCert.adminNote || `Approved after completion verification (${approvedCert.hoursAtRequest} hrs, ${approvedCert.completedProgramsAtRequest} completed).`;

    if (!existingCert) {
        certifications.unshift(approvedCert);
    }

    saveCerts();
    sendNotification(`Your certificate for "${program.name || program.title}" has been issued!`, 'certification', user.email);
    alert(`Certificate issued for ${user.name}. The user will see it once the dashboard refreshes.`);
}

window.markVolunteerCompleted = markVolunteerCompleted;
window.approveJoinRequest = approveJoinRequest;
window.rejectJoinRequest = rejectJoinRequest;
window.assignVolunteerByQr = assignVolunteerByQr;
window.openQrScanner = openQrScanner;
window.closeQrScanner = closeQrScanner;

/* ── Task Validation: Admin approves/rejects user-submitted completions ── */
async function approveTaskValidation(programId, userId) {
    // Delegates to markVolunteerCompleted which adds hours, updates badge, clears pendingValidation
    await markVolunteerCompleted(programId, userId);
}

async function rejectTaskValidation(programId, userId) {
    const user = users.find(u => u.id === userId);
    const program = programs.find(p => p.id === programId);
    if (!user || !program) { alert('User or program not found.'); return; }

    // Remove from pendingValidation → task returns to "In Progress"
    user.pendingValidation = Array.isArray(user.pendingValidation)
        ? user.pendingValidation.filter(id => id !== programId)
        : [];
    saveUsers();

    if (useFirestore) {
        try {
            await setDoc(doc(db, 'volunteers', userId), {
                pendingValidation: user.pendingValidation
            }, { merge: true });
        } catch(err) { console.warn('Could not update Firestore pendingValidation', err); }
    }

    sendNotification(
        `Your completion submission for "${program.name || program.title}" was not approved. Please continue and resubmit when ready.`,
        'program',
        user.email
    );
    logAction('task_reject', `Rejected task validation for ${user.name}: ${program.name || program.title}`, { userId, programId });
    updateVolunteers();
    alert(`Rejected. "${program.name || program.title}" returned to In Progress for ${user.name}.`);
}

window.approveTaskValidation = approveTaskValidation;
window.rejectTaskValidation = rejectTaskValidation;
window.updateAttendanceVolunteerOptions = updateAttendanceVolunteerOptions;
window.onVolunteerProgramFilterChange = onVolunteerProgramFilterChange;
window.onVolunteerStatusFilterChange = onVolunteerStatusFilterChange;

async function markVolunteerAbsent(programId, userId) {
    const program = programs.find(p => p.id === programId);
    const user = users.find(u => u.id === userId);
    if (!program || !user) {
        alert('Program or user not found.');
        return;
    }

    program.joined = Array.isArray(program.joined) ? program.joined : [];
    if (!program.joined.includes(userId)) {
        alert('Only officially joined volunteers can be marked absent.');
        return;
    }

    program.joined = program.joined.filter((id) => id !== userId);
    program.absent = Array.isArray(program.absent) ? program.absent : [];
    if (!program.absent.includes(userId)) {
        program.absent.push(userId);
    }

    user.enrolledPrograms = Array.isArray(user.enrolledPrograms) ? user.enrolledPrograms : [];
    user.enrolledPrograms = user.enrolledPrograms.filter((id) => id !== programId);
    user.absentPrograms = Array.isArray(user.absentPrograms) ? user.absentPrograms : [];
    if (!user.absentPrograms.includes(programId)) {
        user.absentPrograms.push(programId);
    }

    savePrograms();
    saveUsers();

    if (useFirestore) {
        try {
            await setDoc(doc(db, 'programs', programId), {
                joined: program.joined,
                absent: program.absent
            }, { merge: true });
            await setDoc(doc(db, 'volunteers', userId), {
                enrolledPrograms: arrayRemove(programId),
                absentPrograms: arrayUnion(programId)
            }, { merge: true });
        } catch (err) {
            console.warn('Could not sync absent update to Firestore', err);
        }
    }

    updateVolunteerProgramParticipants();
    updateAttendanceVolunteerOptions();
    alert(`${user.name} was marked absent for ${program.name || program.title}.`);
}

async function markVolunteerFinishedFromSelection() {
    const programId = document.getElementById('attendanceProgramSelect')?.value;
    const userId = document.getElementById('attendanceVolunteerSelect')?.value;
    if (!programId || !userId) {
        alert('Please select a program and volunteer.');
        return;
    }
    await markVolunteerCompleted(programId, userId);
    updateAttendanceVolunteerOptions();
}

async function markVolunteerAbsentFromSelection() {
    const programId = document.getElementById('attendanceProgramSelect')?.value;
    const userId = document.getElementById('attendanceVolunteerSelect')?.value;
    if (!programId || !userId) {
        alert('Please select a program and volunteer.');
        return;
    }
    await markVolunteerAbsent(programId, userId);
}

window.markVolunteerFinishedFromSelection = markVolunteerFinishedFromSelection;
window.markVolunteerAbsentFromSelection = markVolunteerAbsentFromSelection;

function hasCompletedProgram(user, programId) {
    return Array.isArray(user.completedPrograms) && user.completedPrograms.includes(programId);
}

function approveUser(id) {
    const user = users.find(u => u.id === id);
    if (user) {
        user.status = 'approved';
        saveUsers();
        updateVolunteers();
        sendNotification(`Your application has been approved!`, 'application', user.email);
        logAction('volunteer_approve', `Approved volunteer: ${user.name} (${user.email})`, { userId: id, userEmail: user.email });
        // Update Firestore
        if (useFirestore) {
            updateDoc(doc(db, 'volunteers', id), { status: 'approved' }).catch(err => console.warn('Could not update Firestore', err));
        }
    }
}

function rejectUser(id) {
    const user = users.find(u => u.id === id);
    if (user) {
        user.status = 'rejected';
        saveUsers();
        updateVolunteers();
        sendNotification(`Your application has been rejected.`, 'application', user.email);
        logAction('volunteer_reject', `Rejected volunteer: ${user.name} (${user.email})`, { userId: id, userEmail: user.email });
        // Update Firestore
        if (useFirestore) {
            updateDoc(doc(db, 'volunteers', id), { status: 'rejected' }).catch(err => console.warn('Could not update Firestore', err));
        }
    }
}

// Restrictions
function loadRestrictionsUI() {
    document.getElementById('minAge').value = restrictions.minAge;
    document.getElementById('validBarangays').value = restrictions.validBarangays;
}

function updateRestrictions() {
    loadRestrictionsUI();
}

function saveRestrictionsFromUI() {
    restrictions.minAge = parseInt(document.getElementById('minAge').value);
    restrictions.validBarangays = document.getElementById('validBarangays').value;
    saveRestrictions();
    alert('Restrictions updated!');
}

// ── Skills — Firestore-backed ──────────────────────────────────────────────

// ── Skills — Firestore real-time ──────────────────────────────────────────

let skillsUnsubscribe = null;

function fetchAndRenderSkills() {
    if (skillsUnsubscribe) return; // already listening
    skillsUnsubscribe = onSnapshot(
        collection(db, 'skills'),
        (snap) => {
            skills = [];
            snap.forEach(d => skills.push({ id: d.id, name: d.data().name || d.id }));
            // Sort alphabetically
            skills.sort((a, b) => a.name.localeCompare(b.name));
            updateSkills();
        },
        (err) => {
            console.error('[admin] skills onSnapshot error:', err.code, err.message);
            updateSkills();
        }
    );
}

function updateSkills() {
    // Render into the Settings tab list (settingsSkillList)
    const el = document.getElementById('settingsSkillList') || document.getElementById('skillList');
    if (!el) return;
    if (!skills.length) {
        el.innerHTML = '<li style="padding:12px 0;opacity:0.6;font-family:\'Montserrat\',sans-serif;font-size:0.85rem;list-style:none;">No skill categories yet. Click "Add New Category" to create one.</li>';
        return;
    }
    el.innerHTML = skills.map(s => {
        const name = typeof s === 'string' ? s : s.name;
        const id   = typeof s === 'string' ? name : s.id;
        return `<li style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid var(--border);list-style:none;">
            <span style="font-family:'Montserrat',sans-serif;font-size:0.9rem;font-weight:600;color:var(--primary);">${name}</span>
            <span style="display:flex;gap:6px;">
                <button class="edit-btn"   onclick="editSkill('${id.replace(/'/g,"\\'")}')">Edit</button>
                <button class="delete-btn" onclick="deleteSkill('${id.replace(/'/g,"\\'")}')">Delete</button>
            </span>
        </li>`;
    }).join('');
}

async function addSkill() {
    const input = document.getElementById('settingsNewSkill') || document.getElementById('newSkill');
    const name  = (input?.value || '').trim();
    if (!name) { input?.focus(); return; }

    const btn = document.getElementById('settingsAddSkillBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
        // Check for duplicate
        const existing = skills.find(s => (typeof s === 'string' ? s : s.name).toLowerCase() === name.toLowerCase());
        if (existing) { alert('This skill category already exists.'); return; }

        await addDoc(collection(db, 'skills'), { name, createdAt: new Date().toISOString() });

        // Reset form — onSnapshot will re-render the list automatically
        if (input) input.value = '';
        const row = document.getElementById('settingsNewSkillRow') || document.getElementById('newSkillRow');
        if (row) row.style.display = 'none';
    } catch (err) {
        console.error('[admin] addSkill error:', err);
        alert('Failed to add skill: ' + (err.message || err));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
}

async function deleteSkill(idOrName) {
    if (!confirm('Delete this skill category?')) return;
    try {
        const snap = await getDocs(collection(db, 'skills'));
        for (const d of snap.docs) {
            if (d.id === idOrName || d.data().name === idOrName) {
                await deleteDoc(d.ref);
                break;
            }
        }
        // onSnapshot fires automatically and re-renders the list
    } catch (err) {
        console.error('[admin] deleteSkill error:', err);
        alert('Failed to delete skill: ' + (err.message || err));
    }
}

async function editSkill(idOrName) {
    const current = skills.find(s => (typeof s === 'string' ? s : s.id || s.name) === idOrName);
    const currentName = current ? (typeof current === 'string' ? current : current.name) : idOrName;
    const updated = prompt('Edit skill category:', currentName);
    if (!updated || !updated.trim() || updated.trim() === currentName) return;

    try {
        const snap = await getDocs(collection(db, 'skills'));
        for (const d of snap.docs) {
            if (d.id === idOrName || d.data().name === currentName) {
                await setDoc(d.ref, { name: updated.trim() }, { merge: true });
                break;
            }
        }
        // onSnapshot fires automatically and re-renders the list
    } catch (err) {
        console.error('[admin] editSkill error:', err);
        alert('Failed to edit skill: ' + (err.message || err));
    }
}

// Programs
function filterPrograms(term) {
    updatePrograms(term);
}

function renderProgramRows(list, filtered) {
    if (!list) return;
    if (!filtered.length) {
        list.innerHTML = '<div style="padding:14px 18px;opacity:0.6;font-family:\'Montserrat\',sans-serif;font-size:0.85rem;">No programs yet.</div>';
        return;
    }
    list.innerHTML = filtered.map(p => {
        const joined      = Array.isArray(p.joined) ? p.joined.length : 0;
        const maxVol      = p.maxVolunteers || 0;
        const isFull      = maxVol > 0 && joined >= maxVol;
        const statusLabel = p.status === 'archived' ? 'Archived' : (isFull ? 'Full' : (p.status || 'Active'));
        return `
        <div class="ad-task-row" style="display:grid;grid-template-columns:2fr minmax(100px,120px) minmax(100px,120px) minmax(100px,120px) minmax(100px,120px) 1fr;gap:12px;align-items:center;">
          <span style="font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name || p.title || 'Untitled'}</span>
          <span>${p.hours ?? 0}</span>
          <span>${maxVol || '—'}</span>
          <span>${joined}</span>
          <span>${statusLabel}</span>
          <span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
            <button class="edit-btn" onclick="editProgram('${p.id}')">Edit</button>
            ${p.status === 'active' ? `<button class="archive-btn" onclick="archiveProgram('${p.id}')">Archive</button>` : ''}
            ${p.status === 'archived' ? `<button class="edit-btn" style="background:var(--secondary);border-color:var(--secondary);" onclick="restoreProgram('${p.id}')">Restore</button>` : ''}
            <button class="delete-btn" onclick="deleteProgram('${p.id}')">Delete</button>
          </span>
        </div>`;
    }).join('');
}

function renderAccountRows(list, filtered) {
    if (!list) return;
    if (!filtered.length) {
        list.innerHTML = '<div style="padding:14px 18px;opacity:0.6;font-family:\'Montserrat\',sans-serif;font-size:0.85rem;">No users found.</div>';
        return;
    }
    list.innerHTML = filtered.map(u => {
        const status = normalizeStatus(u.status) || 'pending';
        const active = u.isActive === false ? 'Inactive' : 'Active';
        const normalizedRole = normalizeRole(u.role);
        const role = normalizedRole || (isAdminEmail(u.email) ? 'admin' : 'user');
        const actions = [];

        if (status === 'pending') {
            actions.push(`<button class="approve-btn" onclick="approveUser('${u.id}')">Approve</button>`);
            actions.push(`<button class="reject-btn" onclick="rejectUser('${u.id}')">Reject</button>`);
        }
        if (status === 'approved' && u.isActive !== false) {
            actions.push(`<button class="archive-btn" onclick="deactivateAccount('${u.id}')">Deactivate</button>`);
        }
        if (status === 'deactivated') {
            actions.push(`<button class="approve-btn" onclick="activateAccount('${u.id}')">Activate</button>`);
        }
        if (u.email) {
            actions.push(`<button class="edit-btn" onclick="resetUserPassword('${u.id}')">Reset Password</button>`);
        }
        actions.push(`<button class="delete-btn" onclick="deleteAccount('${u.id}')">Delete</button>`);

        return `
        <div class="ad-task-row" style="display:grid;grid-template-columns:2fr minmax(120px,160px) 1fr 1fr 1fr;gap:12px;align-items:center;">
          <span title="${(u.name || u.fullName || 'Unnamed user').replace(/"/g, '&quot;')}" style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-block;min-width:0;">${normalizeDisplayName(u.name || u.fullName || 'Unnamed user')}</span>
          <span>${role}</span>
          <span>${status}</span>
          <span>${active}</span>
          <span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">${actions.join('')}</span>
        </div>`;
    }).join('');
}

function updateAccounts(searchTerm) {
    refreshLocalAdminCache();
    const term = (searchTerm !== undefined
        ? searchTerm
        : (document.getElementById('accountSearchInput')?.value || '')
    ).toLowerCase().trim();

    const filtered = term
        ? users.filter(u => {
            const name = (u.name || u.fullName || '').toLowerCase();
            const email = (u.email || '').toLowerCase();
            const id = String(u.id || '').toLowerCase();
            return name.includes(term) || email.includes(term) || id.includes(term);
        })
        : users;

    renderAccountRows(document.getElementById('programList'), filtered);
}

function filterAccounts(term) {
    updateAccounts(term);
}

window.resetUserPassword = async (userId) => {
    const user = users.find((item) => String(item.id) === String(userId));
    if (!user) {
        alert('Could not find the selected account.');
        return;
    }
    const email = user.email;
    if (!email) {
        alert('Selected account does not have an email address on file.');
        return;
    }
    if (!confirm(`Send a password reset email to ${email}?`)) {
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        updateAccounts();
        alert(`A password reset email has been sent to ${email}.`);
    } catch (error) {
        console.error('resetUserPassword error:', error);
        alert('Unable to send password reset email: ' + (error?.message || error?.code || 'Unknown error'));
    }
};

function updatePrograms(searchTerm) {
    const term = (searchTerm !== undefined
        ? searchTerm
        : (document.getElementById('programSearchInput')?.value || '')
    ).toLowerCase().trim();

    const filtered = term
        ? programs.filter(p => (p.name || p.title || '').toLowerCase().includes(term) || (p.desc || '').toLowerCase().includes(term))
        : programs;

    // Task Management tab list - exclude archived programs from public display
    const activePrograms = filtered.filter(p => p.status !== 'archived');
    renderProgramRows(document.getElementById('programList'), activePrograms);
    
    // Settings tab list (always shows full list including archived for admin management)
    renderProgramRows(document.getElementById('settingsProgramList'), programs);
}

function showProgramModal(programId = null) {
    const modal = document.getElementById('programModal');
    const title = document.getElementById('programModalTitle');
    const name = document.getElementById('programName');
    const desc = document.getElementById('programDesc');
    const hours = document.getElementById('programHours');
    const maxVol = document.getElementById('programMaxVolunteers');

    const urlInput = document.getElementById('programAttachmentUrl');
    if (programId) {
        const program = programs.find(p => p.id === programId);
        title.textContent = 'Edit Program';
        name.value = program.name;
        desc.value = program.desc;
        hours.value = program.hours;
        maxVol.value = program.maxVolunteers;
        document.getElementById('programRequirement').value = program.requirement || 'None';
        // show existing attachments
        renderProgramAttachmentPreview(program.attachments || []);
        // do not auto-populate file input for security reasons
        const input = document.getElementById('programAttachments');
        if (input) input.value = '';
        if (urlInput) urlInput.value = '';
        modal.dataset.editId = programId;
    } else {
        title.textContent = 'Create Program';
        name.value = '';
        desc.value = '';
        hours.value = '';
        document.getElementById('programRequirement').value = 'None';
        maxVol.value = '';
        clearAttachmentInput('programAttachments', 'programAttachmentPreview', 'programAttachmentUrl');
        delete modal.dataset.editId;
    }
    modal.style.display = 'flex';
}

function closeProgramModal() {
    document.getElementById('programModal').style.display = 'none';
}

async function saveProgram() {
    const name        = document.getElementById('programName').value.trim();
    const desc        = document.getElementById('programDesc').value.trim();
    const hours       = parseInt(document.getElementById('programHours').value);
    const requirement = document.getElementById('programRequirement').value || 'None';
    let   maxVol      = parseInt(document.getElementById('programMaxVolunteers').value);
    if (Number.isNaN(maxVol) || maxVol <= 0) maxVol = 10;

    if (!name || !desc || Number.isNaN(hours) || hours <= 0) {
        alert('Please fill all required fields (name, description, hours).');
        return;
    }

    const modal   = document.getElementById('programModal');
    const saveBtn = document.getElementById('saveProgramBtn');
    const editId  = modal.dataset.editId;

    // Pessimistic UI — disable button immediately
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Syncing with Cloud...'; }

    const existingProgram = editId ? programs.find(p => p.id === editId) : null;
    const newAttachments = await getAttachmentsFromInput('programAttachments', 'programAttachmentUrl');
    const attachments = newAttachments.length > 0
        ? newAttachments
        : existingProgram?.attachments || [];
    const imageUrl = attachments.length > 0
        ? attachments[0].dataUrl
        : (existingProgram?.image || '');

    const programData = {
        name, title: name, desc, hours, requirement,
        maxVolunteers: maxVol, status: existingProgram?.status || 'active',
        joined: existingProgram?.joined || [], pendingJoins: existingProgram?.pendingJoins || [], assigned: existingProgram?.assigned || [],
        attachments,
        image: imageUrl,
        updatedAt: new Date().toISOString()
    };

    try {
        // Ensure auth is ready before attempting Firestore write
        await authReadyPromise;
        
        console.log('[saveProgram] Auth ready check:', {
            currentUser: auth.currentUser ? `${auth.currentUser.email}` : 'null',
            useFirestore
        });
        
        if (!auth.currentUser) {
            alert('Not authenticated. Please log in again.');
            return;
        }

        if (editId) {
            // Edit existing
            console.log('[saveProgram] Updating program:', editId);
            await setDoc(doc(db, 'programs', editId), programData, { merge: true });
            logAction('program_update', `Updated program: "${name}"`, { programId: editId });
        } else {
            // Add new — Firestore generates the ID
            console.log('[saveProgram] Creating new program');
            programData.createdAt = new Date().toISOString();
            await addDoc(collection(db, 'programs'), programData);
            logAction('program_add', `Created program: "${name}" (${hours} hours)`, { hours });
        }

        // Success — onSnapshot will auto-update the list; just close and reset the form
        closeProgramModal();
        document.getElementById('programName').value = '';
        document.getElementById('programDesc').value = '';
        document.getElementById('programHours').value = '';
        document.getElementById('programMaxVolunteers').value = '';
        clearAttachmentInput('programAttachments', 'programAttachmentPreview', 'programAttachmentUrl');
        delete modal.dataset.editId;

    } catch (err) {
        console.error('saveProgram error:', err);
        let errorMsg = err.message || err;
        if (errorMsg.includes('Missing or insufficient permissions')) {
            errorMsg = 'Permission denied. Check Firestore rules and ensure you are authenticated.';
        }
        alert('Failed to save program: ' + errorMsg);
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    }
}

// Real-time listener for the 'programs' collection — updates UI instantly on any change
let programsUnsubscribe = null;

async function fetchAndRenderPrograms() {
    // Unsubscribe any existing listener first
    if (programsUnsubscribe) { programsUnsubscribe(); programsUnsubscribe = null; }

    try {
        programsUnsubscribe = onSnapshot(
            collection(db, 'programs'),
            (snap) => {
                programs = [];
                snap.forEach(d => programs.push({ id: d.id, ...d.data() }));
                programs.sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1);
                localStorage.setItem('itanimPrograms', JSON.stringify(programs));
                updatePrograms();
                updateDashboard();
                if (typeof window.refreshAdminDashboard === 'function') window.refreshAdminDashboard(programs);
            },
            (err) => {
                console.error('[admin] programs onSnapshot error:', err.code, err.message);
                updatePrograms(); // render empty state / cached data
            }
        );
    } catch (err) {
        console.error('[admin] fetchAndRenderPrograms setup error:', err);
        updatePrograms();
    }
}

function editProgram(id) {
    showProgramModal(id);
}

function archiveProgram(id) {
    const program = programs.find(p => p.id === id);
    if (program) {
        program.status = 'archived';
        savePrograms();
        syncProgramsFromPrograms();
        updatePrograms();
        logAction('program_archive', `Archived program: "${program.name || program.title}"`, { programId: id });
    }
}

function restoreProgram(id) {
    const program = programs.find(p => p.id === id);
    if (program) {
        program.status = 'active';
        savePrograms();
        syncProgramsFromPrograms();
        updatePrograms();
        logAction('program_restore', `Restored program: "${program.name || program.title}"`, { programId: id });
    }
}

async function deleteProgram(id) {
    const programName = programs.find(p => p.id === id)?.name || 'Unknown';
    programs = programs.filter(p => p.id !== id);
    savePrograms();
    // Delete from the unified 'programs' collection
    if (useFirestore) {
        try {
            await deleteDoc(doc(db, 'programs', id));
        } catch (err) {
            console.warn('Could not delete program from Firestore', err);
        }
    }
    logAction('program_delete', `Deleted program: "${programName}"`, { programId: id });
    await fetchAndRenderPrograms();
}

// Validation
function updateValidation() {
    const submitted = programs.filter(p => p.status === 'completed' && !p.validated);
    document.getElementById('submittedPrograms').innerHTML = submitted.map(p => `
        <div class="program-item">
            <div>
                <strong>${p.name}</strong><br>
                Completed by: ${p.assigned.join(', ')}<br>
                Hours: ${p.hours}
            </div>
            <div>
                <button class="approve-btn" onclick="approveProgram('${p.id}')">Approve</button>
                <button class="reject-btn" onclick="rejectProgram('${p.id}')">Reject</button>
            </div>
        </div>
    `).join('');
}

async function approveProgram(id) {
    const program = programs.find(p => p.id === id);
    if (program) {
        program.validated = true;
        const participants = Array.isArray(program.assigned) && program.assigned.length > 0 ? program.assigned : Array.isArray(program.joined) ? program.joined : [];
        for (const userId of participants) {
            const user = users.find(u => u.id === userId);
            if (user) {
                user.hours = (user.hours || 0) + (program.hours || 0);
                user.enrolledPrograms = Array.isArray(user.enrolledPrograms) ? user.enrolledPrograms : [];
                if (!user.enrolledPrograms.includes(id)) {
                    user.enrolledPrograms.push(id);
                }
                user.completedPrograms = Array.isArray(user.completedPrograms) ? user.completedPrograms : [];
                if (!user.completedPrograms.includes(id)) {
                    user.completedPrograms.push(id);
                }
                updateBadge(user);

                if (useFirestore) {
                    try {
                        await setDoc(doc(db, 'volunteers', user.id), {
                            hours: user.hours,
                            enrolledPrograms: arrayUnion(id),
                            completedPrograms: arrayUnion(id)
                        }, { merge: true });
                    } catch (err) {
                        console.warn('Could not update volunteer completion in Firestore', err);
                    }
                }
            }
        }
        saveUsers();
        savePrograms();
        updateValidation();
        updateDashboard();
        updateAnalytics();
        sendNotification(`Program "${program.name}" has been approved! You earned ${program.hours} hours.`, 'program', participants.map(uid => users.find(u => u.id === uid)?.email).filter(Boolean));
    }
}

function rejectProgram(id) {
    const program = programs.find(p => p.id === id);
    if (program) {
        program.status = 'active';
        program.validated = false;
        savePrograms();
        updateValidation();
        const participants = Array.isArray(program.assigned) ? program.assigned : Array.isArray(program.joined) ? program.joined : [];
        sendNotification(`Program "${program.name}" has been rejected and returned to In Progress.`, 'program', participants.map(uid => users.find(u => u.id === uid)?.email).filter(Boolean));
    }
}

function updateBadge(user) {
    const hours = user.hours || 0;
    if (hours >= badgeThresholds.platinum) user.badge = 'Platinum';
    else if (hours >= badgeThresholds.gold) user.badge = 'Gold';
    else if (hours >= badgeThresholds.silver) user.badge = 'Silver';
    else if (hours >= badgeThresholds.bronze) user.badge = 'Bronze';
    else user.badge = 'None';
}

// Badges
function updateBadges() {
    document.getElementById('bronzeThreshold').value = badgeThresholds.bronze;
    document.getElementById('silverThreshold').value = badgeThresholds.silver;
    document.getElementById('goldThreshold').value = badgeThresholds.gold;
    document.getElementById('platinumThreshold').value = badgeThresholds.platinum;
}

function updateBadgeThresholds() {
    badgeThresholds.bronze = parseInt(document.getElementById('bronzeThreshold').value);
    badgeThresholds.silver = parseInt(document.getElementById('silverThreshold').value);
    badgeThresholds.gold = parseInt(document.getElementById('goldThreshold').value);
    badgeThresholds.platinum = parseInt(document.getElementById('platinumThreshold').value);
    saveBadges();
    // Update all user badges
    users.forEach(updateBadge);
    saveUsers();
    alert('Badge thresholds updated!');
}

// Certifications
function getUserCertificationEligibility(user) {
    const hours = Number(user?.hours || 0);
    const completedCount = Array.isArray(user?.completedPrograms) ? user.completedPrograms.length : 0;
    return {
        eligible: hours > 0 && completedCount > 0,
        hours,
        completedCount
    };
}

function getCertificationStatusBadge(status) {
    const normalized = String(status || '').toLowerCase().trim();
    const colorMap = {
        requested: { bg: '#f0ad4e', text: '#1f1f1f', label: 'Requested' },
        approved: { bg: '#5cb85c', text: '#ffffff', label: 'Approved' },
        rejected: { bg: '#d9534f', text: '#ffffff', label: 'Rejected' },
        cancelled: { bg: '#6c757d', text: '#ffffff', label: 'Cancelled' },
        pending: { bg: '#f0ad4e', text: '#1f1f1f', label: 'Pending' }
    };
    const style = colorMap[normalized] || { bg: '#6c757d', text: '#ffffff', label: normalized || 'Unknown' };
    return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${style.bg};color:${style.text};font-size:12px;font-weight:700;">${style.label}</span>`;
}

function updateCertifications() {
    const list = document.getElementById('certRequests');
    if (!list) return;

    certifications.forEach((cert) => {
        cert.status = normalizeStatus(cert.status);
    });

    const normalizedCerts = certifications.map((cert) => ({
        ...cert,
        status: normalizeStatus(cert.status)
    }));

    const eligibleUsers = users.filter((u) => {
        const eligibility = getUserCertificationEligibility(u);
        if (!eligibility.eligible) return false;

        const activeRequestProgramIds = normalizedCerts
            .filter((c) => c.userId === u.id && ['pending', 'requested', 'approved'].includes(c.status))
            .map((c) => c.programId)
            .filter(Boolean);

        const completedProgramIds = Array.isArray(u.completedPrograms) ? u.completedPrograms : [];
        const availablePrograms = completedProgramIds.filter((id) => !activeRequestProgramIds.includes(id));
        return availablePrograms.length > 0;
    });

    const requested = normalizedCerts.filter((c) => ['pending', 'requested'].includes(c.status));
    const reviewed = normalizedCerts.filter((c) => ['approved', 'rejected', 'cancelled'].includes(c.status));

    const eligibleMarkup = eligibleUsers.length > 0
        ? eligibleUsers.map((u) => {
            const e = getUserCertificationEligibility(u);
            return `<li>${u.name || 'Unknown'} (${u.email || 'N/A'}) - ${e.hours} hrs, ${e.completedCount} completed programs</li>`;
        }).join('')
        : '<li>No additional eligible users right now.</li>';

    const certMarkup = [...requested, ...reviewed].map(c => {
        const user = users.find(u => u.id === c.userId);
        const eligibility = getUserCertificationEligibility(user || {});
        const program = c.programId ? programs.find(p => p.id === c.programId) : null;
        const programLabel = c.programTitle || program?.name || program?.title || '';
        const normalizedStatus = normalizeStatus(c.status);
        const isActionable = ['requested', 'pending'].includes(normalizedStatus);
        return `
            <div class="cert-item">
                <div>
                    <strong>${user?.name || 'Unknown'}</strong><br>
                    <small>${user?.email || 'N/A'}</small>
                </div>
                <div>${eligibility.hours}</div>
                <div>${user?.badge || 'None'}</div>
                <div>${eligibility.completedCount > 0 ? 'Yes' : 'No'}</div>
                <div>
                    ${programLabel ? `<div style="margin-bottom:6px;">${programLabel}</div>` : ''}
                    ${getCertificationStatusBadge(normalizedStatus)}
                    ${c.requestedAt ? `<div style="margin-top:8px;font-size:0.82rem;color:var(--primary);">${new Date(c.requestedAt).toLocaleDateString()}</div>` : ''}
                    ${isActionable ? `<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">` : ''}
                        ${isActionable ? `<button class="approve-btn" onclick="approveCert('${c.id}')">Approve</button>` : ''}
                        ${isActionable ? `<button class="reject-btn" onclick="rejectCert('${c.id}')">Reject</button>` : ''}
                        ${isActionable ? `<button class="edit-btn" onclick="editCert('${c.id}')">Edit</button>` : ''}
                        ${isActionable && normalizedStatus !== 'cancelled' ? `<button class="archive-btn" onclick="cancelCert('${c.id}')">Cancel</button>` : ''}
                    ${isActionable ? `</div>` : ''}
                </div>
            </div>
        `;
    }).join('');

    list.innerHTML = `
        <div class="cert-item">
            <div style="grid-column: 1 / -1; padding: 0;">
                <strong>Eligible Users (No active request yet)</strong>
                <ul style="margin:8px 0 0 18px;">${eligibleMarkup}</ul>
            </div>
        </div>
        ${certMarkup || `
            <div class="cert-item">
                <div style="grid-column: 1 / -1; padding: 0;">No certification records yet.</div>
            </div>
        `}
    `;
}

function approveCert(id) {
    const cert = certifications.find(c => c.id === id);
    if (cert) {
        const user = users.find(u => u.id === cert.userId);
        const eligibility = getUserCertificationEligibility(user || {});
        if (!eligibility.eligible) {
            alert('Cannot approve: user is not eligible (hours/completed programs requirements not met).');
            return;
        }
        if (!cert.proofDetails || String(cert.proofDetails).trim().length < 10) {
            alert('Cannot approve: proof details are missing or too short.');
            return;
        }
        cert.status = 'approved';
        cert.name = cert.name || 'Volunteer Certification';
        cert.description = cert.description || `Approved certification for ${user?.name || cert.userEmail || 'volunteer'}`;
        cert.issuedDate = new Date().toISOString().slice(0, 10);
        cert.validUntil = `${new Date().getFullYear() + 1}-12-31`;
        cert.approvedAt = new Date().toISOString();
        cert.updatedAt = new Date().toISOString(); // Ensure this is the newest version
        cert.certificateType = user?.badge && user.badge !== 'None' ? 'with_badge' : 'without_badge';
        cert.adminNote = cert.adminNote || `Approved after verification (${eligibility.hours} hrs, ${eligibility.completedCount} completed).`;
        
        console.log(`✅ Approving cert ${id}:`, cert);
        saveCerts();
        // Don't call updateCertifications() here - let the real-time listener handle it
        sendNotification(`Your certification request has been approved!`, 'certification', user?.email);
        alert(`✅ Approved! Certificate for ${user?.name || 'volunteer'} is now approved. Updates will appear shortly.`);
    }
}

function rejectCert(id) {
    const cert = certifications.find(c => c.id === id);
    if (cert) {
        const reason = prompt('Reject reason (optional):', cert.adminNote || '') || '';
        cert.status = 'rejected';
        cert.adminNote = reason.trim() || 'Rejected by admin.';
        cert.rejectedAt = new Date().toISOString();
        cert.updatedAt = new Date().toISOString();
        saveCerts();
        // Don't call updateCertifications() - let the real-time listener handle it
        const user = users.find(u => u.id === cert.userId);
        sendNotification(`Your certification request has been rejected.${reason ? ` Reason: ${reason}` : ''}`, 'certification', user?.email);
    }
}

function cancelCert(id) {
    const cert = certifications.find(c => c.id === id);
    if (!cert) return;
    const reason = prompt('Cancellation note:', cert.adminNote || '') || '';
    cert.status = 'cancelled';
    cert.adminNote = reason.trim() || 'Cancelled by admin.';
    cert.cancelledAt = new Date().toISOString();
    cert.updatedAt = new Date().toISOString();
    saveCerts();
    // Don't call updateCertifications() - let the real-time listener handle it
    const user = users.find(u => u.id === cert.userId);
    sendNotification(`Your certification has been cancelled.${reason ? ` Note: ${reason}` : ''}`, 'certification', user?.email);
}

function editCert(id) {
    const cert = certifications.find(c => c.id === id);
    if (!cert) return;
    const nextName = prompt('Certificate title:', cert.name || 'Volunteer Certification');
    if (!nextName) return;
    const nextDescription = prompt('Certificate description:', cert.description || '');
    if (nextDescription === null) return;
    cert.name = nextName.trim() || cert.name || 'Volunteer Certification';
    cert.description = nextDescription.trim() || cert.description || '';
    cert.updatedAt = new Date().toISOString();
    saveCerts();
    // Don't call updateCertifications() - let the real-time listener handle it
}

window.approveCert = approveCert;
window.rejectCert = rejectCert;
window.cancelCert = cancelCert;
window.editCert = editCert;

// Notifications
function updateNotifications() {
    const histEl = document.getElementById('notificationHistory');
    if (!histEl) return;
    histEl.innerHTML = notifications.slice().reverse().map(n => `
        <div class="notification-card">
            <strong>${n.type}</strong>
            <div>${n.message}</div>
            <small>To: ${n.recipient}</small>
        </div>
    `).join('');
}

function sendNotification(message, type, recipient) {
    if (!message || !type || !recipient) {
        const inputMessage = document.getElementById('notificationMessage')?.value?.trim();
        const inputType = document.getElementById('notificationType')?.value || 'application';
        if (!inputMessage) {
            alert('Please enter a notification message.');
            return;
        }
        const approvedEmails = users
            .filter((u) => normalizeStatus(u.status) === 'approved' && u.email)
            .map((u) => u.email);
        if (approvedEmails.length === 0) {
            alert('No approved users available to notify.');
            return;
        }
        message = inputMessage;
        type = inputType;
        recipient = approvedEmails;
    }

    const notification = {
        id: Date.now(),
        message,
        type,
        recipient: Array.isArray(recipient) ? recipient.join(', ') : recipient,
        timestamp: new Date().toISOString()
    };
    notifications.push(notification);
    saveNotifications();
    updateNotifications();
    console.log(`Notification sent: ${message} to ${notification.recipient}`);
    alert(`Notification sent to ${notification.recipient}`);
}

// Logout
async function logoutAdmin() {
    sessionStorage.removeItem('adminAuth');
    window.location.href = 'admin-login.html';
}

async function loadAdminSession() {
    // Auth is handled by the inline script in admin.html via onAuthStateChanged.
    // If we reach here, the user is already verified — just render the shell.
    renderAdminShell();
    restoreActiveTab();
    // Fetch live skills from Firestore
    fetchAndRenderSkills().catch(e => console.error('[admin] skills fetch error:', e));
}

// Attachment preview behavior (called once after admin shell loads)
function initAdminAttachmentPreview() {
        const attachmentInput = document.getElementById('taskAttachments');
        if (attachmentInput) {
            attachmentInput.addEventListener('change', async () => {
                try {
                    const atts = await getAttachmentsFromInput('taskAttachments');
                    renderTaskAttachmentPreview(atts);
                } catch (err) {
                    console.warn(err);
                    renderTaskAttachmentPreview([]);
                }
            });
        }
        const programInput = document.getElementById('programAttachments');
        if (programInput) {
            programInput.addEventListener('change', async () => {
                try {
                    const atts = await getAttachmentsFromInput('programAttachments', 'programAttachmentUrl');
                    renderProgramAttachmentPreview(atts, 'programAttachmentPreview');
                } catch (err) {
                    console.warn(err);
                    renderProgramAttachmentPreview([], 'programAttachmentPreview');
                }
            });
        }
        const programUrlInput = document.getElementById('programAttachmentUrl');
        if (programUrlInput) {
            programUrlInput.addEventListener('input', async () => {
                try {
                    const atts = await getAttachmentsFromInput('programAttachments', 'programAttachmentUrl');
                    renderProgramAttachmentPreview(atts, 'programAttachmentPreview');
                } catch (err) {
                    console.warn(err);
                    renderProgramAttachmentPreview([], 'programAttachmentPreview');
                }
            });
        }
        const newProgramInput = document.getElementById('newProgAttachments');
        if (newProgramInput) {
            newProgramInput.addEventListener('change', async () => {
                try {
                    const atts = await getAttachmentsFromInput('newProgAttachments', 'newProgramAttachmentUrl');
                    renderProgramAttachmentPreview(atts, 'newProgramAttachmentPreview');
                } catch (err) {
                    console.warn(err);
                    renderProgramAttachmentPreview([], 'newProgramAttachmentPreview');
                }
            });
        }
        const newProgramUrlInput = document.getElementById('newProgramAttachmentUrl');
        if (newProgramUrlInput) {
            newProgramUrlInput.addEventListener('input', async () => {
                try {
                    const atts = await getAttachmentsFromInput('newProgAttachments', 'newProgramAttachmentUrl');
                    renderProgramAttachmentPreview(atts, 'newProgramAttachmentPreview');
                } catch (err) {
                    console.warn(err);
                    renderProgramAttachmentPreview([], 'newProgramAttachmentPreview');
                }
            });
        }
}

// Export all admin functions to window for onclick handlers
window.logoutAdmin = logoutAdmin;
window.showTab = showTab;
window.filterPrograms = filterPrograms;
window.filterAccounts = filterAccounts;
window.updateAccounts = updateAccounts;
window.addSkill = addSkill;
window.editSkill = editSkill;
window.deleteSkill = deleteSkill;
window.openBorrowDetail = openBorrowDetail;
window.closeBorrowDetailModal = closeBorrowDetailModal;
window.updateBorrowDetailStatus = updateBorrowDetailStatus;
window.archiveBorrowDetail = archiveBorrowDetail;
window.deleteBorrowDetail = deleteBorrowDetail;

/* ── Inline program creation from Settings tab ── */
window.submitNewProgram = async function() {
    const name    = (document.getElementById('newProgName')?.value || '').trim();
    const desc    = (document.getElementById('newProgDesc')?.value || '').trim();
    const hours   = parseInt(document.getElementById('newProgHours')?.value || '');
    const maxVol  = parseInt(document.getElementById('newProgMax')?.value || '0') || 10;
    const req     = document.getElementById('newProgReq')?.value || 'None';
    const errEl   = document.getElementById('addProgramError');
    const btn     = document.getElementById('addProgramSubmitBtn');

    if (errEl) errEl.style.display = 'none';

    if (!name || !desc || isNaN(hours) || hours <= 0) {
        if (errEl) { errEl.textContent = 'Please fill in Name, Description and Hours.'; errEl.style.display = 'block'; }
        return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Syncing with Cloud...'; }

    try {
        const attachments = await getAttachmentsFromInput('newProgAttachments', 'newProgramAttachmentUrl');
        const imageUrl = attachments.length > 0 ? attachments[0].dataUrl : '';

        await addDoc(collection(db, 'programs'), {
            name, title: name, desc, hours,
            requirement: req, maxVolunteers: maxVol,
            status: 'active', joined: [], pendingJoins: [], assigned: [],
            attachments,
            image: imageUrl,
            createdAt: new Date().toISOString()
        });
        logAction('program_add', `Created program: "${name}" (${hours} hours)`, { hours });

        // Reset form and hide it
        document.getElementById('newProgName').value  = '';
        document.getElementById('newProgDesc').value  = '';
        document.getElementById('newProgHours').value = '';
        document.getElementById('newProgMax').value   = '';
        document.getElementById('newProgReq').value   = 'None';
        clearAttachmentInput('newProgAttachments', 'newProgramAttachmentPreview', 'newProgramAttachmentUrl');
        document.getElementById('addProgramForm').style.display = 'none';
        const toggleBtn = document.getElementById('toggleAddProgramForm');
        if (toggleBtn) toggleBtn.textContent = '+ Add New Program';

        // Force immediate UI update
        updatePrograms();

    } catch (err) {
        console.error('submitNewProgram error:', err);
        if (errEl) { errEl.textContent = 'Failed: ' + (err.message || err); errEl.style.display = 'block'; }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Save Program'; }
    }
};

function showTaskModal() {
    console.warn('showTaskModal() is not implemented in this build.');
}

function closeTaskModal() {
    console.warn('closeTaskModal() is not implemented in this build.');
}

function saveTask() {
    console.warn('saveTask() is not implemented in this build.');
}

function editTask() {
    console.warn('editTask() is not implemented in this build.');
}

function archiveTask() {
    console.warn('archiveTask() is not implemented in this build.');
}

function deleteTask() {
    console.warn('deleteTask() is not implemented in this build.');
}

// ===== LOGGING SYSTEM =====
let allLogs = JSON.parse(localStorage.getItem('itanimAdminLogs') || '[]');

async function logAction(actionType, actionDetail, metadata = {}) {
    const logEntry = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actionType,
        actionDetail,
        userId: auth.currentUser?.uid || 'system',
        userEmail: auth.currentUser?.email || 'system',
        metadata
    };

    allLogs.unshift(logEntry); // Add to beginning for most recent first
    if (allLogs.length > 10000) allLogs.pop(); // Keep last 10000 logs

    localStorage.setItem('itanimAdminLogs', JSON.stringify(allLogs));

    // Also save to Firestore
    if (useFirestore) {
        try {
            const logsRef = collection(db, 'admin_logs');
            await addDoc(logsRef, logEntry);
        } catch (err) {
            console.warn('Could not save log to Firestore', err);
        }
    }

    console.log(`[LOG] ${actionType}: ${actionDetail}`, metadata);
}

function filterLogs(searchTerm = '', filterType = '') {
    return allLogs.filter(log => {
        const matchesSearch = !searchTerm || 
            log.actionType.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.actionDetail.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.userEmail.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesType = !filterType || log.actionType === filterType;
        
        return matchesSearch && matchesType;
    });
}

window.clearAllLogs = () => {
    if (confirm('Are you sure you want to delete all logs? This cannot be undone.')) {
        allLogs = [];
        localStorage.setItem('itanimAdminLogs', JSON.stringify(allLogs));
        renderLogs();
        alert('All logs cleared.');
    }
};

window.exportLogs = () => {
    const logsText = allLogs.map(log => 
        `[${log.timestamp}] ${log.actionType}: ${log.actionDetail} (${log.userEmail})`
    ).join('\n');
    
    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
};

function renderLogs() {
    const searchTerm = document.getElementById('logSearchInput')?.value || '';
    const filterType = document.getElementById('logFilterType')?.value || '';
    
    const filteredLogs = filterLogs(searchTerm, filterType);
    const logsList = document.getElementById('logsList');

    if (!logsList) return;

    if (filteredLogs.length === 0) {
        logsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No logs found</div>';
        return;
    }

    logsList.innerHTML = filteredLogs.map(log => {
        const date = new Date(log.timestamp);
        const timeStr = date.toLocaleTimeString();
        const dateStr = date.toLocaleDateString();
        
        let actionColor = '#546B41'; // default green
        if (log.actionType.includes('error') || log.actionType.includes('reject')) actionColor = '#d9534f'; // red
        if (log.actionType.includes('approve')) actionColor = '#5cb85c'; // green
        if (log.actionType.includes('warning')) actionColor = '#f0ad4e'; // orange

        return `
            <div style="padding: 12px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: start; gap: 10px;">
                <div style="flex: 1;">
                    <div style="font-weight: bold; color: ${actionColor};">${log.actionType}</div>
                    <div style="color: #333; margin: 4px 0;">${log.actionDetail}</div>
                    <div style="font-size: 12px; color: #999;">
                        ${dateStr} ${timeStr} • ${log.userEmail}
                    </div>
                    ${Object.keys(log.metadata).length > 0 ? `
                        <div style="font-size: 12px; color: #666; margin-top: 4px;">
                            <strong>Metadata:</strong> ${JSON.stringify(log.metadata)}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

window.renderLogs = renderLogs;

// Initialize logs search and filter listeners
document.addEventListener('DOMContentLoaded', () => {
    const logSearch = document.getElementById('logSearchInput');
    const logFilter = document.getElementById('logFilterType');

    if (logSearch) {
        logSearch.addEventListener('input', renderLogs);
    }
    if (logFilter) {
        logFilter.addEventListener('change', renderLogs);
    }

    const attachmentInput = document.getElementById('programAttachments');
    if (attachmentInput) {
        attachmentInput.addEventListener('change', async () => {
            const attachments = await getAttachmentsFromInput();
            renderProgramAttachmentPreview(attachments);
        });
    }

    const statusFilter = document.getElementById('volunteerStatusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', updateVolunteers);
    }

    const programFilter = document.getElementById('volunteerProgramFilter');
    if (programFilter) {
        programFilter.addEventListener('change', updateVolunteerProgramParticipants);
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Hard fallback: if auth gate is still showing after 2s, reveal anyway
    setTimeout(() => {
        if (document.body.classList.contains('auth-pending')) {
            console.warn('[admin] Auth gate fallback triggered after 2s');
            revealApp();
        }
    }, 2000);
    renderHereRaminCategoryOptions();
    const hrImageFileInput = document.getElementById('hrToolImageFile');
    const hrImagePreview = document.getElementById('hrToolImagePreview');
    const hrImageUrlInput = document.getElementById('hrToolImageUrl');
    if (hrImageFileInput) {
        hrImageFileInput.addEventListener('change', async (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) {
                hereRaminUploadedImageDataUrl = '';
                if (hrImagePreview) {
                    hrImagePreview.src = '';
                    hrImagePreview.style.display = 'none';
                }
                return;
            }
            try {
                hereRaminUploadedImageDataUrl = await readImageAsDataUrl(file);
                if (hrImagePreview) {
                    hrImagePreview.src = hereRaminUploadedImageDataUrl;
                    hrImagePreview.style.display = 'block';
                }
                if (hrImageUrlInput) hrImageUrlInput.value = '';
            } catch (error) {
                console.warn('Could not load image file for HERE-RAMIN tool', error);
                alert('Could not read the selected image file.');
            }
        });
    }
    listenToHereRaminTools();
    listenToHereRaminReceipts();
    listenToOrgVerifications();
    loadAdminSession();
});

// Keep Admin UI in sync when another page updates localStorage
// (e.g., index add program, user join request) in localhost mode.
window.addEventListener('storage', (event) => {
    if (useFirestore) return;
    if (event.key === 'itanimPrograms' || event.key === 'itanimUsers') {
        try {
            programs = JSON.parse(localStorage.getItem('itanimPrograms') || '[]');
            users = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
        } catch {
            programs = [];
            users = [];
        }
        updateDashboard();
        updateAnalytics();
        updatePrograms();
        updateVolunteers();
        updateVolunteerProgramFilter();
        updateVolunteerProgramParticipants();
        updateAttendanceProgramOptions();
    }
});

window.saveRestrictionsFromUI = saveRestrictionsFromUI;
window.showTaskModal = showTaskModal;
window.closeTaskModal = closeTaskModal;
window.saveTask = saveTask;
window.editTask = editTask;
window.archiveTask = archiveTask;
window.deleteTask = deleteTask;
window.approveUser = approveUser;
window.rejectUser = rejectUser;
window.updateBadgeThresholds = updateBadgeThresholds;
window.approveCert = approveCert;
window.rejectCert = rejectCert;
window.cancelCert = cancelCert;
window.editCert = editCert;
window.sendNotification = sendNotification;
window.updateRestrictions = saveRestrictionsFromUI;
window.showProgramModal = showProgramModal;
window.closeProgramModal = closeProgramModal;
window.saveProgram = saveProgram;
window.editProgram = editProgram;
window.archiveProgram = archiveProgram;
window.restoreProgram = restoreProgram;
window.deleteProgram = deleteProgram;
window.approveProgram = approveProgram;
window.rejectProgram = rejectProgram;
window.addHereRaminTool = addHereRaminTool;
window.editHereRaminTool = editHereRaminTool;
window.deleteHereRaminTool = deleteHereRaminTool;
window.toggleHereRaminToolAvailability = toggleHereRaminToolAvailability;
window.updateHereRaminReceiptStatus = updateHereRaminReceiptStatus;
window.closeHereRaminToolEditModal = closeHereRaminToolEditModal;
window.saveHereRaminToolFromModal = saveHereRaminToolFromModal;
window.handleHereRaminToolModalImageFile = handleHereRaminToolModalImageFile;
window.archiveHereRaminBorrower = archiveHereRaminBorrower;
window.deleteHereRaminBorrower = deleteHereRaminBorrower;
window.clearHereRaminBorrowers = clearHereRaminBorrowers;
window.resetHereRaminToolForm = resetHereRaminToolForm;

/* ── HERE-RAMIN PUBLIC USER PAGE SUPPORT ───────────────────────────────────── */
function initHereRaminPublicPage() {
    const isBorrowPage = document.getElementById('borrowForm') !== null;
    const isOrgVerificationPage = document.getElementById('orgVerifyForm') !== null;
    if (!isBorrowPage && !isOrgVerificationPage) {
        return;
    }

    const RECEIPT_STATE_KEY = 'growsauyou-receipt-state';
    const BORROW_RECORD_KEY = 'growsauyou-borrow-record';
    const BORROW_HISTORY_KEY = 'growsauyou-borrow-history';
    const TOOLS_COLLECTION = HERERAMIN_TOOLS_COLLECTION;
    const BORROW_REQUESTS_COLLECTION = 'borrow_requests';
    const imageFolder = 'assets/images/';
    let toolsUnsubscribe = null;

    const defaultGroupedTools = [
        {
            category: 'Soil Preparation',
            tools: [
                { name: 'Trowel', image: 'trowel.png', available: true },
                { name: 'Hoe', image: 'hoe.png', available: false },
                { name: 'Pitchfork', image: 'pitchfork.png', available: true },
                { name: 'Shovel', image: 'shovel.png', available: true }
            ]
        },
        {
            category: 'Planting & Propagation',
            tools: [
                { name: 'Seed Trays', image: 'seed-trays.png', available: true },
                { name: 'Dibbers', image: 'dibbers.png', available: true },
                { name: 'Plant Labels', image: 'plant-labels.png', available: false },
                { name: 'Seed Starter Kit', image: 'seed-starter-kit.png', available: true }
            ]
        },
        {
            category: 'Watering & Irrigation',
            tools: [
                { name: 'Watering Can', image: 'watering-can.png', available: true },
                { name: 'Hose', image: 'hose.png', available: false },
                { name: 'Spray Nozzles', image: 'spray-nozzles.png', available: true },
                { name: 'Sprinkler', image: 'sprinkler.png', available: true }
            ]
        },
        {
            category: 'Pruning & Maintenance',
            tools: [
                { name: 'Garden Scissors', image: 'garden-scissors.png', available: false },
                { name: 'Hedge Trimmers', image: 'hedge-trimmers.png', available: true },
                { name: 'Pruning Shears', image: 'pruning-shears.png', available: true }
            ]
        },
        {
            category: 'Harvesting',
            tools: [
                { name: 'Harvest Baskets', image: 'harvest-baskets.png', available: true },
                { name: 'Garden Knives', image: 'garden-knives.png', available: false },
                { name: 'Fruit Pickers', image: 'fruit-pickers.png', available: true },
                { name: 'Harvest Scissors', image: 'harvest-scissors.png', available: true }
            ]
        },
        {
            category: 'Pest Control',
            tools: [
                { name: 'Garden Sprayers', image: 'garden-sprayers.png', available: true },
                { name: 'Insect Nets', image: 'insect-nets.png', available: true },
                { name: 'Sticky Traps', image: 'sticky-traps.png', available: false },
                { name: 'Hand Dusters', image: 'hand-dusters.png', available: true }
            ]
        },
        {
            category: 'Protective & Safety',
            tools: [
                { name: 'Gloves', image: 'gloves.png', available: true },
                { name: 'Aprons', image: 'aprons.png', available: true },
                { name: 'Masks', image: 'masks.png', available: false },
                { name: 'Knee Pads', image: 'knee-pads.png', available: true }
            ]
        }
    ];
    let groupedTools = JSON.parse(JSON.stringify(defaultGroupedTools));

    const toolSelect = document.getElementById('toolSelect');
    const toolImage = document.getElementById('toolImage');
    const minusBtn = document.getElementById('minusBtn');
    const plusBtn = document.getElementById('plusBtn');
    const quantityText = document.getElementById('quantity');
    const availabilityBadge = document.getElementById('availabilityBadge');
    const addIdBtn = document.getElementById('addIdBtn');
    const idActions = document.querySelector('.id-actions');
    const fileInput = document.getElementById('fileInput');
    const idImage = document.getElementById('idImage');
    const canvas = document.getElementById('signaturePad');
    const borrowForm = document.getElementById('borrowForm');
    const backBtn = document.getElementById('backBtn');
    const borrowDateInput = document.getElementById('borrowDate');
    const returnDateInput = document.getElementById('returnDate');
    const borrowerName = document.getElementById('borrowerName');
    const borrowerAddress = document.getElementById('borrowerAddress');
    const borrowerAge = document.getElementById('borrowerAge');
    const borrowerContact = document.getElementById('borrowerContact');
    const borrowPurpose = document.getElementById('borrowPurpose');
    const orgToolName = document.getElementById('orgToolName');
    const orgToolImage = document.getElementById('orgToolImage');
    const orgQtyDisplay = document.getElementById('orgQtyDisplay');
    const orgBorrowDate = document.getElementById('orgBorrowDate');
    const orgReturnDate = document.getElementById('orgReturnDate');
    const orgAvailBadge = document.getElementById('orgAvailBadge');
    const orgFormPage = document.getElementById('orgFormPage');
    const pendingPage = document.getElementById('pendingPage');
    const pendingRefText = document.getElementById('pendingRefText');
    const letterFileInput = document.getElementById('letterFileInput');
    const addAnotherIdBtn = document.getElementById('addAnotherIdBtn');
    const orgCanvas = document.getElementById('orgSignaturePad');
    const clearSig = document.getElementById('clearSig');
    const clearOrgSig = document.getElementById('clearOrgSig');
    const orgBackBtn = document.getElementById('orgBackBtn');
    const orgSubmitBtn = document.getElementById('orgSubmitBtn');

    let quantity = 1;
    let idCounter = 0;
    let toolsLoadedFromFirestore = false;
    let drawing = false;
    let orgDrawing = false;

    function normalizeText(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getAllTools() {
        return groupedTools.flatMap((group) => group.tools);
    }

    function getToolFromUrlParam() {
        const params = new URLSearchParams(window.location.search);
        return (params.get('tool') || '').trim();
    }

    function slugify(value) {
        return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    function getCategoryForToolName(name) {
        for (const group of defaultGroupedTools) {
            for (const tool of group.tools) {
                if (normalizeText(tool.name) === normalizeText(name)) {
                    return group.category;
                }
            }
        }
        return 'General Tools';
    }

    function getFallbackToolByName(name) {
        return fallbackToolMap.get(normalizeText(name)) || null;
    }

    function buildFallbackToolMap() {
        const map = new Map();
        defaultGroupedTools.forEach((group) => {
            group.tools.forEach((tool) => {
                map.set(normalizeText(tool.name), { ...tool, category: group.category });
            });
        });
        return map;
    }

    const fallbackToolMap = buildFallbackToolMap();

    function getLocalImagePath(imageNameOrPath) {
        if (!imageNameOrPath) {
            return `${imageFolder}shovel.png`;
        }
        if (imageNameOrPath.startsWith('data:')) {
            return imageNameOrPath;
        }
        if (imageNameOrPath.startsWith('http://') || imageNameOrPath.startsWith('https://')) {
            return imageNameOrPath;
        }
        const normalized = imageNameOrPath.replace(/^\.\//, '');
        if (normalized.startsWith('assets/images/')) {
            return normalized;
        }
        if (!normalized.includes('/')) {
            return `${imageFolder}${normalized}`;
        }
        const baseName = normalized.replace(/^.*[\\/]/, '');
        return `${imageFolder}${baseName}`;
    }

    function getFallbackToolImage(name) {
        const fallback = getFallbackToolByName(name);
        if (fallback?.image) {
            return getLocalImagePath(fallback.image);
        }
        return getLocalImagePath(`${slugify(name)}.png`);
    }

    function populateTools() {
        if (!toolSelect) return;
        toolSelect.innerHTML = '';
        groupedTools.forEach((group) => {
            const optGroup = document.createElement('optgroup');
            optGroup.label = group.category;
            group.tools.forEach((tool) => {
                const option = document.createElement('option');
                option.value = tool.name;
                option.textContent = tool.name;
                option.dataset.image = getLocalImagePath(tool.image || getFallbackToolImage(tool.name));
                optGroup.appendChild(option);
            });
            toolSelect.appendChild(optGroup);
        });
    }

    function setAvailability(isAvailable) {
        if (!availabilityBadge) return;
        availabilityBadge.classList.toggle('available', isAvailable);
        availabilityBadge.classList.toggle('unavailable', !isAvailable);
        availabilityBadge.textContent = isAvailable ? 'Available' : 'Not Available';
    }

    function setTool(toolName) {
        if (!toolSelect || !toolImage) return;
        const name = toolName || toolSelect.value || toolSelect.options[0]?.value || '';
        const tool = getAllTools().find((entry) => entry.name === name);
        if (!tool) {
            return;
        }

        const selectedOption = toolSelect.options[toolSelect.selectedIndex] || toolSelect.options[0];
        const rawImage = tool.image || selectedOption?.dataset.image || getFallbackToolImage(tool.name);
        toolImage.src = getLocalImagePath(rawImage);
        toolImage.alt = tool.name;

        setAvailability(tool.available);
        if (quantity > (tool.maxQuantity || 10)) {
            quantity = Math.max(1, tool.maxQuantity || 10);
            if (quantityText) quantityText.textContent = String(quantity);
        }
    }

    function getSelectedTool() {
        if (!toolSelect) return null;
        return getAllTools().find((entry) => entry.name === toolSelect.value) || null;
    }

    function applyToolFromQueryParam() {
        if (!toolSelect) return;
        const toolFromParam = getToolFromUrlParam();
        if (!toolFromParam) {
            return;
        }
        const matchedTool = getAllTools().find((tool) => normalizeText(tool.name) === normalizeText(toolFromParam));
        if (!matchedTool) {
            return;
        }
        toolSelect.value = matchedTool.name;
        setTool(matchedTool.name);
    }

    function rebuildToolsFromFlatArray(flatTools) {
        const grouped = new Map();
        flatTools.forEach((tool) => {
            const category = tool.category || getCategoryForToolName(tool.name);
            if (!grouped.has(category)) {
                grouped.set(category, []);
            }
            grouped.get(category).push(tool);
        });
        groupedTools = Array.from(grouped.entries()).map(([category, tools]) => ({ category, tools }));
    }

    function normalizeToolFromFirestore(docId, data) {
        const toolName = data.tool_name || data.name || docId || 'Tool';
        const fallback = getFallbackToolByName(toolName);
        const quantityAvailable = Number(data.quantity_available ?? data.quantity ?? data.quantity_total ?? 0);
        const quantityTotal = Number(data.quantity_total ?? quantityAvailable);
        const explicitAvailable = typeof data.available === 'boolean' ? data.available : null;
        const statusValue = normalizeText(data.status_ || data.status);
        const isAvailable = explicitAvailable !== null
            ? explicitAvailable
            : quantityAvailable > 0 && statusValue !== 'borrowed' && statusValue !== 'unavailable';

        const rawImage = data.image || data.image_url || fallback?.image || `${slugify(toolName)}.png`;
        return {
            id: docId,
            name: toolName,
            category: data.category || fallback?.category || getCategoryForToolName(toolName),
            image: getLocalImagePath(rawImage),
            available: isAvailable,
            maxQuantity: Math.max(1, quantityAvailable || quantityTotal || 1),
            quantityAvailable: Math.max(0, quantityAvailable),
            quantityTotal: Math.max(0, quantityTotal),
            description: data.description || '',
            wikihowUrl: data.wikihow_url || ''
        };
    }

    async function seedMissingToolsInFirestore(existingDocs) {
        const existingNames = new Set(
            existingDocs.map((item) => normalizeText(item.data.tool_name || item.data.name || item.id))
        );
        const seedPromises = [];
        defaultGroupedTools.forEach((group) => {
            group.tools.forEach((tool) => {
                const normalizedName = normalizeText(tool.name);
                if (existingNames.has(normalizedName)) {
                    return;
                }
                const newDocId = slugify(tool.name);
                const payload = {
                    tool_name: tool.name,
                    category: group.category,
                    description: `${tool.name} tool for ${group.category.toLowerCase()}.`,
                    image_url: getLocalImagePath(tool.image),
                    quantity_available: tool.available ? 5 : 0,
                    quantity_total: 5,
                    status_: tool.available ? 'Available' : 'Unavailable',
                    wikihow_url: '',
                    created_at: new Date().toISOString()
                };
                seedPromises.push(setDoc(doc(db, TOOLS_COLLECTION, newDocId), payload, { merge: true }));
            });
        });

        if (seedPromises.length > 0) {
            await Promise.all(seedPromises);
        }
    }

    function applyFirestoreToolsToSelect(firestoreTools) {
        if (!Array.isArray(firestoreTools) || firestoreTools.length === 0) {
            return;
        }

        const selectedBefore = toolSelect?.value;
        rebuildToolsFromFlatArray(firestoreTools);
        populateTools();

        const nextSelected = getAllTools().some((item) => item.name === selectedBefore)
            ? selectedBefore
            : getAllTools()[0]?.name;
        if (nextSelected) {
            toolSelect.value = nextSelected;
            setTool(nextSelected);
        }
        applyToolFromQueryParam();
    }

    async function hydrateToolsFromFirestore() {
        if (!useFirestore) {
            return;
        }

        try {
            const toolsCollectionRef = collection(db, TOOLS_COLLECTION);
            const snapshot = await getDocs(toolsCollectionRef);
            const docs = snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));

            await seedMissingToolsInFirestore(docs);

            const refreshedSnapshot = await getDocs(toolsCollectionRef);
            const firestoreTools = refreshedSnapshot.docs.map((entry) => normalizeToolFromFirestore(entry.id, entry.data()));
            applyFirestoreToolsToSelect(firestoreTools);
            toolsLoadedFromFirestore = true;
        } catch (error) {
            console.warn('Could not pull tools from Firestore. Keeping local preview data.', error);
        }
    }

    function watchToolsFromFirestore() {
        if (!useFirestore || toolsUnsubscribe) {
            return;
        }
        try {
            toolsUnsubscribe = onSnapshot(
                collection(db, TOOLS_COLLECTION),
                (snapshot) => {
                    const firestoreTools = snapshot.docs.map((entry) => normalizeToolFromFirestore(entry.id, entry.data()));
                    applyFirestoreToolsToSelect(firestoreTools);
                },
                (error) => {
                    console.warn('Could not watch HERE-RAMIN tools updates.', error);
                }
            );
        } catch (error) {
            console.warn('Failed to initialize HERE-RAMIN tools watcher.', error);
        }
    }

    function resizeCanvas() {
        if (!canvas) return;
        const ratio = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.round(rect.width * ratio);
        canvas.height = Math.round(140 * ratio);
        const context = canvas.getContext('2d');
        if (!context) return;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.scale(ratio, ratio);
        context.lineWidth = 2;
        context.strokeStyle = '#546B41';
        context.lineCap = 'round';
        context.lineJoin = 'round';
    }

    function resizeOrgCanvas() {
        if (!orgCanvas) return;
        const ratio = window.devicePixelRatio || 1;
        const rect = orgCanvas.getBoundingClientRect();
        orgCanvas.width = Math.round(rect.width * ratio);
        orgCanvas.height = Math.round(150 * ratio);
        const orgCtx = orgCanvas.getContext('2d');
        if (!orgCtx) return;
        orgCtx.setTransform(1, 0, 0, 1, 0, 0);
        orgCtx.scale(ratio, ratio);
        orgCtx.lineWidth = 2;
        orgCtx.strokeStyle = '#2b3d24';
        orgCtx.lineCap = 'round';
        orgCtx.lineJoin = 'round';
    }

    function validateDates() {
        if (!borrowDateInput || !returnDateInput) {
            window.alert('Please select both borrow and return dates.');
            return false;
        }
        const borrowDate = borrowDateInput.value;
        const returnDate = returnDateInput.value;
        if (!borrowDate || !returnDate) {
            window.alert('Please select both borrow and return dates.');
            return false;
        }
        if (new Date(returnDate) < new Date(borrowDate)) {
            window.alert('Return date cannot be earlier than borrow date.');
            return false;
        }
        return true;
    }

    function signatureAsDataUrl() {
        if (!canvas) return '';
        return canvas.toDataURL('image/png');
    }

    function appendBorrowHistory(record) {
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem(BORROW_HISTORY_KEY) || '[]');
            if (!Array.isArray(history)) {
                history = [];
            }
        } catch (error) {
            history = [];
        }
        history.unshift(record);
        localStorage.setItem(BORROW_HISTORY_KEY, JSON.stringify(history));
    }

    function addIdSlot() {
        idCounter += 1;
        const n = idCounter;
        const list = document.getElementById('idMultiList');
        if (!list) return;

        const entry = document.createElement('div');
        entry.className = 'id-entry';
        entry.id = 'idEntry_' + n;

        entry.innerHTML = `
            <div class="id-thumb" id="idThumb_${n}">
                <span style="padding:4px;">ID Preview</span>
            </div>
            <button type="button" class="id-add-btn" onclick="window.triggerOrgId(${n})">
                <i class="fas fa-camera" style="margin-right:6px;"></i>+ Add Image
            </button>
            <input type="file" id="idFile_${n}" accept="image/*" style="display:none;" onchange="window.previewOrgId(this,${n})">
            ${n > 1 ? `<button type="button" class="id-remove-btn" onclick="window.removeOrgId(${n})" title="Remove"><i class="fas fa-times"></i></button>` : ''}
        `;
        list.appendChild(entry);
    }

    window.triggerOrgId = function(n) {
        const input = document.getElementById('idFile_' + n);
        if (input) input.click();
    };

    window.previewOrgId = function(input, n) {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const box = document.getElementById('idThumb_' + n);
            if (box) box.innerHTML = `<img src="${String(e.target.result)}" alt="ID ${n}">`;
        };
        reader.readAsDataURL(file);
    };

    window.removeOrgId = function(n) {
        const el = document.getElementById('idEntry_' + n);
        if (el) el.remove();
    };

    function updateOrgVerificationFromDraft(stored) {
        if (stored.toolName && orgToolName) orgToolName.textContent = stored.toolName;
        if (stored.toolImage && orgToolImage) orgToolImage.src = stored.toolImage;
        if (stored.quantity && orgQtyDisplay) orgQtyDisplay.textContent = stored.quantity;
        if (stored.borrowDate && orgBorrowDate) orgBorrowDate.value = stored.borrowDate;
        if (stored.returnDate && orgReturnDate) orgReturnDate.value = stored.returnDate;
        if (stored.available === false && orgAvailBadge) {
            orgAvailBadge.textContent = 'Unavailable';
            orgAvailBadge.className = 'availability-badge unavailable';
        }
    }

    async function saveOrgVerificationRecord(stored) {
        const orgName = document.getElementById('orgName')?.value?.trim() || '';
        const orgHead = document.getElementById('orgHead')?.value?.trim() || '';
        if (!orgName || !orgHead) {
            window.alert('Please fill in all required fields.');
            return;
        }

        const record = {
            id: `borrow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            status: 'pending',
            borrowType: 'organization',
            borrower: {
                orgName,
                orgHead
            },
            tool: {
                name: stored.toolName || '',
                image: stored.toolImage || '',
                quantity: stored.quantity || 1,
                available: stored.available !== false
            },
            schedule: {
                borrowDate: orgBorrowDate?.value || '',
                returnDate: orgReturnDate?.value || ''
            },
            purpose: document.getElementById('borrowPurpose')?.value?.trim() || '',
            submittedAt: new Date().toISOString(),
            organization: {
                name: orgName,
                head: orgHead
            }
        };
        sessionStorage.setItem('growsauyou-org-submission', JSON.stringify(record));

        if (useFirestore) {
            try {
                await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, record.id), record, { merge: true });
            } catch (error) {
                console.warn('Could not save organization borrow request to Firestore.', error);
                try {
                    await addDoc(collection(db, BORROW_REQUESTS_COLLECTION), record);
                } catch (fallbackError) {
                    console.error('Fallback Firestore save failed for organization borrow request.', fallbackError);
                }
            }
        }

        if (orgFormPage) orgFormPage.classList.add('hidden');
        if (pendingPage) pendingPage.classList.add('active');
        if (pendingRefText) pendingRefText.textContent = 'Reference No: GSY-ORG-' + Date.now().toString().slice(-8).toUpperCase();
        if (pendingPage) pendingPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function restoreBorrowDraft() {
        const stored = JSON.parse(sessionStorage.getItem('growsauyou-borrow-draft') || '{}');
        if (isOrgVerificationPage) {
            updateOrgVerificationFromDraft(stored);
        }
    }

    function bindOrgVerificationEvents() {
        if (addAnotherIdBtn) {
            addAnotherIdBtn.addEventListener('click', addIdSlot);
            addIdSlot();
        }
        if (letterFileInput) {
            letterFileInput.addEventListener('change', function() {
                const name = this.files && this.files[0] ? this.files[0].name : 'No file chosen';
                const nameEl = document.getElementById('letterFileName');
                if (nameEl) nameEl.textContent = name;
            });
        }
        if (clearOrgSig) {
            clearOrgSig.addEventListener('click', () => {
                if (!orgCanvas) return;
                const orgCtx = orgCanvas.getContext('2d');
                if (!orgCtx) return;
                orgCtx.clearRect(0, 0, orgCanvas.width, orgCanvas.height);
            });
        }
        if (orgBackBtn) {
            orgBackBtn.addEventListener('click', () => {
                window.location.href = 'index.html';
            });
        }
        if (orgSubmitBtn) {
            orgSubmitBtn.addEventListener('click', async function() {
                const stored = JSON.parse(sessionStorage.getItem('growsauyou-borrow-draft') || '{}');
                await saveOrgVerificationRecord(stored);
            });
        }
    }

    function bindBorrowPageEvents() {
        if (!toolSelect || !toolImage || !quantityText || !availabilityBadge || !borrowForm) return;

        populateTools();
        setTool(toolSelect.value);
        applyToolFromQueryParam();
        hydrateToolsFromFirestore();
        watchToolsFromFirestore();

        toolSelect.addEventListener('change', () => {
            setTool(toolSelect.value);
        });

        if (plusBtn) {
            plusBtn.addEventListener('click', () => {
                const selectedTool = getSelectedTool();
                const maxQuantity = selectedTool?.maxQuantity || 10;
                if (quantity < maxQuantity) {
                    quantity += 1;
                    quantityText.textContent = String(quantity);
                }
            });
        }

        if (minusBtn) {
            minusBtn.addEventListener('click', () => {
                if (quantity > 1) {
                    quantity -= 1;
                    quantityText.textContent = String(quantity);
                }
            });
        }

        if (addIdBtn && idActions) {
            addIdBtn.addEventListener('click', () => idActions.classList.toggle('show'));
        }

        if (document.getElementById('fromDevice')) {
            document.getElementById('fromDevice').addEventListener('click', () => fileInput?.click());
        }

        if (document.getElementById('fromInternet')) {
            document.getElementById('fromInternet').addEventListener('click', () => {
                const url = window.prompt('Paste image URL:');
                if (url && idImage) idImage.src = url;
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    if (idImage) idImage.src = String(ev.target.result);
                };
                reader.readAsDataURL(file);
            });
        }

        if (canvas) {
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);
            const ctx2 = canvas.getContext('2d');
            if (ctx2) {
                canvas.addEventListener('mousedown', (e) => {
                    drawing = true;
                    ctx2.beginPath();
                    ctx2.moveTo(e.offsetX, e.offsetY);
                });
                canvas.addEventListener('mouseup', () => { drawing = false; });
                canvas.addEventListener('mouseleave', () => { drawing = false; });
                canvas.addEventListener('mousemove', (e) => {
                    if (!drawing) return;
                    ctx2.lineTo(e.offsetX, e.offsetY);
                    ctx2.stroke();
                });
            }
        }

        if (clearSig && canvas) {
            clearSig.addEventListener('click', () => {
                const ctx2 = canvas.getContext('2d');
                if (ctx2) ctx2.clearRect(0, 0, canvas.width, canvas.height);
            });
        }

        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.history.back();
            });
        }

        borrowForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!validateDates()) return;
            const selectedTool = getSelectedTool();
            if (!selectedTool) {
                window.alert('Please select a tool.');
                return;
            }
            const record = {
                id: `borrow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                status: 'in_use',
                borrowType: 'individual',
                borrower: {
                    name: borrowerName?.value.trim() || '',
                    address: borrowerAddress?.value.trim() || '',
                    age: borrowerAge?.value.trim() || '',
                    contact: borrowerContact?.value.trim() || ''
                },
                tool: {
                    name: selectedTool.name,
                    image: selectedTool.image ? new URL(selectedTool.image, window.location.href).href : toolImage.src,
                    available: selectedTool.available,
                    quantity,
                    quantityAvailable: selectedTool.quantityAvailable ?? null,
                    quantityTotal: selectedTool.quantityTotal ?? null
                },
                schedule: {
                    borrowDate: borrowDateInput?.value || '',
                    returnDate: returnDateInput?.value || ''
                },
                purpose: borrowPurpose?.value.trim() || '',
                validIdImage: idImage?.src || '',
                signatureImage: signatureAsDataUrl(),
                createdAt: new Date().toISOString()
            };

            localStorage.setItem(BORROW_RECORD_KEY, JSON.stringify(record));
            appendBorrowHistory(record);
            localStorage.setItem(RECEIPT_STATE_KEY, 'in_use');

            if (useFirestore) {
                try {
                    const borrowDocRef = doc(db, 'hereramin', 'latestBorrow');
                    await setDoc(borrowDocRef, record, { merge: true });
                    await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, record.id), record, { merge: true });
                } catch (error) {
                    console.warn('Could not save HERE-RAMIN record to Firestore.', error);
                    try {
                        await addDoc(collection(db, BORROW_REQUESTS_COLLECTION), record);
                        console.log('Saved HERE-RAMIN borrow request with fallback addDoc.');
                    } catch (fallbackError) {
                        console.error('Fallback Firestore save failed for HERE-RAMIN borrow request.', fallbackError);
                    }
                }
            }

            window.location.href = '../pages/receipts/user.html';
        });
    }

    function init() {
        if (isBorrowPage) {
            bindBorrowPageEvents();
        }
        if (isOrgVerificationPage) {
            updateOrgVerificationFromDraft(JSON.parse(sessionStorage.getItem('growsauyou-borrow-draft') || '{}'));
            bindOrgVerificationEvents();
            if (orgCanvas) {
                resizeOrgCanvas();
                window.addEventListener('resize', resizeOrgCanvas);
                orgCanvas.addEventListener('mousedown', (e) => {
                    orgDrawing = true;
                    const orgCtx = orgCanvas.getContext('2d');
                    if (!orgCtx) return;
                    const rect = orgCanvas.getBoundingClientRect();
                    orgCtx.beginPath();
                    orgCtx.moveTo((e.clientX - rect.left), (e.clientY - rect.top));
                });
                orgCanvas.addEventListener('mousemove', (e) => {
                    if (!orgDrawing) return;
                    const orgCtx = orgCanvas.getContext('2d');
                    if (!orgCtx) return;
                    const rect = orgCanvas.getBoundingClientRect();
                    orgCtx.lineTo((e.clientX - rect.left), (e.clientY - rect.top));
                    orgCtx.stroke();
                });
                orgCanvas.addEventListener('mouseup', () => { orgDrawing = false; });
                orgCanvas.addEventListener('mouseleave', () => { orgDrawing = false; });
                orgCanvas.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    orgDrawing = true;
                    const orgCtx = orgCanvas.getContext('2d');
                    if (!orgCtx) return;
                    const touch = e.touches[0];
                    const rect = orgCanvas.getBoundingClientRect();
                    orgCtx.beginPath();
                    orgCtx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
                }, { passive: false });
                orgCanvas.addEventListener('touchmove', (e) => {
                    e.preventDefault();
                    if (!orgDrawing) return;
                    const orgCtx = orgCanvas.getContext('2d');
                    if (!orgCtx) return;
                    const touch = e.touches[0];
                    const rect = orgCanvas.getBoundingClientRect();
                    orgCtx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
                    orgCtx.stroke();
                }, { passive: false });
                orgCanvas.addEventListener('touchend', () => { orgDrawing = false; });
            }
        }
    }

    init();
}

document.addEventListener('DOMContentLoaded', initHereRaminPublicPage);

window.debugAuthState = () => {
    console.log("=== ADMIN AUTH DEBUG ===");
    console.log("auth.currentUser:", auth.currentUser);
    console.log("useFirestore:", useFirestore);
    console.log("Firebase config projectId:", firebaseConfig.projectId);
    console.log("========================");
    alert(`Auth: ${auth.currentUser ? 'Logged in as ' + auth.currentUser.email : 'Not logged in'}\nFirestore: ${useFirestore ? 'Enabled' : 'Disabled'}`);
};

function updateVolunteerAccountStatus(userId, updateFields = {}) {
    const user = users.find(u => u.id === userId);
    if (!user) return null;
    Object.assign(user, updateFields);
    saveUsers();
    updateVolunteers();
    updateDashboard();
    updateAnalytics();
    return user;
}

window.deactivateAccount = async (userId) => {
    if (!confirm("Deactivate this account? They will lose access.")) return;
    const user = updateVolunteerAccountStatus(userId, { isActive: false, status: 'deactivated' });
    if (!user) {
        alert('User not found.');
        return;
    }
    if (useFirestore) {
        try {
            await updateDoc(doc(db, "volunteers", userId), { isActive: false, status: 'deactivated' });
        } catch (err) {
            console.warn('Could not update Firestore for deactivation', err);
        }
    }
    updateAccounts();
    alert("Account deactivated.");
};

window.activateAccount = async (userId) => {
    const user = updateVolunteerAccountStatus(userId, { isActive: true, status: 'approved' });
    if (!user) {
        alert('User not found.');
        return;
    }
    if (useFirestore) {
        try {
            await updateDoc(doc(db, "volunteers", userId), { isActive: true, status: 'approved' });
        } catch (err) {
            console.warn('Could not update Firestore for activation', err);
        }
    }
    updateAccounts();
    alert("Account activated.");
};

window.deleteAccount = async (userId) => {
    if (!confirm("WARNING: Permanently delete this user's data? This cannot be undone.")) return;
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) {
        alert('User not found.');
        return;
    }
    users.splice(index, 1);
    saveUsers();
    if (useFirestore) {
        try {
            await deleteDoc(doc(db, "volunteers", userId));
        } catch (err) {
            console.warn('Could not delete Firestore volunteer document', err);
        }
    }
    updateVolunteers();
    updateAccounts();
    alert("User data removed from the local cache." + (useFirestore ? ' Firestore delete was also attempted.' : ''));
};

