import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, addDoc, collection, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import firebaseConfig from "../../js/firebaseConfig.js";

(function() {
    // ═══════════════════════════════════════════════════════════════
    // ORGANIZATION VERIFICATION GATEWAY (ported from older version)
    // ═══════════════════════════════════════════════════════════════
    
    // Check if this is the borrow page (has the borrow form) or org verification page
    const isBorrowPage = document.getElementById("borrowForm") !== null;
    const isOrgVerificationPage = document.getElementById("orgVerifyForm") !== null;
    
    // If neither form exists, this script is running on a page that doesn't need it
    if (!isBorrowPage && !isOrgVerificationPage) {
        return;
    }

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const useFirestore = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY") && !firebaseConfig.apiKey.includes("XXXX");
    const BORROW_REQUESTS_COLLECTION = "borrow_requests";
    
    // If this is the org verification page, handle the org verification form
    if (isOrgVerificationPage) {
        // Restore borrow draft from sessionStorage
        const stored = JSON.parse(sessionStorage.getItem("growsauyou-borrow-draft") || "{}");
        
        const orgToolName = document.getElementById("orgToolName");
        const orgToolImage = document.getElementById("orgToolImage");
        const orgQtyDisplay = document.getElementById("orgQtyDisplay");
        const orgBorrowDate = document.getElementById("orgBorrowDate");
        const orgReturnDate = document.getElementById("orgReturnDate");
        const orgAvailBadge = document.getElementById("orgAvailBadge");
        
        if (stored.toolName && orgToolName) orgToolName.textContent = stored.toolName;
        if (stored.toolImage && orgToolImage) orgToolImage.src = stored.toolImage;
        if (stored.quantity && orgQtyDisplay) orgQtyDisplay.textContent = stored.quantity;
        if (stored.borrowDate && orgBorrowDate) orgBorrowDate.value = stored.borrowDate;
        if (stored.returnDate && orgReturnDate) orgReturnDate.value = stored.returnDate;
        
        if (stored.available === false && orgAvailBadge) {
            orgAvailBadge.textContent = "Unavailable";
            orgAvailBadge.className = "availability-badge unavailable";
        }
        
        // Dynamic ID uploads for org verification
        let idCounter = 0;
        
        function addIdSlot() {
            idCounter++;
            const n = idCounter;
            const list = document.getElementById("idMultiList");
            if (!list) return;
            
            const entry = document.createElement("div");
            entry.className = "id-entry";
            entry.id = "idEntry_" + n;
            
            entry.innerHTML = `
                <div class="id-thumb" id="idThumb_${n}">
                    <span style="padding:4px;">ID Preview</span>
                </div>
                <button type="button" class="id-add-btn" onclick="window.triggerOrgId(${n})">
                    <i class="fas fa-camera" style="margin-right:6px;"></i>+ Add Image
                </button>
                <input type="file" id="idFile_${n}" accept="image/*" style="display:none;" onchange="window.previewOrgId(this,${n})">
                ${n > 1 ? `<button type="button" class="id-remove-btn" onclick="window.removeOrgId(${n})" title="Remove"><i class="fas fa-times"></i></button>` : ''}
            `;
            list.appendChild(entry);
        }
        
        window.triggerOrgId = function(n) {
            const input = document.getElementById("idFile_" + n);
            if (input) input.click();
        };
        
        window.previewOrgId = function(input, n) {
            const file = input.files && input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                const box = document.getElementById("idThumb_" + n);
                if (box) box.innerHTML = `<img src="${e.target.result}" alt="ID ${n}">`;
            };
            reader.readAsDataURL(file);
        };
        
        window.removeOrgId = function(n) {
            const el = document.getElementById("idEntry_" + n);
            if (el) el.remove();
        };
        
        const addAnotherIdBtn = document.getElementById("addAnotherIdBtn");
        if (addAnotherIdBtn) {
            addAnotherIdBtn.addEventListener("click", addIdSlot);
            addIdSlot(); // Init first slot
        }
        
        // Letter file upload
        const letterFileInput = document.getElementById("letterFileInput");
        if (letterFileInput) {
            letterFileInput.addEventListener("change", function() {
                const name = this.files && this.files[0] ? this.files[0].name : "No file chosen";
                const nameEl = document.getElementById("letterFileName");
                if (nameEl) nameEl.textContent = name;
            });
        }
        
        // Signature pad for org verification
        const orgCanvas = document.getElementById("orgSignaturePad");
        if (orgCanvas) {
            const orgCtx = orgCanvas.getContext("2d");
            let orgDrawing = false;
            
            function resizeOrgCanvas() {
                const ratio = window.devicePixelRatio || 1;
                const rect = orgCanvas.getBoundingClientRect();
                orgCanvas.width = rect.width * ratio;
                orgCanvas.height = 150 * ratio;
                orgCtx.scale(ratio, ratio);
                orgCtx.lineWidth = 2;
                orgCtx.strokeStyle = "#2b3d24";
                orgCtx.lineCap = "round";
                orgCtx.lineJoin = "round";
            }
            resizeOrgCanvas();
            window.addEventListener("resize", resizeOrgCanvas);
            
            function getOrgPos(e) {
                const r = orgCanvas.getBoundingClientRect();
                const ratio = window.devicePixelRatio || 1;
                const src = e.touches ? e.touches[0] : e;
                return {
                    x: (src.clientX - r.left) * (orgCanvas.width / r.width / ratio),
                    y: (src.clientY - r.top) * (orgCanvas.height / r.height / ratio)
                };
            }
            
            orgCanvas.addEventListener("mousedown", e => { orgDrawing = true; orgCtx.beginPath(); orgCtx.moveTo(getOrgPos(e).x, getOrgPos(e).y); });
            orgCanvas.addEventListener("mousemove", e => { if (!orgDrawing) return; orgCtx.lineTo(getOrgPos(e).x, getOrgPos(e).y); orgCtx.stroke(); });
            orgCanvas.addEventListener("mouseup", () => orgDrawing = false);
            orgCanvas.addEventListener("mouseleave", () => orgDrawing = false);
            orgCanvas.addEventListener("touchstart", e => { e.preventDefault(); orgDrawing = true; orgCtx.beginPath(); orgCtx.moveTo(getOrgPos(e).x, getOrgPos(e).y); }, { passive: false });
            orgCanvas.addEventListener("touchmove", e => { e.preventDefault(); if (!orgDrawing) return; orgCtx.lineTo(getOrgPos(e).x, getOrgPos(e).y); orgCtx.stroke(); }, { passive: false });
            orgCanvas.addEventListener("touchend", () => orgDrawing = false);
            
            const clearOrgSig = document.getElementById("clearOrgSig");
            if (clearOrgSig) {
                clearOrgSig.addEventListener("click", () => {
                    orgCtx.clearRect(0, 0, orgCanvas.width, orgCanvas.height);
                });
            }
        }
        
        // Org form submission
        const orgSubmitBtn = document.getElementById("orgSubmitBtn");
        if (orgSubmitBtn) {
            orgSubmitBtn.addEventListener("click", async function() {
                const orgName = document.getElementById("orgName")?.value?.trim() || "";
                const orgHead = document.getElementById("orgHead")?.value?.trim() || "";
                
                if (!orgName || !orgHead) {
                    alert("Please fill in all required fields.");
                    return;
                }
                
                // Collect org data and merge with borrow draft
                const record = {
                    id: `borrow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    status: "pending",
                    borrowType: "organization",
                    borrower: {
                        orgName,
                        orgHead
                    },
                    tool: {
                        name: stored.toolName || '',
                        quantity: stored.quantity || 1,
                        image: stored.toolImage || ''
                    },
                    schedule: {
                        borrowDate: document.getElementById("orgBorrowDate")?.value || "",
                        returnDate: document.getElementById("orgReturnDate")?.value || ""
                    },
                    submittedAt: new Date().toISOString(),
                    purpose: stored.purpose || document.getElementById("borrowPurpose")?.value?.trim() || '',
                    organization: {
                        name: orgName,
                        head: orgHead
                    }
                };
                sessionStorage.setItem("growsauyou-org-submission", JSON.stringify(record));

                if (useFirestore) {
                    try {
                        await setDoc(doc(db, BORROW_REQUESTS_COLLECTION, record.id), record, { merge: true });
                    } catch (error) {
                        console.warn('Could not save organization borrow request to Firestore.', error);
                        try {
                            await addDoc(collection(db, BORROW_REQUESTS_COLLECTION), record);
                        } catch (fallbackError) {
                            console.error('Fallback Firestore save failed for organization borrow request.', fallbackError);
                            const localPending = JSON.parse(localStorage.getItem('growsauyou-org-requests') || '[]');
                            localPending.push(record);
                            localStorage.setItem('growsauyou-org-requests', JSON.stringify(localPending));
                        }
                    }
                } else {
                    const localPending = JSON.parse(localStorage.getItem('growsauyou-org-requests') || '[]');
                    localPending.push(record);
                    localStorage.setItem('growsauyou-org-requests', JSON.stringify(localPending));
                    console.warn('Firestore disabled, saved organization request locally.');
                }

                // Show pending state
                const orgFormPage = document.getElementById("orgFormPage");
                const pendingPage = document.getElementById("pendingPage");
                if (orgFormPage) orgFormPage.classList.add("hidden");
                if (pendingPage) pendingPage.classList.add("active");

                const ref = "GSY-ORG-" + Date.now().toString().slice(-8).toUpperCase();
                const refText = document.getElementById("pendingRefText");
                if (refText) refText.textContent = "Reference No: " + ref;

                if (orgFormPage) {
                    orgFormPage.classList.add("hidden");
                    orgFormPage.style.display = "none";
                }
                if (pendingPage) {
                    pendingPage.classList.add("active");
                    pendingPage.style.display = "flex";
                    pendingPage.style.opacity = "1";
                }

                if (pendingPage) pendingPage.scrollIntoView({ behavior: "smooth", block: "start" });
                window.alert("Organization borrow request submitted. Pending status is now visible.");
            });
        }
        
        // Back button
        const orgBackBtn = document.getElementById("orgBackBtn");
        if (orgBackBtn) {
            orgBackBtn.addEventListener("click", () => {
                window.location.href = "index.html";
            });
        }
        
        // Done - org verification page handled
        return;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // EXISTING BORROW FORM LOGIC (newer version's main functionality)
    // ═══════════════════════════════════════════════════════════════
    
    const RECEIPT_STATE_KEY = "growsauyou-receipt-state";
    const BORROW_RECORD_KEY = "growsauyou-borrow-record";
    const BORROW_HISTORY_KEY = "growsauyou-borrow-history";
    const BORROW_DOC_PATH = ["hereramin", "latestBorrow"];
    const TOOLS_COLLECTION = "tools";
    
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
                option.textContent = tool.name;
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
        if (quantity > (tool.maxQuantity || 10)) {
            quantity = Math.max(1, tool.maxQuantity || 10);
            quantityText.textContent = String(quantity);
        }
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

    const orgBorrowBtn = document.getElementById("orgBorrowBtn");
    if (orgBorrowBtn) {
        orgBorrowBtn.addEventListener("click", () => {
            const toolSelect = document.getElementById("toolSelect");
            const toolImage = document.getElementById("toolImage");
            const quantityText = document.getElementById("quantity");
            const borrowDate = document.getElementById("borrowDate");
            const returnDate = document.getElementById("returnDate");
            const borrowPurpose = document.getElementById("borrowPurpose");

            const draft = {
                toolName: toolSelect?.value || "",
                toolImage: toolImage?.src || "",
                quantity: parseInt(quantityText?.textContent || "1"),
                borrowDate: borrowDate?.value || "",
                returnDate: returnDate?.value || "",
                purpose: borrowPurpose?.value?.trim() || '',
                available: getSelectedTool()?.available ?? true
            };
            sessionStorage.setItem("growsauyou-borrow-draft", JSON.stringify(draft));
            window.location.href = "org-verification.html";
        });
    }

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
            borrowType: "individual",
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
                try {
                    await addDoc(collection(db, BORROW_REQUESTS_COLLECTION), record);
                    console.log("Saved HERE-RAMIN borrow request with fallback addDoc.");
                } catch (fallbackError) {
                    console.error("Fallback Firestore save failed for HERE-RAMIN borrow request.", fallbackError);
                }
            }
        }

        window.location.href = "../pages/receipts/user.html";
    });
})();