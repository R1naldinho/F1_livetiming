import express from "express";
import ws, { WebSocketServer } from "ws";
import http from "http";
import dotenv from "dotenv";
import axios from "axios";
import * as cheerio from "cheerio";

dotenv.config();

export const app = express();
const PORT = Number(process.env.PORT || 3000);
const AUTH_TOKEN = process.env.F1_AUTH_TOKEN;
const F1_API_URL = process.env.F1_API_URL;
const CARTO_API_KEY = process.env.CARTO_API_KEY || "";

if (!AUTH_TOKEN) {
    throw new Error("F1_AUTH_TOKEN is required");
}

app.use((req, res, next) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const visitorData = {
        timestamp: new Date().toISOString(),
        ip,
        method: req.method,
        url: req.originalUrl,
        userAgent: req.headers["user-agent"] || "",
        referer: req.headers["referer"] || "",
    };

    next();
});

app.use(express.static("public"));

app.get("/api/tiles/:theme/:z/:x/:y", async (req, res) => {
    const { theme, z, x, y } = req.params;
    const cleanZ = z.replace(/[^0-9]/g, "");
    const cleanX = x.replace(/[^0-9]/g, "");
    const cleanY = y.replace(/[^0-9]/g, "");
    const mapTheme = theme === "light" ? "light_all" : "dark_all";
    const keyParam = CARTO_API_KEY ? `?key=${CARTO_API_KEY}` : "";
    const cartoUrl = `https://a.basemaps.cartocdn.com/rastertiles/${mapTheme}/${cleanZ}/${cleanX}/${cleanY}.png${keyParam}`;

    try {
        const response = await fetch(cartoUrl);
        if (!response.ok) {
            return res.status(response.status).send("Tile fetch error");
        }
        const buffer = await response.arrayBuffer();
        res.setHeader("Content-Type", "image/png");
        res.send(Buffer.from(buffer));
    } catch (err) {
        console.error(
            JSON.stringify({ type: "TILE_PROXY_ERROR", error: err.message }),
        );
        res.status(500).send("Proxy error");
    }
});

let cachedStandings = null;
let lastScrapedTime = 0;
const CACHE_TTL = 3600000;
let scrapingPromise = null;

let cachedCalendar = null;
let lastCalendarScrapedTime = 0;
let calendarScrapingPromise = null;

const cleanText = (str) => {
    if (!str) return "";
    return String(str)
        .replace(/^Flag of\s+/i, "")
        .replace(/\s+/g, " ")
        .trim();
};

