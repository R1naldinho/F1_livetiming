class PageMetrics {
    constructor() {
        this.lastPath = null;
        this.enabled = this.isTrackingAllowed();
        if (!this.enabled) return;

        this.track(window.location.pathname);
        document.addEventListener("click", (event) => this.handleClick(event));
    }

    isTrackingAllowed() {
        return (
            navigator.doNotTrack !== "1" &&
            navigator.globalPrivacyControl !== true
        );
    }

    handleClick(event) {
        const link = event.target.closest(".nav-link");
        if (!link) return;

        const slug = (link.dataset.tab || link.textContent || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60);

        if (slug) this.track(`/${slug}`);
    }

    async track(path) {
        const normalized = path.replace(/\/+$/, "") || "/";
        if (!/^\/[a-zA-Z0-9/_-]{0,99}$/.test(normalized)) return;
        if (normalized === this.lastPath) return;
        this.lastPath = normalized;

        try {
            await fetch("/api/metrics/pageview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: normalized }),
                keepalive: true,
            });
        } catch (error) {}
    }
}

window.addEventListener("DOMContentLoaded", () => {
    window.pageMetrics = new PageMetrics();
});