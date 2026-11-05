# Station Scan Planner

Interactive map and route planner for the 250 baseline stations in the Network Rail
**Virtual Accessibility Tours** tender (ITT 20054, Appendix A).

- Every station on a street map with Network Rail track lines (OpenRailwayMap) shown by default
- Station name cards at every zoom level, placed so they never overlap
- Colour by scan status, DfT category, programme month or team
- Route planner for 1 or 2 teams: best visiting order, lowest-cost or fewest-days, day-by-day plan with a Google Maps link per day
- Two-team programme against the cost model (100 by end May, 250 by October, £306,700 field budget)
- Full change history: who changed what, when, from what to what

It is a static site: no server, no database, no build step. GitHub hosts the files, runs the checks and keeps the history.

## Where the data lives

Everything is in the `data/` folder of this repository.

| File | What it holds | Who changes it |
|---|---|---|
| `data/stations.json` | The 250 stations from Appendix A: code, name, operator, DfT category, step-free category, footfall, asset counts, coordinates | Rarely; edit by hand if a station is substituted |
| `data/status.json` | Current status, scan date and notes per station | Your team, through the site's **Save to GitHub** step |
| `data/plans.json` | Saved route plans | Your team, the same way |
| `data/audit-log.csv` | One row per changed field: time, commit, GitHub user, station, field, old value, new value, name typed in the site, commit message | The audit workflow only. Don't edit it |

Settings that are personal to each person (cost assumptions, current route, map toggles, unsaved edits) stay in their own browser's local storage.

Station coordinates were entered by hand for planning and can be a few hundred metres out. Correct any in `data/stations.json`.

## How access and auditing work

There is no login on the site itself. **Reading** is open to anyone who can open the site. **Changing** data means committing to this repository, so GitHub's own access controls decide who can make changes: only people with write access to the repo can save.

Every push runs `.github/workflows/deploy.yml`, which:

1. Checks `status.json` and `plans.json`. Unknown station codes, invalid statuses, bad dates and broken JSON fail the run, and the site isn't updated.
2. Compares each commit with the one before and appends the differences to `data/audit-log.csv`, using the GitHub account that made the commit.
3. Publishes the site to GitHub Pages.

The **History** tab and each station card show the log, and every entry links to its commit on GitHub. Git history is the second, untamperable record: any change to any file is visible under the repository's commit history.

Optional hardening:

- **Settings → Branches → Add rule for `main`.** Turn on "Require a pull request before merging" if you want a second person to approve changes. If you do, allow GitHub Actions to push (or the audit log commit will fail).
- Give colleagues **Write** access under **Settings → Collaborators and teams**. Anyone with only Read access can view but not change data.

## Important: who can see the site

On GitHub Free, Pro and Team plans, **a GitHub Pages site is public on the internet even when the repository is private.** Anyone with the address can read the station list, statuses and notes. The tender pack is marked OFFICIAL, so decide before publishing:

- **GitHub Enterprise Cloud:** turn on private Pages (Settings → Pages → Visibility: Private). Only signed-in members of your organisation can open the site.
- **Otherwise:** keep the repository private and don't enable Pages. Each person runs the site locally (see below) from their own clone. Saving and the audit log work the same way, by committing.
- Avoid putting names, phone numbers or other personal details in station notes.

## Set up on GitHub Pages

1. Create a repository (for example `station-scan-planner`) and upload the contents of this folder, including the hidden `.github` folder.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Actions → General → Workflow permissions: Read and write permissions.**
4. Push or run the workflow (**Actions → Check, log and publish → Run workflow**). The site appears at `https://<your-org>.github.io/station-scan-planner/` after about a minute.
5. If you use a custom domain, set `repo: "your-org/station-scan-planner"` in `config.js` so the **Save** links point at the right repository. On a `github.io` address this is detected automatically.

## Run it locally

The site must be served over HTTP (opening `index.html` directly from disk won't load the data):

```bash
cd station-scan-planner
python3 -m http.server 8000
# open http://localhost:8000
```

## Saving changes (day to day)

1. Change statuses, dates or notes in the site, or save a route plan. A yellow bar shows how many changes are unsaved. They're kept in your browser until you save them.
2. Click **Save to GitHub**. Type your name once (it's recorded in the log beside your GitHub account) and check the commit message.
3. Click **Copy contents**, then **Open status.json on GitHub to edit**. Select everything in the GitHub editor, paste, and click **Commit changes**. Do the same for `plans.json` if listed.
   - Or click **Download** and use **Upload files** in the `data` folder.
4. Back in the site, click **I've committed these changes**. The site and the History tab update after the next deploy, about a minute later.

The site fetches the latest committed file before building your copy, so you won't overwrite a colleague's earlier save. If two people save within the same minute, the second commit wins for any station both changed; both changes still appear in the audit log.

## Map layers

- Basemap: OpenStreetMap standard tiles, toned down (and darkened in dark mode) so the stations stand out.
- Railway lines: OpenRailwayMap standard layer, on by default (toggle in the legend).

Both are free, volunteer-run services with fair-use policies: fine for a small team, but OpenRailwayMap asks commercial projects to run their own tile server, and either may limit or block heavy use. The page sends only the site's domain (not the full address) when asking for tiles, which both services require. URLs and credits are in `config.js` if you want to swap providers.

## Planning assumptions

Defaults come from `network_rail_scanning_cost_model.pdf`: two teams of two, £180 day rate, £30 subsistence, £100 hotel per person per night, £30 fuel per van-day, £15 parking per station-day, £104,000 of scanners, vans and insurance. Scan days by DfT category: A 2, B 1.25, C 1, D–F 0.5 (the model allows up to 3 for large and 2 for medium stations). Drive times are straight-line distance × 1.25 at 35 mph plus 15 minutes per stop. Each person can change these under **Programme → Assumptions**; they stay in their browser.

## Files

```
index.html               page
config.js                repository name and map layer settings
assets/app.js            all app logic
assets/style.css         styles
data/                    stations, statuses, plans, audit log
scripts/audit.mjs        validation and audit logging (Node 20, no dependencies)
.github/workflows/deploy.yml   runs the audit and publishes to Pages
```
