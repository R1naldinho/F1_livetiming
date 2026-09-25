class ResultsUI {
    constructor() {
        this.resultsContainer = document.getElementById("results");
        this.dataManager = new SessionDataManager();
        this.racesData = null;
        this.selectedYear = new Date().getFullYear();
        this.selectedMeetingKey = null;
        this.selectedSessionKey = null;
        this.activeTab = "overview";
        this.charts = {};
        this.analytics = null;
        this.sessionType = null;
        this.sessionData = null;
        this.preparedAnalytics = null;
        this.tyreUI = new TyreStrategyUI(this);

        this.compoundOrder = [
            "SOFT",
            "MEDIUM",
            "HARD",
            "INTERMEDIATE",
            "WET",
            "UNKNOWN",
        ];
    }

    async loadChartJS() {
        if (!window.Chart) {
            await this.loadScript("https://cdn.jsdelivr.net/npm/chart.js");
        }

        if (!window.Hammer) {
            await this.loadScript(
                "https://cdn.jsdelivr.net/npm/hammerjs@2.0.8/hammer.min.js",
            );
        }

        if (!window.ChartZoom) {
            await this.loadScript(
                "https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.2.0/dist/chartjs-plugin-zoom.min.js",
            );
        }

        if (window.ChartZoom && !this.zoomRegistered) {
            Chart.register(window.ChartZoom);
            this.zoomRegistered = true;
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);

            if (existing) {
                existing.addEventListener("load", resolve);
                existing.addEventListener("error", reject);
                if (src.includes("chartjs-plugin-zoom") && window.ChartZoom)
                    resolve();
                return;
            }

            const script = document.createElement("script");
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    getZoomOptions() {
        return {
            pan: {
                enabled: true,
                mode: "xy",
            },
            zoom: {
                wheel: {
                    enabled: true,
                },
                pinch: {
                    enabled: true,
                },
                mode: "xy",
            },
        };
    }

    formatSecondsToLapTime(seconds) {
        const value = Number(seconds);

        if (!Number.isFinite(value) || value <= 0) return "N/A";

        const mins = Math.floor(value / 60);
        const secs = (value % 60).toFixed(3);
        const formattedSecs = Number(secs) < 10 ? `0${secs}` : secs;

        return `${mins}:${formattedSecs}`;
    }

    formatDelta(seconds) {
        const value = Number(seconds);

        if (!Number.isFinite(value)) return "N/A";

        return `${value >= 0 ? "+" : ""}${value.toFixed(3)}s`;
    }

    formatNumber(value, decimals = 1) {
        const n = Number(value);

        if (!Number.isFinite(n)) return "N/A";

        return n.toFixed(decimals);
    }

    safeCall(method, fallback = null, ...args) {
        if (!this.analytics || typeof this.analytics[method] !== "function") {
            return fallback;
        }

        try {
            return this.analytics[method](...args);
        } catch (error) {
            console.warn(`Analytics method ${method} failed:`, error);
            return fallback;
        }
    }

    async init() {
        if (!this.resultsContainer) return;

        this.renderLayout();
        await this.fetchData();

        if (!this.racesData) return;

        this.selectMostRecentSession();
        this.updateDropdowns();
        await this.handleSessionUpdate();
    }

    renderLayout() {
        while (this.resultsContainer.firstChild) {
            this.resultsContainer.removeChild(this.resultsContainer.firstChild);
        }

        this.resultsContainer.className = "results-root tab-content";

        const controlsContainer = document.createElement("div");
        controlsContainer.className = "sticky-selector";

        const selectorRow = document.createElement("div");
        selectorRow.className = "selector-row";

        const yearSelect = document.createElement("select");
        yearSelect.id = "year-select";
        yearSelect.className = "selector-dropdown";
        yearSelect.addEventListener("change", (e) => this.handleYearChange(e));

        const meetingSelect = document.createElement("select");
        meetingSelect.id = "meeting-select";
        meetingSelect.className = "selector-dropdown";
        meetingSelect.addEventListener("change", (e) =>
            this.handleMeetingChange(e),
        );

        const sessionSelect = document.createElement("select");
        sessionSelect.id = "session-select";
        sessionSelect.className = "selector-dropdown";
        sessionSelect.addEventListener("change", (e) =>
            this.handleSessionChange(e),
        );

        selectorRow.appendChild(yearSelect);
        selectorRow.appendChild(meetingSelect);
        selectorRow.appendChild(sessionSelect);

        const submenuNav = document.createElement("div");
        submenuNav.className = "submenu-nav";

        const tabs = [
            { id: "overview", label: "Overview" },
            { id: "tyre", label: "Tyres & Strategy" },
            { id: "laps", label: "Lap Times" },
        ];

        tabs.forEach((tab) => {
            const btn = document.createElement("button");

            btn.className = `submenu-btn ${this.activeTab === tab.id ? "active" : ""}`;
            btn.dataset.tab = tab.id;
            btn.textContent = tab.label;

            btn.addEventListener("click", () => this.handleTabChange(tab.id));

            submenuNav.appendChild(btn);
        });

        controlsContainer.appendChild(selectorRow);
        controlsContainer.appendChild(submenuNav);

        const contentContainer = document.createElement("div");
        contentContainer.id = "session-info-content";

        this.resultsContainer.appendChild(controlsContainer);
        this.resultsContainer.appendChild(contentContainer);
    }

    async fetchData() {
        try {
            const response = await fetch(
                `/api/races/${this.selectedYear}`,
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            this.racesData = await response.json();
        } catch (error) {
            this.racesData = null;
            this.renderError("Error loading race calendar.");
        }
    }

    selectMostRecentSession() {
        if (!this.racesData?.Meetings?.length) return;

        const now = Date.now();

        let selectedSession = null;
        let selectedMeeting = null;
        let latestDate = 0;

        for (const meeting of this.racesData.Meetings) {
            if (!meeting.Sessions) continue;

            for (const session of meeting.Sessions) {
                const date = new Date(session.StartDate).getTime();

                if (!Number.isFinite(date)) continue;

                if (date <= now && date > latestDate) {
                    latestDate = date;
                    selectedSession = session;
                    selectedMeeting = meeting;
                }
            }
        }

        if (!selectedSession || !selectedMeeting) {
            for (const meeting of this.racesData.Meetings) {
                if (!meeting.Sessions?.length) continue;

                for (const session of meeting.Sessions) {
                    const date = new Date(session.StartDate).getTime();

                    if (!Number.isFinite(date)) continue;

                    if (date > latestDate) {
                        latestDate = date;
                        selectedSession = session;
                        selectedMeeting = meeting;
                    }
                }
            }
        }

        if (selectedMeeting && selectedSession) {
            this.selectedMeetingKey = selectedMeeting.Key;
            this.selectedSessionKey = selectedSession.Key;
        }
    }

    updateDropdowns() {
        const yearSelect = document.getElementById("year-select");
        const meetingSelect = document.getElementById("meeting-select");

        if (!yearSelect || !meetingSelect || !this.racesData) return;

        while (yearSelect.firstChild) {
            yearSelect.removeChild(yearSelect.firstChild);
        }

        const currentYear = new Date().getFullYear();

        for (let year = currentYear; year >= 2018; year--) {
            const option = document.createElement("option");
            option.value = year;
            option.textContent = `Year: ${year}`;

            if (year === Number(this.selectedYear)) {
                option.selected = true;
            }

            yearSelect.appendChild(option);
        }

        while (meetingSelect.firstChild) {
            meetingSelect.removeChild(meetingSelect.firstChild);
        }

        this.racesData.Meetings.forEach((meeting) => {
            const option = document.createElement("option");
            option.value = meeting.Key;
            option.textContent = `${meeting.Name} (${meeting.Location})`;

            meetingSelect.appendChild(option);
        });

        meetingSelect.value = String(this.selectedMeetingKey);

        this.updateSessionDropdown();
    }

    updateSessionDropdown() {
        const sessionSelect = document.getElementById("session-select");

        if (!sessionSelect) return;

        while (sessionSelect.firstChild) {
            sessionSelect.removeChild(sessionSelect.firstChild);
        }

        const currentMeeting = this.racesData?.Meetings?.find(
            (meeting) =>
                String(meeting.Key) === String(this.selectedMeetingKey),
        );

        if (!currentMeeting?.Sessions) return;

        currentMeeting.Sessions.forEach((session) => {
            const option = document.createElement("option");
            option.value = session.Key;
            option.textContent = session.Name;

            sessionSelect.appendChild(option);
        });

        sessionSelect.value = String(this.selectedSessionKey);
    }

    async handleYearChange(event) {
        this.selectedYear = Number(event.target.value);

        await this.fetchData();

        if (!this.racesData) return;

        this.selectMostRecentSession();
        this.updateDropdowns();
        await this.handleSessionUpdate();
    }

    async handleMeetingChange(event) {
        this.selectedMeetingKey = event.target.value;

        const currentMeeting = this.racesData?.Meetings?.find(
            (meeting) =>
                String(meeting.Key) === String(this.selectedMeetingKey),
        );

        if (currentMeeting?.Sessions?.length) {
            this.selectedSessionKey = currentMeeting.Sessions[0].Key;
        }

        this.updateSessionDropdown();
        await this.handleSessionUpdate();
    }

    async handleSessionChange(event) {
        this.selectedSessionKey = event.target.value;
        await this.handleSessionUpdate();
    }

    async handleTabChange(tabId) {
        this.activeTab = tabId;

        document.querySelectorAll(".submenu-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.tab === tabId);
        });

        await this.handleSessionUpdate();
    }

    async handleSessionUpdate() {
        const meeting = this.racesData?.Meetings?.find(
            (m) => String(m.Key) === String(this.selectedMeetingKey),
        );

        const session = meeting?.Sessions?.find(
            (s) => String(s.Key) === String(this.selectedSessionKey),
        );

        if (!session?.Path) return;

        this.renderLoading();

        try {
            const data = await this.dataManager.loadAllSessionData(
                session.Path,
            );

            await this.loadChartJS();

            this.renderSelectedSessionInfo(meeting, session, data);
        } catch (error) {
            this.renderError(`Error loading session data: ${error.message}`);
        }
    }

    destroyCharts() {
        Object.keys(this.charts).forEach((key) => {
            if (this.charts[key]) {
                this.charts[key].destroy();
            }
        });

        this.charts = {};
    }

    renderLoading() {
        const contentContainer = document.getElementById(
            "session-info-content",
        );

        if (!contentContainer) return;

        this.destroyCharts();

        while (contentContainer.firstChild) {
            contentContainer.removeChild(contentContainer.firstChild);
        }

        const loading = document.createElement("div");
        loading.className = "ui-card loading-indicator";
        loading.textContent = "Analyzing session data...";

        contentContainer.appendChild(loading);
    }

    renderSelectedSessionInfo(
        meeting,
        session,
        { sessionInfo, driverStore, tyreStore, lapTimeStore },
    ) {
        this.destroyCharts();

        const sessionName = sessionInfo?.Name || session.Name;
        const sessionType = this.detectSessionType(sessionName);

        this.sessionType = sessionType;

        this.analytics = new TyreAnalytics(
            tyreStore,
            driverStore,
            lapTimeStore,
            {
                sessionType,
                sessionName,
            },
        );

        this.sessionData = {
            meeting,
            session,
            sessionInfo,
            driverStore,
            tyreStore,
            lapTimeStore,
        };

        const contentContainer = document.getElementById(
            "session-info-content",
        );

        if (!contentContainer) return;

        while (contentContainer.firstChild) {
            contentContainer.removeChild(contentContainer.firstChild);
        }

        contentContainer.appendChild(
            this.createSessionHeader(
                meeting,
                session,
                sessionInfo,
                sessionType,
            ),
        );

        if (this.activeTab === "tyre") {
            this.tyreUI.render(contentContainer);
        } else if (this.activeTab === "overview") {
            this.renderEmptyTab(contentContainer, "Overview");
        } else if (this.activeTab === "laps") {
            this.renderEmptyTab(contentContainer, "Lap Times");
        }
    }

    detectSessionType(sessionName) {
        const s = String(sessionName || "").toLowerCase();

        if (
            s.includes("sprint shootout") ||
            s.includes("sprint qualifying") ||
            s.includes("sprint quali")
        ) {
            return "sprint-qualifying";
        }

        if (s.includes("qualifying") || s.includes("qualifica")) {
            return "qualifying";
        }

        if (s.includes("sprint")) {
            return "sprint";
        }

        if (s.includes("race") || s.includes("gara")) {
            return "race";
        }

        return "practice";
    }

    createSessionHeader(meeting, session, sessionInfo, sessionType) {
        const card = document.createElement("div");
        card.className = "ui-card";

        const header = document.createElement("div");
        header.className = "session-header";

        const left = document.createElement("div");

        const h1 = document.createElement("h1");
        h1.textContent =
            sessionInfo?.Meeting?.OfficialName ||
            meeting?.OfficialName ||
            meeting?.Name ||
            "Session";

        const meta = document.createElement("div");
        meta.className = "session-header-meta";
        meta.textContent = `${meeting?.Location || ""}${meeting?.Location ? " · " : ""}${sessionInfo?.Name || session.Name}`;

        left.appendChild(h1);
        left.appendChild(meta);

        const badge = document.createElement("span");
        badge.className = "ui-badge";
        badge.textContent = sessionType.toUpperCase();

        header.appendChild(left);
        header.appendChild(badge);

        card.appendChild(header);

        return card;
    }

    getDataset() {
        if (!this.analytics) return {};

        try {
            const dataset = this.analytics.buildUnifiedDataset() || {};
            if (this.preparedAnalytics !== this.analytics) {
                this.tyreUI.prepareTyreDataset(dataset);
                this.preparedAnalytics = this.analytics;
            }
            return dataset;
        } catch (error) {
            console.warn("Unable to build unified tyre dataset:", error);
            return {};
        }
    }

    getAllLaps() {
        const dataset = this.getDataset();
        const laps = [];

        Object.entries(dataset).forEach(([driverId, driver]) => {
            (driver.laps || []).forEach((lap) => {
                laps.push({
                    ...lap,
                    driverId,
                    driverName: driver.driverName,
                });
            });
        });

        return laps;
    }

    getValidPaceLaps() {
        return this.getAllLaps().filter(
            (lap) =>
                lap.isValidPaceLap &&
                Number.isFinite(Number(lap.lapTime)) &&
                Number(lap.lapTime) > 0,
        );
    }

    getCleanLaps() {
        return this.getAllLaps().filter(
            (lap) =>
                lap.isCleanLap &&
                Number.isFinite(Number(lap.lapTime)) &&
                Number(lap.lapTime) > 0,
        );
    }

    calculatePercentile(values, percentile) {
        const sorted = values
            .filter(Number.isFinite)
            .slice()
            .sort((a, b) => a - b);
        if (!sorted.length) return null;
        const index =
            (Math.max(0, Math.min(100, percentile)) / 100) *
            (sorted.length - 1);
        const lower = Math.floor(index),
            upper = Math.ceil(index);
        if (lower === upper) return sorted[lower];
        return (
            sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
        );
    }

    getTyreCompoundColor(compound) {
        try {
            return (
                this.sessionData?.tyreStore?.getCompoundColor(compound) ||
                "rgba(128,128,128,0.7)"
            );
        } catch {
            return "rgba(128,128,128,0.7)";
        }
    }

    getTyreCompoundData() {
        const groups = {};
        this.compoundOrder.forEach((compound) => (groups[compound] = []));
        this.getValidPaceLaps().forEach((lap) => {
            if (groups[lap.compound]) groups[lap.compound].push(lap);
        });
        return groups;
    }

    getMaxSessionLaps(dataset) {
        let max = 0;

        Object.values(dataset).forEach((driver) => {
            const laps = (driver.laps || [])
                .map((lap) => Number(lap.lap))
                .filter(Number.isFinite);

            if (laps.length) {
                max = Math.max(max, Math.max(...laps));
            }

            const stints = driver.stints || [];

            const total = stints.reduce(
                (sum, stint) =>
                    sum +
                    Number(
                        stint.lapsDriven ??
                            stint.laps ??
                            stint.ActualLapsDriven ??
                            0,
                    ),
                0,
            );

            max = Math.max(max, total);
        });

        return max;
    }

    renderProportionalStintHeatmap(
        tyreStore,
        driverStore,
        maxSessionLaps,
        dataset,
    ) {
        const container = document.createElement("div");
        container.className = "heatmap-container";

        const entries = Object.entries(dataset);

        if (!entries.length || !maxSessionLaps) {
            container.appendChild(
                this.createEmptyState("No stint data available."),
            );
            return container;
        }

        entries.forEach(([driverId, driver]) => {
            const stints = driver.stints || [];

            if (!stints.length) return;

            const row = document.createElement("div");
            row.className = "heatmap-row";

            const driverLabel = document.createElement("div");
            driverLabel.className = "heatmap-driver";
            driverLabel.textContent =
                driver.driverName || driverStore.getFormattedName(driverId);

            const trackWrapper = document.createElement("div");
            trackWrapper.className = "heatmap-track-wrapper";

            const normalizedStints = stints
                .map((stint) => ({
                    compound: stint.compound || stint.Compound || "UNKNOWN",
                    laps: Number(
                        stint.lapsDriven ??
                            stint.laps ??
                            stint.ActualLapsDriven ??
                            stint.TotalLaps ??
                            0,
                    ),
                }))
                .filter((stint) => stint.laps > 0);

            const totalLaps = normalizedStints.reduce(
                (sum, stint) => sum + stint.laps,
                0,
            );

            const rowWidthPct = Math.min(
                100,
                (totalLaps / maxSessionLaps) * 100,
            );

            const track = document.createElement("div");
            track.className = "heatmap-track";
            track.style.width = `${rowWidthPct}%`;

            normalizedStints.forEach((stint) => {
                const block = document.createElement("div");
                block.className = "heatmap-block";
                block.style.flex = String(stint.laps);
                block.style.backgroundColor = tyreStore.getCompoundColor(
                    stint.compound,
                );

                block.title = `${stint.compound}: ${stint.laps} laps`;

                if (stint.laps >= 5) {
                    block.textContent = `${stint.compound[0]} (${stint.laps})`;
                }

                track.appendChild(block);
            });

            trackWrapper.appendChild(track);
            row.appendChild(driverLabel);
            row.appendChild(trackWrapper);

            container.appendChild(row);
        });

        return container;
    }

    renderEmptyTab(contentContainer, title) {
        const card = document.createElement("div");
        card.className = "ui-card";
        const heading = document.createElement("h2");
        heading.className = "ui-section-title";
        heading.textContent = title;
        const text = document.createElement("div");
        text.className = "empty-state";
        text.textContent = "This section is reserved for a later analysis.";
        card.appendChild(heading);
        card.appendChild(text);
        contentContainer.appendChild(card);
    }

    createKpi(label, value, subtitle) {
        const card = document.createElement("div");
        card.className = "kpi-card";

        const labelElement = document.createElement("div");
        labelElement.className = "kpi-label";
        labelElement.textContent = label;

        const valueElement = document.createElement("div");
        valueElement.className = "kpi-value";
        valueElement.textContent = value;

        const subtitleElement = document.createElement("div");
        subtitleElement.className = "kpi-subtitle";
        subtitleElement.textContent = subtitle;

        card.appendChild(labelElement);
        card.appendChild(valueElement);
        card.appendChild(subtitleElement);

        return card;
    }

    createChartCard(title, canvasId, fullWidth = false) {
        const card = document.createElement("div");
        card.className = `chart-card ${fullWidth ? "full-width" : ""}`;

        const header = document.createElement("div");
        header.className = "chart-card-header";

        const h4 = document.createElement("h4");
        h4.textContent = title;
        header.appendChild(h4);

        const resetBtn = document.createElement("button");
        resetBtn.className = "reset-chart-btn";
        resetBtn.textContent = "Reset Zoom";
        resetBtn.addEventListener("click", () => {
            const chartKey = Object.keys(this.charts).find((key) => {
                const chart = this.charts[key];
                return chart && chart.canvas && chart.canvas.id === canvasId;
            });
            if (
                chartKey &&
                this.charts[chartKey] &&
                typeof this.charts[chartKey].resetZoom === "function"
            ) {
                this.charts[chartKey].resetZoom();
            }
        });
        header.appendChild(resetBtn);

        card.appendChild(header);

        const container = document.createElement("div");
        container.className = "chart-container";

        const canvas = document.createElement("canvas");
        canvas.id = canvasId;
        container.appendChild(canvas);

        card.appendChild(container);

        return card;
    }

    renderChartEmpty(canvas, message) {
        if (!canvas || !canvas.parentNode) return;

        const container = canvas.parentNode;
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        const empty = document.createElement("div");
        empty.className = "chart-empty";
        empty.textContent = message;
        container.appendChild(empty);
    }

    createTableHead(headers) {
        const thead = document.createElement("thead");
        const tr = document.createElement("tr");

        headers.forEach((text) => {
            const th = document.createElement("th");
            th.textContent = text;
            tr.appendChild(th);
        });

        thead.appendChild(tr);
        return thead;
    }

    appendCell(row, text) {
        const td = document.createElement("td");
        td.textContent = text !== null && text !== undefined ? text : "N/A";
        row.appendChild(td);
    }

    createEmptyState(message) {
        const state = document.createElement("div");
        state.className = "empty-state";
        state.textContent = message;
        return state;
    }

    renderError(message) {
        const contentContainer = document.getElementById(
            "session-info-content",
        );

        if (!contentContainer) return;

        while (contentContainer.firstChild) {
            contentContainer.removeChild(contentContainer.firstChild);
        }

        const errorCard = document.createElement("div");
        errorCard.className = "ui-card";
        errorCard.style.color = "#ef4444";
        errorCard.textContent = message;

        contentContainer.appendChild(errorCard);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const results = new ResultsUI();
    results.init();
});