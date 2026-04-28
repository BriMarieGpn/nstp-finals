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

const herbNames = [
    'AKAPULKO', 
    'ALOE VERA', 
    'BALANOY', 
    'BALBAS-PUSA', 
    'BAYABAS', 
    'CHIVES', 
    'CILANTRO', 
    'DAMONG MARIA', 
    'DILL', 
    'GINGER', 
    'GOTU-KOLA', 
    'LAGUNDI', 
    'MAYANA', 
    'OREGANO', 
    'PANDAN', 
    'PANSIT-PANSITAN', 
    'ROSEMARY', 'SAMBONG', 
    'SERPENTINA', 
    'STEVIA', 
    'TANGLAD', 
    'TARRAGON', 
    'TSAANG GUBAT', 
    'TURMERIC', 
    'YERBA BUENA'
];
const herbIcons = ['plantimg_01.png', 'plantimg_02.png', 'plantimg_03.png', 'plantimg_04.png', 'plantimg_05.png', 'plantimg_06.png', 'plantimg_07.png', 'plantimg_08.png', 'plantimg_09.png', 'plantimg_10.png', 'plantimg_11.png', 'plantimg_12.png', 'plantimg_13.png', 'plantimg_14.png', 'plantimg_15.png', 'plantimg_16.png', 'plantimg_17.png', 'plantimg_18.png', 'plantimg_19.png', 'plantimg_20.png', 'plantimg_21.png', 'plantimg_22.png', 'plantimg_23.png', 'plantimg_24.png', 'plantimg_25.png'];

const herbIconMap = herbNames.reduce((map, name, idx) => {
    map[normalizeName(name)] = herbIcons[idx];
    return map;
}, {});

const fruitIconMap = {
    'AVOCADO': 'plantimg_26.PNG',
    'BANANA': 'plantimg_27.png',
    'CALAMANSI': 'plantimg_28.PNG',
    'GUYABANO': 'plantimg_29.png',
    'SUGAR APPLE': 'plantimg_30.jpg',
    'DURIAN': 'plantimg_33.png',
    'RAMBUTAN': 'plantimg_34.png',
    'PAPAYA': 'plantimg_35.PNG',
    'DRAGON FRUIT': 'plantimg_36.PNG',
    'GUAVA': 'plantimg_37.PNG',
    'LANZONES': 'plantimg_38.png',
    'PASSION FRUIT': 'plantimg_39.PNG',
    'CHICO': 'plantimg_40.png',
    'STARFRUIT': 'plantimg_41.PNG   ',
    'JACKFRUIT': 'plantimg_42.png',
    'MULBERRY': 'plantimg_43.PNG',
    'ORANGE': 'plantimg_44.png',
    'SANTOL': 'plantimg_45.png',
    'MANGO': 'plantimg_46.png',
    'FIG': 'plantimg_47.png',
    'TOMATO': 'plantimg_49.png'
};

const vegetableIconMap = {
    'PECHAY': 'plantimg_48.jpg',
    'TALONG': 'plantimg_50.jpg',
    'LABANOS': 'plantimg_51.png',
    'AMPALAYA': 'plantimg_52.jpg',
    'KANGKONG': 'plantimg_53.jpg',
    'SALUYOT': 'plantimg_54.png',
    'MALUNGGAY': 'plantimg_55.png',
    'SITAW': 'plantimg_56.png',
    'GABI': 'plantimg_57.jpg',
    'KAMOTE': 'plantimg_58.jpg',
    'BELL PEPPER': 'plantimg_59.jpg',
    'LETSUGAS': 'plantimg_60.jpg',
    'BAWANG': 'plantimg_61.jpg',
    'REPOLYO': 'plantimg_62.jpg',
    'CARROT': 'plantimg_63.jpg',
    'CELERY': 'plantimg_64.png',
    'SIBUYAS': 'plantimg_65.jpg',
    'SILI': 'plantimg_66.jpg',
    'POTATO': 'plantimg_67.png',
    'SNAP BEANS': 'plantimg_68.png',
    'SWEET PEA': 'plantimg_69.png',
    'PIPINO': 'plantimg_70.png',
    'OKRA': 'plantimg_71.png',
};

function normalizeName(value) {
    return (value || "").toString().toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function findIconFromMap(name, iconMap) {
    const exact = iconMap[name];
    if (exact) return exact;
    const partialMatch = Object.keys(iconMap).find(key => key.includes(name) || name.includes(key));
    return partialMatch ? iconMap[partialMatch] : null;
}

function getIconPath(plant) {
    const name = normalizeName(plant.name);
    const category = (plant.category || '').toLowerCase();
    let iconMap, path;

    if (category.includes('herb')) {
        iconMap = herbIconMap;
        path = '../assets/pics&icon/icon/herbs.i/';
    } else if (category.includes('fruit')) {
        iconMap = fruitIconMap;
        path = '../assets/pics&icon/icon/fruits.i/';
    } else if (category.includes('vegetable')) {
        iconMap = vegetableIconMap;
        path = '../assets/pics&icon/icon/vegetables.i/';
    } else {
        return null;
    }

    const iconName = findIconFromMap(name, iconMap);
    return iconName ? path + iconName : null;
}

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
        const iconSrc = getIconPath(plant);
        card.innerHTML = `
            <div class="mini-card-icon">
                ${iconSrc ? `<img src="${iconSrc}" alt="${plant.name} icon" />` : ''}
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