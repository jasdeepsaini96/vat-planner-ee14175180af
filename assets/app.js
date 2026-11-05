/* Station Scan Planner — static app for GitHub Pages.
   Data lives in /data: stations.json (Appendix A, read-only), status.json and plans.json
   (edited by committing to the repo), audit-log.csv (written by the audit workflow). */
"use strict";
const CFG = Object.assign({ repo: "", branch: "main" }, window.SSP_CONFIG || {});
const DFT_DESC = { A: "National hub", B: "Regional interchange", C: "Important feeder", D: "Medium staffed", E: "Small staffed", F: "Small station" };
const SF_DESC = { A: "Compliant step-free access to all platforms", B1: "Partial step-free (category B1)", B2: "Partial step-free (category B2)", B3: "Partial step-free (category B3)", C: "No compliant step-free access" };
const STATUSES = [["none", "Not scanned"], ["planned", "Planned"], ["scanned", "Scanned"], ["accepted", "Accepted / live"], ["hold", "On hold"]];
const SLABEL = Object.fromEntries(STATUSES);
const MONTHS = ["2027-03", "2027-04", "2027-05", "2027-06", "2027-07", "2027-08", "2027-09", "2027-10"];
const MONTH_NAME = { "2027-03": "Mar", "2027-04": "Apr", "2027-05": "May", "2027-06": "Jun", "2027-07": "Jul", "2027-08": "Aug", "2027-09": "Sep", "2027-10": "Oct" };
const TARGET_CUM = { "2027-03": 25, "2027-04": 60, "2027-05": 100, "2027-06": 130, "2027-07": 160, "2027-08": 190, "2027-09": 220, "2027-10": 250 };
const MONTH_COL = ["#e8b04b", "#d9862f", "#c45a2c", "#9c3b4f", "#6f3a73", "#3f4d8f", "#2b77a8", "#2a9d8f"];
const DFT_COL = { A: "#5b2a86", B: "#8a4fb5", C: "#2b77a8", D: "#2a9d8f", E: "#7fb069", F: "#b5c99a" };
const BANK_HOLS = new Set(["2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28"]);
const DEFAULTS = { dA: 2, dB: 1.25, dC: 1, dD: 0.5, dE: 0.5, dF: 0.5, dayLen: 9, onsite: 7, mph: 35, road: 1.25, hop: 0.25, crew: 2, rate: 180, subs: 30, hotel: 100, fuel: 30, park: 15 };
const ASSUME_LABELS = [["dA", "Scan days · Cat A"], ["dB", "Scan days · Cat B"], ["dC", "Scan days · Cat C"], ["dD", "Scan days · Cat D"], ["dE", "Scan days · Cat E"], ["dF", "Scan days · Cat F"], ["dayLen", "Working day incl. driving (h)"], ["onsite", "On-site hours per scan day"], ["mph", "Average road speed (mph)"], ["road", "Road distance factor"], ["hop", "Park & set-up per stop (h)"], ["crew", "People per team"], ["rate", "Day rate per person (£)"], ["subs", "Subsistence per person/day (£)"], ["hotel", "Hotel per person/night (£)"], ["fuel", "Fuel per van/day (£)"], ["park", "Parking per station-day (£)"]];
const FIXED_KIT = 104000; // 2 scanners £80k, 2 vehicles £20k, insurance £4k
const MODEL_TOTAL = 306700;
const RAD = { A: 7.5, B: 6.5, C: 5.5, D: 4.5, E: 4.5, F: 4.5 };

const ls = { get(k, d) { try { const v = localStorage.getItem("ssp:" + k); return v == null ? d : JSON.parse(v) } catch (e) { return d } }, set(k, v) { try { localStorage.setItem("ssp:" + k, JSON.stringify(v)) } catch (e) { } } };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const gbp = n => "£" + Math.round(n).toLocaleString("en-GB");
const fmt = n => Math.round(n).toLocaleString("en-GB");
function toast(m) { const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2600) }

let ST = [], BY = {};
let A = Object.assign({}, DEFAULTS, ls.get("assume", {}));
let saved = {};                      // status.json as committed
let pending = ls.get("pending", {}); // tlc -> full record, not yet committed
let savedPlans = [];                 // plans.json as committed
let pendingPlans = ls.get("pendingPlans", { add: [], del: [] });
let audit = [];
let route = ls.get("route", []);
let teams = ls.get("teams", 1), mode = ls.get("mode", "cheap");
let colourBy = "status", prog = null, routeRes = null;
const filt = { status: new Set(STATUSES.map(s => s[0])), cat: new Set(Object.keys(DFT_DESC)), toc: "", q: "", onlyRoute: false };

const rec = t => pending[t] || saved[t] || null;
const stOf = t => (rec(t) && rec(t).s) || "none";
const scanDays = t => A["d" + BY[t].dft] ?? 1;

/* ---------- repo location ---------- */
function repoInfo() {
  let repo = CFG.repo;
  if (!repo && location.hostname.endsWith(".github.io")) {
    const owner = location.hostname.split(".")[0];
    const seg = location.pathname.split("/").filter(Boolean)[0];
    repo = seg && !/\.html?$/i.test(seg) ? `${owner}/${seg}` : `${owner}/${owner}.github.io`;
  }
  return repo ? { repo, branch: CFG.branch || "main", base: `https://github.com/${repo}` } : null;
}

/* ---------- geometry & calendar ---------- */
function hav(a, b) { const R = 3958.8, r = Math.PI / 180; const dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)) }
function drive(a, b) { if (a === b) return { mi: 0, h: 0 }; const mi = hav(BY[a], BY[b]) * A.road; return { mi, h: A.hop + mi / A.mph } }
const iso = d => d.toISOString().slice(0, 10);
const parse = s => new Date(s + "T00:00:00Z");
function isWork(d) { const w = d.getUTCDay(); return w !== 0 && w !== 6 && !BANK_HOLS.has(iso(d)) }
function nextWork(d) { const n = new Date(d); do { n.setUTCDate(n.getUTCDate() + 1) } while (!isWork(n)); return n }
function firstWork(d) { const n = new Date(d); while (!isWork(n)) n.setUTCDate(n.getUTCDate() + 1); return n }
const niceDate = s => parse(s).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const shortDate = s => parse(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const stamp = s => { const d = new Date(s); return isNaN(d) ? s : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) };

