import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    onSnapshot,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import firebaseConfig from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let storage = null;
try {
    storage = getStorage(app);
} catch (err) {
    console.warn('Firebase Storage unavailable — image uploads disabled.', err);
}
const defaultImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='280' viewBox='0 0 500 280'%3E%3Crect width='500' height='280' fill='%23546B41'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Segoe UI, sans-serif' font-size='24' fill='%23FFF8EC'%3EImage unavailable%3C/text%3E%3C/svg%3E";
const programDocs = [];
let programsListenerStarted = false;

let selectedProgramId = null;

let currentUser = {
    id: "user1",
    role: "visitor"
};
let isAuthenticated = false;

const roleSwitcher = document.getElementById("roleSwitcher");
const userLabel = document.getElementById("userLabel");
const adminDebugPanel = document.getElementById("adminDebugPanel");
const addBtn = document.getElementById("addProgramBtn");
const modal = document.getElementById("programModal");
const publicList = document.getElementById("publicProgramList");
const detailModal = document.getElementById("programDetailModal");
const detailImage = document.getElementById("detailImage");
const detailTitle = document.getElementById("detailTitle");
const detailDesc = document.getElementById("detailDesc");
const detailHours = document.getElementById("detailHours");
const detailJoined = document.getElementById("detailJoined");
const adminLink = document.getElementById("adminLink");
const userDashboardLink = document.getElementById("userDashboardLink");
const navLoginLink = document.getElementById("navLoginLink");
const navRegisterLink = document.getElementById("navRegisterLink");
const navLogoutLink = document.getElementById("navLogoutLink");
const pageLoginBtn = document.getElementById("pageLoginBtn");
const pageRegisterBtn = document.getElementById("pageRegisterBtn");

const localStorageKey = "itanimLocalPrograms";
const localProgramsKey = "itanimPrograms";
const initialFallbackPrograms = [];
const ROLE_CACHE_KEY = 'growsauyouRoleCache';
const PROFILE_CACHE_KEY = 'growsauyouProfileCache';

function normalizeRole(role) {
    return String(role || '').toLowerCase();
}

function revealApp() {
    document.body.classList.remove('auth-pending');
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

function getCurrentUserData() {
    if (normalizeRole(currentUser.role) === "user") {
        const storedUsers = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
        if (storedUsers.length > 0) {
            return storedUsers[0];
        }
        return { id: 'user1', role: 'user', name: 'Demo User', skills: ['environment', 'gardening'] };
    }
    return { id: currentUser.id, role: currentUser.role, skills: [] };
}

let users = JSON.parse(localStorage.getItem('itanimUsers') || '[]');

const isFirebaseConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
// On localhost, keep Firebase auth/profile lookup but store programs locally for debugging.
const isLocalHostEnv = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
     window.location.hostname === '127.0.0.1');
const useFirestore = isFirebaseConfigured;
const useLocalProgramStorage = isLocalHostEnv;
const useFirestorePrograms = isFirebaseConfigured && !isLocalHostEnv;

// Activity logging
function logActivityEvent(actionType, actionDetail, metadata = {}) {
    try {
        const logEntry = {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            actionType,
            actionDetail,
            userId: auth.currentUser?.uid || 'visitor',
            userEmail: auth.currentUser?.email || 'visitor',
            metadata
        };

        let logs = JSON.parse(localStorage.getItem('itanimAdminLogs') || '[]');
        logs.unshift(logEntry);
        if (logs.length > 10000) logs.pop();
        localStorage.setItem('itanimAdminLogs', JSON.stringify(logs));

        console.log(`[ACTIVITY] ${actionType}: ${actionDetail}`, metadata);
    } catch (err) {
        console.warn('Could not log activity', err);
    }
}

function updateUserUI() {
    userLabel.innerText = `Role: ${currentUser.role}`;
    if (!useFirestore) {
        userLabel.innerText += " (firebase off)";
    } else if (useLocalProgramStorage) {
        userLabel.innerText += " (local program mode)";
    }
}

function updateAuthLinks() {
    const role = normalizeRole(currentUser.role);
    const signedIn = isAuthenticated && (role === "user" || role === "admin");

    if (navLoginLink) navLoginLink.style.display = signedIn ? "none" : "inline";
    if (navRegisterLink) navRegisterLink.style.display = signedIn ? "none" : "inline";
    if (navLogoutLink) navLogoutLink.style.display = signedIn ? "inline" : "none";
    if (pageLoginBtn) pageLoginBtn.style.display = signedIn ? "none" : "inline";
    if (pageRegisterBtn) pageRegisterBtn.style.display = signedIn ? "none" : "inline";

    if (userDashboardLink) userDashboardLink.style.display = signedIn && role === "user" ? "inline" : "none";
    if (adminLink) adminLink.style.display = signedIn && role === "admin" ? "inline" : "none";

    // Hide admin footer link for signed-in non-admins
    const adminFooter = document.querySelector('.admin-footer-link');
    if (adminFooter) {
        adminFooter.style.display = (signedIn && role !== "admin") ? "none" : "";
    }
}

if (navLogoutLink) {
    navLogoutLink.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await signOut(auth);
        } finally {
            try {
                localStorage.removeItem(ROLE_CACHE_KEY);
                localStorage.removeItem(PROFILE_CACHE_KEY);
            } catch {
                // ignore
            }
            window.location.href = 'index.html';
        }
    });
}

