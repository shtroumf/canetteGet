document.addEventListener("DOMContentLoaded", () => {
  const center = [46.8520, -71.3650];
  const montchatelPolygon = [
    [46.8464834, -71.3968156],
    [46.8416901, -71.390187],
    [46.8471738, -71.370735],
    [46.8523577, -71.3778403],
    [46.8580618, -71.3859899],
    [46.8532685, -71.3932325],
    [46.8495904, -71.3988612],
    [46.8464834, -71.3968156]
  ];

  const map = L.map("sector-map", { scrollWheelZoom: false }).setView(center, 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  const sectorArea = L.polygon(montchatelPolygon, {
    color: "#2e7d32",
    fillColor: "#4caf50",
    fillOpacity: 0.35,
    weight: 3
  }).addTo(map);

  sectorArea.bindPopup("<b>Secteur Montchâtel (G2A)</b><br>Zone principale de cueillette Get Cannettes.");
  map.fitBounds(sectorArea.getBounds(), { padding: [20, 20] });
});
