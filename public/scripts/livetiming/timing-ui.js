class F1LiveTimingUI {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.sessionUI = new SessionInfoUI(this.container);
        this.raceControlUI = new RaceControlUI(this.container);
        this.isFetchingCircuit = false;
        this.activeCircuitData = null;
        this.gpsPoints = [];
        this.gpsBounds = null;
        this.hasRestoredScroll = false;
        this.cars = new Map();
        this.carsGroup = null;
        this.gpsFrame = null;
        this.trackCumulative = null;
        this.trackLength = 0;
        this.carRadius = 100;
        this.carRadiusRatio = 0.026;
        this.microsectorTotal = 24;
        this.maxStepAdvance = 0.95;
        this.gpsSmoothing = 180;
        this.initTable();
        this.initModal();
        this.initGpsMap();
    }

    initTable() {
        this.tableWrapper = document.createElement("div");
        this.tableWrapper.className = "table-wrapper";
        const table = document.createElement("table");
        table.className = "timing-table";
        const thead = document.createElement("thead");
        const tr = document.createElement("tr");
        const headers = [
            "",
            "Pos",
            "Driver",
            "Tyres",
            "Gap",
            "Diff",
            "Last Lap",
            "Last S1",
            "Last S2",
            "Last S3",
            "Best Lap",
            "Ideal Lap",
            "Best S1",
            "Best S2",
            "Best S3",
            "Pit Stops",
            "Laps",
        ];
        headers.forEach((text, idx) => {
            const th = document.createElement("th");
            th.textContent = text;
            if (idx === 0) th.style.width = "24px";
            if (text.includes("S1")) th.classList.add("col-s1");
            else if (text.includes("S2")) th.classList.add("col-s2");
            else if (text.includes("S3")) th.classList.add("col-s3");
            tr.appendChild(th);
        });
        thead.appendChild(tr);
        table.appendChild(thead);
        this.tbody = document.createElement("tbody");
        this.tbody.id = "driver-rows";
        table.appendChild(this.tbody);
        this.tableWrapper.appendChild(table);
        this.container.appendChild(this.tableWrapper);
    }

    initGpsMap() {
        this.gpsMapContainer = document.createElement("div");
        this.gpsMapContainer.className = "gps-map-container";
        this.gpsSvg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
        );
        this.gpsSvg.setAttribute("class", "gps-map-svg");
        this.gpsMapContainer.appendChild(this.gpsSvg);
        this.container.appendChild(this.gpsMapContainer);
    }

    async fetchCircuitFromMultiViewer(forcedLocation) {
        if (this.isFetchingCircuit) return;
        this.isFetchingCircuit = true;
        const circuits = [
            { location: "Melbourne", circuitKey: 10 },
            { location: "Shanghai", circuitKey: 49 },
            { location: "Suzuka", circuitKey: 46 },
            { location: "Sakhir", circuitKey: 63 },
            { location: "Jeddah", circuitKey: 149 },
            { location: "Miami", circuitKey: 151 },
            { location: "Montreal", circuitKey: 23 },
            { location: "Monte-Carlo", circuitKey: 22 },
            { location: "Montmeló", circuitKey: 15 },
            { location: "Spielberg", circuitKey: 19 },
            { location: "Silverstone", circuitKey: 2 },
            { location: "Spa", circuitKey: 7 },
            { location: "Budapest", circuitKey: 4 },
            { location: "Zandvoort", circuitKey: 55 },
            { location: "Monza", circuitKey: 39 },
            { location: "Baku", circuitKey: 144 },
            { location: "Marina Bay", circuitKey: 61 },
            { location: "Austin", circuitKey: 9 },
            { location: "Mexico City", circuitKey: 65 },
            { location: "São Paulo", circuitKey: 14 },
            { location: "Las Vegas", circuitKey: 152 },
            { location: "Al Daayen", circuitKey: 150 },
            { location: "Yas Marina", circuitKey: 70 },
        ];
        const locationName =
            forcedLocation || window.f1Client?.sessionInfo?.Meeting?.Location;
        const normalizedLocation = locationName
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
        const matchedCircuit = circuits.find((c) => {
            const circuitLocation = c.location
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
            return circuitLocation === normalizedLocation;
        });
        const circuitKey = matchedCircuit ? matchedCircuit.circuitKey : "";
        try {
            const response = await fetch(
                `https://api.multiviewer.app/api/v1/circuits/${circuitKey}/2026`,
            );
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            const data = await response.json();
            this.activeCircuitData = data;
            this.renderCircuitMap();
        } catch (error) {
            const circuitMap = document.querySelector(".gps-map-container");
            if (circuitMap) {
                circuitMap.style.display = "none";
            }
        } finally {
            this.isFetchingCircuit = false;
        }
    }

    getSectorColor(sector, microsector, index, totalPoints) {
        if (sector !== undefined && sector !== null) {
            const s = String(sector).toLowerCase();
            if (s.includes("1") || s === "s1") return "#ff1e27";
            if (s.includes("2") || s === "s2") return "#00b0ff";
            if (s.includes("3") || s === "s3") return "#ffe600";
        }

        if (microsector !== undefined && microsector !== null) {
            const ms = Number(microsector);
            if (ms <= 7) return "#ff1e27";
            if (ms <= 15) return "#00b0ff";
            return "#ffe600";
        }

        const ratio = index / totalPoints;
        if (ratio < 0.33) return "#ff1e27";
        if (ratio < 0.66) return "#00b0ff";
        return "#ffe600";
    }

    extractCircuitPoints(data) {
        const candidates = [];
        if (data?.x && data?.y) {
            candidates.push(data);
        }
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) {
                const points = candidate
                    .map((p) => {
                        if (!p) return null;
                        const x = -Number(p.x ?? p.X);
                        const y = Number(p.y ?? p.Y);
                        if (!Number.isFinite(x) || !Number.isFinite(y))
                            return null;
                        return {
                            x,
                            y,
                            sector: p.sector ?? p.Sector ?? p.s,
                            microsector: p.microsector ?? p.Microsector ?? p.ms,
                        };
                    })
                    .filter(Boolean);
                if (points.length > 2) return points;
            }
            if (
                candidate &&
                Array.isArray(candidate.x) &&
                Array.isArray(candidate.y)
            ) {
                const length = Math.min(candidate.x.length, candidate.y.length);
                const points = [];
                for (let i = 0; i < length; i++) {
                    const x = -Number(candidate.x[i]);
                    const y = Number(candidate.y[i]);
                    if (Number.isFinite(x) && Number.isFinite(y)) {
                        points.push({
                            x,
                            y,
                            sector:
                                candidate.sector?.[i] ??
                                candidate.Sector?.[i] ??
                                candidate.s?.[i],
                            microsector:
                                candidate.microsector?.[i] ??
                                candidate.Microsector?.[i] ??
                                candidate.ms?.[i],
                        });
                    }
                }
                if (points.length > 2) return points;
            }
        }
        return [];
    }

    interpolateCircuitPoints(points, subdivisions = 5) {
        if (!points || points.length < 3) return points || [];
        const result = [];
        const count = points.length;
        for (let i = 0; i < count; i++) {
            const p0 = points[(i - 1 + count) % count];
            const p1 = points[i];
            const p2 = points[(i + 1) % count];
            const p3 = points[(i + 2) % count];
            for (let step = 0; step < subdivisions; step++) {
                const t = step / subdivisions;
                const t2 = t * t;
                const t3 = t2 * t;
                const x =
                    0.5 *
                    (2 * p1.x +
                        (-p0.x + p2.x) * t +
                        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
                const y =
                    0.5 *
                    (2 * p1.y +
                        (-p0.y + p2.y) * t +
                        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
                result.push({
                    x,
                    y,
                    sector: p1.sector,
                    microsector: p1.microsector,
                });
            }
        }
        return result;
    }

    renderCircuitMap() {
        if (!this.activeCircuitData) return;
        const points = this.extractCircuitPoints(this.activeCircuitData);
        if (!points || points.length < 3) return;
        this.originalGpsPoints = points;
        this.gpsPoints = this.interpolateCircuitPoints(points, 5);

        let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity;
        points.forEach((p) => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        });

        const paddingX = (maxX - minX) * 0.035;
        const paddingY = (maxY - minY) * 0.035;
        minX -= paddingX;
        maxX += paddingX;
        minY -= paddingY;
        maxY += paddingY;
        const width = maxX - minX;
        const height = maxY - minY;
        this.gpsBounds = { minX, maxX, minY, maxY, width, height };
        this.gpsSvg.setAttribute(
            "viewBox",
            `${minX} ${minY} ${width} ${height}`,
        );

        while (this.gpsSvg.firstChild) {
            this.gpsSvg.removeChild(this.gpsSvg.firstChild);
        }

        let fullPathData = "";
        this.gpsPoints.forEach((point, index) => {
            if (index === 0) fullPathData = `M ${point.x} ${point.y}`;
            else fullPathData += ` L ${point.x} ${point.y}`;
        });
        if (this.gpsPoints.length > 2) fullPathData += " Z";

        const shadowPath = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path",
        );
        shadowPath.setAttribute("d", fullPathData);
        shadowPath.setAttribute("fill", "none");
        shadowPath.setAttribute("stroke", "rgba(0,0,0,0.35)");
        shadowPath.setAttribute("stroke-width", "190");
        shadowPath.setAttribute("stroke-linecap", "round");
        shadowPath.setAttribute("stroke-linejoin", "round");
        this.gpsSvg.appendChild(shadowPath);

        const total = this.gpsPoints.length;
        const segments = [];
        let currentSegment = { color: null, points: [] };

        this.gpsPoints.forEach((pt, i) => {
            const color = this.getSectorColor(
                pt.sector,
                pt.microsector,
                i,
                total,
            );

            if (!currentSegment.color) {
                currentSegment.color = color;
                currentSegment.points.push(pt);
            } else if (currentSegment.color === color) {
                currentSegment.points.push(pt);
            } else {
                currentSegment.points.push(pt);
                segments.push(currentSegment);
                currentSegment = { color: color, points: [pt] };
            }
        });

        if (currentSegment.points.length > 0) {
            currentSegment.points.push(this.gpsPoints[0]);
            segments.push(currentSegment);
        }

        segments.forEach((seg) => {
            if (seg.points.length < 2) return;
            let d = "";
            seg.points.forEach((p, idx) => {
                if (idx === 0) d = `M ${p.x} ${p.y}`;
                else d += ` L ${p.x} ${p.y}`;
            });

            const trackPath = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "path",
            );
            trackPath.setAttribute("d", d);
            trackPath.setAttribute("fill", "none");
            trackPath.setAttribute("stroke", seg.color);
            trackPath.setAttribute("stroke-width", "120");
            trackPath.setAttribute("stroke-linecap", "round");
            trackPath.setAttribute("stroke-linejoin", "round");
            this.gpsSvg.appendChild(trackPath);
        });

        const innerPath = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path",
        );
        innerPath.setAttribute("d", fullPathData);
        innerPath.setAttribute("fill", "none");
        innerPath.setAttribute("stroke", "rgba(255,255,255,0.14)");
        innerPath.setAttribute("stroke-width", "28");
        innerPath.setAttribute("stroke-linecap", "round");
        innerPath.setAttribute("stroke-linejoin", "round");
        this.gpsSvg.appendChild(innerPath);

        const center = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path",
        );
        center.setAttribute("d", fullPathData);
        center.setAttribute("fill", "none");
        center.setAttribute("stroke", "rgba(255,255,255,0.18)");
        center.setAttribute("stroke-width", "4");
        center.setAttribute("stroke-dasharray", "12 12");
        center.setAttribute("stroke-linecap", "round");
        this.gpsSvg.appendChild(center);

        this.buildTrackLookup();
        this.carRadius = Math.max(width, height) * this.carRadiusRatio;
        this.carsGroup = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "g",
        );
        this.carsGroup.setAttribute("class", "gps-cars");
        this.gpsSvg.appendChild(this.carsGroup);
        this.cars.forEach((car) => {
            this.sizeGpsCar(car);
            car.snap = true;
            this.carsGroup.appendChild(car.group);
        });

        this.gpsMapContainer.style.display = "block";
        this.updateAllDriverGps();
    }

    buildTrackLookup() {
        const points = this.gpsPoints;
        const count = points.length;
        const cumulative = new Float64Array(count + 1);
        for (let i = 0; i < count; i++) {
            const a = points[i];
            const b = points[(i + 1) % count];
            cumulative[i + 1] =
                cumulative[i] + Math.hypot(b.x - a.x, b.y - a.y);
        }
        this.trackCumulative = cumulative;
        this.trackLength = cumulative[count];
    }

    getTrackPosition(progress) {
        const points = this.gpsPoints;
        const count = points.length;
        const cumulative = this.trackCumulative;
        const wrapped = ((progress % 1) + 1) % 1;
        const distance = wrapped * this.trackLength;
        let low = 0;
        let high = count;
        while (high - low > 1) {
            const mid = (low + high) >> 1;
            if (cumulative[mid] <= distance) low = mid;
            else high = mid;
        }
        const a = points[low];
        const b = points[(low + 1) % count];
        const span = cumulative[low + 1] - cumulative[low] || 1;
        const t = (distance - cumulative[low]) / span;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }

    getMicrosectorState(driverData) {
        let active = 0;
        let total = 0;
        let sectorsWithSegments = 0;
        [driverData?.lastS1, driverData?.lastS2, driverData?.lastS3].forEach(
            (sector) => {
                if (!sector || !sector.Segments) return;
                const segments = Array.isArray(sector.Segments)
                    ? sector.Segments
                    : Object.values(sector.Segments);
                sectorsWithSegments++;
                total += segments.length;
                segments.forEach((segment) => {
                    if (segment && Number(segment.Status) > 0) active++;
                });
            },
        );
        if (sectorsWithSegments === 3 && total >= 15 && total <= 60) {
            this.microsectorTotal = total;
        }
        return {
            active: Math.min(active, this.microsectorTotal),
            total: this.microsectorTotal,
        };
    }

    getReadableTextColor(hex) {
        if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return (r * 299 + g * 587 + b * 114) / 1000 > 150
            ? "#111111"
            : "#ffffff";
    }

    createGpsCar() {
        const svgNs = "http://www.w3.org/2000/svg";
        const group = document.createElementNS(svgNs, "g");
        group.setAttribute("class", "gps-car-token");
        const circle = document.createElementNS(svgNs, "circle");
        circle.setAttribute("fill", "#888888");
        circle.setAttribute("stroke", "#ffffff");
        const text = document.createElementNS(svgNs, "text");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central");
        text.setAttribute("font-family", "Arial, sans-serif");
        text.setAttribute("font-weight", "700");
        text.setAttribute("pointer-events", "none");
        group.appendChild(circle);
        group.appendChild(text);
        const car = {
            group,
            circle,
            text,
            visible: false,
            snap: true,
            count: -1,
            total: 0,
            base: 0,
            progress: 0,
            enteredAt: 0,
            stepDuration: 4000,
            average: 0,
            durations: [],
            colour: null,
            label: null,
            transform: "",
        };
        this.sizeGpsCar(car);
        return car;
    }

    sizeGpsCar(car) {
        const radius = this.carRadius;
        car.circle.setAttribute("r", radius);
        car.circle.setAttribute("stroke-width", radius * 0.14);
        car.text.setAttribute("font-size", radius * 1.05);
    }

    styleGpsCar(car, driverNum, driverData) {
        const label = String(driverData?.racingNumber ?? driverNum);
        if (car.label !== label) {
            car.label = label;
            car.text.textContent = label;
        }
        const colour = driverData?.teamColour
            ? String(driverData.teamColour).replace("#", "")
            : null;
        if (colour && car.colour !== colour) {
            car.colour = colour;
            car.circle.setAttribute("fill", `#${colour}`);
            car.text.setAttribute("fill", this.getReadableTextColor(colour));
        }
    }

    recordStepDuration(car, steps, elapsed) {
        const perStep = elapsed / steps;
        if (perStep < 250 || perStep > 60000) return;
        for (let i = 0; i < steps; i++) {
            const index = (car.count + i) % car.total;
            const previous = car.durations[index];
            car.durations[index] = previous
                ? previous * 0.5 + perStep * 0.5
                : perStep;
        }
        car.average = car.average
            ? car.average * 0.7 + perStep * 0.3
            : perStep;
    }

    estimateStepDuration(car, index, driverData) {
        const known = car.durations[index % car.total];
        if (known) return known;
        if (car.average) return car.average;
        const lapSeconds = this.parseTimeToSeconds(driverData?.lastLap?.Value);
        if (Number.isFinite(lapSeconds) && lapSeconds > 0) {
            return (lapSeconds * 1000) / car.total;
        }
        return 4000;
    }

    registerMicrosector(car, active, total, driverData) {
        const now = performance.now();
        if (!car.visible) {
            car.visible = true;
            car.group.style.display = "";
            car.snap = true;
            car.count = -1;
        }
        if (car.count === active && car.total === total) return;
        const fraction = active / total;
        if (car.count < 0 || car.total !== total) {
            car.base = fraction;
            car.snap = true;
            car.durations = [];
            car.average = 0;
        } else {
            let delta = fraction - (((car.base % 1) + 1) % 1);
            if (delta < -0.5) delta += 1;
            if (delta > 0.5) delta -= 1;
            const steps = Math.round(delta * total);
            if (steps > 0) this.recordStepDuration(car, steps, now - car.enteredAt);
            else if (steps < 0) car.snap = true;
            car.base += delta;
        }
        car.count = active;
        car.total = total;
        car.enteredAt = now;
        car.stepDuration = this.estimateStepDuration(car, active, driverData);
    }

    startGpsAnimation() {
        if (this.gpsFrame) return;
        let last = performance.now();
        const tick = (now) => {
            const dt = Math.min(now - last, 250);
            last = now;
            this.cars.forEach((car) => this.stepGpsCar(car, now, dt));
            this.gpsFrame = requestAnimationFrame(tick);
        };
        this.gpsFrame = requestAnimationFrame(tick);
    }

    stepGpsCar(car, now, dt) {
        if (!car.visible || !this.trackLength || car.total === 0) return;
        const advance = Math.min(
            Math.max(0, now - car.enteredAt) / car.stepDuration,
            this.maxStepAdvance,
        );
        const desired = car.base + advance / car.total;
        if (car.snap) {
            car.progress = desired;
            car.snap = false;
        } else {
            car.progress +=
                (desired - car.progress) *
                (1 - Math.exp(-dt / this.gpsSmoothing));
        }
        const point = this.getTrackPosition(car.progress);
        const transform = `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`;
        if (transform !== car.transform) {
            car.transform = transform;
            car.group.setAttribute("transform", transform);
        }
    }

    updateDriverGps(driverNum, driverData) {
        if (
            !this.activeCircuitData ||
            !this.gpsPoints ||
            this.gpsPoints.length === 0 ||
            !this.carsGroup
        )
            return;
        const key = String(driverNum);
        let car = this.cars.get(key);
        const stopped =
            driverData?.lastS1?.Stopped ||
            driverData?.lastS2?.Stopped ||
            driverData?.lastS3?.Stopped;
        if (
            driverData?.retired ||
            driverData?.inPit ||
            driverData?.pitOut ||
            stopped
        ) {
            if (car && car.visible) {
                car.visible = false;
                car.group.style.display = "none";
            }
            return;
        }
        if (!car) {
            car = this.createGpsCar();
            this.cars.set(key, car);
            this.carsGroup.appendChild(car.group);
            this.startGpsAnimation();
        }
        this.styleGpsCar(car, key, driverData);
        const { active, total } = this.getMicrosectorState(driverData);
        this.registerMicrosector(car, active, total, driverData);
    }

    updateAllDriverGps() {
        const client = window.f1Client;
        if (!client) return;
        const timingData = client.timingData || {};
        Object.keys(timingData).forEach((driverNum) => {
            let driverData =
                typeof client.getDriverData === "function"
                    ? client.getDriverData(driverNum) || {}
                    : timingData[driverNum] || {};
            if (driverData && driverData.racingNumber === undefined)
                driverData.racingNumber = driverNum;
            this.updateDriverGps(driverNum, driverData);
        });
    }

    initModal() {
        this.modal = document.createElement("div");
        this.modal.className = "stints-modal";
        const modalContent = document.createElement("div");
        modalContent.className = "stints-modal-content";
        const modalHeader = document.createElement("div");
        modalHeader.className = "stints-modal-header";
        this.modalTitle = document.createElement("h3");
        this.modalTitle.textContent = "Driver Stints History";
        const closeBtn = document.createElement("button");
        closeBtn.className = "stints-close-btn";
        closeBtn.textContent = "×";
        closeBtn.onclick = () => {
            this.modal.style.display = "none";
        };
        modalHeader.appendChild(this.modalTitle);
        modalHeader.appendChild(closeBtn);
        this.stintsBody = document.createElement("div");
        this.stintsBody.className = "stints-body";
        this.stintsBody.textContent = "Click a tyre badge to view stints.";
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(this.stintsBody);
        this.modal.appendChild(modalContent);
        document.body.appendChild(this.modal);
        window.addEventListener("click", (event) => {
            if (event.target === this.modal) this.modal.style.display = "none";
        });
    }

    showStintsModal(driverNum, driverName, stintsInput) {
        const stints = Array.isArray(stintsInput)
            ? stintsInput
            : stintsInput
              ? Object.values(stintsInput)
              : [];
        while (this.stintsBody.firstChild) {
            this.stintsBody.removeChild(this.stintsBody.firstChild);
        }
        const headerSub = document.createElement("h4");
        headerSub.textContent = `Driver #${driverNum} - ${driverName}`;
        this.stintsBody.appendChild(headerSub);
        if (!stints || stints.length === 0) {
            const p = document.createElement("p");
            p.textContent = "No stint data available.";
            this.stintsBody.appendChild(p);
        } else {
            const list = document.createElement("div");
            list.className = "stints-list";
            stints.forEach((stint, idx) => {
                const comp = (stint.Compound || "UNKNOWN").toUpperCase();
                const total = parseInt(stint.TotalLaps, 10) || 0;
                const start = parseInt(stint.StartLaps, 10) || 0;
                const stintLaps = total - start;
                const notChanged =
                    stint.TyresNotChanged === "1" ||
                    stint.TyresNotChanged === 1;
                const old =
                    stint.New === "False" ||
                    stint.New === "false" ||
                    stint.New === false;
                const item = document.createElement("div");
                item.className = `stint-item tyre-${comp.toLowerCase()}`;
                const img = document.createElement("img");
                img.src = `img/tyre_${comp.toLowerCase()}.svg`;
                img.className = "stint-svg-icon";
                img.onerror = () => {
                    img.src = "img/tyre_unknown.svg";
                };
                const stintNumSpan = document.createElement("span");
                stintNumSpan.className = "stint-num";
                stintNumSpan.textContent = `Stint ${idx + 1} (${comp})`;
                const stintDetailsSpan = document.createElement("span");
                stintDetailsSpan.className = "stint-laps";
                let detailsText = `${stintLaps} Laps`;
                if (notChanged) detailsText += " (Not Changed)";
                if (old)
                    detailsText += ` (Old - ${start} ${start === 1 ? "Lap" : "Laps"})`;
                stintDetailsSpan.textContent = detailsText;
                item.appendChild(img);
                item.appendChild(stintNumSpan);
                item.appendChild(stintDetailsSpan);
                list.appendChild(item);
            });
            this.stintsBody.appendChild(list);
        }
        this.modal.style.display = "flex";
    }

    async updateSession(data) {
        const location = data?.Meeting?.Location;
        const mapPromise = this.sessionUI.update(data);

        if (location && this.currentLocation !== location) {
            this.currentLocation = location;
            await Promise.all([
                mapPromise,
                this.fetchCircuitFromMultiViewer(location),
            ]);
            return;
        }

        await mapPromise;
    }

    updateClock(data) {
        this.sessionUI.updateClock(data);
    }
    updateSessionStatus(data) {
        this.sessionUI.updateSessionStatus(data);
    }
    updateTrackStatus(data) {
        this.sessionUI.updateTrackStatus(data);
    }
    updateWeather(data) {
        this.sessionUI.updateWeather(data);
    }
    updateSessionProgress(data, totalLaps) {
        this.sessionUI.updateSessionProgress(data, totalLaps);
    }
    updateRaceControlMessages(messages) {
        this.raceControlUI.update(messages);
    }

    parseTimeToSeconds(valStr) {
        if (!valStr || valStr === "-" || typeof valStr !== "string")
            return Infinity;
        valStr = valStr.trim();
        const parts = valStr.split(":");
        try {
            if (parts.length === 3)
                return (
                    Number(parts[0]) * 3600 +
                    Number(parts[1]) * 60 +
                    parseFloat(parts[2])
                );
            if (parts.length === 2)
                return Number(parts[0]) * 60 + parseFloat(parts[1]);
            if (parts.length === 1) return parseFloat(parts[0]) || Infinity;
        } catch (e) {
            return Infinity;
        }
        return Infinity;
    }

    formatTimeFromSeconds(seconds) {
        if (!Number.isFinite(seconds) || seconds <= 0) return "-";
        const totalMs = Math.round(seconds * 1000);
        const mins = Math.floor(totalMs / 60000);
        const remainingMs = totalMs % 60000;
        const secs = Math.floor(remainingMs / 1000);
        const ms = remainingMs % 1000;
        const msStr = String(ms).padStart(3, "0");
        if (mins > 0) {
            const secsStr = String(secs).padStart(2, "0");
            return `${mins}:${secsStr}.${msStr}`;
        }
        return `${secs}.${msStr}`;
    }

    getTimingClass(item) {
        if (!item || !item.Value || item.Value === "-") return "";
        if (item.OverallFastest === true) return "color-purple";
        if (item.PersonalFastest === true) return "color-green";
        return "color-yellow";
    }

    getBestTimingClass(item, allValuesArray, isDriverBest = false) {
        if (!item || !item.Value || item.Value === "-") return "";
        const currentValSec = this.parseTimeToSeconds(item.Value);
        if (currentValSec === Infinity) return "";

        if (allValuesArray && allValuesArray.length > 0) {
            const validSecs = allValuesArray
                .map((v) => this.parseTimeToSeconds(v))
                .filter((v) => v !== Infinity);
            if (validSecs.length > 0) {
                const minSec = Math.min(...validSecs);
                if (Math.abs(currentValSec - minSec) < 0.0001)
                    return "color-purple";
            }
        }

        if (isDriverBest) {
            return "color-green";
        }

        return "color-yellow";
    }

    getSegmentClass(status) {
        const value = Number(status);
        if (value === 2051 || value === 4 || value === 8) return "seg-purple";
        if (value === 2049 || value === 2) return "seg-green";
        if (value === 2064 || value === 1) return "seg-pit";
        if (value === 2048) return "seg-yellow";
        return "seg-default";
    }

    createSectorCellNode() {
        const td = document.createElement("td");
        const container = document.createElement("div");
        container.className = "sector-cell-container";
        const valueSpan = document.createElement("span");
        const segContainer = document.createElement("div");
        segContainer.className = "segments-container";
        container.appendChild(valueSpan);
        container.appendChild(segContainer);
        td.appendChild(container);
        return { td, valueSpan, segContainer };
    }

    updateSectorCellNode(node, sectorData, hasSegments) {
        const value = sectorData?.Value || "";
        node.valueSpan.textContent = value || "-";
        node.valueSpan.className = this.getTimingClass(sectorData);
        while (node.segContainer.firstChild) {
            node.segContainer.removeChild(node.segContainer.firstChild);
        }
        if (!hasSegments || !sectorData?.Segments) return;
        const segments = Array.isArray(sectorData.Segments)
            ? sectorData.Segments
            : Object.keys(sectorData.Segments)
                  .sort((a, b) => Number(a) - Number(b))
                  .map((key) => sectorData.Segments[key]);
        segments.forEach((segment) => {
            const segmentElement = document.createElement("div");
            segmentElement.className = `micro-segment ${this.getSegmentClass(segment?.Status)}`;
            node.segContainer.appendChild(segmentElement);
        });
    }

    createBestSectorCellNode() {
        const td = document.createElement("td");
        const valueSpan = document.createElement("span");
        td.appendChild(valueSpan);
        return { td, valueSpan };
    }

    updateBestSectorCellNode(node, sectorData, allValuesArray) {
        const val = sectorData && sectorData.Value ? sectorData.Value : "-";
        node.valueSpan.textContent = val;
        node.valueSpan.className = this.getBestTimingClass(
            sectorData,
            allValuesArray,
            true,
        );
    }

    updateDriverRow(driverData, globalBests = {}, targetIndex) {
        const rowId = `driver-${driverData.racingNumber}`;
        let row = this.tbody.querySelector(`#${rowId}`);
        if (!row) {
            row = document.createElement("tr");
            row.id = rowId;
            const flagCell = document.createElement("td");
            flagCell.style.width = "24px";
            flagCell.style.textAlign = "center";
            const flagSpan = document.createElement("span");
            flagSpan.className = "flag-cell-span";
            flagCell.appendChild(flagSpan);
            const posCell = document.createElement("td");
            const posSpan = document.createElement("span");
            posSpan.className = "driver-position";
            posCell.appendChild(posSpan);
            const driverCell = document.createElement("td");
            const driverContainer = document.createElement("div");
            driverContainer.className = "driver-cell-container";
            const numberSpan = document.createElement("span");
            numberSpan.className = "driver-number";
            const nameSpan = document.createElement("strong");
            nameSpan.className = "driver-name";
            const badgeContainer = document.createElement("div");
            badgeContainer.className = "badge-container";
            driverContainer.appendChild(numberSpan);
            driverContainer.appendChild(nameSpan);
            driverContainer.appendChild(badgeContainer);
            driverCell.appendChild(driverContainer);
            const tyreCell = document.createElement("td");
            const tyreBadge = document.createElement("div");
            tyreBadge.className = "tyre-fixed-badge";
            const tyreImg = document.createElement("img");
            tyreImg.className = "tyre-svg-icon";
            tyreImg.onerror = () => {
                tyreImg.src = "img/tyre_unknown.svg";
            };
            const tyreText = document.createElement("span");
            tyreText.className = "tyre-text";
            const tyreCompB = document.createElement("b");
            const tyreLapsSpan = document.createElement("span");
            tyreText.appendChild(tyreCompB);
            tyreText.appendChild(tyreLapsSpan);
            tyreBadge.appendChild(tyreImg);
            tyreBadge.appendChild(tyreText);
            tyreCell.appendChild(tyreBadge);
            const gapCell = document.createElement("td");
            const diffCell = document.createElement("td");
            const lastLapCell = document.createElement("td");
            const lastLapValSpan = document.createElement("span");
            lastLapCell.appendChild(lastLapValSpan);
            const lastS1Cell = this.createSectorCellNode();
            const lastS2Cell = this.createSectorCellNode();
            const lastS3Cell = this.createSectorCellNode();
            const bestLapCell = document.createElement("td");
            const bestLapValSpan = document.createElement("span");
            const bestLapNumSpan = document.createElement("span");
            bestLapCell.appendChild(bestLapValSpan);
            bestLapCell.appendChild(bestLapNumSpan);
            const idealLapCell = document.createElement("td");
            const idealLapValSpan = document.createElement("span");
            const idealLapDiffSpan = document.createElement("span");
            idealLapCell.appendChild(idealLapValSpan);
            idealLapCell.appendChild(idealLapDiffSpan);
            const bestS1Cell = this.createBestSectorCellNode();
            const bestS2Cell = this.createBestSectorCellNode();
            const bestS3Cell = this.createBestSectorCellNode();
            const pitStopsCell = document.createElement("td");
            const lapsCell = document.createElement("td");
            row.appendChild(flagCell);
            row.appendChild(posCell);
            row.appendChild(driverCell);
            row.appendChild(tyreCell);
            row.appendChild(gapCell);
            row.appendChild(diffCell);
            row.appendChild(lastLapCell);
            row.appendChild(lastS1Cell.td);
            row.appendChild(lastS2Cell.td);
            row.appendChild(lastS3Cell.td);
            row.appendChild(bestLapCell);
            row.appendChild(idealLapCell);
            row.appendChild(bestS1Cell.td);
            row.appendChild(bestS2Cell.td);
            row.appendChild(bestS3Cell.td);
            row.appendChild(pitStopsCell);
            row.appendChild(lapsCell);
            row.cache = {
                flagSpan,
                posSpan,
                numberSpan,
                nameSpan,
                badgeContainer,
                tyreBadge,
                tyreImg,
                tyreCompB,
                tyreLapsSpan,
                gapCell,
                diffCell,
                lastLapValSpan,
                lastS1: lastS1Cell,
                lastS2: lastS2Cell,
                lastS3: lastS3Cell,
                bestLapValSpan,
                bestLapNumSpan,
                idealLapValSpan,
                idealLapDiffSpan,
                bestS1: bestS1Cell,
                bestS2: bestS2Cell,
                bestS3: bestS3Cell,
                pitStopsCell,
                lapsCell,
            };
        }
        const c = row.cache;
        c.posSpan.textContent =
            driverData.position !== undefined ? driverData.position : "-";
        c.numberSpan.textContent = `#${driverData.racingNumber}`;
        const displayName =
            driverData.tLA || driverData.lastName || driverData.racingNumber;
        if (displayName) c.nameSpan.textContent = displayName;
        if (driverData.teamColour) {
            c.nameSpan.style.color = `#${String(driverData.teamColour).replace("#", "")}`;
        }
        while (c.badgeContainer.firstChild) {
            c.badgeContainer.removeChild(c.badgeContainer.firstChild);
        }
        const stopped =
            driverData.lastS1?.Stopped ||
            driverData.lastS2?.Stopped ||
            driverData.lastS3?.Stopped;
        if (driverData.retired || stopped) {
            const badge = document.createElement("span");
            badge.className = "status-badge badge-retired";
            badge.textContent = "DNF";
            c.badgeContainer.appendChild(badge);
        } else if (driverData.inPit) {
            const badge = document.createElement("span");
            badge.className = "status-badge badge-pit";
            badge.textContent = "PIT";
            c.badgeContainer.appendChild(badge);
        } else if (driverData.pitOut) {
            const badge = document.createElement("span");
            badge.className = "status-badge badge-out";
            badge.textContent = "PIT OUT";
            c.badgeContainer.appendChild(badge);
        }
        if (driverData.currentTyre && driverData.currentTyre.Compound) {
            const compound = driverData.currentTyre.Compound.toUpperCase();
            const total = parseInt(driverData.currentTyre.TotalLaps, 10) || 0;
            const start = parseInt(driverData.currentTyre.StartLaps, 10) || 0;
            const tyreLaps = total - start;
            c.tyreBadge.className = `tyre-fixed-badge tyre-${compound.toLowerCase()}`;
            let shortComp = compound.charAt(0);
            if (compound === "INTERMEDIATE") shortComp = "I";
            if (compound === "MEDIUM") shortComp = "M";
            if (compound === "SOFT") shortComp = "S";
            if (compound === "HARD") shortComp = "H";
            if (compound === "WET") shortComp = "W";
            c.tyreImg.src = `img/tyre_${compound.toLowerCase()}.svg`;
            c.tyreCompB.textContent = shortComp;
            c.tyreLapsSpan.textContent = ` (${tyreLaps})`;
            c.tyreBadge.title = `Click to view all stints (${compound} - ${tyreLaps} laps)`;
            c.tyreBadge.onclick = () => {
                this.showStintsModal(
                    driverData.racingNumber,
                    c.nameSpan.textContent,
                    driverData.allStints,
                );
            };
        } else {
            c.tyreBadge.className = "tyre-fixed-badge tyre-unknown";
            c.tyreImg.src = "img/tyre_unknown.svg";
            c.tyreCompB.textContent = "-";
            c.tyreLapsSpan.textContent = "";
            c.tyreBadge.title = "";
            c.tyreBadge.onclick = null;
        }

        let gap = driverData.gap ? String(driverData.gap).trim() : "-";

        if (/^\d+\s*[Ll]$/.test(gap)) {
            gap = "+" + gap.replace(/\s+/, "");
        }

        c.gapCell.textContent = gap;

        let diff = driverData.diff ? String(driverData.diff).trim() : "-";

        if (/^\d+\s*[Ll]$/.test(diff)) {
            diff = "+" + diff.replace(/\s+/, "");
        }
        c.diffCell.textContent = diff;

        const lastLapVal =
            driverData.lastLap && driverData.lastLap.Value
                ? driverData.lastLap.Value
                : "-";
        c.lastLapValSpan.textContent = lastLapVal;

        if (lastLapVal !== "-") {
            const isPersonalBest =
                driverData.bestLap && driverData.bestLap.Value === lastLapVal;

            c.lastLapValSpan.className = this.getBestTimingClass(
                driverData.lastLap,
                globalBests.allBestLaps,
                isPersonalBest,
            );
        } else {
            c.lastLapValSpan.className = "";
        }
        this.updateSectorCellNode(c.lastS1, driverData.lastS1, true);
        this.updateSectorCellNode(c.lastS2, driverData.lastS2, true);
        this.updateSectorCellNode(c.lastS3, driverData.lastS3, true);
        const bestVal =
            driverData.bestLap && driverData.bestLap.Value
                ? driverData.bestLap.Value
                : "-";
        if (bestVal !== "-") {
            c.bestLapValSpan.textContent = bestVal;
            c.bestLapValSpan.className = this.getBestTimingClass(
                driverData.bestLap,
                globalBests.allBestLaps,
                true,
            );
            c.bestLapNumSpan.textContent = driverData.bestLap.Lap
                ? ` (Lap ${driverData.bestLap.Lap})`
                : "";
        } else {
            c.bestLapValSpan.textContent = "-";
            c.bestLapValSpan.className = "";
            c.bestLapNumSpan.textContent = "";
        }

        const s1 = this.parseTimeToSeconds(driverData.bestS1?.Value);
        const s2 = this.parseTimeToSeconds(driverData.bestS2?.Value);
        const s3 = this.parseTimeToSeconds(driverData.bestS3?.Value);
        if (s1 !== Infinity && s2 !== Infinity && s3 !== Infinity) {
            const idealSec = s1 + s2 + s3;
            c.idealLapValSpan.textContent =
                this.formatTimeFromSeconds(idealSec);
            const bestLapSec = this.parseTimeToSeconds(
                driverData.bestLap?.Value,
            );
            if (bestLapSec !== Infinity) {
                const diffSec = bestLapSec - idealSec;
                const sign = diffSec > 0.0001 ? "-" : "";

                c.idealLapDiffSpan.textContent = ` (${sign}${Math.abs(diffSec).toFixed(3)})`;

                if (Math.abs(diffSec) < 0.0001) {
                    c.idealLapValSpan.className = "color-green";
                } else {
                    c.idealLapValSpan.className = "";
                }
            } else {
                c.idealLapDiffSpan.textContent = "";
                c.idealLapValSpan.className = "";
            }
        } else {
            c.idealLapValSpan.textContent = "-";
            c.idealLapDiffSpan.textContent = "";
        }

        this.updateBestSectorCellNode(
            c.bestS1,
            driverData.bestS1,
            globalBests.allBestS1,
        );
        this.updateBestSectorCellNode(
            c.bestS2,
            driverData.bestS2,
            globalBests.allBestS2,
        );
        this.updateBestSectorCellNode(
            c.bestS3,
            driverData.bestS3,
            globalBests.allBestS3,
        );
        c.pitStopsCell.textContent =
            driverData.pitStops !== undefined ? driverData.pitStops : "-";
        c.lapsCell.textContent =
            driverData.numberOfLaps !== undefined
                ? driverData.numberOfLaps
                : "-";
        this.updateDriverGps(driverData.racingNumber, driverData);

        const currentChild = this.tbody.children[targetIndex];
        if (currentChild !== row) {
            this.tbody.insertBefore(row, currentChild || null);
        }
    }

    refreshTable(clientOrData) {
        const pageScroll = window.scrollY || document.documentElement.scrollTop;
        const wrapperScroll = this.tableWrapper
            ? this.tableWrapper.scrollTop
            : 0;

        let timingData = {};
        if (clientOrData && clientOrData.timingData)
            timingData = clientOrData.timingData;
        else if (window.f1Client && window.f1Client.timingData)
            timingData = window.f1Client.timingData;
        else if (clientOrData && typeof clientOrData === "object")
            timingData = clientOrData;
        const driverNums = Object.keys(timingData);
        const getDriver = (num) => {
            if (
                clientOrData &&
                typeof clientOrData.getDriverData === "function"
            )
                return clientOrData.getDriverData(num) || {};
            if (
                window.f1Client &&
                typeof window.f1Client.getDriverData === "function"
            )
                return window.f1Client.getDriverData(num) || {};
            return timingData[num] || {};
        };
        const allBestLaps = [],
            allBestS1 = [],
            allBestS2 = [],
            allBestS3 = [];
        driverNums.forEach((num) => {
            const d = getDriver(num);
            if (d.bestLap?.Value) allBestLaps.push(d.bestLap.Value);
            if (d.bestS1?.Value) allBestS1.push(d.bestS1.Value);
            if (d.bestS2?.Value) allBestS2.push(d.bestS2.Value);
            if (d.bestS3?.Value) allBestS3.push(d.bestS3.Value);
        });
        driverNums.sort((a, b) => {
            const dataA = getDriver(a);
            const dataB = getDriver(b);
            return (dataA.position || 99) - (dataB.position || 99);
        });
        driverNums.forEach((driverNum, index) => {
            const driverData = getDriver(driverNum);
            this.updateDriverRow(
                driverData,
                { allBestLaps, allBestS1, allBestS2, allBestS3 },
                index,
            );
        });
        this.updateAllDriverGps();

        if (this.tableWrapper) this.tableWrapper.scrollTop = wrapperScroll;
        window.scrollTo(0, pageScroll);
    }
}