async function loadCurrentUserFromAuth(user) {
    if (!user) {
        isAuthenticated = false;
        currentUser = { id: "visitor", role: "visitor" };
        updateUserUI();
        updateAuthLinks();
        setRoleBasedUI();
        ensureProgramListener();
        revealApp();
        return;
    }

    isAuthenticated = true;

    const cachedRole = getCachedRole(user.uid);
    if (cachedRole) {
        currentUser = { id: user.uid, role: cachedRole };
        updateUserUI();
        updateAuthLinks();
        setRoleBasedUI();
        ensureProgramListener();
        if (programDocs.length > 0) {
            renderPrograms(programDocs);
        }
        revealApp();
    }

    try {
        const userDoc = await getDoc(doc(db, "volunteers", user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            currentUser = {
                id: user.uid,
                role: data.role || "user"
            };
        } else {
            currentUser = { id: user.uid, role: "user" };
        }
    } catch (err) {
        console.warn("Could not read user profile from Firestore", err);
        currentUser = { id: user.uid, role: "user" };
    }

    if (currentUser.role) {
        currentUser.role = normalizeRole(currentUser.role);
    }
    cacheRole(user.uid, currentUser.role);

    updateUserUI();
    updateAuthLinks();
    setRoleBasedUI();
    ensureProgramListener();
    if (programDocs.length > 0) {
        renderPrograms(programDocs);
    }
    revealApp();
}

function ensureProgramListener() {
    if (programsListenerStarted) return;
    programsListenerStarted = true;
    listenPrograms();
}

onAuthStateChanged(auth, loadCurrentUserFromAuth);

function setRoleBasedUI() {
    const role = normalizeRole(currentUser.role);
    const isAdmin = role === "admin";
    const isUser = role === "user";
    addBtn.style.display = isAuthenticated && isAdmin ? "block" : "none";
    if (adminLink) {
        adminLink.style.display = isAuthenticated && isAdmin ? "inline" : "none";
    }
    if (userDashboardLink) {
        userDashboardLink.style.display = isAuthenticated && isUser ? "inline" : "none";
    }
    if (roleSwitcher) {
        roleSwitcher.value = role;
    }
    setDebugPanelVisibility();
    setTempUserSwitcherVisibility();
}

function setDebugPanelVisibility() {
    if (!adminDebugPanel) return;
    adminDebugPanel.style.display = normalizeRole(currentUser.role) === "admin" ? "flex" : "none";
}

function setTempUserSwitcherVisibility() {
    const tempUserSwitcher = document.getElementById("tempUserSwitcher");
    if (!tempUserSwitcher) return;
    tempUserSwitcher.style.display = isAuthenticated && normalizeRole(currentUser.role) === "admin" ? "flex" : "none";
}

roleSwitcher.addEventListener("change", (e) => {
    currentUser.role = normalizeRole(e.target.value);
    updateUserUI();
    setRoleBasedUI();
    renderPrograms(programDocs);
});

setRoleBasedUI();
updateUserUI();

addBtn.addEventListener("click", () => {
    if (currentUser.role !== "admin") {
        alert("Only admins can add programs.");
        return;
    }
    modal.style.display = "flex";
});

// Add image preview handler
const programImageInput = document.getElementById("programImage");
if (programImageInput) {
    programImageInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        const preview = document.getElementById("programImagePreview");
        if (file && preview) {
            const reader = new FileReader();
            reader.onload = (event) => {
                preview.src = event.target.result;
                preview.style.display = "block";
            };
            reader.readAsDataURL(file);
        } else if (preview) {
            preview.style.display = "none";
        }
    });
}

window.closeModal = () => {
    console.log("Closing modal");
    if (modal) modal.style.display = "none";
    // Clear form fields
    document.getElementById("programTitle").value = "";
    document.getElementById("programHours").value = "";
    document.getElementById("programRequirement").value = "None";
    const submitBtnEl = document.querySelector('button[onclick="submitProgram()"]');
    if (submitBtnEl) {
        submitBtnEl.textContent = '+ Add Program';
    }
};

window.closeDetailModal = () => {
    if (detailModal) detailModal.style.display = "none";
    selectedProgramId = null;
};

window.deleteSelectedProgram = async () => {
    if (!selectedProgramId) return;
    
    if (currentUser.role !== 'admin') {
        alert('Only admins can delete programs.');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this program?')) {
        return;
    }
    
    if (!useFirestorePrograms) {
        const filteredPrograms = programDocs.filter((program) => program.id !== selectedProgramId);
        programDocs.length = 0;
        programDocs.push(...filteredPrograms);
        saveLocalPrograms();
        syncToAdminPrograms();
        renderPrograms(programDocs);
        logActivityEvent('program_delete', `Deleted local program: ${selectedProgramId}`, { programId: selectedProgramId, localOnly: true });
        window.closeDetailModal();
        alert('Program deleted successfully!');
        return;
    }
    
    try {
        console.log("Deleting program from admin/state:", selectedProgramId);
        console.log("Auth state - currentUser:", auth.currentUser);
        
        const stateDoc = await getDoc(doc(db, "admin", "state"));
        console.log("State doc exists:", stateDoc.exists());
        
        if (!stateDoc.exists()) {
            throw new Error("Admin state document not found");
        }
        
        const programs = stateDoc.data().programs || [];
        console.log("Current programs count:", programs.length);
        
        const filteredPrograms = programs.filter(p => p.id !== selectedProgramId);
        console.log("Filtered programs count:", filteredPrograms.length);
        
        await updateDoc(doc(db, "admin", "state"), { programs: filteredPrograms });
        console.log("Program deleted successfully from admin/state");
        logActivityEvent('program_delete', `Deleted program: ${selectedProgramId}`, { programId: selectedProgramId });
        window.closeDetailModal();
        alert('Program deleted successfully!');
    } catch (err) {
        console.error("Delete error:", err);
        console.error("Error code:", err.code);
        console.error("Error message:", err.message);
        logActivityEvent('error', `Failed to delete program: ${err.message}`, { error: true });
        alert('Error deleting program: ' + err.message);
    }
};

