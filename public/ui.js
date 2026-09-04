class SessionInfoUI {
    constructor(container) {
        this.f1Circuits = [];
        this.currentCircuit = null;
        this.map = null;
        this.geoJsonLayer = null;
        this.root = document.createElement("div");
        this.root.className = "session-header";
        this.topRow = document.createElement("div");
        this.topRow.className = "session-top-row";
        const topLeftGroup = document.createElement("div");
        topLeftGroup.className = "session-top-left";
        this.meeting = document.createElement("h1");
        this.sessionType = document.createElement("span");
        this.sessionType.className = "session-badge";
        topLeftGroup.appendChild(this.meeting);
        topLeftGroup.appendChild(this.sessionType);
        this.themeBtn = document.createElement("button");
        this.themeBtn.className = "theme-toggle-btn";
        const isLight = localStorage.getItem("theme") === "light";
        if (isLight) {
            document.body.classList.add("light-mode");
            this.themeBtn.textContent = "☾ Dark Mode";
        } else {
            this.themeBtn.textContent = "☀︎ Light Mode";
        }
        this.themeBtn.onclick = () => {
            document.body.classList.toggle("light-mode");
            const lightActive = document.body.classList.contains("light-mode");
            this.themeBtn.textContent = lightActive
                ? "☾ Dark Mode"
                : "☀ Light Mode";
            localStorage.setItem("theme", lightActive ? "light" : "dark");
            if (this.baseMapLayer) {
                const newUrl = lightActive
                    ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
                this.baseMapLayer.setUrl(newUrl);
            }
        };
        this.topRow.appendChild(topLeftGroup);
        this.topRow.appendChild(this.themeBtn);
        this.mainContentRow = document.createElement("div");
        this.mainContentRow.className = "session-main-row";
        this.leftColumn = document.createElement("div");
        this.leftColumn.className = "session-left-col";
        this.trackStatusElement = document.createElement("div");
        this.trackStatusElement.className = "track-status-badge status-clear";
        this.clockElement = document.createElement("div");
        this.clockElement.className = "clock-pill";
        this.progressElement = document.createElement("div");
        this.progressElement.className = "session-progress";
        this.leftColumn.appendChild(this.trackStatusElement);
        this.leftColumn.appendChild(this.clockElement);
        this.leftColumn.appendChild(this.progressElement);
        this.weatherCard = document.createElement("div");
        this.weatherCard.className = "weather-card clickable-card";
        this.weatherCard.title =
            "Click to open weather details, forecast & radar";
        this.weatherCard.onclick = () => this.showWeatherModal();
        this.weatherTitle = document.createElement("div");
        this.weatherTitle.className = "weather-title";
        this.weatherTitle.textContent = "Weather";
        this.weatherCard.appendChild(this.weatherTitle);
        this.weatherGrid = document.createElement("div");
        this.weatherGrid.className = "weather-grid-compact";
        this.airTempEl = this.createWeatherItem("Air", "--°C");
        this.trackTempEl = this.createWeatherItem("Track", "--°C");
        this.windEl = this.createWeatherItem("Wind", "-- m/s");
        this.rainEl = this.createWeatherItem("Rain", "No");
        this.rainEl.container.style.display = "none";
        this.weatherGrid.appendChild(this.airTempEl.container);
        this.weatherGrid.appendChild(this.trackTempEl.container);
        this.weatherGrid.appendChild(this.windEl.container);
        this.weatherGrid.appendChild(this.rainEl.container);
        this.weatherCard.appendChild(this.weatherGrid);
        this.mainContentRow.appendChild(this.leftColumn);
        this.mainContentRow.appendChild(this.weatherCard);
        this.root.appendChild(this.topRow);
        this.root.appendChild(this.mainContentRow);
        container.appendChild(this.root);
        this.clockData = null;
        this.clockInterval = null;
        this.circuitsPromise = this.loadCircuits();
        this.initWeatherModal();
    }

    async loadCircuits() {
        try {
            const res = await fetch("circuits.json");
            this.f1Circuits = await res.json();
        } catch (e) {
            this.f1Circuits = [];
        }
    }

    createWeatherItem(label, initialValue) {
        const container = document.createElement("div");
        container.className = "weather-item";
        const labelEl = document.createElement("span");
        labelEl.className = "weather-label";
        labelEl.textContent = label;
        const valueEl = document.createElement("span");
        valueEl.className = "weather-value";
        valueEl.textContent = initialValue;
        container.appendChild(labelEl);
        container.appendChild(valueEl);
        return { container, valueEl };
    }

    initWeatherModal() {
        this.weatherModal = document.createElement("div");
        this.weatherModal.className = "stints-modal";
        const modalContent = document.createElement("div");
        modalContent.className = "weather-modal-content";
        const modalHeader = document.createElement("div");
        modalHeader.className = "stints-modal-header";
        const title = document.createElement("h3");
        title.textContent = "Weather Details, 3-Hour Forecast & Radar";
        const closeBtn = document.createElement("button");
        closeBtn.className = "stints-close-btn";
        closeBtn.textContent = "×";
        closeBtn.onclick = () => {
            this.weatherModal.style.display = "none";
        };
        modalHeader.appendChild(title);
        modalHeader.appendChild(closeBtn);
        this.weatherModalBody = document.createElement("div");
        this.weatherModalBody.className = "weather-modal-body";
        const fullGridTitle = document.createElement("div");
        fullGridTitle.className = "forecast-title";
        fullGridTitle.textContent = "Current Conditions";
        this.fullWeatherGrid = document.createElement("div");
        this.fullWeatherGrid.className = "weather-grid";
        this.modalAir = this.createWeatherItem("Air", "--°C");
        this.modalTrack = this.createWeatherItem("Track", "--°C");
        this.modalWind = this.createWeatherItem("Wind", "-- m/s");
        this.modalHumidity = this.createWeatherItem("Humidity", "--%");
        this.modalPressure = this.createWeatherItem("Pressure", "-- hPa");
        this.modalRain = this.createWeatherItem("Rain", "No");
        this.modalRain.container.style.display = "none";
        this.fullWeatherGrid.appendChild(this.modalAir.container);
        this.fullWeatherGrid.appendChild(this.modalTrack.container);
        this.fullWeatherGrid.appendChild(this.modalWind.container);
        this.fullWeatherGrid.appendChild(this.modalHumidity.container);
        this.fullWeatherGrid.appendChild(this.modalPressure.container);
        this.fullWeatherGrid.appendChild(this.modalRain.container);
        this.forecastContainer = document.createElement("div");
        this.forecastContainer.className = "forecast-container";
        const forecastTitle = document.createElement("div");
        forecastTitle.className = "forecast-title";
        forecastTitle.textContent = "3-Hour Forecast";
        this.forecastItems = document.createElement("div");
        this.forecastItems.className = "forecast-items";
        const loadingSpan = document.createElement("span");
        loadingSpan.textContent = "Awaiting circuit data...";
        this.forecastItems.appendChild(loadingSpan);
        this.forecastContainer.appendChild(forecastTitle);
        this.forecastContainer.appendChild(this.forecastItems);
        this.radarContainer = document.createElement("div");
        this.radarContainer.className = "radar-container";
        this.radarContainer.style.position = "relative";
        const radarTitle = document.createElement("div");
        radarTitle.className = "forecast-title";
        radarTitle.textContent = "Live Rain Radar";
        const radarWrapper = document.createElement("div");
        radarWrapper.id = "leaflet-map-container";
        radarWrapper.style.width = "100%";
        radarWrapper.style.height = "300px";
        radarWrapper.style.borderRadius = "8px";
        radarWrapper.style.backgroundColor = "#222";
        this.mapWindOverlay = document.createElement("div");
        this.mapWindOverlay.className = "map-wind-overlay";
        this.mapWindOverlay.style.cssText =
            "position: absolute; top: 40px; right: 10px; z-index: 1000; background: rgba(0,0,0,0.8); color: white; padding: 6px 12px; border-radius: 6px; font-weight: bold; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.5); font-size: 14px;";
        this.mapWindSpeed = document.createElement("span");
        this.mapWindSpeed.textContent = "-- m/s";
        this.mapWindArrow = document.createElement("span");
        this.mapWindArrow.style.cssText =
            "display:inline-block; transition: transform 0.3s; font-size: 18px;";
        this.mapWindArrow.textContent = "↑";
        this.mapWindOverlay.appendChild(this.mapWindSpeed);
        this.mapWindOverlay.appendChild(this.mapWindArrow);
        this.radarContainer.appendChild(radarTitle);
        this.radarContainer.appendChild(radarWrapper);
        this.radarContainer.appendChild(this.mapWindOverlay);
        this.weatherModalBody.appendChild(fullGridTitle);
        this.weatherModalBody.appendChild(this.fullWeatherGrid);
        this.weatherModalBody.appendChild(this.forecastContainer);
        this.weatherModalBody.appendChild(this.radarContainer);
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(this.weatherModalBody);
        this.weatherModal.appendChild(modalContent);
        document.body.appendChild(this.weatherModal);
        window.addEventListener("click", (event) => {
            if (event.target === this.weatherModal) {
                this.weatherModal.style.display = "none";
            }
        });
    }

    showWeatherModal() {
        this.weatherModal.style.display = "flex";
        if (this.map) {
            setTimeout(() => {
                this.map.invalidateSize();
                const targetZoom =
                    this.currentCircuit?.weatherZoom ||
                    this.currentCircuit?.zoom ||
                    14;
                if (this.circuitCenter) {
                    this.map.setView(this.circuitCenter, targetZoom);
                } else if (this.currentCircuit) {
                    this.map.setView(
                        [this.currentCircuit.lat, this.currentCircuit.lon],
                        targetZoom,
                    );
                }
            }, 150);
        }
    }

    async fetchForecast(lat, lon) {
        try {
            const res = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,rain&timezone=auto`,
            );
            const data = await res.json();
            const nowIdx = new Date().getHours();
            while (this.forecastItems.firstChild) {
                this.forecastItems.removeChild(this.forecastItems.firstChild);
            }
            for (let i = 1; i <= 3; i++) {
                const index = nowIdx + i;
                if (
                    !data.hourly ||
                    !data.hourly.temperature_2m ||
                    index >= data.hourly.temperature_2m.length
                ) {
                    continue;
                }
                const timeDate = new Date(data.hourly.time[index]);
                const timeStr = timeDate.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                });
                const temp = data.hourly.temperature_2m[index];
                const rainProb = data.hourly.precipitation_probability[index];
                const item = document.createElement("div");
                item.className = "forecast-item";
                const timeSpan = document.createElement("span");
                timeSpan.className = "forecast-time";
                timeSpan.textContent = timeStr;
                const tempSpan = document.createElement("span");
                tempSpan.className = "forecast-temp";
                tempSpan.textContent = `${temp}°C`;
                const rainSpan = document.createElement("span");
                rainSpan.className = "forecast-rain";
                rainSpan.textContent = `💧 ${rainProb}%`;
                item.appendChild(timeSpan);
                item.appendChild(tempSpan);
                item.appendChild(rainSpan);
                this.forecastItems.appendChild(item);
            }
        } catch (e) {
            while (this.forecastItems.firstChild) {
                this.forecastItems.removeChild(this.forecastItems.firstChild);
            }
            const errorSpan = document.createElement("span");
            errorSpan.textContent = "Forecast unavailable";
            this.forecastItems.appendChild(errorSpan);
        }
    }

    update(data) {
        const meetingName =
            data?.Meeting?.OfficialName || data?.Meeting?.Name || "Formula 1";
        const type = data?.Type || "Session";
        const name = data?.Name || "";
        const status = data?.SessionStatus || "Unknown";
        this.meeting.textContent = meetingName;
        this.sessionType.textContent = `${type} - ${name} (${status})`;
        this.sessionType.dataset.type = type;
        this.sessionType.dataset.name = name;
        this.initOrUpdateMap(data);
    }

    async initOrUpdateMap(data) {
        await this.circuitsPromise;
        if (!this.f1Circuits || this.f1Circuits.length === 0) {
            return;
        }
        const locationName = data?.Meeting?.Location || "";
        const meetingName =
            data?.Meeting?.OfficialName || data?.Meeting?.Name || "";
        let circuit = this.f1Circuits.find(
            (c) =>
                (locationName &&
                    c.location &&
                    locationName.toLowerCase() === c.location.toLowerCase()) ||
                (meetingName &&
                    c.name &&
                    meetingName.toLowerCase().includes(c.name.toLowerCase())) ||
                (meetingName &&
                    c.location &&
                    meetingName
                        .toLowerCase()
                        .includes(c.location.toLowerCase())),
        );
        if (!circuit) {
            circuit = this.f1Circuits[0];
        }
        if (
            this.currentCircuit &&
            this.currentCircuit.id === circuit.id &&
            this.map
        ) {
            return;
        }
        this.currentCircuit = circuit;
        this.fetchForecast(circuit.lat, circuit.lon);
        if (!this.map) {
            this.map = L.map("leaflet-map-container", {
                zoomControl: false,
            }).setView([circuit.lat, circuit.lon], circuit.zoom);
            L.control.zoom({ position: "bottomright" }).addTo(this.map);
            const isLight = document.body.classList.contains("light-mode");
            const tileUrl = isLight
                ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
            this.baseMapLayer = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(
                this.map,
            );
            this.loadRainViewerRadar();
        } else {
            this.map.setView([circuit.lat, circuit.lon], circuit.zoom);
        }
        this.loadCircuitGeoJSON(circuit);
    }

    async loadRainViewerRadar() {
        try {
            const res = await fetch(
                "https://api.rainviewer.com/public/weather-maps.json",
            );
            const data = await res.json();
            if (data.radar && data.radar.past && data.radar.past.length > 0) {
                const latestRadar = data.radar.past[data.radar.past.length - 1];
                L.tileLayer(
                    `https://tilecache.rainviewer.com${latestRadar.path}/512/{z}/{x}/{y}/2/1_1.png`,
                    {
                        tileSize: 256,
                        maxNativeZoom: 7,
                        maxZoom: 19,
                        opacity: 0.65,
                        zIndex: 10,
                    },
                ).addTo(this.map);
            }
        } catch (err) {}
    }

    async loadCircuitGeoJSON(circuit) {
        if (this.geoJsonLayer) {
            this.map.removeLayer(this.geoJsonLayer);
        }
        try {
            const res = await fetch(`circuits/${circuit.id}.geojson`);
            if (!res.ok) {
                throw new Error("GeoJSON not found");
            }
            const data = await res.json();
            this.geoJsonLayer = L.geoJSON(data, {
                style: {
                    color: "#FF1801",
                    weight: 4,
                    opacity: 0.9,
                    lineCap: "round",
                    lineJoin: "round",
                },
            }).addTo(this.map);
            this.circuitCenter = this.geoJsonLayer.getBounds().getCenter();
        } catch (e) {}
    }

    parseTime(str) {
        if (!str) return 0;
        const parts = str.split(":").map(Number);
        if (parts.length === 3)
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return 0;
    }

    formatTime(seconds) {
        if (seconds <= 0) return "00:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) {
            return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        }
        return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }

    updateClock(data) {
        if (!data) return;
        this.clockData = data;
        const remainingSeconds = this.parseTime(data.Remaining);
        this.clockData.targetMs = Date.now() + remainingSeconds * 1000;
        if (!this.clockInterval) {
            this.clockInterval = setInterval(() => this.tickClock(), 1000);
        }
        this.tickClock();
    }

    tickClock() {
        if (!this.clockData) return;
        if (
            this.clockData.Extrapolating === false ||
            this.clockData.Extrapolating === "0"
        ) {
            this.clockElement.textContent = this.clockData.Remaining || "--:--";
            return;
        }
        const diffSeconds = Math.max(
            0,
            (this.clockData.targetMs - Date.now()) / 1000,
        );
        this.clockElement.textContent = this.formatTime(diffSeconds);
    }

    updateSessionStatus(data) {
        const type = this.sessionType.dataset.type || "Session";
        const name = this.sessionType.dataset.name || "";
        const status = data?.Status || "Unknown";
        this.sessionType.textContent = `${type} - ${name} (${status})`;
    }

    updateSessionProgress(data) {
        if (!data) return;
        if (data.kind === "race") {
            this.clockElement.style.display = "none";
            this.progressElement.style.display = "block";
            this.progressElement.className = "clock-pill";
            this.progressElement.textContent =
                data.currentLap > 0 ? `Lap ${data.currentLap}` : "Lap --";
        } else {
            this.clockElement.style.display = "block";
            this.progressElement.style.display = "block";
            this.progressElement.className = "session-progress";
            this.progressElement.textContent =
                data.kind === "qualifying" ? "Qualifying" : "Practice";
        }
    }

    updateTrackStatus(data) {
        if (!data) return;
        const message = data.Message || "CLEAR";
        this.trackStatusElement.textContent = message;
        this.trackStatusElement.className = `track-status-badge status-${message.toLowerCase().replace(/\s+/g, "-")}`;
    }

    updateWeather(data) {
        if (!data) return;
        this.airTempEl.valueEl.textContent = `${data.AirTemp}°C`;
        this.trackTempEl.valueEl.textContent = `${data.TrackTemp}°C`;
        const windDeg = Number(data.WindDirection) || 0;
        this.windEl.valueEl.textContent = `${data.WindSpeed} m/s `;
        let windArrow = this.windEl.valueEl.querySelector(".wind-indicator");
        if (!windArrow) {
            windArrow = document.createElement("span");
            windArrow.className = "wind-indicator";
            windArrow.textContent = "➔";
            this.windEl.valueEl.appendChild(windArrow);
        }
        windArrow.style.transform = `rotate(${windDeg}deg)`;
        this.modalWind.valueEl.textContent = `${data.WindSpeed} m/s `;
        let modalWindArrow =
            this.modalWind.valueEl.querySelector(".wind-indicator");
        if (!modalWindArrow) {
            modalWindArrow = document.createElement("span");
            modalWindArrow.className = "wind-indicator";
            modalWindArrow.textContent = "➔";
            this.modalWind.valueEl.appendChild(modalWindArrow);
        }
        modalWindArrow.style.transform = `rotate(${windDeg}deg)`;
        this.modalAir.valueEl.textContent = `${data.AirTemp}°C`;
        this.modalTrack.valueEl.textContent = `${data.TrackTemp}°C`;
        this.modalHumidity.valueEl.textContent = `${data.Humidity}%`;
        this.modalPressure.valueEl.textContent = `${data.Pressure} hPa`;
        const isRaining = data.Rainfall === "1" || data.Rainfall === 1;
        if (isRaining) {
            this.rainEl.valueEl.textContent = "Rain ☔︎︎";
            this.rainEl.container.style.display = "flex";
            this.rainEl.container.classList.add("rain-active");
            this.modalRain.valueEl.textContent = "Rain ☔︎︎";
            this.modalRain.container.style.display = "flex";
            this.modalRain.container.classList.add("rain-active");
        } else {
            this.rainEl.container.style.display = "none";
            this.modalRain.container.style.display = "none";
            this.rainEl.container.classList.remove("rain-active");
            this.modalRain.container.classList.remove("rain-active");
        }
        if (this.mapWindArrow && this.mapWindSpeed) {
            this.mapWindArrow.style.transform = `rotate(${windDeg}deg)`;
            this.mapWindSpeed.textContent = `${data.WindSpeed} m/s`;
        }
    }
}

