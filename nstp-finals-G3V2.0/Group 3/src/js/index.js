import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import firebaseConfig from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const defaultImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='280' viewBox='0 0 500 280'%3E%3Crect width='500' height='280' fill='%23546B41'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Segoe UI, sans-serif' font-size='24' fill='%23FFF8EC'%3EImage unavailable%3C/text%3E%3C/svg%3E";
const programDocs = [];

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
const pageLoginBtn = document.getElementById("pageLoginBtn");
const pageRegisterBtn = document.getElementById("pageRegisterBtn");

const localStorageKey = "itanimLocalPrograms";
const localProgramsKey = "itanimPrograms";
const initialFallbackPrograms = [];

function getCurrentUserData() {
    if (currentUser.role === "user") {
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
const useFirestore = isFirebaseConfigured;

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
        userLabel.innerText += " (offline demo)";
    }
}

function updateAuthLinks() {
    const signedIn = isAuthenticated && (currentUser.role === "user" || currentUser.role === "admin");

    if (navLoginLink) navLoginLink.style.display = signedIn ? "none" : "inline";
    if (navRegisterLink) navRegisterLink.style.display = signedIn ? "none" : "inline";
    if (pageLoginBtn) pageLoginBtn.style.display = signedIn ? "none" : "inline";
    if (pageRegisterBtn) pageRegisterBtn.style.display = signedIn ? "none" : "inline";

    if (userDashboardLink) userDashboardLink.style.display = signedIn && currentUser.role === "user" ? "inline" : "none";
    if (adminLink) adminLink.style.display = signedIn && currentUser.role === "admin" ? "inline" : "none";
}

async function loadCurrentUserFromAuth(user) {
    if (!user) {
        isAuthenticated = false;
        currentUser = { id: "visitor", role: "visitor" };
        updateUserUI();
        updateAuthLinks();
        setRoleBasedUI();
        return;
    }

    isAuthenticated = true;

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

    updateUserUI();
    updateAuthLinks();
    setRoleBasedUI();
}

onAuthStateChanged(auth, loadCurrentUserFromAuth);

function setRoleBasedUI() {
    const isAdmin = currentUser.role === "admin";
    const isUser = currentUser.role === "user";
    addBtn.style.display = isAuthenticated && isAdmin ? "block" : "none";
    if (adminLink) {
        adminLink.style.display = isAuthenticated && isAdmin ? "inline" : "none";
    }
    if (userDashboardLink) {
        userDashboardLink.style.display = isAuthenticated && isUser ? "inline" : "none";
    }
    if (roleSwitcher) {
        roleSwitcher.value = currentUser.role;
    }
    setDebugPanelVisibility();
    setTempUserSwitcherVisibility();
}

function setDebugPanelVisibility() {
    if (!adminDebugPanel) return;
    adminDebugPanel.style.display = currentUser.role === "admin" ? "flex" : "none";
}

function setTempUserSwitcherVisibility() {
    const tempUserSwitcher = document.getElementById("tempUserSwitcher");
    if (!tempUserSwitcher) return;
    tempUserSwitcher.style.display = isAuthenticated && currentUser.role === "admin" ? "flex" : "none";
}

