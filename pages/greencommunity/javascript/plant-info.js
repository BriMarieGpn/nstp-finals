import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

// Intro overlay animation
document.addEventListener('DOMContentLoaded', () => {
    const introOverlay = document.getElementById('intro-overlay');
    
    // Remove the intro overlay after animation completes (3.3 seconds total)
    setTimeout(() => {
        if (introOverlay) {
            introOverlay.style.pointerEvents = 'none';
            setTimeout(() => {
                introOverlay.remove();
            }, 300);
        }
    }, 3300);
});

// Photo / Video toggle
const mediaPlaceholder = document.getElementById('mediaPlaceholder');
const photoBtn = document.getElementById('photoBtn');
const videoBtn = document.getElementById('videoBtn');

let photoSrc = "your-photo.jpg";   // Default placeholder if no plant image is found
const videoSrc = "your-video.mp4";   // Change to your actual video if available

const setMediaPlaceholder = (content) => {
    if (mediaPlaceholder) {
        mediaPlaceholder.innerHTML = content;
    }
};

const setPhotoPlaceholder = (src, alt = 'Plant Photo') => {
    photoSrc = src;
    setMediaPlaceholder(`<img src="${photoSrc}" alt="${alt}" style="width:100%; height:100%; object-fit:cover; border-radius:17px;">`);
};

// Start with the placeholder by default
setPhotoPlaceholder(photoSrc);

photoBtn.addEventListener('click', () => {
    setPhotoPlaceholder(photoSrc, 'Plant Photo');
});

videoBtn.addEventListener('click', () => {
    setMediaPlaceholder(`
        <video width="100%" height="100%" controls style="border-radius:17px;">
            <source src="${videoSrc}" type="video/mp4">
            Your browser does not support the video tag.
        </video>
    `);
});

function normalizeName(value) {
    return (value || "").toString().replace(/[^a-zA-Z0-9 ]+/g, '').trim();
}

function titleCase(str) {
    return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

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
        herbs: '../assets/pics&icon/r.image/herbs.r/',
        fruits: '../assets/pics&icon/r.image/fruits.r/',
        vegetables: '../assets/pics&icon/r.image/vegatables.r/'
    };

    const bestFile = findBestMatch(plant.name, folderImageFiles[folderKey]);
    return bestFile ? folderMap[folderKey] + bestFile : null;
}

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

window.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const plantName = params.get('name');
    const category = params.get('category');

    if (plantName) {
        document.getElementById('name-header').textContent = plantName;
        document.getElementById('name').textContent = plantName;

        try {
            const q = query(collection(db, "plants"), where("name", "==", plantName));
            const snapshot = await getDocs(q);
            
            if (!snapshot.empty) {
                const plantData = snapshot.docs[0].data();
                
                const setText = (id, value) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = value ?? 'N/A';
                };

                const setHtml = (id, html) => {
                    const el = document.getElementById(id);
                    if (el) el.innerHTML = html ?? 'N/A';
                };

                const titleCase = (key) => {
                    return key
                        .replace(/[-_]/g, ' ')
                        .replace(/\b\w/g, char => char.toUpperCase());
                };

                const formatLines = (value) => {
                    if (value == null) return 'N/A';
                    return String(value)
                        .split(/\r?\n/)
                        .map(line => line.trim())
                        .filter(line => line.length)
                        .join('<br>');
                };

                const formatMapStrings = (value) => {
                    if (typeof value === 'string') return formatLines(value);
                    if (value && typeof value === 'object') {
                        return Object.entries(value)
                            .map(([k, v]) => {
                                if (Array.isArray(v)) {
                                    return `<div><strong>${titleCase(k)}:</strong><ul>${v.map(item => `<li>${formatLines(item)}</li>`).join('')}</ul></div>`;
                                }
                                return `<div><strong>${titleCase(k)}:</strong><br>${formatLines(v)}</div>`;
                            })
                            .join('') || 'N/A';
                    }
                    return 'N/A';
                };

                const formatMapArrays = (value) => {
                    if (Array.isArray(value)) {
                        return `<ul>${value.map(item => `<li>${formatLines(item)}</li>`).join('')}</ul>`;
                    }
                    if (value && typeof value === 'object') {
                        return Object.entries(value)
                            .filter(([, v]) => Array.isArray(v))
                            .map(([k, v]) => `
                                <div><strong>${titleCase(k)}:</strong>
                                    <ul>${v.map(item => `<li>${formatLines(item)}</li>`).join('')}</ul>
                                </div>
                            `)
                            .join('') || 'N/A';
                    }
                    return 'N/A';
                };

                // Populate all plant info fields
                setText('scientific_name', plantData.scientific_name);
                setText('type', plantData.type);
                setText('lifespan', plantData.lifespan);
                setText('category', plantData.category);
                setText('origin', plantData.origin);
                setText('habitat', plantData.habitat);
                setText('sunlight', plantData.sunlight);
                setText('water', plantData.water);
                setText('soil', plantData.soil);
                setText('size', plantData.size);
                setText('blossom', plantData.blossom);
                setText('uses', plantData.uses);
                setText('notes', plantData.notes);
                setHtml('needs', formatMapStrings(plantData.needs));
                setHtml('preparation', formatMapArrays(plantData['what-to-do']));
                setHtml('step-by-step', formatMapStrings(plantData['steps'] || plantData['step_by_step'] || plantData['step-by-step']));
                setText('where', plantData.where);
                setText('when', plantData.when);

                // Update media placeholder with local icon image only
                const imageSource = getIconPath({ name: plantName, category: plantData.category });
                if (imageSource) {
                    setPhotoPlaceholder(imageSource, plantName);
                }
            }
        } catch (error) {
            console.error("Error fetching plant details:", error);
        }
    }

    const backBtn = document.querySelector('.btn-left');
    if (backBtn) {
        backBtn.href = category ? `index.html?category=${encodeURIComponent(category)}` : 'index.html';
    }
});

