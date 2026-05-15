import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import firebaseConfig from "./firebaseConfig.js";

const CATEGORY_ALIASES = new Map([
    ["soil preparation", "Soil Preparation"],
    ["planting & propagation", "Planting & Propagation"],
    ["planting and propagation", "Planting & Propagation"],
    ["watering & irrigation", "Watering & Irrigation"],
    ["watering and irrigation", "Watering & Irrigation"],
    ["pruning & maintenance", "Pruning & Maintenance"],
    ["pruning and maintenance", "Pruning & Maintenance"],
    ["harvesting", "Harvesting"],
    ["pest control", "Pest Control"],
    ["protective & safety", "Protective & Safety"],
    ["protective and safety", "Protective & Safety"],
    ["protective & safety gear", "Protective & Safety"],
    ["protective and safety gear", "Protective & Safety"]
]);

const TOOL_IMAGE_FALLBACKS = new Map([
    ["trowel", "trowel.png"],
    ["hoe", "hoe.png"],
    ["pitchfork", "pitchfork.png"],
    ["shovel", "shovel.png"],
    ["seed trays", "seed-trays.png"],
    ["dibbers", "dibbers.png"],
    ["plant labels", "plant-labels.png"],
    ["seed starter kit", "seed-starter-kit.png"],
    ["watering can", "watering-can.png"],
    ["hose", "hose.png"],
    ["spray nozzles", "spray-nozzles.png"],
    ["sprinkler", "sprinkler.png"],
    ["garden scissors", "garden-scissors.png"],
    ["hedge trimmers", "hedge-trimmers.png"],
    ["pruning shears", "pruning-shears.png"],
    ["harvest baskets", "harvest-baskets.png"],
    ["garden knives", "garden-knives.png"],
    ["fruit pickers", "fruit-pickers.png"],
    ["harvest scissors", "harvest-scissors.png"],
    ["garden sprayers", "garden-sprayers.png"],
    ["insect nets", "insect-nets.png"],
    ["sticky traps", "sticky-traps.png"],
    ["hand dusters", "hand-dusters.png"],
    ["gloves", "gloves.png"],
    ["aprons", "aprons.png"],
    ["masks", "masks.png"],
    ["knee pads", "knee-pads.png"]
]);

