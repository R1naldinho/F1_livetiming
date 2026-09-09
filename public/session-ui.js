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
        this.topRow.appendChild(topLeftGroup);
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
        this.weatherCard.title = "Click to open weather details, forecast & radar";
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

    async update(data) {
        const meetingName =
            data?.Meeting?.OfficialName || data?.Meeting?.Name || "Formula 1";
        const type = data?.Type || "Session";
        const name = data?.Name || "";
        const status = data?.SessionStatus || "Unknown";
        this.meeting.textContent = meetingName;
        this.sessionType.textContent = `${type} - ${name} (${status})`;
        this.sessionType.dataset.type = type;
        this.sessionType.dataset.name = name;
        await this.initOrUpdateMap(data);
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
            const themeName = isLight ? "light" : "dark";
            const tileUrl = `/api/tiles/${themeName}/{z}/{x}/{y}`;

            this.baseMapLayer = L.tileLayer(tileUrl, {
                maxZoom: 19,
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>',
            }).addTo(this.map);

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