const scrapeStandings = async () => {
    try {
        const currentYear = new Date().getFullYear();
        const baseUrl = `https://www.formula1.com/en/results/${currentYear}`;

        const [driversRes, teamsRes, racesRes] = await Promise.all([
            axios
                .get(`${baseUrl}/drivers`, {
                    headers: { "User-Agent": "Mozilla/5.0" },
                })
                .catch(() => null),
            axios
                .get(`${baseUrl}/team`, {
                    headers: { "User-Agent": "Mozilla/5.0" },
                })
                .catch(() => null),
            axios
                .get(`${baseUrl}/races`, {
                    headers: { "User-Agent": "Mozilla/5.0" },
                })
                .catch(() => null),
        ]);

        const gpFlagMap = {};
        const driversStandings = [];
        if (driversRes && driversRes.data) {
            const $drivers = cheerio.load(driversRes.data);
            const driverPromises = [];

            $drivers("table tbody tr").each((_, row) => {
                const $row = $drivers(row);
                const cells = $row
                    .find("td")
                    .map((_, td) => cleanText($drivers(td).text()))
                    .get()
                    .filter(Boolean);

                if (cells.length >= 4) {
                    const driverName = cells[1];
                    const nameParts = driverName.split(" ");
                    const driverCode =
                        nameParts.length > 1
                            ? nameParts[nameParts.length - 1]
                                  .slice(0, 3)
                                  .toUpperCase()
                            : driverName.slice(0, 3).toUpperCase();

                    const imgTag = $row.find("img").first();
                    const driverImage =
                        imgTag.attr("src") || imgTag.attr("data-src") || "";

                    const teamImgTag = $row.find("img").eq(1);
                    const teamLogo =
                        teamImgTag.attr("src") ||
                        teamImgTag.attr("data-src") ||
                        "";

                    const relativeLink =
                        $row.find("a").first().attr("href") || "";
                    const driverHref = relativeLink.startsWith("http")
                        ? relativeLink
                        : relativeLink
                          ? `https://www.formula1.com${relativeLink}`
                          : "";

                    const driverObj = {
                        pos: cells[0],
                        driverName: driverName.replace(driverCode, "").trim(),
                        driverCode: driverCode,
                        nationality: cells[2] || "",
                        car: cells[3] || "",
                        pts: cells[cells.length - 1],
                        driverImage: driverImage,
                        teamLogo: teamLogo
                            .replace("w_64", "w_96")
                            .replace("white", ""),
                        driverHref: relativeLink,
                        raceResults: [],
                    };

                    driversStandings.push(driverObj);

                    if (driverHref) {
                        driverPromises.push(
                            axios
                                .get(driverHref, {
                                    headers: { "User-Agent": "Mozilla/5.0" },
                                })
                                .then((res) => {
                                    if (!res || !res.data) return;
                                    const $d = cheerio.load(res.data);
                                    const results = [];
                                    $d("table tbody tr").each((_, dRow) => {
                                        const $dRow = $d(dRow);
                                        const cells = $dRow.find("td");

                                        if (cells.length >= 4) {
                                            const $gpTd = cells.eq(0);
                                            let rawGp = cleanText(
                                                $gpTd
                                                    .find("span, a")
                                                    .first()
                                                    .text() || $gpTd.text(),
                                            );

                                            const grandPrixClean =
                                                rawGp.replace(
                                                    /^.*?[a-z]([A-Z].*)$/,
                                                    "$1",
                                                );

                                            const flagImgTag = $dRow
                                                .find(
                                                    "img[src*='flag'], img[data-src*='flag'], img[src*='flags'], img",
                                                )
                                                .first();
                                            const rawFlag =
                                                flagImgTag.attr("src") ||
                                                flagImgTag.attr("data-src") ||
                                                "";
                                            const flagImage = rawFlag
                                                ? rawFlag.startsWith("http")
                                                    ? rawFlag
                                                    : `https://www.formula1.com${rawFlag}`
                                                : "";

                                            if (grandPrixClean && flagImage) {
                                                gpFlagMap[grandPrixClean] =
                                                    flagImage;
                                            }

                                            results.push({
                                                grandPrix: grandPrixClean,
                                                date: cleanText(
                                                    cells.eq(1).text(),
                                                ),
                                                car: cleanText(
                                                    cells.eq(2).text(),
                                                ),
                                                pos: cleanText(
                                                    cells.eq(3).text(),
                                                ),
                                                pts:
                                                    cleanText(
                                                        cells.eq(4).text(),
                                                    ) || "-",
                                            });
                                        }
                                    });
                                    driverObj.raceResults = results;
                                })
                                .catch(() => {}),
                        );
                    }
                }
            });

            await Promise.all(driverPromises);
        }

        const teamsStandings = [];
        if (teamsRes && teamsRes.data) {
            const $teams = cheerio.load(teamsRes.data);
            $teams("table tbody tr").each((_, row) => {
                const $row = $teams(row);
                const cells = $row
                    .find("td")
                    .map((_, td) => cleanText($teams(td).text()))
                    .get()
                    .filter(Boolean);
                const logoTag = $row.find("img").first();
                const teamLogo =
                    logoTag.attr("src") || logoTag.attr("data-src") || "";

                if (cells.length >= 3) {
                    teamsStandings.push({
                        pos: cells[0],
                        teamName: cells[1],
                        pts: cells[cells.length - 1],
                        teamLogo: teamLogo
                            .replace("w_64", "w_96")
                            .replace("white", ""),
                    });
                }
            });
        }

        const racesResults = [];
        if (racesRes && racesRes.data) {
            const $races = cheerio.load(racesRes.data);
            $races("table tbody tr").each((_, row) => {
                const $row = $races(row);
                const $tds = $row.find("td");

                if ($tds.length >= 5) {
                    const $gpTd = $tds.eq(0);
                    const rawGp = cleanText(
                        $gpTd.find("span, a").first().text() || $gpTd.text(),
                    );
                    const grandPrixClean = rawGp.replace(
                        /^.*?[a-z]([A-Z].*)$/,
                        "$1",
                    );

                    const flagImgTag = $row
                        .find(
                            "img[src*='flag'], img[data-src*='flag'], img[src*='flags']",
                        )
                        .first();
                    const rawFlag =
                        flagImgTag.attr("src") ||
                        flagImgTag.attr("data-src") ||
                        "";
                    const flagImage = rawFlag
                        ? rawFlag.startsWith("http")
                            ? rawFlag
                            : `https://www.formula1.com${rawFlag}`
                        : "";

                    const circuitImgTag = $row
                        .find(
                            "img[src*='circuit'], img[data-src*='circuit'], img[src*='carbon']",
                        )
                        .first();
                    const rawCircuit =
                        circuitImgTag.attr("src") ||
                        circuitImgTag.attr("data-src") ||
                        "";
                    const circuitImage = rawCircuit
                        ? rawCircuit.startsWith("http")
                            ? rawCircuit
                            : `https://www.formula1.com${rawCircuit}`
                        : "";

                    racesResults.push({
                        grandPrix: grandPrixClean,
                        date: cleanText($tds.eq(1).text()),
                        car: cleanText($tds.eq(3).text()),
                        laps: cleanText($tds.eq(4).text()),
                        time: cleanText($tds.eq(5).text()) || "N/A",
                        flagImage: flagImage,
                        circuitImage: circuitImage,
                        podium: [],
                    });
                }
            });
        }

        const racePodiumMap = {};
        driversStandings.forEach((driver) => {
            driver.raceResults.forEach((res) => {
                const gp = res.grandPrix;
                const posNum = res.pos.replace(/\D/g, "");
                if (posNum === "1" || posNum === "2" || posNum === "3") {
                    if (!racePodiumMap[gp]) {
                        racePodiumMap[gp] = [];
                    }
                    racePodiumMap[gp].push({
                        pos: posNum,
                        driverName: driver.driverName,
                        driverCode: driver.driverCode,
                        car: res.car || driver.car,
                    });
                }
            });
        });

        racesResults.forEach((race) => {
            if (!race.flagImage && gpFlagMap[race.grandPrix]) {
                race.flagImage = gpFlagMap[race.grandPrix];
            }
            const podiumList = racePodiumMap[race.grandPrix] || [];
            podiumList.sort((a, b) => Number(a.pos) - Number(b.pos));
            race.podium = podiumList;
        });

        cachedStandings = {
            year: currentYear,
            drivers: driversStandings,
            constructors: teamsStandings,
            races: racesResults,
        };
        lastScrapedTime = Date.now();
        return cachedStandings;
    } catch (error) {
        throw error;
    } finally {
        scrapingPromise = null;
    }
};

