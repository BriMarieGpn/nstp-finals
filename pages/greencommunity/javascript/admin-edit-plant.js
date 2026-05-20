// Cloudinary upload function (mirroring admin-add.html)
async function uploadToCloudinary(file) {
  const url = `https://api.cloudinary.com/v1_1/dzzprffte/image/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "plants_unsigned");
  const response = await fetch(url, { method: "POST", body: formData });
  const data = await response.json();
  return data.secure_url;
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCNjcXGW7mvVhjAVcFv8MphD943J2Z6x3w",
  authDomain: "growsauyou.firebaseapp.com",
  projectId: "growsauyou",
  storageBucket: "growsauyou.firebasestorage.app",
  messagingSenderId: "668294542285",
  appId: "1:668294542285:web:5f07bc1f8747a12d3d4a84",
  measurementId: "G-8XMRP43PRP",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function showError(message) {
  const box = document.getElementById("error-box");
  const msg = document.getElementById("error-message");
  if (!box || !msg) return;
  box.style.display = "block";
  msg.textContent = message;
}

function hideError() {
  const box = document.getElementById("error-box");
  if (box) box.style.display = "none";
}

function normalizeText(v) {
  return (v ?? "").toString().trim();
}

function safeParseJson(text) {
  const t = (text ?? "").toString().trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return undefined; // means invalid json
  }
}

function previewLocalImage(file, imgEl) {
  if (!file || !imgEl) return;
  const objectUrl = URL.createObjectURL(file);
  imgEl.src = objectUrl;
  imgEl.onload = () => URL.revokeObjectURL(objectUrl);
}

function getQueryPlantId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function getQueryCategory() {
  const params = new URLSearchParams(window.location.search);
  return params.get("category");
}

function getFormValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function setFormValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (value === undefined || value === null) {
    el.value = "";
    return;
  }
  el.value = typeof value === "string" ? value : JSON.stringify(value);
}

function normalizePreparationForTextarea(prepVal) {
  const val = prepVal ?? "";
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const inner = val.preparation ?? val["preparation"] ?? "";
    if (Array.isArray(inner)) return inner.join("\n");
    if (typeof inner === "string") return inner;
    return "";
  }
  if (Array.isArray(val)) return val.map(String).join("\n");
  return typeof val === "string" ? val : String(val);
}

function normalizeStepsForTextarea(stepsVal) {
  if (stepsVal === null || stepsVal === undefined) return "";
  if (Array.isArray(stepsVal)) return stepsVal.map(String).join("\n");
  if (typeof stepsVal === "string") return stepsVal;
  if (typeof stepsVal === "object") {
    const candidate =
      stepsVal.steps ??
      stepsVal.step_by_step ??
      stepsVal["step-by-step"] ??
      stepsVal.step_by_step ??
      stepsVal["step"] ??
      stepsVal.step ??
      "";
    if (Array.isArray(candidate)) return candidate.map(String).join("\n");
    if (typeof candidate === "string") return candidate;
    return "";
  }
  return String(stepsVal);
}

window.addEventListener("DOMContentLoaded", async () => {
  const plantId = getQueryPlantId();
  if (!plantId) {
    showError("Missing plant ID in URL.");
    return;
  }

  hideError();

  const nameHeader = document.getElementById("name-header");
  const plantPhoto = document.getElementById("plantPhoto");
  const uploadImgBtn = document.getElementById("uploadImgBtn");
  const plantImgEdit = document.getElementById("plantImgEdit");
  const uploadImgStatus = document.getElementById("uploadImgStatus");

  if (plantImgEdit && plantPhoto) {
    plantImgEdit.addEventListener('change', () => {
      if (!plantImgEdit.files || plantImgEdit.files.length === 0) return;
      previewLocalImage(plantImgEdit.files[0], plantPhoto);
      if (uploadImgStatus) {
        uploadImgStatus.textContent = 'Ready to upload new image';
        uploadImgStatus.style.color = '#0b7a0b';
      }
    });
  }

  try {
    const snap = await getDoc(doc(db, "plants", plantId));
    if (!snap.exists()) {
      showError("Plant not found.");
      return;
    }

    const data = snap.data();

    if (nameHeader) nameHeader.textContent = data?.name ?? "(Plant)";

    if (plantPhoto) {
      if (data?.image) {
        plantPhoto.src = data.image;
      } else {
        plantPhoto.src = plantPhoto.src || '../assets/images/bg.png';
      }
    }

    // Basic fields
    setFormValue("name", data?.name ?? "");

    setFormValue("scientific_name", data?.scientific_name ?? "");
    setFormValue("type", data?.type ?? "");
    setFormValue("lifespan", data?.lifespan ?? "");
    setFormValue("category", data?.category ?? "");
    setFormValue("origin", data?.origin ?? "");
    setFormValue("habitat", data?.habitat ?? "");
    setFormValue("sunlight", data?.sunlight ?? "");
    setFormValue("water", data?.water ?? "");
    setFormValue("soil", data?.soil ?? "");
    setFormValue("size", data?.size ?? "");
    setFormValue("bloom", data?.bloom ?? "");
    setFormValue("uses", data?.uses ?? "");
    setFormValue("notes", data?.notes ?? "");

    // NEW: Load Video URL field from Firestore
    setFormValue("video-url", data?.["video-url"] ?? "");

    // Needs fields
    setFormValue(
      "fertilizers",
      data?.needs?.fertilizers ?? data?.needs?.fertilizer ?? ""
    );
    setFormValue(
      "soil-type",
      data?.needs?.["soil-type"] ??
      data?.needs?.soilType ??
      data?.needs?.typeOfSoil ??
      data?.needs?.type_of_soil ?? ""
    );

    // Preparation
    const prepVal = data?.["what-to-do"] ?? data?.preparation ?? "";
    setFormValue("preparation", normalizePreparationForTextarea(prepVal));

    // Steps
    const stepsVal =
      data?.["step-by-step"] ??
      data?.["step_by_step"] ??
      data?.step_by_step ??
      data?.steps ??
      "";
    setFormValue("step_by_step", normalizeStepsForTextarea(stepsVal));

    setFormValue("where", data?.where ?? "");
    setFormValue("when", data?.when ?? "");
  } catch (err) {
    console.error("Error loading plant:", err);
    showError("Failed to load plant data.");
  }

  const backBtn = document.querySelector('.animated-button.btn-left[href*="admin-index.html"]');
  const currentCategory = getQueryCategory(); // Get the category from the current URL

  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault(); // Prevent the default static href
      const targetUrl = new URL('./admin-index.html', window.location.href);
      
      if (currentCategory) {
        targetUrl.searchParams.set('category', currentCategory);
      }
      
      window.location.href = targetUrl.toString();
    });
  }

  const saveBtn = document.getElementById("saveBtn");
  const cancelBtn = document.getElementById("cancelBtn");

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      const cancelUrl = new URL('./admin-index.html', window.location.href);
      const incomingCategory = normalizeText(getQueryCategory());
      if (incomingCategory) cancelUrl.searchParams.set('category', incomingCategory);
      window.location.href = cancelUrl.toString();
    });
  }

  if (saveBtn) {
    const editEnableBtn = document.getElementById("editEnableBtn");
    if (editEnableBtn) editEnableBtn.style.display = "none";

    saveBtn.addEventListener("click", async () => {
      hideError();

      const updates = {};
      const name = normalizeText(getFormValue("name"));
      const scientific_name = normalizeText(getFormValue("scientific_name"));
      const type = normalizeText(getFormValue("type"));
      const lifespan = normalizeText(getFormValue("lifespan"));
      const category = normalizeText(getFormValue("category"));
      const origin = normalizeText(getFormValue("origin"));
      const habitat = normalizeText(getFormValue("habitat"));
      const sunlight = normalizeText(getFormValue("sunlight"));
      const water = normalizeText(getFormValue("water"));
      const soil = normalizeText(getFormValue("soil"));
      const size = normalizeText(getFormValue("size"));
      const blossom = normalizeText(getFormValue("blossom"));
      const uses = normalizeText(getFormValue("uses"));
      const notes = normalizeText(getFormValue("notes"));
      const videoUrl = normalizeText(getFormValue("video-url")); // Get Video URL

      // Validation
      if (!name) return showError("Plant name is required.");
      if (!category) return showError("Category is required.");
      if (!type) return showError("Type is required.");
      if (!lifespan) return showError("Lifespan is required.");

      updates.name = name;
      updates.scientific_name = scientific_name;
      updates.type = type;
      updates.lifespan = lifespan;
      updates.category = category;
      updates.origin = origin;
      updates.habitat = habitat;
      updates.sunlight = sunlight;
      updates.water = water;
      updates.soil = soil;
      updates.size = size;
      updates.blossom = blossom;
      updates.uses = uses;
      updates.notes = notes;
      updates["video-url"] = videoUrl; // Save Video URL

      // Needs
      const fertilizersText = normalizeText(getFormValue("fertilizers"));
      const soilTypeText = normalizeText(getFormValue("soil-type"));
      const needsObj = {
        fertilizers: fertilizersText,
        "soil-type": soilTypeText,
      };
      if (fertilizersText || soilTypeText) {
        updates.needs = needsObj;
      }

      // what-to-do
      const preparation = getFormValue("preparation");
      const prepLines = preparation.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const prepParsed = safeParseJson(preparation);
      if (prepParsed !== undefined && prepParsed !== null) {
        updates["what-to-do"] = prepParsed;
      } else {
        updates["what-to-do"] = prepLines;
      }

      // steps
      const stepsText = getFormValue("step_by_step");
      const stepsLines = stepsText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const stepsParsed = safeParseJson(stepsText);
      if (stepsParsed !== undefined && stepsParsed !== null) {
        updates["step-by-step"] = stepsParsed;
      } else {
        updates["step-by-step"] = stepsLines;
      }

      updates.where = normalizeText(getFormValue("where"));
      updates.when = normalizeText(getFormValue("when"));

      try {
        await updateDoc(doc(db, "plants", plantId), updates);
        alert("Plant updated successfully.");
        const successUrl = new URL('./admin-index.html', window.location.href);
        const incomingCategory = normalizeText(getQueryCategory());
        if (incomingCategory) successUrl.searchParams.set('category', incomingCategory);
        window.location.href = successUrl.toString();
      } catch (err) {
        console.error("Error updating plant:", err);
        showError("Failed to update plant. Please try again.");
      }
    });
  }
});