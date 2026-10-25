class F1LiveClient {
    constructor(uiManager = null) {
        this.delayMs = 30000;
        this.streamQueue = [];
        this.streamTimer = null;
        this.isInitialized = false;
        this.countdownInterval = null;
        this.syncStartTime = null;
        this.syncDurationMs = 30000;

        this.ui = uiManager;
        this.drivers = {};
        this.timingData = {};
        this.timingStats = {};
        this.timingAppData = {};
        this.sessionData = {};
        this.sessionInfo = null;
        this.raceControlMessages = {};
        this.lapCount = null;
        this.isRefreshPending = false;
        this.reconnectTimer = null;
        this._resolveSessionReady = null;
        this.sessionReadyPromise = new Promise((resolve) => {
            this._resolveSessionReady = resolve;
        });

        this.initDelayConfig();
        this.initWebSocket();
        this.initTabVisibilityListener();
    }

    initDelayConfig() {
        const savedDelay = localStorage.getItem("f1_live_delay");
        if (savedDelay !== null) {
            const val = Number(savedDelay);
            if (!isNaN(val)) {
                this.delayMs = Math.max(0, Math.min(300, val)) * 1000;
            }
        } else {
            localStorage.setItem("f1_live_delay", "30");
        }

        if (this.delayMs === 0) {
            this.isInitialized = true;
        } else {
            this.syncDurationMs = this.delayMs;
            this.syncStartTime = Date.now();
        }

        this.createDelayControlDOM();
    }

    initTabVisibilityListener() {
        const checkVisibility = () => {
            const livetimingEl = document.getElementById("livetiming");
            const loadingDiv = document.getElementById("loading_livetiming");
            if (!livetimingEl) return;

            const isVisible = getComputedStyle(livetimingEl).display !== "none" || livetimingEl.style.display === "block";

            if (!isVisible && (!loadingDiv || loadingDiv.style.display === "none")) {
                if (loadingDiv) loadingDiv.style.display = "none";
            } else {
                const now = Date.now();
                const elapsed = this.syncStartTime ? now - this.syncStartTime : this.syncDurationMs;
                if (!this.isInitialized && elapsed < this.syncDurationMs) {
                    livetimingEl.style.display = "none";
                    this.showSyncContainer(this.syncDurationMs - elapsed);
                } else {
                    this.hideSyncContainer();
                }
            }
        };

        const observer = new MutationObserver(checkVisibility);
        const livetimingEl = document.getElementById("livetiming");
        if (livetimingEl) {
            observer.observe(livetimingEl, { attributes: true, attributeFilter: ["style", "class"] });
        }

        const handleInitialLoad = () => {
            if (this.delayMs > 0 && !this.isInitialized) {
                const elapsed = Date.now() - (this.syncStartTime || Date.now());
                if (elapsed < this.syncDurationMs) {
                    this.showSyncContainer(this.syncDurationMs - elapsed);
                }
            }
        };

        if (document.readyState === "loading") {
            window.addEventListener("DOMContentLoaded", handleInitialLoad);
        } else {
            setTimeout(handleInitialLoad, 50);
        }
    }

    createDelayControlDOM() {
        if (document.getElementById("liveDelayContainer")) return;

        const container = document.createElement("div");
        container.id = "liveDelayContainer";

        const label = document.createElement("label");
        label.htmlFor = "liveDelaySelect";
        label.textContent = "Live Delay:";

        const select = document.createElement("select");
        select.id = "liveDelaySelect";

        const options = [
            { val: "0", label: "Real time" },
            { val: "5", label: "5 seconds" },
            { val: "10", label: "10 seconds" },
            { val: "15", label: "15 seconds" },
            { val: "20", label: "20 seconds" },
            { val: "30", label: "30 seconds" },
            { val: "45", label: "45 seconds" },
            { val: "60", label: "60 seconds" },
            { val: "custom", label: "Custom..." },
        ];

        const currentSecs = this.getDelay();
        let matched = false;

        options.forEach((opt) => {
            const optionEl = document.createElement("option");
            optionEl.value = opt.val;
            optionEl.textContent = opt.label;
            if (opt.val !== "custom" && Number(opt.val) === currentSecs) {
                optionEl.selected = true;
                matched = true;
            }
            select.appendChild(optionEl);
        });

        const customInput = document.createElement("input");
        customInput.type = "number";
        customInput.id = "liveDelayCustomInput";
        customInput.min = "0";
        customInput.max = "300";
        customInput.style.display = "none";

        if (!matched) {
            select.value = "custom";
            customInput.value = currentSecs;
            customInput.style.display = "inline-block";
        }

        select.addEventListener("change", () => {
            if (select.value === "custom") {
                customInput.style.display = "inline-block";
                customInput.focus();
            } else {
                customInput.style.display = "none";
                this.setDelay(select.value);
            }
        });

        customInput.addEventListener("change", () => {
            this.setDelay(customInput.value);
        });

        container.appendChild(label);
        container.appendChild(select);
        container.appendChild(customInput);

        const targetContainer = document.getElementById("navbarDelayContainer") || document.body;
        targetContainer.appendChild(container);
    }

    initWebSocket() {
        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onerror = null;
            this.ws.onclose = null;
            this.ws.close();
        }

        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        this.ws = new WebSocket(`${protocol}://${window.location.host}`);

        this.ws.onopen = () => {
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                if (message.type === 3 && message.result) {
                    this.enqueueStream("__snapshot", message.result);
                    return;
                }

                if (
                    message.type === 1 &&
                    Array.isArray(message.arguments) &&
                    message.arguments.length >= 2
                ) {
                    this.enqueueStream(
                        message.arguments[0],
                        message.arguments[1],
                    );
                    return;
                }

                this.enqueueStream(message.streamType, message.data);
            } catch (error) {}
        };

        this.ws.onerror = () => {
            this.ws.close();
        };

        this.ws.onclose = () => {
            this.reconnectTimer = setTimeout(() => this.initWebSocket(), 3000);
        };
    }

    enqueueStream(type, data) {
        if (type === "SessionInfo" || type === "WeatherData" || type === "SessionStatus" || type === "TrackStatus" || type === "ExtrapolatedClock") {
            this.applyStream(type, data);
        }

        if (this.delayMs === 0) {
            this.isInitialized = true;
            if (type === "__snapshot") {
                this.applySnapshotNow(data);
            } else {
                this.applyStream(type, data);
            }
            return;
        }

        this.streamQueue.push({
            type,
            data,
            receivedAt: Date.now(),
        });

        if (type === "__snapshot" && data && data.SessionInfo) {
            this.applyStream("SessionInfo", data.SessionInfo);
        }

        this.processStreamQueue();
    }

    processStreamQueue() {
        if (this.delayMs === 0) return;

        const now = Date.now();
        const elapsed = now - this.syncStartTime;

        if (!this.isInitialized) {
            if (elapsed < this.syncDurationMs) {
                const livetimingEl = document.getElementById("livetiming");
                const isVisible = livetimingEl && getComputedStyle(livetimingEl).display !== "none";
                if (isVisible) {
                    this.showSyncContainer(this.syncDurationMs - elapsed);
                }
                if (!this.streamTimer) {
                    this.streamTimer = setTimeout(
                        () => this.processStreamQueue(),
                        this.syncDurationMs - elapsed,
                    );
                }
                return;
            } else {
                this.isInitialized = true;
                this.hideSyncContainer();
            }
        }

        while (this.streamQueue.length > 0) {
            const item = this.streamQueue.shift();
            if (item.type === "__snapshot") {
                this.applySnapshotNow(item.data);
            } else {
                this.applyStream(item.type, item.data);
            }
        }
    }

    showSyncContainer(initialRemainingMs) {
        const livetimingEl = document.getElementById("livetiming");
        const appDiv = document.getElementById("app") || document.body;

        if (livetimingEl) livetimingEl.style.display = "none";

        let loadingDiv = document.getElementById("loading_livetiming");
        if (!loadingDiv) {
            loadingDiv = document.createElement("div");
            loadingDiv.id = "loading_livetiming";

            const titleEl = document.createElement("h2");
            titleEl.textContent = "Synchronizing with TV live stream...";
            loadingDiv.appendChild(titleEl);

            const lightsWrapper = document.createElement("div");
            lightsWrapper.id = "f1SyncLights";

            for (let c = 1; c <= 5; c++) {
                const colEl = document.createElement("div");
                for (let l = 0; l < 2; l++) {
                    const lightEl = document.createElement("div");
                    colEl.appendChild(lightEl);
                }
                lightsWrapper.appendChild(colEl);
            }
            loadingDiv.appendChild(lightsWrapper);

            const timeEl = document.createElement("p");
            timeEl.id = "f1SyncTime";
            loadingDiv.appendChild(timeEl);

            appDiv.appendChild(loadingDiv);
        } else {
            loadingDiv.style.display = "flex";
        }

        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }

        const updateView = () => {
            const now = Date.now();
            const currentRemaining = Math.max(0, (this.syncStartTime + this.syncDurationMs) - now);
            const totalSec = currentRemaining / 1000;
            const secs = Math.floor(totalSec);
            const ms = Math.floor(currentRemaining % 1000);

            const timeEl = document.getElementById("f1SyncTime");
            if (timeEl) {
                timeEl.textContent = `${secs}.${String(ms).padStart(3, "0")}s`;
            }

            const activeColumns = totalSec <= 5 ? Math.min(5, Math.max(0, 5 - Math.floor(totalSec))) : 0;
            const lightsWrapper = document.getElementById("f1SyncLights");
            if (lightsWrapper) {
                const columns = lightsWrapper.children;
                for (let c = 0; c < columns.length; c++) {
                    const colEl = columns[c];
                    const isOn = (c + 1) <= activeColumns;
                    const bulbs = colEl.children;
                    for (let l = 0; l < bulbs.length; l++) {
                        const bulb = bulbs[l];
                        bulb.style.background = isOn ? "#ff1801" : "#333";
                        bulb.style.boxShadow = isOn ? "0 0 15px #ff1801" : "none";
                    }
                }
            }

            if (currentRemaining <= 0) {
                clearInterval(this.countdownInterval);
                this.isInitialized = true;
                this.hideSyncContainer();
                this.processStreamQueue();
            }
        };

        updateView();
        this.countdownInterval = setInterval(updateView, 30);
    }

    hideSyncContainer() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        if (this.streamTimer) {
            clearTimeout(this.streamTimer);
            this.streamTimer = null;
        }
        const loadingDiv = document.getElementById("loading_livetiming");
        if (loadingDiv) {
            loadingDiv.style.display = "none";
        }
        const livetimingEl = document.getElementById("livetiming");
        if (livetimingEl) {
            const liveTimingBtn = document.querySelector(".nav-link");
            const isLiveTimingActive = liveTimingBtn && liveTimingBtn.classList.contains("active");
            if (isLiveTimingActive) {
                livetimingEl.style.display = "block";
            } else {
                livetimingEl.style.display = "none";
            }
        }
    }

    setDelay(seconds) {
        const value = Math.max(0, Math.min(300, Number(seconds) || 0));

        this.delayMs = value * 1000;
        localStorage.setItem("f1_live_delay", String(value));

        this.syncDurationMs = this.delayMs;
        this.syncStartTime = Date.now();

        if (this.delayMs === 0) {
            this.isInitialized = true;
            this.hideSyncContainer();
        } else {
            this.isInitialized = false;
            const livetimingEl = document.getElementById("livetiming");
            const isVisible = livetimingEl && getComputedStyle(livetimingEl).display !== "none";
            if (isVisible) {
                this.showSyncContainer(this.syncDurationMs);
            }
        }

        this.processStreamQueue();
    }

    getDelay() {
        return this.delayMs / 1000;
    }

    applySnapshotNow(snapshot) {
        this.drivers = this.normalize(snapshot.DriverList || {});
        this.timingData = this.normalizeLines(snapshot.TimingData);
        this.timingStats = this.normalizeLines(snapshot.TimingStats);
        this.timingAppData = this.normalizeLines(snapshot.TimingAppData);
        this.sessionData = this.normalize(snapshot.SessionData || {});
        this.sessionInfo = snapshot.SessionInfo || null;
        this.raceControlMessages = this.normalizeMessages(
            snapshot.RaceControlMessages,
        );

        this.applyStream("SessionInfo", snapshot.SessionInfo);
        this.applyStream("ExtrapolatedClock", snapshot.ExtrapolatedClock);
        this.applyStream("SessionStatus", snapshot.SessionStatus);
        this.applyStream("TrackStatus", snapshot.TrackStatus);
        this.applyStream("LapCount", snapshot.LapCount);
        this.applyStream("WeatherData", snapshot.WeatherData);
        if (this.ui)
            this.ui.updateRaceControlMessages(
                this.getRaceControlMessagesList(),
            );
        this.scheduleUIRefresh();
    }

    async setUI(uiManager) {
        this.ui = uiManager;
        if (!this.ui) return;

        if (this.sessionInfo) {
            await this.ui.updateSession(this.sessionInfo);
        }
        if (this.lastExtrapolatedClock)
            this.ui.updateClock(this.lastExtrapolatedClock);
        if (this.lastSessionStatus)
            this.ui.updateSessionStatus(this.lastSessionStatus);
        if (this.lastTrackStatus)
            this.ui.updateTrackStatus(this.lastTrackStatus);
        if (this.lastWeatherData) this.ui.updateWeather(this.lastWeatherData);
        this.ui.updateRaceControlMessages(this.getRaceControlMessagesList());

        this.scheduleUIRefresh();
    }

    scheduleUIRefresh() {
        if (!this.ui || this.isRefreshPending || !this.isInitialized) {
            return;
        }

        this.isRefreshPending = true;

        requestAnimationFrame(() => {
            try {
                this.ui.refreshTable();
                this.ui.updateSessionProgress(
                    this.getSessionProgress(),
                    this.lapCount?.TotalLaps,
                );
            } catch (error) {
            } finally {
                this.isRefreshPending = false;
            }
        });
    }

    applyStream(streamType, data) {
        if (!data) {
            return;
        }

        switch (streamType) {
            case "SessionInfo":
                this.sessionInfo = this.normalize(data);
                if (this._resolveSessionReady) {
                    this._resolveSessionReady(this.sessionInfo);
                    this._resolveSessionReady = null;
                }
                if (this.ui) {
                    Promise.resolve(
                        this.ui.updateSession(this.sessionInfo),
                    ).catch(() => {});
                }
                break;
            case "ExtrapolatedClock":
                this.lastExtrapolatedClock = data;
                if (this.ui && this.isInitialized) this.ui.updateClock(data);
                break;
            case "SessionStatus":
                this.lastSessionStatus = data;
                if (this.ui && this.isInitialized)
                    this.ui.updateSessionStatus(data);
                break;
            case "TrackStatus":
                this.lastTrackStatus = data;
                if (this.ui && this.isInitialized)
                    this.ui.updateTrackStatus(data);
                break;
            case "LapCount":
                this.lapCount = data;
                this.scheduleUIRefresh();
                break;
            case "WeatherData":
                this.lastWeatherData = data;
                if (this.ui && this.isInitialized) this.ui.updateWeather(data);
                break;
            case "DriverList":
                this.drivers = this.mergeState(this.drivers, data);
                this.scheduleUIRefresh();
                break;
            case "SessionData":
                this.sessionData = this.mergeState(this.sessionData, data);
                this.scheduleUIRefresh();
                break;
            case "TimingData":
                if (data.Lines) {
                    this.mergeLines(this.timingData, data.Lines);
                    this.scheduleUIRefresh();
                }
                break;
            case "TimingStats":
                if (data.Lines) {
                    this.mergeLines(this.timingStats, data.Lines);
                    this.scheduleUIRefresh();
                }
                break;
            case "TimingAppData":
                if (data.Lines) {
                    this.mergeLines(this.timingAppData, data.Lines);
                    this.scheduleUIRefresh();
                }
                break;
            case "RaceControlMessages": {
                const incoming = this.normalizeMessages(data);
                this.raceControlMessages = {
                    ...this.raceControlMessages,
                    ...incoming,
                };
                if (this.ui && this.isInitialized)
                    this.ui.updateRaceControlMessages(
                        this.getRaceControlMessagesList(),
                    );
                break;
            }
        }
    }

    normalizeMessages(raw) {
        if (!raw) return {};
        const messages = raw.Messages !== undefined ? raw.Messages : raw;
        const normalized = this.normalize(messages);

        if (Array.isArray(normalized)) {
            const result = {};
            normalized.forEach((msg, idx) => {
                result[idx] = msg;
            });
            return result;
        }

        return normalized || {};
    }

    getRaceControlMessagesList() {
        return Object.values(this.raceControlMessages)
            .filter(Boolean)
            .sort((a, b) => new Date(a.Utc || 0) - new Date(b.Utc || 0));
    }

    mergeLines(target, lines) {
        Object.keys(lines).forEach((driverNumber) => {
            target[driverNumber] = this.mergeState(
                target[driverNumber] || {},
                lines[driverNumber],
            );
        });
    }

    mergeState(target, source) {
        if (source === null || source === undefined) {
            return target;
        }

        if (Array.isArray(source)) {
            return this.normalize(source);
        }

        if (typeof source !== "object") {
            return source;
        }

        if (Array.isArray(target)) {
            Object.keys(source).forEach((key) => {
                const index = Number(key);
                if (!Number.isInteger(index) || index < 0) {
                    return;
                }
                target[index] = this.mergeState(
                    target[index] || {},
                    source[key],
                );
            });
            return target;
        }

        if (!target || typeof target !== "object") {
            target = {};
        }

        Object.keys(source).forEach((key) => {
            const value = source[key];

            if (value === null || value === undefined) {
                return;
            }

            if (Array.isArray(value)) {
                target[key] = this.normalize(value);
            } else if (typeof value === "object") {
                target[key] = this.mergeState(target[key], value);
            } else {
                target[key] = value;
            }
        });

        return target;
    }

    normalize(value) {
        if (Array.isArray(value)) {
            return value.map((item) => this.normalize(item));
        }

        if (!value || typeof value !== "object") {
            return value;
        }

        const keys = Object.keys(value);
        const numericKeys =
            keys.length > 0 && keys.every((key) => /^\d+$/.test(key));

        if (numericKeys) {
            const indexes = keys.map(Number);
            const isDense =
                indexes.length === 0 ||
                indexes.every((index, position) => index === position);

            if (isDense) {
                return indexes
                    .sort((a, b) => a - b)
                    .map((index) => this.normalize(value[String(index)]));
            }
        }

        const result = {};
        keys.forEach((key) => {
            result[key] = this.normalize(value[key]);
        });
        return result;
    }

    normalizeLines(data) {
        const result = {};
        if (!data || !data.Lines) {
            return result;
        }

        Object.keys(data.Lines).forEach((driverNumber) => {
            result[driverNumber] = this.normalize(data.Lines[driverNumber]);
        });

        return result;
    }

    getSessionKind() {
        const type = String(this.sessionInfo?.Type || "").toLowerCase();
        const name = String(this.sessionInfo?.Name || "").toLowerCase();

        if (type === "race" || name.includes("race")) {
            return "race";
        }

        if (
            type === "qualifying" ||
            type === "qualification" ||
            name.includes("qualifying") ||
            name.includes("qualification")
        ) {
            return "qualifying";
        }

        return "practice";
    }

    getSessionProgress() {
        const kind = this.getSessionKind();
        const lines = Object.values(this.timingData);
        const completedLaps = lines.reduce((maximum, line) => {
            const laps = Number(line?.NumberOfLaps);
            return Number.isFinite(laps) ? Math.max(maximum, laps) : maximum;
        }, 0);

        const series = this.sessionData?.Series;
        const seriesValues =
            series && typeof series === "object" ? Object.values(series) : [];
        const latestSeries = seriesValues
            .filter((item) => item && item.Lap !== undefined)
            .sort((a, b) => new Date(a.Utc || 0) - new Date(b.Utc || 0))
            .pop();

        const fallbackCurrentLap = latestSeries?.Lap
            ? Number(latestSeries.Lap)
            : completedLaps + 1;

        const currentLap = Number.isFinite(Number(this.lapCount?.CurrentLap))
            ? Number(this.lapCount.CurrentLap)
            : fallbackCurrentLap;

        const totalLaps = Number.isFinite(Number(this.lapCount?.TotalLaps))
            ? Number(this.lapCount.TotalLaps)
            : null;

        return {
            kind,
            completedLaps,
            currentLap: Number.isFinite(currentLap) ? currentLap : 0,
            totalLaps,
            remaining: this.ui?.sessionUI?.clockElement?.textContent || "--:--",
        };
    }

    parseTimeToSeconds(valStr) {
        if (!valStr || valStr === "-" || typeof valStr !== "string")
            return Infinity;
        valStr = valStr.trim();
        const parts = valStr.split(":");
        try {
            if (parts.length === 3) {
                return (
                    Number(parts[0]) * 3600 +
                    Number(parts[1]) * 60 +
                    parseFloat(parts[2])
                );
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

    formatSecondsToGap(diffSec) {
        if (diffSec === Infinity || isNaN(diffSec) || diffSec <= 0) return "";
        return `+${diffSec.toFixed(3)}`;
    }

    getDriverData(driverNum) {
        const info = this.timingData[driverNum] || {};
        const stats = this.timingStats[driverNum] || {};
        const appData = this.timingAppData[driverNum] || {};
        const driverObj = this.drivers[driverNum] || {};
        const kind = this.getSessionKind();

        const bestLap = stats.PersonalBestLapTime?.Value
            ? stats.PersonalBestLapTime
            : info.BestLapTime || stats.PersonalBestLapTime || {};

        const sectors = Array.isArray(info.Sectors) ? info.Sectors : [];
        const bestSectors = Array.isArray(stats.BestSectors)
            ? stats.BestSectors
            : [];

        const stints = Array.isArray(appData.Stints)
            ? appData.Stints
            : appData.Stints && typeof appData.Stints === "object"
              ? Object.values(appData.Stints)
              : [];

        const currentTyre = stints.length ? stints[stints.length - 1] : null;

        let gap = "";
        let diff = "";

        if (kind === "race") {
            gap = info.GapToLeader || "";
            diff =
                info.IntervalToPositionAhead?.Value ||
                info.TimeDiffToPositionAhead ||
                "";
        } else {
            const allDrivers = Object.keys(this.timingData);
            const driverBestSec = this.parseTimeToSeconds(bestLap.Value);

            let fastestSec = Infinity;
            allDrivers.forEach((num) => {
                const dStats = this.timingStats[num] || {};
                const dInfo = this.timingData[num] || {};
                const dBest =
                    dStats.PersonalBestLapTime?.Value ||
                    dInfo.BestLapTime?.Value;
                const sec = this.parseTimeToSeconds(dBest);
                if (sec < fastestSec) fastestSec = sec;
            });

            if (driverBestSec !== Infinity && fastestSec !== Infinity) {
                if (driverBestSec === fastestSec) {
                    gap = "";
                } else {
                    gap = this.formatSecondsToGap(driverBestSec - fastestSec);
                }
            }

            const sortedDrivers = allDrivers.sort((a, b) => {
                const posA = Number(this.timingData[a]?.Position) || 999;
                const posB = Number(this.timingData[b]?.Position) || 999;
                return posA - posB;
            });

            const myIndex = sortedDrivers.indexOf(String(driverNum));
            if (myIndex > 0) {
                const prevDriverNum = sortedDrivers[myIndex - 1];
                const prevInfo = this.timingData[prevDriverNum] || {};
                const prevStats = this.timingStats[prevDriverNum] || {};
                const prevBest =
                    prevStats.PersonalBestLapTime?.Value ||
                    prevInfo.BestLapTime?.Value;

                const prevSec = this.parseTimeToSeconds(prevBest);
                if (
                    driverBestSec !== Infinity &&
                    prevSec !== Infinity &&
                    driverBestSec >= prevSec
                ) {
                    diff = this.formatSecondsToGap(driverBestSec - prevSec);
                }
            }
        }

        return {
            racingNumber: driverNum,
            position: Number.isFinite(Number(info.Position))
                ? Number(info.Position)
                : Number(driverObj.Line || 999),
            tLA: driverObj.Tla,
            lastName: driverObj.LastName,
            teamColour: driverObj.TeamColour,
            currentTyre,
            allStints: stints,
            gap,
            diff,
            numberOfLaps: info.NumberOfLaps,
            pitStops: info.NumberOfPitStops,
            retired: info.Retired,
            inPit: info.InPit,
            pitOut: info.PitOut,
            lastLap: info.LastLapTime,
            knockedOut: info.KnockedOut,
            cutOff: info.CutOff,
            bestLap,
            lastS1: sectors[0] || {},
            lastS2: sectors[1] || {},
            lastS3: sectors[2] || {},
            bestS1: bestSectors[0] || {},
            bestS2: bestSectors[1] || {},
            bestS3: bestSectors[2] || {},
        };
    }
}