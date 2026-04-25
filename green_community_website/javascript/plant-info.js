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

const photoSrc = "your-photo.jpg";   // Change to your actual photo
const videoSrc = "your-video.mp4";   // Change to your actual video

// Start with photo by default
mediaPlaceholder.innerHTML = `<img src="${photoSrc}" alt="Plant Photo">`;

photoBtn.addEventListener('click', () => {
    mediaPlaceholder.innerHTML = `<img src="${photoSrc}" alt="Plant Photo">`;
});

videoBtn.addEventListener('click', () => {
    mediaPlaceholder.innerHTML = `
        <video width="100%" height="100%" controls style="border-radius:17px;">
            <source src="${videoSrc}" type="video/mp4">
            Your browser does not support the video tag.
        </video>
    `;
});


import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

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
                const mediaPlaceholder = document.getElementById('mediaPlaceholder');
                if (plantData.image && mediaPlaceholder) {
                    mediaPlaceholder.innerHTML = `<img src="${plantData.image}" alt="${plantName}" style="width:100%; height:100%; object-fit:cover; border-radius:17px;">`;
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