window.editSelectedProgram = () => {
    if (!selectedProgramId) return;
    
    if (currentUser.role !== 'admin') {
        alert('Only admins can edit programs.');
        return;
    }
    
    const programToEdit = programDocs.find(p => p.id === selectedProgramId);
    if (!programToEdit) {
        alert('Program not found.');
        return;
    }
    
    // Populate the add program form with current values
    document.getElementById('programTitle').value = programToEdit.title || '';
    document.getElementById('programHours').value = programToEdit.hours || '';
    document.getElementById('programRequirement').value = programToEdit.requirement || 'None';
    document.getElementById('programDesc').value = programToEdit.desc || '';
    // Note: image field will be empty and user can upload a new one
    
    // Change button text temporarily
    const submitBtn = document.querySelector('button[onclick="submitProgram()"]');
    if (submitBtn) {
        submitBtn.textContent = 'Update Program';
        
        // Store the edit mode
        window.editingProgramId = selectedProgramId;
    }
    
    window.closeDetailModal();
    modal.style.display = 'flex';
};

detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) {
        window.closeDetailModal();
    }
});

function loadLocalPrograms() {
    const saved = localStorage.getItem(localStorageKey);
    console.debug("loadLocalPrograms: saved data =", saved ? `${saved.length} bytes` : 'null');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            console.debug("loadLocalPrograms: parsed", Array.isArray(parsed) ? `${parsed.length} items` : 'not an array');
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            console.warn("Could not parse saved programs", err);
        }
    }
    console.debug("loadLocalPrograms: returning initialFallbackPrograms");
    return [...initialFallbackPrograms];
}

function saveLocalPrograms() {
    try {
        localStorage.setItem(localStorageKey, JSON.stringify(programDocs));
        console.debug("saveLocalPrograms: saved", programDocs.length, "programs");
    } catch (err) {
        console.warn("saveLocalPrograms failed (likely storage quota).", err);
        alert("Program image may be too large to save in this browser. Try a smaller image.");
    }
}

function saveUsers() {
    localStorage.setItem('itanimUsers', JSON.stringify(users));
}

function savePrograms() {
    localStorage.setItem('itanimPrograms', JSON.stringify(programs));
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
    });
}

