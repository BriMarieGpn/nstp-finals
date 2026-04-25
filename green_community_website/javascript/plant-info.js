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

const herbIcons = [
    'plantimg_01.png','plantimg_02.png','plantimg_03.png','plantimg_04.png','plantimg_05.png','plantimg_06.png','plantimg_07.png','plantimg_08.png','plantimg_09.png','plantimg_10.png','plantimg_11.png','plantimg_12.png','plantimg_13.png','plantimg_14.png','plantimg_15.png','plantimg_16.png','plantimg_17.png','plantimg_18.png','plantimg_19.png','plantimg_20.png','plantimg_21.png','plantimg_22.png','plantimg_23.png','plantimg_24.png','plantimg_25.png'
];
const fruitIcons = [
    'plantimg_26.PNG','plantimg_27.png','plantimg_28.PNG','plantimg_29.png','plantimg_30.jpg','plantimg_33.png','plantimg_34.png','plantimg_35.PNG','plantimg_36.PNG','plantimg_37.PNG','plantimg_38.png','plantimg_39.PNG','plantimg_40.png','plantimg_41.PNG','plantimg_42.png','plantimg_43.PNG','plantimg_44.png','plantimg_45.png','plantimg_46.png','plantimg_47.png','plantimg_49.png'
];
const vegetableIcons = [
    'plantimg_48.jfif','plantimg_50.jfif','plantimg_51.jfif','plantimg_52.jfif','plantimg_53.jfif','plantimg_54.jpeg','plantimg_55.jfif','plantimg_56.jpeg','plantimg_57.jfif','plantimg_58.jfif','plantimg_59.jpeg','plantimg_60.jfif','plantimg_61.jfif','plantimg_62.jfif','plantimg_63.jfif','plantimg_64.jfif','plantimg_65.jfif','plantimg_66.jfif','plantimg_67.jfif','plantimg_68.jpeg','plantimg_69.jpeg','plantimg_70.jpeg','plantimg_71.jpeg','plantimg_72.jfif'
];
const iconSets = { herbs: herbIcons, fruits: fruitIcons, vegetable: vegetableIcons };

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

let photoSrc = "../assets/icons/herbs/plantimg_01.png";
const videoSrc = "your-video.mp4";

function setPhotoPreview() {
    if (!mediaPlaceholder) return;
    mediaPlaceholder.innerHTML = `<img src="${photoSrc}" alt="Plant Photo" style="width:100%; height:100%; object-fit:cover; border-radius:17px;">`;
}

setPhotoPreview();

photoBtn.addEventListener('click', () => {
    setPhotoPreview();
});

videoBtn.addEventListener('click', () => {
    if (!mediaPlaceholder) return;
    mediaPlaceholder.innerHTML = `
        <video width="100%" height="100%" controls style="border-radius:17px;">
            <source src="${videoSrc}" type="video/mp4">
            Your browser does not support the video tag.
        </video>
    `;
});

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

                // Update media placeholder with plant image
                photoSrc = plantData.image || getFallbackIconPath(plantName, plantData.category);
                setPhotoPreview();
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