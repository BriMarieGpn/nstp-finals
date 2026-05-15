import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { collection, getDocs, getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import firebaseConfig from "./firebaseConfig.js";

(async function initToolDetails() {
    const TOOLS_COLLECTION = "tools";
    const FALLBACK_IMAGE = "../../assets/images/shovel.png";

    const CATEGORY_TO_PAGE = {
        "soil preparation": "../categories/soil-preparation-tools.html",
        "planting & propagation": "../categories/planting-and-propagation-tools.html",
        "watering & irrigation": "../categories/watering-and-irrigation-tools.html",
        "pruning & maintenance": "../categories/pruning-and-maintenance-tools.html",
        "harvesting": "../categories/harvesting-tools.html",
        "pest control": "../categories/pest-control-tools.html",
        "protective & safety": "../categories/protective-and-safety-gear.html"
    };

    const params = new URLSearchParams(window.location.search);
    const requestedTool = (params.get("tool") || "").trim();
    const requestedCategory = (params.get("category") || "").trim();

    const toolTitle = document.getElementById("toolTitle");
    const toolDescription = document.getElementById("toolDescription");
    const toolImage = document.getElementById("toolImage");
    const recommendGrid = document.getElementById("recommendGrid");
    const borrowBtn = document.getElementById("hereRaminBorrowBtn");
    const tutorialTitle = document.getElementById("tutorialTitle");
    const tutorialText = document.getElementById("tutorialText");
    const tutorialVideo = document.getElementById("tutorialVideo");

    const wikiBtn = document.getElementById("wikiHowBtn");
    const wikiModal = document.getElementById("wikiModal");
    const wikiClose = document.getElementById("wikiClose");

    function normalizeText(value) {
        return String(value || "").trim().toLowerCase();
    }

    function toTitleCase(value) {
        return String(value || "")
            .split(/\s+/)
            .filter(Boolean)
            .map((part) => part[0].toUpperCase() + part.slice(1))
            .join(" ");
    }

    function resolveImage(rawImage) {
        if (!rawImage) {
            return FALLBACK_IMAGE;
        }
        const value = String(rawImage).trim();
        if (!value) {
            return FALLBACK_IMAGE;
        }
        if (value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://")) {
            return value;
        }
        if (/assets[\\/]+images[\\/]+/i.test(value)) {
            const match = value.replace(/\\/g, "/").match(/assets\/images\/.+$/i);
            if (match?.[0]) {
                return `../../${match[0]}`;
            }
        }
        if (value.startsWith("assets/images/")) {
            return `../../${value}`;
        }
        if (!value.includes("/")) {
            return `../../assets/images/${value}`;
        }
        return value;
    }

    function fallbackDescription(toolName, category) {
        return `${toolName} is available in the ${category} category. Use this tool safely and return it on time so other residents can borrow it.`;
    }

    function createYouTubeEmbedUrl(toolName) {
        const query = encodeURIComponent(`how to use ${toolName} gardening tool`);
        return `https://www.youtube.com/embed?listType=search&list=${query}`;
    }

    function parseTutorialSteps(descriptionText, toolName) {
        const cleanName = toolName || "this tool";
        return [
            `Inspect ${cleanName} before use and make sure it is clean and ready.`,
            `Prepare your work area and use steady, controlled movements.`,
            `Follow safe handling while doing your gardening task.`,
            `Clean ${cleanName} after use and store it properly.`
        ].map((step) => `<li>${step}</li>`).join("");
    }

    async function fetchTools() {
        const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
        const db = getFirestore(app);
        const snap = await getDocs(collection(db, TOOLS_COLLECTION));
        return snap.docs.map((entry) => {
            const data = entry.data() || {};
            const name = data.tool_name || data.name || entry.id;
            const category = data.category || requestedCategory || "General Tools";
            return {
                id: entry.id,
                name,
                category,
                image: resolveImage(data.image_url || data.image),
                description: String(data.description || "").trim(),
                wikihowUrl: String(data.wikihow_url || "").trim(),
                deleted: Boolean(data.deleted)
            };
        }).filter((tool) => !tool.deleted);
    }

    function renderMainTool(tool) {
        const description = tool.description || fallbackDescription(tool.name, tool.category);
        toolTitle.textContent = tool.name;
        toolDescription.textContent = description;
        toolImage.src = tool.image || FALLBACK_IMAGE;
        toolImage.alt = tool.name;
        borrowBtn.href = `../../hereramin/index.html?tool=${encodeURIComponent(tool.name)}`;
        document.title = `Tool Info | ${tool.name}`;

        tutorialTitle.textContent = `How to Use ${tool.name}`;
        tutorialText.innerHTML = `<ol>${parseTutorialSteps(description, tool.name)}</ol>`;
        tutorialVideo.src = createYouTubeEmbedUrl(tool.name);
        wikiBtn.dataset.wikihowUrl = tool.wikihowUrl || "";
    }

    function renderRecommended(tools, currentTool) {
        const sameCategory = tools.filter((tool) =>
            normalizeText(tool.category) === normalizeText(currentTool.category)
        );
        const ordered = [
            currentTool,
            ...sameCategory.filter((tool) => normalizeText(tool.name) !== normalizeText(currentTool.name))
        ].slice(0, 6);

        recommendGrid.innerHTML = "";
        ordered.forEach((tool) => {
            const isActive = normalizeText(tool.name) === normalizeText(currentTool.name);
            const button = document.createElement("button");
            button.className = `recommend-item${isActive ? " active" : ""}`;
            button.type = "button";
            button.innerHTML = `
                <img src="${tool.image || FALLBACK_IMAGE}" alt="${tool.name}">
                <div><span>Tool Name:</span><strong>${tool.name}</strong></div>
            `;
            button.addEventListener("click", () => {
                const next = new URL(window.location.href);
                next.searchParams.set("tool", tool.name);
                next.searchParams.set("category", tool.category);
                window.location.href = `${next.pathname}${next.search}`;
            });
            recommendGrid.appendChild(button);
        });
    }

    function renderCategoryCards(currentCategory, tools) {
        const container = document.getElementById("categoryCards");
        if (!container) {
            return;
        }
        const uniqueCategories = Array.from(
            new Map(
                tools.map((tool) => [normalizeText(tool.category), tool.category])
            ).values()
        );

        const prioritized = [
            currentCategory,
            ...uniqueCategories.filter((cat) => normalizeText(cat) !== normalizeText(currentCategory))
        ].filter(Boolean).slice(0, 3);

        container.innerHTML = "";
        prioritized.forEach((categoryName) => {
            const key = normalizeText(categoryName);
            const example = tools.find((tool) => normalizeText(tool.category) === key);
            const href = CATEGORY_TO_PAGE[key] || "../overview.html";
            const card = document.createElement("a");
            card.className = "mini-category-card";
            card.href = href;
            card.innerHTML = `
                <img src="${example?.image || FALLBACK_IMAGE}" alt="${categoryName}">
                <span>${toTitleCase(categoryName)} Tools</span>
            `;
            container.appendChild(card);
        });
    }

    function chooseCurrentTool(tools) {
        const byName = tools.find((tool) => normalizeText(tool.name) === normalizeText(requestedTool));
        if (byName) {
            return byName;
        }
        const byCategory = tools.find((tool) => normalizeText(tool.category) === normalizeText(requestedCategory));
        if (byCategory) {
            return byCategory;
        }
        return tools[0] || null;
    }

    try {
        const tools = await fetchTools();
        if (!tools.length) {
            toolTitle.textContent = "No tools found";
            toolDescription.textContent = "No tools are currently available in the catalog.";
            return;
        }

        const currentTool = chooseCurrentTool(tools);
        if (!currentTool) {
            return;
        }

        renderMainTool(currentTool);
        renderRecommended(tools, currentTool);
        renderCategoryCards(currentTool.category, tools);
    } catch (error) {
        console.error("Failed to load dynamic tool details:", error);
        toolTitle.textContent = requestedTool || "Tool";
        toolDescription.textContent = "Unable to load tool data right now. Please try again.";
    }

    wikiBtn.addEventListener("click", () => {
        const customWiki = wikiBtn.dataset.wikihowUrl || "";
        if (customWiki) {
            window.open(customWiki, "_blank", "noopener,noreferrer");
            return;
        }
        wikiModal.classList.add("active");
    });

    wikiClose.addEventListener("click", () => {
        wikiModal.classList.remove("active");
        tutorialVideo.src = tutorialVideo.src;
    });

    wikiModal.addEventListener("click", (event) => {
        if (event.target === wikiModal) {
            wikiModal.classList.remove("active");
            tutorialVideo.src = tutorialVideo.src;
        }
    });
})();
