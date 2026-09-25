class DriverStore {
    constructor() {
        this.drivers = new Map();
    }

    setDrivers(driverList) {
        this.drivers.clear();
        if (!driverList) return;
        Object.entries(driverList).forEach(([id, driver]) => {
            this.drivers.set(String(id), driver);
        });
    }

    getDriver(id) {
        return this.drivers.get(String(id)) || null;
    }

    getFormattedName(id) {
        const driver = this.getDriver(id);
        return driver ? `${driver.Tla} (#${driver.RacingNumber})` : `Driver ${id}`;
    }

    getAllDrivers() {
        return Array.from(this.drivers.values());
    }

    clear() {
        this.drivers.clear();
    }
}