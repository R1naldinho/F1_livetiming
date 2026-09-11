if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
}

window.addEventListener(
    "scroll",
    () => {
        const pos = window.scrollY || document.documentElement.scrollTop;
        if (pos > 0) {
            sessionStorage.setItem("pageScrollPos", pos);
        }
    },
    { passive: true },
);

document.addEventListener(
    "scroll",
    (e) => {
        if (
            e.target &&
            e.target.classList &&
            e.target.classList.contains("table-wrapper")
        ) {
            if (e.target.scrollTop > 0) {
                sessionStorage.setItem("wrapperScrollPos", e.target.scrollTop);
            }
        }
    },
    true,
);

function restoreScrollPosition() {
    const pagePos = parseInt(sessionStorage.getItem("pageScrollPos"), 10);
    const wrapperPos = parseInt(sessionStorage.getItem("wrapperScrollPos"), 10);

    let attempts = 0;
    const timer = setInterval(() => {
        attempts++;

        if (pagePos) {
            window.scrollTo(0, pagePos);
        }

        const wrapper = document.querySelector(".table-wrapper");
        if (wrapper && wrapperPos) {
            wrapper.scrollTop = wrapperPos;
        }

        if (attempts > 25) {
            clearInterval(timer);
        }
    }, 100);
}

function createNavbar() {
    const navbarContainer = document.getElementById("navbar-container");
    if (!navbarContainer) return;

    const nav = document.createElement("nav");
    nav.className = "navbar";

    const ul = document.createElement("ul");
    ul.className = "nav-links";

    const tabs = [
        { id: "livetiming", label: "Live Timing" },
        { id: "calendar", label: "Calendar"},
        { id: "standings", label: "Standings" },
    ];

    tabs.forEach((tab, index) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = `nav-link ${index === 0 ? "active" : ""}`;
    btn.textContent = tab.label;
    btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-link").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        document.querySelectorAll(".tab-content").forEach(el => {
            el.style.display = "none";
        });
        const target = document.getElementById(tab.id);
        if (target) {
            target.style.display = "block";
            
            if (tab.id === "standings" && !window.standingsUI) {
                window.standingsUI = new StandingsUI("standings");
            }
        }
    });
    li.appendChild(btn);
    ul.appendChild(li);
});

    nav.appendChild(ul);

    const themeBtn = document.createElement("button");
    themeBtn.className = "theme-toggle-btn";
    const isLight = localStorage.getItem("theme") === "light";
    if (isLight) {
        document.body.classList.add("light-mode");
        themeBtn.textContent = "☾ Dark Mode";
    } else {
        themeBtn.textContent = "☀︎ Light Mode";
    }

    themeBtn.onclick = () => {
        document.body.classList.toggle("light-mode");
        const lightActive = document.body.classList.contains("light-mode");
        themeBtn.textContent = lightActive ? "☾ Dark Mode" : "☀ Light Mode";
        localStorage.setItem("theme", lightActive ? "light" : "dark");
        const sessionUI = window.f1Client?.ui?.sessionUI;
        if (sessionUI && sessionUI.baseMapLayer) {
            const themeName = lightActive ? "light" : "dark";
            sessionUI.baseMapLayer.setUrl(`/api/tiles/${themeName}/{z}/{x}/{y}`);
        }
    };

    nav.appendChild(themeBtn);
    navbarContainer.appendChild(nav);
}

