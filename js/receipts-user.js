(function () {
    const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
    const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
    const returnBtn = document.getElementById("returnBtn");
    const borrowAgainBtn = document.getElementById("borrowAgainBtn");
    const borrowAgainTitle = document.getElementById("borrowAgainTitle");
    const borrowAgainNote = document.getElementById("borrowAgainNote");
    const returnedStatusTitle = document.getElementById("returnedStatusTitle");
    const returnedStatusNote = document.getElementById("returnedStatusNote");

    // Simulated status from future database.
    // allowed values: in_use, return_pending, return_approved
    let receiptState = "in_use";

    function setActiveTab(tabName) {
        tabButtons.forEach((button) => {
            button.classList.toggle("active", button.dataset.tab === tabName);
        });
        tabPanels.forEach((panel) => {
            panel.classList.toggle("active", panel.dataset.panel === tabName);
        });
    }

    function applyState() {
        if (receiptState === "in_use") {
            returnedStatusTitle.textContent = "RETURNED";
            returnedStatusNote.textContent = "Please wait for the admin update";
            borrowAgainTitle.textContent = "FOR APPROVAL";
            borrowAgainNote.textContent = "Wait for admin's approval";
            borrowAgainBtn.classList.add("disabled");
            borrowAgainBtn.classList.remove("ready");
            borrowAgainBtn.setAttribute("aria-disabled", "true");
            borrowAgainBtn.setAttribute("href", "#");
            return;
        }

        if (receiptState === "return_pending") {
            returnedStatusTitle.textContent = "RETURNED";
            returnedStatusNote.textContent = "Please wait for the admin update";
            borrowAgainTitle.textContent = "FOR APPROVAL";
            borrowAgainNote.textContent = "Wait for admin's approval";
            borrowAgainBtn.classList.add("disabled");
            borrowAgainBtn.classList.remove("ready");
            borrowAgainBtn.setAttribute("aria-disabled", "true");
            borrowAgainBtn.setAttribute("href", "#");
            return;
        }

        returnedStatusTitle.textContent = "APPROVED!";
        returnedStatusNote.textContent = "The admin approved your return!";
        borrowAgainTitle.textContent = "APPROVED!";
        borrowAgainNote.textContent = "You can now borrow again.";
        borrowAgainBtn.classList.remove("disabled");
        borrowAgainBtn.classList.add("ready");
        borrowAgainBtn.setAttribute("aria-disabled", "false");
        borrowAgainBtn.setAttribute("href", "../../hereramin/index.html");
    }

    tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
            setActiveTab(button.dataset.tab);
        });
    });

    returnBtn.addEventListener("click", () => {
        // In real integration, this state will come from DB/admin action.
        receiptState = "return_pending";
        applyState();
        setActiveTab("returned");
    });

    // Demo shortcut: double-click returned tab to simulate admin approval.
    const returnedTab = tabButtons.find((button) => button.dataset.tab === "returned");
    if (returnedTab) {
        returnedTab.addEventListener("dblclick", () => {
            receiptState = "return_approved";
            applyState();
            setActiveTab("borrow-again");
        });
    }

    applyState();
})();
