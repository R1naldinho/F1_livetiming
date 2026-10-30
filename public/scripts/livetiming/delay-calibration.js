class DelayCalibrator {
    constructor(client) {
        this.client = client;
        this.services = [
            { value: "now-skygo", label: "NOW / Sky Go (internet)" },
            { value: "sky-stream", label: "Sky Stream / Sky Glass" },
            { value: "sky-satellite", label: "Sky satellite" },
            { value: "tv8-dtt", label: "TV8 (digital terrestrial)" },
            { value: "tv8-web", label: "TV8 (website or app)" },
            { value: "f1tv", label: "F1 TV" },
            { value: "other-streaming", label: "Other streaming service" },
            { value: "other-broadcast", label: "Other TV broadcast" },
            { value: "circuit", label: "At the circuit" },
        ];
        this.devices = [
            { value: "smart-tv", label: "Smart TV app" },
            { value: "stick-box", label: "Streaming stick or box" },
            { value: "mobile", label: "Phone or tablet" },
            { value: "computer", label: "Computer (browser)" },
            { value: "decoder-tuner", label: "Decoder or TV tuner" },
            { value: "other", label: "Other" },
        ];
        this.clockCaptureLagSeconds = 0.7;
        this.lapTapLagSeconds = 0.3;
        this.minDelaySeconds = -15;
        this.maxDelaySeconds = 300;
        this.samples = [];
        this.method = "clock";
        this.targetLap = null;
        this.captureAt = null;
        this.pollTimer = null;
        this.build();
    }

    build() {
        this.openButton = document.createElement("button");
        this.openButton.type = "button";
        this.openButton.className = "delay-calibrate-button";
        this.openButton.textContent = "Calibrate";
        this.openButton.addEventListener("click", () => this.open());

        this.overlay = document.createElement("div");
        this.overlay.className = "calibration-overlay calibration-hidden";
        this.overlay.addEventListener("click", (event) => {
            if (event.target === this.overlay) this.close();
        });

        this.dialog = document.createElement("div");
        this.dialog.className = "calibration-dialog";

        const title = document.createElement("h3");
        title.className = "calibration-title";
        title.textContent = "Calibrate live delay";

        this.serviceSelect = this.createSelect(
            this.services,
            "f1_live_delay_service",
        );
        this.deviceSelect = this.createSelect(
            this.devices,
            "f1_live_delay_device",
        );

        this.instruction = document.createElement("p");
        this.instruction.className = "calibration-instruction";

        this.clockRow = document.createElement("div");
        this.clockRow.className = "calibration-clock-row";

        this.clockInput = document.createElement("input");
        this.clockInput.type = "text";
        this.clockInput.inputMode = "numeric";
        this.clockInput.autocomplete = "off";
        this.clockInput.placeholder = "mm:ss";
        this.clockInput.className = "calibration-clock-input";
        this.clockInput.addEventListener("input", () =>
            this.handleClockInput(),
        );
        this.clockInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") this.submitClock();
        });

        this.clockButton = document.createElement("button");
        this.clockButton.type = "button";
        this.clockButton.className = "calibration-secondary";
        this.clockButton.textContent = "Measure";
        this.clockButton.addEventListener("click", () => this.submitClock());

        this.clockRow.appendChild(this.clockInput);
        this.clockRow.appendChild(this.clockButton);

        this.lapButton = document.createElement("button");
        this.lapButton.type = "button";
        this.lapButton.className = "calibration-lap-button";
        this.lapButton.addEventListener("click", () => this.submitLap());

        this.hint = document.createElement("p");
        this.hint.className = "calibration-hint";

        this.status = document.createElement("p");
        this.status.className = "calibration-status";

        this.result = document.createElement("p");
        this.result.className = "calibration-result";

        const shareLabel = document.createElement("label");
        shareLabel.className = "calibration-share";
        this.shareCheckbox = document.createElement("input");
        this.shareCheckbox.type = "checkbox";
        this.shareCheckbox.checked = true;
        const shareText = document.createElement("span");
        shareText.textContent =
            "Share this measurement anonymously to improve the default delays";
        shareLabel.appendChild(this.shareCheckbox);
        shareLabel.appendChild(shareText);

        const actions = document.createElement("div");
        actions.className = "calibration-actions";

        this.cancelButton = document.createElement("button");
        this.cancelButton.type = "button";
        this.cancelButton.className = "calibration-secondary";
        this.cancelButton.textContent = "Cancel";
        this.cancelButton.addEventListener("click", () => this.close());

        this.applyButton = document.createElement("button");
        this.applyButton.type = "button";
        this.applyButton.className = "calibration-primary";
        this.applyButton.textContent = "Apply";
        this.applyButton.addEventListener("click", () => this.apply());

        actions.appendChild(this.cancelButton);
        actions.appendChild(this.applyButton);

        this.dialog.appendChild(title);
        this.dialog.appendChild(
            this.createField("How do you watch the race?", this.serviceSelect),
        );
        this.dialog.appendChild(
            this.createField("On which device?", this.deviceSelect),
        );
        this.dialog.appendChild(this.instruction);
        this.dialog.appendChild(this.clockRow);
        this.dialog.appendChild(this.lapButton);
        this.dialog.appendChild(this.hint);
        this.dialog.appendChild(this.status);
        this.dialog.appendChild(this.result);
        this.dialog.appendChild(shareLabel);
        this.dialog.appendChild(actions);

        this.overlay.appendChild(this.dialog);
        document.body.appendChild(this.overlay);
    }

    createField(labelText, control) {
        const field = document.createElement("label");
        field.className = "calibration-field";
        const caption = document.createElement("span");
        caption.textContent = labelText;
        field.appendChild(caption);
        field.appendChild(control);
        return field;
    }

    createSelect(options, storageKey) {
        const select = document.createElement("select");
        options.forEach((option) => {
            const element = document.createElement("option");
            element.value = option.value;
            element.textContent = option.label;
            select.appendChild(element);
        });

        const saved = localStorage.getItem(storageKey);
        if (saved && options.some((option) => option.value === saved)) {
            select.value = saved;
        }

        select.addEventListener("change", () => {
            localStorage.setItem(storageKey, select.value);
        });

        return select;
    }

    open() {
        this.samples = [];
        this.captureAt = null;
        this.targetLap = null;
        this.clockInput.value = "";
        this.result.textContent = "";
        this.status.textContent = "";
        this.applyButton.disabled = true;
        this.method = this.client.getSessionKind() === "race" ? "lap" : "clock";

        this.clockRow.classList.toggle(
            "calibration-hidden",
            this.method !== "clock",
        );
        this.lapButton.classList.toggle(
            "calibration-hidden",
            this.method !== "lap",
        );

        this.refreshHint();
        this.overlay.classList.remove("calibration-hidden");

        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => this.refreshHint(), 500);

        if (this.method === "clock") this.clockInput.focus();
    }

    close() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.overlay.classList.add("calibration-hidden");
    }

    resolveTargetLap() {
        if (this.targetLap !== null) return;
        const lap = this.client.calibrationSource.lap;
        if (lap) this.targetLap = lap.lap + 1;
    }

    refreshHint() {
        if (!this.client.sessionInfo) {
            this.instruction.textContent =
                "Calibration needs a live session. Open it while a session is running.";
            this.hint.textContent = "";
            return;
        }

        if (this.method === "lap") {
            this.resolveTargetLap();
            if (this.targetLap === null) {
                this.instruction.textContent =
                    "Press the button the moment the lap counter on your TV changes.";
                this.lapButton.textContent = "TV lap counter changed";
                this.hint.textContent =
                    "Waiting for lap data from the timing feed...";
                return;
            }

            this.instruction.textContent = `Press the button the moment the lap counter on your TV changes to lap ${this.targetLap}.`;
            this.lapButton.textContent = `TV shows lap ${this.targetLap}`;
            const reached =
                this.client.calibrationSource.lapReachedAt[this.targetLap] !==
                undefined;
            this.hint.textContent = reached
                ? `The timing feed is already on lap ${this.targetLap}. Press as soon as your TV catches up.`
                : `Get ready: lap ${this.targetLap} has not started on the timing feed yet.`;
            return;
        }

        this.instruction.textContent =
            "Read the session clock on your TV, then start typing it right away (mm:ss).";
        const clock = this.client.calibrationSource.clock;
        if (!clock) {
            this.hint.textContent = "Waiting for session clock data...";
        } else if (!clock.extrapolating) {
            this.hint.textContent =
                "The session clock is stopped. Calibrate while it is running.";
        } else {
            this.hint.textContent = "";
        }
    }

    formatClockInput(raw) {
        const digits = raw.replace(/\D/g, "").slice(0, 4);
        if (digits.length <= 2) return digits;
        return `${digits.slice(0, -2)}:${digits.slice(-2)}`;
    }

    parseClockInput(value) {
        const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
        if (!match) return NaN;
        return Number(match[1]) * 60 + Number(match[2]);
    }

    handleClockInput() {
        const formatted = this.formatClockInput(this.clockInput.value);
        if (this.clockInput.value !== formatted) {
            this.clockInput.value = formatted;
        }

        if (formatted === "") {
            this.captureAt = null;
        } else if (this.captureAt === null) {
            this.captureAt = Date.now();
        }
    }

    submitClock() {
        const tvSeconds = this.parseClockInput(this.clockInput.value);
        if (!Number.isFinite(tvSeconds) || this.captureAt === null) {
            this.status.textContent =
                "Type the clock exactly as shown on your TV (mm:ss).";
            return;
        }

        const clock = this.client.calibrationSource.clock;
        if (!clock) {
            this.status.textContent = "Waiting for session clock data...";
            return;
        }
        if (!clock.extrapolating) {
            this.status.textContent =
                "The session clock is stopped. Try again when it is running.";
            return;
        }

        const feedSeconds = this.client.getFeedClockRemaining(this.captureAt);
        const delay = tvSeconds - feedSeconds - this.clockCaptureLagSeconds;

        this.clockInput.value = "";
        this.captureAt = null;
        this.addSample(delay);
    }

    submitLap() {
        this.resolveTargetLap();
        if (this.targetLap === null) {
            this.status.textContent =
                "Waiting for lap data from the timing feed...";
            return;
        }

        const reachedAt =
            this.client.calibrationSource.lapReachedAt[this.targetLap];
        if (reachedAt === undefined) {
            this.status.textContent = `The timing feed has not reached lap ${this.targetLap} yet. Press when your TV shows it.`;
            return;
        }

        const delay = (Date.now() - reachedAt) / 1000 - this.lapTapLagSeconds;
        const accepted = this.addSample(delay);
        if (accepted) {
            this.targetLap += 1;
            this.refreshHint();
        }
    }

    addSample(delaySeconds) {
        if (
            !Number.isFinite(delaySeconds) ||
            delaySeconds < this.minDelaySeconds ||
            delaySeconds > this.maxDelaySeconds
        ) {
            this.status.textContent =
                "That measurement looks wrong. Check the value and try again.";
            return false;
        }

        this.samples.push(Math.max(0, delaySeconds));
        const count = this.samples.length;
        this.result.textContent = `Measured delay: ${this.getMedian().toFixed(1)} s (${count} ${count === 1 ? "measurement" : "measurements"})`;
        this.status.textContent =
            "Measure again for better accuracy, or apply.";
        this.applyButton.disabled = false;
        return true;
    }

    getMedian() {
        const sorted = [...this.samples].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2
            ? sorted[middle]
            : (sorted[middle - 1] + sorted[middle]) / 2;
    }

    apply() {
        if (this.samples.length === 0) return;

        const delay = Math.round(this.getMedian() * 10) / 10;
        this.client.setDelay(Math.max(0.001, delay), true);
        this.client.refreshDelayControls();

        if (this.shareCheckbox.checked) {
            this.share(delay);
        }

        this.close();
    }

    async share(delaySeconds) {
        const payload = {
            series: "f1",
            service: this.serviceSelect.value,
            device: this.deviceSelect.value,
            method: this.method,
            sessionKind: this.client.getSessionKind(),
            delaySeconds,
            samples: this.samples.length,
        };

        try {
            await fetch("/api/calibration", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
        } catch (error) {}
    }
}