/* ---------- route optimisation ---------- */
function tour(base, tlcs) {
  const nodes = [base, ...tlcs.filter(t => t !== base)], n = nodes.length;
  if (n <= 2) return nodes.slice(1);
  const D = nodes.map(a => nodes.map(b => a === b ? 0 : hav(BY[a], BY[b])));
  const used = new Array(n).fill(false), ord = [0]; used[0] = true;
  for (let k = 1; k < n; k++) { const l = ord[ord.length - 1]; let bi = -1, bd = 1e9; for (let j = 1; j < n; j++) if (!used[j] && D[l][j] < bd) { bd = D[l][j]; bi = j } ord.push(bi); used[bi] = true }
  ord.push(0);
  let improved = true, guard = 0;
  while (improved && guard++ < 60) {
    improved = false;
    for (let i = 1; i < ord.length - 2; i++) for (let j = i + 1; j < ord.length - 1; j++) {
      const a = ord[i - 1], b = ord[i], c = ord[j], d = ord[j + 1];
      if (D[a][c] + D[b][d] < D[a][b] + D[c][d] - 1e-9) { ord.splice(i, j - i + 1, ...ord.slice(i, j + 1).reverse()); improved = true }
    }
    for (let i = 1; i < ord.length - 1; i++) {
      const p = ord[i - 1], x = ord[i], q = ord[i + 1]; const gain = D[p][x] + D[x][q] - D[p][q];
      let bj = -1, bc = gain - 1e-9;
      for (let j = 0; j < ord.length - 1; j++) { if (j === i || j === i - 1) continue; const u = ord[j], v = ord[j + 1]; const c = D[u][x] + D[x][v] - D[u][v]; if (c < bc) { bc = c; bj = j } }
      if (bj >= 0) { ord.splice(i, 1); const k = bj < i ? bj + 1 : bj; ord.splice(k, 0, x); improved = true }
    }
  }
  return ord.slice(1, -1).map(i => nodes[i]);
}
function simulate(order, base, start, homeH) {
  const days = []; let date = firstWork(parse(start)), loc = base, t = 0, hotels = 0, cur;
  const newDay = () => { cur = { date: iso(date), from: loc, stops: [], pts: [loc], miles: 0, driveH: 0, onsiteH: 0, night: null }; t = 0 };
  const go = to => { const d = drive(loc, to); t += d.h; cur.miles += d.mi; cur.driveH += d.h; loc = to; if (cur.pts[cur.pts.length - 1] !== to) cur.pts.push(to) };
  const endDay = final => {
    const nx = nextWork(date); const gap = (nx - date) / 864e5 > 1; const hd = drive(loc, base);
    if (final || gap || hd.h <= homeH) { cur.night = "home"; if (loc !== base) go(base) } else { cur.night = "hotel"; cur.nightAt = loc; hotels++ }
    days.push(cur); date = nx; newDay()
  };
  newDay();
  for (const s of order) {
    let need = scanDays(s) * A.onsite;
    if (t > 0 && t + drive(loc, s).h + Math.min(need, 1.5) > A.dayLen) endDay(false);
    go(s);
    while (need > 1e-6) {
      const av = A.dayLen - t; if (av < 0.5) { endDay(false); go(s); continue }
      const u = Math.min(av, need); need -= u; t += u; cur.onsiteH += u; cur.stops.push({ tlc: s, h: u, done: need <= 1e-6 })
    }
  }
  if (cur.stops.length || cur.pts.length > 1) endDay(true);
  const nDays = days.length, miles = days.reduce((a, d) => a + d.miles, 0);
  const parkDays = order.reduce((a, s) => a + Math.max(1, Math.ceil(scanDays(s))), 0);
  const cost = { staff: nDays * A.crew * A.rate, subs: nDays * A.crew * A.subs, fuel: nDays * A.fuel, hotel: hotels * A.crew * A.hotel, park: parkDays * A.park };
  cost.total = cost.staff + cost.subs + cost.fuel + cost.hotel + cost.park;
  const done = {}; days.forEach(d => d.stops.forEach(x => { if (x.done) done[x.tlc] = d.date }));
  return { days, nDays, hotels, miles, cost, done, order, base, homeH, finish: days.length ? days[days.length - 1].date : start };
}
function bestPlan(base, tlcs, start, m) {
  if (!tlcs.length) return null;
  const o = tour(base, tlcs), cands = []; if (tlcs.includes(base)) o.unshift(base);
  for (const ord of [o, o.slice().reverse()]) for (const h of [0, 0.5, 0.75, 1, 1.25, 1.5]) cands.push(simulate(ord, base, start, h));
  const fast = cands.slice().sort((a, b) => a.nDays - b.nDays || a.cost.total - b.cost.total)[0];
  const cheap = cands.slice().sort((a, b) => a.cost.total - b.cost.total || a.nDays - b.nDays)[0];
  return { fast, cheap, pick: m === "fast" ? fast : cheap, other: m === "fast" ? cheap : fast };
}
function splitTeams(tlcs, b1, b2) {
  let c = [{ lat: BY[b1].lat, lon: BY[b1].lon }, { lat: BY[b2].lat, lon: BY[b2].lon }], asg = {};
  if (hav(c[0], c[1]) < 5 && tlcs.length > 1) {
    const far = (from, list) => list.reduce((a, t) => hav(BY[t], from) > hav(BY[a], from) ? t : a, list[0]);
    const s1 = far(c[0], tlcs), s2 = far(BY[s1], tlcs);
    c = [{ lat: BY[s1].lat, lon: BY[s1].lon }, { lat: BY[s2].lat, lon: BY[s2].lon }];
  }
  const w = t => scanDays(t);
  for (let it = 0; it < 6; it++) {
    tlcs.forEach(t => { asg[t] = hav(BY[t], c[0]) <= hav(BY[t], c[1]) ? 0 : 1 });
    for (const k of [0, 1]) { const m = tlcs.filter(t => asg[t] === k); if (m.length) c[k] = { lat: m.reduce((a, t) => a + BY[t].lat, 0) / m.length, lon: m.reduce((a, t) => a + BY[t].lon, 0) / m.length } }
  }
  const tot = tlcs.reduce((a, t) => a + w(t), 0);
  for (let g = 0; g < 600; g++) {
    const W = [0, 0]; tlcs.forEach(t => W[asg[t]] += w(t)); const h = W[0] > W[1] ? 0 : 1, o = 1 - h;
    if (Math.abs(W[0] - W[1]) <= Math.max(0.03 * tot, 1)) break;
    let bt = null, bd = 1e9; tlcs.forEach(t => { if (asg[t] !== h) return; const d = hav(BY[t], c[o]) - hav(BY[t], c[h]); if (d < bd && w(t) < Math.abs(W[0] - W[1])) { bd = d; bt = t } });
    if (!bt) break; asg[bt] = o;
  }
  return [tlcs.filter(t => asg[t] === 0), tlcs.filter(t => asg[t] === 1)];
}

/* ---------- map ---------- */
const dark = matchMedia("(prefers-color-scheme: dark)");
/* Britain-only base map drawn from data/gb-map.json (Natural Earth, public domain):
   no outside map services, so nothing can fail to load and no other country is shown. */
