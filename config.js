// Station Scan Planner settings.
// repo: "owner/name" of the GitHub repository that holds /data.
//       Leave empty to detect it from a github.io address automatically.
// branch: the branch GitHub Pages deploys from.
window.SSP_CONFIG = {
  repo: "",
  branch: "main",
  // Map layers. Both are free community services with fair-use rules; keep usage to a small team.
  // OpenStreetMap standard map (no key needed). Dark mode shows the same map with darkened colours.
  basemap: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  basemapAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  // OpenRailwayMap track overlay (no key needed).
  railway: "https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
  railwayAttribution: 'Railways: <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a> (CC-BY-SA)'
};
