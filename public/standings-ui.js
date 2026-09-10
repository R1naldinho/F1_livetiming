class StandingsUI {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.data = null;
        this.currentView = "standings";
        this.standingsMode = "drivers";
        this.driverSubMode = "total";
        this.constructorSubMode = "total";
        this.driverPointChartMode = "cumulative";
        this.teamPointChartMode = "cumulative";
        this.compareDriverChartMode = "cumulative";
        this.compareTeamChartMode = "cumulative";
        this.formSpan = 5;

        this.selectedDriverIndex = 0;
        this.selectedTeamName = null;
        this.selectedCompare1Index = 0;
        this.selectedCompare2Index = 1;
        this.selectedCompareTeam1Index = 0;
        this.selectedCompareTeam2Index = 1;

        this.charts = [];
        this.isLight = document.body.classList.contains("light-mode");
        this.updateThemeVariables();
        this.initLayout();
        this.loadZoomPlugin()
            .catch(() => {})
            .then(() => this.fetchStandings());

        const observer = new MutationObserver(() => {
            const currentLight = document.body.classList.contains("light-mode");
            if (this.isLight !== currentLight) {
                this.isLight = currentLight;
                this.updateThemeVariables();
                this.render();
            }
        });
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ["class"],
        });
    }

    async loadZoomPlugin() {
        if (typeof Chart === "undefined") return;

        const zoomPlugin = window.ChartZoom || window["chartjs-plugin-zoom"];

        if (zoomPlugin) {
            try {
                Chart.register(zoomPlugin);
            } catch (e) {}
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                existing.addEventListener("load", resolve, { once: true });
                existing.addEventListener("error", reject, { once: true });
                return;
            }
            const script = document.createElement("script");
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    updateThemeVariables() {
        this.textColor = this.isLight ? "#111827" : "#f0f6fc";
        this.gridColor = this.isLight ? "#e5e7eb" : "#30363d";
        this.cardBg = this.isLight ? "#ffffff" : "#161b22";
    }

    el(tag, props = {}, ...children) {
        const element = document.createElement(tag);
        for (const k in props) {
            if (k === "style" && typeof props[k] === "object") {
                Object.assign(element.style, props[k]);
            } else if (k === "className") {
                element.className = props[k];
            } else if (k === "textContent") {
                element.textContent = props[k];
            } else if (k.startsWith("on") && typeof props[k] === "function") {
                element.addEventListener(
                    k.substring(2).toLowerCase(),
                    props[k],
                );
            } else {
                element.setAttribute(k, props[k]);
            }
        }
        children.flat().forEach((child) => {
            if (child != null) {
                element.appendChild(
                    typeof child === "object" && child.nodeType
                        ? child
                        : document.createTextNode(child),
                );
            }
        });
        return element;
    }

    initLayout() {
        while (this.container.firstChild)
            this.container.removeChild(this.container.firstChild);

        const nav = this.el(
            "div",
            { className: "standings-main-nav" },
            this.createNavBtn("Standings", "standings"),
            this.createNavBtn("Form", "form-status"),
            this.createNavBtn("Drivers", "driver-dash"),
            this.createNavBtn("Teams", "team-dash"),
            this.createNavBtn("Compare Drivers", "compare-drivers"),
            this.createNavBtn("Compare Teams", "compare-teams"),
        );

        this.contentWrapper = this.el("div", {
            className: "standings-content-wrapper",
        });
        this.container.appendChild(nav);
        this.container.appendChild(this.contentWrapper);
    }

    createNavBtn(text, viewName) {
        return this.el("button", {
            className: `standings-nav-btn ${this.currentView === viewName ? "active" : ""}`,
            textContent: text,
            onClick: (e) => {
                document
                    .querySelectorAll(".standings-main-nav .standings-nav-btn")
                    .forEach((b) => b.classList.remove("active"));
                e.target.classList.add("active");
                this.currentView = viewName;
                this.render();
            },
        });
    }

    async fetchStandings() {
        while (this.contentWrapper.firstChild)
            this.contentWrapper.removeChild(this.contentWrapper.firstChild);
        this.contentWrapper.appendChild(
            this.el("div", { textContent: "Loading standings data..." }),
        );
        try {
            const res = await fetch("/api/standings");
            if (!res.ok) throw new Error("Failed");
            this.data = await res.json();
            if (
                this.data.constructors &&
                this.data.constructors.length &&
                !this.selectedTeamName
            ) {
                this.selectedTeamName = this.data.constructors[0].teamName;
            }
            this.render();
        } catch (err) {
            while (this.contentWrapper.firstChild)
                this.contentWrapper.removeChild(this.contentWrapper.firstChild);
            this.contentWrapper.appendChild(
                this.el("div", { textContent: "Unable to load standings." }),
            );
        }
    }

    getAllGrandsPrix() {
        const gps = [];
        if (!this.data || !this.data.drivers) return gps;
        this.data.drivers.forEach((d) => {
            if (d.raceResults) {
                d.raceResults.forEach((r) => {
                    if (!gps.includes(r.grandPrix)) gps.push(r.grandPrix);
                });
            }
        });
        return gps;
    }

    getSeasonYear() {
        return parseInt(
            this.data?.year ||
                localStorage.getItem("selected_year") ||
                new Date().getFullYear(),
            10,
        );
    }

    getSeasonConfig() {
        const configs = {
            2026: {
                races: 24,
                sprints: [
                    "Chinese Grand Prix",
                    "Miami Grand Prix",
                    "Canadian Grand Prix",
                    "British Grand Prix",
                    "Dutch Grand Prix",
                    "Singapore Grand Prix",
                ],
            },
            2025: {
                races: 24,
                sprints: [
                    "Chinese Grand Prix",
                    "Miami Grand Prix",
                    "Belgian Grand Prix",
                    "United States Grand Prix",
                    "São Paulo Grand Prix",
                    "Qatar Grand Prix",
                ],
            },
            2024: {
                races: 24,
                sprints: [
                    "Chinese Grand Prix",
                    "Miami Grand Prix",
                    "Austrian Grand Prix",
                    "United States Grand Prix",
                    "São Paulo Grand Prix",
                    "Qatar Grand Prix",
                ],
            },
            2023: {
                races: 22,
                sprints: [
                    "Azerbaijan Grand Prix",
                    "Austrian Grand Prix",
                    "Belgian Grand Prix",
                    "Qatar Grand Prix",
                    "United States Grand Prix",
                    "São Paulo Grand Prix",
                ],
            },
            2022: {
                races: 22,
                sprints: [
                    "Emilia-Romagna Grand Prix",
                    "Austrian Grand Prix",
                    "São Paulo Grand Prix",
                ],
            },
            2021: {
                races: 22,
                sprints: [
                    "British Grand Prix",
                    "Italian Grand Prix",
                    "São Paulo Grand Prix",
                ],
            },
        };
        return (
            configs[this.getSeasonYear()] || {
                races: this.getAllGrandsPrix().length,
                sprints: [],
            }
        );
    }

    normalizeGrandPrixName(name) {
        return String(name || "")
            .toLowerCase()
            .replace(/[’']/g, "'")
            .replace(/[-–—]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    isSprintGrandPrix(gp) {
        const config = this.getSeasonConfig();
        const name = this.normalizeGrandPrixName(gp);
        return config.sprints.some((s) => {
            const sprint = this.normalizeGrandPrixName(s);
            return (
                name === sprint ||
                name.includes(sprint.replace(" grand prix", "")) ||
                sprint.includes(name.replace(" grand prix", ""))
            );
        });
    }

    getCompletedSprintCount() {
        return this.getAllGrandsPrix().filter((gp) =>
            this.isSprintGrandPrix(gp),
        ).length;
    }

    getChampionshipInfo() {
        const config = this.getSeasonConfig();
        const completedRaces = this.getAllGrandsPrix().length;
        const completedSprints = this.getCompletedSprintCount();
        const remainingRaces = Math.max(0, config.races - completedRaces);
        const remainingSprints = Math.max(
            0,
            config.sprints.length - completedSprints,
        );
        const completedDriverMax = completedRaces * 25 + completedSprints * 8;
        const completedConstructorMax =
            completedRaces * 43 + completedSprints * 15;
        const remainingDriverMax = remainingRaces * 25 + remainingSprints * 8;
        const remainingConstructorMax =
            remainingRaces * 43 + remainingSprints * 15;
        const leaderDriverPoints = this.data?.drivers?.length
            ? Math.max(...this.data.drivers.map((d) => parseFloat(d.pts) || 0))
            : 0;
        const leaderConstructorPoints = this.data?.constructors?.length
            ? Math.max(
                  ...this.data.constructors.map((c) => parseFloat(c.pts) || 0),
              )
            : 0;
        const driverAlive =
            this.data?.drivers?.map((d) => {
                const points = parseFloat(d.pts) || 0;
                return {
                    item: d,
                    points,
                    maxRemaining: remainingDriverMax,
                    canWin: points + remainingDriverMax >= leaderDriverPoints,
                };
            }) || [];
        const constructorAlive =
            this.data?.constructors?.map((c) => {
                const points = parseFloat(c.pts) || 0;
                return {
                    item: c,
                    points,
                    maxRemaining: remainingConstructorMax,
                    canWin:
                        points + remainingConstructorMax >=
                        leaderConstructorPoints,
                };
            }) || [];
        return {
            config,
            completedRaces,
            completedSprints,
            remainingRaces,
            remainingSprints,
            completedDriverMax,
            completedConstructorMax,
            remainingDriverMax,
            remainingConstructorMax,
            leaderDriverPoints,
            leaderConstructorPoints,
            driverAlive,
            constructorAlive,
            soleDriver: driverAlive.filter((x) => x.canWin).length === 1,
            soleConstructor:
                constructorAlive.filter((x) => x.canWin).length === 1,
        };
    }

    getDriverChampionshipStatus(driver) {
        const info = this.getChampionshipInfo();
        const entry = info.driverAlive.find((x) => x.item === driver);
        if (!entry) return "";
        if (!entry.canWin) return "eliminated";
        if (info.soleDriver && entry.points === info.leaderDriverPoints)
            return "champion";
        return "alive";
    }

    getConstructorChampionshipStatus(constructor) {
        const info = this.getChampionshipInfo();
        const entry = info.constructorAlive.find((x) => x.item === constructor);
        if (!entry) return "";
        if (!entry.canWin) return "eliminated";
        if (
            info.soleConstructor &&
            entry.points === info.leaderConstructorPoints
        )
            return "champion";
        return "alive";
    }

    getChampionshipRowClass(status) {
        return status === "eliminated"
            ? "championship-eliminated"
            : status === "champion"
              ? "championship-clinched"
              : "";
    }

    createChampionshipStatus(status) {
        if (status === "eliminated")
            return this.el("span", {
                className: "championship-status eliminated",
                textContent: "Eliminated",
            });
        if (status === "champion")
            return this.el("span", {
                className: "championship-status champion",
                textContent: "Champion",
            });
        return null;
    }

    destroyCharts() {
        this.charts.forEach((c) => c.destroy());
        this.charts = [];
    }

    createChartBox(canvas, showResetBtn = true) {
        const box = this.el("div", { className: "chart-box" });

        if (showResetBtn) {
            const resetBtn = this.el("button", {
                className: "reset-zoom-btn",
                textContent: "Reset Zoom",
                onClick: () => {
                    const chartInstance = this.charts.find(
                        (c) => c.canvas === canvas,
                    );
                    if (
                        chartInstance &&
                        typeof chartInstance.resetZoom === "function"
                    ) {
                        chartInstance.resetZoom();
                    }
                },
            });

            canvas.addEventListener("dblclick", () => {
                const chartInstance = this.charts.find(
                    (c) => c.canvas === canvas,
                );
                if (
                    chartInstance &&
                    typeof chartInstance.resetZoom === "function"
                ) {
                    chartInstance.resetZoom();
                }
            });

            box.appendChild(resetBtn);
        }

        box.appendChild(canvas);
        return box;
    }

    createSortableTable({
        columns,
        data,
        rowRenderer,
        defaultSortIndex = 0,
        defaultSortDir = "asc",
    }) {
        let sortIndex = defaultSortIndex;
        let sortDir = defaultSortDir;

        const table = this.el("table", { className: "timing-table" });
        const thead = this.el("thead");
        const tbody = this.el("tbody");
        table.appendChild(thead);
        table.appendChild(tbody);

        const updateTable = () => {
            const sortedData = [...data].sort((a, b) => {
                const col = columns[sortIndex];
                let valA = col.getValue ? col.getValue(a) : a[col.key];
                let valB = col.getValue ? col.getValue(b) : b[col.key];

                if (valA === undefined || valA === null) valA = "";
                if (valB === undefined || valB === null) valB = "";

                let isNumA = typeof valA === "number";
                let isNumB = typeof valB === "number";

                let numA = isNumA
                    ? valA
                    : parseFloat(String(valA).replace(/%/g, "").trim());
                let numB = isNumB
                    ? valB
                    : parseFloat(String(valB).replace(/%/g, "").trim());

                const isValidNumA =
                    !isNaN(numA) &&
                    String(valA).trim() !== "" &&
                    !/[a-zA-Z]{2,}/.test(String(valA).replace(/DNF/g, ""));
                const isValidNumB =
                    !isNaN(numB) &&
                    String(valB).trim() !== "" &&
                    !/[a-zA-Z]{2,}/.test(String(valB).replace(/DNF/g, ""));

                let cmp = 0;
                if (isValidNumA && isValidNumB) {
                    cmp = numA - numB;
                } else if (valA === "-" || valA === "DNF") {
                    cmp = 1;
                } else if (valB === "-" || valB === "DNF") {
                    cmp = -1;
                } else {
                    cmp = String(valA).localeCompare(String(valB), undefined, {
                        numeric: true,
                        sensitivity: "base",
                    });
                }
                return sortDir === "asc" ? cmp : -cmp;
            });

            while (thead.firstChild) thead.removeChild(thead.firstChild);
            const trHead = this.el("tr");
            columns.forEach((col, idx) => {
                const isSorted = idx === sortIndex;
                const arrowIcon = isSorted
                    ? sortDir === "asc"
                        ? "▲"
                        : "▼"
                    : "↕";

                const th = this.el(
                    "th",
                    {
                        style: {
                            cursor: "pointer",
                            userSelect: "none",
                            whiteSpace: "nowrap",
                            ...(col.style || {}),
                        },
                        onClick: () => {
                            if (sortIndex === idx) {
                                sortDir = sortDir === "asc" ? "desc" : "asc";
                            } else {
                                sortIndex = idx;
                                sortDir = col.defaultDir || "asc";
                            }
                            updateTable();
                        },
                    },
                    this.el("span", { textContent: col.label }),
                    this.el("span", {
                        className: `sort-icon ${isSorted ? "active" : "inactive"}`,
                        textContent: ` ${arrowIcon}`,
                    }),
                );
                trHead.appendChild(th);
            });
            thead.appendChild(trHead);

            while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
            sortedData.forEach((item, index) => {
                tbody.appendChild(rowRenderer(item, index));
            });
        };

        updateTable();
        return table;
    }

    render() {
        if (!this.data) return;
        this.destroyCharts();
        while (this.contentWrapper.firstChild)
            this.contentWrapper.removeChild(this.contentWrapper.firstChild);
        document.documentElement.style.setProperty("--card-bg", this.cardBg);

        if (this.currentView === "standings") this.renderStandingsView();
        else if (this.currentView === "form-status")
            this.renderFormStatusView();
        else if (this.currentView === "driver-dash")
            this.renderDriverDashboard();
        else if (this.currentView === "team-dash") this.renderTeamDashboard();
        else if (this.currentView === "compare-drivers")
            this.renderCompareDriversView();
        else if (this.currentView === "compare-teams")
            this.renderCompareTeamsView();
    }

    renderStandingsView() {
        const mainToggle = this.el(
            "div",
            { className: "standings-nav-section" },
            this.el(
                "div",
                { className: "standings-sub-nav" },
                this.el("button", {
                    className: `standings-nav-btn ${this.standingsMode === "drivers" ? "active" : ""}`,
                    textContent: "Drivers",
                    onClick: () => {
                        this.standingsMode = "drivers";
                        this.render();
                    },
                }),
                this.el("button", {
                    className: `standings-nav-btn ${this.standingsMode === "constructors" ? "active" : ""}`,
                    textContent: "Constructors",
                    onClick: () => {
                        this.standingsMode = "constructors";
                        this.render();
                    },
                }),
            ),
        );
        this.contentWrapper.appendChild(mainToggle);
        if (this.standingsMode === "drivers") {
            const driverToggle = this.el(
                "div",
                { className: "standings-nav-section" },
                this.el(
                    "div",
                    { className: "standings-sub-nav" },
                    this.el("button", {
                        className: `standings-nav-btn ${this.driverSubMode === "total" ? "active" : ""}`,
                        textContent: "Total",
                        onClick: () => {
                            this.driverSubMode = "total";
                            this.render();
                        },
                    }),
                    this.el("button", {
                        className: `standings-nav-btn ${this.driverSubMode === "race" ? "active" : ""}`,
                        textContent: "Race by Race",
                        onClick: () => {
                            this.driverSubMode = "race";
                            this.render();
                        },
                    }),
                ),
            );
            this.contentWrapper.appendChild(driverToggle);
            if (this.driverSubMode === "total") this.renderDriversTotalTable();
            else this.renderDriversRaceTable();
            this.renderTopDriversChart();
        } else {
            const constructorToggle = this.el(
                "div",
                { className: "standings-nav-section" },
                this.el(
                    "div",
                    { className: "standings-sub-nav" },
                    this.el("button", {
                        className: `standings-nav-btn ${this.constructorSubMode === "total" ? "active" : ""}`,
                        textContent: "Total",
                        onClick: () => {
                            this.constructorSubMode = "total";
                            this.render();
                        },
                    }),
                    this.el("button", {
                        className: `standings-nav-btn ${this.constructorSubMode === "race" ? "active" : ""}`,
                        textContent: "Race by Race",
                        onClick: () => {
                            this.constructorSubMode = "race";
                            this.render();
                        },
                    }),
                ),
            );
            this.contentWrapper.appendChild(constructorToggle);
            if (this.constructorSubMode === "total")
                this.renderConstructorsTotalTable();
            else this.renderConstructorsRaceTable();
            this.renderTopConstructorsChart();
        }
    }

    renderDriversTotalTable() {
        const leaderDriver =
            this.data.drivers.find((d) => parseInt(d.pos, 10) === 1) ||
            this.data.drivers[0];
        const leaderPts = leaderDriver ? parseFloat(leaderDriver.pts) || 0 : 0;

        const columns = [
            {
                label: "Pos",
                key: "pos",
                getValue: (d) => parseInt(d.pos, 10),
                style: { textAlign: "left" },
            },
            {
                label: "Driver",
                key: "driverName",
                style: { textAlign: "left" },
            },
            {
                label: "Team",
                key: "car",
                style: { textAlign: "left" },
            },
            {
                label: "Points",
                key: "pts",
                getValue: (d) => parseFloat(d.pts),
                style: { textAlign: "center" },
                defaultDir: "desc",
            },
            {
                label: "Gap",
                key: "gap",
                getValue: (d) => (parseFloat(d.pts) || 0) - leaderPts,
                style: { textAlign: "center" },
                defaultDir: "desc",
            },
        ];

        const table = this.createSortableTable({
            columns,
            data: this.data.drivers,
            defaultSortIndex: 0,
            defaultSortDir: "asc",
            rowRenderer: (d) => {
                const status = this.getDriverChampionshipStatus(d);
                const driverPts = parseFloat(d.pts) || 0;
                const diff = driverPts - leaderPts;
                const gapText = diff === 0 ? "-" : diff;

                return this.el(
                    "tr",
                    { className: this.getChampionshipRowClass(status) },
                    this.el(
                        "td",
                        {
                            className: "standings-pos",
                            style: { textAlign: "left" },
                        },
                        this.el("strong", { textContent: d.pos }),
                    ),
                    this.el(
                        "td",
                        { className: "standings-driver" },
                        this.el(
                            "div",
                            { className: "driver-cell-container" },
                            d.driverImage
                                ? this.el("img", {
                                      src: d.driverImage,
                                      className: "standings-avatar",
                                      alt: d.driverName,
                                  })
                                : null,
                            this.el(
                                "span",
                                { className: "desktop-name" },
                                d.driverName,
                            ),
                            this.el(
                                "span",
                                { className: "mobile-code" },
                                d.driverCode ||
                                    d.driverName.substring(0, 3).toUpperCase(),
                            ),
                            this.createChampionshipStatus(status),
                        ),
                    ),
                    this.el(
                        "td",
                        { className: "standings-team" },
                        this.el(
                            "div",
                            { className: "driver-cell-container" },
                            d.teamLogo
                                ? this.el("img", {
                                      src: d.teamLogo,
                                      className:
                                          [
                                              "Aston Martin",
                                              "Cadillac",
                                              "Haas F1 Team",
                                          ].includes(d.car) && !this.isLight
                                              ? "standings-team-logo invert-in-dark"
                                              : "standings-team-logo",
                                      alt: d.car,
                                  })
                                : null,
                            this.el(
                                "span",
                                { className: "team-name-text" },
                                d.car,
                            ),
                        ),
                    ),
                    this.el(
                        "td",
                        {
                            className: "standings-points",
                            style: { textAlign: "center" },
                        },
                        this.el("strong", { textContent: d.pts }),
                    ),
                    this.el(
                        "td",
                        {
                            className: "standings-gap",
                            style: { textAlign: "center" },
                        },
                        this.el("span", { textContent: gapText }),
                    ),
                );
            },
        });

        if (table) {
            table.className = "standings-table table table-sm table-hover";

            if (!this.isLight) {
                table.classList.add("table-dark");
            }
            table.style.width = "100%";
            table.style.tableLayout = "fixed";
            table.style.fontSize = "0.85rem";

            const colgroup = document.createElement("colgroup");

            const colPos = document.createElement("col");
            colPos.style.width = "10%";

            const colDriver = document.createElement("col");
            colDriver.style.width = "32%";

            const colTeam = document.createElement("col");
            colTeam.style.width = "28%";

            const colPoints = document.createElement("col");
            colPoints.style.width = "15%";

            const colGap = document.createElement("col");
            colGap.style.width = "15%";

            colgroup.appendChild(colPos);
            colgroup.appendChild(colDriver);
            colgroup.appendChild(colTeam);
            colgroup.appendChild(colPoints);
            colgroup.appendChild(colGap);

            table.insertBefore(colgroup, table.firstChild);
        }

        this.contentWrapper.appendChild(
            this.el(
                "div",
                { className: "table-responsive standings-table-wrap" },
                table,
            ),
        );
    }

    renderDriversRaceTable() {
        const gps = this.getAllGrandsPrix();
        const table = this.el("table", { className: "timing-table" });
        const headerRow = this.el(
            "tr",
            {},
            this.el("th", { textContent: "Pos", style: { width: "40px" } }),
            this.el("th", { textContent: "Driver" }),
            this.el("th", { textContent: "Team" }),
            this.el("th", {
                textContent: "Total",
                style: { textAlign: "right" },
            }),
            ...gps.map((gp) =>
                this.el("th", {
                    textContent: gp,
                    style: { textAlign: "center" },
                }),
            ),
        );
        const thead = this.el("thead", {}, headerRow);
        const tbody = this.el("tbody");

        this.data.drivers.forEach((d) => {
            const tr = this.el(
                "tr",
                {},
                this.el("td", {}, this.el("strong", { textContent: d.pos })),
                this.el(
                    "td",
                    {},
                    this.el(
                        "div",
                        { className: "driver-cell-container" },
                        d.driverImage
                            ? this.el("img", {
                                  src: d.driverImage,
                                  className: "standings-avatar",
                                  alt: d.driverName,
                              })
                            : null,
                        this.el(
                            "span",
                            { className: "desktop-name" },
                            d.driverName,
                        ),
                        this.el(
                            "span",
                            { className: "mobile-code" },
                            d.driverCode ||
                                d.driverName.substring(0, 3).toUpperCase(),
                        ),
                    ),
                ),
                this.el(
                    "td",
                    {},
                    this.el(
                        "div",
                        { className: "driver-cell-container" },
                        d.teamLogo
                            ? this.el("img", {
                                  src: d.teamLogo,
                                  className:
                                      [
                                          "Aston Martin",
                                          "Cadillac",
                                          "Haas F1 Team",
                                      ].includes(d.car) && !this.isLight
                                          ? "standings-team-logo invert-in-dark"
                                          : "standings-team-logo",
                                  alt: d.car,
                              })
                            : null,
                        this.el("span", { className: "team-name-text" }, d.car),
                    ),
                ),
                this.el(
                    "td",
                    { style: { textAlign: "right" } },
                    this.el("strong", { textContent: d.pts }),
                ),
            );

            gps.forEach((gp) => {
                const tdRace = this.el("td", {
                    style: { textAlign: "center" },
                });
                const res = d.raceResults
                    ? d.raceResults.find((r) => r.grandPrix === gp)
                    : null;
                if (res) {
                    const posNum = parseInt(res.pos, 10);
                    const suffix = isNaN(posNum)
                        ? ""
                        : posNum === 1
                          ? "st"
                          : posNum === 2
                            ? "nd"
                            : posNum === 3
                              ? "rd"
                              : "th";
                    tdRace.textContent = `${res.pts} (${res.pos}${suffix})`;

                    if (posNum === 1) tdRace.className = "podium-first";
                    else if (posNum === 2) tdRace.className = "podium-second";
                    else if (posNum === 3) tdRace.className = "podium-third";
                    else if (isNaN(posNum))
                        tdRace.className = "non-numeric-result";
                } else {
                    tdRace.textContent = "-";
                    tdRace.style.color = "#8b949e";
                }
                tr.appendChild(tdRace);
            });

            tbody.appendChild(tr);
        });

        table.appendChild(thead);
        table.appendChild(tbody);
        const tableWrapper = this.el(
            "div",
            { className: "standings-table-wrap" },
            table,
        );
        tableWrapper.style.overflowX = "auto";
        tableWrapper.style.width = "100%";

        this.contentWrapper.appendChild(tableWrapper);
    }

    renderConstructorsTotalTable() {
        const leaderConstructor =
            this.data.constructors.find((c) => parseInt(c.pos, 10) === 1) ||
            this.data.constructors[0];
        const leaderPts = leaderConstructor
            ? parseFloat(leaderConstructor.pts) || 0
            : 0;

        const columns = [
            {
                label: "Pos",
                key: "pos",
                getValue: (c) => parseInt(c.pos, 10),
                style: { textAlign: "left" },
            },
            {
                label: "Team",
                key: "teamName",
                style: { textAlign: "left" },
            },
            {
                label: "Points",
                key: "pts",
                getValue: (c) => parseFloat(c.pts),
                style: { textAlign: "center" },
                defaultDir: "desc",
            },
            {
                label: "Gap",
                key: "gap",
                getValue: (c) => (parseFloat(c.pts) || 0) - leaderPts,
                style: { textAlign: "center" },
                defaultDir: "desc",
            },
        ];

        const table = this.createSortableTable({
            columns,
            data: this.data.constructors,
            defaultSortIndex: 0,
            defaultSortDir: "asc",
            rowRenderer: (c) => {
                const status = this.getConstructorChampionshipStatus(c);
                const constructorPts = parseFloat(c.pts) || 0;
                const diff = constructorPts - leaderPts;
                const gapText = diff === 0 ? "-" : diff;

                return this.el(
                    "tr",
                    { className: this.getChampionshipRowClass(status) },
                    this.el(
                        "td",
                        {
                            className: "standings-pos",
                            style: { textAlign: "left" },
                        },
                        this.el("strong", { textContent: c.pos }),
                    ),
                    this.el(
                        "td",
                        { className: "standings-team" },
                        this.el(
                            "div",
                            { className: "driver-cell-container" },
                            c.teamLogo
                                ? this.el("img", {
                                      src: c.teamLogo,
                                      className:
                                          [
                                              "Aston Martin",
                                              "Cadillac",
                                              "Haas F1 Team",
                                          ].includes(c.teamName) &&
                                          !this.isLight
                                              ? "standings-team-logo invert-in-dark"
                                              : "standings-team-logo",
                                      alt: c.teamName,
                                  })
                                : null,
                            this.el(
                                "span",
                                { className: "desktop-name" },
                                c.teamName,
                            ),
                            this.el(
                                "span",
                                { className: "mobile-code" },
                                c.teamName.substring(0, 3).toUpperCase(),
                            ),
                            this.createChampionshipStatus(status),
                        ),
                    ),
                    this.el(
                        "td",
                        {
                            className: "standings-points",
                            style: { textAlign: "center" },
                        },
                        this.el("strong", { textContent: c.pts }),
                    ),
                    this.el(
                        "td",
                        {
                            className: "standings-gap",
                            style: { textAlign: "center" },
                        },
                        this.el("span", { textContent: gapText }),
                    ),
                );
            },
        });

        if (table) {
            table.className = "standings-table table table-sm table-hover";

            if (!this.isLight) {
                table.classList.add("table-dark");
            }
            table.style.width = "100%";
            table.style.tableLayout = "fixed";
            table.style.fontSize = "0.85rem";

            const colgroup = document.createElement("colgroup");

            const colPos = document.createElement("col");
            colPos.style.width = "15%";

            const colTeam = document.createElement("col");
            colTeam.style.width = "45%";

            const colPoints = document.createElement("col");
            colPoints.style.width = "20%";

            const colGap = document.createElement("col");
            colGap.style.width = "20%";

            colgroup.appendChild(colPos);
            colgroup.appendChild(colTeam);
            colgroup.appendChild(colPoints);
            colgroup.appendChild(colGap);

            table.insertBefore(colgroup, table.firstChild);
        }

        this.contentWrapper.appendChild(
            this.el(
                "div",
                { className: "table-responsive standings-table-wrap" },
                table,
            ),
        );
    }

    renderConstructorsRaceTable() {
        const gps = this.getAllGrandsPrix();
        const table = this.el("table", {
            className: "timing-table",
            style: { width: "100%" },
        });

        const headerRow = this.el(
            "tr",
            {},
            this.el("th", {
                textContent: "Pos",
                style: { width: "60px", textAlign: "center" },
            }),
            this.el("th", { textContent: "Team" }),
            this.el("th", {
                textContent: "Total",
                style: { textAlign: "right", width: "90px" },
            }),
            ...gps.map((gp) =>
                this.el("th", {
                    textContent: gp,
                    style: { textAlign: "center" },
                }),
            ),
        );
        const thead = this.el("thead", {}, headerRow);
        const tbody = this.el("tbody");

        this.data.constructors.forEach((c) => {
            const tr = this.el(
                "tr",
                {},
                this.el(
                    "td",
                    { style: { textAlign: "center" } },
                    this.el("strong", { textContent: c.pos }),
                ),
                this.el(
                    "td",
                    {},
                    this.el(
                        "div",
                        { className: "driver-cell-container" },
                        c.teamLogo
                            ? this.el("img", {
                                  src: c.teamLogo,
                                  className:
                                      [
                                          "Aston Martin",
                                          "Cadillac",
                                          "Haas F1 Team",
                                      ].includes(c.teamName) && !this.isLight
                                          ? "standings-team-logo invert-in-dark"
                                          : "standings-team-logo",
                                  alt: c.teamName,
                              })
                            : null,
                        this.el(
                            "span",
                            { className: "desktop-name" },
                            c.teamName,
                        ),
                        this.el(
                            "span",
                            { className: "mobile-code" },
                            c.teamName.substring(0, 3).toUpperCase(),
                        ),
                    ),
                ),
                this.el(
                    "td",
                    { style: { textAlign: "right" } },
                    this.el("strong", { textContent: c.pts }),
                ),
            );

            gps.forEach((gp) => {
                let gpPts = 0;
                let hasData = false;
                this.data.drivers.forEach((d) => {
                    if (d.raceResults) {
                        const res = d.raceResults.find(
                            (r) => r.grandPrix === gp,
                        );
                        if (res && res.car === c.teamName) {
                            hasData = true;
                            gpPts += parseFloat(res.pts) || 0;
                        }
                    }
                });

                const tdRace = this.el("td", {
                    style: { textAlign: "center" },
                });
                if (hasData) {
                    tdRace.textContent = gpPts;
                } else {
                    tdRace.textContent = "-";
                    tdRace.style.color = "#8b949e";
                }
                tr.appendChild(tdRace);
            });

            tbody.appendChild(tr);
        });

        table.appendChild(thead);
        table.appendChild(tbody);
        const tableWrapper = this.el(
            "div",
            { className: "standings-table-wrap" },
            table,
        );
        tableWrapper.style.overflowX = "auto";
        tableWrapper.style.width = "100%";

        this.contentWrapper.appendChild(tableWrapper);
    }

    renderFormStatusView() {
        const filterNav = this.el(
            "div",
            { className: "standings-sub-nav" },
            this.el("button", {
                className: `standings-nav-btn ${this.formSpan === 5 ? "active" : ""}`,
                textContent: "Last 5 GPs",
                onClick: () => {
                    this.formSpan = 5;
                    this.render();
                },
            }),
            this.el("button", {
                className: `standings-nav-btn ${this.formSpan === 10 ? "active" : ""}`,
                textContent: "Last 10 GPs",
                onClick: () => {
                    this.formSpan = 10;
                    this.render();
                },
            }),
            this.el("button", {
                className: `standings-nav-btn ${this.formSpan === "all" ? "active" : ""}`,
                textContent: "All GPs",
                onClick: () => {
                    this.formSpan = "all";
                    this.render();
                },
            }),
        );

        const gps = this.getAllGrandsPrix();
        const selectedGps =
            this.formSpan === "all"
                ? gps
                : gps.slice(-Math.min(this.formSpan, gps.length));
        const count = selectedGps.length;

        const driverStats = this.data.drivers.map((d) => {
            let pts = 0;
            selectedGps.forEach((gp) => {
                const res = d.raceResults?.find((r) => r.grandPrix === gp);
                if (res) pts += parseFloat(res.pts) || 0;
            });
            const avg = count ? (pts / count).toFixed(2) : "0.00";
            return { driver: d, totalPts: pts, avgPts: parseFloat(avg) };
        });
        driverStats.sort((a, b) => b.avgPts - a.avgPts);
        const top5Drivers = driverStats.slice(0, 5);

        const teamStats = this.data.constructors.map((c) => {
            let pts = 0;
            selectedGps.forEach((gp) => {
                this.data.drivers.forEach((d) => {
                    const res = d.raceResults?.find((r) => r.grandPrix === gp);
                    if (res && res.car === c.teamName)
                        pts += parseFloat(res.pts) || 0;
                });
            });
            const avg = count ? (pts / count).toFixed(2) : "0.00";
            return {
                teamName: c.teamName,
                totalPts: pts,
                avgPts: parseFloat(avg),
                color: this.getTeamColor(c.teamName),
            };
        });
        teamStats.sort((a, b) => b.avgPts - a.avgPts);
        const top5Teams = teamStats.slice(0, 5);

        const chartsGrid = this.el("div", { className: "charts-grid" });
        const driverCanvas = this.el("canvas");
        const teamCanvas = this.el("canvas");

        chartsGrid.appendChild(this.createChartBox(driverCanvas));
        chartsGrid.appendChild(this.createChartBox(teamCanvas));

        const infoLabel = this.el("div", {
            style: { marginBottom: "15px", opacity: "0.8", fontSize: "0.9em" },
            textContent: `Form status analysis based on ${count} Grands Prix (${selectedGps.join(", ")})`,
        });

        this.contentWrapper.appendChild(filterNav);
        this.contentWrapper.appendChild(infoLabel);
        this.contentWrapper.appendChild(chartsGrid);

        this.charts.push(
            new Chart(driverCanvas, {
                type: "bar",
                data: {
                    labels: top5Drivers.map(
                        (d) => d.driver.driverCode || d.driver.driverName,
                    ),
                    datasets: [
                        {
                            label: `Avg Points/Race (Last ${count} GPs)`,
                            data: top5Drivers.map((d) => d.avgPts),
                            backgroundColor: top5Drivers.map((d) =>
                                this.getTeamColor(d.driver.car),
                            ),
                        },
                    ],
                },
                options: this.getChartOptions(`Top 5 Drivers by Avg Points`),
            }),
        );

        this.charts.push(
            new Chart(teamCanvas, {
                type: "bar",
                data: {
                    labels: top5Teams.map((t) => t.teamName),
                    datasets: [
                        {
                            label: `Avg Points/Race (Last ${count} GPs)`,
                            data: top5Teams.map((t) => t.avgPts),
                            backgroundColor: top5Teams.map((t) => t.color),
                        },
                    ],
                },
                options: this.getChartOptions(
                    `Top 5 Constructors by Avg Points`,
                ),
            }),
        );
    }

    renderTopDriversChart() {
        const gps = this.getAllGrandsPrix();
        if (!gps.length || !this.data.drivers.length) return;

        const chartCanvas = this.el("canvas");
        const box = this.createChartBox(chartCanvas);
        this.contentWrapper.appendChild(box);

        const topDrivers = this.data.drivers.slice(0, 5);
        const teamCounts = {};

        const datasets = topDrivers.map((d) => {
            let cumulative = 0;
            const pointsData = gps.map((gp) => {
                const res = d.raceResults
                    ? d.raceResults.find((r) => r.grandPrix === gp)
                    : null;
                if (res) cumulative += parseFloat(res.pts) || 0;
                return cumulative;
            });

            const team = d.car;
            teamCounts[team] = (teamCounts[team] || 0) + 1;
            const baseColor = this.getTeamColor(team);
            const isSecondDriver = teamCounts[team] > 1;

            return {
                label: d.driverCode || d.driverName,
                data: pointsData,
                borderColor: baseColor,
                backgroundColor: baseColor,
                borderDash: isSecondDriver ? [5, 5] : [],
                tension: 0.2,
                fill: false,
            };
        });

        this.charts.push(
            new Chart(chartCanvas, {
                type: "line",
                data: { labels: gps, datasets },
                options: this.getChartOptions(
                    "Points Progression (Top 5 Drivers)",
                ),
            }),
        );
    }

    renderTopConstructorsChart() {
        const gps = this.getAllGrandsPrix();
        if (!gps.length || !this.data.constructors.length) return;

        const chartCanvas = this.el("canvas");
        const box = this.createChartBox(chartCanvas);
        this.contentWrapper.appendChild(box);

        const topConstructors = this.data.constructors.slice(0, 5);

        const datasets = topConstructors.map((c) => {
            let cumulative = 0;
            const pointsData = gps.map((gp) => {
                let gpSum = 0;
                this.data.drivers.forEach((d) => {
                    if (d.raceResults) {
                        const res = d.raceResults.find(
                            (r) => r.grandPrix === gp,
                        );
                        if (res && res.car === c.teamName) {
                            gpSum += parseFloat(res.pts) || 0;
                        }
                    }
                });
                cumulative += gpSum;
                return cumulative;
            });

            const color = this.getTeamColor(c.teamName);

            return {
                label: c.teamName,
                data: pointsData,
                borderColor: color,
                backgroundColor: color,
                tension: 0.2,
                fill: false,
            };
        });

        this.charts.push(
            new Chart(chartCanvas, {
                type: "line",
                data: { labels: gps, datasets },
                options: this.getChartOptions(
                    "Points Progression (Top 5 Constructors)",
                ),
            }),
        );
    }

    calculateDriverStats(driver) {
        const stats = {
            championshipPosition: 0,
            wins: 0,
            podiums: 0,
            top5: 0,
            top10: 0,
            dnfs: 0,
            points: parseFloat(driver.pts) || 0,
            races: 0,
            finished: 0,
            posSum: 0,
            bestPos: 22,
            ptsFinishes: 0,
            zeroPtsFinishes: 0,
            history: [],
            ptsHistory: [],
            singlePtsHistory: [],
            posArray: [],
            championshipPositionHistory: [],
            cars: new Set(),
            maxPtsStreak: 0,
            maxPodiumStreak: 0,
        };

        let cum = 0;
        let currentPtsStreak = 0;
        let currentPodiumStreak = 0;

        this.getAllGrandsPrix().forEach((gp) => {
            const res = driver.raceResults?.find((r) => r.grandPrix === gp);
            if (res) {
                stats.races++;
                stats.cars.add(res.car);
                const p = parseFloat(res.pts) || 0;
                cum += p;
                stats.ptsHistory.push(cum);
                stats.singlePtsHistory.push(p);

                if (p > 0) {
                    currentPtsStreak++;
                    if (currentPtsStreak > stats.maxPtsStreak)
                        stats.maxPtsStreak = currentPtsStreak;
                } else {
                    currentPtsStreak = 0;
                }

                const posNum = parseInt(res.pos, 10);
                if (isNaN(posNum)) {
                    stats.dnfs++;
                    stats.history.push("DNF");
                    stats.posArray.push(null);
                    currentPodiumStreak = 0;
                } else {
                    stats.finished++;
                    stats.posSum += posNum;
                    stats.history.push(posNum);
                    stats.posArray.push(posNum);
                    if (posNum === 1) stats.wins++;
                    if (posNum <= 3) {
                        stats.podiums++;
                        currentPodiumStreak++;
                        if (currentPodiumStreak > stats.maxPodiumStreak)
                            stats.maxPodiumStreak = currentPodiumStreak;
                    } else {
                        currentPodiumStreak = 0;
                    }
                    if (posNum <= 5) stats.top5++;
                    if (posNum <= 10) stats.top10++;
                    if (posNum < stats.bestPos) stats.bestPos = posNum;
                    if (p > 0) stats.ptsFinishes++;
                    if (p === 0) stats.zeroPtsFinishes++;
                }
            } else {
                stats.history.push("-");
                stats.ptsHistory.push(cum);
                stats.singlePtsHistory.push(0);
                stats.posArray.push(null);
                currentPtsStreak = 0;
                currentPodiumStreak = 0;
            }
        });

        const gps = this.getAllGrandsPrix();
        if (this.data && this.data.drivers) {
            gps.forEach((gp, gpIndex) => {
                const driverStandingsAtRound = this.data.drivers.map((d) => {
                    let cumulativePts = 0;
                    for (let i = 0; i <= gpIndex; i++) {
                        const roundRes = d.raceResults?.find(
                            (r) => r.grandPrix === gps[i],
                        );
                        if (roundRes) {
                            cumulativePts += parseFloat(roundRes.pts) || 0;
                        }
                    }
                    return { name: d.driverName, pts: cumulativePts };
                });

                driverStandingsAtRound.sort((a, b) => b.pts - a.pts);

                const rankIndex = driverStandingsAtRound.findIndex(
                    (d) => d.name === driver.driverName,
                );
                stats.championshipPositionHistory.push(
                    rankIndex !== -1 ? rankIndex + 1 : null,
                );
            });

            const sortedDrivers = [...this.data.drivers].sort((a, b) => {
                return (parseFloat(b.pts) || 0) - (parseFloat(a.pts) || 0);
            });
            const index = sortedDrivers.findIndex(
                (d) => d.driverName === driver.driverName,
            );
            stats.championshipPosition =
                index !== -1 ? index + 1 : driver.pos || 0;
        } else {
            stats.championshipPosition = driver.pos || 0;
            stats.championshipPositionHistory = gps.map(() => null);
        }

        const championship = this.getChampionshipInfo();
        stats.finishRate = stats.races
            ? ((stats.finished / stats.races) * 100).toFixed(1) + "%"
            : "0%";
        stats.avgPos = stats.finished
            ? (stats.posSum / stats.finished).toFixed(2)
            : "-";
        stats.best = stats.bestPos !== 999 ? stats.bestPos : "-";
        stats.ptsPerRace = stats.races
            ? (stats.points / stats.races).toFixed(2)
            : "0";
        stats.ptsPerFinish = stats.finished
            ? (stats.points / stats.finished).toFixed(2)
            : "0";
        stats.completedMaxPoints = championship.completedDriverMax;
        stats.maxSeasonPoints =
            championship.completedDriverMax + championship.remainingDriverMax;
        stats.maxRemainingPoints = championship.remainingDriverMax;
        stats.maxPointsPct = stats.completedMaxPoints
            ? ((stats.points / stats.completedMaxPoints) * 100).toFixed(1) + "%"
            : "0%";
        stats.championshipStatus = this.getDriverChampionshipStatus(driver);

        return stats;
    }

    renderDriverDashboard() {
        const select = this.el("select", { className: "selector-dropdown" });
        this.data.drivers.forEach((d, i) => {
            const opt = this.el("option", {
                value: i,
                textContent: d.driverName,
            });
            if (i === this.selectedDriverIndex) opt.selected = true;
            select.appendChild(opt);
        });

        const updateDash = () => {
            this.selectedDriverIndex = parseInt(select.value, 10);
            const driver = this.data.drivers[this.selectedDriverIndex];
            const stats = this.calculateDriverStats(driver);

            const togglePointsChart = this.el(
                "div",
                { className: "standings-sub-nav" },
                this.el("button", {
                    className: `standings-nav-btn ${this.driverPointChartMode === "cumulative" ? "active" : ""}`,
                    textContent: "Cumulative Points",
                    onClick: () => {
                        this.driverPointChartMode = "cumulative";
                        updateDash();
                    },
                }),
                this.el("button", {
                    className: `standings-nav-btn ${this.driverPointChartMode === "single" ? "active" : ""}`,
                    textContent: "Points Per Round",
                    onClick: () => {
                        this.driverPointChartMode = "single";
                        updateDash();
                    },
                }),
            );

            const grid = this.el(
                "div",
                { className: "stats-grid" },
                this.createStatCard("Total Points", stats.points),
                this.createStatCard(
                    "Championship Position",
                    stats.championshipPosition === 1
                        ? "1st"
                        : stats.championshipPosition === 2
                          ? "2nd"
                          : stats.championshipPosition === 3
                            ? "3rd"
                            : stats.championshipPosition + "th",
                ),
                this.createStatCard("Wins", stats.wins),
                this.createStatCard("Podiums", stats.podiums),
                this.createStatCard("Top 5s", stats.top5),
                this.createStatCard("Top 10s", stats.top10),
                this.createStatCard("Avg Finish", stats.avgPos),
                this.createStatCard("Best Finish", stats.best == 1 ? "1st" : stats.best == 2 ? "2nd" : stats.best == 3 ? "3rd" : isNaN(stats.best) ? stats.best : stats.best + "th"),
                this.createStatCard("DNFs", stats.dnfs),
                this.createStatCard("Finish %", stats.finishRate),
                this.createStatCard("Pts / Race", stats.ptsPerRace),
                this.createStatCard("Pts / Finish", stats.ptsPerFinish),
                this.createStatCard("Pts Streak", stats.maxPtsStreak),
                this.createStatCard("Podium Streak", stats.maxPodiumStreak),
                this.createStatCard("Races", stats.races),
            );

            const chartsGrid = this.el("div", { className: "charts-grid" });
            const lineCanvas = this.el("canvas");
            const barCanvas = this.el("canvas");
            const positionCanvas = this.el("canvas");

            chartsGrid.appendChild(this.createChartBox(lineCanvas));
            chartsGrid.appendChild(this.createChartBox(barCanvas));
            chartsGrid.appendChild(this.createChartBox(positionCanvas));

            const box = this.el("div", {
                className: "stat-card",
                style: { marginTop: "20px", textAlign: "left" },
            });
            const title = this.el("div", {
                className: "stat-value",
                style: {
                    fontSize: "1.2em",
                    marginBottom: "15px",
                    textAlign: "left",
                },
                textContent: `${driver.driverName} Race Results`,
            });

            box.appendChild(title);
            const heatmap = this.createHeatmap([driver]);
            box.appendChild(heatmap);

            const dashContainer = this.el(
                "div",
                { id: "driver-dash-content" },
                togglePointsChart,
                grid,
                chartsGrid,
                box,
            );

            const existing = document.getElementById("driver-dash-content");
            if (existing) existing.replaceWith(dashContainer);
            else this.contentWrapper.appendChild(dashContainer);

            this.destroyCharts();

            const gps = this.getAllGrandsPrix();
            const color = this.getTeamColor(
                Array.from(stats.cars)[0] || driver.car,
            );

            const avgVal = parseFloat(stats.ptsPerRace);

            if (this.driverPointChartMode === "cumulative") {
                const cumAvgLineData = gps.map((_, idx) => (idx + 1) * avgVal);

                this.charts.push(
                    new Chart(lineCanvas, {
                        type: "line",
                        data: {
                            labels: gps,
                            datasets: [
                                {
                                    label: "Cumulative Points",
                                    data: stats.ptsHistory,
                                    borderColor: color,
                                    backgroundColor: color,
                                    tension: 0.2,
                                    fill: false,
                                },
                                {
                                    label: `Avg Trajectory (${avgVal}/race)`,
                                    data: cumAvgLineData,
                                    borderColor: "#ED1131",
                                    borderWidth: 2,
                                    borderDash: [5, 5],
                                    pointRadius: 0,
                                    fill: false,
                                },
                            ],
                        },
                        options: this.getChartOptions(
                            "Cumulative Points Progression",
                        ),
                    }),
                );
            } else {
                const avgLineData = gps.map(() => avgVal);

                this.charts.push(
                    new Chart(lineCanvas, {
                        type: "bar",
                        data: {
                            labels: gps,
                            datasets: [
                                {
                                    type: "bar",
                                    label: "Points Scored",
                                    data: stats.singlePtsHistory,
                                    backgroundColor: color,
                                },
                                {
                                    type: "line",
                                    label: `Avg Pts/Race (${avgVal})`,
                                    data: avgLineData,
                                    borderColor: "#ED1131",
                                    borderWidth: 2,
                                    borderDash: [5, 5],
                                    pointRadius: 0,
                                    fill: false,
                                },
                            ],
                        },
                        options: this.getChartOptions(
                            "Points Per Round & Average",
                        ),
                    }),
                );
            }

            const posCounts = Array(22).fill(0);
            let dnfCount = 0;

            if (stats.history && Array.isArray(stats.history)) {
                stats.history.forEach((p) => {
                    if (typeof p === "number") {
                        if (p >= 1 && p <= 22) {
                            posCounts[p - 1]++;
                        }
                    } else if (p === "DNF" || p === null || p === undefined) {
                        dnfCount++;
                    }
                });
            } else {
                dnfCount = stats.dnfs || 0;
            }

            const barLabels = [
                "1st",
                "2nd",
                "3rd",
                "4th",
                "5th",
                "6th",
                "7th",
                "8th",
                "9th",
                "10th",
                "11th",
                "12th",
                "13th",
                "14th",
                "15th",
                "16th",
                "17th",
                "18th",
                "19th",
                "20th",
                "21st",
                "22nd",
                "DNF",
            ];
            const barData = [...posCounts, dnfCount];

            const avgPosNum = parseFloat(stats.avgPos);

            const posChartOpts = this.getChartOptions(
                `Position Distribution (Avg Finish: ${stats.avgPos})`,
            );
            posChartOpts.scales.y.ticks.precision = 0;
            posChartOpts.scales.y.ticks.stepSize = 1;

            const avgPosLinePlugin = {
                id: "avgPosLine",
                afterDraw: (chart) => {
                    if (isNaN(avgPosNum) || avgPosNum <= 0) return;

                    const xAxis = chart.scales.x;
                    const yAxis = chart.scales.y;
                    if (!xAxis || !yAxis) return;

                    let targetIdx = avgPosNum - 1;
                    if (targetIdx > 21) targetIdx = 21;

                    const lowIdx = Math.floor(targetIdx);
                    const highIdx = Math.ceil(targetIdx);
                    const frac = targetIdx - lowIdx;

                    const p1 = xAxis.getPixelForValue(
                        Math.min(Math.max(lowIdx, 0), 21),
                    );
                    const p2 = xAxis.getPixelForValue(
                        Math.min(Math.max(highIdx, 0), 21),
                    );
                    const xPixel = p1 + (p2 - p1) * frac;

                    const ctx = chart.ctx;
                    ctx.save();

                    ctx.beginPath();
                    ctx.setLineDash([5, 5]);
                    ctx.strokeStyle = "#ED1131";
                    ctx.lineWidth = 2;
                    ctx.moveTo(xPixel, yAxis.top);
                    ctx.lineTo(xPixel, yAxis.bottom);
                    ctx.stroke();

                    ctx.fillStyle = "#ED1131";
                    ctx.font = "bold 11px sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText(`Avg: ${avgPosNum}`, xPixel, yAxis.top - 6);

                    ctx.restore();
                },
            };

            this.charts.push(
                new Chart(barCanvas, {
                    type: "bar",
                    data: {
                        labels: barLabels,
                        datasets: [
                            {
                                label: "Finish Positions",
                                data: barData,
                                backgroundColor: color,
                            },
                        ],
                    },
                    options: posChartOpts,
                    plugins: [avgPosLinePlugin],
                }),
            );

            const championshipPosHistory =
                stats.championshipPositionHistory || gps.map(() => null);

            const positionChartOpts = this.getChartOptions(
                "Championship Position Progression",
            );
            positionChartOpts.scales.y = {
                ...positionChartOpts.scales.y,
                reverse: true,
                ticks: {
                    precision: 0,
                    stepSize: 1,
                },
            };

            this.charts.push(
                new Chart(positionCanvas, {
                    type: "line",
                    data: {
                        labels: gps,
                        datasets: [
                            {
                                label: "Championship Position",
                                data: championshipPosHistory,
                                borderColor: color,
                                backgroundColor: color,
                                tension: 0.2,
                                fill: false,
                            },
                        ],
                    },
                    options: positionChartOpts,
                }),
            );
        };

        select.addEventListener("change", updateDash);
        this.contentWrapper.appendChild(
            this.el(
                "div",
                { className: "selector-container" },
                this.el("span", { textContent: "Select Driver:" }),
                select,
            ),
        );
        updateDash();
    }

    calculateTeamStats(teamName) {
        const stats = {
            championshipPosition: 0,
            wins: 0,
            podiums: 0,
            top5: 0,
            top10: 0,
            dnfs: 0,
            points: 0,
            races: 0,
            ptsHistory: [],
            singlePtsHistory: [],
            championshipPositionHistory: [],
            drivers: {},
            totalPosSum: 0,
            totalFinishes: 0,
            best: Infinity,
        };
        const gps = this.getAllGrandsPrix();
        let cum = 0;

        gps.forEach((gp) => {
            let gpPoints = 0;
            let participated = false;
            this.data.drivers.forEach((d) => {
                if (d.raceResults) {
                    const res = d.raceResults.find((r) => r.grandPrix === gp);
                    if (res && res.car === teamName) {
                        participated = true;
                        const p = parseFloat(res.pts) || 0;
                        gpPoints += p;
                        stats.points += p;
                        stats.drivers[d.driverName] =
                            (stats.drivers[d.driverName] || 0) + p;

                        const posNum = parseInt(res.pos, 10);
                        if (isNaN(posNum)) {
                            stats.dnfs++;
                        } else {
                            stats.totalFinishes++;
                            stats.totalPosSum += posNum;
                            if (posNum < stats.best) stats.best = posNum;
                            if (posNum === 1) stats.wins++;
                            if (posNum <= 3) stats.podiums++;
                            if (posNum <= 5) stats.top5++;
                            if (posNum <= 10) stats.top10++;
                        }
                    }
                }
            });
            if (participated) stats.races++;
            cum += gpPoints;
            stats.ptsHistory.push(cum);
            stats.singlePtsHistory.push(gpPoints);
        });

        if (this.data && this.data.constructors) {
            gps.forEach((gp, gpIndex) => {
                const constructorStandingsAtRound = this.data.constructors.map(
                    (c) => {
                        let cumulativePts = 0;
                        for (let i = 0; i <= gpIndex; i++) {
                            let roundPts = 0;
                            this.data.drivers.forEach((d) => {
                                if (d.raceResults) {
                                    const roundRes = d.raceResults.find(
                                        (r) => r.grandPrix === gps[i],
                                    );
                                    if (
                                        roundRes &&
                                        roundRes.car === c.teamName
                                    ) {
                                        roundPts +=
                                            parseFloat(roundRes.pts) || 0;
                                    }
                                }
                            });
                            cumulativePts += roundPts;
                        }
                        return { name: c.teamName, pts: cumulativePts };
                    },
                );

                constructorStandingsAtRound.sort((a, b) => b.pts - a.pts);

                const rankIndex = constructorStandingsAtRound.findIndex(
                    (c) => c.name === teamName,
                );
                stats.championshipPositionHistory.push(
                    rankIndex !== -1 ? rankIndex + 1 : null,
                );
            });
        } else {
            stats.championshipPositionHistory = gps.map(() => null);
        }

        stats.best = stats.best === Infinity
            ? "-"
            : (stats.best === 1 ? "1st" : stats.best === 2 ? "2nd" : stats.best === 3 ? "3rd" : isNaN(stats.best) ? "-" : stats.best + "th");

        stats.ptsPerRace = stats.races
            ? (stats.points / stats.races).toFixed(2)
            : "0";
        stats.avgFinish = stats.totalFinishes
            ? (stats.totalPosSum / stats.totalFinishes).toFixed(2)
            : "-";


        const championship = this.getChampionshipInfo();
        const constructor = this.data.constructors.find(
            (c) => c.teamName === teamName,
        );
        if (constructor) {
            if (!isNaN(parseFloat(constructor.pts)))
                stats.points = parseFloat(constructor.pts);

            if (this.data.constructors) {
                const sortedConstructors = [...this.data.constructors].sort(
                    (a, b) => {
                        return (
                            (parseFloat(b.pts) || 0) - (parseFloat(a.pts) || 0)
                        );
                    },
                );
                const index = sortedConstructors.findIndex(
                    (c) => c.teamName === teamName,
                );
                stats.championshipPosition =
                    index !== -1 ? index + 1 : constructor.pos || 0;
            } else {
                stats.championshipPosition = constructor.pos || 0;
            }
        }

        stats.completedMaxPoints = championship.completedConstructorMax;
        stats.maxSeasonPoints =
            championship.completedConstructorMax +
            championship.remainingConstructorMax;
        stats.maxRemainingPoints = championship.remainingConstructorMax;
        stats.maxPointsPct = stats.completedMaxPoints
            ? ((stats.points / stats.completedMaxPoints) * 100).toFixed(1) + "%"
            : "0%";
        stats.championshipStatus = this.getConstructorChampionshipStatus(
            this.data.constructors.find((c) => c.teamName === teamName) || {
                teamName,
                pts: stats.points,
            },
        );

        return stats;
    }

    createTeammateComparison(teamDrivers, teamName) {
        const container = this.el("div");

        if (!teamDrivers || teamDrivers.length === 0) {
            container.appendChild(
                this.el("div", {
                    textContent: "No drivers available for this team.",
                    style: { color: this.textColor, padding: "10px" },
                }),
            );
            return container;
        }

        const gps = this.getAllGrandsPrix();

        const getTeamFilteredStats = (driverObj) => {
            const rawStats = this.calculateDriverStats(driverObj);
            const results = driverObj.raceResults || driverObj.results || [];

            if (
                results.length === 0 &&
                !driverObj.history &&
                !driverObj.posArray
            ) {
                return rawStats;
            }

            const filteredHistory = [];
            const filteredSinglePts = [];
            const filteredPosArray = [];
            let runningPts = 0;
            let pointsSum = 0;
            let wins = 0;
            let podiums = 0;
            let top5 = 0;
            let top10 = 0;
            let bestPos = 999;
            let dnfs = 0;
            let finishedCount = 0;
            let posSum = 0;
            let races = 0;
            const ptsHistory = [];
            const singlePtsHistory = [];

            gps.forEach((gp, idx) => {
                const res = results.find(
                    (r) =>
                        r.grandPrix === gp ||
                        r.round === idx + 1 ||
                        r.gp === gp,
                );
                const teamForGp = res
                    ? res.team || res.constructorName || res.car
                    : null;
                const isThisTeam = teamForGp
                    ? teamForGp.toLowerCase() === teamName.toLowerCase()
                    : true;

                if (isThisTeam && res) {
                    const pos =
                        res.position !== undefined
                            ? res.position
                            : rawStats.posArray
                              ? rawStats.posArray[idx]
                              : null;
                    const pts =
                        res.points !== undefined
                            ? Number(res.points)
                            : rawStats.singlePtsHistory
                              ? rawStats.singlePtsHistory[idx]
                              : 0;

                    filteredPosArray.push(pos);
                    filteredHistory.push(
                        pos === null || pos === undefined ? "DNF" : pos,
                    );
                    singlePtsHistory.push(pts);
                    runningPts += pts;
                    ptsHistory.push(runningPts);

                    pointsSum += pts;
                    if (pos === 1) wins++;
                    if (pos >= 1 && pos <= 3) podiums++;
                    if (pos >= 1 && pos <= 5) top5++;
                    if (pos >= 1 && pos <= 10) top10++;

                    if(pos > 0 && pos < bestPos) bestPos = pos;
                    races++;

                    if (
                        pos === null ||
                        pos === undefined ||
                        pos === "DNF" ||
                        pos === "Ret"
                    ) {
                        dnfs++;
                    } else {
                        finishedCount++;
                        posSum += Number(pos);
                    }
                } else {
                    filteredPosArray.push(null);
                    filteredHistory.push(null);
                    singlePtsHistory.push(0);
                    ptsHistory.push(runningPts);
                }
            });

            const validRacesCount = finishedCount;
            const avgPos =
                validRacesCount > 0
                    ? (posSum / validRacesCount).toFixed(2)
                    : "N/A";
            const racesCount = filteredPosArray.filter(
                (p) => p !== null,
            ).length;
            const ptsPerRace =
                racesCount > 0 ? (pointsSum / racesCount).toFixed(2) : "0.00";

            return {
                ...rawStats,
                points: pointsSum,
                wins,
                podiums,
                top5,
                top10,
                best: bestPos !== 999 ? bestPos : "DNF",
                dnfs,
                races: racesCount,
                avgPos,
                ptsPerRace,
                ptsHistory,
                races,
                singlePtsHistory,
                posArray: filteredPosArray,
                history: filteredHistory,
            };
        };

        const driverStatsList = teamDrivers
            .map((d) => {
                const name =
                    typeof d === "object" && d !== null
                        ? d.driverName || d.name || String(d)
                        : String(d);
                return {
                    driver: d,
                    name: name,
                    stats: getTeamFilteredStats(d),
                };
            })
            .sort((a, b) => (b.stats.points || 0) - (a.stats.points || 0));

        const namesString = driverStatsList.map((d) => d.name).join(" vs ");
        const titleText =
            driverStatsList.length > 1
                ? `Team Drivers Comparison (${teamName}): ${namesString}`
                : `Team Driver Overview (${teamName}): ${namesString}`;

        const title = this.el("div", {
            className: "section-title",
            style: { fontSize: "1.1rem", marginBottom: "15px" },
            textContent: titleText,
        });
        container.appendChild(title);

        const grid = this.el("div", {
            style: { marginBottom: "20px", overflowX: "auto" },
        });

        const createStatRow = (label, getValueFn, lowerIsBetter = false) => {
            const rowEl = this.el("div", {
                className: "compare-grid",
                style: {
                    display: "grid",
                    gridTemplateColumns: `150px repeat(${driverStatsList.length}, 1fr)`,
                    gap: "10px",
                    alignItems: "center",
                    marginBottom: "8px",
                },
            });

            rowEl.appendChild(
                this.el("div", {
                    className: "compare-label",
                    textContent: label,
                    style: { fontWeight: "bold" },
                }),
            );

            const values = driverStatsList.map((item) =>
                getValueFn(item.stats, item.driver),
            );
            const numericValues = values
                .map((v) => parseFloat(v))
                .filter((v) => !isNaN(v));
            let bestVal = null;
            if (numericValues.length > 0) {
                bestVal = lowerIsBetter
                    ? Math.min(...numericValues)
                    : Math.max(...numericValues);
            }

            driverStatsList.forEach((item, idx) => {
                const val = values[idx];
                const num = parseFloat(val);
                let color = this.textColor;

                if (
                    bestVal !== null &&
                    !isNaN(num) &&
                    num === bestVal &&
                    numericValues.filter((v) => v === bestVal).length === 1
                ) {
                    color = "#00E676";
                } else if (
                    numericValues.length > 1 &&
                    !isNaN(num) &&
                    num !== bestVal
                ) {
                    color = "#ED1131";
                }

                rowEl.appendChild(
                    this.el("div", {
                        className: "compare-val",
                        style: { color: color, textAlign: "center" },
                        textContent: val,
                    }),
                );
            });

            return rowEl;
        };

        grid.appendChild(createStatRow("Total Points", (s) => s.points));
        grid.appendChild(
            createStatRow(
                "Championship Position",
                (s) =>
                    s.championshipPosition === 1
                        ? "1st"
                        : s.championshipPosition === 2
                          ? "2nd"
                          : s.championshipPosition === 3
                            ? "3rd"
                            : s.championshipPosition + "th",
                true,
            ),
        );
        grid.appendChild(createStatRow("Wins", (s) => s.wins));
        grid.appendChild(createStatRow("Podiums", (s) => s.podiums));
        grid.appendChild(createStatRow("Top 5s", (s) => s.top5));
        grid.appendChild(createStatRow("Top 10s", (s) => s.top10));
        grid.appendChild(createStatRow("Best Finish", (s) => s.best === 1 ? "1st" : s.best === 2 ? "2nd" : s.best === 3 ? "3rd" : isNaN(s.best) ? s.best : s.best + "th", true));
        grid.appendChild(
            createStatRow(
                "Avg Finish Position",
                (s) => s.avgPos || "N/A",
                true,
            ),
        );
        grid.appendChild(createStatRow("DNFs", (s) => s.dnfs, true));
        grid.appendChild(createStatRow("Pts / Race", (s) => s.ptsPerRace));
        grid.appendChild(createStatRow("Pts / Finish", (s) => s.ptsPerFinish));
        grid.appendChild(createStatRow("Races", (s) => s.races));

        container.appendChild(grid);

        let chartMode = "cumulative";

        const navContainer = this.el("div", {
            className: "standings-sub-nav",
            style: { marginBottom: "15px" },
        });

        const btnCumulative = this.el("button", {
            className: `standings-nav-btn ${chartMode === "cumulative" ? "active" : ""}`,
            textContent: "Cumulative Points",
            onClick: () => {
                chartMode = "cumulative";
                updateSubChart();
            },
        });
        navContainer.appendChild(btnCumulative);

        const btnSingle = this.el("button", {
            className: `standings-nav-btn ${chartMode === "single" ? "active" : ""}`,
            textContent: "Points Per Round",
            onClick: () => {
                chartMode = "single";
                updateSubChart();
            },
        });
        navContainer.appendChild(btnSingle);

        let btnGap = null;
        if (driverStatsList.length >= 2) {
            btnGap = this.el("button", {
                className: `standings-nav-btn ${chartMode === "gap" ? "active" : ""}`,
                textContent: "Points Gap (H2H)",
                onClick: () => {
                    chartMode = "gap";
                    updateSubChart();
                },
            });
            navContainer.appendChild(btnGap);
        }

        container.appendChild(navContainer);

        const lineCanvas = this.el("canvas");
        const chartBox = this.createChartBox(lineCanvas);
        container.appendChild(chartBox);

        const getDriverColor = (idx) => {
            let baseColor = this.getTeamColor
                ? this.getTeamColor(teamName)
                : "#00b4d8";
            if (baseColor && baseColor[0] === "#") {
                let num = parseInt(baseColor.slice(1), 16);
                let shift = idx * 60;
                let r = Math.min(255, Math.max(0, (num >> 16) + shift));
                let g = Math.min(
                    255,
                    Math.max(0, ((num >> 8) & 0x0ff) + shift / 2),
                );
                let b = Math.min(255, Math.max(0, (num & 0x0000ff) + shift));
                return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
            }
            const fallbackColors = ["#00b4d8", "#ffb703", "#7209b7", "#4cc9f0"];
            return fallbackColors[idx % fallbackColors.length];
        };

        const updateSubChart = () => {
            btnCumulative.className = `standings-nav-btn ${chartMode === "cumulative" ? "active" : ""}`;
            btnSingle.className = `standings-nav-btn ${chartMode === "single" ? "active" : ""}`;
            if (btnGap) {
                btnGap.className = `standings-nav-btn ${chartMode === "gap" ? "active" : ""}`;
            }

            const prevChart =
                typeof Chart !== "undefined" && Chart.getChart
                    ? Chart.getChart(lineCanvas)
                    : null;
            if (prevChart) prevChart.destroy();

            if (chartMode === "cumulative" || chartMode === "single") {
                const datasets = driverStatsList.map((item, idx) => {
                    const col = getDriverColor(idx);
                    return {
                        label: item.name,
                        data:
                            chartMode === "cumulative"
                                ? item.stats.ptsHistory
                                : item.stats.singlePtsHistory,
                        borderColor: col,
                        backgroundColor: col,
                        tension: 0.2,
                        fill: false,
                        borderDash: idx > 0 ? [5, 5] : [],
                    };
                });

                const chart = new Chart(lineCanvas, {
                    type: chartMode === "cumulative" ? "line" : "bar",
                    data: { labels: gps, datasets },
                    options: this.getChartOptions(
                        chartMode === "cumulative"
                            ? "Driver Points Comparison"
                            : "Driver Points Per Round Comparison",
                    ),
                });
                this.charts.push(chart);
            } else if (chartMode === "gap" && driverStatsList.length >= 2) {
                const st1 = driverStatsList[0].stats;
                const baselineColor = getDriverColor(0);

                const datasets = [
                    {
                        label: `${driverStatsList[0].name} (Baseline)`,
                        data: new Array(gps.length).fill(0),
                        borderColor: baselineColor,
                        backgroundColor: baselineColor,
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false,
                    },
                ];

                for (let i = 1; i < driverStatsList.length; i++) {
                    const stCurr = driverStatsList[i].stats;
                    const gapData = st1.ptsHistory.map((val1, idx) => {
                        const valCurr = stCurr.ptsHistory[idx] || 0;
                        return Number((valCurr - val1).toFixed(2));
                    });
                    const colCurr = getDriverColor(i);

                    datasets.push({
                        label: `${driverStatsList[i].name} vs ${driverStatsList[0].name} (Gap)`,
                        data: gapData,
                        borderColor: colCurr,
                        backgroundColor: colCurr,
                        borderWidth: 2,
                        tension: 0.2,
                        fill: false,
                        borderDash: [5, 5],
                    });
                }

                const backgroundZonesPlugin = {
                    id: "backgroundZonesPlugin",
                    beforeDraw(chart) {
                        const {
                            ctx,
                            chartArea: { top, bottom, left, right },
                            scales: { y },
                        } = chart;
                        const zeroY = y.getPixelForValue(0);

                        ctx.save();
                        ctx.fillStyle = "rgba(237, 17, 49, 0.3)";
                        ctx.fillRect(
                            left,
                            top,
                            right - left,
                            Math.max(0, zeroY - top),
                        );

                        ctx.fillStyle = "rgba(0, 230, 118, 0.3)";
                        ctx.fillRect(
                            left,
                            Math.min(bottom, zeroY),
                            right - left,
                            Math.max(0, bottom - zeroY),
                        );
                        ctx.restore();
                    },
                };

                const chart = new Chart(lineCanvas, {
                    type: "line",
                    data: { labels: gps, datasets },
                    options: {
                        ...this.getChartOptions(
                            `Points Gap relative to ${driverStatsList[0].name}`,
                        ),
                        scales: {
                            ...this.getChartOptions("").scales,
                            y: {
                                ...this.getChartOptions("").scales?.y,
                                grid: {
                                    color: (context) =>
                                        context.tick.value === 0
                                            ? "rgba(255, 255, 255, 0.4)"
                                            : "rgba(255, 255, 255, 0.1)",
                                },
                            },
                        },
                    },
                    plugins: [backgroundZonesPlugin],
                });
                this.charts.push(chart);
            }
        };

        requestAnimationFrame(() => {
            updateSubChart();
        });

        const heatmapTitle = this.el("div", {
            className: "stat-value",
            style: {
                fontSize: "1.2em",
                marginTop: "25px",
                marginBottom: "15px",
                textAlign: "left",
            },
            textContent: `${namesString} Race Results`,
        });
        container.appendChild(heatmapTitle);

        const originalDriversArray = driverStatsList.map((item) => item.driver);
        const heatmapComponent = this.createHeatmap(
            originalDriversArray,
            teamName,
        );
        if (heatmapComponent) {
            container.appendChild(heatmapComponent);
        }

        return container;
    }

    renderTeamDashboard() {
        const select = this.el("select", { className: "selector-dropdown" });
        this.data.constructors.forEach((c) => {
            const opt = this.el("option", {
                value: c.teamName,
                textContent: c.teamName,
            });
            if (c.teamName === this.selectedTeamName) opt.selected = true;
            select.appendChild(opt);
        });

        const updateDash = () => {
            this.selectedTeamName = select.value;
            const teamName = this.selectedTeamName;
            const stats = this.calculateTeamStats(teamName);
            const teamDrivers = this.data.drivers.filter((d) =>
                d.raceResults?.some((r) => r.car === teamName),
            );

            if (!this.teamChartMode) this.teamChartMode = "points";

            const togglePointsChart = this.el(
                "div",
                { className: "standings-sub-nav" },
                this.el("button", {
                    className: `standings-nav-btn ${this.teamChartMode === "points" ? "active" : ""}`,
                    textContent: "Points Chart",
                    onClick: () => {
                        this.teamChartMode = "points";
                        updateDash();
                    },
                }),
                this.el("button", {
                    className: `standings-nav-btn ${this.teamChartMode === "position" ? "active" : ""}`,
                    textContent: "Position History",
                    onClick: () => {
                        this.teamChartMode = "position";
                        updateDash();
                    },
                }),
            );

            let togglePointsSubNav = null;
            if (this.teamChartMode === "points") {
                togglePointsSubNav = this.el(
                    "div",
                    {
                        className: "standings-sub-nav",
                        style: { marginTop: "8px" },
                    },
                    this.el("button", {
                        className: `standings-nav-btn ${this.teamPointChartMode === "cumulative" ? "active" : ""}`,
                        textContent: "Cumulative Points",
                        onClick: () => {
                            this.teamPointChartMode = "cumulative";
                            updateDash();
                        },
                    }),
                    this.el("button", {
                        className: `standings-nav-btn ${this.teamPointChartMode === "single" ? "active" : ""}`,
                        textContent: "Points Per Round",
                        onClick: () => {
                            this.teamPointChartMode = "single";
                            updateDash();
                        },
                    }),
                );
            }

            const grid = this.el(
                "div",
                { className: "stats-grid" },
                this.createStatCard("Total Points", stats.points),
                this.createStatCard(
                    "Championship Position",
                    stats.championshipPosition === 1
                        ? "1st"
                        : stats.championshipPosition === 2
                          ? "2nd"
                          : stats.championshipPosition === 3
                            ? "3rd"
                            : stats.championshipPosition + "th",
                ),
                this.createStatCard("Wins", stats.wins),
                this.createStatCard("Podiums", stats.podiums),
                this.createStatCard("Top 10s", stats.top10),
                this.createStatCard("Driver DNFs", stats.dnfs),
                this.createStatCard("Pts / Race", stats.ptsPerRace),
                this.createStatCard("Avg Driver Finish", stats.avgFinish),
            );

            const chartsGrid = this.el("div", { className: "charts-grid" });
            const lineCanvas = this.el("canvas");

            const depBox = this.el("div", { className: "chart-box" });
            depBox.style.display = "flex";
            depBox.style.flexDirection = "column";
            depBox.style.height = "100%";
            depBox.style.minHeight = "0";
            depBox.style.boxSizing = "border-box";
            depBox.style.overflow = "hidden";

            const cardTitle = document.createElement("h4");
            cardTitle.textContent = "Driver Points Dependency";
            cardTitle.style.color = this.textColor;
            cardTitle.style.margin = "0 0 12px 0";
            cardTitle.style.fontSize = "1.1rem";
            cardTitle.style.fontWeight = "600";
            cardTitle.style.textAlign = "center";
            depBox.appendChild(cardTitle);

            if (!this.depViewMode) this.depViewMode = "pie";

            const depNav = document.createElement("div");
            depNav.className = "standings-sub-nav";
            depNav.style.margin = "0 0 10px 0";
            depNav.style.padding = "0";
            depNav.style.flexShrink = "0";

            const btnBar = document.createElement("button");
            btnBar.className = `standings-nav-btn ${this.depViewMode === "bar" ? "active" : ""}`;
            btnBar.textContent = "Bar View";
            btnBar.onclick = () => {
                this.depViewMode = "bar";
                updateDash();
            };

            const btnPie = document.createElement("button");
            btnPie.className = `standings-nav-btn ${this.depViewMode === "pie" ? "active" : ""}`;
            btnPie.textContent = "Pie View";
            btnPie.onclick = () => {
                this.depViewMode = "pie";
                updateDash();
            };

            depNav.appendChild(btnPie);
            depNav.appendChild(btnBar);
            depBox.appendChild(depNav);

            const contentSplitter = document.createElement("div");
            contentSplitter.style.display = "flex";
            contentSplitter.style.flex = "1";
            contentSplitter.style.minHeight = "0";
            contentSplitter.style.gap = "16px";
            contentSplitter.style.alignItems = "center";

            const depPercDiv = this.el("div", {
                className: "dependency-stats-container",
            });
            depPercDiv.style.flex = "1";
            depPercDiv.style.minWidth = "0";
            depPercDiv.style.display = "flex";
            depPercDiv.style.flexDirection = "column";
            depPercDiv.style.justifyContent = "center";
            depPercDiv.style.padding = "0";
            depPercDiv.style.boxSizing = "border-box";

            const canvasWrapper = document.createElement("div");
            canvasWrapper.style.position = "relative";
            canvasWrapper.style.flex = "1";
            canvasWrapper.style.width = "100%";
            canvasWrapper.style.height = "100%";
            canvasWrapper.style.minHeight = "0";
            canvasWrapper.style.minWidth = "0";

            const dynamicChartCanvas = this.el("canvas");
            dynamicChartCanvas.style.position = "absolute";
            dynamicChartCanvas.style.left = "0";
            dynamicChartCanvas.style.top = "0";
            dynamicChartCanvas.style.width = "100%";
            dynamicChartCanvas.style.height = "100%";

            canvasWrapper.appendChild(dynamicChartCanvas);

            contentSplitter.appendChild(depPercDiv);
            contentSplitter.appendChild(canvasWrapper);
            depBox.appendChild(contentSplitter);

            chartsGrid.appendChild(this.createChartBox(lineCanvas));
            chartsGrid.appendChild(depBox);
            chartsGrid.firstChild.style.gridColumn = "1 / -1";
            chartsGrid.lastChild.style.gridColumn = "1 / -1";
            chartsGrid.lastChild.style.minHeight = "300px";

            const box = this.el("div", {
                className: "stat-card",
                style: { marginTop: "20px", textAlign: "left" },
            });

            const teammateComp = this.createTeammateComparison(
                teamDrivers,
                teamName,
            );

            box.appendChild(teammateComp);

            const dashChildren = [togglePointsChart];
            if (togglePointsSubNav) dashChildren.push(togglePointsSubNav);
            dashChildren.push(grid, chartsGrid, box);

            const dashContainer = this.el(
                "div",
                { id: "team-dash-content" },
                ...dashChildren,
            );
            const existing = document.getElementById("team-dash-content");
            if (existing) existing.replaceWith(dashContainer);
            else this.contentWrapper.appendChild(dashContainer);

            this.destroyCharts();

            const gps = this.getAllGrandsPrix();
            const color = this.getTeamColor(teamName);
            const avgVal = parseFloat(stats.ptsPerRace);

            if (this.teamChartMode === "position") {
                const numTeams = this.data.constructors
                    ? this.data.constructors.length
                    : 10;
                this.charts.push(
                    new Chart(lineCanvas, {
                        type: "line",
                        data: {
                            labels: gps,
                            datasets: [
                                {
                                    label: `${teamName} Position`,
                                    data: stats.championshipPositionHistory,
                                    borderColor: color,
                                    backgroundColor: color,
                                    tension: 0.2,
                                    fill: false,
                                },
                            ],
                        },
                        options: {
                            ...this.getChartOptions(
                                "Championship Position Progression",
                            ),
                            scales: {
                                y: {
                                    reverse: true,
                                    min: 1,
                                    max: numTeams,
                                    ticks: {
                                        stepSize: 1,
                                        color: this.textColor,
                                    },
                                    grid: { color: this.gridColor },
                                },
                                x: {
                                    ticks: { color: this.textColor },
                                    grid: { color: this.gridColor },
                                },
                            },
                        },
                    }),
                );
            } else if (this.teamPointChartMode === "cumulative") {
                const cumAvgLineData = gps.map((_, idx) => (idx + 1) * avgVal);

                this.charts.push(
                    new Chart(lineCanvas, {
                        type: "line",
                        data: {
                            labels: gps,
                            datasets: [
                                {
                                    label: `${teamName} Points`,
                                    data: stats.ptsHistory,
                                    borderColor: color,
                                    backgroundColor: color,
                                    tension: 0.2,
                                    fill: false,
                                },
                                {
                                    label: `Avg Trajectory (${avgVal}/race)`,
                                    data: cumAvgLineData,
                                    borderColor: "#ED1131",
                                    borderWidth: 2,
                                    borderDash: [5, 5],
                                    pointRadius: 0,
                                    fill: false,
                                },
                            ],
                        },
                        options: this.getChartOptions(
                            "Cumulative Points Progression",
                        ),
                    }),
                );
            } else {
                const avgLineData = gps.map(() => avgVal);

                this.charts.push(
                    new Chart(lineCanvas, {
                        type: "bar",
                        data: {
                            labels: gps,
                            datasets: [
                                {
                                    type: "bar",
                                    label: "Points Scored",
                                    data: stats.singlePtsHistory,
                                    backgroundColor: color,
                                },
                                {
                                    type: "line",
                                    label: `Avg Pts/Race (${avgVal})`,
                                    data: avgLineData,
                                    borderColor: "#ED1131",
                                    borderWidth: 2,
                                    borderDash: [5, 5],
                                    pointRadius: 0,
                                    fill: false,
                                },
                            ],
                        },
                        options: this.getChartOptions(
                            "Points Per Round & Average",
                        ),
                    }),
                );
            }

            const driverNames = Object.keys(stats.drivers);
            const driverPts = Object.values(stats.drivers);
            const driverShades = this.getDriverShades(
                color,
                driverNames.length,
            );

            const driverPcts = driverPts.map((p) =>
                stats.points > 0 ? ((p / stats.points) * 100).toFixed(1) : 0,
            );

            const maxPtsIndex = driverPts.indexOf(Math.max(...driverPts));

            const depList = document.createElement("div");
            depList.style.display = "flex";
            depList.style.flexDirection = "column";
            depList.style.gap = "10px";

            driverNames.forEach((name, index) => {
                const isTopDriver = index === maxPtsIndex;

                const depItem = document.createElement("div");
                depItem.style.display = "flex";
                depItem.style.flexDirection = "column";
                depItem.style.gap = "4px";

                const headerRow = document.createElement("div");
                headerRow.style.display = "flex";
                headerRow.style.justifyContent = "space-between";
                headerRow.style.alignItems = "center";

                const nameSpan = document.createElement("span");
                nameSpan.textContent = name;
                nameSpan.style.color = this.textColor;

                if (isTopDriver) {
                    nameSpan.style.fontWeight = "900";
                    nameSpan.style.fontSize = "1.05rem";
                    nameSpan.style.textShadow = `0 0 8px ${driverShades[index]}88`;
                } else {
                    nameSpan.style.fontWeight = "400";
                }

                const valSpan = document.createElement("span");
                valSpan.textContent = `${driverPcts[index]}% (${driverPts[index]} pts)`;
                valSpan.style.color = this.textColor;
                valSpan.style.fontWeight = isTopDriver ? "900" : "600";
                if (isTopDriver) {
                    valSpan.style.fontSize = "1.05rem";
                }

                headerRow.appendChild(nameSpan);
                headerRow.appendChild(valSpan);

                const progressBarBg = document.createElement("div");
                progressBarBg.style.width = "100%";
                progressBarBg.style.height = "8px";
                progressBarBg.style.backgroundColor =
                    "rgba(255, 255, 255, 0.1)";
                progressBarBg.style.borderRadius = "4px";
                progressBarBg.style.overflow = "hidden";

                const progressBarFill = document.createElement("div");
                progressBarFill.style.width = `${driverPcts[index]}%`;
                progressBarFill.style.height = "100%";
                progressBarFill.style.backgroundColor = driverShades[index];
                progressBarFill.style.borderRadius = "4px";
                progressBarFill.style.transition = "width 0.4s ease";

                progressBarBg.appendChild(progressBarFill);
                depItem.appendChild(headerRow);
                depItem.appendChild(progressBarBg);
                depList.appendChild(depItem);
            });

            depPercDiv.appendChild(depList);

            if (this.depViewMode === "bar") {
                this.charts.push(
                    new Chart(dynamicChartCanvas, {
                        type: "bar",
                        data: {
                            labels: driverNames,
                            datasets: [
                                {
                                    label: "% of Team Points",
                                    data: driverPcts,
                                    backgroundColor: driverShades,
                                    borderRadius: 6,
                                },
                            ],
                        },
                        options: {
                            indexAxis: "y",
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false },
                                title: {
                                    display: true,
                                    text: "Drivers points (%)",
                                    color: this.textColor,
                                },
                                zoom: true,
                            },
                            scales: {
                                x: {
                                    min: 0,
                                    max: 100,
                                    ticks: { color: this.textColor },
                                    grid: { color: this.gridColor },
                                },
                                y: {
                                    ticks: { color: this.textColor },
                                    grid: { color: this.gridColor },
                                },
                            },
                        },
                        plugins: [
                            {
                                id: "thresholdLine",
                                afterDraw: (chart) => {
                                    const xAxis = chart.scales.x;
                                    const yAxis = chart.scales.y;
                                    if (!xAxis) return;
                                    const xPos = xAxis.getPixelForValue(50);
                                    const ctx = chart.ctx;
                                    ctx.save();
                                    ctx.beginPath();
                                    ctx.setLineDash([5, 5]);
                                    ctx.strokeStyle = "#ED1131";
                                    ctx.lineWidth = 2;
                                    ctx.moveTo(xPos, yAxis.top);
                                    ctx.lineTo(xPos, yAxis.bottom);
                                    ctx.stroke();
                                    ctx.restore();
                                },
                            },
                        ],
                    }),
                );
            } else {
                this.charts.push(
                    new Chart(dynamicChartCanvas, {
                        type: "doughnut",
                        data: {
                            labels: driverNames,
                            datasets: [
                                {
                                    data: driverPts,
                                    backgroundColor: driverShades,
                                    borderColor: this.cardBg,
                                    borderWidth: 2,
                                },
                            ],
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { labels: { color: this.textColor } },
                                title: {
                                    display: true,
                                    text: "Points Distribution (points)",
                                    color: this.textColor,
                                },
                                zoom: false,
                            },
                        },
                    }),
                );
            }
        };

        select.addEventListener("change", updateDash);
        this.contentWrapper.appendChild(
            this.el(
                "div",
                { className: "selector-container" },
                this.el("span", { textContent: "Select Team:" }),
                select,
            ),
        );
        if (this.data.constructors.length) updateDash();
    }

    renderCompareDriversView() {
        if (!this.data || !this.data.drivers) return;

        const s1 = this.el("select", { className: "selector-dropdown" });
        const s2 = this.el("select", { className: "selector-dropdown" });

        this.data.drivers.forEach((d, i) => {
            const opt1 = this.el("option", {
                value: i,
                textContent: d.driverName,
            });
            const opt2 = this.el("option", {
                value: i,
                textContent: d.driverName,
            });
            if (i === this.selectedCompare1Index) opt1.selected = true;
            if (
                i ===
                (this.selectedCompare2Index < this.data.drivers.length
                    ? this.selectedCompare2Index
                    : 1)
            )
                opt2.selected = true;
            s1.appendChild(opt1);
            s2.appendChild(opt2);
        });

        const compareDriverContainer = this.el("div");

        const updateDash = () => {
            this.selectedCompare1Index = parseInt(s1.value, 10);
            this.selectedCompare2Index = parseInt(s2.value, 10);

            const d1 =
                this.data.drivers[this.selectedCompare1Index] ||
                this.data.drivers[0];
            const d2 =
                this.data.drivers[this.selectedCompare2Index] ||
                this.data.drivers[1] ||
                this.data.drivers[0];

            const st1 = this.calculateDriverStats(d1);
            const st2 = this.calculateDriverStats(d2);
            const gps = this.getAllGrandsPrix();

            let h2h1 = 0;
            let h2h2 = 0;
            gps.forEach((gp) => {
                const r1 = d1.raceResults?.find((r) => r.grandPrix === gp);
                const r2 = d2.raceResults?.find((r) => r.grandPrix === gp);
                if (r1 && r2) {
                    const p1 = parseInt(r1.pos, 10);
                    const p2 = parseInt(r2.pos, 10);
                    if (!isNaN(p1) && !isNaN(p2)) {
                        if (p1 < p2) h2h1++;
                        else if (p2 < p1) h2h2++;
                    } else if (!isNaN(p1) && isNaN(p2)) {
                        h2h1++;
                    } else if (isNaN(p1) && !isNaN(p2)) {
                        h2h2++;
                    }
                }
            });

            const grid = this.el("div", { style: { marginBottom: "20px" } });

            const createRow = (label, v1, v2, lowerIsBetter = false) => {
                const num1 = parseFloat(String(v1).replace("%", ""));
                const num2 = parseFloat(String(v2).replace("%", ""));
                let col1 = this.textColor;
                let col2 = this.textColor;

                if (!isNaN(num1) && !isNaN(num2) && num1 !== num2) {
                    const isV1Better = lowerIsBetter
                        ? num1 < num2
                        : num1 > num2;
                    if (isV1Better) {
                        col1 = "#00E676";
                        col2 = "#ED1131";
                    } else {
                        col1 = "#ED1131";
                        col2 = "#00E676";
                    }
                }

                return this.el(
                    "div",
                    { className: "compare-grid" },
                    this.el("div", {
                        className: "compare-val",
                        style: { color: col1 },
                        textContent: v1,
                    }),
                    this.el("div", {
                        className: "compare-label",
                        textContent: label,
                    }),
                    this.el("div", {
                        className: "compare-val",
                        style: { color: col2 },
                        textContent: v2,
                    }),
                );
            };

            grid.appendChild(createRow("Total Points", st1.points, st2.points));
            grid.appendChild(
                createRow(
                    "Championship Position",
                    st1.championshipPosition === 1
                        ? "1st"
                        : st1.championshipPosition === 2
                          ? "2nd"
                          : st1.championshipPosition === 3
                            ? "3rd"
                            : st1.championshipPosition + "th",
                    st2.championshipPosition === 1
                        ? "1st"
                        : st2.championshipPosition === 2
                          ? "2nd"
                          : st2.championshipPosition === 3
                            ? "3rd"
                            : st2.championshipPosition + "th",
                    true,
                ),
            );
            grid.appendChild(createRow("H2H Race Finishes", h2h1, h2h2));
            grid.appendChild(createRow("Wins", st1.wins, st2.wins));
            grid.appendChild(createRow("Podiums", st1.podiums, st2.podiums));
            grid.appendChild(createRow("Top 5s", st1.top5, st2.top5));
            grid.appendChild(createRow("Top 10s", st1.top10, st2.top10));
            grid.appendChild(
                createRow("Best Finish", st1.best === 1 ? "1st" : st1.best === 2 ? "2nd" : st1.best === 3 ? "3rd" : isNaN(st1.best) ? st1.best : st1.best + "th", st2.best === 1 ? "1st" : st2.best === 2 ? "2nd" : st2.best === 3 ? "3rd" : isNaN(st2.best) ? st2.best : st2.best + "th", true),
            );
            grid.appendChild(
                createRow("Avg Finish", st1.avgPos, st2.avgPos, true),
            );
            grid.appendChild(createRow("DNFs", st1.dnfs, st2.dnfs, true));
            grid.appendChild(
                createRow("Finish %", st1.finishRate, st2.finishRate),
            );
            grid.appendChild(
                createRow("Pts / Race", st1.ptsPerRace, st2.ptsPerRace),
            );
            grid.appendChild(createRow("Races", st1.races, st2.races));

            const compareBoxTitle = this.el("div", {
                className: "stat-value",
                style: {
                    fontSize: "1.2em",
                    marginBottom: "15px",
                    textAlign: "left",
                },
                textContent: "Head to Head Comparison",
            });

            const selectorContainerInside = this.el(
                "div",
                {
                    className: "selector-container",
                    style: { marginBottom: "20px" },
                },
                s1,
                this.el("span", {
                    textContent: "vs",
                    style: { fontWeight: "bold" },
                }),
                s2,
            );

            if (!this.compareDriverChartMode) {
                this.compareDriverChartMode = "cumulative";
            }

            const togglePointsChart = this.el(
                "div",
                {
                    className: "standings-sub-nav",
                    style: { marginTop: "20px", marginBottom: "15px" },
                },
                this.el("button", {
                    className: `standings-nav-btn ${this.compareDriverChartMode === "cumulative" ? "active" : ""}`,
                    textContent: "Cumulative Points",
                    onClick: () => {
                        this.compareDriverChartMode = "cumulative";
                        updateDash();
                    },
                }),
                this.el("button", {
                    className: `standings-nav-btn ${this.compareDriverChartMode === "single" ? "active" : ""}`,
                    textContent: "Points Per Round",
                    onClick: () => {
                        this.compareDriverChartMode = "single";
                        updateDash();
                    },
                }),
                this.el("button", {
                    className: `standings-nav-btn ${this.compareDriverChartMode === "gap" ? "active" : ""}`,
                    textContent: "Points Gap (H2H)",
                    onClick: () => {
                        this.compareDriverChartMode = "gap";
                        updateDash();
                    },
                }),
            );

            const lineCanvas = this.el("canvas");
            const chartBox = this.createChartBox(lineCanvas);

            const heatmapTitle = this.el("div", {
                className: "stat-value",
                style: {
                    fontSize: "1.2em",
                    marginTop: "25px",
                    marginBottom: "15px",
                    textAlign: "left",
                },
                textContent: `${d1.driverName} vs ${d2.driverName} Race Results`,
            });
            const heatmapComponent = this.createHeatmap([d1, d2]);

            let allSortCol = this.compareAllDriversSortCol || "points";
            let allSortAsc =
                this.compareAllDriversSortAsc !== undefined
                    ? this.compareAllDriversSortAsc
                    : false;

            const allTableContainer = this.el("div", {
                style: { overflowX: "auto" },
            });

            const tableTitle = this.el("div", {
                className: "stat-value",
                style: {
                    fontSize: "1.2em",
                    marginBottom: "15px",
                    textAlign: "left",
                },
                textContent: "Drivers leaderboard",
            });

            const allTable = this.el("table", {
                className: "standings-table",
                style: {
                    width: "100%",
                    borderCollapse: "collapse",
                    textAlign: "left",
                },
            });
            const allThead = this.el("thead");
            const allHeaderRow = this.el("tr");

            const allCols = [
                { key: "name", label: "Driver" },
                { key: "team", label: "Team" },
                { key: "points", label: "Points" },
                { key: "wins", label: "Wins" },
                { key: "podiums", label: "Podiums" },
                { key: "top5", label: "Top 5s" },
                { key: "top10", label: "Top 10s" },
                { key: "dnfs", label: "DNFs" },
                { key: "avgPos", label: "Avg Pos" },
            ];

            allCols.forEach((c) => {
                const th = this.el("th", {
                    style: {
                        cursor: "pointer",
                        padding: "10px",
                        borderBottom: `2px solid ${this.borderColor}`,
                    },
                    textContent:
                        c.label +
                        (allSortCol === c.key
                            ? allSortAsc
                                ? " ▲"
                                : " ▼"
                            : ""),
                    onClick: () => {
                        if (this.compareAllDriversSortCol === c.key) {
                            this.compareAllDriversSortAsc =
                                !this.compareAllDriversSortAsc;
                        } else {
                            this.compareAllDriversSortCol = c.key;
                            this.compareAllDriversSortAsc =
                                c.key === "name" ||
                                c.key === "team" ||
                                c.key === "avgPos";
                        }
                        updateDash();
                    },
                });
                allHeaderRow.appendChild(th);
            });
            allThead.appendChild(allHeaderRow);
            allTable.appendChild(allThead);

            const allTbody = this.el("tbody");
            let allDriversData = this.data.drivers.map((d) => {
                const st = this.calculateDriverStats(d);
                return {
                    driver: d,
                    name: d.driverName,
                    team: Array.from(st.cars)[0] || d.car || "-",
                    points: parseFloat(st.points) || 0,
                    wins: parseInt(st.wins, 10) || 0,
                    podiums: parseInt(st.podiums, 10) || 0,
                    top5: parseInt(st.top5, 10) || 0,
                    top10: parseInt(st.top10, 10) || 0,
                    dnfs: parseInt(st.dnfs, 10) || 0,
                    avgPos: parseFloat(st.avgPos) || 99,
                };
            });

            allDriversData.sort((a, b) => {
                let va = a[allSortCol];
                let vb = b[allSortCol];
                if (typeof va === "string") {
                    return allSortAsc
                        ? va.localeCompare(vb)
                        : vb.localeCompare(va);
                }
                return allSortAsc ? va - vb : vb - va;
            });

            allDriversData.forEach((item) => {
                const tr = this.el("tr", {
                    style: { borderBottom: `1px solid ${this.borderColor}` },
                });
                tr.appendChild(
                    this.el("td", {
                        style: {
                            padding: "10px",
                            fontWeight:
                                item.name === d1.driverName ||
                                item.name === d2.driverName
                                    ? "bold"
                                    : "normal",
                        },
                        textContent: item.name,
                    }),
                );
                tr.appendChild(
                    this.el("td", {
                        style: { padding: "10px", opacity: 0.8 },
                        textContent: item.team,
                    }),
                );
                tr.appendChild(
                    this.el("td", {
                        style: { padding: "10px", fontWeight: "bold" },
                        textContent: item.points,
                    }),
                );
                tr.appendChild(
                    this.el("td", {
                        style: { padding: "10px" },
                        textContent: item.wins,
                    }),
                );
                tr.appendChild(
                    this.el("td", {
                        style: { padding: "10px" },
                        textContent: item.podiums,
                    }),
                );
                tr.appendChild(
                    this.el("td", {
                        style: { padding: "10px" },
                        textContent: item.top5,
                    }),
                );
                tr.appendChild(
                    this.el("td", {
                        style: { padding: "10px" },
                        textContent: item.top10,
                    }),
                );
                tr.appendChild(
                    this.el("td", {
                        style: { padding: "10px" },
                        textContent: item.dnfs,
                    }),
                );
                tr.appendChild(
                    this.el("td", {
                        style: { padding: "10px" },
                        textContent: item.avgPos === 99 ? "-" : item.avgPos,
                    }),
                );
                allTbody.appendChild(tr);
            });

            allTable.appendChild(allTbody);
            allTableContainer.appendChild(allTable);

            const mainCard = this.el(
                "div",
                {
                    className: "stat-card",
                    style: { marginTop: "20px", textAlign: "left" },
                },
                compareBoxTitle,
                selectorContainerInside,
                grid,
                togglePointsChart,
                chartBox,
                heatmapTitle,
                heatmapComponent,
            );

            const tableCard = this.el(
                "div",
                {
                    className: "stat-card",
                    style: { marginTop: "20px", textAlign: "left" },
                },
                tableTitle,
                allTableContainer,
            );

            const dashContainer = this.el(
                "div",
                { id: "compare-driver-dash-content" },
                mainCard,
                tableCard,
            );

            const existing = document.getElementById(
                "compare-driver-dash-content",
            );
            if (existing) existing.replaceWith(dashContainer);
            else compareDriverContainer.appendChild(dashContainer);

            const prevChart =
                typeof Chart !== "undefined" && Chart.getChart
                    ? Chart.getChart(lineCanvas)
                    : null;
            if (prevChart) prevChart.destroy();

            let col1 = this.getTeamColor(Array.from(st1.cars)[0] || d1.car);
            let col2 = this.getTeamColor(Array.from(st2.cars)[0] || d2.car);

            if (col1 === col2 && col1 && col1[0] === "#") {
                let num = parseInt(col1.slice(1), 16);
                let r = Math.min(255, Math.max(0, (num >> 16) + 90));
                let g = Math.min(255, Math.max(0, ((num >> 8) & 0x0ff) + 90));
                let b = Math.min(255, Math.max(0, (num & 0x0000ff) + 90));
                col2 = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
            }

            if (this.compareDriverChartMode === "cumulative") {
                const chart = new Chart(lineCanvas, {
                    type: "line",
                    data: {
                        labels: gps,
                        datasets: [
                            {
                                label: d1.driverName,
                                data: st1.ptsHistory,
                                borderColor: col1,
                                backgroundColor: col1,
                                tension: 0.2,
                                fill: false,
                            },
                            {
                                label: d2.driverName,
                                data: st2.ptsHistory,
                                borderColor: col2,
                                backgroundColor: col2,
                                tension: 0.2,
                                fill: false,
                                borderDash: [5, 5],
                            },
                        ],
                    },
                    options: this.getChartOptions("Driver Points Comparison"),
                });
                this.charts.push(chart);
            } else if (this.compareDriverChartMode === "single") {
                const chart = new Chart(lineCanvas, {
                    type: "bar",
                    data: {
                        labels: gps,
                        datasets: [
                            {
                                label: d1.driverName,
                                data: st1.singlePtsHistory,
                                backgroundColor: col1,
                            },
                            {
                                label: d2.driverName,
                                data: st2.singlePtsHistory,
                                backgroundColor: col2,
                            },
                        ],
                    },
                    options: this.getChartOptions(
                        "Driver Points Per Round Comparison",
                    ),
                });
                this.charts.push(chart);
            } else if (this.compareDriverChartMode === "gap") {
                const gapData = st1.ptsHistory.map((val1, idx) => {
                    const val2 = st2.ptsHistory[idx] || 0;
                    return Number((val2 - val1).toFixed(2));
                });

                const backgroundZonesPlugin = {
                    id: "backgroundZonesPlugin",
                    beforeDraw(chart) {
                        const {
                            ctx,
                            chartArea: { top, bottom, left, right },
                            scales: { y },
                        } = chart;
                        const zeroY = y.getPixelForValue(0);

                        ctx.save();
                        ctx.fillStyle = "rgba(0, 230, 118, 0.3)";
                        ctx.fillRect(
                            left,
                            top,
                            right - left,
                            Math.max(0, zeroY - top),
                        );

                        ctx.fillStyle = "rgba(237, 17, 49, 0.3)";
                        ctx.fillRect(
                            left,
                            Math.min(bottom, zeroY),
                            right - left,
                            Math.max(0, bottom - zeroY),
                        );
                        ctx.restore();
                    },
                };

                const chart = new Chart(lineCanvas, {
                    type: "line",
                    data: {
                        labels: gps,
                        datasets: [
                            {
                                label: `${d1.driverName} (Baseline)`,
                                data: new Array(gps.length).fill(0),
                                borderColor: col1,
                                backgroundColor: col1,
                                borderWidth: 2,
                                pointRadius: 0,
                                fill: false,
                            },
                            {
                                label: `${d2.driverName} vs ${d1.driverName} (Gap)`,
                                data: gapData,
                                borderColor: col2,
                                backgroundColor: col2,
                                borderWidth: 2,
                                tension: 0.2,
                                fill: false,
                            },
                        ],
                    },
                    options: {
                        ...this.getChartOptions(
                            `Points Gap: ${d2.driverName} relative to ${d1.driverName}`,
                        ),
                        scales: {
                            ...this.getChartOptions("").scales,
                            y: {
                                ...this.getChartOptions("").scales?.y,
                                grid: {
                                    color: (context) =>
                                        context.tick.value === 0
                                            ? "rgba(255, 255, 255, 0.4)"
                                            : "rgba(255, 255, 255, 0.1)",
                                },
                            },
                        },
                    },
                    plugins: [backgroundZonesPlugin],
                });
                this.charts.push(chart);
            }
        };

        s1.addEventListener("change", updateDash);
        s2.addEventListener("change", updateDash);

        this.contentWrapper.appendChild(compareDriverContainer);
        updateDash();
    }

    renderCompareTeamsView() {
        if (!this.data || !this.data.constructors) return;

        const s1 = this.el("select", { className: "selector-dropdown" });
        const s2 = this.el("select", { className: "selector-dropdown" });

        this.data.constructors.forEach((c, i) => {
            const opt1 = this.el("option", {
                value: i,
                textContent: c.teamName,
            });
            const opt2 = this.el("option", {
                value: i,
                textContent: c.teamName,
            });
            if (i === this.selectedCompareTeam1Index) opt1.selected = true;
            if (
                i ===
                (this.selectedCompareTeam2Index < this.data.constructors.length
                    ? this.selectedCompareTeam2Index
                    : 1)
            )
                opt2.selected = true;
            s1.appendChild(opt1);
            s2.appendChild(opt2);
        });

        const compareTeamContainer = this.el("div");

        const updateDash = () => {
            this.selectedCompareTeam1Index = parseInt(s1.value, 10);
            this.selectedCompareTeam2Index = parseInt(s2.value, 10);

            const c1 =
                this.data.constructors[this.selectedCompareTeam1Index] ||
                this.data.constructors[0];
            const c2 =
                this.data.constructors[this.selectedCompareTeam2Index] ||
                this.data.constructors[1] ||
                this.data.constructors[0];

            const st1 = this.calculateTeamStats(c1.teamName);
            const st2 = this.calculateTeamStats(c2.teamName);
            const gps = this.getAllGrandsPrix();

            const grid = this.el("div", { style: { marginBottom: "20px" } });

            const createRow = (label, v1, v2, lowerIsBetter = false) => {
                const num1 = parseFloat(v1);
                const num2 = parseFloat(v2);
                let col1 = this.textColor;
                let col2 = this.textColor;

                if (!isNaN(num1) && !isNaN(num2) && num1 !== num2) {
                    const isV1Better = lowerIsBetter
                        ? num1 < num2
                        : num1 > num2;
                    if (isV1Better) {
                        col1 = "#00E676";
                        col2 = "#ED1131";
                    } else {
                        col1 = "#ED1131";
                        col2 = "#00E676";
                    }
                }

                return this.el(
                    "div",
                    { className: "compare-grid" },
                    this.el("div", {
                        className: "compare-val",
                        style: { color: col1 },
                        textContent: v1,
                    }),
                    this.el("div", {
                        className: "compare-label",
                        textContent: label,
                    }),
                    this.el("div", {
                        className: "compare-val",
                        style: { color: col2 },
                        textContent: v2,
                    }),
                );
            };

            grid.appendChild(createRow("Total Points", st1.points, st2.points));
            grid.appendChild(
                createRow(
                    "Championship Position",
                    st1.championshipPosition === 1
                        ? "1st"
                        : st1.championshipPosition === 2
                          ? "2nd"
                          : st1.championshipPosition === 3
                            ? "3rd"
                            : st1.championshipPosition + "th",
                    st2.championshipPosition === 1
                        ? "1st"
                        : st2.championshipPosition === 2
                          ? "2nd"
                          : st2.championshipPosition === 3
                            ? "3rd"
                            : st2.championshipPosition + "th",
                    true,
                ),
            );
            grid.appendChild(createRow("Wins", st1.wins, st2.wins));
            grid.appendChild(createRow("Podiums", st1.podiums, st2.podiums));
            grid.appendChild(createRow("Top 5s", st1.top5, st2.top5));
            grid.appendChild(createRow("Top 10s", st1.top10, st2.top10));
            grid.appendChild(createRow("Best Finish", st1.best === 1 ? "1st" : st1.best === 2 ? "2nd" : st1.best === 3 ? "3rd" : isNaN(st1.best) ? st1.best : st1.best + "th", st2.best === 1 ? "1st" : st2.best === 2 ? "2nd" : st2.best === 3 ? "3rd" : isNaN(st2.best) ? st2.best : st2.best + "th", true));
            grid.appendChild(
                createRow(
                    "Avg Driver Finish",
                    st1.avgFinish,
                    st2.avgFinish,
                    true,
                ),
            );
            grid.appendChild(createRow("DNFs", st1.dnfs, st2.dnfs, true));
            grid.appendChild(
                createRow("Pts / Race", st1.ptsPerRace, st2.ptsPerRace),
            );

            if (!this.compareTeamChartMode) {
                this.compareTeamChartMode = "cumulative";
            }

            const togglePointsChart = this.el(
                "div",
                { className: "standings-sub-nav" },
                this.el("button", {
                    className: `standings-nav-btn ${this.compareTeamChartMode === "cumulative" ? "active" : ""}`,
                    textContent: "Cumulative Points",
                    onClick: () => {
                        this.compareTeamChartMode = "cumulative";
                        updateDash();
                    },
                }),
                this.el("button", {
                    className: `standings-nav-btn ${this.compareTeamChartMode === "single" ? "active" : ""}`,
                    textContent: "Points Per Round",
                    onClick: () => {
                        this.compareTeamChartMode = "single";
                        updateDash();
                    },
                }),
                this.el("button", {
                    className: `standings-nav-btn ${this.compareTeamChartMode === "gap" ? "active" : ""}`,
                    textContent: "Points Gap (H2H)",
                    onClick: () => {
                        this.compareTeamChartMode = "gap";
                        updateDash();
                    },
                }),
            );

            const lineCanvas = this.el("canvas");
            const chartBox = this.createChartBox(lineCanvas);

            const dashContainer = this.el(
                "div",
                { id: "compare-team-dash-content" },
                grid,
                togglePointsChart,
                chartBox,
            );
            const existing = document.getElementById(
                "compare-team-dash-content",
            );
            if (existing) existing.replaceWith(dashContainer);
            else compareTeamContainer.appendChild(dashContainer);

            const prevChart =
                typeof Chart !== "undefined" && Chart.getChart
                    ? Chart.getChart(lineCanvas)
                    : null;
            if (prevChart) prevChart.destroy();

            let col1 = this.getTeamColor(c1.teamName);
            let col2 = this.getTeamColor(c2.teamName);

            if (col1 === col2 && col1 && col1[0] === "#") {
                let num = parseInt(col1.slice(1), 16);
                let r = Math.min(255, Math.max(0, (num >> 16) + 90));
                let g = Math.min(255, Math.max(0, ((num >> 8) & 0x0ff) + 90));
                let b = Math.min(255, Math.max(0, (num & 0x0000ff) + 90));
                col2 = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
            }

            if (this.compareTeamChartMode === "cumulative") {
                const chart = new Chart(lineCanvas, {
                    type: "line",
                    data: {
                        labels: gps,
                        datasets: [
                            {
                                label: c1.teamName,
                                data: st1.ptsHistory,
                                borderColor: col1,
                                backgroundColor: col1,
                                tension: 0.2,
                                fill: false,
                            },
                            {
                                label: c2.teamName,
                                data: st2.ptsHistory,
                                borderColor: col2,
                                backgroundColor: col2,
                                tension: 0.2,
                                fill: false,
                                borderDash: [5, 5],
                            },
                        ],
                    },
                    options: this.getChartOptions("Team Points Comparison"),
                });
                this.charts.push(chart);
            } else if (this.compareTeamChartMode === "single") {
                const chart = new Chart(lineCanvas, {
                    type: "bar",
                    data: {
                        labels: gps,
                        datasets: [
                            {
                                label: c1.teamName,
                                data: st1.singlePtsHistory,
                                backgroundColor: col1,
                            },
                            {
                                label: c2.teamName,
                                data: st2.singlePtsHistory,
                                backgroundColor: col2,
                            },
                        ],
                    },
                    options: this.getChartOptions(
                        "Team Points Per Round Comparison",
                    ),
                });
                this.charts.push(chart);
            } else if (this.compareTeamChartMode === "gap") {
                const gapData = st1.ptsHistory.map((val1, idx) => {
                    const val2 = st2.ptsHistory[idx] || 0;
                    return Number((val2 - val1).toFixed(2));
                });

                const backgroundZonesPlugin = {
                    id: "backgroundZonesPlugin",
                    beforeDraw(chart) {
                        const {
                            ctx,
                            chartArea: { top, bottom, left, right },
                            scales: { y },
                        } = chart;
                        const zeroY = y.getPixelForValue(0);

                        ctx.save();
                        ctx.fillStyle = "rgba(237, 17, 49, 0.3)";
                        ctx.fillRect(
                            left,
                            top,
                            right - left,
                            Math.max(0, zeroY - top),
                        );

                        ctx.fillStyle = "rgba(0, 230, 118, 0.3)";
                        ctx.fillRect(
                            left,
                            Math.min(bottom, zeroY),
                            right - left,
                            Math.max(0, bottom - zeroY),
                        );
                        ctx.restore();
                    },
                };

                const chart = new Chart(lineCanvas, {
                    type: "line",
                    data: {
                        labels: gps,
                        datasets: [
                            {
                                label: `${c1.teamName} (Baseline)`,
                                data: new Array(gps.length).fill(0),
                                borderColor: col1,
                                backgroundColor: col1,
                                borderWidth: 2,
                                pointRadius: 0,
                                fill: false,
                            },
                            {
                                label: `${c2.teamName} vs ${c1.teamName} (Gap)`,
                                data: gapData,
                                borderColor: col2,
                                backgroundColor: col2,
                                borderWidth: 2,
                                tension: 0.2,
                                fill: false,
                            },
                        ],
                    },
                    options: {
                        ...this.getChartOptions(
                            `Points Gap: ${c2.teamName} relative to ${c1.teamName}`,
                        ),
                        scales: {
                            ...this.getChartOptions("").scales,
                            y: {
                                ...this.getChartOptions("").scales?.y,
                                grid: {
                                    color: (context) =>
                                        context.tick.value === 0
                                            ? "rgba(255, 255, 255, 0.4)"
                                            : "rgba(255, 255, 255, 0.1)",
                                },
                            },
                        },
                    },
                    plugins: [backgroundZonesPlugin],
                });
                this.charts.push(chart);
            }
        };

        s1.addEventListener("change", updateDash);
        s2.addEventListener("change", updateDash);

        const compareTitle = this.el("div", {
            className: "section-title",
            textContent: "Head to Head Team Comparison",
        });
        const selectorContainer = this.el(
            "div",
            { className: "selector-container" },
            s1,
            this.el("span", {
                textContent: "vs",
                style: { fontWeight: "bold" },
            }),
            s2,
        );

        const compareCard = this.el(
            "div",
            { className: "stat-card" },
            compareTitle,
            selectorContainer,
            compareTeamContainer,
        );

        this.contentWrapper.appendChild(compareCard);
        updateDash();

        const teamsStats = this.data.constructors.map((c) => {
            const stats = this.calculateTeamStats(c.teamName);
            const drivers = Object.entries(stats.drivers);
            drivers.sort((a, b) => b[1] - a[1]);
            const topDriverPts = drivers.length ? drivers[0][1] : 0;
            const dependencyPct =
                stats.points > 0
                    ? ((topDriverPts / stats.points) * 100).toFixed(1)
                    : "0.0";
            return {
                pos: c.pos,
                teamName: c.teamName,
                pts: stats.points,
                wins: stats.wins,
                podiums: stats.podiums,
                top5: stats.top5,
                top10: stats.top10,
                dnfs: stats.dnfs,
                ptsPerRace: stats.ptsPerRace,
                dependencyPct: parseFloat(dependencyPct),
                topDriverName: drivers.length ? drivers[0][0] : "-",
                color: this.getTeamColor(c.teamName),
            };
        });

        const chartsGrid = this.el("div", {
            className: "charts-grid",
            style: { marginTop: "20px" },
        });
        const depCanvas = this.el("canvas");
        const ptsPerRaceCanvas = this.el("canvas");

        chartsGrid.appendChild(this.createChartBox(depCanvas));
        chartsGrid.appendChild(this.createChartBox(ptsPerRaceCanvas));
        this.contentWrapper.appendChild(chartsGrid);

        const teamLabels = teamsStats.map((t) => t.teamName);
        const depData = teamsStats.map((t) => t.dependencyPct);
        const ptsPerRaceData = teamsStats.map((t) => t.ptsPerRace);
        const bgColors = teamsStats.map((t) => t.color);

        const sortDep = (data) => {
            const combined = teamLabels.map((label, index) => ({
                label,
                value: data[index],
                color: bgColors[index],
            }));
            combined.sort((a, b) => {
                const valA = a.value === 0 ? 101 : a.value;
                const valB = b.value === 0 ? 101 : b.value;
                return valA - valB;
            });
            return combined;
        };

        const sortedDepData = sortDep(depData);

        this.charts.push(
            new Chart(depCanvas, {
                type: "bar",
                data: {
                    labels: sortedDepData.map((item) => item.label),
                    datasets: [
                        {
                            label: "Driver Dependency (% points)",
                            data: sortedDepData.map((item) => item.value),
                            backgroundColor: sortedDepData.map(
                                (item) => item.color,
                            ),
                        },
                    ],
                },
                options: this.getChartOptions(
                    "Team Dependency on Top Driver (% points)",
                ),
            }),
        );

        this.charts.push(
            new Chart(ptsPerRaceCanvas, {
                type: "bar",
                data: {
                    labels: teamLabels,
                    datasets: [
                        {
                            label: "Average Points Per Race",
                            data: ptsPerRaceData,
                            backgroundColor: bgColors,
                        },
                    ],
                },
                options: this.getChartOptions("Average Points Per Race"),
            }),
        );

        const teamLeaderboardTitle = this.el("div", {
            className: "section-title",
            textContent: "Constructors Leaderboard",
        });

        const teamColumns = [
            {
                label: "Pos",
                key: "pos",
                getValue: (ts) => parseInt(ts.pos, 10),
                style: { width: "40px" },
            },
            { label: "Team", key: "teamName" },
            {
                label: "Total Pts",
                key: "pts",
                getValue: (ts) => parseFloat(ts.pts),
                style: { textAlign: "right" },
                defaultDir: "desc",
            },
            {
                label: "Pts/Race",
                key: "ptsPerRace",
                getValue: (ts) => parseFloat(ts.ptsPerRace),
                style: { textAlign: "right" },
                defaultDir: "desc",
            },
            {
                label: "Wins",
                key: "wins",
                getValue: (ts) => ts.wins,
                style: { textAlign: "right" },
                defaultDir: "desc",
            },
            {
                label: "Podiums",
                key: "podiums",
                getValue: (ts) => ts.podiums,
                style: { textAlign: "right" },
                defaultDir: "desc",
            },
            {
                label: "Top 5s",
                key: "top5",
                getValue: (ts) => ts.top5,
                style: { textAlign: "right" },
                defaultDir: "desc",
            },
            {
                label: "Top 10s",
                key: "top10",
                getValue: (ts) => ts.top10,
                style: { textAlign: "right" },
                defaultDir: "desc",
            },
            {
                label: "DNFs",
                key: "dnfs",
                getValue: (ts) => ts.dnfs,
                style: { textAlign: "right" },
            },
            {
                label: "Driver Dependency",
                key: "dependencyPct",
                getValue: (ts) => ts.dependencyPct,
                style: { textAlign: "right" },
                defaultDir: "desc",
            },
            { label: "Top Contributor", key: "topDriverName" },
        ];

        const table = this.createSortableTable({
            columns: teamColumns,
            data: teamsStats,
            defaultSortIndex: 0,
            defaultSortDir: "asc",
            rowRenderer: (ts) => {
                const constructor = this.data.constructors.find(
                    (c) => c.teamName === ts.teamName,
                );
                const status = this.getConstructorChampionshipStatus(
                    constructor || { teamName: ts.teamName, pts: ts.pts },
                );
                return this.el(
                    "tr",
                    { className: this.getChampionshipRowClass(status) },
                    this.el(
                        "td",
                        {},
                        this.el("strong", { textContent: ts.pos }),
                    ),
                    this.el(
                        "td",
                        {},
                        this.el("strong", { textContent: ts.teamName }),
                    ),
                    this.el("td", { style: { textAlign: "right" } }, ts.pts),
                    this.el(
                        "td",
                        { style: { textAlign: "right" } },
                        ts.ptsPerRace,
                    ),
                    this.el("td", { style: { textAlign: "right" } }, ts.wins),
                    this.el(
                        "td",
                        { style: { textAlign: "right" } },
                        ts.podiums,
                    ),
                    this.el("td", { style: { textAlign: "right" } }, ts.top5),
                    this.el("td", { style: { textAlign: "right" } }, ts.top10),
                    this.el("td", { style: { textAlign: "right" } }, ts.dnfs),
                    this.el(
                        "td",
                        { style: { textAlign: "right" } },
                        `${ts.dependencyPct}%`,
                    ),
                    this.el("td", {}, ts.topDriverName),
                );
            },
        });

        const leaderboardCard = this.el(
            "div",
            { className: "stat-card" },
            teamLeaderboardTitle,
            this.el("div", { className: "standings-table-wrap" }, table),
        );

        this.contentWrapper.appendChild(leaderboardCard);
    }

    createStatCard(label, value) {
        return this.el(
            "div",
            { className: "stat-card" },
            this.el("div", { className: "stat-value", textContent: value }),
            this.el("div", { className: "stat-label", textContent: label }),
        );
    }

    createHeatmap(drivers, teamFilter = null) {
        const wrapper = this.el("div", {
            style: { overflowX: "auto", marginTop: "20px" },
        });
        const table = this.el("table", { className: "heatmap-table" });
        const gps = this.getAllGrandsPrix();

        const thead = this.el(
            "thead",
            {},
            this.el(
                "tr",
                {},
                this.el("th", { textContent: "Driver" }),
                ...gps.map((gp) =>
                    this.el("th", {
                        textContent: gp.substring(0, 3).toUpperCase(),
                    }),
                ),
            ),
        );

        const tbody = this.el("tbody");
        drivers.forEach((d) => {
            const tr = this.el(
                "tr",
                {},
                this.el("td", {
                    textContent:
                        d.driverCode ||
                        d.driverName.substring(0, 3).toUpperCase(),
                    style: { fontWeight: "bold" },
                }),
            );
            gps.forEach((gp) => {
                const res = d.raceResults?.find((r) => r.grandPrix === gp);
                const td = this.el("td", { textContent: "-" });
                if (res && (!teamFilter || res.car === teamFilter)) {
                    td.textContent =
                        res.pts +
                        " (" +
                        (res.pos === "1"
                            ? "1st"
                            : res.pos === "2"
                              ? "2nd"
                              : res.pos === "3"
                                ? "3rd"
                                : !isNaN(res.pos)
                                  ? res.pos + "th"
                                  : res.pos) +
                        ")";
                    const pNum = parseInt(res.pos, 10);
                    if (pNum === 1) td.className = "podium-first";
                    else if (pNum === 2) td.className = "podium-second";
                    else if (pNum === 3) td.className = "podium-third";
                    else if (!isNaN(pNum) && parseFloat(res.pts) > 0)
                        td.className = "results-points";
                    else if (isNaN(pNum)) td.className = "non-numeric-result";
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });

        table.appendChild(thead);
        table.appendChild(tbody);
        wrapper.appendChild(table);
        return wrapper;
    }

    getChartOptions(titleText) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "nearest",
                intersect: false,
            },
            plugins: {
                legend: {
                    labels: {
                        color: this.textColor,
                    },
                },
                title: {
                    display: true,
                    text: titleText,
                    color: this.textColor,
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: "x",
                        threshold: 5,
                    },
                    zoom: {
                        wheel: {
                            enabled: true,
                            speed: 0.08,
                        },
                        pinch: {
                            enabled: true,
                        },
                        mode: "xy",
                    },
                },
            },
            scales: {
                x: {
                    ticks: {
                        color: this.textColor,
                    },
                    grid: {
                        color: this.gridColor,
                    },
                },
                y: {
                    ticks: {
                        color: this.textColor,
                    },
                    grid: {
                        color: this.gridColor,
                    },
                },
            },
        };
    }

    getTeamColor(teamName) {
        const palette = {
            "Red Bull Racing": "#4781D7",
            Ferrari: "#ED1131",
            Mercedes: "#00D7B6",
            McLaren: "#F47600",
            "Aston Martin": "#229971",
            Alpine: "#00A1E8",
            Williams: "#1868DB",
            "Racing Bulls": "#6C98FF",
            Audi: "#F50537",
            Cadillac: "#909090",
            "Haas F1 Team": "#9C9FA2",
        };
        return palette[teamName] || "#8b949e";
    }

    getDriverShades(baseHex, count) {
        if (count <= 1) return [baseHex];
        const shades = [];
        const step = 60 / Math.max(1, count - 1);
        for (let i = 0; i < count; i++) {
            const shift = Math.round(-30 + i * step);
            shades.push(this.adjustColor(baseHex, shift));
        }
        return shades;
    }

    adjustColor(color, amount) {
        const hex = color.replace(/^#/, "");
        const num = parseInt(hex, 16);
        let r = (num >> 16) + amount;
        let g = ((num >> 8) & 0x00ff) + amount;
        let b = (num & 0x0000ff) + amount;

        r = Math.min(255, Math.max(0, r));
        g = Math.min(255, Math.max(0, g));
        b = Math.min(255, Math.max(0, b));

        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }
}
