import express from "express";
import ws, { WebSocketServer } from "ws";
import http from "http";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const AUTH_TOKEN = process.env.F1_AUTH_TOKEN;
const CARTO_API_KEY = process.env.CARTO_API_KEY;

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
                message: "Connessione chiusa, riconnessione in corso...",
            }),
        );
        setTimeout(connectToF1, 5000);
    });
}

connectToF1();

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
