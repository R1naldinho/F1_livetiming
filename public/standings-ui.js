class StandingsUI {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.data = null;
        this.currentView = "drivers";
        this.driverMode = "total";
        this.chartInstance = null;

        this.initLayout();
        this.fetchStandings();
    }

    initNavbar(controlsContainer) {
        let navbar = controlsContainer.querySelector("#standingsNavbar");
        if (!navbar) {
            navbar = document.createElement("nav");
            navbar.id = "standingsNavbar";
            navbar.style.display = "flex";
            navbar.style.justifyContent = "space-between";
            navbar.style.alignItems = "center";
            navbar.style.width = "100%";
            controlsContainer.appendChild(navbar);
        } else {
            while (navbar.firstChild) navbar.removeChild(navbar.firstChild);
        }

        const navList = document.createElement("ul");
        navList.className = "nav-links";
        navList.style.display = "flex";
        navList.style.listStyle = "none";
        navList.style.margin = "0";
        navList.style.padding = "0";

        const views = [
            { id: "drivers", label: "Drivers", viewName: "drivers" },
            {
                id: "constructors",
                label: "Constructors",
                viewName: "constructors",
            },
        ];

        views.forEach((v) => {
            const li = document.createElement("li");
            const btn = document.createElement("button");
            const isActive = v.viewName && this.currentView === v.viewName;
            btn.className = `standingsNav-link ${isActive ? "active" : ""}`;
            btn.textContent = v.label;

            btn.addEventListener("click", () => {
                if (v.href) {
                    window.location.href = v.href;
                } else {
                    document
                        .querySelectorAll(".standingsNav-link")
                        .forEach((l) => l.classList.remove("active"));
                    btn.classList.add("active");
                    navList.classList.remove("open");
                    this.switchMainView(v.viewName);
                }
            });
            li.appendChild(btn);
            navList.appendChild(li);
        });

        navbar.appendChild(navList);

        this.driverControls = document.createElement("div");
        this.driverControls.className = "standings-driver-controls";

        const subToggleGroup = document.createElement("div");
        subToggleGroup.className = "standings-toggle-group";

        const totalBtn = document.createElement("button");
        totalBtn.className = "standings-toggle-btn active";
        totalBtn.textContent = "Total";

        const raceBtn = document.createElement("button");
        raceBtn.className = "standings-toggle-btn";
        raceBtn.textContent = "Race by Race";

        totalBtn.addEventListener("click", () =>
            this.switchDriverMode("total", totalBtn, raceBtn),
        );
        raceBtn.addEventListener("click", () =>
            this.switchDriverMode("race", raceBtn, totalBtn),
        );

        subToggleGroup.appendChild(totalBtn);
        subToggleGroup.appendChild(raceBtn);
        this.driverControls.appendChild(subToggleGroup);

        navbar.appendChild(this.driverControls);
    }

    initLayout() {
        const existingControls = this.container.querySelector(
            ".standings-controls",
        );
        if (existingControls) existingControls.remove();
        const existingTableWrapper =
            this.container.querySelector(".table-wrapper");
        if (existingTableWrapper) existingTableWrapper.remove();
        const existingChartWrapper =
            this.container.querySelector(".chart-wrapper");
        if (existingChartWrapper) existingChartWrapper.remove();

        const controlsContainer = document.createElement("div");
        controlsContainer.className = "standings-controls";

        this.initNavbar(controlsContainer);

        this.tableWrapper = document.createElement("div");
        this.tableWrapper.className = "table-wrapper";

        this.chartWrapper = document.createElement("div");
        this.chartWrapper.className = "chart-wrapper";
        this.chartCanvas = document.createElement("canvas");
        this.chartWrapper.appendChild(this.chartCanvas);

        this.container.appendChild(controlsContainer);
        this.container.appendChild(this.tableWrapper);
        this.container.appendChild(this.chartWrapper);
    }

    async fetchStandings() {
        this.clearElement(this.tableWrapper);
        const loadingDiv = document.createElement("div");
        loadingDiv.className = "standings-loading";
        loadingDiv.textContent = "Loading standings data...";
        this.tableWrapper.appendChild(loadingDiv);

        try {
            const res = await fetch("/api/standings");
            if (!res.ok) throw new Error("Failed to fetch data");
            this.data = await res.json();
            this.render();
        } catch (err) {
            this.clearElement(this.tableWrapper);
            const errorDiv = document.createElement("div");
            errorDiv.className = "standings-error";
            errorDiv.textContent = "Unable to load standings.";
            this.tableWrapper.appendChild(errorDiv);
        }
    }

    switchMainView(view) {
        if (this.currentView === view) return;
        this.currentView = view;
        if (this.driverControls) {
            this.driverControls.style.display =
                view === "drivers" ? "flex" : "none";
        }
        this.render();
    }

    switchDriverMode(mode, activeBtn, inactiveBtn) {
        if (this.driverMode === mode) return;
        this.driverMode = mode;
        activeBtn.classList.add("active");
        inactiveBtn.classList.remove("active");
        this.render();
    }

    clearElement(element) {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }

    createHeaderCell(text, style = {}) {
        const th = document.createElement("th");
        th.textContent = text;
        Object.assign(th.style, style);
        return th;
    }

    render() {
        if (!this.data) return;

        if (this.currentView === "constructors") {
            this.chartWrapper.style.display = "block";
            this.renderConstructors();
            this.renderConstructorsChart();
        } else if (this.driverMode === "total") {
            this.chartWrapper.style.display = "block";
            this.renderDriversTotal();
            this.renderChart();
        } else {
            this.chartWrapper.style.display = "block";
            this.renderDriversRace();
            this.renderChart();
        }
    }

    renderDriversTotal() {
        this.clearElement(this.tableWrapper);
        const table = document.createElement("table");
        table.className = "timing-table";

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        headerRow.appendChild(this.createHeaderCell("Pos", { width: "40px" }));
        headerRow.appendChild(this.createHeaderCell("Driver"));
        headerRow.appendChild(this.createHeaderCell("Team"));
        headerRow.appendChild(
            this.createHeaderCell("Points", { textAlign: "right" }),
        );
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        this.data.drivers.forEach((d) => {
            const tr = document.createElement("tr");

            const tdPos = document.createElement("td");
            const posStrong = document.createElement("strong");
            posStrong.textContent = d.pos;
            tdPos.appendChild(posStrong);

            const tdDriver = document.createElement("td");
            const driverContainer = document.createElement("div");
            driverContainer.className = "driver-cell-container";

            if (d.driverImage) {
                const img = document.createElement("img");
                img.src = d.driverImage;
                img.className = "standings-avatar";
                img.alt = d.driverName;
                driverContainer.appendChild(img);
            }

            const nameStrong = document.createElement("strong");
            nameStrong.textContent = d.driverName;
            driverContainer.appendChild(nameStrong);
            tdDriver.appendChild(driverContainer);

            const tdTeam = document.createElement("td");
            const teamContainer = document.createElement("div");
            teamContainer.className = "driver-cell-container";

            if (d.teamLogo) {
                const logo = document.createElement("img");
                logo.src = d.teamLogo;
                logo.className = "standings-team-logo";
                if (["Aston Martin", "Cadillac", "Haas F1 Team"].includes(d.car)) {
                    logo.classList.add("invert-in-dark");
                }
                logo.alt = d.car;
                teamContainer.appendChild(logo);
            }

            const carSpan = document.createElement("span");
            carSpan.textContent = d.car;
            teamContainer.appendChild(carSpan);
            tdTeam.appendChild(teamContainer);

            const tdPts = document.createElement("td");
            tdPts.style.textAlign = "right";
            const ptsStrong = document.createElement("strong");
            ptsStrong.textContent = d.pts;
            tdPts.appendChild(ptsStrong);

            tr.appendChild(tdPos);
            tr.appendChild(tdDriver);
            tr.appendChild(tdTeam);
            tr.appendChild(tdPts);
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        this.tableWrapper.appendChild(table);
    }

    renderDriversRace() {
        this.clearElement(this.tableWrapper);
        if (!this.data.drivers || !this.data.drivers.length) return;

        const allGrandsPrix = [];
        this.data.drivers.forEach((d) => {
            if (d.raceResults) {
                d.raceResults.forEach((r) => {
                    if (!allGrandsPrix.includes(r.grandPrix))
                        allGrandsPrix.push(r.grandPrix);
                });
            }
        });

        const table = document.createElement("table");
        table.className = "timing-table";

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        headerRow.appendChild(this.createHeaderCell("Pos", { width: "40px" }));
        headerRow.appendChild(this.createHeaderCell("Driver"));
        headerRow.appendChild(this.createHeaderCell("Team"));
        headerRow.appendChild(
            this.createHeaderCell("Total", { textAlign: "right" }),
        );
        allGrandsPrix.forEach((gp) =>
            headerRow.appendChild(
                this.createHeaderCell(gp, { textAlign: "center" }),
            ),
        );
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        this.data.drivers.forEach((d) => {
            const tr = document.createElement("tr");

            const tdPos = document.createElement("td");
            const posStrong = document.createElement("strong");
            posStrong.textContent = d.pos;
            tdPos.appendChild(posStrong);

            const tdDriver = document.createElement("td");
            const driverContainer = document.createElement("div");
            driverContainer.className = "driver-cell-container";

            if (d.driverImage) {
                const img = document.createElement("img");
                img.src = d.driverImage;
                img.className = "standings-avatar";
                img.alt = d.driverName;
                driverContainer.appendChild(img);
            }

            const nameStrong = document.createElement("strong");
            nameStrong.textContent = d.driverName;
            driverContainer.appendChild(nameStrong);
            tdDriver.appendChild(driverContainer);

            const tdTeam = document.createElement("td");
            const teamContainer = document.createElement("div");
            teamContainer.className = "driver-cell-container";

            if (d.teamLogo) {
                const logo = document.createElement("img");
                logo.src = d.teamLogo;
                logo.className = "standings-team-logo";
                if (["Aston Martin", "Cadillac", "Haas F1 Team"].includes(d.car)) {
                    logo.classList.add("invert-in-dark");
                }
                logo.alt = d.car;
                teamContainer.appendChild(logo);
            }

            const carSpan = document.createElement("span");
            carSpan.textContent = d.car;
            teamContainer.appendChild(carSpan);
            tdTeam.appendChild(teamContainer);

            tr.appendChild(tdPos);
            tr.appendChild(tdDriver);
            tr.appendChild(tdTeam);

            const tdPts = document.createElement("td");
            tdPts.style.textAlign = "right";
            const ptsStrong = document.createElement("strong");
            ptsStrong.textContent = d.pts;
            tdPts.appendChild(ptsStrong);
            tr.appendChild(tdPts);

            allGrandsPrix.forEach((gp) => {
                const tdRace = document.createElement("td");
                tdRace.style.textAlign = "center";
                const res = d.raceResults
                    ? d.raceResults.find((r) => r.grandPrix === gp)
                    : null;
                
                if (res) {
                    const posNum = parseInt(res.pos, 10);
                    tdRace.textContent = `${res.pts} (${res.pos}${isNaN(posNum) ? "" : res.pos === "1" ? "st" : res.pos === "2" ? "nd" : res.pos === "3" ? "rd" : "th"})`;
                    
                    if (posNum === 1) {
                        tdRace.className = "podium-first";
                    } else if (posNum === 2) {
                        tdRace.className = "podium-second";
                    } else if (posNum === 3) {
                        tdRace.className = "podium-third";
                    } else if (isNaN(posNum)) {
                        tdRace.className = "non-numeric-result";
                    }
                } else {
                    tdRace.textContent = "-";
                    tdRace.style.color = "#8b949e";
                }
                tr.appendChild(tdRace);
            });

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        this.tableWrapper.appendChild(table);
    }

    renderConstructors() {
        this.clearElement(this.tableWrapper);
        const table = document.createElement("table");
        table.className = "timing-table";

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        headerRow.appendChild(this.createHeaderCell("Pos", { width: "40px" }));
        headerRow.appendChild(this.createHeaderCell("Team"));
        headerRow.appendChild(
            this.createHeaderCell("Total Points", { textAlign: "right" }),
        );
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        this.data.constructors.forEach((c) => {
            const tr = document.createElement("tr");

            const tdPos = document.createElement("td");
            const posStrong = document.createElement("strong");
            posStrong.textContent = c.pos;
            tdPos.appendChild(posStrong);

            const tdTeam = document.createElement("td");
            const teamContainer = document.createElement("div");
            teamContainer.className = "driver-cell-container";

            if (c.teamLogo) {
                const logo = document.createElement("img");
                logo.src = c.teamLogo;
                logo.className = "standings-team-logo";
                if (["Aston Martin", "Cadillac", "Haas F1 Team"].includes(c.teamName)) {
                    logo.classList.add("invert-in-dark");
                }
                logo.alt = c.teamName;
                teamContainer.appendChild(logo);
            }

            const nameStrong = document.createElement("strong");
            nameStrong.textContent = c.teamName;
            teamContainer.appendChild(nameStrong);
            tdTeam.appendChild(teamContainer);

            const tdPts = document.createElement("td");
            tdPts.style.textAlign = "right";
            const ptsStrong = document.createElement("strong");
            ptsStrong.textContent = c.pts;
            tdPts.appendChild(ptsStrong);

            tr.appendChild(tdPos);
            tr.appendChild(tdTeam);
            tr.appendChild(tdPts);
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        this.tableWrapper.appendChild(table);
    }

    getTeamColor(teamName) {
        const palette = {
            "Red Bull Racing": "#4781D7",
            "Ferrari": "#ED1131",
            "Mercedes": "#00D7B6",
            "McLaren": "#F47600",
            "Aston Martin": "#229971",
            "Alpine": "#00A1E8",
            "Williams": "#1868DB",
            "Racing Bulls": "#6C98FF",
            "Audi": "#F50537",
            "Cadillac": "#909090",
            "Haas F1 Team": "#9C9FA2",
        };
        return palette[teamName] || "#8b949e";
    }

    renderChart() {
        if (
            typeof Chart === "undefined" ||
            !this.data ||
            !this.data.drivers.length
        )
            return;

        const allGrandsPrix = [];
        this.data.drivers.forEach((d) => {
            if (d.raceResults) {
                d.raceResults.forEach((r) => {
                    if (!allGrandsPrix.includes(r.grandPrix))
                        allGrandsPrix.push(r.grandPrix);
                });
            }
        });

        if (!allGrandsPrix.length) return;

        const topDrivers = this.data.drivers.slice(0, 5);
        const teamCounts = {};

        const datasets = topDrivers.map((d) => {
            let cumulative = 0;
            const pointsData = allGrandsPrix.map((gp) => {
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

        if (this.chartInstance) this.chartInstance.destroy();

        const isLight = document.body.classList.contains("light-mode");
        const textColor = isLight ? "#111827" : "#f0f6fc";
        const gridColor = isLight ? "#e5e7eb" : "#30363d";

        this.chartInstance = new Chart(this.chartCanvas, {
            type: "line",
            data: { labels: allGrandsPrix, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor } },
                    title: {
                        display: true,
                        text: "Points Progression (Top 5 Drivers)",
                        color: textColor,
                    },
                },
                scales: {
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor },
                    },
                    y: {
                        ticks: { color: textColor },
                        grid: { color: gridColor },
                    },
                },
            },
        });
    }

    renderConstructorsChart() {
        if (
            typeof Chart === "undefined" ||
            !this.data ||
            !this.data.constructors.length
        )
            return;

        const allGrandsPrix = [];
        this.data.drivers.forEach((d) => {
            if (d.raceResults) {
                d.raceResults.forEach((r) => {
                    if (!allGrandsPrix.includes(r.grandPrix))
                        allGrandsPrix.push(r.grandPrix);
                });
            }
        });

        if (!allGrandsPrix.length) return;

        const topConstructors = this.data.constructors.slice(0, 5);

        const datasets = topConstructors.map((c) => {
            let cumulative = 0;
            const pointsData = allGrandsPrix.map((gp) => {
                let gpSum = 0;
                this.data.drivers.forEach((d) => {
                    if (d.car === c.teamName && d.raceResults) {
                        const res = d.raceResults.find(
                            (r) => r.grandPrix === gp,
                        );
                        if (res) gpSum += parseFloat(res.pts) || 0;
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

        if (this.chartInstance) this.chartInstance.destroy();

        const isLight = document.body.classList.contains("light-mode");
        const textColor = isLight ? "#111827" : "#f0f6fc";
        const gridColor = isLight ? "#e5e7eb" : "#30363d";

        this.chartInstance = new Chart(this.chartCanvas, {
            type: "line",
            data: { labels: allGrandsPrix, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor } },
                    title: {
                        display: true,
                        text: "Points Progression (Top 5 Constructors)",
                        color: textColor,
                    },
                },
                scales: {
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor },
                    },
                    y: {
                        ticks: { color: textColor },
                        grid: { color: gridColor },
                    },
                },
            },
        });
    }
}