async function readImageAsCompressedDataUrl(file, { maxW = 1400, maxH = 900, quality = 0.82 } = {}) {
    // Helps avoid localStorage quota issues (large images silently fail to save)
    // Falls back to normal DataURL if compression isn't supported.
    try {
        if (!file || !file.type || !file.type.startsWith('image/')) {
            return await readFileAsDataUrl(file);
        }

        const bitmap = await createImageBitmap(file);
        const ratio = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
        const w = Math.max(1, Math.round(bitmap.width * ratio));
        const h = Math.max(1, Math.round(bitmap.height * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return await readFileAsDataUrl(file);

        ctx.drawImage(bitmap, 0, 0, w, h);

        const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(outType, outType === 'image/jpeg' ? quality : undefined);
        if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) return dataUrl;
        return await readFileAsDataUrl(file);
    } catch {
        return await readFileAsDataUrl(file);
    }
}

function isProbablyBlobUrl(url) {
    return typeof url === 'string' && url.startsWith('blob:');
}

function syncProgramsFromProgramsIfNeeded() {
    // If admin program management is being used, surface those programs as "Available Programs"
    // so add/edit/delete in admin reflects here.
    try {
        const raw = localStorage.getItem(localProgramsKey);
        if (!raw) return;
        const adminPrograms = JSON.parse(raw);
        if (!Array.isArray(adminPrograms) || adminPrograms.length === 0) return;

        // Only overwrite if current program list is empty OR was previously synced.
        const current = loadLocalPrograms();
        const wasSynced = Array.isArray(current) && current.every(p => p && p._source === 'program');
        if (current.length > 0 && !wasSynced) return;

        programDocs.length = 0;
        programDocs.push(...adminPrograms.map(p => ({
            id: p.id,
            title: p.name,
            hours: String(p.hours ?? ''),
            desc: p.desc || '',
            image: (p.attachments && p.attachments[0] && p.attachments[0].dataUrl) ? p.attachments[0].dataUrl : defaultImage,
            joined: p.joined || [],
            skills: p.skills || [],
            _source: 'program'
        })));
        saveLocalPrograms();
    } catch {
        // ignore
    }
}

function syncToAdminPrograms() {
    // Sync homepage programs back to admin programs format
    try {
        const adminPrograms = programDocs.map(p => ({
            id: p.id,
            name: p.title,
            desc: p.desc || '',
            hours: parseInt(p.hours) || 0,
            requirement: p.requirement || 'None',
            maxVolunteers: 10, // Default value since homepage doesn't track this
            assigned: [],
            status: 'active',
            attachments: p.image && p.image !== defaultImage ? [{ dataUrl: p.image, name: 'program-image.jpg', type: 'image/jpeg' }] : [],
            joined: p.joined || [],
            skills: p.skills || []
        }));

        // Save to admin localStorage
        localStorage.setItem(localProgramsKey, JSON.stringify(adminPrograms));
        console.log('Synced', adminPrograms.length, 'programs to admin storage');
    } catch (err) {
        console.warn('Could not sync to admin programs', err);
    }
}

function renderPrograms(programs) {
    // Update active programs count
    const activeProgramsEl = document.getElementById('activeProgramsCount');
    if (activeProgramsEl) {
        activeProgramsEl.textContent = programs.length;
    }

    // Debug: log what we're rendering
    console.log("renderPrograms called with", programs.length, "programs:");
    programs.forEach((p, idx) => {
        console.log(`  [${idx}]`, p.title || '(no title)', "image:", p.image ? p.image.substring(0, 50) : '(none)');
    });

    // CLEAR THE ENTIRE LIST first
    publicList.innerHTML = "";
    console.log("Cleared publicList");

    if (!programs.length) {
        publicList.innerHTML = `
            <div style="padding: 18px; border-radius: 14px; background: rgba(255,255,255,0.08); opacity: 0.9;">
                No programs available yet.
            </div>
        `;
        return;
    }

    const currentUserData = getCurrentUserData();

    programs.forEach((program) => {
        const item = document.createElement("div");
        item.className = "program-item";
        item.style.position = "relative";
        item.addEventListener("click", () => showProgramDetail(program));

        const image = document.createElement("img");
        // Try to load program image, fall back to default if broken
        image.src = program.image || defaultImage;
        image.alt = program.title || "Program image";
        image.style.display = "block";
        image.style.width = "100%";
        image.style.height = "160px";
        image.style.objectFit = "cover";
        image.style.borderRadius = "12px";
        image.style.marginBottom = "8px";
        image.onerror = () => {
            image.src = defaultImage;
        };

        const hasSkillMatch = Array.isArray(currentUserData.skills) && Array.isArray(program.skills)
            && program.skills.some(skill => currentUserData.skills.includes(skill));

        if (hasSkillMatch && currentUser.role === "user") {
            const badge = document.createElement("div");
            badge.className = "recommended-badge";
            badge.textContent = "Recommended";
            item.appendChild(badge);
        }

        const title = document.createElement("b");
        title.textContent = program.title || "Untitled program";

        const hours = document.createElement("small");
        hours.textContent = `${program.hours || 0} hours`;

        const desc = document.createElement("p");
        desc.textContent = program.desc || "No description yet.";
        desc.style.margin = "0";
        desc.style.opacity = "0.8";
        desc.style.lineHeight = "1.4";

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.width = "100%";
        row.style.alignItems = "center";

        if (program.requirement && program.requirement !== 'None') {
            const requirementBadge = document.createElement('small');
            requirementBadge.textContent = `Req: ${program.requirement}`;
            requirementBadge.style.color = '#dcdcdc';
            requirementBadge.style.fontSize = '12px';
            requirementBadge.style.marginTop = '4px';
            item.appendChild(requirementBadge);
        }

        const joinedLabel = document.createElement("span");
        joinedLabel.style.opacity = "0.75";
        joinedLabel.textContent = `${(program.joined || []).length} joined`;

        const actionArea = document.createElement("div");
        if (currentUser.role === "user" || currentUser.role === "admin") {
            const qrButton = document.createElement("button");
            qrButton.textContent = "Show QR Code";
            qrButton.style.padding = "8px 12px";
            qrButton.style.borderRadius = "12px";
            qrButton.style.border = "none";
            qrButton.style.background = "rgba(255,255,255,0.12)";
            qrButton.style.color = "white";
            qrButton.style.cursor = "pointer";
            qrButton.addEventListener("click", (event) => {
                event.stopPropagation();
                window.location.href = "user.html";
            });
            actionArea.appendChild(qrButton);
        } else {
            const signupButton = document.createElement("button");
            signupButton.textContent = "Sign up to join";
            signupButton.style.padding = "8px 12px";
            signupButton.style.borderRadius = "12px";
            signupButton.style.border = "none";
            signupButton.style.background = "rgba(255,255,255,0.12)";
            signupButton.style.color = "white";
            signupButton.style.cursor = "pointer";
            signupButton.addEventListener("click", (event) => {
                event.stopPropagation();
                window.location.href = "signup.html";
            });
            actionArea.appendChild(signupButton);
        }

        row.appendChild(joinedLabel);
        row.appendChild(actionArea);

        item.appendChild(image);
        item.appendChild(title);
        item.appendChild(hours);
        item.appendChild(desc);
        item.appendChild(row);

        publicList.appendChild(item);
    });
}

function showProgramDetail(program) {
    selectedProgramId = program.id;
    detailImage.src = program.image || defaultImage;
    detailImage.onerror = () => {
        detailImage.src = defaultImage;
    };
    detailTitle.textContent = program.title || "Untitled program";
    detailDesc.textContent = program.desc || "No description provided.";
    detailHours.textContent = `${program.hours || 0}`;
    detailJoined.textContent = `${(program.joined || []).length}`;
    document.getElementById('detailRequirement').textContent = program.requirement || 'None';
    
    console.log('showProgramDetail:', { isAuthenticated, currentUser, program });

    const detailAction = document.getElementById('detailAction');
    if (detailAction) {
        detailAction.innerHTML = '';
        if (isAuthenticated) {
            const qrBtn = document.createElement('button');
            qrBtn.textContent = 'Show QR Code';
            qrBtn.style.flex = '1';
            qrBtn.style.padding = '10px';
            qrBtn.style.borderRadius = '10px';
            qrBtn.style.border = '1px solid rgba(255,248,236,0.22)';
            qrBtn.style.background = 'rgba(255,255,255,0.12)';
            qrBtn.style.color = '#FFF8EC';
            qrBtn.style.cursor = 'pointer';
            qrBtn.onclick = (event) => {
                event.stopPropagation();
                window.location.href = 'user.html';
            };
            detailAction.appendChild(qrBtn);
        } else {
            const signInBtn = document.createElement('button');
            signInBtn.textContent = 'Sign in to join';
            signInBtn.style.flex = '1';
            signInBtn.style.padding = '10px';
            signInBtn.style.borderRadius = '10px';
            signInBtn.style.border = '1px solid rgba(255,248,236,0.22)';
            signInBtn.style.background = 'rgba(255,255,255,0.12)';
            signInBtn.style.color = '#FFF8EC';
            signInBtn.style.cursor = 'pointer';
            signInBtn.onclick = (event) => {
                event.stopPropagation();
                window.location.href = 'login.html';
            };
            detailAction.appendChild(signInBtn);
        }
    }
    
    // Show/hide admin controls
    const adminControls = document.getElementById('adminControls');
    if (currentUser.role === 'admin') {
        adminControls.style.display = 'flex';
    } else {
        adminControls.style.display = 'none';
    }
    
    detailModal.style.display = "flex";
}

window.joinProgram = async (id, joined) => {
    if (currentUser.role !== "user" && currentUser.role !== "admin") {
        alert("Only registered users can join programs.");
        return;
    }

    if (currentUser.role === 'user') {
        const localUser = users.find(u => u.id === currentUser.id);
        const status = String(localUser?.status || '').toLowerCase().trim();
        if (status && status !== 'approved') {
            alert("Your account must be approved by the admin before you can request to join programs.");
            return;
        }
    }

    if ((joined || []).includes(currentUser.id)) {
        alert("You are already officially joined to this program.");
        return;
    }

    const program = programDocs.find((item) => item.id === id);
    const programName = program?.title || 'Unknown Program';

    try {
        // Add user to pendingJoins on the 'programs' document
        await updateDoc(doc(db, 'programs', id), {
            pendingJoins: arrayUnion(currentUser.id)
        });

        if (program) {
            program.pendingJoins = Array.isArray(program.pendingJoins) ? program.pendingJoins : [];
            if (!program.pendingJoins.includes(currentUser.id)) {
                program.pendingJoins.push(currentUser.id);
            }
        }

        renderPrograms(programDocs);
        logActivityEvent('join_request', `User requested to join program: "${programName}"`, { programId: id });
        alert('Join request submitted. Wait for admin approval.');
    } catch (err) {
        console.error("Join failed:", err);
        logActivityEvent('error', `Failed to request join - ${err.message}`, { error: true });
        alert("Could not request to join. Please try again.");
    }
};

async function uploadProgramImage(file) {
    if (!file) return defaultImage;
    if (!useFirestorePrograms) {
        // IMPORTANT: blob: URLs do not persist after refresh; store a data URL instead.
        try {
            return await readImageAsCompressedDataUrl(file);
        } catch (err) {
            console.warn("Local image read failed, using placeholder image", err);
            return defaultImage;
        }
    }
    try {
        if (!storage) throw new Error('Storage not initialized');
        const imageRef = ref(storage, `programImages/${Date.now()}-${file.name}`);
        await uploadBytes(imageRef, file);
        return await getDownloadURL(imageRef);
    } catch (err) {
        console.warn("Image upload failed, falling back to local image", err);
        try {
            return await readImageAsCompressedDataUrl(file);
        } catch (e2) {
            console.warn("Local fallback image read failed, using placeholder image", e2);
            return defaultImage;
        }
    }
}

window.submitProgram = async () => {
    console.log("submitProgram called");
    console.log("isAuthenticated:", isAuthenticated);
    console.log("currentUser:", currentUser);
    console.log("currentUser.role:", currentUser.role);
    console.log("useFirestore:", useFirestore);

    if (!isAuthenticated || !auth.currentUser) {
        alert("You must be signed in with an admin account to add programs.");
        return;
    }

    if (currentUser.role !== "admin") {
        alert("Only admins can add programs. Current role: " + currentUser.role);
        return;
    }

    try {
        const title = document.getElementById("programTitle").value.trim();
        const hours = String(document.getElementById("programHours").value).trim();
        const requirement = document.getElementById("programRequirement").value || 'None';
        const desc = document.getElementById("programDesc").value.trim();
        const file = document.getElementById("programImage").files[0];

        console.log("Form values:", { title, hours, requirement, desc, file: file ? "file selected" : "no file" });

        if (!title) {
            alert("Title required");
            return;
        }

        const isEditing = window.editingProgramId !== undefined;
        console.log("isEditing:", isEditing, "editingProgramId:", window.editingProgramId);
        
        // Try to upload image, but don't fail if it doesn't work
        let imageURL = defaultImage;
        if (!isEditing || file) {
            try {
                imageURL = await uploadProgramImage(file);
                console.log("Image upload successful:", imageURL ? "URL received" : "default image used");
            } catch (imageErr) {
                console.warn("Image upload failed, continuing with default image", imageErr);
                imageURL = defaultImage;
            }
        } else if (isEditing) {
            const existingProgram = programDocs.find(p => p.id === window.editingProgramId);
            imageURL = existingProgram ? existingProgram.image : defaultImage;
        }
        
        const programData = {
            title,
            hours,
            requirement,
            desc,
            image: imageURL,
            joined: []
        };

        console.log("Program data to save:", programData);

        if (isEditing) {
            // Update existing program in admin/state/programs array
            console.log("Updating program in admin/state:", window.editingProgramId);
            
            if (!useFirestorePrograms) {
                const programIndex = programDocs.findIndex((p) => p.id === window.editingProgramId);
                if (programIndex === -1) {
                    throw new Error("Program not found in local storage");
                }

                programDocs[programIndex] = {
                    ...programDocs[programIndex],
                    title,
                    hours,
                    requirement,
                    desc,
                    image: imageURL
                };

                saveLocalPrograms();
                syncToAdminPrograms();
                console.log("Local program update successful");
                logActivityEvent('program_update', `Updated local program: "${title}"`, { programId: window.editingProgramId, hours, localOnly: true });
                alert("Program updated successfully!");
                window.editingProgramId = undefined;
            } else {

                try {
                    // Get current programs array
                    const stateDoc = await getDoc(doc(db, "admin", "state"));
                    if (!stateDoc.exists()) {
                        throw new Error("Admin state document not found");
                    }
                    
                    const programs = stateDoc.data().programs || [];
                    const programIndex = programs.findIndex(p => p.id === window.editingProgramId);
                    
                    if (programIndex === -1) {
                        throw new Error("Program not found in admin/state");
                    }
                    
                    // Update the program
                    programs[programIndex] = {
                        ...programs[programIndex],
                        name: title,
                        title,
                        hours: parseInt(hours) || 0,
                        requirement,
                        desc,
                        image: imageURL
                    };
                    
                    await updateDoc(doc(db, "admin", "state"), { programs });
                    console.log("Firestore update successful");
                    logActivityEvent('program_update', `Updated program: "${title}"`, { programId: window.editingProgramId, hours });
                    alert("Program updated successfully!");
                } catch (fsErr) {
                    console.error("Firestore update failed", fsErr);
                    logActivityEvent('error', `Failed to update program: "${title}" - ${fsErr.message}`, { error: true });
                    alert("ERROR: Could not update program in database - " + fsErr.message);
                    throw fsErr;
                }
                window.editingProgramId = undefined;
            }
        } else {
            // Add new program to admin/state/programs array
            console.log("Adding new program to admin/state");
            console.log("Auth state - currentUser:", auth.currentUser);
            console.log("Auth UID:", auth.currentUser?.uid);
            
            if (!useFirestorePrograms) {
                const programId = `prog-${Date.now()}`;
                programDocs.push({
                    id: programId,
                    title,
                    hours,
                    requirement,
                    desc,
                    image: imageURL,
                    joined: []
                });
                saveLocalPrograms();
                syncToAdminPrograms();
                console.log("Local program add successful");
                logActivityEvent('program_add', `Created local program: "${title}" (${hours} hours)`, { programId, hours, localOnly: true });
                alert("Program added successfully!");
            } else {
                try {
                    const programId = `prog-${Date.now()}`;
                    const newProgram = {
                        id: programId,
                        name: title,
                        title,
                        hours: parseInt(hours) || 0,
                        requirement,
                        desc,
                        image: imageURL,
                        joined: []
                    };
                    
                    console.log("New program to save:", newProgram);
                    
                    // First check if admin/state exists and has programs array
                    const stateRef = doc(db, "admin", "state");
                    const stateSnapshot = await getDoc(stateRef);
                    
                    console.log("Admin/state exists:", stateSnapshot.exists());
                    
                    if (stateSnapshot.exists()) {
                        const currentData = stateSnapshot.data();
                        console.log("Current admin/state data:", currentData);
                        
                        // If programs array exists, use arrayUnion; otherwise set it
                        if (Array.isArray(currentData.programs)) {
                            console.log("Programs array exists, using arrayUnion");
                            await updateDoc(stateRef, {
                                programs: arrayUnion(newProgram)
                            });
                        } else {
                            console.log("Programs array doesn't exist, creating it");
                            await updateDoc(stateRef, {
                                programs: [newProgram]
                            });
                        }
                    } else {
                        console.log("Admin/state doesn't exist, creating it");
                        await setDoc(stateRef, {
                            programs: [newProgram]
                        });
                    }
                    
                    console.log("Firestore add successful");
                    logActivityEvent('program_add', `Created program: "${title}" (${hours} hours)`, { programId, hours });
                    alert("Program added successfully!");
                } catch (fsErr) {
                    console.error("Firestore add failed", fsErr);
                    console.error("Error code:", fsErr.code);
                    console.error("Error message:", fsErr.message);
                    console.error("Full error:", fsErr);
                    logActivityEvent('error', `Failed to create program: "${title}" - ${fsErr.message}`, { error: true });
                    alert("ERROR: Could not save program to database - " + fsErr.message);
                    throw fsErr;
                }
            }
        }
        
        saveLocalPrograms();
        renderPrograms(programDocs);
        
        // Clear form
        document.getElementById("programTitle").value = "";
        document.getElementById("programHours").value = "";
        document.getElementById("programRequirement").value = "None";
        document.getElementById("programDesc").value = "";
        document.getElementById("programImage").value = "";
        if (document.getElementById("programImagePreview")) {
            document.getElementById("programImagePreview").style.display = "none";
        }
        
        closeModal();
    } catch (err) {
        console.error("submitProgram error:", err);
        console.error("Error code:", err.code);
        console.error("Error message:", err.message);
        alert("ERROR: " + (err.message || err));
    }
};

function mapAdminProgramsToHomepagePrograms(adminPrograms) {
    if (!Array.isArray(adminPrograms)) return [];
    return adminPrograms.map(p => ({
        id: p.id,
        title: p.name || p.title || '',
        hours: String(p.hours ?? ''),
        requirement: p.requirement || 'None',
        desc: p.desc || p.description || '',
        image: (p.attachments && p.attachments[0] && p.attachments[0].dataUrl) ? p.attachments[0].dataUrl : defaultImage,
        joined: p.joined || [],
        skills: p.skills || [],
        _source: 'program'
    }));
}

function listenPrograms() {
    // Real-time listener on the 'programs' collection — same one admin writes to
    onSnapshot(
        collection(db, 'programs'),
        (snap) => {
            const next = [];
            snap.forEach((d) => {
                const p = d.data() || {};
                next.push({
                    id: d.id,
                    title: p.title || p.name || '',
                    hours: p.hours || 0,
                    desc: p.desc || p.description || '',
                    image: p.image || defaultImage,
                    requirement: p.requirement || 'None',
                    joined: p.joined || [],
                    pendingJoins: p.pendingJoins || [],
                    maxVolunteers: p.maxVolunteers || 0,
                    skills: p.skills || []
                });
            });
            programDocs.length = 0;
            programDocs.push(...next);
            // Keep localStorage in sync for offline fallback
            try { localStorage.setItem('itanimPrograms', JSON.stringify(next)); } catch(e) {}
            // Update active programs count
            const activeProgramsEl = document.getElementById('activeProgramsCount');
            if (activeProgramsEl) {
                activeProgramsEl.textContent = next.length;
            }
            renderPrograms(programDocs);
        },
        (err) => {
            console.warn('Could not listen to programs from Firestore, falling back to localStorage:', err);
            try {
                const cached = JSON.parse(localStorage.getItem('itanimPrograms') || '[]');
                const next = cached.map(p => ({
                    id: p.id,
                    title: p.title || p.name || '',
                    hours: p.hours || 0,
                    desc: p.desc || '',
                    image: p.image || defaultImage,
                    requirement: p.requirement || 'None',
                    joined: p.joined || [],
                    pendingJoins: p.pendingJoins || [],
                    maxVolunteers: p.maxVolunteers || 0,
                    skills: p.skills || []
                }));
                programDocs.length = 0;
                programDocs.push(...next);
                // Update active programs count
                const activeProgramsEl = document.getElementById('activeProgramsCount');
                if (activeProgramsEl) {
                    activeProgramsEl.textContent = next.length;
                }
                renderPrograms(programDocs);
            } catch(e) {
                renderPrograms([]);
            }
        }
    );
}

function refreshProgramsFromSharedStorage() {
    if (useFirestorePrograms) return;
    try {
        const adminPrograms = JSON.parse(localStorage.getItem(localProgramsKey) || '[]');
        const next = Array.isArray(adminPrograms) && adminPrograms.length > 0
            ? mapAdminProgramsToHomepagePrograms(adminPrograms)
            : loadLocalPrograms();
        programDocs.length = 0;
        programDocs.push(...next);
        saveLocalPrograms();
        renderPrograms(programDocs);
    } catch {
        // ignore parse/render failures
    }
}

window.forceSyncData = () => {
    try {
        users = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
    } catch {
        users = [];
    }
    refreshProgramsFromSharedStorage();
    alert('Manual sync complete.');
};

window.debugAuthState = () => {
    console.log("=== AUTH DEBUG ===");
    console.log("auth.currentUser:", auth.currentUser);
    console.log("currentUser (local):", currentUser);
    console.log("useFirestore:", useFirestore);
    console.log("useLocalProgramStorage:", useLocalProgramStorage);
    console.log("useFirestorePrograms:", useFirestorePrograms);
    console.log("Firebase config projectId:", firebaseConfig.projectId);
    console.log("==================");
    alert(`Auth: ${auth.currentUser ? 'Logged in as ' + auth.currentUser.email : 'Not logged in'}\nRole: ${currentUser.role}\nFirestore: ${useFirestore ? 'Enabled' : 'Disabled'}\nProgram mode: ${useFirestorePrograms ? 'Firestore' : 'LocalStorage'}`);
};

window.debugShowPrograms = () => {
    console.log("Loaded programs:", programDocs);
    alert(`Programs loaded: ${programDocs.length}. Check console for details.`);
};

window.debugAddSampleUser = () => {
    const newUser = {
        id: `user${Date.now()}`,
        name: "Debug User",
        email: "debug@example.com",
        age: 20,
        barangay: "Debug",
        skills: ["Debugging"],
        status: "pending",
        hours: 0,
        badge: "None"
    };
    users.push(newUser);
    saveUsers();
    alert("Sample user added. Check admin panel for management.");
};

window.debugAddSampleProgram = () => {
    const newProgram = {
        id: `program${Date.now()}`,
        name: "Debug Program",
        desc: "A program for debugging purposes",
        hours: 1,
        maxVolunteers: 2,
        assigned: [],
        status: "active"
    };
    programs.push(newProgram);
    savePrograms();
    alert("Sample program added. Check admin panel for management.");
};

window.debugSimulateJoin = () => {
    if (programDocs.length > 0) {
        const program = programDocs[0];
        if (currentUser.role === "user" || currentUser.role === "admin") {
            joinProgram(program.id, program.joined || []);
        } else {
            alert("Switch to user or admin role first.");
        }
    } else {
        alert("No programs available to join.");
    }
};

window.debugShowUsers = () => {
    console.log("All users:", users);
    alert(`Users: ${users.length}. Check console for details.`);
};

window.debugCleanupEverything = () => {
    // Clear all localStorage data
    localStorage.clear();
    
    // Reset programDocs to initial fallback only
    programDocs.length = 0;
    programDocs.push(...initialFallbackPrograms);
    
    // Reset users and programs arrays
    users.length = 0;
    programs.length = 0;
    
    // Save clean state
    saveLocalPrograms();
    saveUsers();
    savePrograms();
    
    // Re-render programs
    renderPrograms(programDocs);
    
    // Reset current user to visitor
    currentUser.role = "visitor";
    updateUserUI();
    setRoleBasedUI();
    
    alert("Everything cleaned up! Reset to initial state.");
};

if (!useFirestorePrograms) {
    console.warn("Using local program storage for debugging.");
}

// Volunteer count — real-time listener on volunteers collection
function loadVolunteerCount() {
    const countEl = document.getElementById('volunteerCount');
    if (!countEl) return;
    if (!useFirestore) {
        try {
            const localUsers = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
            countEl.textContent = localUsers.length;
        } catch {
            countEl.textContent = '—';
        }
        return;
    }
    onSnapshot(
        collection(db, 'volunteers'),
        (snap) => { countEl.textContent = snap.size; },
        (err) => {
            console.warn('Could not load volunteer count', err);
            countEl.textContent = '—';
        }
    );
}

loadVolunteerCount();

// Initialize programs once auth state is known

// Fallback: ensure programs are rendered even if listenPrograms doesn't work
// This handles browser caching issues
document.addEventListener('DOMContentLoaded', () => {
    // Image preview for program uploads
    const fileInput = document.getElementById('programImage');
    const preview = document.getElementById('programImagePreview');
    if (fileInput && preview) {
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) {
                preview.style.display = 'none';
                preview.src = '';
                return;
            }
            try {
                preview.src = await readImageAsCompressedDataUrl(file);
                preview.style.display = 'block';
            } catch {
                preview.style.display = 'none';
                preview.src = '';
            }
        });
    }
});

