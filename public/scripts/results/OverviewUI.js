class OverviewUI {
    static RACE_LIKE_TYPES = new Set(["race", "sprint", "sprint race"]);

    constructor(resultsUI) {
        this.ui = resultsUI;
    }

    getStore() {
        return this.ui.sessionData?.overviewStore || null;
    }

    isRaceLike() {
        const type = String(this.ui.sessionType || "")
            .toLowerCase()
            .trim();
        return OverviewUI.RACE_LIKE_TYPES.has(type);
    }

    getStintCounter() {
        const tyreStore = this.ui.sessionData?.tyreStore;
        if (!tyreStore) return () => 0;
        return (driverId) => tyreStore.getStintsByDriver(driverId).length;
    }

    getPitLapsMap(driverId) {
        const tyreStore = this.ui.sessionData?.tyreStore;
        const pitMap = new Map();
        if (!tyreStore) return pitMap;

        const stints = tyreStore.getStintsByDriver(driverId);
        let cumulative = 0;
        stints.slice(0, -1).forEach((stint, index) => {
            cumulative += Number(stint.ActualLapsDriven || stint.TotalLaps || 0);
            const nextStint = stints[index + 1];
            const tyresNotChanged = nextStint?.TyresNotChanged;
            const isChanged = tyresNotChanged !== true && String(tyresNotChanged).toLowerCase() !== "true";

            if (cumulative > 0 && nextStint && isChanged) {
                const compound = nextStint.Compound || nextStint.New || "UNKNOWN";
                pitMap.set(cumulative, compound);
            }
        });
        return pitMap;
    }

    formatLap(seconds) {
        if (!Number.isFinite(seconds)) return "—";
        return this.ui.formatSecondsToLapTime(seconds);
    }

    formatSector(seconds) {
        if (!Number.isFinite(seconds)) return "—";
        return seconds >= 60 ? this.formatLap(seconds) : seconds.toFixed(3);
    }

    createCell(text, className) {
        const cell = document.createElement("td");
        cell.textContent =
            text === null || text === undefined ? "—" : String(text);
        if (className) cell.className = className;
        return cell;
    }

    createSection(titleText) {
        const container = document.createElement("div");
        container.className = "overview-section";
        const title = document.createElement("h2");
        title.className = "ui-section-title";
        title.textContent = titleText;
        container.appendChild(title);
        return container;
    }

    getBestClass(value, overall) {
        if (!Number.isFinite(value)) return "";
        if (overall && Math.abs(value - overall.time) < 1e-9)
            return "time-overall-best";
        return "time-personal-best";
    }

    createDriverCell(summary) {
        const cell = document.createElement("td");
        cell.className = "overview-driver";

        const swatch = document.createElement("span");
        swatch.className = "overview-swatch";
        swatch.style.backgroundColor = summary.driver.colour;

        const code = document.createElement("span");
        code.className = "overview-code";
        code.textContent = summary.driver.code;

        const name = document.createElement("span");
        name.className = "overview-name";
        name.textContent = summary.driver.name;

        cell.appendChild(swatch);
        cell.appendChild(code);
        cell.appendChild(name);
        return cell;
    }

    createRow(summary, bests, raceLike) {
        const row = document.createElement("tr");
        row.appendChild(this.createCell(summary.rank, "overview-rank"));
        if (raceLike) row.appendChild(this.createCell(summary.grid));
        row.appendChild(this.createDriverCell(summary));
        row.appendChild(this.createCell(summary.driver.team, "overview-team"));
        row.appendChild(this.createCell(summary.laps || null));

        const lapClass = this.getBestClass(summary.bestLap, bests.lap);
        row.appendChild(
            this.createCell(this.formatLap(summary.bestLap), lapClass),
        );
        row.appendChild(this.createCell(summary.gap));
        row.appendChild(this.createCell(summary.interval));

        summary.bestSectors.forEach((value, index) => {
            const className = this.getBestClass(value, bests.sectors[index]);
            row.appendChild(
                this.createCell(this.formatSector(value), className),
            );
        });

        const idealCell = this.createCell(this.formatLap(summary.ideal));
        if (summary.idealDelta !== null && summary.idealDelta > 0.0005) {
            idealCell.title = `Best lap is ${summary.idealDelta.toFixed(3)}s slower than the ideal lap`;
        }
        row.appendChild(idealCell);
        row.appendChild(this.createCell(summary.pitStops));
        return row;
    }

    renderClassification(summaries, bests, raceLike) {
        const container = this.createSection("Session Classification");
        const headers = ["Pos"];
        if (raceLike) headers.push("Grid");
        headers.push(
            "Driver",
            "Team",
            "Laps",
            "Best Lap",
            "Gap",
            "Interval",
            "Best S1",
            "Best S2",
            "Best S3",
            "Ideal Lap",
            raceLike ? "Pit Stops" : "Stints",
        );

        const wrapper = document.createElement("div");
        wrapper.className = "table-wrapper";
        const table = document.createElement("table");
        table.className = "stint-stats-table overview-table";
        table.appendChild(this.ui.createTableHead(headers));

        const tbody = document.createElement("tbody");
        summaries.forEach((summary) => {
            tbody.appendChild(this.createRow(summary, bests, raceLike));
        });
        table.appendChild(tbody);
        wrapper.appendChild(table);
        container.appendChild(wrapper);
        return container;
    }

    renderKpis(store, summaries, bests, raceLike) {
        const kpis = document.createElement("div");
        kpis.className = "kpi-grid";

        const driverCode = (driverId) =>
            driverId ? store.getDriver(driverId).code : "";
        const sectorKpi = (index) =>
            bests.sectors[index]
                ? [
                      `Best S${index + 1}`,
                      this.formatSector(bests.sectors[index].time),
                      driverCode(bests.sectors[index].driverId),
                  ]
                : [`Best S${index + 1}`, "N/A", "No sector data"];

        const items = [
            [
                "Fastest Lap",
                bests.lap ? this.formatLap(bests.lap.time) : "N/A",
                bests.lap
                    ? `${driverCode(bests.lap.driverId)} · lap ${bests.lap.lap}`
                    : "No lap data",
            ],
            sectorKpi(0),
            sectorKpi(1),
            sectorKpi(2),
            [
                "Ideal Lap",
                bests.ideal !== null ? this.formatLap(bests.ideal) : "N/A",
                "Sum of the best sectors",
            ],
            ["Session Laps", store.getMaxLap(), `${summaries.length} drivers`],
        ];

        if (raceLike) {
            const stops = summaries.reduce(
                (sum, s) => sum + (s.pitStops || 0),
                0,
            );
            items.push([
                "Lead Changes",
                store.calculateLeadChanges(),
                "Including the first lap",
            ]);
            items.push(["Pit Stops", stops, "Total recorded stops"]);
        }

        items.forEach((item) => {
            kpis.appendChild(this.ui.createKpi(item[0], item[1], item[2]));
        });
        return kpis;
    }

    renderPositionSection(store, summaries) {
        const container = this.createSection("Position Chart");
        const history = store.getPositionHistory();

        if (!Object.keys(history).length) {
            container.appendChild(
                this.ui.createEmptyState(
                    "No lap-by-lap position data available.",
                ),
            );
            return container;
        }

        const controls = document.createElement("div");
        controls.className = "overview-controls";
        [
            ["All", () => summaries.length],
            ["Top 10", () => 10],
            ["Top 5", () => 5],
        ].forEach(([label, limit]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "overview-control";
            button.textContent = label;
            button.addEventListener("click", () =>
                this.showTopDatasets(limit()),
            );
            controls.appendChild(button);
        });
        container.appendChild(controls);

        const grid = document.createElement("div");
        grid.className = "charts-grid";
        grid.appendChild(
            this.ui.createChartCard(
                "Position by Lap",
                "overviewPositionChart",
                true,
            ),
        );
        container.appendChild(grid);
        return container;
    }

    showTopDatasets(count) {
        const chart = this.ui.charts.overviewPosition;
        if (!chart) return;
        chart.data.datasets.forEach((_, index) => {
            chart.setDatasetVisibility(index, index < count);
        });
        chart.update();
    }

    static TYRE_SVG_ICONS = {
        SOFT: "../../img/tyre_soft.svg",
        MEDIUM: "../../img/tyre_medium.svg",
        HARD: "../../img/tyre_hard.svg",
        INTERMEDIATE: "../../img/tyre_intermediate.svg",
        WET: "../../img/tyre_wet.svg",
        UNKNOWN: "../../img/tyre_unknown.svg",
    };

    static tyreImageCache = new Map();

    getTyreImage(compound) {
        const key = (compound || "UNKNOWN").toUpperCase();
        if (OverviewUI.tyreImageCache.has(key))
            return OverviewUI.tyreImageCache.get(key);

        const img = new Image(18, 18);
        img.src =
            OverviewUI.TYRE_SVG_ICONS[key] || OverviewUI.TYRE_SVG_ICONS.UNKNOWN;
        OverviewUI.tyreImageCache.set(key, img);
        return img;
    }

    hexToRgba(hex, alpha = 0.5) {
        if (!hex) return `rgba(128, 128, 128, ${alpha})`;
        let c = hex.replace("#", "");
        if (c.length === 3)
            c = c
                .split("")
                .map((x) => x + x)
                .join("");
        const num = parseInt(c, 16);
        return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
    }

    getCssVariable(varName, fallback) {
        const val = getComputedStyle(document.body)
            .getPropertyValue(varName)
            .trim();
        return val || fallback;
    }

    buildPositionDatasets(store, summaries) {
        const history = store.getPositionHistory();
        const seenTeams = new Map();
        const datasets = [];

        summaries.forEach((summary) => {
            const points = history[summary.id];
            if (!points) return;

            const team = summary.driver.team || summary.id;
            const order = seenTeams.get(team) || 0;
            seenTeams.set(team, order + 1);

            const pitLapsMap = this.getPitLapsMap(summary.id);

            const borderDash = order === 0 ? [] : [6, 6];
            const borderWidth = order === 0 ? 3 : 2;

            const pointStyles = [];
            const pointRadii = [];

            points.forEach((pt) => {
                if (pitLapsMap.has(pt.x)) {
                    const compound = pitLapsMap.get(pt.x);
                    pointStyles.push(this.getTyreImage(compound));
                    pointRadii.push(9);
                } else {
                    pointStyles.push("circle");
                    pointRadii.push(0);
                }
            });

            const solidColor = summary.driver.colour;
            const transparentBg = this.hexToRgba(solidColor, 0.5);

            datasets.push({
                label: summary.driver.code,
                data: points,
                borderColor: solidColor,
                backgroundColor: transparentBg,
                borderWidth: borderWidth,
                borderDash: borderDash,
                tension: 0,
                spanGaps: false,
                pointStyle: pointStyles,
                pointRadius: pointRadii,
                pointHoverRadius: 10,
            });
        });

        return datasets;
    }

    renderPositionChart(store, summaries) {
        const canvas = document.getElementById("overviewPositionChart");
        if (!canvas) return;

        if (canvas.parentElement) {
            canvas.parentElement.style.height = "650px";
        }

        if (this.ui.charts.overviewPosition) {
            this.ui.charts.overviewPosition.destroy();
        }

        const datasets = this.buildPositionDatasets(store, summaries);
        if (!datasets.length) {
            this.ui.renderChartEmpty(
                canvas,
                "No lap-by-lap position data available.",
            );
            return;
        }

        const textColorGetter = () =>
            this.getCssVariable(
                "--chart-text-color",
                document.body.classList.contains("light-mode")
                    ? "#212529"
                    : "#FFFFFF",
            );
        const gridColorGetter = () =>
            this.getCssVariable(
                "--chart-grid-color",
                document.body.classList.contains("light-mode")
                    ? "rgba(0, 0, 0, 0.1)"
                    : "rgba(255, 255, 255, 0.1)",
            );

        this.ui.charts.overviewPosition = new Chart(canvas, {
            type: "line",
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                parsing: false,
                interaction: { mode: "nearest", axis: "x", intersect: false },
                scales: {
                    x: {
                        type: "linear",
                        min: 0,
                        max: store.getMaxLap(),
                        title: {
                            display: true,
                            text: "Lap",
                            color: () => textColorGetter(),
                        },
                        ticks: {
                            stepSize: 1,
                            precision: 0,
                            color: () => textColorGetter(),
                            callback: (value) => {
                                if (!Number.isInteger(value)) return "";
                                return value === 0 ? "Grid" : value;
                            },
                        },
                        grid: { color: () => gridColorGetter() },
                    },
                    y: {
                        type: "linear",
                        reverse: true,
                        min: 0.5,
                        max: datasets.length + 0.5,
                        title: {
                            display: true,
                            text: "Position",
                            color: () => textColorGetter(),
                        },
                        ticks: {
                            stepSize: 1,
                            precision: 0,
                            color: () => textColorGetter(),
                            callback: (value) => {
                                if (!Number.isInteger(value)) return "";
                                return `P${value}`;
                            },
                        },
                        grid: { color: () => gridColorGetter() },
                    },
                },
                plugins: {
                    legend: {
                        labels: {
                            color: () => textColorGetter(),
                            usePointStyle: true,
                            generateLabels: (chart) => {
                                const original =
                                    Chart.defaults.plugins.legend.labels
                                        .generateLabels;
                                const labels = original(chart);
                                labels.forEach((label) => {
                                    const dataset =
                                        chart.data.datasets[label.datasetIndex];
                                    if (
                                        dataset.borderDash &&
                                        dataset.borderDash.length > 0
                                    ) {
                                        label.lineDash = dataset.borderDash;
                                    }
                                });
                                return labels;
                            },
                        },
                    },
                    tooltip: {
                        itemSort: (a, b) => a.parsed.y - b.parsed.y,
                        callbacks: {
                            title: (items) => {
                                const lap = items[0]?.parsed.x;
                                return lap === 0 ? "Grid" : `Lap ${lap}`;
                            },
                            label: (context) =>
                                `${context.dataset.label}: P${context.parsed.y}`,
                        },
                    },
                    zoom: this.ui.getZoomOptions(),
                },
            },
        });
    }

    render(contentContainer) {
        const store = this.getStore();
        const raceLike = this.isRaceLike();

        const card = document.createElement("div");
        card.className = "ui-card";

        const title = document.createElement("h2");
        title.className = "ui-section-title";
        title.textContent = "Overview";
        card.appendChild(title);

        if (!store || !store.hasData()) {
            card.appendChild(
                this.ui.createEmptyState("No session data available."),
            );
            contentContainer.appendChild(card);
            return;
        }

        const note = document.createElement("div");
        note.className = "ui-card-subtitle";
        note.textContent = raceLike
            ? "Classification by finishing position. Best sector and lap columns are each driver's personal best; purple marks the session best. Ideal lap is the sum of a driver's best sectors."
            : "Classification by best lap. Best sector columns are each driver's personal best; purple marks the session best. Ideal lap is the sum of a driver's best sectors.";
        card.appendChild(note);

        const summaries = store.calculateSummaries({
            raceLike,
            stintCount: this.getStintCounter(),
        });
        const bests = store.calculateSessionBests();

        card.appendChild(this.renderKpis(store, summaries, bests, raceLike));
        card.appendChild(this.renderClassification(summaries, bests, raceLike));

        if (raceLike) {
            card.appendChild(this.renderPositionSection(store, summaries));
        }

        contentContainer.appendChild(card);

        if (raceLike) {
            this.renderPositionChart(store, summaries);
        }
    }
}