class F1LiveTimingUI {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.sessionUI = new SessionInfoUI(this.container);
        this.isFetchingCircuit = false;
        this.activeCircuitData = null;
        this.gpsPoints = [];
        this.gpsBounds = null;
        this.hasRestoredScroll = false;
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
        this.gpsCarsLayer = document.createElement("div");
        this.gpsCarsLayer.className = "gps-cars-layer";
        this.gpsMapContainer.appendChild(this.gpsCarsLayer);
        this.container.appendChild(this.gpsMapContainer);
        this.fetchCircuitFromMultiViewer();
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
            forcedLocation ||
            window.f1Client?.sessionInfo?.Meeting?.Location;
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
        const circuitKey = matchedCircuit ? matchedCircuit.circuitKey : 55;
        try {
            const response = await fetch(
                `https://api.multiviewer.app/api/v1/circuits/${circuitKey}/2026`,
            );
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            const data = await response.json();
            this.activeCircuitData = data;
            this.renderCircuitMap();
        } catch (error) {
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

        this.gpsMapContainer.style.display = "block";
        this.updateAllDriverGps();
    }

    getGpsPointForDriver(driverData) {
        if (!this.gpsPoints || this.gpsPoints.length === 0) return null;
        const sectors = [
            driverData?.lastS1,
            driverData?.lastS2,
            driverData?.lastS3,
        ];
        let activeSegmentsCount = 0;
        sectors.forEach((sec) => {
            if (!sec || !sec.Segments) return;
            const segments = Array.isArray(sec.Segments)
                ? sec.Segments
                : Object.values(sec.Segments);
            segments.forEach((segment) => {
                if (segment && Number(segment.Status) > 0)
                    activeSegmentsCount++;
            });
        });
        const totalSegments = 24;
        let progress = activeSegmentsCount / totalSegments;
        if (!Number.isFinite(progress) || progress <= 0) progress = 0;
        progress = Math.min(0.999, Math.max(0, progress));
        const index = Math.floor(progress * this.gpsPoints.length);
        const pt = this.gpsPoints[index] || this.gpsPoints[0];
        return { x: -pt.x, y: pt.y };
    }

