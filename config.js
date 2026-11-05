// Station Scan Planner settings.
// repo: "owner/name" of the GitHub repository that holds /data.
//       Leave empty to detect it from a github.io address automatically.
// branch: the branch GitHub Pages deploys from.
window.SSP_CONFIG = {
  repo: "",
  branch: "main",
  // Where the teams start and finish each trip by default. Change the postcode label
  // and coordinates if the office moves (look them up on any postcode site).
  office: { name: "Office (SE8 3DX)", lat: 51.4772, lon: -0.0208 }
  // The map is drawn from data/gb-map.json (Great Britain coastline and railways),
  // so it needs no outside map services.
};
