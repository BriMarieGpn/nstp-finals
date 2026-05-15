import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, doc, collection, getDocs, addDoc, updateDoc, deleteDoc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
import firebaseConfig from "../../js/firebaseConfig.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const toolsCollection = "tools";
const borrowRequestsCollection = "borrow_requests";
let uploadedImageDataUrl = null;

function showAdminNotification(message, type = 'info') {
    const container = document.getElementById('adminNotification');
    if (!container) return;
    container.textContent = message;
    container.className = `admin-notification admin-notification--${type}`;
    container.style.display = 'block';
}

function clearAdminNotification() {
    const container = document.getElementById('adminNotification');
    if (!container) return;
    container.textContent = '';
    container.className = 'admin-notification';
    container.style.display = 'none';
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
        console.warn("Could not load admin profile", error);
    }

    return { role: "user" };
}

// Check if user is admin
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "../pages/i-tanim/login.html";
        return;
    }

    try {
        const profile = await getProfile(user);
        const role = String(profile?.role || "user").toLowerCase().trim();
        const email = String(user.email || "").toLowerCase();
        console.debug("Admin check profile", { role, email, profile });

        const isAdminEmail = email.includes("admin") || email.includes("@admin");
        if (role !== 'admin' && !isAdminEmail) {
            showAdminNotification("Access denied. Admin privileges required.", "error");
            alert("Access denied. Admin privileges required.");
            window.location.href = "../pages/i-tanim/user.html";
            return;
        }

        // User is admin, load the admin interface
        await loadTools();
        await loadRequests();
    } catch (error) {
        console.warn("Auth check failed", error);
        showAdminNotification("Unable to validate admin session. Redirecting to login.", "error");
        window.location.href = "../pages/i-tanim/login.html";
    }
});

// Logout
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        signOut(auth).then(() => {
            window.location.href = "../index.html";
        }).catch((error) => {
            console.error("Logout failed", error);
            alert("Logout failed. Please try again.");
        });
    });
}

// Tab switching
document.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".admin-section").forEach(s => s.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(tab.dataset.tab + "-section").classList.add("active");
    });
});

// Tools management
async function loadTools() {
    const toolsList = document.getElementById("toolsList");
    if (!toolsList) {
        console.warn("Unable to locate tools list container.");
        return;
    }
    toolsList.innerHTML = "";
    clearAdminNotification();

    try {
        const querySnapshot = await getDocs(collection(db, toolsCollection));
        if (querySnapshot.empty) {
            toolsList.innerHTML = `
                <div class="admin-note">No tools found yet. Use the Add New Tool button to create your first entry.</div>
            `;
        } else {
            querySnapshot.forEach((doc) => {
                const tool = doc.data();
                const toolItem = document.createElement("div");
                toolItem.className = "tool-item";
                toolItem.innerHTML = `
                    <div>
                        <strong>${tool.name || 'Untitled tool'}</strong> - ${tool.category || 'Uncategorized'} - ${tool.available ? "Available" : "Unavailable"}
                    </div>
                    <div>
                        <button class="edit-btn" data-id="${doc.id}">Edit</button>
                        <button class="delete-btn" data-id="${doc.id}">Delete</button>
                    </div>
                `;
                toolsList.appendChild(toolItem);
            });
        }

        // Add event listeners
        document.querySelectorAll(".edit-btn").forEach(btn => {
            btn.addEventListener("click", (e) => editTool(e.target.dataset.id));
        });
        document.querySelectorAll(".delete-btn").forEach(btn => {
            btn.addEventListener("click", (e) => deleteTool(e.target.dataset.id));
        });
    } catch (error) {
        console.error("Could not load tools", error);
        toolsList.innerHTML = `
            <div class="admin-note admin-note--error">Unable to load tools. Check your Firestore connection and browser console for details.</div>
        `;
        showAdminNotification("Unable to load tools. There may be a connection or permission issue.", "error");
    }
}

