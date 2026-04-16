(function() {
    const groupedTools = [
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

    function getAllTools() {
        return groupedTools.flatMap((group) => group.tools);
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
        toolImage.src = tool.image;
        setAvailability(tool.available);
    }

    populateTools();
    setTool(toolSelect.value);

    toolSelect.addEventListener("change", () => {
        setTool(toolSelect.value);
    });

    let quantity = 1;
    const maxQuantity = 10;

    plusBtn.addEventListener("click", () => {
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
})();
