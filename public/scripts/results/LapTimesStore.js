class LapTimeStore {
    constructor() {
        this.lapTimes = new Map();
    }

    setLapTimes(lapTimesData) {
        this.lapTimes.clear();
        if (!lapTimesData) return;

        const lines = lapTimesData.Lines || lapTimesData;
        Object.entries(lines).forEach(([driverId, data]) => {
            this.lapTimes.set(String(driverId), data);
        });
    }

    getDriverLapTimes(driverId) {
        return this.lapTimes.get(String(driverId)) || null;
    }

    getAllLapTimes() {
        return Object.fromEntries(this.lapTimes);
    }

    clear() {
        this.lapTimes.clear();
    }
}