import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import firebaseConfig from "../../js/firebaseConfig.js";

(function() {
    // --- UPDATED GATEWAY LOGIC ---
const gateway = document.getElementById("borrowGateway");
const optOrg = document.getElementById("optOrganization");

// Mock user data (You can link this to your Firebase User collection later)
const currentUser = {
    hasOrganization: true // Set to false to test the denial
};

optOrg.addEventListener("click", () => {
    if (currentUser.hasOrganization) {
        // Success: Redirect to org verification
        window.location.href = "org-verification.html";
    } else {
        // Denial: Explain why they can't proceed
        alert("Verification Required: This tool borrowing system is currently exclusive to registered Organizations.");
    }
});
    // --- 2. EXISTING HERE-RAMIN LOGIC ---
    const RECEIPT_STATE_KEY = "growsauyou-receipt-state";
    const BORROW_RECORD_KEY = "growsauyou-borrow-record";
    const BORROW_HISTORY_KEY = "growsauyou-borrow-history";
    const BORROW_DOC_PATH = ["hereramin", "latestBorrow"];
    const TOOLS_COLLECTION = "tools";
    const BORROW_REQUESTS_COLLECTION = "borrow_requests";

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const useFirestore = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_API_KEY");

    // Tool Management elements
    const toolSelect = document.getElementById("toolSelect");
    const toolImage = document.getElementById("toolImage");
    const quantityText = document.getElementById("quantity");
    const availabilityBadge = document.getElementById("availabilityBadge");
    const canvas = document.getElementById("signaturePad");
    const ctx = canvas.getContext("2d");
    const borrowForm = document.getElementById("borrowForm");

    let quantity = 1;

    // Helper: Initialize Signature Pad
    function initCanvas() {
        const ratio = window.devicePixelRatio || 1;
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = 150 * ratio;
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#2b3d24";
    }

    // Logic for Tool Selection
    const defaultTools = [
        { name: "Shovel", image: "../assets/images/shovel.png", available: true },
        { name: "Trowel", image: "../assets/images/trowel.png", available: true },
        { name: "Hoe", image: "../assets/images/hoe.png", available: false }
    ];

    function populateTools() {
        toolSelect.innerHTML = defaultTools.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
        updateToolDisplay(defaultTools[0].name);
    }

    function updateToolDisplay(name) {
        const tool = defaultTools.find(t => t.name === name);
        if (tool) {
            toolImage.src = tool.image;
            availabilityBadge.className = tool.available ? 'availability-badge available' : 'availability-badge unavailable';
            availabilityBadge.textContent = tool.available ? 'Available' : 'Unavailable';
        }
    }

    toolSelect.addEventListener("change", (e) => updateToolDisplay(e.target.value));

    // Form Submission
    borrowForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const record = {
            id: `borrow-${Date.now()}`,
            borrower: document.getElementById("borrowerName").value,
            tool: toolSelect.value,
            quantity: quantity,
            timestamp: new Date().toISOString()
        };

        localStorage.setItem(BORROW_RECORD_KEY, JSON.stringify(record));
        alert("Borrow Request Submitted!");
        window.location.href = "../pages/receipts/user.html";
    });

    // Run Initializers
    populateTools();
    initCanvas();
    window.addEventListener("resize", initCanvas);

    // Quantity Buttons
    document.getElementById("plusBtn").onclick = () => { quantity++; quantityText.innerText = quantity; };
    document.getElementById("minusBtn").onclick = () => { if(quantity > 1) { quantity--; quantityText.innerText = quantity; } };

})();