const GB_BOUNDS = L.latLngBounds([[49.7, -8.8], [61.0, 2.2]]);
const map = L.map("map", { zoomSnap: 0.5, minZoom: 5, maxZoom: 16, maxBounds: GB_BOUNDS.pad(0.15), maxBoundsViscosity: 0.8 });
map.fitBounds([[50.0, -5.8], [57.6, 1.8]]);
map.attributionControl.setPrefix(false);
map.attributionControl.addAttribution("Coastline &amp; railways: Natural Earth");
const baseRenderer = L.canvas({ padding: 0.3 });
const landLayer = L.layerGroup().addTo(map), railLayer = L.layerGroup();
const MAP_STYLES = {
  sea: { name: "Sea blue", sea: "#a8d1ec", land: "#f6f4ee", coast: "#7eaecd", rail: "#444b55" },
  ordnance: { name: "Survey", sea: "#d4ecfa", land: "#ffffff", coast: "#8ec3e3", rail: "#1a1a1a" },
  atlas: { name: "Atlas", sea: "#86bddf", land: "#efe7d4", coast: "#5f97bf", rail: "#6a4e3b" },
  grey: { name: "Light grey", sea: "#cfdbe2", land: "#eef0ec", coast: "#a9b4ac", rail: "#3d4852" },
  night: { name: "Night", sea: "#0b2338", land: "#1d2830", coast: "#2c4f6b", rail: "#9fb6c8" }
};
let mapStyle = ls.get("mapStyle", "auto");
const curStyle = () => MAP_STYLES[mapStyle] || (dark.matches ? MAP_STYLES.night : MAP_STYLES.sea);
let GEO = null;
const railWeight = () => { const z = map.getZoom(); return z < 7 ? 0.8 : z < 9 ? 1.1 : z < 11 ? 1.5 : 2 };
function drawBase() {
  const S = curStyle(); map.getContainer().style.background = S.sea;
  if (!GEO) return;
  landLayer.clearLayers(); railLayer.clearLayers();
  L.polygon(GEO.land.map(r => r.map(([x, y]) => [y, x])), { renderer: baseRenderer, interactive: false, color: S.coast, weight: 0.8, fillColor: S.land, fillOpacity: 1 }).addTo(landLayer);
  L.polyline(GEO.rail.map(l => l.map(([x, y]) => [y, x])), { renderer: baseRenderer, interactive: false, color: S.rail, weight: railWeight(), opacity: 0.9, lineJoin: "round" }).addTo(railLayer);
}
dark.addEventListener("change", () => { drawBase(); styleMarkers(); drawRoute() });
$("mapStyle").innerHTML = `<option value="auto">Automatic (Sea blue / Night in dark mode)</option>` + Object.entries(MAP_STYLES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
$("mapStyle").value = MAP_STYLES[mapStyle] ? mapStyle : "auto";
$("mapStyle").onchange = e => { mapStyle = e.target.value; ls.set("mapStyle", mapStyle); drawBase() };
drawBase();
map.on("zoomend", () => railLayer.eachLayer(l => l.setStyle({ weight: railWeight() })));
if (ls.get("showRail", true)) railLayer.addTo(map);
$("showRail").checked = ls.get("showRail", true);
$("showRail").onchange = e => { ls.set("showRail", e.target.checked); e.target.checked ? railLayer.addTo(map) : railLayer.remove() };
fetch("data/gb-map.json").then(r => r.json()).then(g => { GEO = g; drawBase() }).catch(() => { });
$("showNames").checked = ls.get("showNames", true);
$("showNames").onchange = e => { ls.set("showNames", e.target.checked); placeLabels() };

map.createPane("labels"); map.getPane("labels").style.zIndex = 620;
const routeLayer = L.layerGroup().addTo(map), labelLayer = L.layerGroup().addTo(map);
const markers = {};
function colourFor(t) {
  if (colourBy === "status") return css("--st-" + stOf(t));
  if (colourBy === "dft") return DFT_COL[BY[t].dft];
  if (colourBy === "month") { if (!prog) return css("--st-none"); const d = prog.dates[t]; if (!d) return css("--st-none"); const i = MONTHS.indexOf(d.slice(0, 7)); return i < 0 ? css("--bad") : MONTH_COL[i] }
  if (colourBy === "team") { if (!prog) return css("--st-none"); return css(prog.team[t] === 0 ? "--team1" : "--team2") }
}
function visible(s) {
  if (!filt.status.has(stOf(s.tlc))) return false;
  if (!filt.cat.has(s.dft)) return false;
  if (filt.toc && s.toc !== filt.toc) return false;
  if (filt.onlyRoute && !route.includes(s.tlc)) return false;
  if (filt.q) { const q = filt.q.toLowerCase(); if (!(s.name.toLowerCase().includes(q) || s.tlc.toLowerCase().includes(q) || s.toc.toLowerCase().includes(q))) return false }
  return true;
}
function styleMarkers() {
  const inR = new Set(route), ink = css("--ink"), panel = css("--panel");
  ST.forEach(s => {
    const m = markers[s.tlc], v = visible(s), c = colourFor(s.tlc), r = RAD[s.dft], sel = inR.has(s.tlc);
    const hollow = colourBy === "status" && stOf(s.tlc) === "none";
    m.setStyle({ radius: sel ? r + 2 : r, color: sel ? ink : (hollow ? c : panel), weight: sel ? 2.5 : (hollow ? 2 : 1.2), fillColor: hollow ? panel : c, fillOpacity: 1, opacity: 1 });
    if (v) m.addTo(map); else m.remove();
  });
  placeLabels(); legend();
}

/* Name cards: every visible station gets a card where one fits.
   Priority: stations in the route, then DfT category A→F, then footfall.
   Each card tries right, left, above, below its dot and is skipped if it would
   overlap another card or another station's dot. Recomputed on every pan/zoom. */
const measureCtx = document.createElement("canvas").getContext("2d");
function textW(s) { measureCtx.font = '600 12px "Source Sans 3", "Segoe UI", Arial, sans-serif'; return measureCtx.measureText(s).width }
function placeLabels() {
  labelLayer.clearLayers();
  if (!$("showNames").checked || !ST.length) return;
  const size = map.getSize(), inR = new Set(route), z = map.getZoom();
  const vis = ST.filter(visible).map(s => ({ s, p: map.latLngToContainerPoint([s.lat, s.lon]) }))
    .filter(o => o.p.x > -40 && o.p.y > -40 && o.p.x < size.x + 40 && o.p.y < size.y + 40);
  const dots = vis.map(o => { const r = RAD[o.s.dft] + (inR.has(o.s.tlc) ? 3 : 1); return { o, x1: o.p.x - r, y1: o.p.y - r, x2: o.p.x + r, y2: o.p.y + r } });
  const order = vis.slice().sort((a, b) => (inR.has(b.s.tlc) - inR.has(a.s.tlc)) || a.s.dft.localeCompare(b.s.dft) || (b.s.footfall - a.s.footfall));
  const mr = map.getContainer().getBoundingClientRect();
  const placed = [...document.querySelectorAll(".mapwrap .float:not([hidden])")].map(el => { const r = el.getBoundingClientRect(); return { x1: r.left - mr.left, y1: r.top - mr.top, x2: r.right - mr.left, y2: r.bottom - mr.top } }).filter(r => r.x2 > r.x1);
  if (BY.OFFICE) { const q = map.latLngToContainerPoint([BY.OFFICE.lat, BY.OFFICE.lon]); placed.push({ x1: q.x - 18, y1: q.y - 13, x2: q.x + 18, y2: q.y + 13 }) }
  const ov = (a, b) => a.x1 < b.x2 + 2 && a.x2 + 2 > b.x1 && a.y1 < b.y2 + 1 && a.y2 + 1 > b.y1;
  const short = z < 7.5; // at national view, use TLC-free compact names to fit more
  for (const o of order) {
    const name = o.s.name, w = Math.ceil(textW(name) + (short ? 14 : 44)), h = 20, r = RAD[o.s.dft] + 4;
    const opts = [[r, -h / 2], [-r - w, -h / 2], [-w / 2, -r - h], [-w / 2, r]];
    for (const [dx, dy] of opts) {
      const b = { x1: o.p.x + dx, y1: o.p.y + dy, x2: o.p.x + dx + w, y2: o.p.y + dy + h };
      if (b.x1 < 4 || b.y1 < 4 || b.x2 > size.x - 4 || b.y2 > size.y - 4) continue;
      if (placed.some(q => ov(q, b))) continue;
      if (dots.some(d => d.o !== o && ov(d, b))) continue;
      placed.push(b);
      const html = short ? esc(name) : `<span class="tlc">${o.s.tlc}</span>${esc(name)}`;
      L.marker([o.s.lat, o.s.lon], { pane: "labels", keyboard: false, icon: L.divIcon({ className: "name-card" + (inR.has(o.s.tlc) ? " in-route" : ""), html, iconSize: [w, h], iconAnchor: [-dx, -dy] }) })
        .on("click", e => { if (e.originalEvent.shiftKey) toggleRoute(o.s.tlc); else showDetail(o.s.tlc) }).addTo(labelLayer);
      break;
    }
  }
}
map.on("moveend zoomend resize", placeLabels);

function legend() {
  let items = [];
  if (colourBy === "status") items = STATUSES.map(([k, l]) => [css("--st-" + k), l, ST.filter(s => stOf(s.tlc) === k).length, k === "none"]);
  if (colourBy === "dft") items = Object.keys(DFT_DESC).map(k => [DFT_COL[k], `${k} · ${DFT_DESC[k]}`, ST.filter(s => s.dft === k).length]);
  if (colourBy === "month") { if (!prog) items = [[css("--st-none"), "Build the programme first", ""]]; else { items = MONTHS.map((m, i) => [MONTH_COL[i], MONTH_NAME[m] + " 2027", prog.byMonth[m] || 0]); if (prog.byMonth.later) items.push([css("--bad"), "After October", prog.byMonth.later]) } }
  if (colourBy === "team") { if (!prog) items = [[css("--st-none"), "Build the programme first", ""]]; else items = [[css("--team1"), "Team 1 · " + BY[prog.b1].name, prog.t1.length], [css("--team2"), "Team 2 · " + BY[prog.b2].name, prog.t2.length]] }
  $("legendItems").innerHTML = items.map(([c, l, n, h]) => `<div><i style="${h ? `border:2px solid ${c};background:var(--panel)` : `background:${c}`}"></i><span class="grow">${esc(l)}</span><span class="sub">${n}</span></div>`).join("") + `<div class="sub">Ring = in route · size = DfT category</div>`;
}
$("colourBy").onchange = e => { colourBy = e.target.value; if ((colourBy === "month" || colourBy === "team") && !prog) buildProgramme(); styleMarkers() };

/* ---------- header ---------- */
function renderCounts() {
  const n = k => ST.filter(s => stOf(s.tlc) === k).length;
  $("stack").innerHTML = STATUSES.filter(([k]) => k !== "none").map(([k]) => `<span style="width:${n(k) / 2.5}%;background:var(--st-${k})"></span>`).join("");
  const done = n("scanned") + n("accepted");
  $("counts").innerHTML = STATUSES.map(([k, l]) => `<span><i style="background:var(--st-${k})"></i>${l} <b>${n(k)}</b></span>`).join("") + `<span>Tranche 1 <b>${Math.min(done, 100)}/100</b></span>`;
  const np = Object.keys(pending).length + pendingPlans.add.length + pendingPlans.del.length;
  $("pending").hidden = !np;
  $("pendingText").textContent = `${np} unsaved change${np === 1 ? "" : "s"} in this browser`;
}

/* ---------- stations tab ---------- */
function renderFilters() {
  $("fStatus").innerHTML = STATUSES.map(([k, l]) => `<button class="chip" data-k="${k}" aria-pressed="${filt.status.has(k)}"><i style="background:var(--st-${k})"></i>${l}</button>`).join("");
  $("fCat").innerHTML = Object.keys(DFT_DESC).map(k => `<button class="chip" data-k="${k}" aria-pressed="${filt.cat.has(k)}" title="${DFT_DESC[k]}"><i style="background:${DFT_COL[k]}"></i>${k} <span class="sub">${ST.filter(s => s.dft === k).length}</span></button>`).join("");
  const tocs = [...new Set(ST.map(s => s.toc))].sort();
  $("fToc").innerHTML = `<option value="">All operators</option>` + tocs.map(t => `<option>${esc(t)}</option>`).join("");
}
$("fStatus").onclick = e => { const b = e.target.closest(".chip"); if (!b) return; const k = b.dataset.k; filt.status.has(k) ? filt.status.delete(k) : filt.status.add(k); b.setAttribute("aria-pressed", filt.status.has(k)); refresh() };
$("fCat").onclick = e => { const b = e.target.closest(".chip"); if (!b) return; const k = b.dataset.k; filt.cat.has(k) ? filt.cat.delete(k) : filt.cat.add(k); b.setAttribute("aria-pressed", filt.cat.has(k)); refresh() };
$("fToc").onchange = e => { filt.toc = e.target.value; refresh() };
$("q").oninput = e => { filt.q = e.target.value.trim(); refresh() };
$("fOnlyRoute").onchange = e => { filt.onlyRoute = e.target.checked; refresh() };
function renderList() {
  const vis = ST.filter(visible).sort((a, b) => a.name.localeCompare(b.name)); const inR = new Set(route);
  $("shownN").textContent = `${vis.length} of ${ST.length} shown`;
  $("list").innerHTML = vis.map(s => { const k = stOf(s.tlc); return `<div class="item" data-t="${s.tlc}"><input type="checkbox" aria-label="Include ${esc(s.name)} in route" ${inR.has(s.tlc) ? "checked" : ""}><span class="tlc">${s.tlc}</span><span class="nm">${esc(s.name)} <span class="sub">${esc(s.toc)}</span>${pending[s.tlc] ? ' <span class="sub" title="Not yet saved to GitHub">•unsaved</span>' : ""}</span><span class="cat">${s.dft}</span><span class="pill" style="color:var(--st-${k})">${SLABEL[k]}</span></div>` }).join("") || `<div class="item"><span class="hint">No stations match these filters.</span></div>`;
}
$("list").onclick = e => { const it = e.target.closest(".item"); if (!it || !it.dataset.t) return; if (e.target.type === "checkbox") { toggleRoute(it.dataset.t); return } showDetail(it.dataset.t, true) };
$("addShown").onclick = () => { const v = ST.filter(visible).map(s => s.tlc); let n = 0; v.forEach(t => { if (!route.includes(t)) { route.push(t); n++ } }); saveRoute(); toast(`Added ${n} stations to route`) };

/* ---------- station card ---------- */
let detailT = null;
function showDetail(t, fly) {
  detailT = t; const s = BY[t], st = rec(t) || {}, k = stOf(t), inR = route.includes(t);
  if (fly) map.flyTo([s.lat, s.lon], Math.max(map.getZoom(), 12), { duration: .6 });
  const hist = audit.filter(a => a.station === t).slice(0, 6);
  const el = $("detail"); el.hidden = false;
  el.innerHTML = `<button class="x" id="dx" aria-label="Close">×</button>
  <div class="row"><span class="tlc">${s.tlc}</span><span class="sub">${esc(s.toc)}</span>${pending[t] ? '<span class="pill" style="color:var(--st-hold)">Unsaved</span>' : ""}</div>
  <h2>${esc(s.name)}</h2>
  <div class="sub">DfT ${s.dft} · ${DFT_DESC[s.dft]} · step-free ${s.stepFree}: ${SF_DESC[s.stepFree] || ""}</div>
  <div class="kv">
    <div><b>${(s.footfall / 1e6).toFixed(s.footfall >= 1e7 ? 0 : 1)}m</b><span>footfall 24/25</span></div>
    <div><b>${s.auditAssets}</b><span>audit assets</span></div>
    <div><b>${scanDays(t)}</b><span>scan days (est.)</span></div>
    <div><b>${s.platformFaces}</b><span>platform faces</span></div>
    <div><b>${s.lifts} / ${s.escalators}</b><span>lifts / escalators</span></div>
    <div><b>${s.toilets} / ${s.waitingRooms}</b><span>toilets / waiting rms</span></div>
  </div>
  <div><div class="lbl">Status</div><div class="status-btns" id="sb">${STATUSES.map(([kk, l]) => `<button data-s="${kk}" aria-pressed="${kk === k}"><i style="background:var(--st-${kk})"></i>${l}</button>`).join("")}</div></div>
  <div class="row" ${k === "scanned" || k === "accepted" ? "" : "hidden"}><span class="lbl grow">Scanned on</span><input type="date" id="dDate" value="${esc(st.d || "")}"></div>
  <div><label class="lbl" for="dNote">Notes (access, contacts, constraints)</label><textarea id="dNote" placeholder="e.g. Night access only, contact station manager 48h ahead">${esc(st.note || "")}</textarea></div>
  ${prog && prog.dates[t] ? `<div class="sub">Programme: Team ${prog.team[t] + 1}, scanned ${niceDate(prog.dates[t])}</div>` : ""}
  <div class="row"><button class="btn ${inR ? "" : "primary"}" id="dRoute">${inR ? "Remove from route" : "Add to route"}</button>
  <button class="btn" id="dNear">Add nearby</button><input type="number" id="dNearMi" value="${ls.get("nearMi", 15)}" min="1" max="200" style="width:64px" aria-label="Radius in miles"><span class="sub">miles</span></div>
  <div><div class="lbl">Change history</div>${hist.length ? `<table class="hist">${hist.map(a => `<tr><td class="when">${esc(stamp(a.time))}</td><td>${esc(a.field)}: <s>${esc(a.old || "—")}</s> → ${esc(a.new || "—")}<div class="sub">${esc(a.author)}${a.declared_by && a.declared_by !== a.author ? " for " + esc(a.declared_by) : ""}</div></td></tr>`).join("")}</table>` : `<div class="sub">No committed changes yet.</div>`}</div>`;
  $("dx").onclick = () => { el.hidden = true; detailT = null; placeLabels() };
  placeLabels();
  $("sb").onclick = e => { const b = e.target.closest("button"); if (b) setStatus([t], b.dataset.s) };
  const dd = $("dDate"); if (dd) dd.onchange = () => edit(t, { d: dd.value || null });
  $("dNote").onchange = e => edit(t, { note: e.target.value.trim() });
  $("dRoute").onclick = () => { toggleRoute(t); showDetail(t) };
  $("dNear").onclick = () => { const mi = +$("dNearMi").value || 15; ls.set("nearMi", mi); const near = ST.filter(x => hav(x, s) <= mi && visible(x)).map(x => x.tlc); let n = 0; near.forEach(x => { if (!route.includes(x)) { route.push(x); n++ } }); saveRoute(); toast(`Added ${n} station${n === 1 ? "" : "s"} within ${mi} miles`); showDetail(t) };
}

/* ---------- edits (kept in this browser until committed) ---------- */
function same(a, b) { a = a || {}; b = b || {}; return (a.s || "none") === (b.s || "none") && (a.d || null) === (b.d || null) && (a.note || "") === (b.note || "") }
function edit(t, patch) {
  const body = Object.assign({ s: "none", d: null, note: "" }, rec(t) || {}, patch, { at: new Date().toISOString() });
  if (same(body, saved[t])) delete pending[t]; else pending[t] = body;
  ls.set("pending", pending); refresh();
}
function setStatus(tlcs, s) {
  const today = iso(new Date());
  tlcs.forEach(t => { const p = rec(t) || {}; edit(t, { s, d: (s === "scanned" || s === "accepted") ? (p.d || today) : null }) });
  if (detailT && tlcs.includes(detailT)) showDetail(detailT);
  if (tlcs.length > 1) toast(`${tlcs.length} stations set to ${SLABEL[s]}`);
}
$("discard").onclick = e => {
  if (e.target.dataset.confirm !== "1") { e.target.dataset.confirm = "1"; e.target.textContent = "Confirm discard"; setTimeout(() => { e.target.dataset.confirm = ""; e.target.textContent = "Discard" }, 4000); return }
  pending = {}; pendingPlans = { add: [], del: [] }; ls.set("pending", pending); ls.set("pendingPlans", pendingPlans);
  e.target.dataset.confirm = ""; e.target.textContent = "Discard"; refresh(); renderPlans(); if (detailT) showDetail(detailT); toast("Unsaved changes discarded");
};

/* ---------- save to GitHub ---------- */
function statusText(obj) {
  const keys = Object.keys(obj).sort();
  return "{\n" + keys.map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(obj[k])}`).join(",\n") + (keys.length ? "\n" : "") + "}\n";
}
function plansText(arr) { return "[\n" + arr.map(p => "  " + JSON.stringify(p)).join(",\n") + (arr.length ? "\n" : "") + "]\n" }
async function fetchJSON(path) { const r = await fetch(path + "?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) throw new Error(path + " " + r.status); return r.json() }
let saveFiles = null;
async function openSave() {
  const me = ls.get("myName", "");
  $("myName").value = me;
  $("saveNote").textContent = "Fetching the latest committed data…";
  $("saveModal").hidden = false;
  let latest = saved, latestPlans = savedPlans;
  try { latest = await fetchJSON("data/status.json"); latestPlans = await fetchJSON("data/plans.json") } catch (e) { }
  $("saveNote").textContent = "";
  buildSave(latest, latestPlans);
}
function buildSave(latest, latestPlans) {
  const me = $("myName").value.trim();
  const merged = Object.assign({}, latest), changes = [];
  Object.entries(pending).forEach(([t, v]) => {
    const old = latest[t] || {}; const nv = Object.assign({}, v); if (me) nv.by = me;
    if (nv.s === "none" && !nv.note && !nv.d) delete merged[t]; else merged[t] = nv;
    const parts = [];
    if ((old.s || "none") !== nv.s) parts.push(`${SLABEL[old.s || "none"]} → ${SLABEL[nv.s]}`);
    if ((old.d || null) !== (nv.d || null)) parts.push(`date ${nv.d || "cleared"}`);
    if ((old.note || "") !== (nv.note || "")) parts.push("note updated");
    changes.push({ t, text: parts.join(", ") || "no change" });
  });
  const keep = latestPlans.filter(p => !pendingPlans.del.includes(p.id));
  const plansOut = keep.concat(pendingPlans.add.map(p => Object.assign({}, p, me ? { by: me } : {})));
  const planChanges = pendingPlans.add.map(p => `Add plan “${p.name}”`).concat(pendingPlans.del.map(id => { const p = latestPlans.find(x => x.id === id); return `Delete plan “${p ? p.name : id}”` }));
  saveFiles = [];
  if (changes.length) saveFiles.push({ path: "data/status.json", text: statusText(merged) });
  if (planChanges.length) saveFiles.push({ path: "data/plans.json", text: plansText(plansOut) });
  $("saveSummary").innerHTML = changes.map(c => `<div class="chg"><span class="tlc">${c.t}</span>${esc(BY[c.t] ? BY[c.t].name : "")} <span class="sub">${esc(c.text)}</span></div>`).join("") + planChanges.map(p => `<div class="chg">${esc(p)}</div>`).join("");
  const auto = (changes.length ? `Status: ${changes.slice(0, 4).map(c => `${c.t} ${pending[c.t].s}`).join(", ")}${changes.length > 4 ? ` (+${changes.length - 4} more)` : ""}` : "") + (planChanges.length ? (changes.length ? "; " : "") + planChanges.join("; ") : "");
  if (!$("commitMsg").dataset.touched) $("commitMsg").value = auto;
  const ri = repoInfo();
  $("saveFiles").innerHTML = saveFiles.map((f, i) => `<div class="filebox"><div class="row"><code class="grow">${f.path}</code>
    <button class="btn sm primary" data-copy="${i}">Copy contents</button><button class="btn sm" data-dl="${i}">Download</button></div>
    <div class="row">${ri ? `<a href="${ri.base}/edit/${ri.branch}/${f.path}" target="_blank" rel="noopener">Open ${f.path.split("/")[1]} on GitHub to edit</a><span class="sub">·</span><a href="${ri.base}/upload/${ri.branch}/data" target="_blank" rel="noopener">Upload files to data/</a>` : `<span class="warn">Set <code>repo</code> in config.js so these links point at your repository.</span>`}</div></div>`).join("");
}
$("openSave").onclick = openSave;
$("saveX").onclick = () => { $("saveModal").hidden = true };
$("saveModal").onclick = e => { if (e.target.id === "saveModal") $("saveModal").hidden = true };
$("myName").onchange = e => { ls.set("myName", e.target.value.trim()); fetchJSON("data/status.json").then(l => fetchJSON("data/plans.json").then(p => buildSave(l, p))).catch(() => buildSave(saved, savedPlans)) };
$("commitMsg").oninput = e => { e.target.dataset.touched = "1" };
$("saveFiles").onclick = async e => {
  const c = e.target.dataset.copy, d = e.target.dataset.dl;
  if (c != null) { const f = saveFiles[+c]; try { await navigator.clipboard.writeText(f.text); toast("Copied " + f.path) } catch (er) { toast("Copy blocked — use Download instead") } }
  if (d != null) { const f = saveFiles[+d]; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([f.text], { type: "application/json" })); a.download = f.path.split("/")[1]; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) }
};
$("committed").onclick = () => {
  if ($("committed").dataset.confirm !== "1") { $("committed").dataset.confirm = "1"; $("committed").textContent = "Yes, clear my unsaved list"; $("saveNote").textContent = "Only confirm once the commit shows on GitHub."; return }
  $("committed").dataset.confirm = ""; $("committed").textContent = "I've committed these changes";
  Object.assign(saved, pending); pending = {}; ls.set("pending", pending);
  pendingPlans = { add: [], del: [] }; ls.set("pendingPlans", pendingPlans);
  $("commitMsg").dataset.touched = ""; $("saveModal").hidden = true;
  refresh(); renderPlans(); toast("Done. The site and history update after the next deploy (about a minute).");
  setTimeout(reloadData, 90000);
};

/* ---------- route tab ---------- */
function saveRoute() { ls.set("route", route); routeRes = null; refresh(); renderRoute() }
function toggleRoute(t) { const i = route.indexOf(t); i < 0 ? route.push(t) : route.splice(i, 1); saveRoute() }
function stationOptions(sel) { return (BY.OFFICE ? `<option value="OFFICE" ${sel === "OFFICE" ? "selected" : ""}>${esc(BY.OFFICE.name)}</option><option disabled>──────────</option>` : "") + ST.slice().sort((a, b) => a.name.localeCompare(b.name)).map(s => `<option value="${s.tlc}" ${s.tlc === sel ? "selected" : ""}>${esc(s.name)} (${s.tlc})</option>`).join("") }
function renderRoute() {
  $("routeN").textContent = route.length;
  $("routeEmpty").hidden = route.length > 0;
  const sd = route.reduce((a, t) => a + scanDays(t), 0);
  $("routeChips").innerHTML = route.map(t => `<span class="tlc" data-t="${t}" title="${esc(BY[t].name)} · click to remove" style="background:var(--st-${stOf(t)})">${t} ×</span>`).join("") + (route.length ? `<div class="sub" style="width:100%">${route.length} stations · ${sd.toFixed(1)} scan-days on site</div>` : "");
  [...$("teamsSeg").children].forEach(b => b.setAttribute("aria-pressed", +b.dataset.v === teams));
  [...$("modeSeg").children].forEach(b => b.setAttribute("aria-pressed", b.dataset.v === mode));
  $("base2row").hidden = teams !== 2;
  $("plan").disabled = !route.length;
  if (!routeRes) { $("routeOut").innerHTML = ""; drawRoute() }
}
$("routeChips").onclick = e => { const c = e.target.closest(".tlc"); if (c) toggleRoute(c.dataset.t) };
$("clearRoute").onclick = () => { route = []; saveRoute() };
$("teamsSeg").onclick = e => { const b = e.target.closest("button"); if (!b) return; teams = +b.dataset.v; ls.set("teams", teams); routeRes = null; renderRoute() };
$("modeSeg").onclick = e => { const b = e.target.closest("button"); if (!b) return; mode = b.dataset.v; ls.set("mode", mode); if (routeRes) planRoute(); else renderRoute() };
["base1", "base2"].forEach(id => $(id).onchange = e => { ls.set(id + "v2", e.target.value); routeRes = null; renderRoute() });
$("startDate").onchange = e => { ls.set("start", e.target.value); routeRes = null; renderRoute() };
$("plan").onclick = planRoute;
function planRoute() {
  if (!route.length) return;
  const start = $("startDate").value || "2027-03-01", b1 = $("base1").value, b2 = $("base2").value;
  const groups = teams === 2 ? splitTeams(route, b1, b2) : [route.slice()];
  routeRes = { start, teams: groups.map((g, i) => ({ g, base: i ? b2 : b1, res: bestPlan(i ? b2 : b1, g, start, mode) })) };
  renderRouteOut(); drawRoute();
  const all = []; routeRes.teams.forEach(x => x.res && x.res.pick.days.forEach(d => d.pts.forEach(p => all.push([BY[p].lat, BY[p].lon]))));
  if (all.length) map.fitBounds(all, { padding: [40, 40], maxZoom: 12 });
}
function gmaps(pts) {
  const p = pts.filter((x, i) => i === 0 || x !== pts[i - 1]).map(t => `${BY[t].lat},${BY[t].lon}`); if (p.length < 2) return null;
  const wp = p.slice(1, -1).slice(0, 9);
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${p[0]}&destination=${p[p.length - 1]}` + (wp.length ? `&waypoints=${encodeURIComponent(wp.join("|"))}` : "");
}
function renderRouteOut() {
  if (!routeRes) return;
  let tot = { cost: 0, days: 0, n: 0 }, html = "";
  routeRes.teams.forEach((x, i) => {
    if (!x.res) return; const r = x.res.pick, o = x.res.other; tot.cost += r.cost.total; tot.days += r.nDays; tot.n += x.g.length;
    const dCost = o.cost.total - r.cost.total, dDays = o.nDays - r.nDays;
    const alt = (Math.abs(dCost) < 1 && dDays === 0) ? "Lowest-cost and fewest-days routes are the same here." :
      (mode === "cheap" ? `Fewest-days option: ${o.nDays} days (${-dDays} fewer) for ${gbp(-dCost)} more.` : `Lowest-cost option: ${gbp(Math.abs(dCost))} cheaper but ${-dDays} more day${-dDays === 1 ? "" : "s"}.`);
    html += `<div class="card">
      <div class="row"><span class="teamtag t${i + 1}">Team ${i + 1}</span><span class="grow sub">${x.g.length} stations from ${esc(BY[x.base].name)}</span><b>${gbp(r.cost.total)}</b></div>
      <div class="kv">
        <div><b>${r.nDays}</b><span>working days</span></div>
        <div><b>${fmt(r.miles)}</b><span>est. road miles</span></div>
        <div><b>${r.hotels}</b><span>hotel nights</span></div>
        <div><b>${gbp(r.cost.total / x.g.length)}</b><span>per station</span></div>
        <div><b>${niceDate(r.days[0].date).replace(/^\w+ /, "")}</b><span>start</span></div>
        <div><b>${niceDate(r.finish).replace(/^\w+ /, "")}</b><span>finish</span></div>
      </div>
      <table><tr><td>Staff (${A.crew} × £${A.rate} × ${r.nDays}d)</td><td class="r">${gbp(r.cost.staff)}</td></tr><tr><td>Subsistence</td><td class="r">${gbp(r.cost.subs)}</td></tr><tr><td>Hotels (${r.hotels} nights)</td><td class="r">${gbp(r.cost.hotel)}</td></tr><tr><td>Fuel</td><td class="r">${gbp(r.cost.fuel)}</td></tr><tr><td>Parking</td><td class="r">${gbp(r.cost.park)}</td></tr></table>
      <div class="hint">${alt}</div>
      <details><summary>Day-by-day plan (${r.nDays} days)</summary><div>${r.days.map(d => {
        const g = gmaps(d.pts);
        return `<div class="day"><div class="day-h"><b>${niceDate(d.date)}</b><span class="sub">${fmt(d.miles)} mi · ${d.night === "hotel" ? "hotel near " + esc(BY[d.nightAt].name) : "home"}</span></div>
        <div class="stops">${d.stops.length ? d.stops.map(s => `<span class="tlc ${s.done ? "" : "part"}" data-t="${s.tlc}" title="${esc(BY[s.tlc].name)} · ${s.h.toFixed(1)}h on site${s.done ? "" : " (continues)"}">${s.tlc}</span>`).join("") : `<span class="sub">Travel day</span>`}</div>
        ${g ? `<a href="${g}" target="_blank" rel="noopener">Open day in Google Maps</a>` : ""}</div>`
      }).join("")}</div></details>
    </div>`
  });
  const varModel = (115200 + 9600 + 51200 + 19200 + 7500) / 250;
  html = `<div class="card"><div class="row"><span class="lbl grow">Route total · ${mode === "cheap" ? "lowest cost" : "fewest days"}</span><b>${gbp(tot.cost)}</b></div>
    <div class="kv"><div><b>${tot.n}</b><span>stations</span></div><div><b>${tot.days}</b><span>team-days</span></div><div><b>${gbp(tot.cost / tot.n)}</b><span>per station</span></div></div>
    <div class="hint">Cost model running cost averages ${gbp(varModel)} per station before kit (${gbp(MODEL_TOTAL / 250)} with scanners and vans). This route is <span class="${tot.cost / tot.n <= varModel ? "ok" : "warn"}">${tot.cost / tot.n <= varModel ? "under" : "over"}</span> that by ${gbp(Math.abs(tot.cost / tot.n - varModel))} per station.</div>
    <div class="row"><button class="btn sm" id="markPlanned">Mark route stations as Planned</button></div></div>` + html;
  $("routeOut").innerHTML = html;
  $("routeOut").querySelectorAll(".stops .tlc").forEach(c => c.onclick = () => showDetail(c.dataset.t, true));
  $("markPlanned").onclick = () => setStatus(route.filter(t => stOf(t) === "none" || stOf(t) === "hold"), "planned");
}
function drawRoute() {
  routeLayer.clearLayers(); if (!routeRes) return;
  routeRes.teams.forEach((x, i) => {
    if (!x.res) return; const r = x.res.pick, col = css(i ? "--team2" : "--team1");
    const seq = [x.base, ...r.order, x.base];
    L.polyline(seq.map(t => [BY[t].lat, BY[t].lon]), { color: col, weight: 3, opacity: .85, dashArray: "6 5", interactive: false }).addTo(routeLayer);
    r.order.forEach((t, k) => L.marker([BY[t].lat, BY[t].lon], { icon: L.divIcon({ className: "", html: `<div class="seq-icon" style="background:${col};width:20px;height:20px">${k + 1}</div>`, iconSize: [20, 20], iconAnchor: [10, 26] }), interactive: false }).addTo(routeLayer));
    L.marker([BY[x.base].lat, BY[x.base].lon], { icon: L.divIcon({ className: "", html: `<div class="base-icon" style="background:${col};width:26px;height:20px">T${i + 1}</div>`, iconSize: [26, 20], iconAnchor: [13, 10] }), interactive: false }).addTo(routeLayer);
  });
}