async function loadRequests() {
    const requestsList = document.getElementById("requestsList");
    if (!requestsList) {
        console.warn("Unable to locate requests list container.");
        return;
    }
    requestsList.innerHTML = "";
    clearAdminNotification();

    try {
        const querySnapshot = await getDocs(collection(db, borrowRequestsCollection));
        if (querySnapshot.empty) {
            requestsList.innerHTML = `
                <div class="admin-note">No borrow requests found yet.</div>
            `;
        } else {
            querySnapshot.forEach((doc) => {
                const request = doc.data();
                const requestItem = document.createElement("div");
                requestItem.className = "request-item";
                requestItem.innerHTML = `
                    <div>
                        <strong>${request.borrower?.name || 'Unknown borrower'}</strong> - ${request.tool?.name || 'Unknown tool'} - ${request.status || "Pending"}
                    </div>
                    <div>
                        <button class="approve-btn" data-id="${doc.id}">Approve</button>
                        <button class="reject-btn" data-id="${doc.id}">Reject</button>
                    </div>
                `;
                requestsList.appendChild(requestItem);
            });
        }

        // Add event listeners
        document.querySelectorAll(".approve-btn").forEach(btn => {
            btn.addEventListener("click", (e) => updateRequestStatus(e.target.dataset.id, "Approved"));
        });
        document.querySelectorAll(".reject-btn").forEach(btn => {
            btn.addEventListener("click", (e) => updateRequestStatus(e.target.dataset.id, "Rejected"));
        });
    } catch (error) {
        console.error("Could not load borrow requests", error);
        requestsList.innerHTML = `
            <div class="admin-note admin-note--error">Unable to load borrow requests. Check your Firestore connection and browser console for details.</div>
        `;
        showAdminNotification("Unable to load borrow requests. There may be a connection or permission issue.", "error");
    }
}

document.getElementById("addToolBtn").addEventListener("click", () => {
    document.getElementById("toolForm").style.display = "block";
    document.getElementById("toolFormElement").reset();
    document.getElementById("toolFormElement").dataset.id = "";
    uploadedImageDataUrl = null;
    const preview = document.getElementById("toolImagePreview");
    if (preview) {
        preview.style.display = "none";
        preview.src = "";
    }
});

document.getElementById("cancelToolBtn").addEventListener("click", () => {
    document.getElementById("toolForm").style.display = "none";
    uploadedImageDataUrl = null;
});

document.getElementById("toolImageFile").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) {
        uploadedImageDataUrl = null;
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        uploadedImageDataUrl = e.target.result;
        const preview = document.getElementById("toolImagePreview");
        if (preview) {
            preview.src = uploadedImageDataUrl;
            preview.style.display = "block";
        }
        document.getElementById("toolImage").value = uploadedImageDataUrl;
    };
    reader.readAsDataURL(file);
});

document.getElementById("toolFormElement").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("toolName").value;
    const category = document.getElementById("toolCategory").value;
    const image = uploadedImageDataUrl || document.getElementById("toolImage").value;
    const available = document.getElementById("toolAvailable").checked;
    const id = e.target.dataset.id;

    const payload = { name, category, image, available };
    if (id) {
        await updateDoc(doc(db, toolsCollection, id), payload);
    } else {
        await addDoc(collection(db, toolsCollection), payload);
    }

    document.getElementById("toolForm").style.display = "none";
    uploadedImageDataUrl = null;
    loadTools();
});

async function editTool(id) {
    const docSnap = await getDoc(doc(db, toolsCollection, id));
    if (docSnap.exists()) {
        const tool = docSnap.data();
        document.getElementById("toolName").value = tool.name;
        document.getElementById("toolCategory").value = tool.category;
        document.getElementById("toolImage").value = tool.image || tool.image_url || "";
        document.getElementById("toolAvailable").checked = tool.available;
        uploadedImageDataUrl = tool.image || tool.image_url || null;
        const preview = document.getElementById("toolImagePreview");
        if (preview && uploadedImageDataUrl && uploadedImageDataUrl.startsWith("data:")) {
            preview.src = uploadedImageDataUrl;
            preview.style.display = "block";
        } else if (preview) {
            preview.style.display = "none";
            preview.src = "";
        }
        document.getElementById("toolFormElement").dataset.id = id;
        document.getElementById("toolForm").style.display = "block";
    }
}

async function deleteTool(id) {
    if (confirm("Are you sure you want to delete this tool?")) {
        await deleteDoc(doc(db, toolsCollection, id));
        loadTools();
    }
}

async function updateRequestStatus(id, status) {
    await updateDoc(doc(db, borrowRequestsCollection, id), { status });
    loadRequests();
}