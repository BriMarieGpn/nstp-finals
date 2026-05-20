import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, collection, getDocs, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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
    const auth = getAuth(app);
    const useFirestore = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
    const imageFolder = "assets/images/";
    let toolsUnsubscribe = null;

    const defaultGroupedTools = [
        {
            category: "Soil Preparation",
            tools: [
                { name: "Trowel", image: "trowel.png", available: true },
                { name: "Hoe", image: "hoe.png", available: false },
                { name: "Pitchfork", image: "pitchfork.png", available: true },
                { name: "Shovel", image: "shovel.png", available: true }
            ]
        },
        {
            category: "Planting & Propagation",
            tools: [
                { name: "Seed Trays", image: "seed-trays.png", available: true },
                { name: "Dibbers", image: "dibbers.png", available: true },
                { name: "Plant Labels", image: "plant-labels.png", available: false },
                { name: "Seed Starter Kit", image: "seed-starter-kit.png", available: true }
            ]
        },
        {
            category: "Watering & Irrigation",
            tools: [
                { name: "Watering Can", image: "watering-can.png", available: true },
                { name: "Hose", image: "hose.png", available: false },
                { name: "Spray Nozzles", image: "spray-nozzles.png", available: true },
                { name: "Sprinkler", image: "sprinkler.png", available: true }
            ]
        },
        {
            category: "Pruning & Maintenance",
            tools: [
                { name: "Garden Scissors", image: "garden-scissors.png", available: false },
                { name: "Hedge Trimmers", image: "hedge-trimmers.png", available: true },
                { name: "Pruning Shears", image: "pruning-shears.png", available: true }
            ]
        },
        {
            category: "Harvesting",
            tools: [
                { name: "Harvest Baskets", image: "harvest-baskets.png", available: true },
                { name: "Garden Knives", image: "garden-knives.png", available: false },
                { name: "Fruit Pickers", image: "fruit-pickers.png", available: true },
                { name: "Harvest Scissors", image: "harvest-scissors.png", available: true }
            ]
        },
        {
            category: "Pest Control",
            tools: [
                { name: "Garden Sprayers", image: "garden-sprayers.png", available: true },
                { name: "Insect Nets", image: "insect-nets.png", available: true },
                { name: "Sticky Traps", image: "sticky-traps.png", available: false },
                { name: "Hand Dusters", image: "hand-dusters.png", available: true }
            ]
        },
        {
            category: "Protective & Safety",
            tools: [
                { name: "Gloves", image: "gloves.png", available: true },
                { name: "Aprons", image: "aprons.png", available: true },
                { name: "Masks", image: "masks.png", available: false },
                { name: "Knee Pads", image: "knee-pads.png", available: true }
            ]
        }
    ];
    let groupedTools = JSON.parse(JSON.stringify(defaultGroupedTools));
    let validIdSelected = false;
    let validIdDataUrl = "";

    const toolSelect = document.getElementById("toolSelect");
    const toolImage = document.getElementById("toolImage");
    const minusBtn = document.getElementById("minusBtn");
    const plusBtn = document.getElementById("plusBtn");
    const quantityText = document.getElementById("quantity");
    const availabilityBadge = document.getElementById("availabilityBadge");
    const proceedBtn = document.getElementById("proceedBtn");

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
    const borrowerOrgId = document.getElementById("borrowerOrgId");
    const borrowerAddress = document.getElementById("borrowerAddress");
    const borrowerContact = document.getElementById("borrowerContact");
    const borrowPurpose = document.getElementById("borrowPurpose");
    const orgLetterName = document.getElementById("orgLetterName");
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

    function getLocalImagePath(imageNameOrPath) {
        if (!imageNameOrPath) {
            return `${imageFolder}shovel.png`;
        }
        if (imageNameOrPath.startsWith("data:")) {
            return imageNameOrPath;
        }
        if (imageNameOrPath.startsWith("http://") || imageNameOrPath.startsWith("https://")) {
            return imageNameOrPath;
        }
        const normalized = imageNameOrPath.replace(/^\.\//, "");
        if (normalized.startsWith("assets/images/")) {
            return normalized;
        }
        if (!normalized.includes("/")) {
            return `${imageFolder}${normalized}`;
        }
        const baseName = normalized.replace(/^.*[\\/]/, "");
        return `${imageFolder}${baseName}`;
    }

    function getFallbackToolImage(name) {
        const fallback = getFallbackToolByName(name);
        if (fallback?.image) {
            return getLocalImagePath(fallback.image);
        }
        return getLocalImagePath(`${slugify(name)}.png`);
    }

    function populateTools() {
        toolSelect.innerHTML = "";
        groupedTools.forEach((group) => {
            const optGroup = document.createElement("optgroup");
            optGroup.label = group.category;
            group.tools.forEach((tool) => {
                const option = document.createElement("option");
                option.value = tool.name;
                option.textContent = tool.name + (tool.available === false ? " (Unavailable)" : "");
                option.disabled = tool.available === false;
                option.dataset.image = getLocalImagePath(tool.image || getFallbackToolImage(tool.name));
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
        const name = toolName || toolSelect.value || toolSelect.options[0]?.value || "";
        const tool = getAllTools().find((entry) => entry.name === name);
        if (!tool) {
            return;
        }

        const selectedOption = toolSelect.options[toolSelect.selectedIndex] || toolSelect.options[0];
        const rawImage = tool.image || selectedOption?.dataset.image || getFallbackToolImage(tool.name);
        toolImage.src = getLocalImagePath(rawImage);
        toolImage.alt = tool.name;

        setAvailability(tool.available);
        if (proceedBtn) {
            proceedBtn.disabled = tool.available === false;
        }
        if (quantity > (tool.maxQuantity || 10)) {
            quantity = Math.max(1, tool.maxQuantity || 10);
            quantityText.value = String(quantity);
        }
        quantityText.max = String(tool.maxQuantity || 10);
        quantityText.value = String(quantity);
    }

    function getSelectedTool() {
        return getAllTools().find((entry) => entry.name === toolSelect.value) || null;
    }

    toolImage.onerror = () => {
        console.warn("Tool image failed to load:", toolImage.src);
        toolImage.src = "./assets/images/shovel.png";
    };

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

        const rawImage = data.image || data.image_url || fallback?.image || `${slugify(toolName)}.png`;
        return {
            id: docId,
            name: toolName,
            category: data.category || fallback?.category || getCategoryForToolName(toolName),
            image: getLocalImagePath(rawImage),
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
                    image_url: getLocalImagePath(tool.image),
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

    function applyFirestoreToolsToSelect(firestoreTools) {
        if (!Array.isArray(firestoreTools) || firestoreTools.length === 0) {
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
            applyFirestoreToolsToSelect(firestoreTools);
        } catch (error) {
            console.warn("Could not pull tools from Firestore. Keeping local preview data.", error);
        }
    }

    function watchToolsFromFirestore() {
        if (!useFirestore || toolsUnsubscribe) {
            return;
        }
        try {
            toolsUnsubscribe = onSnapshot(
                collection(db, TOOLS_COLLECTION),
                (snapshot) => {
                    const firestoreTools = snapshot.docs.map((entry) => normalizeToolFromFirestore(entry.id, entry.data()));
                    applyFirestoreToolsToSelect(firestoreTools);
                },
                (error) => {
                    console.warn("Could not watch HERE-RAMIN tools updates.", error);
                }
            );
        } catch (error) {
            console.warn("Failed to initialize HERE-RAMIN tools watcher.", error);
        }
    }

    populateTools();
    setTool(toolSelect.value);
    applyToolFromQueryParam();
    hydrateToolsFromFirestore();
    watchToolsFromFirestore();

    toolSelect.addEventListener("change", () => {
        setTool(toolSelect.value);
    });

    plusBtn.addEventListener("click", () => {
        const selectedTool = getSelectedTool();
        const maxQuantity = selectedTool?.maxQuantity || 10;
        if (quantity < maxQuantity) {
            quantity += 1;
            quantityText.value = String(quantity);
        }
    });

    minusBtn.addEventListener("click", () => {
        if (quantity > 1) {
            quantity -= 1;
            quantityText.value = String(quantity);
        }
    });

    quantityText.addEventListener("input", () => {
        let value = Number(quantityText.value);
        if (Number.isNaN(value) || value < 1) {
            value = 1;
        }
        const selectedTool = getSelectedTool();
        const maxQuantity = selectedTool?.maxQuantity || 10;
        if (value > maxQuantity) {
            value = maxQuantity;
        }
        quantity = value;
        quantityText.value = String(quantity);
    });

    addIdBtn.addEventListener("click", () => {
        idActions.classList.toggle("show");
    });

    document.getElementById("fromDevice").addEventListener("click", () => {
        console.log("[Upload] Triggering file input dialog");
        fileInput.click();
    });

    fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) {
            console.warn("[Upload] No file selected");
            return;
        }
        
        console.log("[Upload] File selected:", file.name, "Size:", (file.size / 1024).toFixed(2), "KB");
        
        // Check file size (max 5MB for data URL)
        if (file.size > 5 * 1024 * 1024) {
            console.warn("[Upload] File too large");
            window.alert("File is too large (max 5MB). Please choose a smaller file or use a URL instead.");
            return;
        }
        
        validIdSelected = true;
        orgLetterName.textContent = file.name;
        console.log("[Upload] File marked as valid, reading as data URL...");
        
        const reader = new FileReader();
        
        reader.onload = (ev) => {
            try {
                const result = String(ev.target.result);
                validIdDataUrl = result;
                console.log("[Upload] ✓ Data URL created, length:", result.length);
                
                if (file.type.startsWith("image/")) {
                    idImage.src = result;
                    idImage.alt = file.name;
                    idImage.style.display = "block";
                    console.log("[Upload] ✓ Image preview displayed");
                } else {
                    idImage.alt = file.name;
                    idImage.style.display = "none";
                    console.log("[Upload] ✓ Non-image file uploaded (will be saved as data URL)");
                }
            } catch (error) {
                console.error("[Upload] ✗ Error processing file:", error);
                window.alert("Error processing file. Please try again.");
                validIdSelected = false;
            }
        };
        
        reader.onerror = (error) => {
            console.error("[Upload] ✗ FileReader error:", error);
            window.alert("Error reading file. Please try again.");
            validIdSelected = false;
        };
        
        reader.readAsDataURL(file);
        console.log("[Upload] Reading file as data URL...");
    });

    document.getElementById("fromInternet").addEventListener("click", () => {
        const url = window.prompt("Paste document image URL:");
        if (!url) {
            return;
        }
        validIdSelected = true;
        validIdDataUrl = url;
        if (/^data:image\//.test(url) || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url)) {
            idImage.src = url;
        } else {
            idImage.alt = url;
        }
        orgLetterName.textContent = url;
    });

    function resizeCanvas() {
        const ratio = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        // Reset any existing transform to avoid cumulative scaling
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        canvas.width = Math.round(rect.width * ratio);
        canvas.height = Math.round(rect.height * ratio);
        // Scale drawing operations so 1 canvas unit = 1 CSS pixel
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#546B41";
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    let drawing = false;

    function getPointerPos(e) {
        const rect = canvas.getBoundingClientRect();
        if (e.touches && e.touches.length > 0) {
            const t = e.touches[0];
            return { x: t.clientX - rect.left, y: t.clientY - rect.top };
        }
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    canvas.addEventListener("mousedown", (e) => {
        drawing = true;
        ctx.beginPath();
        const p = getPointerPos(e);
        ctx.moveTo(p.x, p.y);
    });

    canvas.addEventListener("mouseup", () => {
        drawing = false;
    });

    canvas.addEventListener("mouseleave", () => {
        drawing = false;
    });

    canvas.addEventListener("mousemove", (e) => {
        if (!drawing) return;
        const p = getPointerPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
    });

    // Touch support
    canvas.addEventListener("touchstart", (e) => {
        e.preventDefault();
        drawing = true;
        ctx.beginPath();
        const p = getPointerPos(e);
        ctx.moveTo(p.x, p.y);
    }, { passive: false });

    canvas.addEventListener("touchmove", (e) => {
        e.preventDefault();
        if (!drawing) return;
        const p = getPointerPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
    }, { passive: false });

    canvas.addEventListener("touchend", (e) => {
        e.preventDefault();
        drawing = false;
    });

    clearSig.addEventListener("click", () => {
        // Clear full drawing surface (use device pixel size)
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Restore scale for further drawing
        const ratio = window.devicePixelRatio || 1;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.beginPath();
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

    function trimRecordForStorage(record) {
        const safeRecord = { ...record };
        delete safeRecord.validIdImage;
        delete safeRecord.organizationLetterPreview;
        delete safeRecord.signatureImage;

        if (safeRecord.borrower) {
            safeRecord.borrower = { ...safeRecord.borrower };
        }
        if (safeRecord.tool) {
            safeRecord.tool = { ...safeRecord.tool };
        }
        if (safeRecord.schedule) {
            safeRecord.schedule = { ...safeRecord.schedule };
        }
        return safeRecord;
    }

    function trimRecordForFirestore(record) {
        const safeRecord = { ...record };
        // Keep validIdImage and signatureImage for admin panel display
        // Delete only the preview-specific fields
        delete safeRecord.organizationLetterPreview;
        
        // Don't store large image data URLs to Firestore - save space and avoid quota issues
        // Images are kept in localStorage for user's receipts page
        if (safeRecord.validIdImage && safeRecord.validIdImage.startsWith("data:")) {
            console.log("[Firestore] Excluding large image data URL from Firestore save");
            delete safeRecord.validIdImage;
        }
        if (safeRecord.signatureImage && safeRecord.signatureImage.startsWith("data:")) {
            console.log("[Firestore] Excluding signature data URL from Firestore save");
            delete safeRecord.signatureImage;
        }
        
        if (safeRecord.borrower) {
            safeRecord.borrower = { ...safeRecord.borrower };
            delete safeRecord.borrower.documentImage;
        }
        if (safeRecord.tool) {
            safeRecord.tool = { ...safeRecord.tool };
        }
        if (safeRecord.schedule) {
            safeRecord.schedule = { ...safeRecord.schedule };
        }
        return safeRecord;
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
        history.unshift(trimRecordForStorage(record));
        history = history.slice(0, 10);
        try {
            localStorage.setItem(BORROW_HISTORY_KEY, JSON.stringify(history));
        } catch (error) {
            console.warn("Could not save borrow history to localStorage.", error);
        }
    }

    borrowForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        console.log("[Submit] Form submission started");

        if (!validateDates()) {
            console.warn("[Submit] ✗ Date validation failed");
            return;
        }

        const selectedTool = getSelectedTool();
        if (!selectedTool) {
            console.warn("[Submit] ✗ No tool selected");
            window.alert("Please select a tool.");
            return;
        }
        console.log("[Submit] ✓ Tool selected:", selectedTool.name);

        if (selectedTool.available === false) {
            console.warn("[Submit] ✗ Tool not available");
            window.alert("This tool is not available for borrowing. Please choose another tool.");
            return;
        }

        if (!validIdSelected) {
            console.warn("[Submit] ✗ No valid ID selected");
            window.alert("Please upload a valid ID or document before submitting.");
            return;
        }
        console.log("[Submit] ✓ Valid ID uploaded");

        const authUser = auth.currentUser;
        console.log("[Submit] Auth user:", authUser?.uid, authUser?.email);
        
        const record = {
            id: `borrow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            status: "in_use",
            borrower: {
                organizationName: borrowerName.value.trim(),
                organizationId: borrowerOrgId.value.trim(),
                address: borrowerAddress.value.trim(),
                contact: borrowerContact.value.trim(),
                uid: authUser?.uid || undefined,
                email: authUser?.email || undefined,
                name: authUser?.displayName || authUser?.email || undefined
            },
            tool: {
                name: selectedTool.name,
                image: selectedTool.image ? new URL(selectedTool.image, window.location.href).href : toolImage.src,
                available: selectedTool.available,
                quantity: Number(quantityText.value) || quantity,
                quantityAvailable: selectedTool.quantityAvailable ?? null,
                quantityTotal: selectedTool.quantityTotal ?? null
            },
            schedule: {
                borrowDate: borrowDateInput.value,
                returnDate: returnDateInput.value
            },
            purpose: borrowPurpose.value.trim(),
            validIdName: orgLetterName.textContent,
            validIdImage: validIdDataUrl || idImage.src,
            organizationLetter: orgLetterName.textContent,
            organizationLetterPreview: validIdDataUrl || idImage.src,
            signatureImage: signatureAsDataUrl(),
            createdAt: new Date().toISOString()
        };

        console.log("[Submit] Record created:", record.id, record.borrower);

        const storageRecord = trimRecordForStorage(record);
        try {
            localStorage.setItem(BORROW_RECORD_KEY, JSON.stringify(storageRecord));
            console.log("✓ Saved current record to localStorage");
        } catch (error) {
            console.warn("⚠ Could not save full record to localStorage (quota exceeded):", error.message);
            // Try saving without the large image data
            const minimalRecord = { ...storageRecord };
            delete minimalRecord.validIdImage;
            try {
                localStorage.setItem(BORROW_RECORD_KEY, JSON.stringify(minimalRecord));
                console.log("✓ Saved minimal record to localStorage (images excluded)");
            } catch (e2) {
                console.warn("Could not save to localStorage at all:", e2.message);
            }
        }
        
        appendBorrowHistory(record);
        try {
            localStorage.setItem(RECEIPT_STATE_KEY, "in_use");
        } catch (error) {
            console.warn("Could not save receipt state to localStorage.", error);
        }

        if (useFirestore) {
            try {
                const borrowDocRef = doc(db, BORROW_DOC_PATH[0], BORROW_DOC_PATH[1]);
                const firestoreRecord = trimRecordForFirestore(record);
                await setDoc(borrowDocRef, firestoreRecord, { merge: true });
                console.log("✓ Saved to Firestore latestBorrow doc");
                
                await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, record.id), firestoreRecord, { merge: true });
                console.log("✓ Saved to Firestore borrow_requests collection:", record.id);
            } catch (error) {
                console.warn("Could not save HERE-RAMIN record to Firestore.", error);
                try {
                    const fallbackRecord = trimRecordForFirestore(record);
                    await addDoc(collection(db, BORROW_REQUESTS_COLLECTION), fallbackRecord);
                    console.log("✓ Saved HERE-RAMIN borrow request with fallback addDoc.");
                } catch (fallbackError) {
                    console.error("✗ Fallback Firestore save failed for HERE-RAMIN borrow request.", fallbackError);
                }
            }
        } else {
            console.warn("Firestore not enabled - record saved to localStorage only");
        }

        console.log("✓ Redirecting to receipts page...");
        setTimeout(() => {
            window.location.href = "../pages/receipts/user.html";
        }, 500);
    });
})();