/* ---------- saved plans ---------- */
function allPlans() { return savedPlans.filter(p => !pendingPlans.del.includes(p.id)).concat(pendingPlans.add.map(p => Object.assign({ _pending: true }, p))) }
function renderPlans() {
  const ps = allPlans().sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  $("plans").innerHTML = ps.length ? ps.map(p => `<div class="day"><div class="day-h"><b>${esc(p.name)}</b><span class="sub">${p.tlcs.length} stations · ${p.teams} team${p.teams > 1 ? "s" : ""}${p._pending ? " · unsaved" : ""}</span></div><div class="row"><button class="btn sm" data-load="${esc(p.id)}">Load</button><button class="btn sm" data-del="${esc(p.id)}">Delete</button><span class="sub">${p.by ? esc(p.by) + " · " : ""}${p.at ? shortDate(p.at.slice(0, 10)) : ""}</span></div></div>`).join("") : `<div class="hint">No saved plans yet. Plan a route, name it and save it so colleagues can load it.</div>`;
}
$("plans").onclick = e => {
  const l = e.target.dataset.load, d = e.target.dataset.del;
  if (l) { const p = allPlans().find(x => x.id === l); if (!p) return; route = p.tlcs.filter(t => BY[t]); teams = p.teams || 1; mode = p.mode || "cheap"; if (p.b1) $("base1").value = p.b1; if (p.b2) $("base2").value = p.b2; if (p.start) $("startDate").value = p.start; saveRoute(); planRoute(); toast("Loaded " + p.name) }
  if (d) {
    if (e.target.dataset.confirm !== "1") { e.target.dataset.confirm = "1"; e.target.textContent = "Confirm delete"; return }
    const i = pendingPlans.add.findIndex(p => p.id === d);
    if (i >= 0) pendingPlans.add.splice(i, 1); else pendingPlans.del.push(d);
    ls.set("pendingPlans", pendingPlans); renderPlans(); renderCounts();
  }
};
$("savePlan").onclick = () => {
  const name = $("planName").value.trim(); if (!name) { toast("Name the plan first"); $("planName").focus(); return } if (!route.length) { toast("Add stations to the route first"); return }
  pendingPlans.add.push({ id: "p" + Date.now().toString(36), name, tlcs: route.slice(), teams, mode, b1: $("base1").value, b2: $("base2").value, start: $("startDate").value, at: new Date().toISOString() });
  ls.set("pendingPlans", pendingPlans); $("planName").value = ""; renderPlans(); renderCounts(); toast("Plan added. Save to GitHub to share it.");
};

