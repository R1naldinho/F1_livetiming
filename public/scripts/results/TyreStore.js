class TyreStore {
    constructor() {
        this.stints = new Map();
        this.currentTyres = new Map();
        this.compoundColors = {
            SOFT: "#FF0000",
            MEDIUM: "#FFD700",
            HARD: "#FFFFFF",
            INTERMEDIATE: "#00A651",
            WET: "#0067B9",
            UNKNOWN: "#808080"
        };
    }

    setStints(tyreStintSeries) {
        this.stints.clear();
        const stintsData = tyreStintSeries?.Stints;
        if (!stintsData) return;

        Object.entries(stintsData).forEach(([driverId, stintList]) => {
            const parsedStints = stintList.map(stint => {
                const totalLaps = Number(stint.TotalLaps || 0);
                const startLaps = Number(stint.StartLaps || 0);
                const actualLapsDriven = Math.max(0, totalLaps - startLaps);
                const isNotChanged = Number(stint.TyresNotChanged || 0) === 1;
                const compound = (stint.Compound || "UNKNOWN").toUpperCase();

                return {
                    ...stint,
                    Compound: compound,
                    TotalLaps: totalLaps,
                    StartLaps: startLaps,
                    ActualLapsDriven: actualLapsDriven,
                    TyresNotChanged: isNotChanged
                };
            });
            this.stints.set(String(driverId), parsedStints);
        });
    }

    setCurrentTyres(currentTyresData) {
        this.currentTyres.clear();
        const tyres = currentTyresData?.Tyres;
        if (!tyres) return;

        Object.entries(tyres).forEach(([driverId, tyre]) => {
            this.currentTyres.set(String(driverId), {
                ...tyre,
                Compound: (tyre.Compound || "UNKNOWN").toUpperCase()
            });
        });
    }

    getStintsByDriver(driverId) {
        return this.stints.get(String(driverId)) || [];
    }

    getAllStints() {
        return Object.fromEntries(this.stints);
    }

    getCompoundColor(compound) {
        const key = (compound || "UNKNOWN").toUpperCase();
        return this.compoundColors[key] || this.compoundColors.UNKNOWN;
    }

    calculateCompoundTotals() {
        const totals = {};
        this.stints.forEach(stintList => {
            stintList.forEach(stint => {
                totals[stint.Compound] = (totals[stint.Compound] || 0) + stint.ActualLapsDriven;
            });
        });
        return totals;
    }

    calculateCurrentDistribution() {
        const counts = {};
        this.currentTyres.forEach(tyre => {
            counts[tyre.Compound] = (counts[tyre.Compound] || 0) + 1;
        });
        return counts;
    }

    getMaxStintCount() {
        let max = 0;
        this.stints.forEach(stintList => {
            if (stintList.length > max) max = stintList.length;
        });
        return max;
    }

    clear() {
        this.stints.clear();
        this.currentTyres.clear();
    }
}