roleSwitcher.addEventListener("change", (e) => {
    currentUser.role = e.target.value;
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
    if (submitBtn) {
        submitBtn.textContent = '+ Add Program';
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
    
    try {
        if (useFirestore) {
            await deleteDoc(doc(db, "programs_empty", selectedProgramId));
        }
        // Remove from programDocs array
        const index = programDocs.findIndex(p => p.id === selectedProgramId);
        if (index > -1) {
            programDocs.splice(index, 1);
            saveLocalPrograms();
            renderPrograms(programDocs);
            window.closeDetailModal();
            alert('Program deleted successfully!');
        } else {
            alert('Program not found.');
        }
        // Sync deletion to admin programs
        syncToAdminPrograms();
    } catch (err) {
        console.error(err);
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
            const joinButton = document.createElement("button");
            joinButton.textContent = (program.joined || []).includes(currentUser.id) ? "Joined" : "Join";
            joinButton.style.padding = "8px 12px";
            joinButton.style.borderRadius = "12px";
            joinButton.style.border = "none";
            joinButton.style.background = "rgba(255,255,255,0.12)";
            joinButton.style.color = "white";
            joinButton.style.cursor = "pointer";
            joinButton.addEventListener("click", (event) => {
                event.stopPropagation();
                joinProgram(program.id, program.joined || []);
            });
            actionArea.appendChild(joinButton);
        } else {
            const loginHint = document.createElement("small");
            loginHint.textContent = "Login to join";
            loginHint.style.opacity = "0.7";
            actionArea.appendChild(loginHint);
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
    
    const detailAction = document.getElementById('detailAction');
    detailAction.innerHTML = '';
    if (currentUser.role === 'user') {
        const joinBtn = document.createElement('button');
        joinBtn.textContent = (program.joined || []).includes(currentUser.id) ? 'Joined' : 'Join';
        joinBtn.style.flex = '1';
        joinBtn.style.padding = '10px';
        joinBtn.style.borderRadius = '10px';
        joinBtn.style.border = '1px solid rgba(255,248,236,0.22)';
        joinBtn.style.background = 'rgba(255,255,255,0.12)';
        joinBtn.style.color = '#FFF8EC';
        joinBtn.style.cursor = 'pointer';
        joinBtn.onclick = (event) => {
            event.stopPropagation();
            joinProgram(program.id, program.joined || []);
        };
        detailAction.appendChild(joinBtn);
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

    if ((joined || []).includes(currentUser.id)) {
        alert("You already joined this program.");
        return;
    }

    if (!useFirestore) {
        const program = programDocs.find((item) => item.id === id);
        if (program) {
            program.joined = [...new Set([...(program.joined || []), currentUser.id])];
            saveLocalPrograms();
            renderPrograms(programDocs);
            const programName = program.title || 'Unknown Program';
            logActivityEvent('volunteer_join', `User joined program: "${programName}"`, { programId: id });
            // Sync join to admin programs
            syncToAdminPrograms();
            return;
        }
        alert("Program not found.");
        return;
    }

    try {
        const program = programDocs.find((item) => item.id === id);
        const programName = program?.title || 'Unknown Program';
        await updateDoc(doc(db, "programs_empty", id), {
            joined: arrayUnion(currentUser.id)
        });
        // Update local programDocs
        if (program) {
            program.joined = [...new Set([...(program.joined || []), currentUser.id])];
        }
        renderPrograms(programDocs);
        logActivityEvent('volunteer_join', `User joined program: "${programName}"`, { programId: id });
        // Sync join to admin programs
        syncToAdminPrograms();
    } catch (err) {
        console.error(err);
        logActivityEvent('error', `Failed to join program - ${err.message}`, { error: true });
        alert("Could not join program. Please try again.");
    }
};

async function uploadProgramImage(file) {
    if (!file) return defaultImage;
    if (!useFirestore) {
        // IMPORTANT: blob: URLs do not persist after refresh; store a data URL instead.
        try {
            return await readImageAsCompressedDataUrl(file);
        } catch (err) {
            console.warn("Local image read failed, using placeholder image", err);
            return defaultImage;
        }
    }
    try {
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
            // Update existing program
            const index = programDocs.findIndex(p => p.id === window.editingProgramId);
            if (index > -1) {
                programDocs[index] = { ...programDocs[index], ...programData };
            }
            if (useFirestore) {
                try {
                    console.log("Updating Firestore document:", window.editingProgramId);
                    await updateDoc(doc(db, "programs_empty", window.editingProgramId), programData);
                    console.log("Firestore update successful");
                    logActivityEvent('program_update', `Updated program: "${title}"`, { programId: window.editingProgramId, hours });
                } catch (fsErr) {
                    console.error("Firestore update failed", fsErr);
                    logActivityEvent('error', `Failed to update program: "${title}" - ${fsErr.message}`, { error: true });
                    throw fsErr;
                }
            }
            // Also sync to admin programs
            syncToAdminPrograms();
            window.editingProgramId = undefined;
            alert("Program updated!");
        } else {
            // Add new program
            const newProgram = { id: `local-${Date.now()}`, ...programData };
            console.log("New program object:", newProgram);

            if (useFirestore) {
                try {
                    console.log("Adding to Firestore collection: programs_empty");
                    console.log("Auth state - currentUser:", auth.currentUser);
                    const docRef = await addDoc(collection(db, "programs_empty"), programData);
                    newProgram.id = docRef.id;
                    console.log("Firestore add successful, doc ID:", newProgram.id);
                    logActivityEvent('program_add', `Created program: "${title}" (${hours} hours)`, { programId: newProgram.id, hours });
                } catch (fsErr) {
                    console.error("Firestore add failed", fsErr);
                    console.error("Error details:", fsErr.code, fsErr.message);
                    logActivityEvent('error', `Failed to create program: "${title}" - ${fsErr.message}`, { error: true });
                    throw fsErr;
                }
            }

            programDocs.push(newProgram);
            // Also sync to admin programs
            syncToAdminPrograms();
            alert("Program added!");
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

function listenPrograms() {
    if (!useFirestore) {
        // Offline mode: try to sync from admin programs first, then load local
        syncProgramsFromProgramsIfNeeded();
        programDocs.length = 0;
        const loaded = loadLocalPrograms();
        console.log("listenPrograms (offline mode): loaded", loaded.length, "programs");
        programDocs.push(...loaded);
        renderPrograms(programDocs);
        return;
    }

    try {
        // Online mode: listen to Firestore, but also sync from admin programs if they exist
        syncProgramsFromProgramsIfNeeded();

        onSnapshot(collection(db, "programs_empty"), (snap) => {
            programDocs.length = 0;
            snap.forEach((d) => {
                programDocs.push({ id: d.id, ...d.data() });
            });
            console.log("listenPrograms (online): loaded", programDocs.length, "programs from Firestore");
            renderPrograms(programDocs);
        }, (err) => {
            console.warn("Realtime program list unavailable, falling back to local", err);
            programDocs.length = 0;
            const loaded = loadLocalPrograms();
            programDocs.push(...loaded);
            renderPrograms(programDocs);
        });
    } catch (err) {
        console.warn("Realtime program list unavailable, falling back to local", err);
        programDocs.length = 0;
        const loaded = loadLocalPrograms();
        programDocs.push(...loaded);
        renderPrograms(programDocs);
    }
}

window.debugAuthState = () => {
    console.log("=== AUTH DEBUG ===");
    console.log("auth.currentUser:", auth.currentUser);
    console.log("currentUser (local):", currentUser);
    console.log("useFirestore:", useFirestore);
    console.log("Firebase config projectId:", firebaseConfig.projectId);
    console.log("==================");
    alert(`Auth: ${auth.currentUser ? 'Logged in as ' + auth.currentUser.email : 'Not logged in'}\nRole: ${currentUser.role}\nFirestore: ${useFirestore ? 'Enabled' : 'Disabled'}`);
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

if (!useFirestore) {
    console.warn("Firebase is not configured. Using local demo data instead.");
}

// Initialize programs
listenPrograms();

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

    if (programDocs.length === 0) {
        console.warn("Programs not loaded, attempting fallback...");
        listenPrograms();
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
