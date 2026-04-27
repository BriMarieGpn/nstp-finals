(() => {
    const toolPage = document.body.classList.contains("tool-info-page");
    if (!toolPage) {
        return;
    }

    const toolTitle = document.getElementById("toolTitle");
    const toolDescription = document.getElementById("toolDescription");
    const wikiButton = Array.from(document.querySelectorAll(".tool-action-button")).find(
        (button) => button.textContent.trim().toUpperCase().includes("WIKIHOW")
    );

    if (!toolTitle || !toolDescription || !wikiButton) {
        return;
    }

    const tutorialSteps = {
        "Trowel": [
            "Loosen the soil first so the trowel can enter the ground smoothly.",
            "Angle the blade toward the spot you want to dig and keep your grip steady.",
            "Lift small amounts of soil when planting or transplanting to stay accurate.",
            "Wipe the blade clean after use and store it in a dry place."
        ],
        "Hoe": [
            "Stand with stable footing and hold the hoe with both hands.",
            "Pull or push the blade just below the soil surface to break weeds and crusted soil.",
            "Work in short rows so you do not damage nearby plants.",
            "Clean off soil after use and check that the handle stays secure."
        ],
        "Pitchfork": [
            "Push the tines into loose soil, compost, or mulch using your foot if needed.",
            "Lift the material with your legs and arms together to reduce strain.",
            "Turn the soil or compost in small sections for even aeration.",
            "Shake debris from the tines and store the tool upright when finished."
        ],
        "Shovel": [
            "Place the blade where you want to dig and space your hands apart on the handle.",
            "Use your foot on the top edge to drive the blade into the ground.",
            "Lift and move soil in controlled amounts instead of overfilling the blade.",
            "Brush off mud and let the shovel dry before storage."
        ],
        "Seed Trays": [
            "Fill each cell with seed-starting mix and moisten it lightly.",
            "Place one or two seeds in each cell at the proper depth.",
            "Keep the tray in a bright area and water gently so the soil stays moist.",
            "Thin or transplant seedlings once they are strong enough to handle."
        ],
        "Dibbers": [
            "Mark the spots where each seed or seedling will be placed.",
            "Press the dibber into the soil to create holes of consistent depth.",
            "Place the seed or seedling into the hole carefully.",
            "Close the soil gently around the planting hole and water lightly."
        ],
        "Plant Labels": [
            "Write the plant name clearly before inserting the label into the soil.",
            "Place the label close to the plant without disturbing the roots.",
            "Keep the writing facing outward so it stays easy to read.",
            "Replace or update labels whenever the text fades."
        ],
        "Seed Starter Kit": [
            "Set up the tray, inserts, and cover based on the kit instructions.",
            "Add the growing medium, moisten it evenly, and place the seeds at the right depth.",
            "Use the cover until germination begins, then increase airflow.",
            "Transplant the seedlings once they are large enough and well rooted."
        ],
        "Watering Can": [
            "Fill the watering can with the amount of water your plants need.",
            "Tilt the can slowly so water flows evenly from the spout.",
            "Aim near the base of the plant to avoid washing away soil.",
            "Empty any remaining water and rinse the can after use."
        ],
        "Hose": [
            "Uncoil the hose fully to prevent kinks before turning on the water.",
            "Start with low pressure and point the hose away from delicate plants.",
            "Water the root zone steadily instead of flooding one area.",
            "Drain the hose after use and coil it neatly."
        ],
        "Spray Nozzles": [
            "Attach the nozzle securely to the hose before turning on the water.",
            "Choose the spray pattern that matches the plant size and task.",
            "Keep the nozzle moving so one area does not receive too much pressure.",
            "Turn the water off before changing settings or removing the nozzle."
        ],
        "Sprinkler": [
            "Set the sprinkler on level ground where it can cover the target area evenly.",
            "Turn on the water slowly and adjust the flow until the spray pattern is stable.",
            "Check nearby paths and plants so water lands where you want it.",
            "Shut off the water and drain the sprinkler before moving it."
        ],
        "Garden Scissors": [
            "Inspect the blades and make sure they are clean before trimming plants.",
            "Hold the stems gently and make small, precise cuts above a healthy node.",
            "Trim only soft stems, flowers, or light growth that matches the tool size.",
            "Wipe the blades clean after use to prevent sap buildup."
        ],
        "Hedge Trimmers": [
            "Clear the trimming area and check for thick branches or hidden obstacles.",
            "Hold the trimmer with both hands and keep the blade parallel to the hedge face.",
            "Trim with slow, even passes so the hedge stays balanced and smooth.",
            "Turn the tool off fully before cleaning or storing it."
        ],
        "Pruning Shears": [
            "Identify the stem or branch you want to remove before making the cut.",
            "Place the blade close to the branch collar or just above a healthy bud.",
            "Squeeze the handles in one clean motion for a neat cut.",
            "Clean the blades after pruning to reduce the spread of disease."
        ],
        "Harvest Baskets": [
            "Check that the basket is clean and strong enough for the harvest you plan to collect.",
            "Place produce gently into the basket to avoid bruising fruits and vegetables.",
            "Keep heavier items at the bottom and lighter items on top for balance.",
            "Wash and dry the basket after use before storing it."
        ],
        "Garden Knives": [
            "Inspect the blade before use and keep your fingers clear of the cutting edge.",
            "Use short, controlled cuts when harvesting stems, vegetables, or herbs.",
            "Cut close to the stem or fruit support without damaging the plant.",
            "Clean and dry the blade after use to keep it safe and sharp."
        ],
        "Fruit Pickers": [
            "Position the picker below the fruit you want to harvest.",
            "Guide the basket or ring around the stem carefully.",
            "Pull gently so the fruit detaches without falling hard to the ground.",
            "Empty the picker basket regularly to avoid bruising the fruit."
        ],
        "Harvest Scissors": [
            "Use the scissors for herbs, leafy greens, and soft produce.",
            "Hold the stem steady and trim with one smooth cut.",
            "Avoid forcing the scissors through thick branches they are not designed for.",
            "Wipe the blades clean after harvesting."
        ],
        "Garden Sprayers": [
            "Fill the sprayer with the correct solution and secure the lid tightly.",
            "Test the spray away from plants first to check the nozzle pattern.",
            "Apply the solution evenly across the target leaves or soil.",
            "Rinse the sprayer well after use."
        ],
        "Insect Nets": [
            "Spread the net over the plants or frame you want to protect.",
            "Secure the edges so insects cannot get underneath.",
            "Check the net regularly to make sure it stays lifted off delicate plants.",
            "Remove or adjust the net carefully during watering or harvesting."
        ],
        "Sticky Traps": [
            "Place the trap near the plant area where flying insects are active.",
            "Keep the sticky surface exposed and away from leaves that may touch it.",
            "Monitor the trap regularly to check pest activity.",
            "Replace the trap once the surface becomes full or dusty."
        ],
        "Hand Dusters": [
            "Fill the duster with the recommended powder treatment.",
            "Hold it upright and use gentle squeezes or pumps for even application.",
            "Apply only the amount needed around the target plant area.",
            "Empty and clean the duster after use."
        ],
        "Gloves": [
            "Choose gloves that fit snugly so you can grip tools comfortably.",
            "Wear them while handling soil, rough materials, or thorny plants.",
            "Check for tears after heavy work so your hands stay protected.",
            "Clean and dry the gloves before storing them."
        ],
        "Aprons": [
            "Tie or fasten the apron securely before starting garden work.",
            "Use the pockets to keep small tools or labels within easy reach.",
            "Avoid overloading pockets with sharp or heavy objects.",
            "Brush off dirt and wash the apron after use."
        ],
        "Masks": [
            "Put the mask on before working around dust, soil particles, or sprays.",
            "Adjust the fit so it covers your nose and mouth comfortably.",
            "Replace or clean the mask if it becomes damp or dirty.",
            "Store it in a clean, dry place after use."
        ],
        "Knee Pads": [
            "Fasten the knee pads securely before kneeling on the ground.",
            "Adjust them so they stay centered over the knees while moving.",
            "Use them during planting, weeding, and close-up garden work.",
            "Wipe the pads clean after use and let them dry fully."
        ]
    };

    function createYoutubeSearchUrl(toolName) {
        const query = encodeURIComponent(`how to use a ${toolName} gardening tool`);
        return `https://www.youtube.com/results?search_query=${query}`;
    }

    function buildModal() {
        const modal = document.createElement("div");
        modal.className = "tool-modal";
        modal.setAttribute("aria-hidden", "true");
        modal.innerHTML = `
            <div class="tool-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="toolModalTitle">
                <div class="tool-modal-header">
                    <h2 class="tool-modal-title" id="toolModalTitle"></h2>
                    <button class="tool-modal-close" type="button" aria-label="Close tutorial modal">X</button>
                </div>
                <div class="tool-modal-body">
                    <p class="tool-modal-intro" id="toolModalIntro"></p>
                    <ol class="tool-modal-steps" id="toolModalSteps"></ol>
                    <div class="tool-modal-footer">
                        <a class="tool-modal-link" id="toolModalVideoLink" href="#" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    const modal = buildModal();
    const modalTitle = modal.querySelector("#toolModalTitle");
    const modalIntro = modal.querySelector("#toolModalIntro");
    const modalSteps = modal.querySelector("#toolModalSteps");
    const modalVideoLink = modal.querySelector("#toolModalVideoLink");
    const closeButton = modal.querySelector(".tool-modal-close");

    function getCurrentToolName() {
        return toolTitle.textContent.trim();
    }

    function updateHereRaminLinks() {
        const currentTool = getCurrentToolName();
        if (!currentTool) {
            return;
        }

        const hereRaminLinks = Array.from(document.querySelectorAll("a")).filter((link) => {
            const label = (link.textContent || "").trim().toUpperCase();
            const href = (link.getAttribute("href") || "").toLowerCase();
            return label.includes("HERE-RAMIN") || href.includes("hereramin/index.html");
        });

        hereRaminLinks.forEach((link) => {
            const rawHref = link.getAttribute("href");
            if (!rawHref) {
                return;
            }
            const nextUrl = new URL(rawHref, window.location.href);
            nextUrl.searchParams.set("tool", currentTool);
            link.setAttribute("href", `${nextUrl.pathname}${nextUrl.search}`);
        });
    }

    function getInstructions(toolName) {
        return tutorialSteps[toolName] || [
            `Inspect the ${toolName.toLowerCase()} and make sure it is ready to use.`,
            `Prepare your work area and hold the ${toolName.toLowerCase()} with a stable grip.`,
            `Use slow, controlled movements while working so you stay accurate and safe.`,
            `Clean and store the ${toolName.toLowerCase()} properly after finishing the task.`
        ];
    }

    function openModal() {
        const currentTool = getCurrentToolName();
        const description = toolDescription.textContent.trim();
        const steps = getInstructions(currentTool);

        modalTitle.textContent = `How to use a ${currentTool}`;
        modalIntro.textContent = description;
        modalSteps.innerHTML = "";

        steps.forEach((step) => {
            const item = document.createElement("li");
            item.textContent = step;
            modalSteps.appendChild(item);
        });

        modalVideoLink.href = createYoutubeSearchUrl(currentTool);
        modalVideoLink.textContent = `Watch a ${currentTool} tutorial on YouTube`;
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
    }

    function closeModal() {
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
    }

    wikiButton.addEventListener("click", openModal);
    closeButton.addEventListener("click", closeModal);
    updateHereRaminLinks();

    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modal.classList.contains("is-open")) {
            closeModal();
        }
    });
})();