// Cross-tab/page live sync for localhost mode.
window.addEventListener('storage', (event) => {
    if (useFirestorePrograms) return;
    if (event.key === localProgramsKey || event.key === localStorageKey) {
        refreshProgramsFromSharedStorage();
    }
    if (event.key === 'itanimUsers') {
        try {
            users = JSON.parse(localStorage.getItem('itanimUsers') || '[]');
        } catch {
            users = [];
        }
        renderPrograms(programDocs);
    }
});

// Additional safety: re-render after a short delay to ensure DOM is ready
setTimeout(() => {
    if (publicList && publicList.children.length === 0) {
        console.warn("Program list empty, re-rendering...");
        renderPrograms(programDocs);
    }
}, 100);

const carousel = document.getElementById("carousel");
const slides = document.querySelectorAll(".slide");
const dotsContainer = document.getElementById("dots");
let index = 1;
const realSlides = slides.length - 2;

for (let i = 0; i < realSlides; i++) {
    const dot = document.createElement("span");
    dot.onclick = () => go(i + 1);
    dotsContainer.appendChild(dot);
}

function fix() {
    const w = slides[0].offsetWidth + 30;
    if (index === 0) index = realSlides;
    if (index === slides.length - 1) index = 1;
}

function update() {
    fix();
    const w = slides[0].offsetWidth + 30;
    carousel.style.transform = `translateX(-${index * w}px)`;
    slides.forEach(s => s.classList.remove("active"));
    slides[index].classList.add("active");
    const dots = document.querySelectorAll(".dots span");
    dots.forEach((d, idx) => {
        d.classList.toggle("active", idx === index - 1);
    });
}

function prev() {
    index -= 1;
    update();
    resetAutoSlide();
}

function next() {
    index += 1;
    update();
    resetAutoSlide();
}

function go(n) {
    index = n;
    update();
    resetAutoSlide();
}

function resetAutoSlide() {
    clearInterval(autoSlide);
    autoSlide = setInterval(next, 5000);
}

update();
let autoSlide = setInterval(next, 5000);

// Make functions global for onclick handlers
window.prev = prev;
window.next = next;
window.go = go;
window.submitProgram = submitProgram;
window.closeModal = closeModal;