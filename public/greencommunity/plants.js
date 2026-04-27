import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCNjcXGW7mvVhjAVcFv8MphD943J2Z6x3w",
    authDomain: "growsauyou.firebaseapp.com",
    projectId: "growsauyou",
    storageBucket: "growsauyou.firebasestorage.app",
    messagingSenderId: "668294542285",
    appId: "1:668294542285:web:5f07bc1f8747a12d3d4a84",
    measurementId: "G-8XMRP43PRP"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let allPlants = [];
let currentCategory = null;
let currentFilters = { search: "", lifespan: "All", sort: "name-asc" };

function debounce(func, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
}

async function loadAllPlants() {
    if (allPlants.length > 0) return;
    try {
        const snapshot = await getDocs(collection(db, "plants"));
        allPlants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`Loaded ${allPlants.length} plants`);
    } catch (e) {
        console.error("Firestore error:", e);
    }
}

function renderGrid() {
    const container = document.getElementById("grid-container");
    container.innerHTML = "";

    let filtered = allPlants.filter(plant => {
        if (currentCategory && plant.category !== currentCategory) return false;
        if (currentFilters.search) {
            const term = currentFilters.search.toLowerCase();
            if (!(plant.name || "").toLowerCase().includes(term) &&
                !(plant.scientific_name || "").toLowerCase().includes(term)) return false;
        }
        if (currentFilters.lifespan !== "All" && plant.lifespan !== currentFilters.lifespan) return false;
        return true;
    });

    // Apply sorting
    if (currentFilters.sort === "name-asc") {
        filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (currentFilters.sort === "name-desc") {
        filtered.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    }

    if (filtered.length === 0) {
        container.innerHTML = "<p>No plants match your search or filter.</p>";
        return;
    }

    filtered.forEach(plant => {
        const card = document.createElement("div");
        card.className = "mini-card";
        card.innerHTML = `
             <div class="mini-card-img">
            <img src="${plant.image || 'images/wa.png'}" alt="${plant.name}" />
            </div>
            <h3>${plant.name}</h3>
            <p>${plant.type || ""} | ${plant.lifespan || ""}</p>
        `;
        // When clicked, run showFullDetail
        card.onclick = () => showFullDetail(plant);
        container.appendChild(card);
    });
}

function populatePopupOptions() {
    const plantsInCategory = allPlants.filter(p => p.category === currentCategory);
    const uniqueLifespan = [...new Set(plantsInCategory.map(p => p.lifespan).filter(Boolean))].sort();

    const select = document.getElementById("popup-lifespan");
    select.innerHTML = '<option value="All">All Lifespans</option>' +
        uniqueLifespan.map(l => `<option value="${l}">${l}</option>`).join('');
}

window.filterPlants = async function (category) {
    currentCategory = category;
    currentFilters = { search: "", lifespan: "All", sort: "name-asc" };

    document.getElementById("category-menu").style.display = "none";
    document.getElementById("plant-grid").style.display = "block";
    document.getElementById("plant-detail").style.display = "none";

    await loadAllPlants();
    populatePopupOptions();
    renderGrid();

    // Live search
    const searchInput = document.getElementById("live-search");
    searchInput.value = "";
    searchInput.oninput = debounce(() => {
        currentFilters.search = searchInput.value.trim();
        renderGrid();
    }, 200);
};

window.clearFilters = function () {
    currentFilters = { search: "", lifespan: "All", sort: "name-asc" };
    document.getElementById("live-search").value = "";
    renderGrid();
};

// Popup functions
const popup = document.getElementById("filter-popup");

document.getElementById("filter-btn").addEventListener("click", () => {
    document.getElementById("popup-lifespan").value = currentFilters.lifespan;
    document.getElementById("popup-sort").value = currentFilters.sort;
    popup.style.display = "flex";
});

window.closePopup = function () {
    popup.style.display = "none";
};

window.applyFilters = function () {
    currentFilters.lifespan = document.getElementById("popup-lifespan").value;
    currentFilters.sort = document.getElementById("popup-sort").value;
    popup.style.display = "none";
    renderGrid();
};

// Close popup when clicking outside
popup.addEventListener("click", (e) => {
    if (e.target === popup) closePopup();
});

window.showMenu = function () {
    document.getElementById("category-menu").style.display = "flex";
    document.getElementById("plant-grid").style.display = "none";
    document.getElementById("plant-detail").style.display = "none";
};

window.showGrid = function () {
    document.getElementById("plant-grid").style.display = "block";
    document.getElementById("plant-detail").style.display = "none";
    renderGrid();
};

window.showFullDetail = function (plant) {
 
    window.location.href = `page456.html?name=${encodeURIComponent(plant.name)}`;
};

document.addEventListener("DOMContentLoaded", loadAllPlants);