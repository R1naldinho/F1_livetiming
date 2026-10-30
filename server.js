import express from "express";
import ws, { WebSocketServer } from "ws";
import http from "http";
import dotenv from "dotenv";
import axios from "axios";
import * as cheerio from "cheerio";
import crypto from "crypto";
import fs from "fs";
import { spawn } from "child_process";
import { EventEmitter } from "events";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

export const app = express();
const PORT = Number(process.env.PORT || 3000);
const AUTH_TOKEN = process.env.F1_AUTH_TOKEN;
const F1_API_URL = process.env.F1_API_URL;
const CARTO_API_KEY = process.env.CARTO_API_KEY || "";

const f1Headers = {
    headers: {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        authorization: `Bearer ${process.env.SUBSCRIPTION_TOKEN}`,
    },
};

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

import CircuitEnricher from "./circuitEnricher.js";
const circuitEnricher = new CircuitEnricher({
    contact: "your-email@example.com",
    overrides: {},
});

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
    const regex = new RegExp(
        '\\\\"' + key + '\\\\":\\\\"((?:[^\\\\"]|\\\\.|<[^>]*>)*?)\\\\"',
    );
    const match = html.match(regex);

    if (!match) return "";

    return match[1]
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/\\?"]\)\s*(?:self\.__next_f\.push\(\[1,")?/gi, "")
        .replace(/\\u003C/gi, "<")
        .replace(/\\u003E/gi, ">")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
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
                sessions = parsed.map((s) => {
                    const gmtOffset = s.gmtOffset || "";
                    const startTime =
                        s.startTime && gmtOffset
                            ? `${s.startTime}${gmtOffset}`
                            : s.startTime || "";
                    const endTime =
                        s.endTime && gmtOffset
                            ? `${s.endTime}${gmtOffset}`
                            : s.endTime || "";
                    return {
                        session: s.session || "",
                        shortName: s.shortName || "",
                        name: s.description || "",
                        startTime,
                        endTime,
                        gmtOffset,
                        timezone: s.timezone || "",
                        state: s.state || "",
                        sessionType: s.sessionType || "",
                        sessionNumber: s.sessionNumber ?? null,
                    };
                });
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

        const finalRaces = await circuitEnricher.enrich(enrichedRaces);

        cachedCalendar = {
            year: currentYear,
            races: finalRaces,
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
                    "LapCount",
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

function getPath(req) {
    const splat = req.params.splat;

    if (!splat) {
        return res.status(400).json({ error: "Missing path" });
    }

    return Array.isArray(splat) ? splat.join("/") : splat;
}

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

app.get("/api/multiviewer/circuitMap/:year/:circuitKey", async (req, res) => {
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

app.get("/api/races/:year", async (req, res) => {
    const { year } = req.params;
    try {
        const response = await axios.get(
            `${F1_API_URL}${year}/Index.json`,
            f1Headers,
        );
        console.log(year);
        if (year == 2021) {
            response.data.Meetings[
                response.data.Meetings.length - 2
            ].Sessions.pop();
        }
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/session/*splat", async (req, res) => {
    const path = getPath(req, res);

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}Index.json`,
            f1Headers,
        );
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching data:", error.message);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/sessionInfo/*splat", async (req, res) => {
    const path = getPath(req, res);

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}SessionInfo.jsonStream`,
            f1Headers,
        );
        res.json(parseStreamToJson(response.data));
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/driverList/*splat", async (req, res) => {
    const path = getPath(req, res);

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}DriverList.json`,
            f1Headers,
        );
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/tyreStintSeries/*splat", async (req, res) => {
    const path = getPath(req, res);

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}TyreStintSeries.json`,
            f1Headers,
        );
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/currentTyres/*splat", async (req, res) => {
    const path = getPath(req, res);

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}CurrentTyres.json`,
            f1Headers,
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
                    lastLapTime: null,
                };
            }

            const driver = pending[driverNumber];

            if (driverData.Sectors) {
                if (
                    driverData.Sectors[0]?.Value !== undefined &&
                    driverData.Sectors[0].Value !== ""
                ) {
                    driver.sector1 = parseTime(driverData.Sectors[0].Value);
                }

                if (
                    driverData.Sectors[1]?.Value !== undefined &&
                    driverData.Sectors[1].Value !== ""
                ) {
                    driver.sector2 = parseTime(driverData.Sectors[1].Value);
                }

                if (
                    driverData.Sectors[2]?.Value !== undefined &&
                    driverData.Sectors[2].Value !== ""
                ) {
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
                    lapTime: driver.lastLapTime?.toFixed(3) || null,
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

app.get("/api/lapTimes/*splat", async (req, res) => {
    const splat = req.params.splat;

    if (!splat) {
        return res.status(400).json({ error: "Missing path" });
    }

    const path = Array.isArray(splat) ? splat.join("/") : splat;

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}TimingData.jsonStream`,
            f1Headers,
        );
        res.json(extractLapSectorTimes(response.data));
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/weatherDataSeries/*splat", async (req, res) => {
    const path = getPath(req, res);

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}WeatherDataSeries.json`,
            f1Headers,
        );
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/lapSeries/*splat", async (req, res) => {
    const path = getPath(req, res);

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}LapSeries.json`,
            f1Headers,
        );
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/topThree/*splat", async (req, res) => {
    const path = getPath(req, res);

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}TopThree.json`,
            f1Headers,
        );
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).json({ error: "Server error" });
    }
});

app.get("/api/finalPositions/*splat", async (req, res) => {
    const path = getPath(req, res);

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}DriverTracker.json`,
            f1Headers,
        );
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

app.get("/api/sessionData/*splat", async (req, res) => {
    const splat = req.params.splat;

    if (!splat) {
        return res.status(400).json({ error: "Missing path" });
    }

    const path = Array.isArray(splat) ? splat.join("/") : splat;

    try {
        const response = await axios.get(
            `${F1_API_URL}${path}TimingData.jsonStream`,
            f1Headers,
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

app.get("/api/carData/*splat", async (req, res) => {
    const splat = req.params.splat;

    if (!splat) {
        return res.status(400).json({ error: "Missing path" });
    }

    const path = Array.isArray(splat) ? splat.join("/") : splat;
    carData(res, path);
    res.json({ status: "started" });
});

app.get("/api/telemetry/*splat", async (req, res) => {
    const splat = req.params.splat;
    if (!splat) return res.status(400).json({ error: "Missing path" });

    const path = Array.isArray(splat) ? splat.join("/") : splat;
    const cacheFile = getCacheFileT(path);
    const driversQuery = req.query.drivers;
    let selectedDrivers = driversQuery ? driversQuery.split(",") : [];

    try {
        if (!fs.existsSync(cacheFile)) {
            const waitForFile = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    telemetryEvents.removeAllListeners(`finished:${path}`);
                    reject(
                        new Error("Timeout: Python ha impiegato più di 60s"),
                    );
                }, 60000);

                telemetryEvents.once(`finished:${path}`, () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });

            if (!runningJobsTelemetry.has(path)) {
                carData({ emit: () => {} }, path);
            }

            await waitForFile;
        }

        const [sessionRes, telemetryRaw] = await Promise.all([
            fetch(`http://localhost:3000/api/sessionData/${path}`).then((r) =>
                r.json(),
            ),
            JSON.parse(fs.readFileSync(cacheFile, "utf8")),
        ]);

        const telemetryData = Array.isArray(telemetryRaw)
            ? telemetryRaw
            : telemetryRaw.data || [];

        if (selectedDrivers.length === 0) {
            selectedDrivers = Object.keys(sessionRes.lapTimes || {});
        }

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

        selectedDrivers.forEach((driver) => {
            const drv = String(driver);
            finalResult[drv] = {};
            const laps = sessionRes.lapTimes?.[drv] || [];

            laps.forEach((lapInfo, index) => {
                const startMs = timeToMs(lapInfo.start);
                const endMs = laps[index + 1]
                    ? timeToMs(laps[index + 1].start)
                    : Infinity;

                let lapDist = 0;
                let lastTimeMs = null;

                const points = [];

                telemetryData.forEach((packet) => {
                    const tMs = timeToMs(packet.time);
                    if (tMs >= startMs && tMs < endMs) {
                        const entries = packet.data?.Entries;
                        if (Array.isArray(entries)) {
                            const entry = entries.find(
                                (e) => e.Cars && e.Cars[drv],
                            );

                            if (entry) {
                                const carData = entry.Cars[drv];
                                const channels = carData.Channels;

                                if (lastTimeMs !== null) {
                                    const dt = (tMs - lastTimeMs) / 1000;
                                    const speedKmh = parseFloat(
                                        channels["2"] || 0,
                                    );

                                    lapDist += (speedKmh / 3.6) * dt;
                                }
                                lastTimeMs = tMs;

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

const runningJobsTelemetry = new Map();

function getCacheFileT(path) {
    const hash = crypto.createHash("md5").update(path).digest("hex");
    return `./doc/json/carData/telemetry_${hash}.json`;
}

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

app.get("/api/carPosition/*splat", async (req, res) => {
    const splat = req.params.splat;

    if (!splat) {
        return res.status(400).json({ error: "Missing path" });
    }

    const path = Array.isArray(splat) ? splat.join("/") : splat;
    carPosition(res, path);
    res.json({ status: "started" });
});

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

app.get("/api/updateDriversNumberAndColour/*splat", async (req, res) => {
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

app.get("/api/getCarPositionFor3DCircuit/*splat", async (req, res) => {
    const splat = req.params.splat;

    if (!splat) {
        return res.status(400).json({ error: "Missing path" });
    }

    const path = Array.isArray(splat) ? splat.join("/") : splat;

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

let subscriptionToken = process.env.SUBSCRIPTION_TOKEN || "";

function isTokenExpired(token) {
    try {
        const payload = JSON.parse(
            Buffer.from(token.split(".")[1], "base64url").toString("utf8")
        );

        return !payload.exp || payload.exp * 1000 <= Date.now();
    } catch {
        return true;
    }
}

function authorizeAdmin(req, res, next) {
    const secret = process.env.ADMIN_SECRET;

    if (!secret || req.headers["x-admin-secret"] !== secret) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    next();
}

app.get("/api/admin/f1-token", authorizeAdmin, (req, res) => {
    res.json({
        present: Boolean(subscriptionToken),
        expired: !subscriptionToken || isTokenExpired(subscriptionToken)
    });
});

app.post(
    "/api/admin/f1-token",
    express.json(),
    authorizeAdmin,
    (req, res) => {
        const token = req.body?.token;

        if (typeof token !== "string" || token.split(".").length !== 3) {
            return res.status(400).json({ error: "Invalid token" });
        }

        subscriptionToken = token;
        f1Headers.headers.authorization = `Bearer ${subscriptionToken}`;

        res.json({
            success: true,
            present: true,
            expired: isTokenExpired(subscriptionToken)
        });
    }
);



class SimpleRateLimiter {
    constructor(limit, windowMs) {
        this.limit = limit;
        this.windowMs = windowMs;
        this.hits = new Map();
        setInterval(() => this.sweep(), windowMs).unref();
    }

    allow(key) {
        const now = Date.now();
        const recent = (this.hits.get(key) || []).filter(
            (timestamp) => now - timestamp < this.windowMs,
        );
        if (recent.length >= this.limit) {
            this.hits.set(key, recent);
            return false;
        }
        recent.push(now);
        this.hits.set(key, recent);
        return true;
    }

    sweep() {
        const now = Date.now();
        this.hits.forEach((timestamps, key) => {
            const recent = timestamps.filter(
                (timestamp) => now - timestamp < this.windowMs,
            );
            if (recent.length === 0) {
                this.hits.delete(key);
            } else {
                this.hits.set(key, recent);
            }
        });
    }
}

const calibrationLimiter = new SimpleRateLimiter(20, 60 * 60 * 1000);
const calibrationSlug = /^[a-z0-9-]{1,40}$/;
const calibrationMethods = new Set(["clock", "lap"]);
const calibrationSessionKinds = new Set(["practice", "qualifying", "race"]);

function parseCalibration(body) {
    if (!body || typeof body !== "object") return null;

    const { series, service, device, method, sessionKind, delaySeconds, samples } = body;

    if (series !== "f1") return null;
    if (typeof service !== "string" || !calibrationSlug.test(service)) return null;
    if (typeof device !== "string" || !calibrationSlug.test(device)) return null;
    if (!calibrationMethods.has(method)) return null;
    if (!calibrationSessionKinds.has(sessionKind)) return null;
    if (typeof delaySeconds !== "number" || !Number.isFinite(delaySeconds)) return null;
    if (delaySeconds < 0 || delaySeconds > 300) return null;
    if (!Number.isInteger(samples) || samples < 1 || samples > 20) return null;

    return {
        series,
        service,
        device,
        method,
        sessionKind,
        delaySeconds: Math.round(delaySeconds * 10) / 10,
        samples,
        createdAt: new Date().toISOString(),
    };
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

function todayUtc() {
    return new Date().toISOString().slice(0, 10);
}

function dayOffset(day, offset) {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
}

function getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    const first = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "";
    return first || req.socket.remoteAddress || "unknown";
}

class CalibrationRepository {
    constructor(client) {
        this.client = client;
        this.cache = null;
        this.cachedAt = 0;
        this.cacheMs = 5 * 60 * 1000;
    }

    async save(record) {
        const { error } = await this.client.from("delay_calibrations").insert({
            series: record.series,
            service: record.service,
            device: record.device,
            method: record.method,
            session_kind: record.sessionKind,
            delay_seconds: record.delaySeconds,
            samples: record.samples,
        });
        if (error) throw error;
    }

    async getDefaults() {
        if (this.cache && Date.now() - this.cachedAt < this.cacheMs) {
            return this.cache;
        }

        const { data, error } = await this.client.rpc("calibration_medians", {
            p_min: 3,
        });
        if (error) throw error;

        this.cache = data.map((row) => ({
            service: row.service,
            device: row.device,
            measurements: row.measurements,
            delaySeconds: Number(row.median_seconds),
        }));
        this.cachedAt = Date.now();
        return this.cache;
    }
}

class VisitorHasher {
    constructor(client) {
        this.client = client;
        this.day = null;
        this.salt = null;
        this.pending = null;
    }

    async getSalt(day) {
        if (this.day === day && this.salt) return this.salt;

        if (!this.pending) {
            this.pending = this.client
                .rpc("get_daily_salt", { p_day: day })
                .then(({ data, error }) => {
                    if (error || typeof data !== "string") {
                        throw error || new Error("Missing daily salt");
                    }
                    this.day = day;
                    this.salt = data;
                    return data;
                })
                .finally(() => {
                    this.pending = null;
                });
        }

        return this.pending;
    }

    async hash(ip, userAgent, day) {
        const salt = await this.getSalt(day);
        return crypto
            .createHmac("sha256", salt)
            .update(`${ip}|${userAgent}`)
            .digest("hex")
            .slice(0, 32);
    }
}

class MetricsRepository {
    constructor(client) {
        this.client = client;
    }

    async recordPageview(day, path, visitorHash) {
        const { error } = await this.client.rpc("record_pageview", {
            p_day: day,
            p_path: path,
            p_visitor: visitorHash,
        });
        if (error) throw error;
    }

    async summary(days) {
        const today = todayUtc();
        const since = dayOffset(today, -(days - 1));

        const rollup = await this.client.rpc("rollup_visitors");
        if (rollup.error) throw rollup.error;

        const [totals, current, views, pages] = await Promise.all([
            this.client.from("daily_totals").select("day, visitors").gte("day", since),
            this.client
                .from("daily_visitors")
                .select("visitor_hash", { count: "exact", head: true })
                .eq("day", today),
            this.client.rpc("daily_views", { p_since: since }),
            this.client.rpc("top_pages", { p_since: since, p_limit: 20 }),
        ]);

        const failure = totals.error || current.error || views.error || pages.error;
        if (failure) throw failure;

        const visitorsByDay = new Map(totals.data.map((row) => [row.day, row.visitors]));
        visitorsByDay.set(today, (visitorsByDay.get(today) || 0) + (current.count || 0));
        const viewsByDay = new Map(views.data.map((row) => [row.day, Number(row.views)]));

        const daily = [];
        for (let offset = days - 1; offset >= 0; offset--) {
            const day = dayOffset(today, -offset);
            daily.push({
                day,
                visitors: visitorsByDay.get(day) || 0,
                views: viewsByDay.get(day) || 0,
            });
        }

        return {
            daily,
            pages: pages.data.map((row) => ({
                path: row.path,
                views: Number(row.views),
            })),
        };
    }
}

const calibrationRepository = new CalibrationRepository(supabase);
const visitorHasher = new VisitorHasher(supabase);
const metricsRepository = new MetricsRepository(supabase);
const metricsLimiter = new SimpleRateLimiter(60, 60 * 1000);
const metricsPathPattern = /^\/[a-zA-Z0-9/_-]{0,99}$/;

app.post("/api/calibration", express.json({ limit: "2kb" }), async (req, res) => {
    if (!calibrationLimiter.allow(getClientIp(req))) {
        return res.status(429).json({ error: "Too many requests" });
    }

    const record = parseCalibration(req.body);
    if (!record) {
        return res.status(400).json({ error: "Invalid calibration" });
    }

    try {
        await calibrationRepository.save(record);
        res.status(201).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Could not save calibration" });
    }
});

app.get("/api/calibration/defaults", async (req, res) => {
    try {
        const defaults = await calibrationRepository.getDefaults();
        res.set("Cache-Control", "public, max-age=300");
        res.json(defaults);
    } catch (error) {
        res.status(500).json({ error: "Could not load defaults" });
    }
});

app.post("/api/metrics/pageview", express.json({ limit: "1kb" }), async (req, res) => {
    const ip = getClientIp(req);
    if (!metricsLimiter.allow(ip)) {
        return res.status(429).end();
    }

    const path = req.body?.path;
    if (typeof path !== "string" || !metricsPathPattern.test(path)) {
        return res.status(400).json({ error: "Invalid path" });
    }

    try {
        const day = todayUtc();
        const visitorHash = await visitorHasher.hash(
            ip,
            req.headers["user-agent"] || "",
            day,
        );
        await metricsRepository.recordPageview(day, path, visitorHash);
        res.status(204).end();
    } catch (error) {
        res.status(500).json({ error: "Could not record pageview" });
    }
});

app.get("/api/metrics/summary", authorizeAdmin, async (req, res) => {
    const days = Math.min(90, Math.max(1, Number.parseInt(req.query.days, 10) || 30));

    try {
        res.json(await metricsRepository.summary(days));
    } catch (error) {
        res.status(500).json({ error: "Could not load metrics" });
    }
});

app.get("/api/health/db", async (req, res) => {
    const { error } = await supabase.from("daily_totals").select("day").limit(1);
    if (error) {
        return res.status(503).json({ ok: false });
    }
    res.json({ ok: true });
});

server.listen(PORT, () => {});
