import { TokenParser, SyncService } from "./lib.js";

class BackgroundApp {
    static ALARM = "periodic-sync";
    static PERIOD_MINUTES = 180;

    constructor() {
        this.service = new SyncService();
    }

    isSessionCookie(cookie) {
        const domain = String(cookie.domain || "").replace(/^\./, "");
        return cookie.name === TokenParser.COOKIE_NAME && (domain === "formula1.com" || domain.endsWith(".formula1.com"));
    }

    ensureAlarm() {
        chrome.alarms.create(BackgroundApp.ALARM, { periodInMinutes: BackgroundApp.PERIOD_MINUTES });
    }

    register() {
        chrome.cookies.onChanged.addListener((change) => {
            if (!change.removed && this.isSessionCookie(change.cookie)) {
                this.service.run("cookie-changed");
            }
        });

        chrome.runtime.onInstalled.addListener(() => {
            this.ensureAlarm();
            this.service.run("installed");
        });

        chrome.runtime.onStartup.addListener(() => {
            this.ensureAlarm();
            this.service.run("startup");
        });

        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === BackgroundApp.ALARM) this.service.run("periodic");
        });

        chrome.runtime.onMessage.addListener((message, sender, respond) => {
            if (message?.type !== "sync") return false;
            this.service.run("manual").then(respond);
            return true;
        });
    }
}

new BackgroundApp().register();
