class SessionDataManager {
    constructor() {
        this.baseUrl = "http://localhost:3000/api";
        this.currentPath = null;
        this.sessionData = null;
        this.sessionInfo = null;
        this.driverStore = new DriverStore();
        this.tyreStore = new TyreStore();
        this.lapTimeStore = new LapTimeStore();
    }

    setPath(path) {
        this.currentPath = path;
    }

    getPath() {
        return this.currentPath;
    }

    parseSessionInfo(rawInfo) {
        if (!rawInfo) return null;
        if (Array.isArray(rawInfo) && rawInfo.length > 0) {
            const finalised = rawInfo.slice().reverse().find(entry => entry?.data?.SessionStatus === "Finalised");
            if (finalised) return finalised.data;
            const started = rawInfo.slice().reverse().find(entry => entry?.data?.SessionStatus === "Started");
            if (started) return started.data;
            return rawInfo[0].data || rawInfo[0];
        }
        return rawInfo.data || rawInfo;
    }

    async loadAllSessionData(path) {
        if (path) this.setPath(path);
        const activePath = this.getPath();
        if (!activePath) throw new Error("Session path not specified.");

        try {
            const [sessionRes, infoRes, driversRes, tyresRes, stintsRes, lapTimesRes] = await Promise.all([
                fetch(`${this.baseUrl}/session/${activePath}`),
                fetch(`${this.baseUrl}/sessionInfo/${activePath}`),
                fetch(`${this.baseUrl}/driverList/${activePath}`),
                fetch(`${this.baseUrl}/currentTyres/${activePath}`),
                fetch(`${this.baseUrl}/tyreStintSeries/${activePath}`),
                fetch(`${this.baseUrl}/lapTimes/${activePath}`)
            ]);

            if (!sessionRes.ok || !infoRes.ok || !driversRes.ok) {
                throw new Error("Failed retrieving core session data.");
            }

            this.sessionData = await sessionRes.json();
            const rawSessionInfo = await infoRes.json();
            this.sessionInfo = this.parseSessionInfo(rawSessionInfo);

            const driverList = await driversRes.json();
            const currentTyres = tyresRes.ok ? await tyresRes.json() : null;
            const tyreStintSeries = stintsRes.ok ? await stintsRes.json() : null;
            const lapTimes = lapTimesRes.ok ? await lapTimesRes.json() : null;

            this.driverStore.setDrivers(driverList);
            this.tyreStore.setStints(tyreStintSeries);
            this.tyreStore.setCurrentTyres(currentTyres);
            this.lapTimeStore.setLapTimes(lapTimes);

            return {
                sessionData: this.sessionData,
                sessionInfo: this.sessionInfo,
                driverStore: this.driverStore,
                tyreStore: this.tyreStore,
                lapTimeStore: this.lapTimeStore
            };
        } catch (error) {
            console.error("Error loading session data:", error);
            throw error;
        }
    }
}