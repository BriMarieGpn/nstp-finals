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

const folderImageFiles = {
    herbs: [
        'akapulko.png', 'aloe vera.jpeg', 'balanoy.png', 'balbaspusa.png', 'bayabas.jpg',
        'chives.jpg', 'cilantro.jpg', 'damong maria.png', 'dill.jpeg', 'ginger.jpeg',
        'gotu kola.jpeg', 'lagundi.jpg', 'mayana.jpg', 'oregano.jpg', 'pandan.png',
        'pansitpansitan.jpg', 'rosemary.jpeg', 'sambong.jpeg', 'serpentina.png',
        'stevia.jpg', 'tanglad.jpeg', 'tarragon.jpg', 'tsaang gubat.png', 'turmeric.jpeg',
        'yerba buena.jpeg'
    ],
    fruits: [
        'Avocado.jpg', 'Balimbing.jpg', 'Banana.jpg', 'Calamansi.jpg', 'Chico.jpg',
        'Dalandan.jpg', 'Dragon Fruit.jpg', 'Durian.jpg', 'Fig - Ficus Carica.jpg',
        'Guava Bayabas.jpg', 'Guyabano.jpg', 'Jackfruit.jpg', 'Lanzones.jpg', 'Manga.jpg',
        'Mulberry.jpg', 'Papaya.jpg', 'Passion Fruit.jpg', 'Rambutan.jpg', 'Santol.jpg', 
        'Starfruit.jpg', 'Sugar apple.jpg', 'Tomato.jpg'
    ],
    vegetables: [
        'Ampalaya.jpg', 'Baguio Beans.jpg', 'Bawang.jpg', 'Bell Pepper.jpg', 'Carrot.jpg',
        'Gabi.jpg', 'Kamote.jpg', 'Kangkong.jpg', 'Kintsay.jpg', 'Labanos.jpg',
        'Letsugas.jpg', 'Malunggay.jpg', 'Okra.jpg', 'Patatas.jpg', 'Pechay.jpg',
        'Pipino.jpg', 'Repolyo.jpg', 'Saluyot.jpg', 'Sibuyas Dahon.jpg', 'Sibuyas.jpg',
        'Sili.jpg', 'Sitaw.jpg', 'Snap Beans.jpg', 'Sweet Pea.jpg', 'Talong.jpg'
    ]
};

function normalizeName(value) {
    return (value || "").toString().replace(/[^a-zA-Z0-9 ]+/g, '').trim();
}

function findBestMatch(name, fileNames) {
    const normalized = normalizeName(name).toLowerCase();
    if (!normalized) return null;

    const simpleMatch = fileNames.find(file => {
        const base = normalizeName(file.replace(/\.[^.]+$/, '')).toLowerCase();
        return base === normalized || base.includes(normalized) || normalized.includes(base);
    });
    if (simpleMatch) return simpleMatch;

    const score = (a, b) => {
        const m = Math.min(a.length, b.length);
        let dist = 0;
        for (let i = 0; i < m; i += 1) {
            if (a[i] !== b[i]) dist += 1;
        }
        return dist + Math.abs(a.length - b.length);
    };

    const best = fileNames.reduce((bestFile, current) => {
        const currentBase = normalizeName(current.replace(/\.[^.]+$/, '')).toLowerCase();
        const currentScore = score(normalized, currentBase);
        if (!bestFile || currentScore < bestFile.score) {
            return { score: currentScore, file: current };
        }
        return bestFile;
    }, null);

    return best && best.score <= 2 ? best.file : null;
}

function getIconPath(plant) {
    const category = (plant.category || '').toLowerCase();
    let folderKey;

    if (category.includes('herb')) {
        folderKey = 'herbs';
    } else if (category.includes('fruit')) {
        folderKey = 'fruits';
    } else if (category.includes('vegetable')) {
        folderKey = 'vegetables';
    } else {
        return null;
    }

    const folderMap = {
        herbs: 'assets/pics&icon/r.image/herbs.r/',
        fruits: 'assets/pics&icon/r.image/fruits.r/',
        vegetables: 'assets/pics&icon/r.image/vegatables.r/'
    };

    const bestFile = findBestMatch(plant.name, folderImageFiles[folderKey]);
    return bestFile ? folderMap[folderKey] + bestFile : null;
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