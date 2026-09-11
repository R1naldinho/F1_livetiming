class CalendarUI {
    constructor(containerId = 'calendar') {
        this.container = document.getElementById(containerId);
        this.data = null;
        this.countdownInterval = null;
    }

    async init() {
        if (!this.container) return;
        try {
            const response = await fetch('/api/calendar');
            if (!response.ok) throw new Error('Network response was not ok');
            this.data = await response.json();
            this.render();
        } catch (error) {
            this.renderError(error);
        }
    }

    renderError(error) {
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        this.container.textContent = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'calendar-error';
        errDiv.textContent = `Error loading calendar: ${error.message}`;
        this.container.appendChild(errDiv);
    }

    render() {
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        this.container.textContent = '';

        if (!this.data || !Array.isArray(this.data.races)) {
            const noDataDiv = document.createElement('div');
            noDataDiv.className = 'calendar-error';
            noDataDiv.textContent = 'No calendar data available.';
            this.container.appendChild(noDataDiv);
            return;
        }

        const header = document.createElement('div');
        header.className = 'calendar-header';
        
        const title = document.createElement('h1');
        title.className = 'calendar-title';
        title.textContent = `F1 ${this.data.year || ''} Race Calendar`;
        header.appendChild(title);
        this.container.appendChild(header);

        const activeRaceIndex = this.findActiveOrNextRaceIndex(this.data.races);
        if (activeRaceIndex !== -1) {
            const nextRaceHero = this.createHeroNextRace(this.data.races[activeRaceIndex]);
            this.container.appendChild(nextRaceHero);
        }

        const standardRaces = this.data.races.filter(r => !r.isTesting);
        const testingRaces = this.data.races.filter(r => r.isTesting);

        const grid = document.createElement('div');
        grid.className = 'calendar-grid';

        standardRaces.forEach((race) => {
            const originalIndex = this.data.races.indexOf(race);
            const isNextOrCurrent = originalIndex === activeRaceIndex;
            const card = this.createRaceCard(race, isNextOrCurrent);
            grid.appendChild(card);
        });

        this.container.appendChild(grid);

        if (testingRaces.length > 0) {
            const testingSection = document.createElement('div');
            testingSection.className = 'testing-section';

            const testingTitle = document.createElement('h2');
            testingTitle.className = 'testing-section-title';
            testingTitle.textContent = 'Pre-Season Testing';
            testingSection.appendChild(testingTitle);

            const testingGrid = document.createElement('div');
            testingGrid.className = 'calendar-grid testing-grid';

            testingRaces.forEach((race) => {
                const originalIndex = this.data.races.indexOf(race);
                const isNextOrCurrent = originalIndex === activeRaceIndex;
                const card = this.createRaceCard(race, isNextOrCurrent);
                testingGrid.appendChild(card);
            });

            testingSection.appendChild(testingGrid);
            this.container.appendChild(testingSection);
        }
    }

    createHeroNextRace(race) {
        const hero = document.createElement('div');
        hero.className = 'next-race-hero';

        const nextSession = this.findNextSession(race);

        const heroContent = document.createElement('div');
        heroContent.className = 'hero-content';

        const label = document.createElement('div');
        label.className = 'hero-label';
        label.textContent = 'NEXT EVENT';
        heroContent.appendChild(label);

        const title = document.createElement('h2');
        title.className = 'hero-title';
        title.textContent = race.grandPrix || 'Grand Prix';
        heroContent.appendChild(title);

        const location = document.createElement('div');
        location.className = 'hero-location';
        const locParts = [race.circuitLocation, race.country].filter(Boolean);
        location.textContent = locParts.join(', ') || 'Location TBD';
        heroContent.appendChild(location);

        if (nextSession) {
            const sessionInfo = document.createElement('div');
            sessionInfo.className = 'hero-session-info';
            sessionInfo.textContent = `${nextSession.name}: ${this.formatSessionTime(nextSession.startTime)}`;
            heroContent.appendChild(sessionInfo);

            const countdownBox = document.createElement('div');
            countdownBox.className = 'hero-countdown';

            const updateTimer = () => {
                const now = new Date().getTime();
                const target = new Date(nextSession.startTime).getTime();
                const diff = target - now;

                if (diff <= 0) {
                    countdownBox.textContent = 'SESSION IN PROGRESS / ENDED';
                    return;
                }

                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);

                countdownBox.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
            };

            updateTimer();
            this.countdownInterval = setInterval(updateTimer, 1000);
            heroContent.appendChild(countdownBox);
        }

        hero.appendChild(heroContent);
        return hero;
    }

    findNextSession(race) {
        if (!Array.isArray(race.sessions) || race.sessions.length === 0) return null;
        const now = new Date();
        const upcoming = race.sessions.find(s => s.startTime && new Date(s.startTime) > now);
        return upcoming || race.sessions[race.sessions.length - 1];
    }

    findActiveOrNextRaceIndex(races) {
        const now = new Date();
        
        const upcomingIndex = races.findIndex(race => {
            if (race.isNext || race.isCurrent || race.isLive) return true;
            if (Array.isArray(race.sessions) && race.sessions.length > 0) {
                const lastSession = race.sessions[race.sessions.length - 1];
                if (lastSession.startTime && new Date(lastSession.startTime) >= now) {
                    return true;
                }
            }
            return false;
        });

        return upcomingIndex !== -1 ? upcomingIndex : races.findIndex(r => !r.isTesting);
    }

    createRaceCard(race, isNextOrCurrent = false) {
        const card = document.createElement('div');
        card.className = 'race-card';
        if (race.isTesting) {
            card.classList.add('testing-card');
        }
        if (isNextOrCurrent || race.isNext || race.isCurrent) {
            card.classList.add('next-race-card');
        }

        const topRow = document.createElement('div');
        topRow.className = 'race-card-top';

        const roundBadge = document.createElement('span');
        roundBadge.className = 'race-round-badge';
        roundBadge.textContent = race.round || 'TEST';
        topRow.appendChild(roundBadge);

        const datesBadge = document.createElement('span');
        datesBadge.className = 'race-dates-badge';
        datesBadge.textContent = race.dates || 'TBD';
        topRow.appendChild(datesBadge);

        card.appendChild(topRow);

        const title = document.createElement('h2');
        title.className = 'race-title';
        title.textContent = race.grandPrix || 'Grand Prix';
        card.appendChild(title);

        const location = document.createElement('div');
        location.className = 'race-location';
        const locParts = [race.circuitLocation, race.country].filter(Boolean);
        location.textContent = locParts.join(', ') || 'Location TBD';
        card.appendChild(location);

        if (race.mapImage || race.outlineImage) {
            const trackContainer = document.createElement('div');
            trackContainer.className = 'race-track-container';

            const trackImg = document.createElement('img');
            trackImg.className = 'race-track-img';
            trackImg.src = race.mapImage || race.outlineImage;
            trackImg.alt = `${race.circuitOfficialName || 'Circuit'} layout`;
            trackImg.loading = 'lazy';
            
            trackContainer.appendChild(trackImg);
            card.appendChild(trackContainer);
        }

        const detailsGrid = document.createElement('div');
        detailsGrid.className = 'race-details-grid';

        this.addDetailItem(detailsGrid, 'Circuit', race.circuitOfficialName);
        this.addDetailItem(detailsGrid, 'Type', race.circuitType);
        this.addDetailItem(detailsGrid, 'Length', race.trackLengthKm ? `${race.trackLengthKm} km` : null);
        this.addDetailItem(detailsGrid, 'Laps', race.laps);
        this.addDetailItem(detailsGrid, 'Distance', race.distanceKm ? `${race.distanceKm} km` : null);
        
        if (race.fastestLap && typeof race.fastestLap === 'object') {
            const { time, driver, season } = race.fastestLap;
            if (time) {
                const info = [driver, season].filter(Boolean).join(', ');
                const lapStr = info ? `${time} (${info})` : time;
                this.addDetailItem(detailsGrid, 'Lap Record', lapStr);
            }
        }

        card.appendChild(detailsGrid);

        if (Array.isArray(race.sessions) && race.sessions.length > 0) {
            const sessionsContainer = document.createElement('div');
            sessionsContainer.className = 'race-sessions';

            const sessionsTitle = document.createElement('div');
            sessionsTitle.className = 'sessions-title';
            sessionsTitle.textContent = 'Schedule';
            sessionsContainer.appendChild(sessionsTitle);

            const sessionsList = document.createElement('div');
            sessionsList.className = 'sessions-list';

            race.sessions.forEach(session => {
                if (!session) return;
                const sessionRow = document.createElement('div');
                sessionRow.className = 'session-row';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'session-name';
                nameSpan.textContent = session.name || 'Session';

                const timeSpan = document.createElement('span');
                timeSpan.className = 'session-time';
                timeSpan.textContent = this.formatSessionTime(session.startTime);

                sessionRow.appendChild(nameSpan);
                sessionRow.appendChild(timeSpan);
                sessionsList.appendChild(sessionRow);
            });

            sessionsContainer.appendChild(sessionsList);
            card.appendChild(sessionsContainer);
        }

        return card;
    }

    addDetailItem(parent, label, value) {
        if (value === null || value === undefined || value === '') return;
        const item = document.createElement('div');
        item.className = 'race-detail-item';

        const lbl = document.createElement('span');
        lbl.className = 'race-detail-label';
        lbl.textContent = label;

        const val = document.createElement('span');
        val.className = 'race-detail-value';
        val.textContent = value;

        item.appendChild(lbl);
        item.appendChild(val);
        parent.appendChild(item);
    }

    formatSessionTime(isoString) {
        if (!isoString) return 'TBD';
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return 'TBD';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const calendar = new CalendarUI();
    calendar.init();
});