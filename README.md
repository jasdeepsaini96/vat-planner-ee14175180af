# Station Scan Planner

A map and route planner for the 250 baseline stations in the Network Rail **Virtual Accessibility Tours** tender (ITT 20054, Appendix A).

**Live site:** https://jasdeepsaini96.github.io/vat-planner-ee14175180af/
**Repository:** https://github.com/jasdeepsaini96/vat-planner-ee14175180af

Keep the site address to yourself. See [Who can see and change what](#who-can-see-and-change-what).

---

## What it does

- **Map:** Great Britain only, with the railway network drawn in thin lines (switch them off in the legend).
- **Station names:** a name card appears beside each station at every zoom level. Cards that would overlap are left out, and more appear as you zoom in.
- **Colours:** stations can be coloured by scan status (Not scanned, Planned, Scanned, Accepted / live, On hold), DfT category, programme month or team.
- **Filters:** show or hide stations by status, DfT category, operator or search term.
- **Station cards:** Appendix A details for each station. You can set its status, scan date and notes, and see its change history.
- **Route planner:** works for 1 or 2 teams. It finds the best visiting order, either lowest cost or fewest days. It gives a day-by-day plan with hotel nights, costs and a Google Maps link for each day.
- **Programme:** the two-team scenario from the cost model. It checks 100 stations by end of May and all 250 by October against the £306,700 field budget.
- **History:** who changed what and when, from what to what, with a link to each change on GitHub.

---

## Where the data lives

Everything is in the `data/` folder of this repository.

| File | What it holds | How it changes |
|---|---|---|
| `data/stations.json` | The 250 stations from Appendix A: code, name, operator, DfT category, step-free category, footfall, asset counts and map position | Edit by hand only, for example if a station is substituted |
| `data/status.json` | Each station's status, scan date and notes | Through the site's **Save to GitHub** button |
| `data/plans.json` | Saved route plans | Through the site's **Save to GitHub** button |
| `data/audit-log.csv` | One row per change: time, commit, GitHub account, station, field, old value, new value, name typed in the site, commit message | Written automatically. Don't edit it |

Some settings stay in your own browser and are never uploaded: cost assumptions, the route you're building, map toggles and any unsaved edits. A different browser or computer starts with the defaults.

Station positions were entered by hand for planning. They can be a few hundred metres out. Correct any of them in `data/stations.json`.

---

## Who can see and change what

**Changing data:** only people with write access to this repository can save changes. Right now that's only the owner. Don't add collaborators under **Settings → Collaborators** unless you want them to be able to save.

**Using the site:** anyone who has the address can open the site and click around. Edits they make stay in their own browser and never reach your data.

**Seeing the site:** GitHub Pages sites on personal accounts can't require a login. The site is protected in three other ways:

- **An unguessable address.** The repository is named `vat-planner-ee14175180af`, so nobody can guess the address.
- **Hidden from search engines.** The page asks Google and other search engines not to list it.
- **Nothing is shared with other websites.** The map is built from files in this repository, so the page never tells another site its address.

**Keep the repository private.** This needs GitHub Pro. A public repository is listed on your GitHub profile, which would reveal the address.

**Anyone you give the link to can open it.** The tender pack is marked OFFICIAL, so keep names, phone numbers and security details out of station notes.

If you ever need a real login, the options are:

- **GitHub Enterprise Cloud:** offers private Pages for organisation members.
- **GitHub Codespaces:** run the site privately inside your own account (see [Run it privately with Codespaces](#run-it-privately-with-codespaces)).

---

## Saving changes (day to day)

1. **Make your changes on the site.** Update statuses, scan dates or notes, or save a route plan. A yellow bar shows how many changes haven't been saved yet.
2. **Click Save to GitHub.** Type your name the first time; it's recorded in the change log. Check the commit message.
3. **Copy the new file into GitHub.**
   1. Click **Copy contents**, then **Open status.json on GitHub to edit**.
   2. In GitHub's editor, select everything (Ctrl+A, or Cmd+A on a Mac), paste, and click **Commit changes**.
   3. Do the same for `plans.json` if it's listed.

   If copying doesn't work, click **Download** instead. Then use **Upload files** in the `data` folder on GitHub.
4. **Confirm on the site.** Click **I've committed these changes**, then confirm.
5. **Refresh.** About a minute later the site has republished. Refresh the page to see the change.

The site fetches the latest saved file before building yours, so you won't overwrite an earlier save.

---

## Seeing who changed what

- **History tab:** every saved change, newest first, with a filter box.
- **Station card:** each card shows the latest changes for that station.
- **`data/audit-log.csv`:** the full log. You can download it and open it in Excel.
- **GitHub's commit list:** https://github.com/jasdeepsaini96/vat-planner-ee14175180af/commits/main is GitHub's own record of every change to every file. It can't be edited after the fact.

---

## What happens when you save

Every commit to `main` runs the **Check, log and publish** workflow (`.github/workflows/deploy.yml`):

1. **Checks the data.** Unknown station codes, invalid statuses, bad dates or broken files stop the run. The site keeps showing the last good version.
2. **Logs the changes.** It compares the commit with the one before and adds the differences to `data/audit-log.csv`.
3. **Publishes the site** to GitHub Pages.

You can watch it under the **Actions** tab. A green tick means it worked.

A red cross means the save was rejected. Click the run, then the **Check data and record changes** step, to see which station is affected and why. Fix the file and commit again.

---

## How it was set up

This has already been done for this repository. These are the steps for reference, or for setting up a copy.

1. **Upload the files.** Upload all of the project's files, including the hidden `.github` folder.
2. **Allow the workflow to save the change log.** Go to **Settings → Actions → General → Workflow permissions** and choose **Read and write permissions**.
3. **Switch on Pages.** Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
4. **Publish.** On the **Actions** tab, open **Check, log and publish**, then click **Run workflow**.
5. **Check the link.** The site address appears under **Settings → Pages**.

The site works out its repository from its own address. If you move it to a custom domain, set `repo: "owner/name"` in `config.js`.

---

## Run it privately with Codespaces

You can run the site without Pages, visible only to you while you're signed in to GitHub.

1. On the repository page, click **Code → Codespaces → Create codespace on main**.
2. In the terminal at the bottom, type `python3 -m http.server 8000` and press Enter.
3. Click **Open in Browser** in the pop-up.

To run it on your own computer instead, download the repository and run the same command in its folder. Then open http://localhost:8000. Opening `index.html` directly from the folder won't load the data.

---

## Map layers

The map is drawn entirely from `data/gb-map.json`. That file holds the coastline of Great Britain and its railway network from [Natural Earth](https://www.naturalearthdata.com/) (public domain). Only Britain is shown: England, Scotland and Wales. The site uses no outside map service, so the map always loads and never needs a key.

The railway layer shows the main network at national scale. Lines get slightly thicker as you zoom in, and you can switch them off in the legend. At city level it's simplified, and some short branches are missing. For full track detail, replace `data/gb-map.json` with Network Rail's open track data.

---

## Planning assumptions

Defaults come from the scanning cost model (`network_rail_scanning_cost_model.pdf`):

| Item | Default |
|---|---|
| Teams | 2 teams of 2 people, from March 2027 |
| Day rate | £180 per person |
| Subsistence | £30 per person per day |
| Hotel | £100 per person per night |
| Fuel | £30 per van per day |
| Parking | £15 per station-day |
| Equipment | £104,000 for scanners, vans and insurance |
| Scan days by DfT category | A 2, B 1.25, C 1, D–F 0.5 |
| Driving | Straight-line distance × 1.25 at 35 mph, plus 15 minutes per stop |

The cost model allows up to 3 scan days for large stations and 2 for medium ones. The defaults are set lower so all 250 fit into the model's 320 team-days.

You can change any of these under **Programme → Assumptions**. Changes stay in your browser only. Use the Google Maps link on each day to check real driving times.

---

## Files

```
index.html                     the page
config.js                      map layers and (optional) repository name
assets/app.js                  all app logic
assets/style.css               styles
data/                          stations, statuses, plans, change log, Britain map
scripts/audit.mjs              data checks and change logging (Node 20, no dependencies)
.github/workflows/deploy.yml   runs the checks and publishes to GitHub Pages
```
