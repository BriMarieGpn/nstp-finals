import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    doc,
    updateDoc,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA_WAoRxS0XtSBHO4GKOUPeo9IxSuo9m8E",
    authDomain: "i-tanim.firebaseapp.com",
    projectId: "i-tanim",
    storageBucket: "i-tanim.firebasestorage.app",
    messagingSenderId: "543718035125",
    appId: "1:543718035125:web:92261781c28eec00c738fc"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const defaultImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='280' viewBox='0 0 500 280'%3E%3Crect width='500' height='280' fill='%23062A24'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Segoe UI, sans-serif' font-size='24' fill='%23C8F542'%3EImage unavailable%3C/text%3E%3C/svg%3E";
const programDocs = [];
let selectedProgramId = null;

let currentUser = {
    id: "user1",
    role: "visitor"
};

const roleSwitcher = document.getElementById("roleSwitcher");
const userLabel = document.getElementById("userLabel");
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

const localStorageKey = "itanimLocalPrograms";
const localTasksKey = "itanimTasks";
const initialFallbackPrograms = [
    {
        id: "local-1",
        title: "Tree Planting Drive",
        hours: "4",
        desc: "Join our tree planting drive to help the community.",
        image: "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=900&q=80",
        joined: [],
        skills: ["tree planting", "environment", "outdoor"]
    },
    {
        id: "local-2",
        title: "Community Clean-Up",
        hours: "2",
        desc: "Help clean local streets and parks.",
        image: "https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=900&q=80",
        joined: [],
        skills: ["cleanup", "teamwork", "environment"]
    },
    {
        id: "local-3",
        title: "Urban Gardening Workshop",
        hours: "3",
        desc: "Learn how to grow food in small spaces.",
        image: "https://images.unsplash.com/photo-1492496913980-501348b61469?auto=format&fit=crop&w=900&q=80",
        joined: [],
        skills: ["gardening", "sustainability", "horticulture"]
    }
];

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
let tasks = JSON.parse(localStorage.getItem('itanimTasks') || '[]');

const isFirebaseConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
const useFirestore = isFirebaseConfigured;

function updateUserUI() {
    userLabel.innerText = `Role: ${currentUser.role}`;
    if (!useFirestore) {
        userLabel.innerText += " (offline demo)";
    }
}

