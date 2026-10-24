import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QID_PATTERN = /^Q\d+$/;
const VENUE_PATTERN =
    /(race ?track|racing circuit|motor ?racing|motorsport|circuit|speedway|autodrom|raceway)/i;

class CircuitEnricher {
    constructor({
        cachePath = path.join(__dirname, "circuit-cache.json"),
        ttlMs = 30 * 24 * 60 * 60 * 1000,
        missTtlMs = 24 * 60 * 60 * 1000,
        overrides = {},
        contact = "your-email@example.com",
    } = {}) {
        this.cachePath = cachePath;
        this.ttlMs = ttlMs;
        this.missTtlMs = missTtlMs;
        this.overrides = overrides;
        this.cache = null;
        this.http = axios.create({
            timeout: 20000,
            headers: {
                "User-Agent": `LivetimingF1/1.0 (${contact})`,
                Accept: "application/json",
            },
        });
    }

    async loadCache() {
        if (this.cache) return;
        try {
            this.cache = JSON.parse(await fs.readFile(this.cachePath, "utf-8"));
        } catch (error) {
            this.cache = {};
        }
    }

    async saveCache() {
        await fs.writeFile(this.cachePath, JSON.stringify(this.cache, null, 2));
    }

    normalize(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    }

    isFresh(entry) {
        if (!entry) return false;
        const ttl = entry.qid ? this.ttlMs : this.missTtlMs;
        return Date.now() - entry.fetchedAt < ttl;
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async searchCandidates(term) {
        const { data } = await this.http.get(
            "https://www.wikidata.org/w/api.php",
            {
                params: {
                    action: "wbsearchentities",
                    search: term,
                    language: "en",
                    type: "item",
                    limit: 8,
                    format: "json",
                },
            },
        );
        return Array.isArray(data.search) ? data.search : [];
    }

    async findQid(race) {
        const terms = [
            race.circuitOfficialName,
            race.circuitLocation ? `${race.circuitLocation} circuit` : "",
        ].filter(Boolean);

        for (const term of terms) {
            const candidates = await this.searchCandidates(term);
            const match = candidates.find((c) =>
                VENUE_PATTERN.test(c.description || ""),
            );
            if (match) return match.id;
            await this.sleep(300);
        }
        return null;
    }

    async fetchDetails(qids) {
        const valid = qids.filter((qid) => QID_PATTERN.test(qid));
        if (valid.length === 0) return {};

        const query = `
            SELECT ?item
                (SAMPLE(?c) AS ?coord)
                (SAMPLE(?e) AS ?elevation)
                (SAMPLE(?tzl) AS ?timezone)
                (SAMPLE(?i) AS ?inception)
                (SAMPLE(?opl) AS ?operator)
                (SAMPLE(?cap) AS ?capacity)
                (SAMPLE(?w) AS ?website)
                (SAMPLE(?img) AS ?image)
                (SAMPLE(?rl) AS ?region)
            WHERE {
                VALUES ?item { ${valid.map((qid) => `wd:${qid}`).join(" ")} }
                OPTIONAL { ?item wdt:P625 ?c. }
                OPTIONAL { ?item wdt:P2044 ?e. }
                OPTIONAL { ?item wdt:P571 ?i. }
                OPTIONAL { ?item wdt:P1083 ?cap. }
                OPTIONAL { ?item wdt:P856 ?w. }
                OPTIONAL { ?item wdt:P18 ?img. }
                OPTIONAL {
                    ?item wdt:P421 ?tz.
                    ?tz rdfs:label ?tzl.
                    FILTER(LANG(?tzl) = "en")
                }
                OPTIONAL {
                    ?item wdt:P137 ?op.
                    ?op rdfs:label ?opl.
                    FILTER(LANG(?opl) = "en")
                }
                OPTIONAL {
                    ?item wdt:P131 ?reg.
                    ?reg rdfs:label ?rl.
                    FILTER(LANG(?rl) = "en")
                }
            }
            GROUP BY ?item
        `;

        const { data } = await this.http.get(
            "https://query.wikidata.org/sparql",
            {
                params: { query, format: "json" },
            },
        );

        const result = {};
        for (const row of data.results.bindings) {
            const qid = row.item.value.split("/").pop();
            result[qid] = this.parseRow(qid, row);
        }
        return result;
    }

    parseRow(qid, row) {
        const value = (key) => (row[key] ? row[key].value : null);

        let latitude = null;
        let longitude = null;
        const coord = value("coord");
        const coordMatch =
            coord && coord.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/i);
        if (coordMatch) {
            longitude = Number(coordMatch[1]);
            latitude = Number(coordMatch[2]);
        }

        const elevation = value("elevation");
        const capacity = value("capacity");
        const inception = value("inception");
        const inceptionYear = inception
            ? parseInt(inception.replace(/^\+/, ""), 10)
            : null;
        const image = value("image");

        return {
            wikidataId: qid,
            wikidataUrl: `https://www.wikidata.org/wiki/${qid}`,
            latitude,
            longitude,
            elevationM:
                elevation !== null ? Math.round(Number(elevation)) : null,
            timezone: value("timezone"),
            openedYear: Number.isFinite(inceptionYear) ? inceptionYear : null,
            operator: value("operator"),
            capacity: capacity !== null ? Math.round(Number(capacity)) : null,
            region: value("region"),
            website: value("website"),
            image: image
                ? `${image.replace(/^http:/, "https:")}?width=800`
                : null,
        };
    }