function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeCategoryKey(value) {
    return normalizeText(value)
        .replace(/&/g, " and ")
        .replace(/\btools?\b/g, "")
        .replace(/\bgear\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function getCanonicalCategory(value) {
    const normalized = normalizeCategoryKey(value);
    return CATEGORY_ALIASES.get(normalized) || value;
}

function getCategoryFromPage() {
    const explicitCategory = document.body.dataset.toolCategory || "";
    if (explicitCategory) {
        return getCanonicalCategory(explicitCategory);
    }

    const heroTitle = document.querySelector(".category-hero h1")?.textContent || "";
    const cleanTitle = heroTitle.replace(/\s+tools?$/i, "").trim();
    return getCanonicalCategory(cleanTitle);
}

function slugify(value) {
    return normalizeText(value).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function resolveImageForCategoryPage(rawImage, toolName) {
    const fallback = "../../assets/images/shovel.png";
    if (!rawImage) return fallback;
    if (rawImage.startsWith("data:")) return rawImage;
    if (/^https?:\/\//i.test(rawImage)) return rawImage;

    const cleaned = rawImage.replace(/^\.\//, "");
    if (cleaned.startsWith("../../") || cleaned.startsWith("../")) return cleaned;
    if (cleaned.startsWith("assets/images/")) return `../../${cleaned}`;
    if (!cleaned.includes("/")) return `../../assets/images/${cleaned}`;

    const baseName = cleaned.replace(/^.*[\\/]/, "");
    return `../../assets/images/${baseName}`;
}

function getFallbackImageByToolName(toolName) {
    const filename = TOOL_IMAGE_FALLBACKS.get(normalizeText(toolName));
    return filename ? `../../assets/images/${filename}` : "../../assets/images/shovel.png";
}

function isCategoryMatch(toolCategory, pageCategory) {
    return normalizeCategoryKey(toolCategory) === normalizeCategoryKey(pageCategory);
}

function buildCard(tool) {
    const link = document.createElement("a");
    link.className = "tool-card";
    const detailUrl = new URL("../tools/tool-info.html", window.location.href);
    detailUrl.searchParams.set("tool", tool.name);
    detailUrl.searchParams.set("category", tool.category || getCategoryFromPage());
    link.href = `${detailUrl.pathname}${detailUrl.search}`;

    const img = document.createElement("img");
    img.src = resolveImageForCategoryPage(tool.image, tool.name);
    img.alt = tool.name;
    img.loading = "lazy";
    img.onerror = () => {
        const nextFallback = getFallbackImageByToolName(tool.name);
        if (img.src.includes(nextFallback.replace("../../", ""))) {
            img.src = buildToolPlaceholderSvg(tool.name);
            return;
        }
        img.src = nextFallback;
    };

    const label = document.createElement("span");
    label.textContent = tool.name;

    link.appendChild(img);
    link.appendChild(label);
    return link;
}

function updateExistingCardsToDynamicDetails(grid, category) {
    const existingCards = Array.from(grid.querySelectorAll(".tool-card"));
    existingCards.forEach((card) => {
        const label = card.querySelector("span")?.textContent?.trim();
        if (!label) {
            return;
        }
        const detailUrl = new URL("../tools/tool-info.html", window.location.href);
        detailUrl.searchParams.set("tool", label);
        detailUrl.searchParams.set("category", category);
        card.href = `${detailUrl.pathname}${detailUrl.search}`;
    });
}

function normalizeTool(docId, data) {
    return {
        id: docId,
        name: (data.tool_name || data.name || docId || "Tool").trim(),
        category: getCanonicalCategory(data.category || "General Tools"),
        image: data.image_url || data.image || `${slugify(data.tool_name || data.name || docId)}.png`
    };
}

function buildToolPlaceholderSvg(toolName) {
    const safeLabel = encodeURIComponent(String(toolName || "Tool"));
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='180' viewBox='0 0 240 180'%3E%3Crect width='240' height='180' rx='18' fill='%23dfe7cf'/%3E%3Ctext x='120' y='84' text-anchor='middle' font-family='Segoe UI,sans-serif' font-size='28' fill='%23546b41'%3ETOOL%3C/text%3E%3Ctext x='120' y='126' text-anchor='middle' font-family='Segoe UI,sans-serif' font-size='14' fill='%234a5c3a'%3E${safeLabel}%3C/text%3E%3C/svg%3E`;
}

async function loadCategoryTools() {
    const grid = document.querySelector(".tool-grid");
    if (!grid) return;

    const category = getCategoryFromPage();
    if (!category) return;

    const isFirestoreConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
    if (!isFirestoreConfigured) {
        return;
    }

    try {
        const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
        const db = getFirestore(app);
        const snapshot = await getDocs(collection(db, "tools"));
        const tools = snapshot.docs
            .map((entry) => normalizeTool(entry.id, entry.data()))
            .filter((tool) => isCategoryMatch(tool.category, category))
            .sort((a, b) => a.name.localeCompare(b.name));

        if (!tools.length) {
            updateExistingCardsToDynamicDetails(grid, category);
            return;
        }

        updateExistingCardsToDynamicDetails(grid, category);

        const existingToolNames = new Set(
            Array.from(grid.querySelectorAll(".tool-card span"))
                .map((label) => normalizeText(label.textContent))
                .filter(Boolean)
        );

        const missingTools = tools.filter((tool) => !existingToolNames.has(normalizeText(tool.name)));
        if (!missingTools.length) {
            return;
        }

        missingTools.forEach((tool) => grid.appendChild(buildCard(tool)));
    } catch (error) {
        console.warn("Failed to load category tools from Firestore.", error);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadCategoryTools();
});
