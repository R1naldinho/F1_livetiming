class F1LiveClient {
    constructor(uiManager) {
        this.ui = uiManager;
        this.drivers = {};
        this.timingData = {};
        this.timingStats = {};
        this.timingAppData = {};
        this.sessionData = {};
        this.sessionInfo = null;
        this.isRefreshPending = false;
        this.reconnectTimer = null;
        this.initWebSocket();
    }

    initWebSocket() {
        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onerror = null;
            this.ws.onclose = null;
            this.ws.close();
        }

        this.ws = new WebSocket(`wss://${window.location.host}`);

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
                    this.applySnapshot(message.result);
                    return;
                }

                if (message.type === 1 && Array.isArray(message.arguments) && message.arguments.length >= 2) {
                    const streamType = message.arguments[0];
                    const streamData = message.arguments[1];
                    
                    this.handleStream(streamType, streamData);
                    return;
                }

                this.handleStream(message.streamType, message.data);
            } catch (error) {
                console.error(error);
            }
        };

        this.ws.onerror = () => {
            this.ws.close();
        };

        this.ws.onclose = () => {
            this.reconnectTimer = setTimeout(() => this.initWebSocket(), 3000);
        };
    }

    applySnapshot(snapshot) {
        this.drivers = this.normalize(snapshot.DriverList || {});
        this.timingData = this.normalizeLines(snapshot.TimingData);
        this.timingStats = this.normalizeLines(snapshot.TimingStats);
        this.timingAppData = this.normalizeLines(snapshot.TimingAppData);
        this.sessionData = this.normalize(snapshot.SessionData || {});
        this.sessionInfo = snapshot.SessionInfo || null;

        this.handleStream("SessionInfo", snapshot.SessionInfo);
        this.handleStream("ExtrapolatedClock", snapshot.ExtrapolatedClock);
        this.handleStream("SessionStatus", snapshot.SessionStatus);
        this.handleStream("TrackStatus", snapshot.TrackStatus);
        this.handleStream("WeatherData", snapshot.WeatherData);
        this.scheduleUIRefresh();
    }

    scheduleUIRefresh() {
        if (this.isRefreshPending) {
            return;
        }

        this.isRefreshPending = true;

        requestAnimationFrame(() => {
            this.ui.refreshTable();
            this.ui.updateSessionProgress(this.getSessionProgress());
            this.isRefreshPending = false;
        });
    }

    handleStream(streamType, data) {
        if (!data) {
            return;
        }
        
        switch (streamType) {
            case "SessionInfo":
                this.sessionInfo = this.normalize(data);
                this.ui.updateSession(this.sessionInfo);
                this.scheduleUIRefresh();
                break;
            case "ExtrapolatedClock":
                this.ui.updateClock(data);
                break;
            case "SessionStatus":
                this.ui.updateSessionStatus(data);
                break;
            case "TrackStatus":
                this.ui.updateTrackStatus(data);
                break;
            case "WeatherData":
                this.ui.updateWeather(data);
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
        }
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

        if (
            type === "race" ||
            type === "sprint" ||
            name.includes("sprint") ||
            name.includes("race")
        ) {
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

        const currentLap = latestSeries?.Lap
            ? Number(latestSeries.Lap)
            : completedLaps + 1;

        return {
            kind,
            completedLaps,
            currentLap: Number.isFinite(currentLap) ? currentLap : 0,
            remaining: this.ui?.sessionUI?.clockElement?.textContent || "--:--",
        };
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

        const gap =
            kind === "race"
                ? info.GapToLeader
                : info.GapToLeader ||
                  info.TimeDiffToFastest ||
                  info.TimeDiffToLeader ||
                  "";

        const diff =
            kind === "race"
                ? info.IntervalToPositionAhead?.Value
                : info.IntervalToPositionAhead?.Value ||
                  info.TimeDiffToPositionAhead ||
                  "";

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

document.addEventListener("DOMContentLoaded", () => {
    const ui = new F1LiveTimingUI("app");
    window.f1Client = new F1LiveClient(ui);
});
