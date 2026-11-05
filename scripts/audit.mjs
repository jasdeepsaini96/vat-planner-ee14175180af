// Validates /data and appends one row per changed field to data/audit-log.csv.
// Run by .github/workflows/deploy.yml on every push:  node scripts/audit.mjs <before-sha> <after-sha>
// No dependencies; needs a full git history (actions/checkout with fetch-depth: 0).
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const [before = "", after = "HEAD"] = process.argv.slice(2);
const TRACKED = ["data/status.json", "data/plans.json"];
const LOG = "data/audit-log.csv";
const HEADER = "time,commit,author,station,field,old,new,declared_by,message\n";
const VALID = new Set(["none", "planned", "scanned", "accepted", "hold"]);

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 });
const readAt = (rev, path) => { try { return JSON.parse(git("show", `${rev}:${path}`)) } catch { return null } };
const csv = v => { const s = v == null ? "" : String(v).replace(/\r?\n/g, " "); return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s };

// 1. Validate the current files so a bad edit never deploys.
const errors = [];
const stations = new Set(JSON.parse(fs.readFileSync("data/stations.json", "utf8")).map(s => s.tlc));
let status, plans;
try { status = JSON.parse(fs.readFileSync("data/status.json", "utf8")) } catch (e) { errors.push(`data/status.json is not valid JSON: ${e.message}`) }
try { plans = JSON.parse(fs.readFileSync("data/plans.json", "utf8")) } catch (e) { errors.push(`data/plans.json is not valid JSON: ${e.message}`) }
if (status) {
  if (typeof status !== "object" || Array.isArray(status)) errors.push("data/status.json must be an object keyed by station code");
  else for (const [t, v] of Object.entries(status)) {
    if (!stations.has(t)) errors.push(`status.json: unknown station code ${t}`);
    if (!v || !VALID.has(v.s)) errors.push(`status.json: ${t} has invalid status ${JSON.stringify(v && v.s)}`);
    if (v && v.d && !/^\d{4}-\d{2}-\d{2}$/.test(v.d)) errors.push(`status.json: ${t} has invalid date ${v.d}`);
  }
}
if (plans) {
  if (!Array.isArray(plans)) errors.push("data/plans.json must be a list");
  else plans.forEach((p, i) => {
    if (!p || !p.id || !p.name || !Array.isArray(p.tlcs)) errors.push(`plans.json: entry ${i + 1} needs id, name and tlcs`);
    else p.tlcs.forEach(t => { if (!stations.has(t)) errors.push(`plans.json: plan "${p.name}" has unknown station ${t}`) });
  });
}
if (errors.length) { console.error("Data check failed:\n- " + errors.join("\n- ")); process.exit(1) }
console.log(`Data check passed: ${Object.keys(status).length} station records, ${plans.length} plans.`);

// 2. Work out which commits in this push touched the tracked files.
const noPrev = !before || /^0+$/.test(before);
let range = null;
if (!noPrev) { try { git("cat-file", "-e", `${before}^{commit}`); range = `${before}..${after}` } catch { console.log("Previous commit not found (force push?); logging HEAD only.") } }
const commits = range
  ? git("rev-list", "--reverse", range, "--", ...TRACKED).split("\n").filter(Boolean)
  : git("rev-list", "-1", after, "--", ...TRACKED).split("\n").filter(Boolean);
if (!commits.length) { console.log("No data changes in this push."); process.exit(0) }

// 3. Diff each commit against its parent, field by field.
if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, HEADER);
const logged = new Set(fs.readFileSync(LOG, "utf8").split("\n").slice(1).map(l => l.split(",")[1]).filter(Boolean));
const out = [];
for (const c of commits) {
  if (logged.has(c)) continue; // already logged (re-run)
  const [time, author, message] = git("show", "-s", "--format=%cI%x1f%an%x1f%s", c).trim().split("\x1f");
  const hasParent = (() => { try { git("cat-file", "-e", `${c}^`); return true } catch { return false } })();
  const prevS = (hasParent && readAt(`${c}^`, "data/status.json")) || {}, curS = readAt(c, "data/status.json") || {};
  for (const t of [...new Set([...Object.keys(prevS), ...Object.keys(curS)])].sort()) {
    const a = prevS[t] || {}, b = curS[t] || {};
    const by = b.by || a.by || "";
    if ((a.s || "none") !== (b.s || "none")) out.push([time, c, author, t, "status", a.s || "none", b.s || "none", by, message]);
    if ((a.d || "") !== (b.d || "")) out.push([time, c, author, t, "scan date", a.d || "", b.d || "", by, message]);
    if ((a.note || "") !== (b.note || "")) out.push([time, c, author, t, "note", a.note || "", b.note || "", by, message]);
  }
  const prevP = (hasParent && readAt(`${c}^`, "data/plans.json")) || [], curP = readAt(c, "data/plans.json") || [];
  const pm = new Map(prevP.map(p => [p.id, p])), cm = new Map(curP.map(p => [p.id, p]));
  for (const [id, p] of cm) {
    const o = pm.get(id);
    if (!o) out.push([time, c, author, "PLAN", "plan added", "", `${p.name} (${p.tlcs.length} stations)`, p.by || "", message]);
    else if (JSON.stringify(o) !== JSON.stringify(p)) out.push([time, c, author, "PLAN", "plan changed", o.name, `${p.name} (${p.tlcs.length} stations)`, p.by || "", message]);
  }
  for (const [id, p] of pm) if (!cm.has(id)) out.push([time, c, author, "PLAN", "plan deleted", p.name, "", "", message]);
}
if (out.length) fs.appendFileSync(LOG, out.map(r => r.map(csv).join(",")).join("\n") + "\n");
console.log(`Logged ${out.length} change${out.length === 1 ? "" : "s"} from ${commits.length} commit${commits.length === 1 ? "" : "s"}.`);
