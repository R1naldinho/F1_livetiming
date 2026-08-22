class SessionInfoUI {
    constructor(container) {
        this.root = document.createElement('div');
        this.root.className = 'session-header';

        this.topRow = document.createElement('div');
        this.topRow.className = 'session-top-row';
        
        const topLeftGroup = document.createElement('div');
        topLeftGroup.className = 'session-top-left';
        this.meeting = document.createElement('h1');
        this.sessionType = document.createElement('span');
        this.sessionType.className = 'session-badge';
        
        topLeftGroup.appendChild(this.meeting);
        topLeftGroup.appendChild(this.sessionType);

        this.themeBtn = document.createElement('button');
        this.themeBtn.className = 'theme-toggle-btn';
        const isLight = localStorage.getItem('theme') === 'light';
        if (isLight) {
            document.body.classList.add('light-mode');
            this.themeBtn.textContent = '☾ Dark Mode';
        } else {
            this.themeBtn.textContent = '☀︎ Light Mode';
        }

        this.themeBtn.onclick = () => {
            document.body.classList.toggle('light-mode');
            const lightActive = document.body.classList.contains('light-mode');
            this.themeBtn.textContent = lightActive ? '☾ Dark Mode' : '☀ Light Mode';
            localStorage.setItem('theme', lightActive ? 'light' : 'dark');
        };

        this.topRow.appendChild(topLeftGroup);
        this.topRow.appendChild(this.themeBtn);

        this.mainContentRow = document.createElement('div');
        this.mainContentRow.className = 'session-main-row';

        this.leftColumn = document.createElement('div');
        this.leftColumn.className = 'session-left-col';

        this.trackStatusElement = document.createElement('div');
        this.trackStatusElement.className = 'track-status-badge status-clear';

        this.clockElement = document.createElement('div');
        this.clockElement.className = 'clock-pill';

        this.progressElement = document.createElement('div');
        this.progressElement.className = 'session-progress';

        this.leftColumn.appendChild(this.trackStatusElement);
        this.leftColumn.appendChild(this.clockElement);
        this.leftColumn.appendChild(this.progressElement);

        this.weatherCard = document.createElement('div');
        this.weatherCard.className = 'weather-card clickable-card';
        this.weatherCard.title = 'Click to open weather details, forecast & radar';
        this.weatherCard.onclick = () => this.showWeatherModal();

        this.weatherTitle = document.createElement('div');
        this.weatherTitle.className = 'weather-title';
        this.weatherTitle.textContent = 'Weather';
        this.weatherCard.appendChild(this.weatherTitle);

        this.weatherGrid = document.createElement('div');
        this.weatherGrid.className = 'weather-grid-compact';
        
        this.airTempEl = this.createWeatherItem('Air', '--°C');
        this.trackTempEl = this.createWeatherItem('Track', '--°C');
        this.windEl = this.createWeatherItem('Wind', '-- m/s');
        this.rainEl = this.createWeatherItem('Rain', 'No');
        this.rainEl.container.style.display = 'none';

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

        this.initWeatherModal();
        this.fetchForecast();
    }

    createWeatherItem(label, initialValue) {
        const container = document.createElement('div');
        container.className = 'weather-item';

        const labelEl = document.createElement('span');
        labelEl.className = 'weather-label';
        labelEl.textContent = label;

        const valueEl = document.createElement('span');
        valueEl.className = 'weather-value';
        valueEl.innerHTML = initialValue;

        container.appendChild(labelEl);
        container.appendChild(valueEl);

        return { container, valueEl };
    }

    initWeatherModal() {
        this.weatherModal = document.createElement('div');
        this.weatherModal.className = 'stints-modal';

        const modalContent = document.createElement('div');
        modalContent.className = 'weather-modal-content';

        const modalHeader = document.createElement('div');
        modalHeader.className = 'stints-modal-header';

        const title = document.createElement('h3');
        title.textContent = 'Weather Details, 3-Hour Forecast & Radar';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'stints-close-btn';
        closeBtn.textContent = '×';
        closeBtn.onclick = () => {
            this.weatherModal.style.display = 'none';
        };

        modalHeader.appendChild(title);
        modalHeader.appendChild(closeBtn);

        this.weatherModalBody = document.createElement('div');
        this.weatherModalBody.className = 'weather-modal-body';

        const fullGridTitle = document.createElement('div');
        fullGridTitle.className = 'forecast-title';
        fullGridTitle.textContent = 'Current Conditions';
        
        this.fullWeatherGrid = document.createElement('div');
        this.fullWeatherGrid.className = 'weather-grid';
        
        this.modalAir = this.createWeatherItem('Air', '--°C');
        this.modalTrack = this.createWeatherItem('Track', '--°C');
        this.modalWind = this.createWeatherItem('Wind', '-- m/s');
        this.modalHumidity = this.createWeatherItem('Humidity', '--%');
        this.modalPressure = this.createWeatherItem('Pressure', '-- hPa');
        this.modalRain = this.createWeatherItem('Rain', 'No');
        this.modalRain.container.style.display = 'none';

        this.fullWeatherGrid.appendChild(this.modalAir.container);
        this.fullWeatherGrid.appendChild(this.modalTrack.container);
        this.fullWeatherGrid.appendChild(this.modalWind.container);
        this.fullWeatherGrid.appendChild(this.modalHumidity.container);
        this.fullWeatherGrid.appendChild(this.modalPressure.container);
        this.fullWeatherGrid.appendChild(this.modalRain.container);

        this.forecastContainer = document.createElement('div');
        this.forecastContainer.className = 'forecast-container';
        const forecastTitle = document.createElement('div');
        forecastTitle.className = 'forecast-title';
        forecastTitle.textContent = '3-Hour Forecast';
        this.forecastItems = document.createElement('div');
        this.forecastItems.className = 'forecast-items';
        this.forecastItems.textContent = 'Loading forecast...';
        this.forecastContainer.appendChild(forecastTitle);
        this.forecastContainer.appendChild(this.forecastItems);

        this.radarContainer = document.createElement('div');
        this.radarContainer.className = 'radar-container';
        const radarTitle = document.createElement('div');
        radarTitle.className = 'forecast-title';
        radarTitle.textContent = 'Live Rain Radar';
        const radarWrapper = document.createElement('div');
        radarWrapper.className = 'radar-map-wrapper';
        
        const radarIframe = document.createElement('iframe');
        radarIframe.src = 'https://www.rainviewer.com/map.html?loc=52.3888,4.6377,9&ozoom=1&oC=0&oU=0&oCS=1&oF=1&oG=0&oCl=0&oLI=0&assen=0&layer=radar&smooth=1&snow=1';
        radarIframe.width = '100%';
        radarIframe.height = '240';
        radarIframe.style.border = '0';
        radarIframe.style.borderRadius = '4px';

        radarWrapper.appendChild(radarIframe);
        this.radarContainer.appendChild(radarTitle);
        this.radarContainer.appendChild(radarWrapper);

        this.weatherModalBody.appendChild(fullGridTitle);
        this.weatherModalBody.appendChild(this.fullWeatherGrid);
        this.weatherModalBody.appendChild(this.forecastContainer);
        this.weatherModalBody.appendChild(this.radarContainer);

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(this.weatherModalBody);
        this.weatherModal.appendChild(modalContent);
        document.body.appendChild(this.weatherModal);

        window.addEventListener('click', (event) => {
            if (event.target === this.weatherModal) {
                this.weatherModal.style.display = 'none';
            }
        });
    }

    showWeatherModal() {
        this.weatherModal.style.display = 'flex';
    }

    async fetchForecast() {
        try {
            const lat = 52.3888;
            const lon = 4.6377;
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,rain&timezone=auto`);
            const data = await res.json();
            
            const nowIdx = new Date().getHours();
            this.forecastItems.textContent = '';
            for (let i = 1; i <= 3; i++) {
                const hourIdx = (nowIdx + i) % 24;
                const timeStr = `${String(hourIdx).padStart(2, '0')}:00`;
                const temp = data.hourly.temperature_2m[nowIdx + i];
                const rainProb = data.hourly.precipitation_probability[nowIdx + i];

                const item = document.createElement('div');
                item.className = 'forecast-item';
                
                const timeSpan = document.createElement('span');
                timeSpan.className = 'forecast-time';
                timeSpan.textContent = timeStr;

                const tempSpan = document.createElement('span');
                tempSpan.className = 'forecast-temp';
                tempSpan.textContent = `${temp}°C`;

                const rainSpan = document.createElement('span');
                rainSpan.className = 'forecast-rain';
                rainSpan.textContent = `💧 ${rainProb}%`;

                item.appendChild(timeSpan);
                item.appendChild(tempSpan);
                item.appendChild(rainSpan);
                this.forecastItems.appendChild(item);
            }
        } catch (e) {
            this.forecastItems.textContent = 'Forecast unavailable';
        }
    }

    update(data) {
        const meetingName = data?.Meeting?.OfficialName || data?.Meeting?.Name || 'Formula 1';
        const type = data?.Type || 'Session';
        const name = data?.Name || '';
        const status = data?.SessionStatus || 'Unknown';

        this.meeting.textContent = meetingName;
        this.sessionType.textContent = `${type} - ${name} (${status})`;
        this.sessionType.dataset.type = type;
        this.sessionType.dataset.name = name;
    }

    parseTime(str) {
        if (!str) return 0;
        const parts = str.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return 0;
    }

    formatTime(seconds) {
        if (seconds <= 0) return '00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) {
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    updateClock(data) {
        if (!data) return;
        
        this.clockData = data;
        const remainingSeconds = this.parseTime(data.Remaining);
        this.clockData.targetMs = Date.now() + (remainingSeconds * 1000);
        
        if (!this.clockInterval) {
            this.clockInterval = setInterval(() => this.tickClock(), 1000);
        }
        this.tickClock();
    }

    tickClock() {
        if (!this.clockData) return;
        
        if (this.clockData.Extrapolating === false || this.clockData.Extrapolating === '0') {
            this.clockElement.textContent = this.clockData.Remaining || '--:--';
            return;
        }

        const diffSeconds = Math.max(0, (this.clockData.targetMs - Date.now()) / 1000);
        this.clockElement.textContent = this.formatTime(diffSeconds);
    }

    updateSessionStatus(data) {
        const type = this.sessionType.dataset.type || 'Session';
        const name = this.sessionType.dataset.name || '';
        const status = data?.Status || 'Unknown';
        this.sessionType.textContent = `${type} - ${name} (${status})`;
    }

    updateSessionProgress(data) {
        if (!data) return;

        if (data.kind === 'race') {
            this.clockElement.style.display = 'none';
            this.progressElement.style.display = 'block';
            this.progressElement.className = 'clock-pill';
            this.progressElement.textContent = data.currentLap > 0 ? `Lap ${data.currentLap}` : 'Lap --';
        } else {
            this.clockElement.style.display = 'block';
            this.progressElement.style.display = 'block';
            this.progressElement.className = 'session-progress';
            this.progressElement.textContent = data.kind === 'qualifying' ? 'Qualifying' : 'Practice';
        }
    }

    updateTrackStatus(data) {
        this.trackStatusElement.textContent = data.Message;
        this.trackStatusElement.className = `track-status-badge status-${data.Message.toLowerCase().replace(/\s+/g, '-')}`;
    }

    updateWeather(data) {
        this.airTempEl.valueEl.textContent = `${data.AirTemp}°C`;
        this.trackTempEl.valueEl.textContent = `${data.TrackTemp}°C`;
        
        const windDeg = Number(data.WindDirection) || 0;
        const windHtml = `${data.WindSpeed} m/s <span class="wind-indicator" style="transform: rotate(${windDeg}deg);">➔</span>`;
        
        this.windEl.valueEl.innerHTML = windHtml;
        this.modalWind.valueEl.innerHTML = windHtml;

        this.modalAir.valueEl.textContent = `${data.AirTemp}°C`;
        this.modalTrack.valueEl.textContent = `${data.TrackTemp}°C`;
        this.modalHumidity.valueEl.textContent = `${data.Humidity}%`;
        this.modalPressure.valueEl.textContent = `${data.Pressure} hPa`;

        const isRaining = data.Rainfall === '1' || data.Rainfall === 1;
        if (isRaining) {
            this.rainEl.valueEl.textContent = 'Rain ☔︎︎';
            this.rainEl.container.style.display = 'flex';
            this.rainEl.container.classList.add('rain-active');
            this.modalRain.valueEl.textContent = 'Rain ☔︎︎';
            this.modalRain.container.style.display = 'flex';
            this.modalRain.container.classList.add('rain-active');
        } else {
            this.rainEl.container.style.display = 'none';
            this.modalRain.container.style.display = 'none';
            this.rainEl.container.classList.remove('rain-active');
            this.modalRain.container.classList.remove('rain-active');
        }
    }
}

class F1LiveTimingUI {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.sessionUI = new SessionInfoUI(this.container);
        this.initTable();
        this.initModal();
    }

    initTable() {
        this.tableWrapper = document.createElement('div');
        this.tableWrapper.className = 'table-wrapper';

        const table = document.createElement('table');
        table.className = 'timing-table';
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        const headers = [
            'Pos', 'Driver', 'Tyres', 'Gap', 'Diff', 'Last Lap', 
            'Last S1', 'Last S2', 'Last S3', 
            'Best Lap', 'Best S1', 'Best S2', 'Best S3', 
            'Pit Stops', 'Laps'
        ];

        headers.forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            tr.appendChild(th);
        });

        thead.appendChild(tr);
        table.appendChild(thead);
        this.tbody = document.createElement('tbody');
        this.tbody.id = 'driver-rows';
        table.appendChild(this.tbody);
        this.tableWrapper.appendChild(table);
        this.container.appendChild(this.tableWrapper);
    }

    initModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'stints-modal';

        const modalContent = document.createElement('div');
        modalContent.className = 'stints-modal-content';

        const modalHeader = document.createElement('div');
        modalHeader.className = 'stints-modal-header';

        this.modalTitle = document.createElement('h3');
        this.modalTitle.textContent = 'Driver Stints History';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'stints-close-btn';
        closeBtn.textContent = '×';
        closeBtn.onclick = () => {
            this.modal.style.display = 'none';
        };

        modalHeader.appendChild(this.modalTitle);
        modalHeader.appendChild(closeBtn);

        this.stintsBody = document.createElement('div');
        this.stintsBody.className = 'stints-body';
        this.stintsBody.textContent = 'Click a tyre badge to view stints.';

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(this.stintsBody);
        this.modal.appendChild(modalContent);
        document.body.appendChild(this.modal);

        window.onclick = (event) => {
            if (event.target === this.modal) {
                this.modal.style.display = 'none';
            }
        };
    }

    showStintsModal(driverNum, driverName, stintsInput) {
        const stints = Array.isArray(stintsInput) ? stintsInput : (stintsInput ? Object.values(stintsInput) : []);
        while (this.stintsBody.firstChild) {
            this.stintsBody.removeChild(this.stintsBody.firstChild);
        }

        const headerSub = document.createElement('h4');
        headerSub.textContent = `Driver #${driverNum} - ${driverName}`;
        this.stintsBody.appendChild(headerSub);

        if (!stints || stints.length === 0) {
            const p = document.createElement('p');
            p.textContent = 'No stint data available.';
            this.stintsBody.appendChild(p);
        } else {
            const list = document.createElement('div');
            list.className = 'stints-list';

            stints.forEach((stint, idx) => {
                const comp = (stint.Compound || 'UNKNOWN').toUpperCase();
                const total = parseInt(stint.TotalLaps, 10) || 0;
                const start = parseInt(stint.StartLaps, 10) || 0;
                const stintLaps = total - start;
                const notChanged = stint.TyresNotChanged === "1" || stint.TyresNotChanged === 1;

                const item = document.createElement('div');
                item.className = `stint-item tyre-${comp.toLowerCase()}`;

                const img = document.createElement('img');
                img.src = `img/tyre_${comp.toLowerCase()}.svg`;
                img.className = 'stint-svg-icon';
                img.onerror = () => { img.src = 'img/tyre_unknown.svg'; };

                const stintNumSpan = document.createElement('span');
                stintNumSpan.className = 'stint-num';
                stintNumSpan.textContent = `Stint ${idx + 1} (${comp})`;

                const stintDetailsSpan = document.createElement('span');
                stintDetailsSpan.className = 'stint-laps';
                let detailsText = `${stintLaps} Laps`;
                if (notChanged) {
                    detailsText += ' (Not Changed)';
                }
                stintDetailsSpan.textContent = detailsText;

                item.appendChild(img);
                item.appendChild(stintNumSpan);
                item.appendChild(stintDetailsSpan);
                list.appendChild(item);
            });
            this.stintsBody.appendChild(list);
        }
        this.modal.style.display = 'flex';
    }

    updateSession(data) {
        this.sessionUI.update(data);
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
        if (!valStr || valStr === '-' || typeof valStr !== 'string') return Infinity;
        valStr = valStr.trim();
        const parts = valStr.split(':');
        try {
            if (parts.length === 3) {
                return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + parseFloat(parts[2]);
            } else if (parts.length === 2) {
                return Number(parts[0]) * 60 + parseFloat(parts[1]);
            } else if (parts.length === 1) {
                return parseFloat(parts[0]) || Infinity;
            }
        } catch (e) {
            return Infinity;
        }
        return Infinity;
    }

    getTimingClass(item) {
        if (!item || !item.Value || item.Value === '-') return '';
        if (item.OverallFastest === true) return 'color-purple';
        if (item.PersonalFastest === true) return 'color-green';
        return 'color-yellow';
    }

    getBestTimingClass(item, allValuesArray) {
        if (!item || !item.Value || item.Value === '-') return '';
        const currentValSec = this.parseTimeToSeconds(item.Value);
        if (currentValSec === Infinity) return '';

        if (allValuesArray && allValuesArray.length > 0) {
            const validSecs = allValuesArray
                .map(v => this.parseTimeToSeconds(v))
                .filter(v => v !== Infinity);

            if (validSecs.length > 0) {
                const minSec = Math.min(...validSecs);
                if (Math.abs(currentValSec - minSec) < 0.0001) {
                    return 'color-purple';
                }
            }
        }
        return 'color-green';
    }

    getSegmentClass(status) {
        const value = Number(status);
        if (value === 2051 || value === 4 || value === 8) return 'seg-purple';
        if (value === 2049 || value === 2) return 'seg-green';
        if (value === 2064 || value === 1) return 'seg-pit';
        if (value === 2048) return 'seg-yellow';
        return 'seg-default';
    }

    createSectorCellNode() {
        const td = document.createElement('td');
        const container = document.createElement('div');
        container.className = 'sector-cell-container';

        const valueSpan = document.createElement('span');
        const segContainer = document.createElement('div');
        segContainer.className = 'segments-container';

        container.appendChild(valueSpan);
        container.appendChild(segContainer);
        td.appendChild(container);
        return { td, valueSpan, segContainer };
    }

    updateSectorCellNode(node, sectorData, hasSegments) {
        const value = sectorData?.Value || '';
        node.valueSpan.textContent = value || '-';
        node.valueSpan.className = this.getTimingClass(sectorData);

        while (node.segContainer.firstChild) {
            node.segContainer.removeChild(node.segContainer.firstChild);
        }

        if (!hasSegments || !sectorData?.Segments) return;

        const segments = Array.isArray(sectorData.Segments)
            ? sectorData.Segments
            : Object.keys(sectorData.Segments)
                .sort((a, b) => Number(a) - Number(b))
                .map(key => sectorData.Segments[key]);

        segments.forEach(segment => {
            const segmentElement = document.createElement('div');
            segmentElement.className = `micro-segment ${this.getSegmentClass(segment?.Status)}`;
            node.segContainer.appendChild(segmentElement);
        });
    }

    createBestSectorCellNode() {
        const td = document.createElement('td');
        const valueSpan = document.createElement('span');
        td.appendChild(valueSpan);
        return { td, valueSpan };
    }

    updateBestSectorCellNode(node, sectorData, allValuesArray) {
        const val = sectorData && sectorData.Value ? sectorData.Value : '-';
        node.valueSpan.textContent = val;
        node.valueSpan.className = this.getBestTimingClass(sectorData, allValuesArray);
    }

    updateDriverRow(driverData, globalBests = {}) {
        const rowId = `driver-${driverData.racingNumber}`;
        let row = this.tbody.querySelector(`#${rowId}`);

        if (!row) {
            row = document.createElement('tr');
            row.id = rowId;

            const posCell = document.createElement('td');
            const posSpan = document.createElement('span');
            posSpan.className = 'driver-position';
            posCell.appendChild(posSpan);

            const driverCell = document.createElement('td');
            const driverContainer = document.createElement('div');
            driverContainer.className = 'driver-cell-container';

            const numberSpan = document.createElement('span');
            numberSpan.className = 'driver-number';

            const nameSpan = document.createElement('strong');
            nameSpan.className = 'driver-name';

            const badgeContainer = document.createElement('div');
            badgeContainer.className = 'badge-container';

            driverContainer.appendChild(numberSpan);
            driverContainer.appendChild(nameSpan);
            driverContainer.appendChild(badgeContainer);
            driverCell.appendChild(driverContainer);

            const tyreCell = document.createElement('td');
            const tyreBadge = document.createElement('div');
            tyreBadge.className = 'tyre-fixed-badge';

            const tyreImg = document.createElement('img');
            tyreImg.className = 'tyre-svg-icon';
            tyreImg.onerror = () => { tyreImg.src = 'img/tyre_unknown.svg'; };

            const tyreText = document.createElement('span');
            tyreText.className = 'tyre-text';
            const tyreCompB = document.createElement('b');
            const tyreLapsSpan = document.createElement('span');
            tyreText.appendChild(tyreCompB);
            tyreText.appendChild(tyreLapsSpan);

            tyreBadge.appendChild(tyreImg);
            tyreBadge.appendChild(tyreText);
            tyreCell.appendChild(tyreBadge);

            const gapCell = document.createElement('td');
            const diffCell = document.createElement('td');
            const lastLapCell = document.createElement('td');

            const lastS1Cell = this.createSectorCellNode();
            const lastS2Cell = this.createSectorCellNode();
            const lastS3Cell = this.createSectorCellNode();

            const bestLapCell = document.createElement('td');
            const bestLapValSpan = document.createElement('span');
            const bestLapNumSpan = document.createElement('span');
            bestLapCell.appendChild(bestLapValSpan);
            bestLapCell.appendChild(bestLapNumSpan);

            const bestS1Cell = this.createBestSectorCellNode();
            const bestS2Cell = this.createBestSectorCellNode();
            const bestS3Cell = this.createBestSectorCellNode();

            const pitStopsCell = document.createElement('td');
            const lapsCell = document.createElement('td');

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
                lapsCell
            };
        }

        if (driverData.knockedOut) {
            row.classList.add('driver-knocked-out');
        } else {
            row.classList.remove('driver-knocked-out');
        }

        const c = row.cache;

        c.posSpan.textContent = driverData.position !== undefined ? driverData.position : '-';
        c.numberSpan.textContent = `#${driverData.racingNumber}`;
        const displayName = driverData.tLA || driverData.lastName || driverData.racingNumber;
        if (displayName) {
            c.nameSpan.textContent = displayName;
        }
        if (driverData.teamColour) {
            c.nameSpan.style.color = `#${driverData.teamColour}`;
        }

        while (c.badgeContainer.firstChild) {
            c.badgeContainer.removeChild(c.badgeContainer.firstChild);
        }

        if (driverData.retired) {
            const badge = document.createElement('span');
            badge.className = 'status-badge badge-retired';
            badge.textContent = 'RET';
            c.badgeContainer.appendChild(badge);
        } else if (driverData.inPit) {
            const badge = document.createElement('span');
            badge.className = 'status-badge badge-pit';
            badge.textContent = 'PIT';
            c.badgeContainer.appendChild(badge);
        } else if (driverData.pitOut) {
            const badge = document.createElement('span');
            badge.className = 'status-badge badge-out';
            badge.textContent = 'OUT';
            c.badgeContainer.appendChild(badge);
        }

        if (driverData.currentTyre && driverData.currentTyre.Compound) {
            const compound = driverData.currentTyre.Compound.toUpperCase();
            const total = parseInt(driverData.currentTyre.TotalLaps, 10) || 0;
            const start = parseInt(driverData.currentTyre.StartLaps, 10) || 0;
            const tyreLaps = total - start;
            
            c.tyreBadge.className = `tyre-fixed-badge tyre-${compound.toLowerCase()}`;
            
            let shortComp = compound.charAt(0);
            if (compound === 'INTERMEDIATE') shortComp = 'I';
            if (compound === 'MEDIUM') shortComp = 'M';
            if (compound === 'SOFT') shortComp = 'S';
            if (compound === 'HARD') shortComp = 'H';
            if (compound === 'WET') shortComp = 'W';

            c.tyreImg.src = `img/tyre_${compound.toLowerCase()}.svg`;
            c.tyreCompB.textContent = shortComp;
            c.tyreLapsSpan.textContent = ` (${tyreLaps})`;
            c.tyreBadge.title = `Click to view all stints (${compound} - ${tyreLaps} laps)`;
            c.tyreBadge.onclick = () => {
                this.showStintsModal(driverData.racingNumber, c.nameSpan.textContent, driverData.allStints);
            };
        } else {
            c.tyreBadge.className = 'tyre-fixed-badge tyre-unknown';
            c.tyreImg.src = 'img/tyre_unknown.svg';
            c.tyreCompB.textContent = '-';
            c.tyreLapsSpan.textContent = '';
            c.tyreBadge.title = '';
            c.tyreBadge.onclick = null;
        }

        c.gapCell.textContent = driverData.gap || '-';
        c.diffCell.textContent = driverData.diff || '-';
        c.lastLapCell.textContent = driverData.lastLap && driverData.lastLap.Value ? driverData.lastLap.Value : '-';

        this.updateSectorCellNode(c.lastS1, driverData.lastS1, true);
        this.updateSectorCellNode(c.lastS2, driverData.lastS2, true);
        this.updateSectorCellNode(c.lastS3, driverData.lastS3, true);

        const bestVal = driverData.bestLap && driverData.bestLap.Value ? driverData.bestLap.Value : '-';
        if (bestVal !== '-') {
            c.bestLapValSpan.textContent = bestVal;
            c.bestLapValSpan.className = this.getBestTimingClass(driverData.bestLap, globalBests.allBestLaps);
            c.bestLapNumSpan.textContent = driverData.bestLap.Lap ? ` (Lap ${driverData.bestLap.Lap})` : '';
        } else {
            c.bestLapValSpan.textContent = '-';
            c.bestLapValSpan.className = '';
            c.bestLapNumSpan.textContent = '';
        }

        this.updateBestSectorCellNode(c.bestS1, driverData.bestS1, globalBests.allBestS1);
        this.updateBestSectorCellNode(c.bestS2, driverData.bestS2, globalBests.allBestS2);
        this.updateBestSectorCellNode(c.bestS3, driverData.bestS3, globalBests.allBestS3);

        c.pitStopsCell.textContent = driverData.pitStops !== undefined ? driverData.pitStops : '-';
        c.lapsCell.textContent = driverData.numberOfLaps !== undefined ? driverData.numberOfLaps : '-';

        this.tbody.appendChild(row);
    }
    refreshTable(clientOrData) {
        let timingData = {};
        
        if (clientOrData && clientOrData.timingData) {
            timingData = clientOrData.timingData;
        } else if (window.f1Client && window.f1Client.timingData) {
            timingData = window.f1Client.timingData;
        } else if (clientOrData && typeof clientOrData === 'object') {
            timingData = clientOrData;
        }

        const driverNums = Object.keys(timingData);
        
        const getDriver = (num) => {
            if (clientOrData && typeof clientOrData.getDriverData === 'function') {
                return clientOrData.getDriverData(num);
            }
            if (window.f1Client && typeof window.f1Client.getDriverData === 'function') {
                return window.f1Client.getDriverData(num);
            }
            return timingData[num] || {};
        };

        const allBestLaps = [];
        const allBestS1 = [];
        const allBestS2 = [];
        const allBestS3 = [];

        driverNums.forEach(num => {
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

        driverNums.forEach(driverNum => {
            const driverData = getDriver(driverNum);
            this.updateDriverRow(driverData, { allBestLaps, allBestS1, allBestS2, allBestS3 });
        });
    }
}
