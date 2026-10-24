import { Settings, SyncState } from "./lib.js";

class PopupApp {
    constructor() {
        this.nodes = {
            status: document.getElementById("status"),
            message: document.getElementById("statusMessage"),
            detail: document.getElementById("statusDetail"),
            warning: document.getElementById("statusWarning"),
            serverUrl: document.getElementById("serverUrl"),
            adminSecret: document.getElementById("adminSecret"),
            save: document.getElementById("save"),
            sync: document.getElementById("sync"),
            hint: document.getElementById("hint"),
        };
    }

    static formatDuration(ms) {
        const hours = ms / 3600000;
        if (hours < 1) return `${Math.max(0, Math.round(ms / 60000))} min`;
        if (hours < 48) return `${hours.toFixed(1)} h`;
        return `${(hours / 24).toFixed(1)} days`;
    }

    async init() {
        const settings = await Settings.load();
        this.nodes.serverUrl.value = settings.serverUrl;
        this.nodes.adminSecret.value = settings.adminSecret;
        this.nodes.save.addEventListener("click", () => this.save());
        this.nodes.sync.addEventListener("click", () => this.sync());
        await this.renderStatus();
    }

    async renderStatus() {
        const state = await SyncState.load();
        const last = state.last;
        const { status, message, detail, warning } = this.nodes;

        status.classList.remove("is-ok", "is-error");
        warning.hidden = true;

        if (!last) {
            message.textContent = "Not synced yet";
            detail.textContent = "Log in on formula1.com and set the server below.";
            return;
        }

        status.classList.add(last.ok ? "is-ok" : "is-error");
        message.textContent = last.message;

        const parts = [`Last check ${new Date(last.at).toLocaleString()}`];
        if (last.expiresAt) parts.push(`token valid for ${PopupApp.formatDuration(last.expiresAt - Date.now())}`);
        detail.textContent = parts.join(" · ");

        if (last.subscriptionStatus && String(last.subscriptionStatus).toLowerCase() === "inactive") {
            warning.textContent = "This account has no active F1 TV subscription: the archive will probably reject the token.";
            warning.hidden = false;
        }
    }

    setBusy(busy) {
        this.nodes.save.disabled = busy;
        this.nodes.sync.disabled = busy;
    }

    async sync() {
        this.nodes.hint.textContent = "";
        this.setBusy(true);
        try {
            await chrome.runtime.sendMessage({ type: "sync" });
        } finally {
            this.setBusy(false);
            await this.renderStatus();
        }
    }

    async save() {
        this.nodes.hint.textContent = "";
        const url = Settings.normalizeUrl(this.nodes.serverUrl.value);
        const secret = this.nodes.adminSecret.value.trim();

        if (!url) {
            this.nodes.hint.textContent = "Use an https:// URL (http:// only for localhost).";
            return;
        }

        if (!secret) {
            this.nodes.hint.textContent = "The admin secret is required.";
            return;
        }

        const granted = await chrome.permissions.request({ origins: [`${new URL(url).origin}/*`] });

        if (!granted) {
            this.nodes.hint.textContent = "Permission to contact the server was denied.";
            return;
        }

        await Settings.save({ serverUrl: url, adminSecret: secret });
        await this.sync();
    }
}

new PopupApp().init();