const cleanTextCircuit = (str) => {
    if (!str) return "";
    return String(str).replace(/\s+/g, " ").trim();
};

const F1_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
};

const extractScalarField = (html, key) => {
    const regex = new RegExp('\\\\"' + key + '\\\\":\\\\"((?:[^\\\\"]|\\\\.|<[^>]*>)*?)\\\\"');
    const match = html.match(regex);
    
    if (!match) return "";

    return match[1]
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/\\?"]\)\s*(?:self\.__next_f\.push\(\[1,")?/gi, '')
        .replace(/\\u003C/gi, '<')
        .replace(/\\u003E/gi, '>')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .trim();
};

const scrapeRaceWeekend = async (url) => {
    try {
        const { data: html } = await axios.get(url, { headers: F1_HEADERS });

        let sessions = [];
        const sessionsMatch = html.match(/\\"meetingSessions\\":\[(.*?)\]/);
        if (sessionsMatch) {
            try {
                const jsonText =
                    "[" + sessionsMatch[1].replace(/\\"/g, '"') + "]";
                const parsed = JSON.parse(jsonText);
                sessions = parsed.map((s) => ({
                    session: s.session || "",
                    shortName: s.shortName || "",
                    name: s.description || "",
                    startTime: s.startTime || "",
                    endTime: s.endTime || "",
                    gmtOffset: s.gmtOffset || "",
                    timezone: s.timezone || "",
                    state: s.state || "",
                    sessionType: s.sessionType || "",
                    sessionNumber: s.sessionNumber ?? null,
                }));
            } catch (e) {
                sessions = [];
            }
        }

        const laps = extractScalarField(html, "scheduledLapCount");
        const distanceKm = extractScalarField(html, "scheduledDistance");
        const trackLengthKm = extractScalarField(html, "trackLength");
        const rawCircuitName = extractScalarField(html, "circuitOfficialName");
        const circuitOfficialName = rawCircuitName
            ? rawCircuitName.replace(
                  /\\?"]\)\s*<\/?script[^>]*>\s*(?:self\.__next_f\.push\(\[1,")?/gi,
                  "",
              )
            : "";
        const circuitLocation = extractScalarField(html, "circuitLocation");
        const circuitType = extractScalarField(html, "circuitType");
        const direction = extractScalarField(html, "direction");
        const fastestLapTime = extractScalarField(html, "fastestLapTime");
        const fastestLapDriver = extractScalarField(html, "fastestLapDriver");
        const fastestLapTeam = extractScalarField(html, "fastestLapTeam");
        const fastestLapSeason = extractScalarField(html, "fastestLapSeason");

        const mapMatch = html.match(
            /\\"circuitMapImage\\":\{[^}]*?\\"url\\":\\"([^\\]*)\\"/,
        );
        const mapImage = mapMatch ? mapMatch[1] : "";

        const outlineMatch = html.match(
            /\\"circuitImage\\":\{\\"public_id\\":\\"([^\\]*)\\"/,
        );
        const outlineImage = outlineMatch
            ? `https://media.formula1.com/image/upload/${outlineMatch[1]}.svg`
            : "";

        const weekendStart = sessions.length > 0 ? sessions[0].startTime : "";
        const weekendEnd =
            sessions.length > 0 ? sessions[sessions.length - 1].endTime : "";

        return {
            laps: laps ? Number(laps) : null,
            distanceKm: distanceKm ? Number(distanceKm) : null,
            trackLengthKm: trackLengthKm ? Number(trackLengthKm) : null,
            circuitOfficialName: cleanTextCircuit(circuitOfficialName),
            circuitLocation: cleanTextCircuit(circuitLocation),
            circuitType: cleanTextCircuit(circuitType),
            direction: cleanTextCircuit(direction),
            fastestLap: {
                time: fastestLapTime || null,
                driver: fastestLapDriver || null,
                team: fastestLapTeam || null,
                season: fastestLapSeason || null,
            },
            mapImage,
            outlineImage,
            weekendStart,
            weekendEnd,
            sessions,
        };
    } catch (error) {
        return {
            laps: null,
            distanceKm: null,
            trackLengthKm: null,
            circuitOfficialName: "",
            circuitLocation: "",
            circuitType: "",
            direction: "",
            fastestLap: { time: null, driver: null, team: null, season: null },
            mapImage: "",
            outlineImage: "",
            weekendStart: "",
            weekendEnd: "",
            sessions: [],
        };
    }
};

const scrapeCalendar = async () => {
    try {
        const currentYear = new Date().getFullYear();
        const baseUrl = "https://www.formula1.com";
        const calendarUrl = `${baseUrl}/en/racing/${currentYear}.html`;
        const { data: html } = await axios.get(calendarUrl, {
            headers: F1_HEADERS,
        });
        const $ = cheerio.load(html);

        const races = [];
        const seenSlugs = new Set();

        $(`a[href*="/en/racing/${currentYear}/"]`).each((_, el) => {
            const $card = $(el);
            const href = $card.attr("href") || "";
            const slug = href
                .replace(/\/$/, "")
                .split("/")
                .filter(Boolean)
                .pop();

            if (!slug || slug === String(currentYear) || seenSlugs.has(slug))
                return;
            seenSlugs.add(slug);

            const fullUrl = href.startsWith("http")
                ? href
                : `${baseUrl}${href}`;
            const cardText = $card.text();
            const isTesting = /testing/i.test(slug);

            let round = "";
            let roundOrder = 999;

            const roundSpan = $card
                .find('span[class*="body-2-xs-bold"]')
                .first();
            const roundText = cleanTextCircuit(roundSpan.text()) || cardText;

            if (isTesting) {
                round = "TESTING";
                const testingNumberMatch = slug.match(/(\d+)$/);
                roundOrder = testingNumberMatch
                    ? Number(testingNumberMatch[1]) - 100
                    : -100;
            } else {
                const roundMatch = roundText.match(/ROUND\s*(\d+)/i);
                if (roundMatch) {
                    round = `ROUND ${roundMatch[1]}`;
                    roundOrder = Number(roundMatch[1]);
                }
            }

            const countryEl = $card.find('p[class*="display-xl-bold"]').first();
            const country = cleanTextCircuit(countryEl.text());

            let officialName = "";
            const contextAttr = $card.attr("data-f1rd-a7s-context");

            if (contextAttr) {
                try {
                    const decoded = JSON.parse(
                        Buffer.from(contextAttr, "base64").toString("utf-8"),
                    );
                    if (decoded && decoded.raceName) {
                        officialName = decoded.raceName;
                    }
                } catch (e) {}
            }

            if (!officialName) {
                const officialNameEl = $card
                    .find('span[class*="typography-module_body-xs-semibold"]')
                    .first();
                officialName = cleanTextCircuit(officialNameEl.text());
            } else {
                officialName = cleanTextCircuit(officialName);
            }

            const dateMatch = cardText.match(
                /\d{1,2}(?:\s*[A-Za-z]{3})?\s*-\s*\d{1,2}\s*[A-Za-z]{3}/,
            );
            const dates = dateMatch ? dateMatch[0] : "";

            races.push({
                slug,
                url: fullUrl,
                round,
                roundOrder,
                country: country || slug.replace(/-/g, " "),
                grandPrix: officialName,
                dates,
                isTesting,
            });
        });

        races.sort((a, b) => a.roundOrder - b.roundOrder);

        const enrichedRaces = await Promise.all(
            races.map(async (race) => {
                const weekend = await scrapeRaceWeekend(race.url);
                return { ...race, ...weekend };
            }),
        );

        cachedCalendar = {
            year: currentYear,
            races: enrichedRaces,
        };
        lastCalendarScrapedTime = Date.now();
        return cachedCalendar;
    } catch (error) {
        throw error;
    } finally {
        calendarScrapingPromise = null;
    }
};

app.get("/api/standings", async (req, res) => {
    try {
        const now = Date.now();
        if (cachedStandings && now - lastScrapedTime < CACHE_TTL) {
            return res.json(cachedStandings);
        }

        if (!scrapingPromise) {
            scrapingPromise = scrapeStandings();
        }

        const data = await scrapingPromise;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Error during scraping" });
    }
});

app.get("/api/calendar", async (req, res) => {
    try {
        const now = Date.now();
        if (cachedCalendar && now - lastCalendarScrapedTime < CACHE_TTL) {
            return res.json(cachedCalendar);
        }

        if (!calendarScrapingPromise) {
            calendarScrapingPromise = scrapeCalendar();
        }

        const data = await calendarScrapingPromise;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Error during calendar scraping" });
    }
});

app.get("/api/calendar/:slug", async (req, res) => {
    const { slug } = req.params;
    const currentYear = new Date().getFullYear();
    const url = `https://www.formula1.com/en/racing/${currentYear}/${slug}`;

    try {
        const details = await scrapeRaceWeekend(url);
        res.json({
            slug,
            url,
            ...details,
        });
    } catch (err) {
        res.status(500).json({
            error: `Error during circuit scraping ${slug}`,
        });
    }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const state = {};
let hasSnapshot = false;

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function merge(target, source) {
    if (source === null || source === undefined) {
        return target;
    }

    if (Array.isArray(source)) {
        return clone(source);
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
            target[index] = merge(target[index], source[key]);
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
            target[key] = clone(value);
        } else if (typeof value === "object") {
            target[key] = merge(target[key], value);
        } else {
            target[key] = value;
        }
    });

    return target;
}

function sendSnapshot(client) {
    if (!hasSnapshot) {
        return;
    }

    client.send(
        JSON.stringify({
            type: 3,
            invocationId: "server-snapshot",
            result: clone(state),
        }),
    );
}

wss.on("connection", (client, req) => {
    sendSnapshot(client);
});

function broadcast(message) {
    const payload = JSON.stringify(message);

    wss.clients.forEach((client) => {
        if (client.readyState === ws.OPEN) {
            client.send(payload);
        }
    });
}

function processSnapshot(result) {
    Object.keys(result).forEach((streamType) => {
        state[streamType] = clone(result[streamType]);
    });

    hasSnapshot = true;
    broadcast({
        type: 3,
        invocationId: "server-snapshot",
        result: clone(state),
    });
}

function processFeed(streamType, data) {
    state[streamType] = merge(state[streamType], data);

    broadcast({
        streamType,
        data,
    });
}

function subscribe(socket) {
    socket.send(
        JSON.stringify({
            type: 1,
            invocationId: "1",
            nonblocking: false,
            target: "Subscribe",
            arguments: [["SessionInfo"]],
        }) + RECORD_SEPARATOR,
    );

    socket.send(
        JSON.stringify({
            type: 1,
            invocationId: "2",
            nonblocking: false,
            target: "Subscribe",
            arguments: [
                [
                    "Heartbeat",
                    "DriverList",
                    "ExtrapolatedClock",
                    "SessionInfo",
                    "SessionStatus",
                    "TimingAppData",
                    "TimingStats",
                    "TrackStatus",
                    "WeatherData",
                    "ContentStreams",
                    "SessionData",
                    "TimingData",
                    "RaceControlMessages",
                ],
            ],
        }) + RECORD_SEPARATOR,
    );
}

const RECORD_SEPARATOR = String.fromCharCode(0x1e);

function connectToF1() {
    const f1Url = `https://livetiming.formula1.com/signalrcore?authToken=${encodeURIComponent(AUTH_TOKEN)}`;

    const f1Socket = new ws(f1Url, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Referer: "https://www.formula1.com/",
        },
    });

    let handshakeDone = false;
    let buffer = "";

    f1Socket.on("open", () => {
        f1Socket.send(
            JSON.stringify({
                protocol: "json",
                version: 1,
            }) + RECORD_SEPARATOR,
        );
    });

    f1Socket.on("message", (bufferData) => {
        buffer += bufferData.toString("utf8");

        const parts = buffer.split(RECORD_SEPARATOR);
        buffer = parts.pop() || "";

        for (const message of parts) {
            if (!message.trim()) {
                continue;
            }

            try {
                const parsed = JSON.parse(message);

                if (!handshakeDone && Object.keys(parsed).length === 0) {
                    handshakeDone = true;
                    subscribe(f1Socket);
                    continue;
                }

                if (parsed.type === 1 && parsed.arguments) {
                    const streamType = parsed.arguments[0];
                    const data = parsed.arguments[1];
                    processFeed(streamType, data);
                    continue;
                }

                if (parsed.type === 3 && parsed.result) {
                    processSnapshot(parsed.result);
                }

            } catch (error) {
                console.error(
                    JSON.stringify({
                        type: "PARSE_ERROR",
                        error: error.message,
                    }),
                );
            }
        }
    });

    f1Socket.on("error", (error) => {
        console.error(
            JSON.stringify({ type: "F1_SOCKET_ERROR", error: error.message }),
        );
    });

    f1Socket.on("close", () => {
        setTimeout(connectToF1, 5000);
    });
}

