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
    apiKey: "YOUR_API_KEY",
    authDomain: "i-tanim.firebaseapp.com",
    projectId: "i-tanim",
    storageBucket: "i-tanim.appspot.com",
    messagingSenderId: "XXXX",
    appId: "XXXX"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const defaultImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='280' viewBox='0 0 500 280'%3E%3Crect width='500' height='280' fill='%23062A24'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Segoe UI, sans-serif' font-size='24' fill='%23C8F542'%3EImage unavailable%3C/text%3E%3C/svg%3E";
const programDocs = [];

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

const localStorageKey = "itanimLocalPrograms";
const initialFallbackPrograms = [
    {
        id: "local-1",
        title: "Tree Planting Drive",
        hours: "4",
        desc: "Join our tree planting drive to help the community.",
        image: "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=900&q=80",
        joined: []
    },
    {
        id: "local-2",
        title: "Community Clean-Up",
        hours: "2",
        desc: "Help clean local streets and parks.",
        image: "https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=900&q=80",
        joined: []
    },
    {
        id: "local-3",
        title: "Urban Gardening Workshop",
        hours: "3",
        desc: "Learn how to grow food in small spaces.",
        image: "https://images.unsplash.com/photo-1492496913980-501348b61469?auto=format&fit=crop&w=900&q=80",
        joined: []
    }
];

const isFirebaseConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
const useFirestore = isFirebaseConfigured;

function updateUserUI() {
    userLabel.innerText = `Role: ${currentUser.role}`;
    if (!useFirestore) {
        userLabel.innerText += " (offline demo)";
    }
}

function setAdminControls() {
    addBtn.style.display = currentUser.role === "admin" ? "block" : "none";
}

roleSwitcher.addEventListener("change", (e) => {
    currentUser.role = e.target.value;
    updateUserUI();
    setAdminControls();
    renderPrograms(programDocs);
});

setAdminControls();
updateUserUI();

addBtn.addEventListener("click", () => {
    if (currentUser.role !== "admin") {
        alert("Only admins can add programs.");
        return;
    }
    modal.style.display = "flex";
});

window.closeModal = () => {
    modal.style.display = "none";
};

window.closeDetailModal = () => {
    detailModal.style.display = "none";
};

detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) {
        window.closeDetailModal();
    }
});

function loadLocalPrograms() {
    const saved = localStorage.getItem(localStorageKey);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            console.warn("Could not parse saved programs", err);
        }
    }
    return [...initialFallbackPrograms];
}

function saveLocalPrograms() {
    localStorage.setItem(localStorageKey, JSON.stringify(programDocs));
}

function renderPrograms(programs) {
    publicList.innerHTML = "";

    if (!programs.length) {
        publicList.innerHTML = `
            <div style="padding: 18px; border-radius: 14px; background: rgba(255,255,255,0.08); opacity: 0.9;">
                No programs available yet.
            </div>
        `;
        return;
    }

    programs.forEach((program) => {
        const item = document.createElement("div");
        item.className = "program-item";
        item.addEventListener("click", () => showProgramDetail(program));

        const image = document.createElement("img");
        image.src = program.image || defaultImage;
        image.alt = program.title || "Program image";
        image.onerror = () => {
            image.src = defaultImage;
        };

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
    detailImage.src = program.image || defaultImage;
    detailImage.onerror = () => {
        detailImage.src = defaultImage;
    };
    detailTitle.textContent = program.title || "Untitled program";
    detailDesc.textContent = program.desc || "No description provided.";
    detailHours.textContent = `${program.hours || 0}`;
    detailJoined.textContent = `${(program.joined || []).length}`;
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
        return URL.createObjectURL(file);
    }
    try {
        const imageRef = ref(storage, `programImages/${Date.now()}-${file.name}`);
        await uploadBytes(imageRef, file);
        return await getDownloadURL(imageRef);
    } catch (err) {
        console.warn("Image upload failed, using placeholder image", err);
        return defaultImage;
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

        const imageURL = await uploadProgramImage(file);
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
        saveLocalPrograms();
        renderPrograms(programDocs);

        alert("Program added!");
        closeModal();
    } catch (err) {
        console.error(err);
        alert("ERROR: " + err.message);
    }
};

function listenPrograms() {
    if (!useFirestore) {
        programDocs.length = 0;
        programDocs.push(...loadLocalPrograms());
        renderPrograms(programDocs);
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

if (!useFirestore) {
    console.warn("Firebase is not configured. Using local demo data instead.");
}

listenPrograms();

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
}

function next() {
    index += 1;
    update();
}

function go(n) {
    index = n;
    update();
}

update();
