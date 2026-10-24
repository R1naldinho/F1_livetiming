export class TokenParser {
    static COOKIE_NAME = "login-session";

    static decodeClaims(token) {
        const parts = String(token).split(".");
        if (parts.length !== 3) return null;
        try {
            const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
            const binary = atob(
                padded + "=".repeat((4 - (padded.length % 4)) % 4),
            );
            const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch {
            return null;
        }
    }

    static fromCookieValue(raw) {
        let value = String(raw || "");
        if (/%[0-9a-f]{2}/i.test(value)) {
            try {
                value = decodeURIComponent(value);
            } catch {
                return null;
            }
        }
        if (!value.startsWith("{")) return null;
        try {
            const parsed = JSON.parse(value);
            const token =
                parsed?.data?.subscriptionToken || parsed?.subscriptionToken;
            return typeof token === "string" && token ? token : null;
        } catch {
            return null;
        }
    }

    static describe(token, cookieExpirySeconds) {
        const claims = TokenParser.decodeClaims(token);
        const jwtExpiry =
            claims && Number.isFinite(claims.exp) ? claims.exp * 1000 : null;
        const cookieExpiry = cookieExpirySeconds
            ? cookieExpirySeconds * 1000
            : null;
        return {
            token,
            expiresAt: jwtExpiry ?? cookieExpiry,
            subscriptionStatus: claims?.SubscriptionStatus ?? null,
        };
    }

    static pickBest(cookies, now = Date.now()) {
        return (
            cookies
                .filter((cookie) => cookie.name === TokenParser.COOKIE_NAME)
                .map((cookie) => {
                    const token = TokenParser.fromCookieValue(cookie.value);
                    return token
                        ? TokenParser.describe(token, cookie.expirationDate)
                        : null;
                })
                .filter(
                    (entry) =>
                        entry &&
                        (entry.expiresAt === null || entry.expiresAt > now),
                )
                .sort((a, b) => (b.expiresAt ?? 0) - (a.expiresAt ?? 0))[0] ||
            null
        );
    }
}

export class Settings {
    static KEY = "settings";
    static DEFAULTS = { serverUrl: "", adminSecret: "" };

    static async load() {
        const stored = await chrome.storage.local.get(Settings.KEY);
        return { ...Settings.DEFAULTS, ...(stored[Settings.KEY] || {}) };
    }

    static async save(values) {
        const current = await Settings.load();
        await chrome.storage.local.set({
            [Settings.KEY]: { ...current, ...values },
        });
    }

    static normalizeUrl(input) {
        let url;
        try {
            url = new URL(String(input || "").trim());
        } catch {
            return null;
        }
        const local =
            url.hostname === "localhost" || url.hostname === "127.0.0.1";
        if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
            return null;
        return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
    }
}

export class SyncState {
    static KEY = "syncState";

    static async load() {
        const stored = await chrome.storage.local.get(SyncState.KEY);
        return stored[SyncState.KEY] || { lastPushedToken: null, last: null };
    }

    static async save(patch) {
        const current = await SyncState.load();
        await chrome.storage.local.set({
            [SyncState.KEY]: { ...current, ...patch },
        });
    }
}

export class ServerClient {
    constructor(baseUrl, secret) {
        this.url = `${baseUrl}/api/admin/f1-token`;
        this.secret = secret;
    }

    headers() {
        return {
            "content-type": "application/json",
            "x-admin-secret": this.secret,
        };
    }

    async request(options) {
        const response = await fetch(this.url, {
            credentials: "omit",
            ...options,
        });
        if (response.status === 401)
            throw new Error("Server rejected the admin secret");
        if (response.status === 404)
            throw new Error(
                "Admin endpoint not found (is ADMIN_SECRET set on the server?)",
            );
        if (!response.ok)
            throw new Error(`Server answered HTTP ${response.status}`);
        return response.json();
    }

    status() {
        return this.request({ headers: this.headers() });
    }

    push(token) {
        return this.request({
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ token }),
        });
    }
}

export class SyncService {
    constructor() {
        this.running = null;
    }

    run(reason) {
        if (!this.running) {
            this.running = this.execute(reason).finally(() => {
                this.running = null;
            });
        }
        return this.running;
    }

    async record(result) {
        const entry = { ...result, at: Date.now() };
        await SyncState.save({ last: entry });
        await SyncService.showBadge(entry);
        return entry;
    }

    static async showBadge(entry) {
        const text = entry.ok ? "OK" : "!";
        const color = entry.ok ? "#2e9d57" : "#d93025";
        await chrome.action.setBadgeText({ text });
        await chrome.action.setBadgeBackgroundColor({ color });
        await chrome.action.setTitle({
            title: `F1 Token Sync: ${entry.message}`,
        });
    }

    async execute(reason) {
        const settings = await Settings.load();
        const baseUrl = Settings.normalizeUrl(settings.serverUrl);

        if (!baseUrl || !settings.adminSecret) {
            return this.record({
                ok: false,
                code: "not_configured",
                reason,
                message: "Set the server URL and admin secret",
            });
        }

        const cookie = await chrome.cookies.get({
            url: "https://www.formula1.com/",
            name: TokenParser.COOKIE_NAME,
        });

        const best = TokenParser.pickBest(cookie ? [cookie] : []);

        if (!best) {
            return this.record({
                ok: false,
                code: "no_cookie",
                reason,
                message: "No valid session cookie: log in on formula1.com",
            });
        }

        const details = {
            expiresAt: best.expiresAt,
            subscriptionStatus: best.subscriptionStatus,
        };

        try {
            const client = new ServerClient(baseUrl, settings.adminSecret);
            const state = await SyncState.load();
            let needsPush = best.token !== state.lastPushedToken;

            if (!needsPush) {
                const status = await client.status();
                needsPush = !status.present || status.expired === true;
            }

            if (needsPush) {
                await client.push(best.token);
                await SyncState.save({ lastPushedToken: best.token });
            }

            return this.record({
                ok: true,
                code: needsPush ? "pushed" : "up_to_date",
                reason,
                message: needsPush
                    ? "Token sent to the server"
                    : "Server already has the current token",
                ...details,
            });
        } catch (error) {
            return this.record({
                ok: false,
                code: "server_error",
                reason,
                message: error.message,
                ...details,
            });
        }
    }
}