    createGpsCar(driverNum) {
        const wrapper = document.createElement("div");
        wrapper.id = `gps-car-${driverNum}`;
        wrapper.className = "gps-car-dot";
        wrapper.style.position = "absolute";
        wrapper.style.transform = "translate(-50%, -50%)";
        wrapper.style.zIndex = "20";
        const dot = document.createElement("div");
        dot.className = "gps-car-marker";
        dot.style.width = "12px";
        dot.style.height = "12px";
        dot.style.borderRadius = "50%";
        dot.style.background = "#ffffff";
        dot.style.border = "3px solid #ff1801";
        dot.style.boxShadow = "0 0 8px rgba(255,24,1,0.9)";
        dot.style.position = "relative";
        const label = document.createElement("span");
        label.className = "gps-car-label";
        label.style.position = "absolute";
        label.style.left = "16px";
        label.style.top = "50%";
        label.style.transform = "translateY(-50%)";
        label.style.whiteSpace = "nowrap";
        label.style.padding = "2px 6px";
        label.style.borderRadius = "4px";
        label.style.fontSize = "11px";
        label.style.fontWeight = "700";
        label.style.lineHeight = "14px";
        label.style.color = "#ffffff";
        label.style.background = "rgba(0,0,0,0.78)";
        label.style.border = "1px solid rgba(255,255,255,0.2)";
        label.style.boxShadow = "0 2px 5px rgba(0,0,0,0.35)";
        label.style.pointerEvents = "none";
        label.style.fontFamily = "Arial, sans-serif";
        wrapper.appendChild(dot);
        wrapper.appendChild(label);
        return { wrapper, dot, label };
    }