connectToF1();

function getPath(req){
    const splat = req.params.splat;

    if (!splat) {
        return res.status(400).json({ error: "Missing path" });
    }

    return Array.isArray(splat) ? splat.join("/") : splat;
}

// Utility function to parse streamed JSON data from the F1 API
function parseStreamToJson(stream) {
    const lines = stream.split(/\r?\n/);
    const result = [];

    for (const line of lines) {
        if (!line.trim()) continue;

        const jsonStart = line.indexOf("{");
        if (jsonStart === -1) {
            console.error("Invalid format:", line);
            continue;
        }

        const time = line.slice(0, jsonStart);
        const jsonPart = line.slice(jsonStart);

        try {
            result.push({
                time: time,
                data: JSON.parse(jsonPart),
            });
        } catch (e) {
            console.error("Error parsing:", line);
        }
    }

    return result;
}

// Multiviewer API

// API to get circuit map data
// used to get the circuit map data for a specific year and circuit key from the Multiviewer API
// to do: not use this API, create mine api
app.get("/api/multiviewer/circuitMap/:year/:circuitKey", async(req, res) => {
    const { year, circuitKey } = req.params;
    try {
        const response = await axios.get(
            `https://api.multiviewer.app/api/v1/circuits/${circuitKey}/${year}`,
        );
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/races/:year", async(req, res) => {
    const { year } = req.params;
    try {
        const response = await axios.get(`${F1_API_URL}${year}/Index.json`);
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/session/*splat", async(req, res) => {
    const path = getPath(req, res);

    try {
        const response = await axios.get(`${F1_API_URL}${path}Index.json`);
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching data:", error.message);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/sessionInfo/*splat", async(req, res) => {
    const path = getPath(req, res);

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}SessionInfo.jsonStream`,
        );
        res.json(parseStreamToJson(response.data));
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/driverList/*splat", async(req, res) => {
    const path = getPath(req, res);

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}DriverList.json`,
        );
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/tyreStintSeries/*splat", async(req, res) => {
    const path = getPath(req, res);

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}TyreStintSeries.json`,
        );
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/currentTyres/*splat", async(req, res) => {
    const path = getPath(req, res);

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}CurrentTyres.json`,
        );
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

function extractLapSectorTimes(jsonStream) {
    const result = {};
    const pending = {};

    const parseTime = (value) => {
        if (value === undefined || value === null || value === "") {
            return null;
        }

        const parts = String(value).split(":");

        if (parts.length === 2) {
            return Number(parts[0]) * 60 + Number(parts[1]);
        }

        return Number(value);
    };

    const lines = jsonStream
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter(Boolean);

    for (const line of lines) {
        const match = line.match(/^(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*(\{.*\})$/);

        if (!match) {
            continue;
        }

        let data;

        try {
            data = JSON.parse(match[2]);
        } catch {
            continue;
        }

        if (!data.Lines) {
            continue;
        }

        for (const [driverNumber, driverData] of Object.entries(data.Lines)) {
            if (!pending[driverNumber]) {
                pending[driverNumber] = {
                    sector1: null,
                    sector2: null,
                    sector3: null,
                    lastLapTime: null
                };
            }

            const driver = pending[driverNumber];

            if (driverData.Sectors) {
                if (driverData.Sectors[0]?.Value !== undefined &&
                    driverData.Sectors[0].Value !== "") {
                    driver.sector1 = parseTime(driverData.Sectors[0].Value);
                }

                if (driverData.Sectors[1]?.Value !== undefined &&
                    driverData.Sectors[1].Value !== "") {
                    driver.sector2 = parseTime(driverData.Sectors[1].Value);
                }

                if (driverData.Sectors[2]?.Value !== undefined &&
                    driverData.Sectors[2].Value !== "") {
                    driver.sector3 = parseTime(driverData.Sectors[2].Value);
                }
            }

            if (driverData.LastLapTime?.Value) {
                driver.lastLapTime = parseTime(driverData.LastLapTime.Value);
            }

            if (driverData.NumberOfLaps !== undefined) {
                const lap = Number(driverData.NumberOfLaps);

                if (!Number.isFinite(lap) || lap <= 0) {
                    continue;
                }

                if (!result[driverNumber]) {
                    result[driverNumber] = [];
                }

                result[driverNumber].push({
                    lap,
                    sector1: driver.sector1?.toFixed(3) || null,
                    sector2: driver.sector2?.toFixed(3) || null,
                    sector3: driver.sector3?.toFixed(3) || null,
                    lapTime: driver.lastLapTime?.toFixed(3) || null
                });

                driver.sector1 = null;
                driver.sector2 = null;
                driver.sector3 = null;
                driver.lastLapTime = null;
            }
        }
    }

    return result;
}

app.get("/api/lapTimes/*splat", async(req, res) => {
    const splat = req.params.splat;

    if (!splat) {
        return res.status(400).json({ error: "Missing path" });
    }

    const path = Array.isArray(splat) ? splat.join("/") : splat;

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}TimingData.jsonStream`,
        );
        res.json(extractLapSectorTimes(response.data));
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// API to get weather data series
    app.get("/api/weatherDataSeries/*splat", async(req, res) => {
        const path = getPath(req, res);

        try {
            const response = await axios.get(
                `${F1_API_URL}${path}WeatherDataSeries.json`,
            );
            res.json(response.data);
        } catch (error) {
            console.error("Error fetching data:", error);
            res.status(500).json({ error: "Server error" });
        }
    });

    // API to get lap series data
    app.get("/api/lapSeries/*splat", async(req, res) => {
        const path = getPath(req, res);

        try {
            const response = await axios.get(`${F1_API_URL}${path}LapSeries.json`);
            res.json(response.data);
        } catch (error) {
            console.error("Error fetching data:", error);
            res.status(500).json({ error: "Server error" });
        }
    });

    // API to get top three drivers data
    app.get("/api/topThree/*splat", async(req, res) => {
        const path = getPath(req, res);

        try {
            const response = await axios.get(`${F1_API_URL}${path}TopThree.json`);
            res.json(response.data);
        } catch (error) {
            console.error("Error fetching data:", error);
            res.status(500).json({ error: "Server error" });
        }
    });

    // API to get final order of a session
    app.get("/api/finalPositions/*splat", async(req, res) => {
        const path = getPath(req, res);

        try {
            const response = await axios.get(`${F1_API_URL}${path}DriverRaceInfo.json`);
            res.json(response.data);
        } catch (error) {
            console.error("Error fetching data:", error);
            res.status(500).json({ error: "Server error" });
        }
    });

function extractLapStarts(stream) {
    const lines = stream.split(/\r?\n/);
    const result = {};

    for (const line of lines) {
        if (!line.trim()) continue;

        const jsonStart = line.indexOf("{");
        const time = line.slice(0, jsonStart);
        const data = JSON.parse(line.slice(jsonStart));

        if (!data.Lines) continue;

        for (const driver in data.Lines) {
            const driverData = data.Lines[driver];

            if (driverData.NumberOfLaps !== undefined) {
                if (!result[driver]) result[driver] = [];

                result[driver].push({
                    lap: driverData.NumberOfLaps,
                    start: time,
                });
            }
        }
    }

    return result;
}

app.get("/api/sessionData/*splat", async(req, res) => {
    const splat = req.params.splat;

    if (!splat) {
        return res.status(400).json({ error: "Missing path" });
    }

    const path = Array.isArray(splat) ? splat.join("/") : splat;

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}TimingData.jsonStream`,
        );
        res.json({
            data: parseStreamToJson(response.data),
            lapTimes: extractLapStarts(response.data),
        });
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// API to get telemetry data (runs Python script to process data)
app.get("/api/carData/*splat", async(req, res) => {
    const splat = req.params.splat;

    if (!splat) {
        return res.status(400).json({ error: "Missing path" });
    }

    const path = Array.isArray(splat) ? splat.join("/") : splat;
    carData(res, path);
    res.json({ status: "started" });
});

app.get("/api/telemetry/*splat", async(req, res) => {
    const splat = req.params.splat;
    if (!splat) return res.status(400).json({ error: "Missing path" });

    const path = Array.isArray(splat) ? splat.join("/") : splat;
    const cacheFile = getCacheFileT(path);
    const driversQuery = req.query.drivers;
    let selectedDrivers = driversQuery ? driversQuery.split(",") : [];

    // --- LOGICA DI COORDINAZIONE ---
    try {
        if (!fs.existsSync(cacheFile)) {

            // Creiamo una promessa che si risolve quando il file è pronto
            const waitForFile = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    telemetryEvents.removeAllListeners(`finished:${path}`);
                    reject(new Error("Timeout: Python ha impiegato più di 60s"));
                }, 60000);

                telemetryEvents.once(`finished:${path}`, () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });

            // Se carData non è già in esecuzione, lo avviamo con un "dummy socket"
            if (!runningJobsTelemetry.has(path)) {
                carData({ emit: () => {} }, path);
            }

            await waitForFile;
        }

        // --- CARICAMENTO DATI ---
        const [sessionRes, telemetryRaw] = await Promise.all([
            fetch(`http://localhost:3000/api/sessionData/${path}`).then((r) =>
                r.json(),
            ),
            JSON.parse(fs.readFileSync(cacheFile, "utf8")),
        ]);


        const telemetryData = Array.isArray(telemetryRaw) ?
            telemetryRaw :
            telemetryRaw.data || [];

        if (selectedDrivers.length === 0) {
            selectedDrivers = Object.keys(sessionRes.lapTimes || {});
        }

        // --- FUNZIONI DI UTILITÀ ---
        const timeToMs = (t) => {
            if (!t || typeof t !== "string") return 0;
            const parts = t.split(":");
            const [h, m, s] = parts;
            const [sec, ms] = s.split(".");
            return (
                parseInt(h) * 3600000 +
                parseInt(m) * 60000 +
                parseInt(sec) * 1000 +
                (parseInt(ms) || 0)
            );
        };

        const finalResult = {};

        // --- ELABORAZIONE FISICA E FILTRAGGIO ---
        selectedDrivers.forEach((driver) => {
            const drv = String(driver);
            finalResult[drv] = {};
            const laps = sessionRes.lapTimes?.[drv] || [];

            laps.forEach((lapInfo, index) => {
                const startMs = timeToMs(lapInfo.start);
                const endMs = laps[index + 1] ?
                    timeToMs(laps[index + 1].start) :
                    Infinity;

                // Variabili per calcoli progressivi (Distanza ed ERS 2026)
                let lapDist = 0;
                let lastTimeMs = null;

                const points = [];

                telemetryData.forEach((packet) => {
                    const tMs = timeToMs(packet.time);
                    if (tMs >= startMs && tMs < endMs) {
                        // 1. Verifichiamo che la struttura dati esista per evitare crash
                        const entries = packet.data?.Entries;
                        if (Array.isArray(entries)) {
                            // 2. Cerchiamo l'entry che contiene la macchina del pilota (drv)
                            const entry = entries.find((e) => e.Cars && e.Cars[drv]);

                            if (entry) {
                                const carData = entry.Cars[drv];
                                const channels = carData.Channels;

                                // 3. Calcolo delta tempo per integrazione distanza
                                if (lastTimeMs !== null) {
                                    const dt = (tMs - lastTimeMs) / 1000;
                                    // Usiamo + per assicurarci che sia un numero, '2' è la velocità
                                    const speedKmh = parseFloat(channels["2"] || 0);

                                    // Integrazione: v (m/s) * dt (s)
                                    lapDist += (speedKmh / 3.6) * dt;
                                }
                                lastTimeMs = tMs;

                                // 4. Push del punto elaborato
                                points.push({
                                    dist: Math.round(lapDist),
                                    time: packet.time,
                                    channels: channels,
                                });
                            }
                        }
                    }
                });

                if (points.length > 0) {
                    finalResult[drv][lapInfo.lap] = points;
                }
            });
        });

        res.json(finalResult);
    } catch (error) {
        console.error("Errore Telemetry Endpoint:", error);
        res.status(500).json({ error: error.message });
    }
});

// Function to process telemetry data using a Python script
const runningJobsTelemetry = new Map();

function getCacheFileT(path) {
    const hash = crypto.createHash("md5").update(path).digest("hex");
    return `./doc/json/carData/telemetry_${hash}.json`;
}

import { EventEmitter } from "events";
const telemetryEvents = new EventEmitter();

function carData(socket, path) {
    const cacheFile = getCacheFileT(path);
    const tempFile = cacheFile + ".tmp";

    if (fs.existsSync(cacheFile)) {
        socket.emit("telemetryProgress", 100);
        let jsonData;
        try {
            jsonData = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        } catch (err) {
            console.error("Errore parsing JSON:", err);
            jsonData = null;
        }

        socket.emit("telemetryFinished", {
            response: "Loaded from cache",
            file: cacheFile,
            data: jsonData,
        });
        return;
    }

    if (runningJobsTelemetry.has(path)) {

        runningJobsTelemetry.get(path).sockets.push(socket);
        return;
    }


    runningJobsTelemetry.set(path, {
        sockets: [socket],
    });

    const python = spawn("python", [
        "./scriptPython/telemetry.py",
        path,
        tempFile,
    ]);

    python.stdout.on("data", (data) => {
        const text = data.toString().trim();
        if (!text) return;


        if (text.startsWith("PROGRESS:")) {
            const percent = parseInt(text.split(":")[1]);
            const job = runningJobsTelemetry.get(path);

            if (!job) return;

            job.sockets.forEach((s) => {
                s.emit("telemetryProgress", percent);
            });
        }
    });

    python.stderr.on("data", (data) => {
        console.error("[PYTHON ERROR]", data.toString());
    });

    python.on("close", (code) => {
        const job = runningJobsTelemetry.get(path);
        if (!job) return;

        if (code !== 0) {
            job.sockets.forEach((s) => {
                s.emit("telemetryError", "Python error");
            });

            runningJobsTelemetry.delete(path);
            return;
        }

        fs.renameSync(tempFile, cacheFile);

        let jsonData;
        try {
            jsonData = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        } catch (err) {
            console.error("Errore parsing JSON:", err);
            jsonData = null;
        }

        job.sockets.forEach((s) => {
            s.emit("telemetryFinished", {
                response: "Loaded",
                file: cacheFile,
                data: jsonData,
            });
        });

        telemetryEvents.emit(`finished:${path}`);

        runningJobsTelemetry.delete(path);
    });
}

// API to get position data (runs Python script to process data)
app.get("/api/carPosition/*splat", async(req, res) => {
    const splat = req.params.splat;

    if (!splat) {
        return res.status(400).json({ error: "Missing path" });
    }

    const path = Array.isArray(splat) ? splat.join("/") : splat;
    carPosition(res, path);
    res.json({ status: "started" });
});

// Function to process telemetry data using a Python script
const runningJobsPosition = new Map();

function getCacheFileP(path) {
    const hash = crypto.createHash("md5").update(path).digest("hex");
    return `./doc/json/carPosition/position_${hash}.json`;
}

function carPosition(socket, path) {
    const cacheFile = getCacheFileP(path);
    const tempFile = cacheFile + ".tmp";

    if (fs.existsSync(cacheFile)) {
        socket.emit("positionProgress", 100);
        let jsonData;
        try {
            jsonData = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        } catch (err) {
            console.error("Errore parsing JSON:", err);
            jsonData = null;
        }

        socket.emit("positionFinished", {
            response: "Loaded from cache",
            file: cacheFile,
            data: jsonData,
        });
        return;
    }

    if (runningJobsPosition.has(path)) {

        runningJobsPosition.get(path).sockets.push(socket);
        return;
    }


    runningJobsPosition.set(path, {
        sockets: [socket],
    });

    const python = spawn("python", [
        "./scriptPython/position.py",
        path,
        tempFile,
    ]);

    python.stdout.on("data", (data) => {
        const text = data.toString().trim();
        if (!text) return;


        if (text.startsWith("PROGRESS:")) {
            const percent = parseInt(text.split(":")[1]);
            const job = runningJobsPosition.get(path);

            if (!job) return;

            job.sockets.forEach((s) => {
                s.emit("positionProgress", percent);
            });
        }
    });

    python.stderr.on("data", (data) => {
        console.error("[PYTHON ERROR]", data.toString());
    });

    python.on("close", (code) => {
        const job = runningJobsPosition.get(path);
        if (!job) return;

        if (code !== 0) {
            job.sockets.forEach((s) => {
                s.emit("positionError", "Python error");
            });

            runningJobsPosition.delete(path);
            return;
        }

        fs.renameSync(tempFile, cacheFile);

        let jsonData;
        try {
            jsonData = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        } catch (err) {
            console.error("Errore parsing JSON:", err);
            jsonData = null;
        }

        job.sockets.forEach((s) => {
            s.emit("positionFinished", {
                response: "Loaded",
                file: cacheFile,
                data: jsonData,
            });
        });

        runningJobsPosition.delete(path);
    });
}

// API to update drivers number and team colors
app.get("/api/updateDriversNumberAndColour/*splat", async(req, res) => {
    const splat = req.params.splat;
    if (!splat) return res.status(400).json({ error: "Missing path" });

    const path = Array.isArray(splat) ? splat.join("/") : splat;

    try {
        const response = await fetch(
            `http://localhost:3000/api/driverList/${path}`,
        );
        const rawData = await response.json();
        const driversData = {};

        const sourceDrivers = rawData[0]?.data || {};

        Object.values(sourceDrivers).forEach((driver) => {
            driversData[driver.RacingNumber] = {
                Abbreviation: driver.Tla,
                TeamColour: driver.TeamColour,
            };
        });


        res.json({
            success: true,
            data: driversData,
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// API to get car position for 3D circuit visualization
app.get("/api/getCarPositionFor3DCircuit/*splat", async(req, res) => {
    const splat = req.params.splat;

    if (!splat) {
        return res.status(400).json({ error: "Missing path" });
    }

    const path = Array.isArray(splat) ? splat.join("/") : splat;

    // Call the drivers API
    try {
        await axios.get(
            `http://localhost:3000/api/updateDriversNumberAndColour/${path}`,
        );
    } catch (error) {
        console.error("Error updating driver colors and numbers:", error);
        return res.status(500).json({
            error: "Error updating driver colors and numbers",
        });
    }

    // Call the car position API
    try {
        await axios.get(`http://localhost:3000/api/carPosition/${path}`);
    } catch (error) {
        console.error("Error getting car position:", error);
        return res.status(500).json({
            error: "Error getting car position",
        });
    }

    res.json({ response: "Loaded" });
});

server.listen(PORT, () => {
});
