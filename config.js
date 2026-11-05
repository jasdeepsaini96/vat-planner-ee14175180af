// Station Scan Planner settings.
// repo: "owner/name" of the GitHub repository that holds /data.
//       Leave empty to detect it from a github.io address automatically.
// branch: the branch GitHub Pages deploys from.
window.SSP_CONFIG = {
  repo: "jasdeepsaini96/stations.github.io",
  branch: "main",
  // Map layers. Both are free community services; keep usage to your team.
  basemapLight: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  basemapDark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  basemapAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  railway: "https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
  railwayAttribution: 'Railways: <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a> (CC-BY-SA)'
};