    parseLapTime(time) {
        const match = String(time || "").match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
        if (!match) return null;
        return Number(match[1]) * 60 + Number(match[2]);
    }

    computeAverageSpeed(race) {
        const seconds = this.parseLapTime(
            race.fastestLap && race.fastestLap.time,
        );
        if (!seconds || !race.trackLengthKm) return null;
        return Math.round((race.trackLengthKm / seconds) * 3600 * 10) / 10;
    }

    cacheKey(race) {
        return this.normalize(race.circuitOfficialName);
    }

    async resolveQid(race, entry) {
        if (this.overrides[race.slug]) return this.overrides[race.slug];
        if (entry && entry.qid) return entry.qid;
        return this.findQid(race);
    }

    async enrich(races) {
        try {
            await this.loadCache();

            const stale = new Map();
            for (const race of races) {
                if (!race.circuitOfficialName) continue;
                const key = this.cacheKey(race);
                const entry = this.cache[key];
                const overridden = this.overrides[race.slug];
                const overrideChanged =
                    overridden && (!entry || entry.qid !== overridden);
                if (this.isFresh(entry) && !overrideChanged) continue;
                if (!stale.has(key)) stale.set(key, { race, entry });
            }

            const resolved = new Map();
            for (const [key, { race, entry }] of stale) {
                const qid = await this.resolveQid(race, entry);
                resolved.set(key, qid);
                await this.sleep(300);
            }

            const qids = [...new Set([...resolved.values()].filter(Boolean))];
            const details = await this.fetchDetails(qids);

            for (const [key, qid] of resolved) {
                this.cache[key] = {
                    qid: qid && details[qid] ? qid : null,
                    data: qid && details[qid] ? details[qid] : null,
                    fetchedAt: Date.now(),
                };
            }

            if (stale.size > 0) await this.saveCache();

            return races.map((race) => {
                const entry = this.cache[this.cacheKey(race)];
                return {
                    ...race,
                    circuitInfo: entry && entry.data ? entry.data : null,
                    averageLapSpeedKmh: this.computeAverageSpeed(race),
                };
            });
        } catch (error) {
            return races.map((race) => ({
                ...race,
                circuitInfo: null,
                averageLapSpeedKmh: this.computeAverageSpeed(race),
            }));
        }
    }
}

export default CircuitEnricher;
