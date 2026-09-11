import express from "express";
import ws, { WebSocketServer } from "ws";
import http from "http";
import dotenv from "dotenv";
import axios from "axios";
import * as cheerio from "cheerio";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const AUTH_TOKEN = process.env.F1_AUTH_TOKEN;
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

    console.log(JSON.stringify({ type: "HTTP_VISIT", ...visitorData }));
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
    const ip = req.socket.remoteAddress;
    console.log(
        JSON.stringify({
            timestamp: new Date().toISOString(),
            event: "websocket_connection",
            ip,
        }),
    );

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
        console.log(
            JSON.stringify({
                type: "F1_SOCKET_CLOSE",
                message: "Connection closed, reconnecting...",
            }),
        );
        setTimeout(connectToF1, 5000);
    });
}

connectToF1();

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
