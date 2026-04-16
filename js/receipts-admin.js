(function () {
    const RECEIPT_STATE_KEY = "growsauyou-receipt-state";
    const adminStatus = document.getElementById("adminStatus");
    const adminNote = document.getElementById("adminNote");
    const markPendingBtn = document.getElementById("markPendingBtn");
    const approveBtn = document.getElementById("approveBtn");
    const rejectBtn = document.getElementById("rejectBtn");

    function getState() {
        return localStorage.getItem(RECEIPT_STATE_KEY) || "in_use";
    }

    function setState(nextState) {
        localStorage.setItem(RECEIPT_STATE_KEY, nextState);
        applyState(nextState);
    }

    function applyState(stateValue) {
        const state = stateValue || getState();
        adminStatus.classList.remove("pending", "approved", "rejected");

        if (state === "return_pending") {
            adminStatus.textContent = "PENDING";
            adminStatus.classList.add("pending");
            adminNote.textContent = "User requested a return. Review and approve/reject.";
            return;
        }

        if (state === "return_approved") {
            adminStatus.textContent = "APPROVED";
            adminStatus.classList.add("approved");
            adminNote.textContent = "Return approved. User can now borrow again.";
            return;
        }

        if (state === "return_rejected") {
            adminStatus.textContent = "REJECTED";
            adminStatus.classList.add("rejected");
            adminNote.textContent = "Return rejected. User must follow up.";
            return;
        }

        adminStatus.textContent = "IN USE";
        adminNote.textContent = "Tool is currently borrowed and in use.";
    }

    markPendingBtn.addEventListener("click", () => setState("return_pending"));
    approveBtn.addEventListener("click", () => setState("return_approved"));
    rejectBtn.addEventListener("click", () => setState("return_rejected"));

    window.addEventListener("storage", (event) => {
        if (event.key === RECEIPT_STATE_KEY) {
            applyState(event.newValue || "in_use");
        }
    });

    applyState(getState());
})();
