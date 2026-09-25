class RaceControlUI {
    constructor(container) {
        this.knownIds = new Set();
        this.userScrolled = false;
        this.collapsed = false;

        this.root = document.createElement("div");
        this.root.className = "race-control-panel";

        this.header = document.createElement("div");
        this.header.className = "race-control-header";
        this.header.onclick = () => this.toggleCollapse();

        const titleGroup = document.createElement("div");
        titleGroup.className = "race-control-title-group";

        this.title = document.createElement("span");
        this.title.className = "race-control-title";
        this.title.textContent = "Race Control";

        this.countBadge = document.createElement("span");
        this.countBadge.className = "race-control-count";
        this.countBadge.textContent = "0";

        titleGroup.appendChild(this.title);
        titleGroup.appendChild(this.countBadge);

        this.toggleBtn = document.createElement("span");
        this.toggleBtn.className = "race-control-toggle";
        this.toggleBtn.textContent = "▾";

        this.header.appendChild(titleGroup);
        this.header.appendChild(this.toggleBtn);

        this.list = document.createElement("div");
        this.list.className = "race-control-list";
        this.list.addEventListener("scroll", () => {
            const atBottom =
                this.list.scrollHeight -
                    this.list.scrollTop -
                    this.list.clientHeight <
                20;
            this.userScrolled = !atBottom;
        });

        this.emptyState = document.createElement("div");
        this.emptyState.className = "race-control-empty";
        this.emptyState.textContent = "No race control messages yet.";
        this.list.appendChild(this.emptyState);

        this.root.appendChild(this.header);
        this.root.appendChild(this.list);
        container.firstElementChild.lastElementChild.appendChild(this.root);
    }

    toggleCollapse() {
        this.collapsed = !this.collapsed;
        this.list.style.display = this.collapsed ? "none" : "flex";
        this.toggleBtn.textContent = this.collapsed ? "▸" : "▾";
    }

    categoryMeta(msg) {
        const flag = String(msg.Flag || "").toUpperCase();
        const category = String(msg.Category || "").toUpperCase();
        const message = String(msg.Message || "").toUpperCase();

        if (flag.includes("CHEQUERED"))
            return { cls: "rc-chequered", icon: "" };
        if (flag === "RED") return { cls: "rc-red", icon: "" };
        if (flag.includes("DOUBLE YELLOW"))
            return { cls: "rc-double-yellow", icon: "" };
        if (flag === "YELLOW") return { cls: "rc-yellow", icon: "" };
        if (flag === "GREEN") return { cls: "rc-green", icon: "" };
        if (flag === "BLUE") return { cls: "rc-blue", icon: "" };
        if (category.includes("SAFETY CAR") || message.includes("SAFETY CAR"))
            return { cls: "rc-safety-car", icon: "" };
        if (message.includes("INVESTIGAT") || message.includes("PENALTY"))
            return { cls: "rc-investigation", icon: "" };

        return { cls: "rc-default", icon: "" };
    }

    formatTime(utc) {
        if (!utc) return "-";
        try {
            let dateStr = utc;
            if (
                typeof utc === "string" &&
                !utc.endsWith("Z") &&
                !/[+-]\d{2}:?\d{2}$/.test(utc)
            ) {
                dateStr = utc.includes("T")
                    ? utc + "Z"
                    : utc.replace(" ", "T") + "Z";
            }

            return new Date(dateStr).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            });
        } catch (e) {
            return "-";
        }
    }

    update(messages) {
        if (!Array.isArray(messages) || messages.length === 0) return;

        const newOnes = [];
        messages.forEach((msg) => {
            const id = `${msg.Utc || ""}|${msg.Lap || ""}|${msg.Message || ""}`;
            if (!this.knownIds.has(id)) {
                this.knownIds.add(id);
                newOnes.push(msg);
            }
        });

        if (newOnes.length === 0) return;

        if (this.emptyState.parentNode) {
            this.emptyState.remove();
        }

        newOnes.forEach((msg) => {
            const meta = this.categoryMeta(msg);
            const row = document.createElement("div");
            row.className = `race-control-item ${meta.cls} rc-new`;

            const time = document.createElement("span");
            time.className = "rc-time";
            time.textContent = this.formatTime(msg.Utc);

            const icon = document.createElement("span");
            icon.className = "rc-icon";
            icon.textContent = meta.icon;

            const text = document.createElement("span");
            text.className = "rc-text";
            let messageText = msg.Message || "";
            if (msg.Lap) messageText = `Lap ${msg.Lap} — ${messageText}`;
            text.textContent = messageText;

            row.appendChild(time);
            row.appendChild(icon);
            row.appendChild(text);
            this.list.appendChild(row);

            setTimeout(() => {
                row.classList.remove("rc-new");
            }, 3000);
        });

        this.countBadge.textContent = String(this.knownIds.size);

        if (!this.userScrolled) {
            this.list.scrollTop = this.list.scrollHeight;
        }
    }
}