function setRoleBasedUI() {
    const isAdmin = currentUser.role === "admin";
    const isUser = currentUser.role === "user";
    addBtn.style.display = isAdmin ? "block" : "none";
    if (adminLink) {
        adminLink.style.display = isAdmin ? "inline" : "none";
    }
    if (userDashboardLink) {
        userDashboardLink.style.display = isUser ? "inline" : "none";
    }
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

window.closeModal = () => {
    console.log("Closing modal");
    if (modal) modal.style.display = "none";
    // Clear form fields
    document.getElementById("programTitle").value = "";
    document.getElementById("programHours").value = "";
    document.getElementById("programDesc").value = "";
    document.getElementById("programImage").value = "";
    // Reset edit mode
    window.editingProgramId = undefined;
    // Reset button text
    const submitBtn = document.querySelector('button[onclick="submitProgram()"]');
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
    document.getElementById('programDesc').value = programToEdit.desc || '';
    // Note: image field will be empty and user can upload a new one
    
    // Change button text temporarily
    const submitBtn = document.querySelector('button[onclick="submitProgram()"]');
    if (submitBtn) {
        const oldText = submitBtn.textContent;
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

function saveTasks() {
    localStorage.setItem('itanimTasks', JSON.stringify(tasks));
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

function syncProgramsFromTasksIfNeeded() {
    // If admin task management is being used, surface those tasks as "Available Programs"
    // so add/edit/delete in admin reflects here.
    try {
        const raw = localStorage.getItem(localTasksKey);
        if (!raw) return;
        const adminTasks = JSON.parse(raw);
        if (!Array.isArray(adminTasks) || adminTasks.length === 0) return;

        // Only overwrite if current program list is empty OR was previously synced.
        const current = loadLocalPrograms();
        const wasSynced = Array.isArray(current) && current.every(p => p && p._source === 'task');
        if (current.length > 0 && !wasSynced) return;

        programDocs.length = 0;
        programDocs.push(...adminTasks.map(t => ({
            id: t.id,
            title: t.name,
            hours: String(t.hours ?? ''),
            desc: t.desc || '',
            image: (t.attachments && t.attachments[0] && t.attachments[0].dataUrl) ? t.attachments[0].dataUrl : defaultImage,
            joined: t.joined || [],
            skills: t.skills || [],
            _source: 'task'
        })));
        saveLocalPrograms();
    } catch {
        // ignore
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
            return;
        }
        alert("Program not found.");
        return;
    }

    try {
        await updateDoc(doc(db, "programs", id), {
            joined: arrayUnion(currentUser.id)
        });
    } catch (err) {
        console.error(err);
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
    if (currentUser.role !== "admin") {
        alert("Only admins can add programs.");
        return;
    }

    try {
        const title = document.getElementById("programTitle").value.trim();
        const hours = document.getElementById("programHours").value.trim();
        const desc = document.getElementById("programDesc").value.trim();
        const file = document.getElementById("programImage").files[0];

        if (!title) {
            alert("Title required");
            return;
        }

        const isEditing = window.editingProgramId !== undefined;
        
        // If editing and no new image selected, keep the old one
        let imageURL;
        if (isEditing && !file) {
            const existingProgram = programDocs.find(p => p.id === window.editingProgramId);
            imageURL = existingProgram.image;
        } else {
            imageURL = await uploadProgramImage(file);
        }
        
        if (isEditing) {
            // Update existing program
            const index = programDocs.findIndex(p => p.id === window.editingProgramId);
            if (index > -1) {
                programDocs[index].title = title;
                programDocs[index].hours = hours;
                programDocs[index].desc = desc;
                programDocs[index].image = imageURL;
            }
            window.editingProgramId = undefined;
            alert("Program updated!");
        } else {
            // Add new program
            const newProgram = {
                id: `local-${Date.now()}`,
                title,
                hours,
                desc,
                image: imageURL,
                joined: []
            };

            if (useFirestore) {
                const docRef = await addDoc(collection(db, "programs"), {
                    title,
                    hours,
                    desc,
                    image: imageURL,
                    joined: []
                });
                newProgram.id = docRef.id;
            }

            programDocs.push(newProgram);
            alert("Program added!");
        }
        
        saveLocalPrograms();
        renderPrograms(programDocs);
        closeModal();
    } catch (err) {
        console.error(err);
        alert("ERROR: " + err.message);
    }
};

function listenPrograms() {
    if (!useFirestore) {
        programDocs.length = 0;
        const loaded = loadLocalPrograms();
        console.log("listenPrograms (offline mode): loaded", loaded.length, "programs from", (loaded[0]?.title || 'unknown'));
        programDocs.push(...loaded);
        console.log("listenPrograms: programDocs now has", programDocs.length, "programs");
        renderPrograms(programDocs);
        console.log("listenPrograms: renderPrograms complete");
        return;
    }

    try {
        onSnapshot(collection(db, "programs"), (snap) => {
            programDocs.length = 0;
            snap.forEach((d) => {
                programDocs.push({ id: d.id, ...d.data() });
            });
            renderPrograms(programDocs);
        }, (err) => {
            console.warn("Realtime program list unavailable", err);
            programDocs.length = 0;
            programDocs.push(...loadLocalPrograms());
            renderPrograms(programDocs);
        });
    } catch (err) {
        console.warn("Realtime program list unavailable", err);
        programDocs.length = 0;
        programDocs.push(...loadLocalPrograms());
        renderPrograms(programDocs);
    }
}

window.debugAddSampleProgram = () => {
    programDocs.push({
        id: `debug-${Date.now()}`,
        title: "Debug Sample Program",
        hours: "2",
        desc: "Check hover, popup, and card display.",
        image: defaultImage,
        joined: []
    });
    saveLocalPrograms();
    renderPrograms(programDocs);
    alert("Debug sample program added.");
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

window.debugAddSampleTask = () => {
    const newTask = {
        id: `task${Date.now()}`,
        name: "Debug Task",
        desc: "A task for debugging purposes",
        hours: 1,
        maxVolunteers: 2,
        assigned: [],
        status: "active"
    };
    tasks.push(newTask);
    saveTasks();
    alert("Sample task added. Check admin panel for management.");
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
    
    // Reset users and tasks arrays
    users.length = 0;
    tasks.length = 0;
    
    // Save clean state
    saveLocalPrograms();
    saveUsers();
    saveTasks();
    
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
syncProgramsFromTasksIfNeeded();
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
