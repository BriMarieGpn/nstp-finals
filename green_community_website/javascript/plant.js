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

const herbIcons = [
    'plantimg_01.png','plantimg_02.png','plantimg_03.png','plantimg_04.png','plantimg_05.png','plantimg_06.png','plantimg_07.png','plantimg_08.png','plantimg_09.png','plantimg_10.png','plantimg_11.png','plantimg_12.png','plantimg_13.png','plantimg_14.png','plantimg_15.png','plantimg_16.png','plantimg_17.png','plantimg_18.png','plantimg_19.png','plantimg_20.png','plantimg_21.png','plantimg_22.png','plantimg_23.png','plantimg_24.png','plantimg_25.png'
];
const fruitIcons = [
    'plantimg_26.PNG','plantimg_27.png','plantimg_28.PNG','plantimg_29.png','plantimg_30.jpg','plantimg_33.png','plantimg_34.png','plantimg_35.PNG','plantimg_36.PNG','plantimg_37.PNG','plantimg_38.png','plantimg_39.PNG','plantimg_40.png','plantimg_41.PNG','plantimg_42.png','plantimg_43.PNG','plantimg_44.png','plantimg_45.png','plantimg_46.png','plantimg_47.png','plantimg_49.png'
];
const vegetableIcons = [
    'plantimg_48.jfif','plantimg_50.jfif','plantimg_51.jfif','plantimg_52.jfif','plantimg_53.jfif','plantimg_54.jpeg','plantimg_55.jfif','plantimg_56.jpeg','plantimg_57.jfif','plantimg_58.jfif','plantimg_59.jpeg','plantimg_60.jfif','plantimg_61.jfif','plantimg_62.jfif','plantimg_63.jfif','plantimg_64.jfif','plantimg_65.jfif','plantimg_66.jfif','plantimg_67.jfif','plantimg_68.jpeg','plantimg_69.jpeg','plantimg_70.jpeg','plantimg_71.jpeg','plantimg_72.jfif'
];

const iconSets = {
    herbs: herbIcons,
    fruits: fruitIcons,
    vegetable: vegetableIcons
};

function normalizeCategory(category) {
    const value = String(category || '').toLowerCase();
    if (value.includes('fruit')) return 'fruits';
    if (value.includes('veg')) return 'vegetable';
    return 'herbs';
}

function getFallbackIconPath(name, category) {
    const folder = normalizeCategory(category);
    const list = iconSets[folder] || herbIcons;
    const hash = String(name || '')
        .split('')
        .reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const fileName = list[hash % list.length];
    return `../assets/icons/${folder}/${fileName}`;
}

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
        const imagePath = plant.image || getFallbackIconPath(plant.name, plant.category);
        const card = document.createElement("div");
        card.className = "mini-card";
        card.innerHTML = `
            <div class="mini-card-img">
            <img src="${imagePath}" alt="${plant.name}" />
            </div>
            <h3>${plant.name}</h3>
            <p>${plant.scientific_name}</p>
            <p>${plant.type}</p>
            <p>${plant.lifespan}</p>
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
    select.innerHTML = '<option value="All">All Plants</option>' +
        uniqueLifespan.map(l => `<option value="${l}">${l}</option>`).join('');
}

window.filterPlants = async function (category) {
    currentCategory = category;
    currentFilters = { search: "", lifespan: "All", sort: "name-asc" };

    document.querySelector(".welcome-section").style.display = "none";
    document.querySelector(".text").style.display = "none";
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
    document.querySelector(".welcome-section").style.display = "flex";
    document.querySelector(".text").style.display = "block";
    document.getElementById("category-menu").style.display = "flex";
    document.getElementById("plant-grid").style.display = "none";
    document.getElementById("plant-detail").style.display = "none";
};

window.showGrid = function () {
    document.querySelector(".welcome-section").style.display = "none";
    document.querySelector(".text").style.display = "none";
    document.getElementById("plant-grid").style.display = "block";
    document.getElementById("plant-detail").style.display = "none";
    renderGrid();
};

window.showFullDetail = function (plant) {
    const categoryQuery = currentCategory ? `&category=${encodeURIComponent(currentCategory)}` : "";
    window.location.href = `plant-info.html?name=${encodeURIComponent(plant.name)}${categoryQuery}`;
};

document.addEventListener("DOMContentLoaded", async () => {
    await loadAllPlants();
    const params = new URLSearchParams(window.location.search);
    const category = params.get("category");
    if (category) {
        filterPlants(category);
    }
});