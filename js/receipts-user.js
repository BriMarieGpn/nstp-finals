(function () {
    const RECEIPT_STATE_KEY = "growsauyou-receipt-state";
    const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
    const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
    const returnBtn = document.getElementById("returnBtn");
    const borrowAgainBtn = document.getElementById("borrowAgainBtn");
    const borrowAgainTitle = document.getElementById("borrowAgainTitle");
    const borrowAgainNote = document.getElementById("borrowAgainNote");
    const returnedStatusTitle = document.getElementById("returnedStatusTitle");
    const returnedStatusNote = document.getElementById("returnedStatusNote");

    // Shared client-side state. Admin page updates the same key.
    // allowed values: in_use, return_pending, return_approved, return_rejected
    let receiptState = localStorage.getItem(RECEIPT_STATE_KEY) || "in_use";

    function persistState() {
        localStorage.setItem(RECEIPT_STATE_KEY, receiptState);
    }

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

        if (receiptState === "return_rejected") {
            returnedStatusTitle.textContent = "REJECTED";
            returnedStatusNote.textContent = "Your return needs revision. Please contact admin.";
            borrowAgainTitle.textContent = "NOT APPROVED";
            borrowAgainNote.textContent = "Admin rejected the return request.";
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
        receiptState = "return_pending";
        persistState();
        applyState();
        setActiveTab("returned");
    });

    window.addEventListener("storage", (event) => {
        if (event.key !== RECEIPT_STATE_KEY) {
            return;
        }
        receiptState = event.newValue || "in_use";
        applyState();
    });

    persistState();
    applyState();
})();