function createLiveTimingLoader() {
    const loader = document.createElement("div");
    loader.id = "live-timing-loader";
    loader.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: Arial, sans-serif;
        transition: opacity .35s ease, visibility .35s ease;
    `;

    const content = document.createElement("div");
    content.style.cssText = `
        width: min(420px, 82vw);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 18px;
    `;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 500 260");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "220");
    svg.style.cssText = "overflow: visible;";

    const glow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    glow.setAttribute("fill", "none");
    glow.setAttribute("stroke", "rgba(255,24,1,.18)");
    glow.setAttribute("stroke-width", "18");
    glow.setAttribute("stroke-linecap", "round");
    glow.setAttribute("stroke-linejoin", "round");
    glow.style.filter = "blur(5px)";
    svg.appendChild(glow);

    const track = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
    );
    track.setAttribute("fill", "none");
    track.setAttribute("stroke", "#ff1801");
    track.setAttribute("stroke-width", "8");
    track.setAttribute("stroke-linecap", "round");
    track.setAttribute("stroke-linejoin", "round");
    track.style.filter = "drop-shadow(0 0 8px rgba(255,24,1,.55))";
    svg.appendChild(track);

    const dot = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
    );
    dot.setAttribute("r", "6");
    dot.setAttribute("fill", "#fff");
    dot.setAttribute("stroke", "#ff1801");
    dot.setAttribute("stroke-width", "3");
    svg.appendChild(dot);

    const title = document.createElement("div");
    title.style.cssText =
        "font-size:18px;font-weight:700;letter-spacing:.3px;text-align:center;";
    title.textContent = "Loading circuit…";

    const status = document.createElement("div");
    status.style.cssText =
        "font-size:13px;opacity:.65;text-align:center;min-height:18px;";
    status.textContent = "Connecting to live timing…";

    content.appendChild(svg);
    content.appendChild(title);
    content.appendChild(status);
    loader.appendChild(content);
    document.body.appendChild(loader);

    return {
        loader,
        svg,
        track,
        glow,
        dot,
        title,
        status,
        hide() {
            loader.style.opacity = "0";
            loader.style.visibility = "hidden";
            setTimeout(() => loader.remove(), 400);
        },
    };
}

function normalizeCircuitLocation(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function findLocalCircuit(circuits, sessionInfo) {
    const location = normalizeCircuitLocation(sessionInfo?.Meeting?.Location);
    const meeting = normalizeCircuitLocation(
        sessionInfo?.Meeting?.OfficialName || sessionInfo?.Meeting?.Name,
    );

    return (
        circuits.find((c) => {
            const cLocation = normalizeCircuitLocation(c.location);
            const cName = normalizeCircuitLocation(c.name);
            return (
                (location && cLocation === location) ||
                (meeting && cName && meeting.includes(cName)) ||
                (meeting && cLocation && meeting.includes(cLocation))
            );
        }) || null
    );
}

function extractLoaderCoordinates(geoJson) {
    const coordinates = [];

    const addLine = (line) => {
        if (!Array.isArray(line)) return;
        line.forEach((pair) => {
            if (
                Array.isArray(pair) &&
                pair.length >= 2 &&
                Number.isFinite(Number(pair[0])) &&
                Number.isFinite(Number(pair[1]))
            ) {
                coordinates.push([Number(pair[0]), Number(pair[1])]);
            }
        });
    };

    const walkGeometry = (geometry) => {
        if (!geometry) return;
        if (geometry.type === "LineString") addLine(geometry.coordinates);
        else if (geometry.type === "MultiLineString") {
            geometry.coordinates.forEach(addLine);
        } else if (geometry.type === "Polygon") {
            geometry.coordinates.forEach(addLine);
        } else if (geometry.type === "MultiPolygon") {
            geometry.coordinates.forEach((poly) => poly.forEach(addLine));
        }
    };

    if (geoJson?.type === "Feature") {
        walkGeometry(geoJson.geometry);
    } else if (geoJson?.type === "FeatureCollection") {
        geoJson.features?.forEach((feature) => walkGeometry(feature?.geometry));
    } else {
        walkGeometry(geoJson);
    }

    return coordinates;
}

function drawLoaderCircuit(loader, coordinates) {
    if (!loader || !coordinates || coordinates.length < 2) return false;

    if (typeof loader.stopAnimation === "function") {
        loader.stopAnimation();
    }

    const points = coordinates.map((c) =>
        Array.isArray(c) ? [c[0], c[1]] : [c.x, c.y],
    );

    let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

    points.forEach(([x, y]) => {
        if (
            typeof x !== "number" ||
            typeof y !== "number" ||
            isNaN(x) ||
            isNaN(y)
        )
            return;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    });

    if (
        !isFinite(minX) ||
        !isFinite(maxX) ||
        !isFinite(minY) ||
        !isFinite(maxY)
    )
        return false;

    const spanW = Math.max(maxX - minX, 1e-6);
    const spanH = Math.max(maxY - minY, 1e-6);
    const pad = 16;
    const viewW = 500;
    const viewH = 260;

    const scale = Math.min(
        (viewW - pad * 2) / spanW,
        (viewH - pad * 2) / spanH,
    );

    const scaledW = spanW * scale;
    const scaledH = spanH * scale;
    const xOffset = pad + (viewW - pad * 2 - scaledW) / 2;
    const yOffset = pad + (viewH - pad * 2 - scaledH) / 2;

    const project = ([x, y]) => [
        xOffset + (x - minX) * scale,
        yOffset + (maxY - y) * scale,
    ];

    const projected = points.map(project);
    let d = "";
    projected.forEach(([x, y], index) => {
        d += `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)} `;
    });

    if (loader.track) loader.track.setAttribute("d", d);
    if (loader.glow) loader.glow.setAttribute("d", d);

    if (!loader.dot || projected.length === 0) return false;

    let index = 0;
    let raf = null;

    const animate = () => {
        const [x, y] = projected[index];
        loader.dot.setAttribute("cx", x);
        loader.dot.setAttribute("cy", y);
        index = (index + 1) % projected.length;
        raf = requestAnimationFrame(animate);
    };

    animate();

    loader.stopAnimation = () => {
        if (raf) {
            cancelAnimationFrame(raf);
            raf = null;
        }
    };

    return true;
}

async function prepareLiveTimingPage() {
    const loader = createLiveTimingLoader();
    const loaderStartedAt = performance.now();
    const app = document.getElementById("livetiming");

    if (app) {
        app.style.visibility = "hidden";
        app.style.opacity = "0";
        app.style.transition = "opacity .25s ease";
    }

    try {
        loader.status.textContent = "Connecting to live timing…";

        window.f1Client = new F1LiveClient(null);
        const sessionInfo = await window.f1Client.sessionReadyPromise;

        loader.status.textContent = "Identifying circuit…";

        const circuitsResponse = await fetch("circuits.json", {
            cache: "no-cache",
        });
        if (!circuitsResponse.ok) {
            throw new Error(`circuits.json HTTP ${circuitsResponse.status}`);
        }

        const circuits = await circuitsResponse.json();
        const circuit = findLocalCircuit(circuits, sessionInfo);

        if (!circuit) {
            throw new Error(
                `Circuit not found for ${sessionInfo?.Meeting?.Location || "unknown location"}`,
            );
        }

        loader.title.textContent =
            circuit.name || circuit.location || "Loading circuit…";
        loader.status.textContent = "Loading local circuit…";

        const geoResponse = await fetch(`circuits/${circuit.id}.geojson`, {
            cache: "no-cache",
        });

        if (geoResponse.ok) {
            const geoJson = await geoResponse.json();
            drawLoaderCircuit(loader, extractLoaderCoordinates(geoJson));
        }

        loader.status.textContent = "Building live timing…";

        const ui = new F1LiveTimingUI("livetiming");
        await window.f1Client.setUI(ui);

        await ui.updateSession(sessionInfo);

        const elapsed = performance.now() - loaderStartedAt;
        
        if (elapsed < 2000) {
            await new Promise((resolve) => setTimeout(resolve, 2000 - elapsed));
        }

        if (app) {
            app.style.visibility = "visible";
            app.style.opacity = "1";
        }

        loader.status.textContent = "Ready";
        loader.stopAnimation?.();
        loader.hide();

        restoreScrollPosition();
    } catch (error) {
        loader.title.textContent = "Unable to load live timing";
        loader.status.textContent = error?.message || "Please reload the page.";

        if (app) {
            app.style.visibility = "hidden";
            app.style.opacity = "0";
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    createNavbar();
    prepareLiveTimingPage();
});