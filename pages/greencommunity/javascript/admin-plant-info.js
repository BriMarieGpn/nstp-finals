import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, updateDoc, setDoc, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

// Cloudinary upload function
async function uploadToCloudinary(file) {
  const url = `https://api.cloudinary.com/v1_1/dzzprffte/image/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "plants_unsigned");
  const response = await fetch(url, { method: "POST", body: formData });
  const data = await response.json();
  return data.secure_url;
}

// Intro overlay animation
document.addEventListener('DOMContentLoaded', () => {
    const introOverlay = document.getElementById('intro-overlay');
    setTimeout(() => {
        if (introOverlay) {
            introOverlay.style.pointerEvents = 'none';
            setTimeout(() => introOverlay.remove(), 300);
        }
    }, 3300);
});

// --- GLOBAL MEDIA STATE ---
const mediaPlaceholder = document.getElementById('mediaPlaceholder');
const photoBtn = document.getElementById('photoBtn');
const videoBtn = document.getElementById('videoBtn');

let photoSrc = "your-photo.jpg"; 
let videoUrl = ""; // Updated from Firestore

const setMediaPlaceholder = (content) => {
    if (mediaPlaceholder) mediaPlaceholder.innerHTML = content;
};

const setPhotoPlaceholder = (src, alt = 'Plant Photo') => {
    photoSrc = src;
    setMediaPlaceholder(`<img src="${photoSrc}" alt="${alt}" style="width:100%; height:100%; object-fit:cover; border-radius:17px;">`);
};

// --- PHOTO MATCHING LOGIC (RESTORED - UNTOUCHED) ---
function normalizeName(value) {
    return (value || "").toString().replace(/[^a-zA-Z0-9 ]+/g, '').trim();
}

const folderImageFiles = {
    herbs: ['akapulko.png', 'aloe vera.jpeg', 'balanoy.png', 'balbaspusa.png', 'bayabas.jpg', 'chives.jpg', 'cilantro.jpg', 'damong maria.png', 'dill.jpeg', 'ginger.jpeg', 'gotu kola.jpeg', 'lagundi.jpg', 'mayana.jpg', 'oregano.jpg', 'pandan.png', 'pansitpansitan.jpg', 'rosemary.jpeg', 'sambong.jpeg', 'serpentina.png', 'stevia.jpg', 'tanglad.jpeg', 'tarragon.jpg', 'tsaang gubat.png', 'turmeric.jpeg', 'yerba buena.jpeg'],
    fruits: ['Avocado.jpg', 'Balimbing.jpg', 'Banana.jpg', 'Calamansi.jpg', 'Chico.jpg', 'Dalandan.jpg', 'Dragon Fruit.jpg', 'Durian.jpg', 'Fig - Ficus Carica.jpg', 'Guava Bayabas.jpg', 'Guyabano.jpg', 'Jackfruit.jpg', 'Lanzones.jpg', 'Manga.jpg', 'Mulberry.jpg', 'Papaya.jpg', 'Passion Fruit.jpg', 'Rambutan.jpg', 'Santol.jpg', 'Starfruit.jpg', 'Sugar apple.jpg', 'Tomato.jpg'],
    vegetables: ['Ampalaya.jpg', 'Baguio Beans.jpg', 'Bawang.jpg', 'Bell Pepper.jpg', 'Carrot.jpg', 'Gabi.jpg', 'Kamote.jpg', 'Kangkong.jpg', 'Kintsay.jpg', 'Labanos.jpg', 'Letsugas.jpg', 'Malunggay.jpg', 'Okra.jpg', 'Patatas.jpg', 'Pechay.jpg', 'Pipino.jpg', 'Repolyo.jpg', 'Saluyot.jpg', 'Sibuyas Dahon.jpg', 'Sibuyas.jpg', 'Sili.jpg', 'Sitaw.jpg', 'Snap Beans.jpg', 'Sweet Pea.jpg', 'Talong.jpg']
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
        for (let i = 0; i < m; i += 1) if (a[i] !== b[i]) dist += 1;
        return dist + Math.abs(a.length - b.length);
    };

    const best = fileNames.reduce((bestFile, current) => {
        const currentBase = normalizeName(current.replace(/\.[^.]+$/, '')).toLowerCase();
        const currentScore = score(normalized, currentBase);
        if (!bestFile || currentScore < bestFile.score) return { score: currentScore, file: current };
        return bestFile;
    }, null);
    return best && best.score <= 2 ? best.file : null;
}

function getIconPath(plant) {
    const category = (plant.category || '').toLowerCase();
    let folderKey = category.includes('herb') ? 'herbs' : category.includes('fruit') ? 'fruits' : category.includes('vegetable') ? 'vegetables' : null;
    if (!folderKey) return null;

    const folderMap = { herbs: '../assets/pics&icon/r.image/herbs.r/', fruits: '../assets/pics&icon/r.image/fruits.r/', vegetables: '../assets/pics&icon/r.image/vegatables.r/' };
    const bestFile = findBestMatch(plant.name, folderImageFiles[folderKey]);
    return bestFile ? folderMap[folderKey] + bestFile : null;
}

// --- FIREBASE CONFIG ---
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

let plantDocId = null;

function previewLocalImage(file, imgElement) {
  if (!file || !imgElement) return;
  const objectUrl = URL.createObjectURL(file);
  imgElement.onload = () => URL.revokeObjectURL(objectUrl);
  imgElement.src = objectUrl;
}

// --- MAIN DATA LOADING ---
window.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const plantName = params.get('name');
    let currentCategory = ""; // Store category for the back button

    if (plantName) {
        document.getElementById('name-header').textContent = plantName;
        document.getElementById('name').textContent = plantName;

        try {
            const q = query(collection(db, "plants"), where("name", "==", plantName));
            const snapshot = await getDocs(q);
            
            if (!snapshot.empty) {
                plantDocId = snapshot.docs[0].id;
                const data = snapshot.docs[0].data();
                currentCategory = data.category; // Set current category

                // Video URL from Firestore field
                videoUrl = (data["video-url"] || "").trim();

                // Populate Text Fields
                const fieldIds = ['scientific_name', 'type', 'lifespan', 'category', 'origin', 'habitat', 'sunlight', 'water', 'soil', 'size', 'bloom', 'uses', 'notes', 'where', 'when'];
                fieldIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = data[id] || 'N/A';
                });

                // Handle rich text fields
                if (document.getElementById('needs')) document.getElementById('needs').innerHTML = (data.needs || 'N/A');
                if (document.getElementById('preparation')) document.getElementById('preparation').innerHTML = (data['what-to-do'] || 'N/A');
                if (document.getElementById('step-by-step')) document.getElementById('step-by-step').innerHTML = (data['steps'] || 'N/A');

                // Initialize Photo - check for custom uploaded image first, then fall back to icon matching
                if (data.image && data.image.trim()) {
                    setPhotoPlaceholder(data.image, plantName);
                } else {
                    const imageSource = getIconPath({ name: plantName, category: data.category });
                    if (imageSource) setPhotoPlaceholder(imageSource, plantName);
                    else setPhotoPlaceholder("../assets/images/bg.png");
                }

                // Setup image upload
                const plantImgUpload = document.getElementById('plantImgUpload');
                const uploadImgBtn = document.getElementById('uploadImgBtn');
                const uploadImgStatus = document.getElementById('uploadImgStatus');

                if (plantImgUpload && uploadImgBtn) {
                    plantImgUpload.addEventListener('change', () => {
                        if (!plantImgUpload.files || plantImgUpload.files.length === 0) return;
                        const imgEl = document.querySelector('.media-placeholder img');
                        if (imgEl) previewLocalImage(plantImgUpload.files[0], imgEl);
                        if (uploadImgStatus) {
                            uploadImgStatus.textContent = 'Ready to upload new image';
                            uploadImgStatus.style.color = '#0b7a0b';
                        }
                    });

                    uploadImgBtn.addEventListener('click', async () => {
                        if (!plantImgUpload.files || plantImgUpload.files.length === 0) {
                            uploadImgStatus.textContent = 'Please select an image file.';
                            uploadImgStatus.style.color = '#b00';
                            return;
                        }
                        uploadImgStatus.textContent = 'Uploading...';
                        uploadImgStatus.style.color = '#0b7a0b';
                        try {
                            const file = plantImgUpload.files[0];
                            const imageUrl = await uploadToCloudinary(file);
                            await updateDoc(doc(db, 'plants', plantDocId), { image: imageUrl });
                            setPhotoPlaceholder(imageUrl, plantName);
                            photoSrc = imageUrl;
                            uploadImgStatus.textContent = 'Image uploaded and updated!';
                            uploadImgStatus.style.color = '#0b7a0b';
                        } catch (err) {
                            console.error('Upload error:', err);
                            uploadImgStatus.textContent = 'Failed to upload image.';
                            uploadImgStatus.style.color = '#b00';
                        }
                    });
                }

                // Setup video URL save
                const videoUrlInput = document.getElementById('video-url');
                const saveVideoBtn = document.getElementById('saveVideoBtn');

                if (videoUrlInput) {
                    videoUrlInput.value = videoUrl;
                }

                if (saveVideoBtn) {
                    saveVideoBtn.addEventListener('click', async () => {
                        const newVideoUrl = videoUrlInput.value.trim();
                        try {
                            await updateDoc(doc(db, 'plants', plantDocId), { 'video-url': newVideoUrl });
                            videoUrl = newVideoUrl;
                            const originalText = saveVideoBtn.textContent;
                            saveVideoBtn.textContent = 'Saved!';
                            saveVideoBtn.style.background = '#0b7a0b';
                            setTimeout(() => {
                                saveVideoBtn.textContent = originalText;
                                saveVideoBtn.style.background = '';
                            }, 2000);
                        } catch (err) {
                            console.error('Error saving video URL:', err);
                            alert('Failed to save video URL');
                        }
                    });
                }
            }
        } catch (error) {
            console.error("Error fetching plant:", error);
        }
    }

    // --- BACK BUTTON LOGIC ---
    const backBtn = document.querySelector('.animated-button.btn-left');
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault(); 
            const targetUrl = new URL('./admin-index.html', window.location.href);
            // Use currentCategory obtained from the Firestore data
            if (currentCategory) {
                targetUrl.searchParams.set('category', currentCategory);
            }
            window.location.href = targetUrl.toString();
        });
    }

    // --- MEDIA TOGGLE LISTENERS ---
    if (photoBtn) {
        photoBtn.addEventListener('click', () => setPhotoPlaceholder(photoSrc));
    }

    if (videoBtn) {
        videoBtn.addEventListener('click', () => {
            if (!videoUrl || videoUrl.trim() === "") {
                setMediaPlaceholder(`
                    <div style="width:100%; height:100%; border-radius:17px; display:flex; align-items:center; justify-content:center; background:#2c3e50; color:white;">
                        <p>No video link provided.</p>
                    </div>
                `);
                return;
            }

            let finalUrl = videoUrl;
            if (videoUrl.includes("youtube.com/watch?v=")) {
                finalUrl = videoUrl.replace("watch?v=", "embed/");
            } else if (videoUrl.includes("youtu.be/")) {
                finalUrl = videoUrl.replace("youtu.be/", "youtube.com/embed/");
            }

            setMediaPlaceholder(`
                <iframe 
                    src="${finalUrl}" 
                    style="width:100%; height:100%; border:none; border-radius:17px; background:#000;" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                </iframe>
            `);
        });
    }

    // --- ADMIN BUTTONS ---
    document.getElementById('deletePlantBtn')?.addEventListener('click', async () => {
        if (confirm('Are you sure?') && plantDocId) {
            await deleteDoc(doc(db, "plants", plantDocId));
            window.location.href = 'admin-index.html';
        }
    });
});