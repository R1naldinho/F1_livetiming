class TyreAnalytics {
    constructor(tyreStore, driverStore, lapTimeStore, options = {}) {
        this.tyreStore = tyreStore;
        this.driverStore = driverStore;
        this.lapTimeStore = lapTimeStore;

        this.sessionType = this.classifySessionType(
            options.sessionType || options.sessionName || ""
        );

        this.sessionName = options.sessionName || "";
        this.use107PercentFilter = options.use107PercentFilter !== false;
        this.warmupLapsCount = Number(options.warmupLapsCount) || 3;
        this.cachedDataset = null;
        this.sessionBestLap = null;
        this.percent107Threshold = null;

        this.compoundOrder = [
            "SOFT",
            "MEDIUM",
            "HARD",
            "INTERMEDIATE",
            "WET",
            "UNKNOWN"
        ];
    }

    parseTimeStringToSeconds(timeValue) {
        if (timeValue === null || timeValue === undefined) return null;

        if (typeof timeValue === "number") {
            return Number.isFinite(timeValue) && timeValue > 0 ? timeValue : null;
        }

        if (typeof timeValue !== "string") return null;

        const cleanStr = timeValue.trim();
        if (!cleanStr) return null;

        if (cleanStr.includes(":")) {
            const parts = cleanStr.split(":");

            if (parts.length === 2) {
                const minutes = Number(parts[0]);
                const seconds = Number(parts[1]);

                if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
                    return null;
                }

                const total = minutes * 60 + seconds;
                return total > 0 ? total : null;
            }
        }

        const value = Number(cleanStr);

        return Number.isFinite(value) && value > 0 ? value : null;
    }

    formatSecondsToTime(totalSeconds) {
        const value = Number(totalSeconds);

        if (!Number.isFinite(value) || value <= 0) {
            return "N/A";
        }

        const minutes = Math.floor(value / 60);
        const seconds = (value % 60).toFixed(3);

        if (minutes > 0) {
            const formattedSeconds = Number(seconds) < 10
                ? `0${seconds}`
                : seconds;

            return `${minutes}:${formattedSeconds}`;
        }

        return `${seconds}s`;
    }

    formatRaceTotalTime(totalSeconds) {
        const value = Number(totalSeconds);

        if (!Number.isFinite(value) || value <= 0) {
            return "N/A";
        }

        const hours = Math.floor(value / 3600);
        const minutes = Math.floor((value % 3600) / 60);
        const seconds = (value % 60).toFixed(3);

        const formattedMinutes = String(minutes).padStart(2, "0");
        const formattedSeconds = Number(seconds) < 10
            ? `0${seconds}`
            : seconds;

        if (hours > 0) {
            return `${hours}:${formattedMinutes}:${formattedSeconds}`;
        }

        return `${minutes}:${formattedSeconds}`;
    }

    classifySessionType(sessionName) {
        if (!sessionName) {
            return "RACE";
        }

        const name = String(sessionName).toUpperCase();

        if (
            name.includes("SPRINT QUALIFYING") ||
            name.includes("SPRINT SHOOTOUT") ||
            name.includes("SQ")
        ) {
            return "SPRINT_QUALIFYING";
        }

        if (
            name.includes("QUALIFYING") ||
            name.includes("QUALIFY") ||
            /\bQ[123]\b/.test(name)
        ) {
            return "QUALIFYING";
        }

        if (name.includes("SPRINT")) {
            return "SPRINT";
        }

        if (
            name.includes("PRACTICE") ||
            /\bFP[123]\b/.test(name) ||
            name.includes("FREE PRACTICE") ||
            name.includes("TESTING")
        ) {
            return "PRACTICE";
        }

        if (
            name.includes("RACE") ||
            name.includes("GRAND PRIX") ||
            name.includes("GP")
        ) {
            return "RACE";
        }

        return "RACE";
    }

    getTyreAnalysisConfig(sessionType = this.sessionType) {
        const configs = {
            PRACTICE: [
                "compoundUsage",
                "bestLapByCompound",
                "shortRunPace",
                "longRunPace",
                "degradation",
                "tyreAge",
                "runAnalysis",
                "newVsUsed",
                "sectorAnalysis",
                "warmUp"
            ],
            SPRINT_QUALIFYING: [
                "bestLap",
                "bestSectors",
                "theoreticalLap",
                "tyreUsage",
                "newVsUsed",
                "runAnalysis",
                "progression",
                "tyreAge",
                "warmUp"
            ],
            SPRINT: [
                "strategyTimeline",
                "strategyPopularity",
                "compoundUsage",
                "stints",
                "pitStops",
                "pitWindows",
                "pace",
                "degradation",
                "tyreAge",
                "best3and5",
                "strategyVsResult"
            ],
            QUALIFYING: [
                "bestLap",
                "bestSectors",
                "theoreticalLap",
                "tyreUsage",
                "runAnalysis",
                "newVsUsed",
                "tyreAge",
                "progression",
                "warmUp"
            ],
            RACE: [
                "overview",
                "strategyTimeline",
                "strategyPopularity",
                "compoundUsage",
                "stints",
                "pitStops",
                "pitWindows",
                "degradation",
                "paceVsTyreAge",
                "sectorDegradation",
                "newVsUsed",
                "longestStint",
                "compoundCrossover",
                "strategyVsResult",
                "driverComparison",
                "teamComparison",
                "records"
            ]
        };

        return configs[sessionType] || configs.RACE;
    }

    calculateLinearRegression(xValues, yValues) {
        if (!Array.isArray(xValues) || !Array.isArray(yValues)) {
            return 0;
        }

        const pairs = [];

        for (let i = 0; i < Math.min(xValues.length, yValues.length); i++) {
            const x = Number(xValues[i]);
            const y = Number(yValues[i]);

            if (Number.isFinite(x) && Number.isFinite(y)) {
                pairs.push({ x, y });
            }
        }

        if (pairs.length < 2) {
            return 0;
        }

        let sumX = 0;
        let sumY = 0;
        let sumXY = 0;
        let sumXX = 0;

        pairs.forEach(pair => {
            sumX += pair.x;
            sumY += pair.y;
            sumXY += pair.x * pair.y;
            sumXX += pair.x * pair.x;
        });

        const n = pairs.length;
        const denominator = n * sumXX - sumX * sumX;

        if (denominator === 0) {
            return 0;
        }

        return (n * sumXY - sumX * sumY) / denominator;
    }

    calculateStdDev(array, mean) {
        if (!Array.isArray(array) || array.length === 0) {
            return 0;
        }

        const values = array
            .map(Number)
            .filter(value => Number.isFinite(value));

        if (!values.length) {
            return 0;
        }

        const avg = mean !== undefined
            ? Number(mean)
            : values.reduce((sum, value) => sum + value, 0) / values.length;

        const variance =
            values.reduce(
                (sum, value) => sum + Math.pow(value - avg, 2),
                0
            ) / values.length;

        return Math.sqrt(variance);
    }

    calculatePercentile(values, percentile) {
        if (!Array.isArray(values) || values.length === 0) {
            return null;
        }

        const sorted = [...values]
            .map(Number)
            .filter(value => Number.isFinite(value))
            .sort((a, b) => a - b);

        if (!sorted.length) {
            return null;
        }

        const p = Math.max(0, Math.min(100, Number(percentile)));
        const index = (p / 100) * (sorted.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;

        if (lower === upper) {
            return sorted[lower];
        }

        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    }

    normalizeCompound(compound) {
        if (!compound) {
            return "UNKNOWN";
        }

        const normalized = String(compound).trim().toUpperCase();

        return this.compoundOrder.includes(normalized)
            ? normalized
            : "UNKNOWN";
    }

    isWetCompound(compound) {
        return compound === "INTERMEDIATE" || compound === "WET";
    }

    getConditionGroup(compound) {
        return this.isWetCompound(compound) ? "wet" : "dry";
    }

    normalizeBoolean(value) {
        return (
            value === true ||
            value === "true" ||
            value === "TRUE" ||
            value === 1 ||
            value === "1"
        );
    }

    getStintLapCount(stint) {
        const candidates = [
            stint?.ActualLapsDriven,
            stint?.TotalLaps,
            stint?.Laps,
            stint?.LapCount,
            stint?.Length
        ];

        for (const candidate of candidates) {
            const value = Number(candidate);

            if (Number.isFinite(value) && value > 0) {
                return Math.floor(value);
            }
        }

        return 0;
    }

    getStintTyreStartAge(stint) {
        const value = Number(
            stint?.StartLaps ??
            stint?.TyreAge ??
            stint?.StartingTyreAge ??
            0
        );

        return Number.isFinite(value) && value >= 0
            ? value
            : 0;
    }

    normalizeLapCollection(rawLaps) {
        if (!rawLaps) {
            return [];
        }

        if (Array.isArray(rawLaps)) {
            return rawLaps
                .map((lap, index) => ({
                    key: Number(lap?.lap ?? lap?.Lap ?? index + 1),
                    data: lap || {}
                }))
                .filter(item => Number.isFinite(item.key));
        }

        if (typeof rawLaps === "object") {
            return Object.entries(rawLaps)
                .map(([key, value]) => ({
                    key: Number(
                        value?.lap ??
                        value?.Lap ??
                        key
                    ),
                    data: value || {}
                }))
                .filter(item => Number.isFinite(item.key))
                .sort((a, b) => a.key - b.key);
        }

        return [];
    }

    getRawLapTime(lapData) {
        return this.parseTimeStringToSeconds(
            lapData?.lapTime ??
            lapData?.LapTime ??
            lapData?.lastLapTime ??
            lapData?.LastLapTime ??
            lapData?.time
        );
    }

    getRawSectorTime(lapData, sectorNumber) {
        const sectorKeys = [
            `sector${sectorNumber}`,
            `Sector${sectorNumber}`,
            `s${sectorNumber}`,
            `S${sectorNumber}`
        ];

        for (const key of sectorKeys) {
            if (lapData?.[key] !== undefined) {
                return this.parseTimeStringToSeconds(lapData[key]);
            }
        }

        return null;
    }

    getDriverName(driverId) {
        if (!this.driverStore) {
            return String(driverId);
        }

        try {
            const name = this.driverStore.getFormattedName(driverId);

            return name || String(driverId);
        } catch {
            return String(driverId);
        }
    }

    getStintStrategyString(stints) {
        return stints
            .map(stint => this.normalizeCompound(stint.Compound))
            .join(" → ");
    }

    getDriverStints() {
        const data = this.tyreStore?.getAllStints?.();

        if (!data || typeof data !== "object") {
            return {};
        }

        return data;
    }

    getDriverLapData() {
        if (!this.lapTimeStore) {
            return {};
        }

        try {
            return this.lapTimeStore.getAllLapTimes() || {};
        } catch {
            return {};
        }
    }

    createRawDriverLaps(driverStints, driverLapsRaw) {
        const normalizedLaps = this.normalizeLapCollection(driverLapsRaw);
        const rawLapMap = new Map(
            normalizedLaps.map(item => [item.key, item.data])
        );

        const totalRawLaps = normalizedLaps.length;

        const stintLengths = driverStints.map(stint =>
            this.getStintLapCount(stint)
        );

        let knownLaps = stintLengths.reduce(
            (sum, value) => sum + value,
            0
        );

        const missingStints = stintLengths.filter(value => value <= 0).length;

        if (missingStints > 0 && totalRawLaps > knownLaps) {
            const remainingLaps = totalRawLaps - knownLaps;
            const fallbackLength = Math.floor(
                remainingLaps / missingStints
            );

            let remainder = remainingLaps % missingStints;

            for (let i = 0; i < stintLengths.length; i++) {
                if (stintLengths[i] <= 0) {
                    stintLengths[i] =
                        fallbackLength + (remainder > 0 ? 1 : 0);

                    if (remainder > 0) {
                        remainder--;
                    }
                }
            }
        }

        if (
            driverStints.length > 0 &&
            totalRawLaps > 0 &&
            stintLengths.reduce((a, b) => a + b, 0) < totalRawLaps
        ) {
            const lastIndex = stintLengths.length - 1;
            stintLengths[lastIndex] +=
                totalRawLaps -
                stintLengths.reduce((a, b) => a + b, 0);
        }

        const laps = [];
        let currentRaceLap = 1;
        let rawLapIndex = 0;

        driverStints.forEach((stint, stintIndex) => {
            const compound = this.normalizeCompound(stint?.Compound);
            const isNew = this.normalizeBoolean(stint?.New);
            const startTyreAge = this.getStintTyreStartAge(stint);
            const stintLength = Math.max(
                0,
                stintLengths[stintIndex] || 0
            );

            for (let i = 0; i < stintLength; i++) {
                let lapNumber = currentRaceLap;

                if (normalizedLaps[rawLapIndex]) {
                    lapNumber = normalizedLaps[rawLapIndex].key;
                }

                const rawLapData =
                    rawLapMap.get(lapNumber) ||
                    normalizedLaps[rawLapIndex]?.data ||
                    {};

                const lapTime = this.getRawLapTime(rawLapData);
                const sector1 = this.getRawSectorTime(rawLapData, 1);
                const sector2 = this.getRawSectorTime(rawLapData, 2);
                const sector3 = this.getRawSectorTime(rawLapData, 3);

                const isPitOut =
                    stintIndex > 0 &&
                    i === 0;

                const isWarmupLap =
                    stintIndex > 0 &&
                    i < this.warmupLapsCount;

                const isPitIn =
                    stintIndex < driverStints.length - 1 &&
                    i === stintLength - 1;

                laps.push({
                    lap: lapNumber,
                    run: stintIndex + 1,
                    stint: stintIndex + 1,
                    stintLapIndex: i,
                    compound,
                    new: isNew,
                    tyreAge: startTyreAge + i,
                    lapTime,
                    sector1,
                    sector2,
                    sector3,
                    isPitIn,
                    isPitOut,
                    isWarmupLap,
                    is107Valid: false,
                    isValidPaceLap: false,
                    isCleanLap: false
                });

                currentRaceLap++;
                rawLapIndex++;
            }
        });

        if (!laps.length && normalizedLaps.length) {
            normalizedLaps.forEach((item, index) => {
                const rawLapData = item.data || {};

                laps.push({
                    lap: item.key,
                    run: 1,
                    stint: 1,
                    stintLapIndex: index,
                    compound: "UNKNOWN",
                    new: false,
                    tyreAge: index,
                    lapTime: this.getRawLapTime(rawLapData),
                    sector1: this.getRawSectorTime(rawLapData, 1),
                    sector2: this.getRawSectorTime(rawLapData, 2),
                    sector3: this.getRawSectorTime(rawLapData, 3),
                    isPitIn: false,
                    isPitOut: false,
                    isWarmupLap: false,
                    is107Valid: false,
                    isValidPaceLap: false,
                    isCleanLap: false
                });
            });
        }

        return laps;
    }

    calculateSessionBestLap(allDriversLaps, conditionGroup = null) {
        const times = [];

        Object.values(allDriversLaps).forEach(laps => {
            laps.forEach(lap => {
                if (
                    Number.isFinite(lap.lapTime) &&
                    lap.lapTime > 0
                ) {
                    if (
                        conditionGroup &&
                        this.getConditionGroup(lap.compound) !== conditionGroup
                    ) {
                        return;
                    }

                    times.push(lap.lapTime);
                }
            });
        });

        if (!times.length) {
            return null;
        }

        return Math.min(...times);
    }

    applyLapValidityFilter(dataset) {
        const allLaps = {};

        Object.entries(dataset).forEach(([driverId, driver]) => {
            allLaps[driverId] = driver.laps;
        });

        const dryBest = this.calculateSessionBestLap(allLaps, "dry");
        const wetBest = this.calculateSessionBestLap(allLaps, "wet");

        this.sessionBestLap = {
            dry: dryBest,
            wet: wetBest,
            overall: [dryBest, wetBest]
                .filter(value => Number.isFinite(value))
                .reduce(
                    (min, value) => (min === null ? value : Math.min(min, value)),
                    null
                )
        };

        this.percent107Threshold = {
            dry: dryBest ? dryBest * 1.07 : null,
            wet: wetBest ? wetBest * 1.07 : null
        };

        Object.values(dataset).forEach(driver => {
            driver.laps.forEach(lap => {
                if (
                    !Number.isFinite(lap.lapTime) ||
                    lap.lapTime <= 0
                ) {
                    lap.is107Valid = false;
                    lap.isValidPaceLap = false;
                    lap.isCleanLap = false;
                    return;
                }

                const threshold =
                    this.percent107Threshold[this.getConditionGroup(lap.compound)];

                lap.is107Valid =
                    !this.use107PercentFilter ||
                    !threshold ||
                    lap.lapTime <= threshold;

                lap.isCleanLap =
                    lap.is107Valid &&
                    !lap.isPitOut &&
                    !lap.isPitIn;

                lap.isValidPaceLap = lap.isCleanLap;
            });
        });
    }

    buildUnifiedDataset(forceRebuild = false) {
        if (this.cachedDataset && !forceRebuild) {
            return this.cachedDataset;
        }

        const unified = {};
        const stintsData = this.getDriverStints();
        const lapTimesData = this.getDriverLapData();

        const driverIds = new Set([
            ...Object.keys(stintsData),
            ...Object.keys(lapTimesData)
        ]);

        driverIds.forEach(driverId => {
            const driverStints = Array.isArray(stintsData[driverId])
                ? stintsData[driverId]
                : [];

            const rawDriverLapData =
                lapTimesData[driverId]?.Laps ??
                lapTimesData[driverId] ??
                {};

            const lapsList = this.createRawDriverLaps(
                driverStints,
                rawDriverLapData
            );

            unified[driverId] = {
                driverName: this.getDriverName(driverId),
                strategy: driverStints.map(stint =>
                    this.normalizeCompound(stint?.Compound)
                ),
                strategyString: this.getStintStrategyString(driverStints),
                pitStops: Math.max(0, driverStints.length - 1),
                tyreChanges: Math.max(0, driverStints.length - 1),
                stints: [],
                runs: [],
                laps: lapsList,
                compounds: {},
                bestS1: null,
                bestS2: null,
                bestS3: null,
                theoreticalBest: null
            };
        });

        this.applyLapValidityFilter(unified);

        Object.entries(unified).forEach(([driverId, driver]) => {
            const driverStints = Array.isArray(stintsData[driverId])
                ? stintsData[driverId]
                : [];

            const parsedRuns = driverStints.map((stint, index) => {
                const runLaps = driver.laps.filter(
                    lap => lap.run === index + 1
                );

                const validLaps = runLaps.filter(
                    lap => lap.isValidPaceLap
                );

                const validTimes = validLaps
                    .map(lap => lap.lapTime)
                    .filter(Number.isFinite);

                const warmupLaps = runLaps
                    .filter(lap => lap.isWarmupLap)
                    .filter(lap => Number.isFinite(lap.lapTime));

                const first3Times = validTimes.slice(0, 3);
                const last3Times = validTimes.slice(-3);

                const first3Avg =
                    first3Times.length >= 3
                        ? first3Times.reduce((a, b) => a + b, 0) /
                          first3Times.length
                        : null;

                const last3Avg =
                    last3Times.length >= 3
                        ? last3Times.reduce((a, b) => a + b, 0) /
                          last3Times.length
                        : null;

                const degradationDelta =
                    first3Avg !== null &&
                    last3Avg !== null
                        ? last3Avg - first3Avg
                        : null;

                const regressionPairs = validLaps
                    .filter(
                        lap =>
                            Number.isFinite(lap.tyreAge) &&
                            Number.isFinite(lap.lapTime)
                    );

                const degradationSlope =
                    regressionPairs.length >= 2
                        ? this.calculateLinearRegression(
                              regressionPairs.map(lap => lap.tyreAge),
                              regressionPairs.map(lap => lap.lapTime)
                          )
                        : 0;

                const lapsDriven = runLaps.length;
                const startTyreAge =
                    this.getStintTyreStartAge(stint);

                const endTyreAge =
                    lapsDriven > 0
                        ? startTyreAge + lapsDriven - 1
                        : startTyreAge;

                const runType =
                    lapsDriven <= 3
                        ? "SHORT_RUN"
                        : lapsDriven <= 8
                            ? "MEDIUM_RUN"
                            : "LONG_RUN";

                return {
                    runNumber: index + 1,
                    stintNumber: index + 1,
                    compound: this.normalizeCompound(stint?.Compound),
                    isNew: this.normalizeBoolean(stint?.New),
                    startLap: runLaps[0]?.lap || 0,
                    endLap:
                        runLaps[runLaps.length - 1]?.lap || 0,
                    lapsDriven,
                    validLapsCount: validTimes.length,
                    warmupLapsCount: warmupLaps.length,
                    startTyreAge,
                    endTyreAge,
                    first3Avg,
                    last3Avg,
                    degradationDelta,
                    degradationSlope,
                    bestLap: validTimes.length
                        ? Math.min(...validTimes)
                        : null,
                    avgLap: validTimes.length
                        ? validTimes.reduce(
                              (a, b) => a + b,
                              0
                          ) / validTimes.length
                        : null,
                    medianLap:
                        validTimes.length
                            ? this.calculatePercentile(
                                  validTimes,
                                  50
                              )
                            : null,
                    stdDev: this.calculateStdDev(validTimes),
                    runType
                };
            });

            driver.stints = parsedRuns;
            driver.runs = parsedRuns;

            const validDriverLaps = driver.laps.filter(
                lap => lap.isValidPaceLap
            );

            this.compoundOrder.forEach(compound => {
                const compoundLaps = validDriverLaps.filter(
                    lap => lap.compound === compound
                );

                if (!compoundLaps.length) {
                    return;
                }

                const times = compoundLaps
                    .map(lap => lap.lapTime)
                    .filter(Number.isFinite)
                    .sort((a, b) => a - b);

                const bestLap = times[0];
                const worstLap = times[times.length - 1];

                const best3Average =
                    times.length >= 3
                        ? times.slice(0, 3).reduce(
                              (a, b) => a + b,
                              0
                          ) / 3
                        : null;

                const best5Average =
                    times.length >= 5
                        ? times.slice(0, 5).reduce(
                              (a, b) => a + b,
                              0
                          ) / 5
                        : null;

                const best10Average =
                    times.length >= 10
                        ? times.slice(0, 10).reduce(
                              (a, b) => a + b,
                              0
                          ) / 10
                        : null;

                const average =
                    times.reduce((a, b) => a + b, 0) /
                    times.length;

                const median =
                    this.calculatePercentile(times, 50);

                const p10 =
                    this.calculatePercentile(times, 10);

                const p90 =
                    this.calculatePercentile(times, 90);

                const regressionPairs = compoundLaps.filter(
                    lap =>
                        Number.isFinite(lap.tyreAge) &&
                        Number.isFinite(lap.lapTime)
                );

                const degradationPerLap =
                    regressionPairs.length >= 2
                        ? this.calculateLinearRegression(
                              regressionPairs.map(
                                  lap => lap.tyreAge
                              ),
                              regressionPairs.map(
                                  lap => lap.lapTime
                              )
                          )
                        : 0;

                driver.compounds[compound] = {
                    lapsCount: compoundLaps.length,
                    bestLap,
                    worstLap,
                    best3Average,
                    best5Average,
                    best10Average,
                    median,
                    average,
                    p10,
                    p90,
                    stdDev: this.calculateStdDev(
                        times,
                        average
                    ),
                    degradationPerLap
                };
            });

            const sector1Values = validDriverLaps
                .map(lap => lap.sector1)
                .filter(Number.isFinite);

            const sector2Values = validDriverLaps
                .map(lap => lap.sector2)
                .filter(Number.isFinite);

            const sector3Values = validDriverLaps
                .map(lap => lap.sector3)
                .filter(Number.isFinite);

            driver.bestS1 = sector1Values.length
                ? Math.min(...sector1Values)
                : null;

            driver.bestS2 = sector2Values.length
                ? Math.min(...sector2Values)
                : null;

            driver.bestS3 = sector3Values.length
                ? Math.min(...sector3Values)
                : null;

            driver.theoreticalBest =
                driver.bestS1 !== null &&
                driver.bestS2 !== null &&
                driver.bestS3 !== null
                    ? Number(
                          (
                              driver.bestS1 +
                              driver.bestS2 +
                              driver.bestS3
                          ).toFixed(3)
                      )
                    : null;
        });

        this.cachedDataset = unified;

        return unified;
    }

    invalidateCache() {
        this.cachedDataset = null;
        this.sessionBestLap = null;
        this.percent107Threshold = null;
    }

    getSessionBestLap(conditionGroup = null) {
        if (!this.cachedDataset) {
            this.buildUnifiedDataset();
        }

        if (!this.sessionBestLap) {
            return null;
        }

        return conditionGroup
            ? this.sessionBestLap[conditionGroup] ?? null
            : this.sessionBestLap.overall;
    }

    get107PercentThreshold(conditionGroup = null) {
        if (!this.cachedDataset) {
            this.buildUnifiedDataset();
        }

        if (!this.percent107Threshold) {
            return null;
        }

        return conditionGroup
            ? this.percent107Threshold[conditionGroup] ?? null
            : this.percent107Threshold.dry ?? this.percent107Threshold.wet ?? null;
    }

    getMaxSessionLaps() {
        const dataset = this.buildUnifiedDataset();

        let maxLaps = 0;

        Object.values(dataset).forEach(driver => {
            const validRaceLaps = driver.laps.filter(
                lap =>
                    Number.isFinite(lap.lap) &&
                    lap.lap > 0
            );

            if (validRaceLaps.length) {
                const highestLap = Math.max(
                    ...validRaceLaps.map(lap => lap.lap)
                );

                maxLaps = Math.max(maxLaps, highestLap);
            }
        });

        return maxLaps;
    }

    getPitStopFrequencyDistribution() {
        const distribution = {};
        const summaries = this.getDriverSummaries();

        summaries.forEach(summary => {
            const stops = Number(summary.pitStops) || 0;

            distribution[stops] =
                (distribution[stops] || 0) + 1;
        });

        return distribution;
    }

    getLapTimeDistributionByCompound() {
        const distribution = {};
        const dataset = this.buildUnifiedDataset();

        Object.values(dataset).forEach(driver => {
            driver.laps.forEach(lap => {
                if (
                    lap.isValidPaceLap &&
                    Number.isFinite(lap.lapTime) &&
                    lap.lapTime > 0
                ) {
                    const compound =
                        lap.compound || "UNKNOWN";

                    if (!distribution[compound]) {
                        distribution[compound] = [];
                    }

                    distribution[compound].push(
                        lap.lapTime
                    );
                }
            });
        });

        return distribution;
    }

    calculateBoxPlotStats(timesArray) {
        if (!Array.isArray(timesArray) || !timesArray.length) {
            return {
                min: null,
                q1: null,
                median: null,
                q3: null,
                max: null
            };
        }

        const sorted = timesArray
            .map(Number)
            .filter(Number.isFinite)
            .sort((a, b) => a - b);

        if (!sorted.length) {
            return {
                min: null,
                q1: null,
                median: null,
                q3: null,
                max: null
            };
        }

        return {
            min: sorted[0],
            q1: this.calculatePercentile(sorted, 25),
            median: this.calculatePercentile(sorted, 50),
            q3: this.calculatePercentile(sorted, 75),
            max: sorted[sorted.length - 1]
        };
    }

    getOutlapProgressionByCompound() {
        const raw = {};

        this.compoundOrder.forEach(compound => {
            raw[compound] = {
                0: [],
                1: [],
                2: []
            };
        });

        const dataset = this.buildUnifiedDataset();

        Object.values(dataset).forEach(driver => {
            driver.laps.forEach(lap => {
                if (
                    lap.stintLapIndex < 0 ||
                    lap.stintLapIndex >= 3 ||
                    !Number.isFinite(lap.lapTime) ||
                    lap.lapTime <= 0
                ) {
                    return;
                }

                const compound = lap.compound;

                if (!raw[compound]) {
                    return;
                }

                if (lap.lapTime < 180) {
                    raw[compound][lap.stintLapIndex].push(
                        lap.lapTime
                    );
                }
            });
        });

        const result = {};

        Object.entries(raw).forEach(
            ([compound, values]) => {
                const lap1 = values[0];
                const lap2 = values[1];
                const lap3 = values[2];

                if (
                    !lap1.length ||
                    !lap2.length ||
                    !lap3.length
                ) {
                    return;
                }

                result[compound] = {
                    lap1: Number(
                        (
                            lap1.reduce((a, b) => a + b, 0) /
                            lap1.length
                        ).toFixed(3)
                    ),
                    lap2: Number(
                        (
                            lap2.reduce((a, b) => a + b, 0) /
                            lap2.length
                        ).toFixed(3)
                    ),
                    lap3: Number(
                        (
                            lap3.reduce((a, b) => a + b, 0) /
                            lap3.length
                        ).toFixed(3)
                    ),
                    sampleSize: [
                        lap1.length,
                        lap2.length,
                        lap3.length
                    ]
                };
            }
        );

        return result;
    }

    getLongestStintsByCompound() {
        const result = {};
        const dataset = this.buildUnifiedDataset();

        Object.values(dataset).forEach(driver => {
            driver.stints.forEach(stint => {
                const compound = stint.compound;

                if (!compound || compound === "UNKNOWN") {
                    return;
                }

                if (
                    !result[compound] ||
                    stint.lapsDriven >
                        result[compound].lapsDriven
                ) {
                    result[compound] = {
                        driverName: driver.driverName,
                        lapsDriven: stint.lapsDriven,
                        avgPace: stint.avgLap,
                        degradation:
                            stint.degradationSlope,
                        startLap: stint.startLap,
                        endLap: stint.endLap
                    };
                }
            });
        });

        return result;
    }

    getQualifyingNewVsUsedPerformance() {
        const result = {};

        this.compoundOrder.forEach(compound => {
            result[compound] = {
                new: null,
                used: null,
                newSampleSize: 0,
                usedSampleSize: 0
            };
        });

        const dataset = this.buildUnifiedDataset();

        const newTimes = {};
        const usedTimes = {};

        Object.keys(result).forEach(compound => {
            newTimes[compound] = [];
            usedTimes[compound] = [];
        });

        Object.values(dataset).forEach(driver => {
            driver.laps.forEach(lap => {
                if (
                    !lap.isValidPaceLap ||
                    !Number.isFinite(lap.lapTime)
                ) {
                    return;
                }

                const compound = lap.compound;

                if (!result[compound]) {
                    return;
                }

                if (lap.new || lap.tyreAge <= 2) {
                    newTimes[compound].push(
                        lap.lapTime
                    );
                } else {
                    usedTimes[compound].push(
                        lap.lapTime
                    );
                }
            });
        });

        Object.keys(result).forEach(compound => {
            if (newTimes[compound].length) {
                result[compound].new =
                    Math.min(...newTimes[compound]);

                result[compound].newSampleSize =
                    newTimes[compound].length;
            }

            if (usedTimes[compound].length) {
                result[compound].used =
                    Math.min(...usedTimes[compound]);

                result[compound].usedSampleSize =
                    usedTimes[compound].length;
            }
        });

        return result;
    }

    getBestLapPerCompound() {
        const result = {};
        const dataset = this.buildUnifiedDataset();

        Object.values(dataset).forEach(driver => {
            driver.laps.forEach(lap => {
                if (
                    lap.isValidPaceLap &&
                    Number.isFinite(lap.lapTime) &&
                    lap.lapTime > 0
                ) {
                    const compound =
                        lap.compound || "UNKNOWN";

                    if (
                        result[compound] === undefined ||
                        lap.lapTime < result[compound]
                    ) {
                        result[compound] = lap.lapTime;
                    }
                }
            });
        });

        return result;
    }

    getPracticeLongRunPace() {
        const longRunPace = {};
        const dataset = this.buildUnifiedDataset();

        Object.values(dataset).forEach(driver => {
            driver.stints.forEach(stint => {
                if (stint.lapsDriven < 5) {
                    return;
                }

                const validLaps = driver.laps.filter(
                    lap =>
                        lap.stint === stint.stintNumber &&
                        lap.isValidPaceLap &&
                        Number.isFinite(lap.lapTime)
                );

                if (validLaps.length < 5) {
                    return;
                }

                const average =
                    validLaps.reduce(
                        (sum, lap) => sum + lap.lapTime,
                        0
                    ) / validLaps.length;

                if (!longRunPace[driver.driverName]) {
                    longRunPace[driver.driverName] = [];
                }

                longRunPace[driver.driverName].push(
                    average
                );
            });
        });

        const result = {};

        Object.entries(longRunPace).forEach(
            ([driverName, values]) => {
                if (!values.length) {
                    return;
                }

                result[driverName] = Number(
                    (
                        values.reduce(
                            (a, b) => a + b,
                            0
                        ) / values.length
                    ).toFixed(3)
                );
            }
        );

        return result;
    }

    getDriverSummaries() {
        const dataset = this.buildUnifiedDataset();

        return Object.entries(dataset).map(
            ([driverId, data]) => {
                const compoundLaps = {
                    SOFT: 0,
                    MEDIUM: 0,
                    HARD: 0,
                    INTERMEDIATE: 0,
                    WET: 0,
                    UNKNOWN: 0
                };

                data.laps.forEach(lap => {
                    const compound =
                        compoundLaps[lap.compound] !== undefined
                            ? lap.compound
                            : "UNKNOWN";

                    compoundLaps[compound]++;
                });

                const newLapsCount = data.laps.filter(
                    lap => lap.new
                ).length;

                const totalLaps = data.laps.length;

                return {
                    driverId,
                    driverName: data.driverName,
                    stintCount: data.stints.length,
                    pitStops: data.pitStops,
                    tyreChanges: data.tyreChanges,
                    totalLaps,
                    strategySeq: data.strategyString,
                    compoundLaps,
                    newLapsPct: totalLaps
                        ? Number(
                              (
                                  (newLapsCount /
                                      totalLaps) *
                                  100
                              ).toFixed(1)
                          )
                        : 0,
                    firstCompound:
                        data.strategy[0] || "N/A",
                    lastCompound:
                        data.strategy[
                            data.strategy.length - 1
                        ] || "N/A",
                    bestS1: data.bestS1,
                    bestS2: data.bestS2,
                    bestS3: data.bestS3,
                    theoreticalBest:
                        data.theoreticalBest
                };
            }
        );
    }

    getGlobalCompoundPerformance() {
        const dataset = this.buildUnifiedDataset();

        const grouped = {};

        this.compoundOrder.forEach(compound => {
            grouped[compound] = {
                laps: [],
                sector1: [],
                sector2: [],
                sector3: [],
                driverIds: new Set(),
                stintSlopes: []
            };
        });

        Object.entries(dataset).forEach(
            ([driverId, driver]) => {
                driver.laps.forEach(lap => {
                    if (
                        !lap.isValidPaceLap ||
                        !Number.isFinite(lap.lapTime)
                    ) {
                        return;
                    }

                    const compound =
                        grouped[lap.compound]
                            ? lap.compound
                            : "UNKNOWN";

                    const group = grouped[compound];

                    group.laps.push(lap);
                    group.driverIds.add(driverId);

                    if (Number.isFinite(lap.sector1)) {
                        group.sector1.push(lap);
                    }

                    if (Number.isFinite(lap.sector2)) {
                        group.sector2.push(lap);
                    }

                    if (Number.isFinite(lap.sector3)) {
                        group.sector3.push(lap);
                    }
                });
            }
        );

        Object.values(dataset).forEach(driver => {
            driver.stints.forEach(stint => {
                if (
                    stint.validLapsCount >= 3 &&
                    Number.isFinite(stint.degradationSlope)
                ) {
                    const compound =
                        grouped[stint.compound]
                            ? stint.compound
                            : "UNKNOWN";

                    grouped[compound].stintSlopes.push(
                        stint.degradationSlope
                    );
                }
            });
        });

        const performance = {};

        Object.entries(grouped).forEach(
            ([compound, data]) => {
                if (!data.laps.length) {
                    return;
                }

                const times = data.laps
                    .map(lap => lap.lapTime)
                    .filter(Number.isFinite)
                    .sort((a, b) => a - b);

                const best = times[0];
                const worst =
                    times[times.length - 1];

                const best3Average =
                    times.length >= 3
                        ? times
                              .slice(0, 3)
                              .reduce(
                                  (a, b) => a + b,
                                  0
                              ) / 3
                        : null;

                const best5Average =
                    times.length >= 5
                        ? times
                              .slice(0, 5)
                              .reduce(
                                  (a, b) => a + b,
                                  0
                              ) / 5
                        : null;

                const best10Average =
                    times.length >= 10
                        ? times
                              .slice(0, 10)
                              .reduce(
                                  (a, b) => a + b,
                                  0
                              ) / 10
                        : null;

                const average =
                    times.reduce(
                        (a, b) => a + b,
                        0
                    ) / times.length;

                const median =
                    this.calculatePercentile(
                        times,
                        50
                    );

                const p10 =
                    this.calculatePercentile(
                        times,
                        10
                    );

                const p90 =
                    this.calculatePercentile(
                        times,
                        90
                    );

                const sectorRegression = (
                    sectorNumber
                ) => {
                    const pairs = data.laps
                        .filter(
                            lap =>
                                Number.isFinite(
                                    lap.tyreAge
                                ) &&
                                Number.isFinite(
                                    lap[`sector${sectorNumber}`]
                                )
                        );

                    if (pairs.length < 2) {
                        return 0;
                    }

                    return this.calculateLinearRegression(
                        pairs.map(
                            lap => lap.tyreAge
                        ),
                        pairs.map(
                            lap =>
                                lap[
                                    `sector${sectorNumber}`
                                ]
                        )
                    );
                };

                const medianStintSlope =
                    data.stintSlopes.length
                        ? this.calculatePercentile(
                              data.stintSlopes,
                              50
                          )
                        : 0;

                performance[compound] = {
                    laps: times.length,
                    drivers: data.driverIds.size,
                    bestLap: best,
                    worstLap: worst,
                    best3Average,
                    best5Average,
                    best10Average,
                    median,
                    average,
                    p10,
                    p90,
                    stdDev: this.calculateStdDev(
                        times,
                        average
                    ),
                    degradationPerLap:
                        medianStintSlope,
                    sectorDegradation: {
                        s1: sectorRegression(1),
                        s2: sectorRegression(2),
                        s3: sectorRegression(3)
                    }
                };
            }
        );

        return performance;
    }

    getTeamName(driverId) {
        if (!this.driverStore) {
            return "UNKNOWN";
        }

        try {
            if (typeof this.driverStore.getTeamName === "function") {
                return this.driverStore.getTeamName(driverId) || "UNKNOWN";
            }

            if (typeof this.driverStore.getDriverInfo === "function") {
                const info = this.driverStore.getDriverInfo(driverId);
                return info?.TeamName || info?.Team || info?.team || "UNKNOWN";
            }
        } catch {
            return "UNKNOWN";
        }

        return "UNKNOWN";
    }

    getDriverDegradationComparison() {
        const dataset = this.buildUnifiedDataset();

        return Object.entries(dataset)
            .map(([driverId, driver]) => {
                const compoundBreakdown = {};

                this.compoundOrder.forEach(compound => {
                    const compoundData = driver.compounds[compound];

                    if (compoundData) {
                        compoundBreakdown[compound] = {
                            degradationPerLap: compoundData.degradationPerLap,
                            lapsCount: compoundData.lapsCount,
                            average: compoundData.average
                        };
                    }
                });

                const validStints = driver.stints.filter(
                    stint =>
                        stint.validLapsCount >= 3 &&
                        Number.isFinite(stint.degradationSlope)
                );

                const overallDegradation = validStints.length
                    ? validStints.reduce(
                          (sum, stint) => sum + stint.degradationSlope,
                          0
                      ) / validStints.length
                    : null;

                return {
                    driverId,
                    driverName: driver.driverName,
                    team: this.getTeamName(driverId),
                    overallDegradation:
                        overallDegradation !== null
                            ? Number(overallDegradation.toFixed(4))
                            : null,
                    compoundBreakdown,
                    stints: driver.stints.length,
                    strategy: driver.strategyString
                };
            })
            .filter(
                entry =>
                    entry.overallDegradation !== null ||
                    Object.keys(entry.compoundBreakdown).length
            )
            .sort((a, b) => {
                if (a.overallDegradation === null) return 1;
                if (b.overallDegradation === null) return -1;
                return a.overallDegradation - b.overallDegradation;
            });
    }

    getTeamDegradationComparison() {
        const drivers = this.getDriverDegradationComparison();
        const teams = {};

        drivers.forEach(driver => {
            const team = driver.team || "UNKNOWN";

            if (!teams[team]) {
                teams[team] = {
                    team,
                    drivers: [],
                    degradationValues: [],
                    compoundBreakdown: {}
                };
            }

            teams[team].drivers.push(driver.driverName);

            if (Number.isFinite(driver.overallDegradation)) {
                teams[team].degradationValues.push(driver.overallDegradation);
            }

            Object.entries(driver.compoundBreakdown).forEach(
                ([compound, data]) => {
                    if (!teams[team].compoundBreakdown[compound]) {
                        teams[team].compoundBreakdown[compound] = [];
                    }

                    if (Number.isFinite(data.degradationPerLap)) {
                        teams[team].compoundBreakdown[compound].push(
                            data.degradationPerLap
                        );
                    }
                }
            );
        });

        return Object.values(teams)
            .map(team => {
                const compoundAverages = {};

                Object.entries(team.compoundBreakdown).forEach(
                    ([compound, values]) => {
                        compoundAverages[compound] = values.length
                            ? Number(
                                  (
                                      values.reduce((a, b) => a + b, 0) /
                                      values.length
                                  ).toFixed(4)
                              )
                            : null;
                    }
                );

                return {
                    team: team.team,
                    drivers: team.drivers,
                    averageDegradation: team.degradationValues.length
                        ? Number(
                              (
                                  team.degradationValues.reduce(
                                      (a, b) => a + b,
                                      0
                                  ) / team.degradationValues.length
                              ).toFixed(4)
                          )
                        : null,
                    compoundBreakdown: compoundAverages
                };
            })
            .sort((a, b) => {
                if (a.averageDegradation === null) return 1;
                if (b.averageDegradation === null) return -1;
                return a.averageDegradation - b.averageDegradation;
            });
    }

    estimatePitStopLoss() {
        const dataset = this.buildUnifiedDataset();
        const losses = [];

        Object.values(dataset).forEach(driver => {
            const cleanTimes = driver.laps
                .filter(lap => lap.isCleanLap && Number.isFinite(lap.lapTime))
                .map(lap => lap.lapTime)
                .sort((a, b) => a - b);

            if (cleanTimes.length < 3) {
                return;
            }

            const referencePace = this.calculatePercentile(cleanTimes, 50);

            if (!Number.isFinite(referencePace)) {
                return;
            }

            for (let i = 0; i < driver.laps.length - 1; i++) {
                const inLap = driver.laps[i];
                const outLap = driver.laps[i + 1];

                if (!inLap.isPitIn || !outLap.isPitOut) {
                    continue;
                }

                if (
                    !Number.isFinite(inLap.lapTime) ||
                    !Number.isFinite(outLap.lapTime)
                ) {
                    continue;
                }

                const inDelta = Math.max(0, inLap.lapTime - referencePace);
                const outDelta = Math.max(0, outLap.lapTime - referencePace);
                const totalLoss = inDelta + outDelta;

                if (totalLoss > 3 && totalLoss < 90) {
                    losses.push(totalLoss);
                }
            }
        });

        if (!losses.length) {
            return this.getDefaultPitLossEstimate();
        }

        losses.sort((a, b) => a - b);

        return Number(this.calculatePercentile(losses, 50).toFixed(2));
    }

    getDefaultPitLossEstimate() {
        const performance = this.getGlobalCompoundPerformance();

        const reference =
            performance.MEDIUM?.average ||
            performance.HARD?.average ||
            performance.SOFT?.average ||
            90;

        return Number((reference * 0.22).toFixed(2));
    }

    estimateFuelEffectPerLap() {
        const performance = this.getGlobalCompoundPerformance();

        const reference =
            performance.MEDIUM?.average ||
            performance.HARD?.average ||
            performance.SOFT?.average ||
            90;

        return Number((reference * 0.00055).toFixed(4));
    }

    getCompoundCliffRatio(compound) {
        const ratios = {
            SOFT: 0.35,
            MEDIUM: 0.55,
            HARD: 0.85,
            INTERMEDIATE: 0.6,
            WET: 0.7,
            UNKNOWN: 0.6
        };

        return ratios[compound] || 0.6;
    }

    buildCompoundPaceModel(compound, totalLaps = this.getMaxSessionLaps()) {
        const performance = this.getGlobalCompoundPerformance();
        const compoundData = performance[compound];

        const fallbackBase =
            performance.HARD?.best5Average ||
            performance.HARD?.average ||
            performance.MEDIUM?.best5Average ||
            performance.MEDIUM?.average ||
            performance.SOFT?.best5Average ||
            performance.SOFT?.average ||
            90;

        const basePace =
            compoundData?.best5Average ||
            compoundData?.average ||
            fallbackBase;

        const degradationPerLap =
            Number(compoundData?.degradationPerLap) > 0
                ? Number(compoundData.degradationPerLap)
                : 0.05;

        const cliffLimit = Math.max(
            8,
            Math.floor(
                (totalLaps || 50) * this.getCompoundCliffRatio(compound)
            )
        );

        return {
            compound,
            basePace,
            degradationPerLap,
            cliffLimit,
            fuelEffectPerLap: this.estimateFuelEffectPerLap()
        };
    }

    estimateLapTime(model, stintLapIndex, raceLapNumber) {
        let lapTime =
            model.basePace +
            model.degradationPerLap * stintLapIndex -
            model.fuelEffectPerLap * raceLapNumber;

        if (stintLapIndex > model.cliffLimit) {
            const overLimit = stintLapIndex - model.cliffLimit;
            lapTime += Math.pow(overLimit, 2) * 0.15;
        }

        return lapTime;
    }

    predictCompoundDegradation(compound, options = {}) {
        const laps = Math.max(1, Number(options.laps) || 20);
        const raceLapOffset = Math.max(0, Number(options.raceLapOffset) || 0);
        const totalLaps =
            Number(options.totalRaceLaps) || this.getMaxSessionLaps();

        const model = this.buildCompoundPaceModel(compound, totalLaps);

        const projection = [];

        for (let i = 0; i < laps; i++) {
            projection.push({
                stintLap: i + 1,
                raceLap: raceLapOffset + i + 1,
                predictedLapTime: Number(
                    this.estimateLapTime(
                        model,
                        i,
                        raceLapOffset + i
                    ).toFixed(3)
                )
            });
        }

        return {
            compound,
            basePace: Number(model.basePace.toFixed(3)),
            degradationPerLap: model.degradationPerLap,
            fuelEffectPerLap: model.fuelEffectPerLap,
            cliffLimit: model.cliffLimit,
            projection
        };
    }

    getStrategyDistribution() {
        const dataset = this.buildUnifiedDataset();

        const sequences = {};
        const stopCounts = {};
        const firstCompound = {};
        const lastCompound = {};

        Object.values(dataset).forEach(driver => {
            const sequence =
                driver.strategyString || "UNKNOWN";

            sequences[sequence] =
                (sequences[sequence] || 0) + 1;

            const stops =
                Number(driver.pitStops) || 0;

            stopCounts[stops] =
                (stopCounts[stops] || 0) + 1;

            const first =
                driver.strategy[0] || "UNKNOWN";

            firstCompound[first] =
                (firstCompound[first] || 0) + 1;

            const last =
                driver.strategy[
                    driver.strategy.length - 1
                ] || "UNKNOWN";

            lastCompound[last] =
                (lastCompound[last] || 0) + 1;
        });

        return {
            sequences: Object.entries(sequences).sort(
                (a, b) => b[1] - a[1]
            ),
            stopCounts: Object.entries(stopCounts).sort(
                (a, b) => Number(a[0]) - Number(b[0])
            ),
            firstCompound,
            lastCompound
        };
    }

    getStrategyPerformance() {
        const dataset = this.buildUnifiedDataset();
        const result = {};

        Object.values(dataset).forEach(driver => {
            const strategy =
                driver.strategyString || "UNKNOWN";

            if (!result[strategy]) {
                result[strategy] = {
                    count: 0,
                    validLaps: 0,
                    averagePace: [],
                    degradation: [],
                    pitStops: driver.pitStops
                };
            }

            const entry = result[strategy];

            entry.count++;

            const validLaps = driver.laps.filter(
                lap =>
                    lap.isValidPaceLap &&
                    Number.isFinite(lap.lapTime)
            );

            entry.validLaps += validLaps.length;

            if (validLaps.length) {
                entry.averagePace.push(
                    validLaps.reduce(
                        (sum, lap) =>
                            sum + lap.lapTime,
                        0
                    ) / validLaps.length
                );
            }

            driver.stints.forEach(stint => {
                if (
                    Number.isFinite(
                        stint.degradationSlope
                    )
                ) {
                    entry.degradation.push(
                        stint.degradationSlope
                    );
                }
            });
        });

        Object.values(result).forEach(entry => {
            entry.averagePace =
                entry.averagePace.length
                    ? Number(
                          (
                              entry.averagePace.reduce(
                                  (a, b) => a + b,
                                  0
                              ) /
                              entry.averagePace.length
                          ).toFixed(3)
                      )
                    : null;

            entry.degradation =
                entry.degradation.length
                    ? Number(
                          this.calculatePercentile(
                              entry.degradation,
                              50
                          ).toFixed(3)
                      )
                    : null;
        });

        return result;
    }

    calculateOptimalIdealStrategies() {
        const totalLaps = this.getMaxSessionLaps();

        if (!totalLaps || totalLaps < 10) {
            return [];
        }

        const performance =
            this.getGlobalCompoundPerformance();

        const dryCompounds = [
            "SOFT",
            "MEDIUM",
            "HARD"
        ].filter(
            compound =>
                performance[compound] &&
                performance[compound].laps >= 5
        );

        if (dryCompounds.length < 2) {
            return [];
        }

        const pitLossTime = this.estimatePitStopLoss();
        const fuelEffectPerLap = this.estimateFuelEffectPerLap();

        const fallbackBase = performance.HARD
            ?.best5Average ||
            performance.HARD?.average ||
            performance.MEDIUM?.best5Average ||
            performance.MEDIUM?.average ||
            performance.SOFT?.best5Average ||
            performance.SOFT?.average ||
            90;

        const baseOffsets = {
            SOFT: -0.5,
            MEDIUM: -0.2,
            HARD: 0
        };

        const maxUsableLaps = {
            SOFT: Math.max(
                10,
                Math.floor(totalLaps * 0.35)
            ),
            MEDIUM: Math.max(
                15,
                Math.floor(totalLaps * 0.55)
            ),
            HARD: Math.max(
                20,
                Math.floor(totalLaps * 0.85)
            )
        };

        const calculateStintTime = (
            compound,
            laps,
            raceLapOffset = 0
        ) => {
            if (laps <= 0) {
                return Infinity;
            }

            const compoundData =
                performance[compound];

            const basePace =
                compoundData?.best5Average ||
                compoundData?.average ||
                fallbackBase;

            const offset =
                baseOffsets[compound] || 0;

            const degradation =
                Number(
                    compoundData?.degradationPerLap
                ) > 0
                    ? Number(
                          compoundData.degradationPerLap
                      )
                    : 0.05;

            const cliffLimit =
                maxUsableLaps[compound] || 20;

            let total = 0;

            for (let lap = 0; lap < laps; lap++) {
                let lapTime =
                    basePace +
                    offset +
                    degradation * lap -
                    fuelEffectPerLap *
                        (raceLapOffset + lap);

                if (lap > cliffLimit) {
                    const overLimit =
                        lap - cliffLimit;

                    lapTime +=
                        Math.pow(overLimit, 2) *
                        0.15;
                }

                total += lapTime;
            }

            return total;
        };

        const strategies = [];

        for (const c1 of dryCompounds) {
            for (const c2 of dryCompounds) {
                if (c1 === c2) {
                    continue;
                }

                let bestTime = Infinity;
                let bestWindow = null;

                for (
                    let pit1 = 8;
                    pit1 <= totalLaps - 8;
                    pit1++
                ) {
                    const stint1 = pit1;
                    const stint2 =
                        totalLaps - pit1;

                    const totalTime =
                        calculateStintTime(
                            c1,
                            stint1,
                            0
                        ) +
                        calculateStintTime(
                            c2,
                            stint2,
                            stint1
                        ) +
                        pitLossTime;

                    if (totalTime < bestTime) {
                        bestTime = totalTime;
                        bestWindow = `${pit1}`;
                    }
                }

                if (Number.isFinite(bestTime)) {
                    strategies.push({
                        combo: `${c1} → ${c2}`,
                        stops: 1,
                        window: bestWindow,
                        totalTime: bestTime
                    });
                }
            }
        }

        if (totalLaps >= 25) {
            for (const c1 of dryCompounds) {
                for (const c2 of dryCompounds) {
                    for (const c3 of dryCompounds) {
                        if (
                            new Set([c1, c2, c3]).size <
                            2
                        ) {
                            continue;
                        }

                        let bestTime = Infinity;
                        let bestWindow = null;

                        for (
                            let pit1 = 8;
                            pit1 <= totalLaps - 16;
                            pit1 += 2
                        ) {
                            for (
                                let pit2 = pit1 + 8;
                                pit2 <= totalLaps - 8;
                                pit2 += 2
                            ) {
                                const stint1 = pit1;
                                const stint2 =
                                    pit2 - pit1;
                                const stint3 =
                                    totalLaps - pit2;

                                const totalTime =
                                    calculateStintTime(
                                        c1,
                                        stint1,
                                        0
                                    ) +
                                    calculateStintTime(
                                        c2,
                                        stint2,
                                        stint1
                                    ) +
                                    calculateStintTime(
                                        c3,
                                        stint3,
                                        stint1 + stint2
                                    ) +
                                    pitLossTime * 2;

                                if (
                                    totalTime <
                                    bestTime
                                ) {
                                    bestTime =
                                        totalTime;
                                    bestWindow =
                                        `${pit1} / ${pit2}`;
                                }
                            }
                        }

                        if (
                            Number.isFinite(bestTime)
                        ) {
                            strategies.push({
                                combo: `${c1} → ${c2} → ${c3}`,
                                stops: 2,
                                window: bestWindow,
                                totalTime: bestTime
                            });
                        }
                    }
                }
            }
        }

        if (totalLaps >= 35) {
            for (const c1 of dryCompounds) {
                for (const c2 of dryCompounds) {
                    for (const c3 of dryCompounds) {
                        for (const c4 of dryCompounds) {
                            if (
                                new Set([
                                    c1,
                                    c2,
                                    c3,
                                    c4
                                ]).size < 2
                            ) {
                                continue;
                            }

                            let bestTime = Infinity;
                            let bestWindow = null;

                            for (
                                let pit1 = 6;
                                pit1 <=
                                totalLaps - 18;
                                pit1 += 3
                            ) {
                                for (
                                    let pit2 =
                                        pit1 + 6;
                                    pit2 <=
                                        totalLaps - 12;
                                    pit2 += 3
                                ) {
                                    for (
                                        let pit3 =
                                            pit2 + 6;
                                        pit3 <=
                                            totalLaps - 6;
                                        pit3 += 3
                                    ) {
                                        const stint1 =
                                            pit1;

                                        const stint2 =
                                            pit2 - pit1;

                                        const stint3 =
                                            pit3 - pit2;

                                        const stint4 =
                                            totalLaps -
                                            pit3;

                                        const totalTime =
                                            calculateStintTime(
                                                c1,
                                                stint1,
                                                0
                                            ) +
                                            calculateStintTime(
                                                c2,
                                                stint2,
                                                stint1
                                            ) +
                                            calculateStintTime(
                                                c3,
                                                stint3,
                                                stint1 + stint2
                                            ) +
                                            calculateStintTime(
                                                c4,
                                                stint4,
                                                stint1 +
                                                    stint2 +
                                                    stint3
                                            ) +
                                            pitLossTime *
                                                3;

                                        if (
                                            totalTime <
                                            bestTime
                                        ) {
                                            bestTime =
                                                totalTime;

                                            bestWindow =
                                                `${pit1} / ${pit2} / ${pit3}`;
                                        }
                                    }
                                }
                            }

                            if (
                                Number.isFinite(
                                    bestTime
                                )
                            ) {
                                strategies.push({
                                    combo: `${c1} → ${c2} → ${c3} → ${c4}`,
                                    stops: 3,
                                    window: bestWindow,
                                    totalTime: bestTime
                                });
                            }
                        }
                    }
                }
            }
        }

        strategies.sort(
            (a, b) =>
                a.totalTime - b.totalTime
        );

        const topStrategies =
            strategies.slice(0, 8);

        const baseline =
            topStrategies[0]?.totalTime || 0;

        return topStrategies.map(strategy => ({
            strategyCombo: strategy.combo,
            pitStops: strategy.stops,
            pitWindow: strategy.window,
            totalEstimatedTime:
                strategy.totalTime,
            formattedEstimatedTime:
                this.formatRaceTotalTime(
                    strategy.totalTime
                ),
            delta: Number(
                (
                    strategy.totalTime -
                    baseline
                ).toFixed(3)
            ),
            pitLossTimeUsed: pitLossTime,
            fuelEffectPerLapUsed: fuelEffectPerLap
        }));
    }
}

