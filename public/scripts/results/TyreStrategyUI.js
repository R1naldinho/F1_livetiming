class TyreStrategyUI {
    constructor(resultsUI) {
        this.ui = resultsUI;
    }

    prepareTyreDataset(dataset) {
        const totalLaps = this.ui.getMaxSessionLaps(dataset);
        const useFuelCorrection = this.ui.sessionType === "race";
        const all = [];

        Object.values(dataset).forEach((driver) => {
            (driver.laps || []).forEach((lap) => {
                if (
                    !Number.isFinite(Number(lap.lapTime)) ||
                    Number(lap.lapTime) <= 0
                )
                    return;
                lap.rawLapTime = Number(lap.lapTime);
                lap.fuelKgRemaining = useFuelCorrection
                    ? this.getFuelRemaining(lap.lap, totalLaps)
                    : 0;
                lap.fuelCorrection = lap.fuelKgRemaining * 0.03;
                lap.fuelCorrectedLapTime = lap.rawLapTime - lap.fuelCorrection;
                lap.lapTime = lap.fuelCorrectedLapTime;
                lap.isFirstRaceLap = Number(lap.lap) === 1;
                lap.isExcludedWarmup =
                    lap.isFirstRaceLap ||
                    Boolean(lap.isPitOut) ||
                    Boolean(lap.isWarmupLap) ||
                    Boolean(lap.isPitIn);
                lap.is107Valid = false;
                lap.isCleanLap = false;
                lap.isValidPaceLap = false;
                all.push(lap);
            });
        });

        Object.values(dataset).forEach((driver) => {
            const byStint = {};
            (driver.laps || []).forEach((lap) => {
                const key = `${lap.stint}`;
                if (!byStint[key]) byStint[key] = [];
                if (
                    !lap.isExcludedWarmup &&
                    Number.isFinite(lap.lapTime) &&
                    lap.lapTime > 0
                )
                    byStint[key].push(lap);
            });

            Object.values(byStint).forEach((stintLaps) => {
                if (!stintLaps.length) return;
                const best = Math.min(...stintLaps.map((lap) => lap.lapTime));
                const threshold = best * 1.07;
                stintLaps.forEach((lap) => {
                    lap.stintBestLap = best;
                    lap.stint107Threshold = threshold;
                    lap.is107Valid = lap.lapTime <= threshold;
                    lap.isCleanLap = lap.is107Valid && !lap.isExcludedWarmup;
                    lap.isValidPaceLap = lap.isCleanLap;
                });
            });
        });

        Object.values(dataset).forEach((driver) => {
            (driver.laps || []).forEach((lap) => {
                if (!lap.stintBestLap) {
                    lap.is107Valid = false;
                    lap.isCleanLap = false;
                    lap.isValidPaceLap = false;
                }
            });
        });
    }

    getFuelRemaining(raceLap, totalLaps) {
        const lap = Number(raceLap);
        const laps = Number(totalLaps);
        if (!Number.isFinite(lap) || !Number.isFinite(laps) || laps <= 1)
            return 0;
        return Math.max(0, Math.min(110, 110 * (1 - (lap - 1) / (laps - 1))));
    }

    calculateTyreRegression(points) {
        if (!points || points.length < 2) return null;
        let sx = 0,
            sy = 0,
            sxy = 0,
            sxx = 0;
        points.forEach((point) => {
            sx += point.x;
            sy += point.y;
            sxy += point.x * point.y;
            sxx += point.x * point.x;
        });
        const n = points.length;
        const denominator = n * sxx - sx * sx;
        if (!denominator) return null;
        const slope = (n * sxy - sx * sy) / denominator;
        const intercept = (sy - slope * sx) / n;
        return { slope, intercept };
    }

    lowess(points, bandwidth = 0.35) {
        if (!points || points.length < 3) return [];
        const sorted = points.slice().sort((a, b) => a.x - b.x);
        const n = sorted.length;
        const span = Math.max(
            2,
            Math.ceil(n * Math.max(0.05, Math.min(1, bandwidth))),
        );
        const rawSmooth = sorted.map((point) => {
            const distances = sorted
                .map((p, i) => ({ i, d: Math.abs(p.x - point.x) }))
                .sort((a, b) => a.d - b.d);
            const maxDistance =
                distances[Math.min(span - 1, distances.length - 1)].d || 1;
            let sw = 0,
                swx = 0,
                swy = 0,
                swxx = 0,
                swxy = 0;
            distances.slice(0, span).forEach((item) => {
                const p = sorted[item.i];
                const u = item.d / maxDistance;
                const w = Math.pow(1 - Math.pow(u, 3), 3);
                sw += w;
                swx += w * p.x;
                swy += w * p.y;
                swxx += w * p.x * p.x;
                swxy += w * p.x * p.y;
            });
            const denominator = sw * swxx - swx * swx;
            const slope =
                Math.abs(denominator) > 1e-9
                    ? (sw * swxy - swx * swy) / denominator
                    : 0;
            const intercept = sw ? (swy - slope * swx) / sw : point.y;
            return { x: point.x, y: intercept + slope * point.x };
        });

        const grouped = {};
        rawSmooth.forEach((p) => {
            const k = Math.round(p.x);
            if (!grouped[k]) grouped[k] = { sumY: 0, count: 0 };
            grouped[k].sumY += p.y;
            grouped[k].count += 1;
        });

        return Object.keys(grouped)
            .map(Number)
            .sort((a, b) => a - b)
            .map((x) => ({ x, y: grouped[x].sumY / grouped[x].count }));
    }

    getTyreDegradationStats() {
        const groups = this.ui.getTyreCompoundData();
        const result = {};
        Object.entries(groups).forEach(([compound, laps]) => {
            if (laps.length < 3) return;
            const points = laps
                .map((lap) => ({
                    x: Number(lap.tyreAge),
                    y: Number(lap.lapTime),
                }))
                .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
            const regression = this.calculateTyreRegression(points);
            const smooth = this.lowess(points);
            if (!regression) return;
            const atAge = (age) => {
                if (!smooth.length)
                    return regression.intercept + regression.slope * age;
                let nearest = smooth.reduce(
                    (best, point) =>
                        Math.abs(point.x - age) < Math.abs(best.x - age)
                            ? point
                            : best,
                    smooth[0],
                );
                return nearest.y;
            };
            const ages = points.map((p) => p.x);
            result[compound] = {
                compound,
                samples: points.length,
                drivers: new Set(laps.map((lap) => lap.driverId)).size,
                stints: new Set(
                    laps.map((lap) => `${lap.driverId}-${lap.stint}`),
                ).size,
                bestLap: Math.min(...points.map((p) => p.y)),
                average:
                    points.reduce((sum, p) => sum + p.y, 0) / points.length,
                medianAge: this.ui.calculatePercentile(ages, 50),
                degradationPerLap: regression.slope,
                lowess: smooth,
                paceAt1: atAge(1),
                paceAt5: atAge(5),
                paceAt10: atAge(10),
                ageMin: Math.min(...ages),
                ageMax: Math.max(...ages),
            };
        });
        return result;
    }

    render(contentContainer) {
        const dataset = this.ui.getDataset();
        const validLaps = this.ui.getValidPaceLaps();
        const allLaps = this.ui.getAllLaps();
        const stats = this.getTyreDegradationStats();
        const stints = [];
        const strategies = {};
        let pitStops = 0;

        Object.entries(dataset).forEach(([driverId, driver]) => {
            pitStops += Number(driver.pitStops) || 0;
            const strategy = driver.strategyString || "UNKNOWN";
            strategies[strategy] = (strategies[strategy] || 0) + 1;
            (driver.stints || []).forEach((stint) => {
                const stintLaps = (driver.laps || []).filter(
                    (lap) => lap.stint === stint.stintNumber,
                );
                const clean = stintLaps.filter((lap) => lap.isValidPaceLap);
                const times = clean
                    .map((lap) => Number(lap.lapTime))
                    .filter(Number.isFinite);
                const regression = this.calculateTyreRegression(
                    clean
                        .map((lap) => ({
                            x: Number(lap.tyreAge),
                            y: Number(lap.lapTime),
                        }))
                        .filter(
                            (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
                        ),
                );
                stints.push({
                    driverId,
                    driver: driver.driverName,
                    stint: stint.stintNumber,
                    compound: stint.compound,
                    startLap: stint.startLap,
                    endLap: stint.endLap,
                    laps: stint.lapsDriven,
                    valid: times.length,
                    best: times.length ? Math.min(...times) : null,
                    average: times.length
                        ? times.reduce((a, b) => a + b, 0) / times.length
                        : null,
                    degradation: regression?.slope ?? null,
                    startAge: stint.startTyreAge,
                    endAge: stint.endTyreAge,
                    isNew: stint.isNew,
                });
            });
        });

        const card = document.createElement("div");
        card.className = "ui-card";

        const title = document.createElement("h2");
        title.className = "ui-section-title";
        title.textContent = "Tyres & Strategy";
        card.appendChild(title);

        const note = document.createElement("div");
        note.className = "ui-card-subtitle";
        note.textContent =
            this.ui.sessionType === "race"
                ? "Lap 1 and pit-in/out laps excluded. Each driver-stint uses its own 107% reference. Race pace is corrected for an assumed 110 kg → 0 kg fuel load at 0.03 s/kg."
                : "Lap 1 and pit-in/out laps excluded. Each driver-stint uses its own 107% reference. Fuel correction is not applied to non-race sessions.";
        card.appendChild(note);

        const kpis = document.createElement("div");
        kpis.className = "kpi-grid";
        const compounds = Object.keys(stats);
        const medianDegradation = compounds.length
            ? this.ui.calculatePercentile(
                  compounds.map((c) => stats[c].degradationPerLap),
                  50,
              )
            : null;
        [
            [
                "Valid Pace Laps",
                validLaps.length,
                "After stint-level filtering",
            ],
            [
                "Excluded Laps",
                Math.max(0, allLaps.length - validLaps.length),
                "Lap 1, pit laps and >107%",
            ],
            ["Tyre Compounds", compounds.length, "With usable samples"],
            ["Tyre Stints", stints.length, "Across all drivers"],
            ["Pit Stops", pitStops, "Total recorded changes"],
            [
                "Median Degradation",
                medianDegradation !== null
                    ? `${medianDegradation.toFixed(3)} s/lap`
                    : "N/A",
                "Regression on tyre age",
            ],
        ].forEach((item) =>
            kpis.appendChild(this.ui.createKpi(item[0], item[1], item[2])),
        );
        card.appendChild(kpis);

        const heatTitle = document.createElement("h2");
        heatTitle.className = "ui-section-title";
        heatTitle.textContent = "Strategy Timeline";
        card.appendChild(heatTitle);
        card.appendChild(
            this.ui.renderProportionalStintHeatmap(
                this.ui.sessionData.tyreStore,
                this.ui.sessionData.driverStore,
                this.ui.getMaxSessionLaps(dataset),
                dataset,
            ),
        );

        const grid = document.createElement("div");
        grid.className = "charts-grid";
        grid.appendChild(
            this.ui.createChartCard(
                "Fuel-Corrected Pace & LOWESS Degradation",
                "tyreLowessChart",
                true,
            ),
        );
        grid.appendChild(
            this.ui.createChartCard(
                "Compound Pace by Tyre Age",
                "compoundAgeChart",
                true,
            ),
        );
        grid.appendChild(
            this.ui.createChartCard(
                "Compound Pace Comparison",
                "compoundPaceChart",
                true,
            ),
        );
        grid.appendChild(
            this.ui.createChartCard("Strategy Usage", "tyreStrategyUsageChart"),
        );
        grid.appendChild(this.ui.createChartCard("Tyre Usage", "tyreUsageChart"));
        grid.appendChild(
            this.ui.createChartCard(
                "Pit Stop Distribution",
                "tyrePitDistributionChart",
            ),
        );
        card.appendChild(grid);

        card.appendChild(this.renderTyreDegradationTable(stats));
        card.appendChild(this.renderStintAnalysisTable(stints));
        card.appendChild(
            this.renderStrategyAnalysisTable(strategies, dataset),
        );

        contentContainer.appendChild(card);

        this.renderTyreLowessChart(stats);
        this.renderCompoundAgeChart(stats);
        this.renderCompoundPaceChart(stats);
        this.renderTyreStrategyUsageChart(strategies);
        this.renderTyreUsageChart(dataset);
        this.renderTyrePitDistributionChart(dataset);
    }

    renderTyreDegradationTable(stats) {
        const container = document.createElement("div");
        container.style.marginTop = "28px";
        const title = document.createElement("h2");
        title.className = "ui-section-title";
        title.textContent = "Compound Degradation Model";
        container.appendChild(title);
        const entries = Object.values(stats).sort(
            (a, b) => a.degradationPerLap - b.degradationPerLap,
        );
        if (!entries.length) {
            container.appendChild(
                this.ui.createEmptyState(
                    "Not enough clean laps to model degradation.",
                ),
            );
            return container;
        }
        const wrapper = document.createElement("div");
        wrapper.className = "table-wrapper";
        const table = document.createElement("table");
        table.className = "stint-stats-table";
        table.appendChild(
            this.ui.createTableHead([
                "Compound",
                "Samples",
                "Stints",
                "Drivers",
                "Pace @ Age 1",
                "Pace @ Age 5",
                "Pace @ Age 10",
                "Degradation",
                "Age Range",
            ]),
        );
        const tbody = document.createElement("tbody");
        entries.forEach((data) => {
            const row = document.createElement("tr");
            this.ui.appendCell(row, data.compound);
            this.ui.appendCell(row, data.samples);
            this.ui.appendCell(row, data.stints);
            this.ui.appendCell(row, data.drivers);
            this.ui.appendCell(
                row,
                this.ui.formatSecondsToLapTime(data.paceAt1),
            );
            this.ui.appendCell(
                row,
                this.ui.formatSecondsToLapTime(data.paceAt5),
            );
            this.ui.appendCell(
                row,
                this.ui.formatSecondsToLapTime(data.paceAt10),
            );
            this.ui.appendCell(row, `${data.degradationPerLap.toFixed(3)} s/lap`);
            this.ui.appendCell(row, `${data.ageMin}–${data.ageMax}`);
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        wrapper.appendChild(table);
        container.appendChild(wrapper);
        return container;
    }

    renderStintAnalysisTable(stints) {
        const container = document.createElement("div");
        container.style.marginTop = "28px";
        const title = document.createElement("h2");
        title.className = "ui-section-title";
        title.textContent = "Stint Analysis";
        container.appendChild(title);
        const entries = stints
            .filter((s) => s.valid > 0)
            .sort((a, b) => a.startLap - b.startLap);
        if (!entries.length) {
            container.appendChild(
                this.ui.createEmptyState("No valid stint data available."),
            );
            return container;
        }
        const wrapper = document.createElement("div");
        wrapper.className = "table-wrapper";
        const table = document.createElement("table");
        table.className = "stint-stats-table";
        table.appendChild(
            this.ui.createTableHead([
                "Driver",
                "Stint",
                "Compound",
                "New",
                "Laps",
                "Valid",
                "Best",
                "Average",
                "Degradation",
                "Tyre Age",
            ]),
        );
        const tbody = document.createElement("tbody");
        entries.forEach((stint) => {
            const row = document.createElement("tr");
            this.ui.appendCell(row, stint.driver);
            this.ui.appendCell(row, stint.stint);
            this.ui.appendCell(row, stint.compound);
            this.ui.appendCell(row, stint.isNew ? "Yes" : "Used");
            this.ui.appendCell(row, stint.laps);
            this.ui.appendCell(row, stint.valid);
            this.ui.appendCell(row, this.ui.formatSecondsToLapTime(stint.best));
            this.ui.appendCell(
                row,
                this.ui.formatSecondsToLapTime(stint.average),
            );
            this.ui.appendCell(
                row,
                stint.degradation !== null
                    ? `${stint.degradation.toFixed(3)} s/lap`
                    : "N/A",
            );
            this.ui.appendCell(row, `${stint.startAge}–${stint.endAge}`);
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        wrapper.appendChild(table);
        container.appendChild(wrapper);
        return container;
    }

    renderStrategyAnalysisTable(strategies, dataset) {
        const container = document.createElement("div");
        container.style.marginTop = "28px";
        const title = document.createElement("h2");
        title.className = "ui-section-title";
        title.textContent = "Strategy Analysis";
        container.appendChild(title);
        const entries = Object.entries(strategies).sort((a, b) => b[1] - a[1]);
        if (!entries.length) {
            container.appendChild(
                this.ui.createEmptyState("No strategy data available."),
            );
            return container;
        }
        const wrapper = document.createElement("div");
        wrapper.className = "table-wrapper";
        const table = document.createElement("table");
        table.className = "stint-stats-table";
        table.appendChild(
            this.ui.createTableHead([
                "Strategy",
                "Drivers",
                "Stops",
                "Avg Valid Pace",
                "Valid Laps",
                "Median Degradation",
            ]),
        );
        const tbody = document.createElement("tbody");
        entries.forEach(([strategy, count]) => {
            const matching = Object.values(dataset).filter(
                (driver) => (driver.strategyString || "UNKNOWN") === strategy,
            );
            const laps = matching.flatMap((driver) =>
                (driver.laps || []).filter((lap) => lap.isValidPaceLap),
            );
            const times = laps
                .map((lap) => Number(lap.lapTime))
                .filter(Number.isFinite);
            const stintSlopes = [];
            matching.forEach((driver) => {
                const groups = {};
                (driver.laps || [])
                    .filter((lap) => lap.isValidPaceLap)
                    .forEach((lap) => {
                        if (!groups[lap.stint]) groups[lap.stint] = [];
                        groups[lap.stint].push({
                            x: Number(lap.tyreAge),
                            y: Number(lap.lapTime),
                        });
                    });
                Object.values(groups).forEach((points) => {
                    const regression = this.calculateTyreRegression(points);
                    if (regression) stintSlopes.push(regression.slope);
                });
            });
            const avg = times.length
                ? times.reduce((a, b) => a + b, 0) / times.length
                : null;
            const degradation = stintSlopes.length
                ? this.ui.calculatePercentile(stintSlopes, 50)
                : null;
            const stops = matching.length
                ? Math.max(
                      ...matching.map((driver) => Number(driver.pitStops) || 0),
                  )
                : 0;
            const row = document.createElement("tr");
            this.ui.appendCell(row, strategy);
            this.ui.appendCell(row, count);
            this.ui.appendCell(row, stops);
            this.ui.appendCell(row, this.ui.formatSecondsToLapTime(avg));
            this.ui.appendCell(row, laps.length);
            this.ui.appendCell(
                row,
                degradation !== null
                    ? `${degradation.toFixed(3)} s/lap`
                    : "N/A",
            );
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        wrapper.appendChild(table);
        container.appendChild(wrapper);
        return container;
    }

    renderTyreLowessChart(stats) {
        const canvas = document.getElementById("tyreLowessChart");
        if (!canvas) return;
        const datasets = [];
        const rawCompoundData = this.ui.getTyreCompoundData();

        Object.entries(stats).forEach(([compound, data]) => {
            const color = this.ui.getTyreCompoundColor(compound);
            const points = (rawCompoundData[compound] || [])
                .map((lap) => ({
                    x: Number(lap.tyreAge),
                    y: Number(lap.lapTime),
                }))
                .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

            datasets.push({
                label: `${compound} Laps`,
                data: points,
                type: "scatter",
                backgroundColor: color,
                borderColor: color,
                pointRadius: 2,
                showLine: false,
            });

            datasets.push({
                label: `${compound} LOWESS`,
                data: data.lowess,
                type: "line",
                borderColor: color,
                backgroundColor: color,
                pointRadius: 0,
                borderWidth: 3,
                tension: 0.15,
            });
        });

        this.ui.charts.tyreLowess = new Chart(canvas, {
            type: "scatter",
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                parsing: false,
                interaction: {
                    mode: "nearest",
                    axis: "xy",
                    intersect: false,
                },
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: "Tyre Life (laps)" },
                    },
                    y: {
                        title: {
                            display: true,
                            text: "Fuel-corrected lap time",
                        },
                        ticks: {
                            callback: (value) =>
                                this.ui.formatSecondsToLapTime(value),
                        },
                    },
                },
                plugins: {
                    legend: { labels: { color: "rgba(148,158,174,0.9)" } },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.dataset.label || "";
                                const val =
                                    context.parsed.y !== undefined
                                        ? context.parsed.y
                                        : context.raw.y;
                                const age =
                                    context.parsed.x !== undefined
                                        ? context.parsed.x
                                        : context.raw.x;
                                return `${label}: Age ${age} — ${this.ui.formatSecondsToLapTime(val)}`;
                            },
                        },
                    },
                    zoom: this.ui.getZoomOptions(),
                },
            },
        });
    }

    renderCompoundAgeChart(stats) {
        const canvas = document.getElementById("compoundAgeChart");
        if (!canvas) return;
        const datasets = [];
        Object.entries(stats).forEach(([compound, data]) =>
            datasets.push({
                label: compound,
                data: data.lowess,
                borderColor: this.ui.getTyreCompoundColor(compound),
                backgroundColor: this.ui.getTyreCompoundColor(compound),
                pointRadius: 2,
                borderWidth: 3,
                tension: 0.15,
            }),
        );
        this.ui.charts.compoundAge = new Chart(canvas, {
            type: "line",
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                parsing: false,
                interaction: {
                    mode: "index",
                    axis: "x",
                    intersect: false,
                },
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: "Tyre Life (laps)" },
                    },
                    y: {
                        title: {
                            display: true,
                            text: "Fuel-corrected lap time",
                        },
                        ticks: {
                            callback: (value) =>
                                this.ui.formatSecondsToLapTime(value),
                        },
                    },
                },
                plugins: {
                    legend: { labels: { color: "rgba(148,158,174,0.9)" } },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.dataset.label || "";
                                const val = context.parsed.y;
                                return `${label}: ${this.ui.formatSecondsToLapTime(val)}`;
                            },
                        },
                    },
                    zoom: this.ui.getZoomOptions(),
                },
            },
        });
    }

    renderCompoundPaceChart(stats) {
        const canvas = document.getElementById("compoundPaceChart");
        if (!canvas) return;
        const entries = Object.values(stats).sort(
            (a, b) => a.paceAt1 - b.paceAt1,
        );
        this.ui.charts.compoundPace = new Chart(canvas, {
            type: "bar",
            data: {
                labels: entries.map((e) => e.compound),
                datasets: [
                    {
                        label: "Estimated pace at tyre age 1",
                        data: entries.map((e) => e.paceAt1),
                        backgroundColor: entries.map((e) =>
                            this.ui.getTyreCompoundColor(e.compound),
                        ),
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: "index",
                    intersect: false,
                },
                scales: {
                    y: {
                        ticks: {
                            callback: (value) =>
                                this.ui.formatSecondsToLapTime(value),
                        },
                    },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) =>
                                `${context.dataset.label}: ${this.ui.formatSecondsToLapTime(context.parsed.y)}`,
                        },
                    },
                },
            },
        });
    }

    renderTyreStrategyUsageChart(strategies) {
        const canvas = document.getElementById("tyreStrategyUsageChart");
        if (!canvas) return;

        const formatStrategyLabel = (label) => {
            return label
                .replace(/Medium/gi, "M")
                .replace(/Hard/gi, "H")
                .replace(/Soft/gi, "S")
                .replace(/Intermediate/gi, "I")
                .replace(/Wet/gi, "W");
        };

        const entries = Object.entries(strategies)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12);

        this.ui.charts.tyreStrategyUsage = new Chart(canvas, {
            type: "bar",
            data: {
                labels: entries.map((e) => formatStrategyLabel(e[0])),
                datasets: [
                    {
                        label: "Drivers",
                        data: entries.map((e) => e[1]),
                        backgroundColor: "#E10600",
                    },
                ],
            },
            options: {
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: "index",
                    intersect: false,
                },
                scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
                plugins: { legend: { display: false } },
            },
        });
    }

    renderTyreUsageChart(dataset) {
        const canvas = document.getElementById("tyreUsageChart");

        if (!canvas) return;

        const usage = {};

        Object.values(dataset).forEach((driver) => {
            (driver.laps || []).forEach((lap) => {
                const compound = lap.compound || "UNKNOWN";
                usage[compound] = (usage[compound] || 0) + 1;
            });
        });

        const entries = Object.entries(usage)
            .filter(([, laps]) => Number(laps) > 0)
            .sort((a, b) => b[1] - a[1]);

        if (!entries.length) {
            this.ui.renderChartEmpty(canvas, "No tyre usage data available.");
            return;
        }

        const colours = {
            SOFT: "#FF0000",
            MEDIUM: "#FFD700",
            HARD: "#FFFFFF",
            INTERMEDIATE: "#00A651",
            WET: "#0067B9",
            UNKNOWN: "#808080",
        };

        this.ui.charts.tyreUsage = new Chart(canvas, {
            type: "pie",
            data: {
                labels: entries.map(([compound]) => compound),
                datasets: [
                    {
                        data: entries.map(([, laps]) => laps),
                        backgroundColor: entries.map(
                            ([compound]) =>
                                colours[compound] || colours.UNKNOWN,
                        ),
                        borderColor: "#151515",
                        borderWidth: 2,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            color: "#FFFFFF",
                            padding: 16,
                        },
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const total = context.dataset.data.reduce(
                                    (sum, value) => sum + Number(value),
                                    0,
                                );

                                const laps = Number(context.raw);
                                const percentage = total
                                    ? ((laps / total) * 100).toFixed(1)
                                    : "0.0";

                                return `${context.label}: ${laps} laps (${percentage}%)`;
                            },
                        },
                    },
                },
            },
        });
    }

    renderTyrePitDistributionChart(dataset) {
        const canvas = document.getElementById("tyrePitDistributionChart");
        if (!canvas) return;
        const distribution = {};
        Object.values(dataset).forEach((driver) => {
            const stops = Number(driver.pitStops) || 0;
            distribution[stops] = (distribution[stops] || 0) + 1;
        });
        const entries = Object.entries(distribution).sort(
            (a, b) => Number(a[0]) - Number(b[0]),
        );
        this.ui.charts.tyrePitDistribution = new Chart(canvas, {
            type: "bar",
            data: {
                labels: entries.map(
                    (e) => `${e[0]} stop${Number(e[0]) === 1 ? "" : "s"}`,
                ),
                datasets: [
                    {
                        label: "Drivers",
                        data: entries.map((e) => e[1]),
                        backgroundColor: "#E10600",
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: "index",
                    intersect: false,
                },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                plugins: { legend: { display: false } },
            },
        });
    }
}