    /*updateDriverGps(driverNum, driverData) {
        if (!this.activeCircuitData || !this.gpsPoints || this.gpsPoints.length === 0) return;
        
        const stopped = driverData.lastS1?.Stopped || driverData.lastS2?.Stopped || driverData.lastS3?.Stopped;
        let car = this.gpsCarsLayer.querySelector(`#gps-car-${driverNum}`);

        if (driverData?.retired || driverData?.inPit || driverData?.pitOut || stopped) {
            if (car && car._animFrame) {
                cancelAnimationFrame(car._animFrame);
                car._animFrame = null;
            }
            if (car) car.style.display = "none";
            return;
        }

        if (!car) {
            car = this.createGpsCar(driverNum);
            this.gpsCarsLayer.appendChild(car.wrapper);
            car.wrapper._gpsElements = car;
        } else if (!car._gpsElements) {
            const marker = car.querySelector(".gps-car-marker");
            const label = car.querySelector(".gps-car-label");
            car._gpsElements = { wrapper: car, dot: marker, label };
        }

        const elements = car._gpsElements;
        if (!elements || !elements.label || !elements.dot) return;

        const displayName = driverData?.tLA || driverData?.lastName || driverData?.name || `#${driverNum}`;
        elements.label.textContent = displayName;

        if (driverData?.teamColour) {
            const colour = `#${String(driverData.teamColour).replace("#", "")}`;
            elements.dot.style.borderColor = colour;
            elements.dot.style.boxShadow = `0 0 8px ${colour}`;
            elements.label.style.borderColor = colour;
        }

        const point = this.getGpsPointForDriver(driverData);
        if (!point) {
            if (car._animFrame) {
                cancelAnimationFrame(car._animFrame);
                car._animFrame = null;
            }
            elements.wrapper.style.display = "none";
            return;
        }

        const bounds = this.gpsBounds;
        if (!bounds) return;

        if (!this.driverLastIndices) {
            this.driverLastIndices = new Map();
        }

        const total = this.gpsPoints.length;

        let targetIndex = this.gpsPoints.indexOf(point);
        if (targetIndex === -1) {
            targetIndex = this.gpsPoints.findIndex(p => p.x === point.x && p.y === point.y);
        }
        if (targetIndex === -1) {
            let minDist = Infinity;
            for (let i = 0; i < total; i++) {
                const p = this.gpsPoints[i];
                const dx = p.x - point.x;
                const dy = p.y - point.y;
                const dist = dx * dx + dy * dy;
                if (dist < minDist) {
                    minDist = dist;
                    targetIndex = i;
                }
            }
        }

        const renderAtPoint = (pt) => {
            const svgRect = this.gpsSvg.getBoundingClientRect();
            const svgW = svgRect.width;
            const svgH = svgRect.height;

            const scale = Math.min(svgW / bounds.width, svgH / bounds.height);

            const trackPixelW = bounds.width * scale;
            const trackPixelH = bounds.height * scale;

            const offsetX = (svgW - trackPixelW) / 2;
            const offsetY = (svgH - trackPixelH) / 2;

            const rawX = pt.x;
            const rawY = pt.y;

            const pixelX = ((rawX - bounds.minX) * scale) + offsetX;
            const pixelY = ((rawY - bounds.minY) * scale) + offsetY;

            elements.wrapper.style.left = `${pixelX}px`;
            elements.wrapper.style.top = `${pixelY}px`;
            elements.wrapper.style.display = "block";
        };

        if (!this.driverLastIndices.has(driverNum)) {
            this.driverLastIndices.set(driverNum, targetIndex);
            renderAtPoint(this.gpsPoints[targetIndex]);
            return;
        }

        car._targetIndex = targetIndex;

        if (car._animFrame) return;

        const animate = () => {
            const currentIdx = this.driverLastIndices.get(driverNum);
            const targetIdx = car._targetIndex;

            if (currentIdx === targetIdx) {
                car._animFrame = null;
                return;
            }

            const diff = (targetIdx - currentIdx + total) % total;
            const step = Math.max(1, Math.min(diff, Math.ceil(diff / 3)));

            const stepSize = 5;

            for (let i = stepSize; i <= step; i += stepSize) {
                const intermediateIdx = (currentIdx + i) % total;
                renderAtPoint(this.gpsPoints[intermediateIdx]);
            }

            const nextIdx = (currentIdx + step) % total;

            if (step % stepSize !== 0) {
                renderAtPoint(this.gpsPoints[nextIdx]);
            }

            this.driverLastIndices.set(driverNum, nextIdx);

            if (nextIdx !== targetIdx) {
                car._animFrame = requestAnimationFrame(animate);
            } else {
                car._animFrame = null;
            }
        };

        car._animFrame = requestAnimationFrame(animate);
    }*/
    updateDriverGps(driverNum, driverData) {
        if (
            !this.activeCircuitData ||
            !this.gpsPoints ||
            this.gpsPoints.length === 0
        )
            return;
        const stopped =
            driverData.lastS1?.Stopped ||
            driverData.lastS2?.Stopped ||
            driverData.lastS3?.Stopped;
        if (
            driverData?.retired ||
            driverData?.inPit ||
            driverData?.pitOut ||
            stopped
        ) {
            const existingCar = this.gpsCarsLayer.querySelector(
                `#gps-car-${driverNum}`,
            );
            if (existingCar) existingCar.style.display = "none";
            return;
        }
        let car = this.gpsCarsLayer.querySelector(`#gps-car-${driverNum}`);
        if (!car) {
            car = this.createGpsCar(driverNum);
            this.gpsCarsLayer.appendChild(car.wrapper);
            car.wrapper._gpsElements = car;
        } else if (!car._gpsElements) {
            const marker = car.querySelector(".gps-car-marker");
            const label = car.querySelector(".gps-car-label");
            car._gpsElements = { wrapper: car, dot: marker, label };
        }
        const elements = car._gpsElements;
        if (!elements || !elements.label || !elements.dot) return;
        const displayName =
            driverData?.tLA ||
            driverData?.lastName ||
            driverData?.name ||
            `#${driverNum}`;
        elements.label.textContent = displayName;
        if (driverData?.teamColour) {
            const colour = `#${String(driverData.teamColour).replace("#", "")}`;
            elements.dot.style.borderColor = colour;
            elements.dot.style.boxShadow = `0 0 8px ${colour}`;
            elements.label.style.borderColor = colour;
        }
        const point = this.getGpsPointForDriver(driverData);
        if (!point) {
            elements.wrapper.style.display = "none";
            return;
        }
        const bounds = this.gpsBounds;
        if (!bounds) return;

        const svgRect = this.gpsSvg.getBoundingClientRect();
        const svgW = svgRect.width;
        const svgH = svgRect.height;

        const scale = Math.min(svgW / bounds.width, svgH / bounds.height);

        const trackPixelW = bounds.width * scale;
        const trackPixelH = bounds.height * scale;

        const offsetX = (svgW - trackPixelW) / 2;
        const offsetY = (svgH - trackPixelH) / 2;

        const rawX = -point.x;
        const rawY = point.y;

        const pixelX = (rawX - bounds.minX) * scale + offsetX;
        const pixelY = (rawY - bounds.minY) * scale + offsetY;

        elements.wrapper.style.left = `${pixelX}px`;
        elements.wrapper.style.top = `${pixelY}px`;
        elements.wrapper.style.display = "block";
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

    updateSession(data) {
        this.sessionUI.update(data);
        const location = data?.Meeting?.Location;
        if (location && this.currentLocation !== location) {
            this.currentLocation = location;
            this.fetchCircuitFromMultiViewer(location);
        }
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
    updateSessionProgress(data) {
        this.sessionUI.updateSessionProgress(data);
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

    getTimingClass(item) {
        if (!item || !item.Value || item.Value === "-") return "";
        if (item.OverallFastest === true) return "color-purple";
        if (item.PersonalFastest === true) return "color-green";
        return "color-yellow";
    }

    getBestTimingClass(item, allValuesArray) {
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
        return "color-green";
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
            const lastS1Cell = this.createSectorCellNode();
            const lastS2Cell = this.createSectorCellNode();
            const lastS3Cell = this.createSectorCellNode();
            const bestLapCell = document.createElement("td");
            const bestLapValSpan = document.createElement("span");
            const bestLapNumSpan = document.createElement("span");
            bestLapCell.appendChild(bestLapValSpan);
            bestLapCell.appendChild(bestLapNumSpan);
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
                lastLapCell,
                lastS1: lastS1Cell,
                lastS2: lastS2Cell,
                lastS3: lastS3Cell,
                bestLapValSpan,
                bestLapNumSpan,
                bestS1: bestS1Cell,
                bestS2: bestS2Cell,
                bestS3: bestS3Cell,
                pitStopsCell,
                lapsCell,
            };
        }
        const c = row.cache;
        if (driverData.lapFlags === 1 || driverData.lapFlags === "1") {
            c.flagSpan.textContent = "🏁";
            c.flagSpan.title = "Checked flag received";
        } else {
            c.flagSpan.textContent = "";
            c.flagSpan.title = "";
        }
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
            badge.textContent = "OUT";
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
        c.gapCell.textContent = driverData.gap || "-";
        c.diffCell.textContent = driverData.diff || "-";
        c.lastLapCell.textContent =
            driverData.lastLap && driverData.lastLap.Value
                ? driverData.lastLap.Value
                : "-";
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
            );
            c.bestLapNumSpan.textContent = driverData.bestLap.Lap
                ? ` (Lap ${driverData.bestLap.Lap})`
                : "";
        } else {
            c.bestLapValSpan.textContent = "-";
            c.bestLapValSpan.className = "";
            c.bestLapNumSpan.textContent = "";
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

if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
}

window.addEventListener(
    "scroll",
    () => {
        const pos = window.scrollY || document.documentElement.scrollTop;
        if (pos > 0) {
            sessionStorage.setItem("pageScrollPos", pos);
        }
    },
    { passive: true },
);

document.addEventListener(
    "scroll",
    (e) => {
        if (
            e.target &&
            e.target.classList &&
            e.target.classList.contains("table-wrapper")
        ) {
            if (e.target.scrollTop > 0) {
                sessionStorage.setItem("wrapperScrollPos", e.target.scrollTop);
            }
        }
    },
    true,
);

function restoreScrollPosition() {
    const pagePos = parseInt(sessionStorage.getItem("pageScrollPos"), 10);
    const wrapperPos = parseInt(sessionStorage.getItem("wrapperScrollPos"), 10);

    let attempts = 0;
    const timer = setInterval(() => {
        attempts++;

        if (pagePos) {
            window.scrollTo(0, pagePos);
        }

        const wrapper = document.querySelector(".table-wrapper");
        if (wrapper && wrapperPos) {
            wrapper.scrollTop = wrapperPos;
        }

        if (attempts > 25) {
            clearInterval(timer);
        }
    }, 100);
}

document.addEventListener("DOMContentLoaded", () => {
    const ui = new F1LiveTimingUI("app");
    window.f1Client = new F1LiveClient(ui);
    restoreScrollPosition();
});
