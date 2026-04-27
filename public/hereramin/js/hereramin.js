import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import firebaseConfig from "../../js/firebaseConfig.js";

(function() {
    const RECEIPT_STATE_KEY = "growsauyou-receipt-state";
    const BORROW_RECORD_KEY = "growsauyou-borrow-record";
    const BORROW_HISTORY_KEY = "growsauyou-borrow-history";
    const BORROW_DOC_PATH = ["hereramin", "latestBorrow"];
    const TOOLS_COLLECTION = "tools";
    const BORROW_REQUESTS_COLLECTION = "borrow_requests";

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const useFirestore = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");

    const defaultGroupedTools = [
        {
            category: "Soil Preparation",
            tools: [
                { name: "Trowel", image: "../assets/images/trowel.png", available: true },
                { name: "Hoe", image: "../assets/images/hoe.png", available: false },
                { name: "Pitchfork", image: "../assets/images/pitchfork.png", available: true },
                { name: "Shovel", image: "../assets/images/shovel.png", available: true }
            ]
        },
        {
            category: "Planting & Propagation",
            tools: [
                { name: "Seed Trays", image: "../assets/images/seed-trays.png", available: true },
                { name: "Dibbers", image: "../assets/images/dibbers.png", available: true },
                { name: "Plant Labels", image: "../assets/images/plant-labels.png", available: false },
                { name: "Seed Starter Kit", image: "../assets/images/seed-starter-kit.png", available: true }
            ]
        },
        {
            category: "Watering & Irrigation",
            tools: [
                { name: "Watering Can", image: "../assets/images/watering-can.png", available: true },
                { name: "Hose", image: "../assets/images/hose.png", available: false },
                { name: "Spray Nozzles", image: "../assets/images/spray-nozzles.png", available: true },
                { name: "Sprinkler", image: "../assets/images/sprinkler.png", available: true }
            ]
        },
        {
            category: "Pruning & Maintenance",
            tools: [
                { name: "Garden Scissors", image: "../assets/images/garden-scissors.png", available: false },
                { name: "Hedge Trimmers", image: "../assets/images/hedge-trimmers.png", available: true },
                { name: "Pruning Shears", image: "../assets/images/pruning-shears.png", available: true }
            ]
        },
        {
            category: "Harvesting",
            tools: [
                { name: "Harvest Baskets", image: "../assets/images/harvest-baskets.png", available: true },
                { name: "Garden Knives", image: "../assets/images/garden-knives.png", available: false },
                { name: "Fruit Pickers", image: "../assets/images/fruit-pickers.png", available: true },
                { name: "Harvest Scissors", image: "../assets/images/harvest-scissors.png", available: true }
            ]
        },
        {
            category: "Pest Control",
            tools: [
                { name: "Garden Sprayers", image: "../assets/images/garden-sprayers.png", available: true },
                { name: "Insect Nets", image: "../assets/images/insect-nets.png", available: true },
                { name: "Sticky Traps", image: "../assets/images/sticky-traps.png", available: false },
                { name: "Hand Dusters", image: "../assets/images/hand-dusters.png", available: true }
            ]
        },
        {
            category: "Protective & Safety",
            tools: [
                { name: "Gloves", image: "../assets/images/gloves.png", available: true },
                { name: "Aprons", image: "../assets/images/aprons.png", available: true },
                { name: "Masks", image: "../assets/images/masks.png", available: false },
                { name: "Knee Pads", image: "../assets/images/knee-pads.png", available: true }
            ]
        }
    ];
    let groupedTools = JSON.parse(JSON.stringify(defaultGroupedTools));

    const toolSelect = document.getElementById("toolSelect");
    const toolImage = document.getElementById("toolImage");
    const minusBtn = document.getElementById("minusBtn");
    const plusBtn = document.getElementById("plusBtn");
    const quantityText = document.getElementById("quantity");
    const availabilityBadge = document.getElementById("availabilityBadge");

    const addIdBtn = document.getElementById("addIdBtn");
    const idActions = document.querySelector(".id-actions");
    const fileInput = document.getElementById("fileInput");
    const idImage = document.getElementById("idImage");

    const canvas = document.getElementById("signaturePad");
    const ctx = canvas.getContext("2d");
    const clearSig = document.getElementById("clearSig");
    const borrowForm = document.getElementById("borrowForm");
    const backBtn = document.getElementById("backBtn");
    const borrowDateInput = document.getElementById("borrowDate");
    const returnDateInput = document.getElementById("returnDate");
    const borrowerName = document.getElementById("borrowerName");
    const borrowerAddress = document.getElementById("borrowerAddress");
    const borrowerAge = document.getElementById("borrowerAge");
    const borrowerContact = document.getElementById("borrowerContact");
    const borrowPurpose = document.getElementById("borrowPurpose");
    const fallbackToolMap = buildFallbackToolMap();
    let quantity = 1;

    function getAllTools() {
        return groupedTools.flatMap((group) => group.tools);
    }

    function normalizeText(value) {
        return String(value || "").trim().toLowerCase();
    }

    function getToolFromUrlParam() {
        const params = new URLSearchParams(window.location.search);
        return (params.get("tool") || "").trim();
    }

    function slugify(value) {
        return normalizeText(value).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    }

    function getCategoryForToolName(name) {
        for (const group of defaultGroupedTools) {
            for (const tool of group.tools) {
                if (normalizeText(tool.name) === normalizeText(name)) {
                    return group.category;
                }
            }
        }
        return "General Tools";
    }

    function getFallbackToolByName(name) {
        return fallbackToolMap.get(normalizeText(name)) || null;
    }

    function buildFallbackToolMap() {
        const map = new Map();
        defaultGroupedTools.forEach((group) => {
            group.tools.forEach((tool) => {
                map.set(normalizeText(tool.name), { ...tool, category: group.category });
            });
        });
        return map;
    }

    function populateTools() {
        toolSelect.innerHTML = "";
        groupedTools.forEach((group) => {
            const optGroup = document.createElement("optgroup");
            optGroup.label = group.category;
            group.tools.forEach((tool) => {
                const option = document.createElement("option");
                option.value = tool.name;
                option.textContent = tool.name;
                optGroup.appendChild(option);
            });
            toolSelect.appendChild(optGroup);
        });
    }

    function setAvailability(isAvailable) {
        availabilityBadge.classList.toggle("available", isAvailable);
        availabilityBadge.classList.toggle("unavailable", !isAvailable);
        availabilityBadge.textContent = isAvailable ? "Available" : "Not Available";
    }

    function setTool(toolName) {
        const tool = getAllTools().find((entry) => entry.name === toolName);
        if (!tool) return;
        if (tool.image) {
            toolImage.src = tool.image;
        }
        setAvailability(tool.available);
        if (quantity > (tool.maxQuantity || 10)) {
            quantity = Math.max(1, tool.maxQuantity || 10);
            quantityText.textContent = String(quantity);
        }
    }

    function getSelectedTool() {
        return getAllTools().find((entry) => entry.name === toolSelect.value) || null;
    }

    function applyToolFromQueryParam() {
        const toolFromParam = getToolFromUrlParam();
        if (!toolFromParam) {
            return;
        }
        const matchedTool = getAllTools().find((tool) => normalizeText(tool.name) === normalizeText(toolFromParam));
        if (!matchedTool) {
            return;
        }
        toolSelect.value = matchedTool.name;
        setTool(matchedTool.name);
    }

    function rebuildToolsFromFlatArray(flatTools) {
        const grouped = new Map();
        flatTools.forEach((tool) => {
            const category = tool.category || getCategoryForToolName(tool.name);
            if (!grouped.has(category)) {
                grouped.set(category, []);
            }
            grouped.get(category).push(tool);
        });
        groupedTools = Array.from(grouped.entries()).map(([category, tools]) => ({ category, tools }));
    }

    function normalizeToolFromFirestore(docId, data) {
        const toolName = data.tool_name || data.name || docId || "Tool";
        const fallback = getFallbackToolByName(toolName);
        const quantityAvailable = Number(data.quantity_available ?? data.quantity ?? data.quantity_total ?? 0);
        const quantityTotal = Number(data.quantity_total ?? quantityAvailable);
        const explicitAvailable = typeof data.available === "boolean" ? data.available : null;
        const statusValue = normalizeText(data.status_ || data.status);
        const isAvailable = explicitAvailable !== null
            ? explicitAvailable
            : quantityAvailable > 0 && statusValue !== "borrowed" && statusValue !== "unavailable";

        return {
            id: docId,
            name: toolName,
            category: data.category || fallback?.category || getCategoryForToolName(toolName),
            image: data.image_url || data.image || data.tool_image || fallback?.image || toolImage.src,
            available: isAvailable,
            maxQuantity: Math.max(1, quantityAvailable || quantityTotal || 1),
            quantityAvailable: Math.max(0, quantityAvailable),
            quantityTotal: Math.max(0, quantityTotal),
            description: data.description || "",
            wikihowUrl: data.wikihow_url || ""
        };
    }

    async function seedMissingToolsInFirestore(existingDocs) {
        const existingNames = new Set(
            existingDocs.map((item) => normalizeText(item.data.tool_name || item.data.name || item.id))
        );
        const seedPromises = [];
        defaultGroupedTools.forEach((group) => {
            group.tools.forEach((tool) => {
                const normalizedName = normalizeText(tool.name);
                if (existingNames.has(normalizedName)) {
                    return;
                }
                const newDocId = slugify(tool.name);
                const payload = {
                    tool_name: tool.name,
                    category: group.category,
                    description: `${tool.name} tool for ${group.category.toLowerCase()}.`,
                    image_url: new URL(tool.image, window.location.href).href,
                    quantity_available: tool.available ? 5 : 0,
                    quantity_total: 5,
                    status_: tool.available ? "Available" : "Unavailable",
                    wikihow_url: "",
                    created_at: new Date().toISOString()
                };
                seedPromises.push(setDoc(doc(db, TOOLS_COLLECTION, newDocId), payload, { merge: true }));
            });
        });

        if (seedPromises.length > 0) {
            await Promise.all(seedPromises);
        }
    }

    async function hydrateToolsFromFirestore() {
        if (!useFirestore) {
            return;
        }

        try {
            const toolsCollectionRef = collection(db, TOOLS_COLLECTION);
            const snapshot = await getDocs(toolsCollectionRef);
            const docs = snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));

            await seedMissingToolsInFirestore(docs);

            const refreshedSnapshot = await getDocs(toolsCollectionRef);
            const firestoreTools = refreshedSnapshot.docs.map((entry) => normalizeToolFromFirestore(entry.id, entry.data()));
            if (firestoreTools.length === 0) {
                return;
            }

            const selectedBefore = toolSelect.value;
            rebuildToolsFromFlatArray(firestoreTools);
            populateTools();

            const nextSelected = getAllTools().some((item) => item.name === selectedBefore)
                ? selectedBefore
                : getAllTools()[0]?.name;
            if (nextSelected) {
                toolSelect.value = nextSelected;
                setTool(nextSelected);
            }
            applyToolFromQueryParam();
        } catch (error) {
            console.warn("Could not pull tools from Firestore. Keeping local preview data.", error);
        }
    }

    populateTools();
    setTool(toolSelect.value);
    applyToolFromQueryParam();
    hydrateToolsFromFirestore();

    toolSelect.addEventListener("change", () => {
        setTool(toolSelect.value);
    });

    plusBtn.addEventListener("click", () => {
        const selectedTool = getSelectedTool();
        const maxQuantity = selectedTool?.maxQuantity || 10;
        if (quantity < maxQuantity) {
            quantity += 1;
            quantityText.textContent = String(quantity);
        }
    });

    minusBtn.addEventListener("click", () => {
        if (quantity > 1) {
            quantity -= 1;
            quantityText.textContent = String(quantity);
        }
    });

    addIdBtn.addEventListener("click", () => {
        idActions.classList.toggle("show");
    });

    document.getElementById("fromDevice").addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            idImage.src = String(ev.target.result);
        };
        reader.readAsDataURL(file);
    });

    document.getElementById("fromInternet").addEventListener("click", () => {
        const url = window.prompt("Paste image URL:");
        if (url) idImage.src = url;
    });

    function resizeCanvas() {
        const ratio = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.round(rect.width * ratio);
        canvas.height = Math.round(140 * ratio);
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#546B41";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    let drawing = false;

    canvas.addEventListener("mousedown", (e) => {
        drawing = true;
        ctx.beginPath();
        ctx.moveTo(e.offsetX, e.offsetY);
    });

    canvas.addEventListener("mouseup", () => {
        drawing = false;
    });

    canvas.addEventListener("mouseleave", () => {
        drawing = false;
    });

    canvas.addEventListener("mousemove", (e) => {
        if (!drawing) return;
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
    });

    clearSig.addEventListener("click", () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    backBtn.addEventListener("click", () => {
        window.history.back();
    });

    function validateDates() {
        const borrowDate = borrowDateInput.value;
        const returnDate = returnDateInput.value;
        if (!borrowDate || !returnDate) {
            window.alert("Please select both borrow and return dates.");
            return false;
        }
        if (new Date(returnDate) < new Date(borrowDate)) {
            window.alert("Return date cannot be earlier than borrow date.");
            return false;
        }
        return true;
    }

    function signatureAsDataUrl() {
        return canvas.toDataURL("image/png");
    }

    function appendBorrowHistory(record) {
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem(BORROW_HISTORY_KEY) || "[]");
            if (!Array.isArray(history)) {
                history = [];
            }
        } catch (error) {
            history = [];
        }
        history.unshift(record);
        localStorage.setItem(BORROW_HISTORY_KEY, JSON.stringify(history));
    }

    borrowForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!validateDates()) {
            return;
        }

        const selectedTool = getSelectedTool();
        if (!selectedTool) {
            window.alert("Please select a tool.");
            return;
        }

        const record = {
            id: `borrow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            status: "in_use",
            borrower: {
                name: borrowerName.value.trim(),
                address: borrowerAddress.value.trim(),
                age: borrowerAge.value.trim(),
                contact: borrowerContact.value.trim()
            },
            tool: {
                name: selectedTool.name,
                image: selectedTool.image ? new URL(selectedTool.image, window.location.href).href : toolImage.src,
                available: selectedTool.available,
                quantity,
                quantityAvailable: selectedTool.quantityAvailable ?? null,
                quantityTotal: selectedTool.quantityTotal ?? null
            },
            schedule: {
                borrowDate: borrowDateInput.value,
                returnDate: returnDateInput.value
            },
            purpose: borrowPurpose.value.trim(),
            validIdImage: idImage.src,
            signatureImage: signatureAsDataUrl(),
            createdAt: new Date().toISOString()
        };

        localStorage.setItem(BORROW_RECORD_KEY, JSON.stringify(record));
        appendBorrowHistory(record);
        localStorage.setItem(RECEIPT_STATE_KEY, "in_use");

        if (useFirestore) {
            try {
                const borrowDocRef = doc(db, BORROW_DOC_PATH[0], BORROW_DOC_PATH[1]);
                await setDoc(borrowDocRef, record, { merge: true });
                await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, record.id), record, { merge: true });
            } catch (error) {
                console.warn("Could not save HERE-RAMIN record to Firestore.", error);
            }
        }

        window.location.href = "../pages/receipts/user.html";
    });
})();