/* ---------- programme ---------- */
function buildProgramme() {
  const b1 = $("pbase1").value, b2 = $("pbase2").value;
  const all = ST.map(s => s.tlc), [t1, t2] = splitTeams(all, b1, b2);
  const r1 = bestPlan(b1, t1, "2027-03-01", "cheap").pick, r2 = bestPlan(b2, t2, "2027-03-01", "cheap").pick;
  const dates = Object.assign({}, r1.done, r2.done), team = {}; t1.forEach(t => team[t] = 0); t2.forEach(t => team[t] = 1);
  const byMonth = {}; Object.values(dates).forEach(d => { const m = d.slice(0, 7); const k = MONTHS.includes(m) ? m : "later"; byMonth[k] = (byMonth[k] || 0) + 1 });
  const sorted = Object.values(dates).sort();
  prog = { b1, b2, t1, t2, r1, r2, dates, team, byMonth, first100: sorted[Math.min(99, sorted.length - 1)], last: sorted[sorted.length - 1] };
  renderProg(); styleMarkers();
}
$("buildProg").onclick = () => { buildProgramme(); toast("Programme rebuilt") };
$("showMonths").onclick = () => { if (!prog) buildProgramme(); colourBy = "month"; $("colourBy").value = "month"; styleMarkers(); map.fitBounds([[50.0, -5.8], [57.6, 1.8]]) };
["pbase1", "pbase2"].forEach(id => $(id).onchange = e => { ls.set(id + "v2", e.target.value); buildProgramme() });
function renderProg() {
  if (!prog) { $("progOut").innerHTML = ""; return }
  const p = prog, cost = p.r1.cost.total + p.r2.cost.total, td = p.r1.nDays + p.r2.nDays, fieldTotal = cost + FIXED_KIT;
  const t1ok = p.first100 <= "2027-05-31", endOk = p.last <= "2027-10-29";
  const act = {}; ST.forEach(s => { const v = rec(s.tlc); if (v && (v.s === "scanned" || v.s === "accepted") && v.d) { const m = v.d.slice(0, 7); act[m] = (act[m] || 0) + 1 } });
  let cp = 0; const rows = MONTHS.map(m => { cp += p.byMonth[m] || 0; return { m, proj: cp, target: TARGET_CUM[m], act: Object.entries(act).filter(([k]) => k <= m).reduce((a, [, v]) => a + v, 0) } });
  const W = 360, H = 170, pl = 30, pr = 8, pt = 10, pb = 22, x = i => pl + i * (W - pl - pr) / (MONTHS.length - 1), y = v => pt + (H - pt - pb) * (1 - v / 250);
  const line = k => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join("");
  const showAct = iso(new Date()) >= "2027-03-01";
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative stations scanned: target versus projected">
    ${[0, 100, 250].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl - 5}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${v}</text>`).join("")}
    ${MONTHS.map((m, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${MONTH_NAME[m]}</text>`).join("")}
    <path d="${line("target")}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="4 4"/>
    <path d="${line("proj")} L${x(MONTHS.length - 1)},${y(0)} L${x(0)},${y(0)}Z" fill="var(--accent)" opacity=".12"/>
    <path d="${line("proj")}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
    ${showAct ? `<path d="${line("act")}" fill="none" stroke="var(--st-scanned)" stroke-width="2.5"/>` : ""}
  </svg>`;
  $("progOut").innerHTML = `<div class="card">
    <div class="kv">
      <div><b class="${t1ok ? "ok" : "warn"}">${shortDate(p.first100).replace(" 2027", "")}</b><span>100th station scanned</span></div>
      <div><b class="${endOk ? "ok" : "warn"}">${shortDate(p.last).replace(" 2027", "")}</b><span>250th station scanned</span></div>
      <div><b>${td}<span class="sub"> / 320</span></b><span>team-days used</span></div>
      <div><b>${gbp(fieldTotal)}</b><span>field cost incl. kit</span></div>
      <div><b class="${fieldTotal <= MODEL_TOTAL ? "ok" : "warn"}">${fieldTotal <= MODEL_TOTAL ? "−" : "+"}${gbp(Math.abs(fieldTotal - MODEL_TOTAL))}</b><span>vs £306,700 budget</span></div>
      <div><b>${p.r1.hotels + p.r2.hotels}</b><span>hotel nights</span></div>
    </div>
    <div class="hint">${t1ok ? "Tranche 1 capture lands before the end of May, leaving June for QA and acceptance." : "The 100th capture falls after May: shorten scan days or rebalance bases to protect the June milestone."} ${endOk ? "All 250 are captured within October." : "Capture runs past October: the plan needs more cluster days or shorter large-station visits."}</div>
    <div class="chart">${svg}</div>
    <div class="row sub"><span><span style="color:var(--accent)">━</span> projected</span><span>┅ cost model target</span>${showAct ? `<span><span style="color:var(--st-scanned)">━</span> actual (from scan dates)</span>` : ""}</div>
    <table><tr><th>Month</th><th class="r">Planned</th><th class="r">Cumulative</th><th class="r">Target</th><th class="r"></th></tr>
    ${rows.map((r, i) => `<tr><td><i class="dot" style="display:inline-block;background:${MONTH_COL[i]};width:8px;height:8px;margin-right:6px"></i>${MONTH_NAME[r.m]}</td><td class="r">${p.byMonth[r.m] || 0}</td><td class="r">${r.proj}</td><td class="r">${r.target}</td><td class="r ${r.proj >= r.target ? "ok" : "warn"}">${r.proj >= r.target ? "on track" : "−" + (r.target - r.proj)}</td></tr>`).join("")}
    ${p.byMonth.later ? `<tr><td>After Oct</td><td class="r warn">${p.byMonth.later}</td><td></td><td></td><td></td></tr>` : ""}
    </table>
  </div>
  ${[["1", p.r1, p.t1, p.b1], ["2", p.r2, p.t2, p.b2]].map(([n, r, g, b]) => `<div class="card"><div class="row"><span class="teamtag t${n}">Team ${n}</span><span class="grow sub">${g.length} stations from ${esc(BY[b].name)}</span><b>${gbp(r.cost.total)}</b></div>
    <div class="kv"><div><b>${r.nDays}</b><span>working days</span></div><div><b>${fmt(r.miles)}</b><span>est. road miles</span></div><div><b>${shortDate(r.finish).replace(" 2027", "")}</b><span>finishes</span></div></div>
    <div class="row"><label class="sub" for="lm${n}">Load a month into the route planner</label><select id="lm${n}">${MONTHS.map(m => `<option value="${m}">${MONTH_NAME[m]} · ${g.filter(t => p.dates[t] && p.dates[t].startsWith(m)).length} stations</option>`).join("")}</select><button class="btn sm" data-team="${n}">Load</button></div></div>`).join("")}`;
  $("progOut").querySelectorAll("button[data-team]").forEach(b => b.onclick = () => {
    const k = +b.dataset.team - 1, m = $("lm" + b.dataset.team).value, r = k ? p.r2 : p.r1;
    route = r.order.filter(t => p.dates[t] && p.dates[t].startsWith(m)); teams = 1; $("base1").value = k ? p.b2 : p.b1; ls.set("base1v2", $("base1").value);
    const first = r.days.find(d => d.date.startsWith(m)); if (first) $("startDate").value = first.date;
    saveRoute(); selectTab("route"); planRoute(); toast(`Loaded Team ${k + 1} ${MONTH_NAME[m]}: ${route.length} stations`)
  });
}

/* ---------- history ---------- */
function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = "" } else if (c === "\n") { row.push(f); rows.push(row); row = []; f = "" } else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row) }
  const head = rows.shift() || [];
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] || ""])));
}
function renderHist() {
  const q = $("hq").value.trim().toLowerCase(), ri = repoInfo();
  const rows = audit.filter(a => !q || Object.values(a).join(" ").toLowerCase().includes(q)).slice(0, 300);
  $("histOut").innerHTML = rows.length ? `<table class="hist"><tr><th>When</th><th>Change</th></tr>${rows.map(a => `<tr><td class="when">${esc(stamp(a.time))}</td><td>${BY[a.station] ? `<span class="tlc" data-t="${esc(a.station)}" style="cursor:pointer">${esc(a.station)}</span> ` : `<b>${esc(a.station)}</b> `}${esc(a.field)}: <s>${esc(a.old || "—")}</s> → ${esc(a.new || "—")}
    <div class="sub">${esc(a.author)}${a.declared_by && a.declared_by !== a.author ? " for " + esc(a.declared_by) : ""} · ${ri ? `<a href="${ri.base}/commit/${esc(a.commit)}" target="_blank" rel="noopener">${esc(a.commit.slice(0, 7))}</a>` : esc(a.commit.slice(0, 7))} · ${esc(a.message)}</div></td></tr>`).join("")}</table>`
    : `<div class="hint">${audit.length ? "No changes match that filter." : "No committed changes yet. Changes appear here after they're saved to GitHub and the site rebuilds."}</div>`;
  $("histOut").querySelectorAll(".tlc[data-t]").forEach(c => c.onclick = () => showDetail(c.dataset.t, true));
}
$("hq").oninput = renderHist;

/* ---------- assumptions ---------- */
function renderAssume() { $("assume").innerHTML = ASSUME_LABELS.map(([k, l]) => `<label for="as-${k}">${l}</label><input type="number" id="as-${k}" step="${k === "road" ? 0.05 : (/^d[A-F]$/.test(k) ? 0.25 : 1)}" min="0" value="${A[k]}">`).join("") }
$("assume").onchange = e => { const k = e.target.id.slice(3); const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) { A[k] = v; ls.set("assume", A); onAssume() } };
$("resetAssume").onclick = () => { A = Object.assign({}, DEFAULTS); ls.set("assume", {}); renderAssume(); onAssume() };
function onAssume() { if (prog) buildProgramme(); if (routeRes) planRoute(); else renderRoute(); if (detailT) showDetail(detailT) }

/* ---------- tabs & refresh ---------- */
function selectTab(n) {
  ["stations", "route", "prog", "hist"].forEach(k => { $("tab-" + k).setAttribute("aria-selected", k === n); $("pane-" + k).hidden = k !== n });
  if (n === "prog" && !prog) buildProgramme();
  if (n === "hist") renderHist();
}
["stations", "route", "prog", "hist"].forEach(k => $("tab-" + k).onclick = () => selectTab(k));
function refresh() { renderCounts(); renderList(); styleMarkers(); renderRoute(); if (prog && !$("pane-prog").hidden) renderProg() }

/* ---------- boot ---------- */
async function reloadData() {
  try {
    const [s, p, a] = await Promise.all([fetchJSON("data/status.json"), fetchJSON("data/plans.json"), fetch("data/audit-log.csv?t=" + Date.now(), { cache: "no-store" }).then(r => r.ok ? r.text() : "")]);
    saved = s || {}; savedPlans = Array.isArray(p) ? p : []; audit = parseCSV(a).reverse();
    Object.keys(pending).forEach(t => { if (same(pending[t], saved[t])) delete pending[t] }); ls.set("pending", pending);
    const ri = repoInfo();
    $("sync").innerHTML = ri ? `Data from <a href="${ri.base}/tree/${ri.branch}/data" target="_blank" rel="noopener">${esc(ri.repo)}</a>` : "Data from this site’s /data folder";
    refresh(); renderPlans(); if (!$("pane-hist").hidden) renderHist(); if (detailT) showDetail(detailT);
  } catch (e) { $("sync").innerHTML = `<span class="warn">Couldn't load status data</span>` }
}
(async () => {
  try { ST = await fetchJSON("data/stations.json") } catch (e) {
    $("sync").innerHTML = '<span class="warn">Open this through a web server (see README), not as a file.</span>'; return;
  }
  BY = Object.fromEntries(ST.map(s => [s.tlc, s]));
  const OFF = CFG.office;
  if (OFF && isFinite(OFF.lat) && isFinite(OFF.lon)) {
    BY.OFFICE = { tlc: "OFFICE", name: OFF.name || "Office", lat: +OFF.lat, lon: +OFF.lon, dft: "C" };
    L.marker([BY.OFFICE.lat, BY.OFFICE.lon], { zIndexOffset: 1000, icon: L.divIcon({ className: "", html: `<div class="office-icon" title="${esc(BY.OFFICE.name)}">HQ</div>`, iconSize: [30, 20], iconAnchor: [15, 10] }) })
      .bindTooltip(esc(BY.OFFICE.name), { direction: "top", offset: [0, -10] }).addTo(map);
  }
  const DEF = BY.OFFICE ? "OFFICE" : "BHM", DEF2 = BY.OFFICE ? "OFFICE" : "LBG";
  route = route.filter(t => BY[t]);
  ST.forEach(s => {
    const m = L.circleMarker([s.lat, s.lon], { radius: 4, weight: 1.5 });
    m.bindTooltip(`${s.tlc} · ${esc(s.name)}`, { direction: "top", offset: [0, -6] });
    m.on("click", e => { if (e.originalEvent.shiftKey) toggleRoute(s.tlc); else showDetail(s.tlc) });
    markers[s.tlc] = m;
  });
  $("base1").innerHTML = stationOptions(ls.get("base1v2", DEF));
  $("base2").innerHTML = stationOptions(ls.get("base2v2", DEF2));
  $("pbase1").innerHTML = stationOptions(ls.get("pbase1v2", DEF));
  $("pbase2").innerHTML = stationOptions(ls.get("pbase2v2", DEF2));
  $("startDate").value = ls.get("start", "2027-03-01");
  renderFilters(); renderAssume(); refresh(); renderPlans();
  await reloadData();
})();
