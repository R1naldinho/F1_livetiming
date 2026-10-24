class OverviewStore {
    constructor() {
        this.drivers = new Map();
        this.laps = new Map();
        this.positions = new Map();
        this.raceInfo = new Map();
    }

    static toNumber(value) {
        if (value === null || value === undefined || value === "") return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    static toSeconds(value) {
        if (value === null || value === undefined || value === "") return null;
        if (typeof value === "number")
            return Number.isFinite(value) && value > 0 ? value : null;
        const parts = String(value).trim().split(":");
        let seconds;
        if (parts.length === 2)
            seconds = Number(parts[0]) * 60 + Number(parts[1]);
        else if (parts.length === 1) seconds = Number(parts[0]);
        else return null;
        return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
    }

    static unwrap(raw) {
        if (Array.isArray(raw)) return raw[0]?.data || null;
        if (
            raw &&
            typeof raw === "object" &&
            raw.data &&
            typeof raw.data === "object"
        )
            return raw.data;
        return raw && typeof raw === "object" ? raw : null;
    }

    setBundle(bundle) {
        const data = bundle?.data || {};
        this.setDrivers(data.drivers);
        this.setLapTimes(data.lapTimes);
        this.setLapSeries(data.lapSeries);
        this.setRaceInfo(data.finalPositions);
    }

    setDrivers(driverList) {
        this.drivers.clear();
        const source = OverviewStore.unwrap(driverList);
        if (!source) return;

        Object.entries(source).forEach(([key, driver]) => {
            if (!driver || typeof driver !== "object") return;
            const id = String(driver.RacingNumber ?? key);
            const colour = String(driver.TeamColour || "").replace("#", "");
            this.drivers.set(id, {
                id,
                code: driver.Tla || id,
                name:
                    driver.FullName || driver.BroadcastName || driver.Tla || id,
                team: driver.TeamName || "",
                colour: colour ? `#${colour}` : "#808080",
                line: OverviewStore.toNumber(driver.Line),
            });
        });
    }

    setLapTimes(lapTimes) {
        this.laps.clear();
        if (!lapTimes || typeof lapTimes !== "object") return;

        Object.entries(lapTimes).forEach(([driverId, list]) => {
            if (!Array.isArray(list)) return;
            const byLap = new Map();
            list.forEach((entry) => {
                const lap = OverviewStore.toNumber(entry.lap);
                if (lap === null || lap <= 0) return;
                byLap.set(lap, {
                    lap,
                    s1: OverviewStore.toSeconds(entry.sector1),
                    s2: OverviewStore.toSeconds(entry.sector2),
                    s3: OverviewStore.toSeconds(entry.sector3),
                    time: OverviewStore.toSeconds(entry.lapTime),
                });
            });
            this.laps.set(
                String(driverId),
                [...byLap.values()].sort((a, b) => a.lap - b.lap),
            );
        });
    }

    setLapSeries(lapSeries) {
        this.positions.clear();
        const source = OverviewStore.unwrap(lapSeries);
        if (!source) return;

        Object.entries(source).forEach(([driverId, entry]) => {
            const raw = entry?.LapPosition;
            if (!raw) return;
            const series = [];
            if (Array.isArray(raw)) {
                raw.forEach((value, index) => {
                    series[index] = OverviewStore.toNumber(value);
                });
            } else if (typeof raw === "object") {
                Object.entries(raw).forEach(([index, value]) => {
                    series[Number(index)] = OverviewStore.toNumber(value);
                });
            }
            this.positions.set(
                String(entry.RacingNumber ?? driverId),
                Array.from(series, (value) =>
                    value === undefined ? null : value,
                ),
            );
        });
    }

    setRaceInfo(raceInfo) {
        this.raceInfo.clear();
        const source = OverviewStore.unwrap(raceInfo);
        if (!source) return;

        const lines = Array.isArray(source.Lines)
            ? source.Lines
            : Object.entries(source);

        lines.forEach((item) => {
            const entry = Array.isArray(item) ? item[1] : item;
            const driverId = item[0];

            if (!entry || typeof entry !== "object") return;

            const id = String(entry.RacingNumber ?? driverId);
            this.raceInfo.set(id, {
                position: OverviewStore.toNumber(entry.Position),
                gap: OverviewStore.normalizeGap(
                    entry.DiffToLeader ?? entry.Gap,
                ),
                interval: OverviewStore.normalizeGap(
                    entry.DiffToAhead ?? entry.Interval,
                ),
                pitStops: OverviewStore.toNumber(entry.PitStops),
                isOut: Boolean(entry.IsOut),
            });
        });
    }

    static normalizeGap(raw) {
        if (raw === null || raw === undefined) return null;
        const text = String(raw).trim();
        if (!text) return null;
        return /^\d+(\.\d+)?$/.test(text) ? `+${text}` : text;
    }

    hasData() {
        return this.laps.size > 0 || this.positions.size > 0;
    }

    getDriver(driverId) {
        const id = String(driverId);
        return (
            this.drivers.get(id) || {
                id,
                code: id,
                name: id,
                team: "",
                colour: "#808080",
                line: null,
            }
        );
    }

    getDriverIds() {
        const ids = new Set([...this.laps.keys(), ...this.positions.keys()]);
        return [...ids].sort((a, b) => Number(a) - Number(b));
    }

    getLaps(driverId) {
        return this.laps.get(String(driverId)) || [];
    }

    getPositionSeries(driverId) {
        return this.positions.get(String(driverId)) || [];
    }

    getRaceInfo(driverId) {
        return this.raceInfo.get(String(driverId)) || null;
    }

    getCompletedLaps(driverId) {
        const laps = this.getLaps(driverId);
        const lastTimed = laps.length ? laps[laps.length - 1].lap : 0;
        const series = this.getPositionSeries(driverId);
        let lastPositioned = 0;
        series.forEach((value, index) => {
            if (value !== null && index > lastPositioned)
                lastPositioned = index;
        });
        return Math.max(lastTimed, lastPositioned);
    }

    getMaxLap() {
        let max = 0;
        this.getDriverIds().forEach((id) => {
            max = Math.max(max, this.getCompletedLaps(id));
        });
        return max;
    }

    calculateSessionBests() {
        const bests = {
            lap: null,
            sectors: [null, null, null],
        };

        this.laps.forEach((list, driverId) => {
            list.forEach((lap) => {
                if (
                    lap.time !== null &&
                    (!bests.lap || lap.time < bests.lap.time)
                ) {
                    bests.lap = { time: lap.time, driverId, lap: lap.lap };
                }
                [lap.s1, lap.s2, lap.s3].forEach((value, index) => {
                    const current = bests.sectors[index];
                    if (value !== null && (!current || value < current.time)) {
                        bests.sectors[index] = {
                            time: value,
                            driverId,
                            lap: lap.lap,
                        };
                    }
                });
            });
        });

        const complete = bests.sectors.every(Boolean);
        bests.ideal = complete
            ? bests.sectors.reduce((sum, sector) => sum + sector.time, 0)
            : null;
        return bests;
    }

    summarizeDriver(driverId) {
        const laps = this.getLaps(driverId);
        const timed = laps.filter((lap) => lap.time !== null);
        const completed = this.getCompletedLaps(driverId);
        const best = timed.reduce(
            (current, lap) =>
                !current || lap.time < current.time ? lap : current,
            null,
        );
        const bestSectors = [1, 2, 3].map((number) => {
            const values = laps
                .map((lap) => lap[`s${number}`])
                .filter((value) => value !== null);
            return values.length ? Math.min(...values) : null;
        });
        const ideal = bestSectors.every((value) => value !== null)
            ? bestSectors.reduce((sum, value) => sum + value, 0)
            : null;
        const series = this.getPositionSeries(driverId);
        const lastPosition =
            [...series].reverse().find((value) => value !== null) ?? null;
        const info = this.getRaceInfo(driverId);
        const hasFullTimes = completed > 0 && timed.length === completed;

        return {
            id: String(driverId),
            driver: this.getDriver(driverId),
            laps: completed,
            bestLap: best ? best.time : null,
            bestLapNumber: best ? best.lap : null,
            bestSectors,
            ideal,
            idealDelta: ideal !== null && best ? best.time - ideal : null,
            totalTime: hasFullTimes
                ? timed.reduce((sum, lap) => sum + lap.time, 0)
                : null,
            grid: series.length && series[0] !== null ? series[0] : null,
            position: info?.position ?? lastPosition,
            rawGap: info?.gap ?? null,
            rawInterval: info?.interval ?? null,
            rawPitStops: info?.pitStops ?? null,
            isOut: info?.isOut ?? false,
            gap: null,
            interval: null,
        };
    }

    calculateSummaries({ raceLike, stintCount }) {
        const summaries = this.getDriverIds().map((id) =>
            this.summarizeDriver(id),
        );

        summaries.forEach((summary) => {
            const stints = stintCount ? stintCount(summary.id) : 0;
            if (raceLike) {
                summary.pitStops =
                    summary.rawPitStops !== null
                        ? summary.rawPitStops
                        : stints > 0
                          ? stints - 1
                          : null;
            } else {
                summary.pitStops = stints > 0 ? stints : null;
            }
        });

        if (raceLike) {
            summaries.sort((a, b) => {
                if (a.position !== null && b.position !== null)
                    return a.position - b.position;
                if (a.position !== null) return -1;
                if (b.position !== null) return 1;
                if (a.laps !== b.laps) return b.laps - a.laps;
                return (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity);
            });
            this.fillRaceGaps(summaries);
        } else {
            summaries.sort((a, b) => {
                if (a.bestLap !== null && b.bestLap !== null)
                    return a.bestLap - b.bestLap;
                if (a.bestLap !== null) return -1;
                if (b.bestLap !== null) return 1;
                return Number(a.id) - Number(b.id);
            });
            this.fillBestLapGaps(summaries);
        }

        summaries.forEach((summary, index) => {
            summary.rank = index + 1;
        });
        return summaries;
    }

    fillBestLapGaps(summaries) {
        const leader = summaries[0]?.bestLap ?? null;
        summaries.forEach((summary, index) => {
            if (summary.bestLap === null || leader === null || index === 0)
                return;
            summary.gap = OverviewStore.formatDelta(summary.bestLap - leader);
            const ahead = summaries[index - 1].bestLap;
            summary.interval =
                ahead === null
                    ? null
                    : OverviewStore.formatDelta(summary.bestLap - ahead);
        });
    }

    fillRaceGaps(summaries) {
        const leader = summaries[0];

        summaries.forEach((summary, index) => {
            if (index === 0) return;

            if (summary.isOut) {
                summary.gap = "OUT";
                summary.interval = "OUT";
                return;
            }

            summary.gap = summary.rawGap;
            summary.interval = summary.rawInterval;

            if (summary.gap === null && leader) {
                summary.gap = this.computeRaceDelta(summary, leader);
            }

            if (summary.interval === null) {
                summary.interval = this.computeRaceDelta(
                    summary,
                    summaries[index - 1],
                );
            }
        });
    }

    computeRaceDelta(summary, reference) {
        const lapDifference = reference.laps - summary.laps;
        if (lapDifference > 0)
            return `+${lapDifference} ${lapDifference === 1 ? "lap" : "laps"}`;
        if (summary.totalTime === null || reference.totalTime === null)
            return null;
        const delta = summary.totalTime - reference.totalTime;
        return delta >= 0 ? OverviewStore.formatDelta(delta) : null;
    }

    static formatDelta(seconds) {
        return `+${seconds.toFixed(3)}`;
    }

    calculateLeadChanges() {
        const maxLap = this.getMaxLap();
        let previous = null;
        let changes = 0;

        for (let lap = 0; lap <= maxLap; lap += 1) {
            let leader = null;
            this.positions.forEach((series, driverId) => {
                if (series[lap] === 1) leader = driverId;
            });
            if (leader !== null && previous !== null && leader !== previous)
                changes += 1;
            if (leader !== null) previous = leader;
        }

        return changes;
    }

    getPositionHistory() {
        const result = {};
        this.positions.forEach((series, driverId) => {
            const points = [];
            series.forEach((position, lap) => {
                if (position !== null) points.push({ x: lap, y: position });
            });
            if (points.length) result[driverId] = points;
        });
        return result;
    }

    clear() {
        this.drivers.clear();
        this.laps.clear();
        this.positions.clear();
        this.raceInfo.clear();
    }
}
