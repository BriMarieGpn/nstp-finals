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

// Sample plant data for demo
const SAMPLE_PLANTS = [
    // Fruits
    { id: "1", name: "Mango", scientific_name: "Mangifera indica", category: "Fruits", type: "Fruit", lifespan: "Perennial", image: "images/wa.png", description: "Sweet and delicious tropical fruit" },
    { id: "2", name: "Banana", scientific_name: "Musa", category: "Fruits", type: "Fruit", lifespan: "Perennial", image: "images/wa.png", description: "Rich in potassium and nutrients" },
    { id: "3", name: "Apple", scientific_name: "Malus domestica", category: "Fruits", type: "Fruit", lifespan: "Perennial", image: "images/wa.png", description: "Crispy and nutritious" },
    { id: "4", name: "Grape", scientific_name: "Vitis", category: "Fruits", type: "Fruit", lifespan: "Perennial", image: "images/wa.png", description: "Great for wine and fresh eating" },
    { id: "5", name: "Papaya", scientific_name: "Carica papaya", category: "Fruits", type: "Fruit", lifespan: "Perennial", image: "images/wa.png", description: "Tropical fruit rich in enzymes" },
    
    // Vegetables
    { id: "6", name: "Tomato", scientific_name: "Solanum lycopersicum", category: "Vegetables", type: "Vegetable", lifespan: "Annual", image: "images/wa.png", description: "Essential ingredient in cooking" },
    { id: "7", name: "Carrot", scientific_name: "Daucus carota", category: "Vegetables", type: "Vegetable", lifespan: "Annual", image: "images/wa.png", description: "Rich in beta-carotene" },
    { id: "8", name: "Broccoli", scientific_name: "Brassica oleracea", category: "Vegetables", type: "Vegetable", lifespan: "Annual", image: "images/wa.png", description: "Nutrient-packed cruciferous vegetable" },
    { id: "9", name: "Lettuce", scientific_name: "Lactuca sativa", category: "Vegetables", type: "Vegetable", lifespan: "Annual", image: "images/wa.png", description: "Fresh salad green" },
    { id: "10", name: "Spinach", scientific_name: "Spinacia oleracea", category: "Vegetables", type: "Vegetable", lifespan: "Annual", image: "images/wa.png", description: "Iron-rich leafy green" },
    { id: "11", name: "Pepper", scientific_name: "Capsicum", category: "Vegetables", type: "Vegetable", lifespan: "Annual", image: "images/wa.png", description: "Colorful and versatile" },
    
    // Herbs
    { id: "12", name: "Basil", scientific_name: "Ocimum basilicum", category: "Herbs", type: "Herb", lifespan: "Annual", image: "images/wa.png", description: "Aromatic culinary herb" },
    { id: "13", name: "Mint", scientific_name: "Mentha", category: "Herbs", type: "Herb", lifespan: "Perennial", image: "images/wa.png", description: "Refreshing and medicinal" },
    { id: "14", name: "Rosemary", scientific_name: "Rosmarinus officinalis", category: "Herbs", type: "Herb", lifespan: "Perennial", image: "images/wa.png", description: "Woody herb for cooking" },
    { id: "15", name: "Thyme", scientific_name: "Thymus vulgaris", category: "Herbs", type: "Herb", lifespan: "Perennial", image: "images/wa.png", description: "Mediterranean cooking herb" },
    { id: "16", name: "Oregano", scientific_name: "Origanum", category: "Herbs", type: "Herb", lifespan: "Perennial", image: "images/wa.png", description: "Essential Italian herb" },
    { id: "17", name: "Parsley", scientific_name: "Petroselinum crispum", category: "Herbs", type: "Herb", lifespan: "Annual", image: "images/wa.png", description: "Common fresh herb for garnish" }
];

async function loadAllPlants() {
    if (allPlants.length > 0) return;
    try {
        const snapshot = await getDocs(collection(db, "plants"));
        allPlants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`Loaded ${allPlants.length} plants from Firestore`);
        
        // If Firestore is empty, use sample data
        if (allPlants.length === 0) {
            allPlants = SAMPLE_PLANTS;
            console.log(`Loaded ${allPlants.length} sample plants (Firestore was empty)`);
        }
    } catch (e) {
        console.error("Firestore error:", e);
        // Fallback to sample data if Firebase fails
        allPlants = SAMPLE_PLANTS;
        console.log(`Using sample plants due to Firebase error`);
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