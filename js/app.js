/* Personnalisez ce sujet ntfy pour le déploiement. N'ajoutez jamais de jeton secret ici. */
const NTFY_TOPIC = "shtroumfhotshotsunraidqc";
const NTFY_BASE_URL = "https://ntfy.sh/";
const REQUEST_MAX_AGE = 24 * 60 * 60 * 1000;
const REQUEST_STORAGE_KEYS = ["active_request_id", "active_request_created_at", "active_request_status_topic", "active_request_status", "active_request_address"];
const CACHE_KEY = "canetteGet.location.v1";
const CONFIRMED_ADDRESS_KEY = "canetteGet.confirmedAddress.v1";
const APP_STORAGE_KEYS = [...REQUEST_STORAGE_KEYS, CACHE_KEY, CONFIRMED_ADDRESS_KEY];
const CACHE_RADIUS_METERS = 50;
const SECTEUR_DESSERVI = [
  [46.8464834, -71.3968156],
  [46.8416901, -71.390187],
  [46.8471738, -71.370735],
  [46.8523577, -71.3778403],
  [46.8580618, -71.3859899],
  [46.8532685, -71.3932325],
  [46.8495904, -71.3988612],
  [46.8464834, -71.3968156]
];

const btn = document.getElementById("btn");
const statusEl = document.getElementById("status");
const statusIconEl = document.getElementById("status-icon");
const statusTextEl = document.getElementById("status-text");
const zoneWarningEl = document.getElementById("zone-warning");
const requestStatusEl = document.getElementById("request-status");
const requestStatusTitleEl = document.getElementById("request-status-title");
const requestStatusMessageEl = document.getElementById("request-status-message");
const requestIdEl = document.getElementById("request-id");
const gpsHelpEl = document.getElementById("gps-help");
const gpsHelpStepsEl = document.getElementById("gps-help-steps");
const manualAddressBtn = document.getElementById("manual-address");
const resetConfirmDialog = document.getElementById("reset-confirm-dialog");
const adresseEl = document.getElementById("adresse");
const mapEl = document.getElementById("map-frame");
const mapLegendEl = document.getElementById("map-legend");
const coordinatesEl = document.getElementById("coordinates");

let sectorMap = null;
let positionMarker = null;
let position = null;
let adresse = null;
let adresseModifiee = false;
let enCours = false;
let activeRequest = null;
let statusSource = null;
let completionTimer = null;
let manualMode = false;

adresseEl.addEventListener("input", () => {
  adresseModifiee = true;
  if (manualMode && !position) btn.disabled = !adresseEl.value.trim();
});

function getDevicePlatform() {
  const userAgent = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  if (/Macintosh|Mac OS X/i.test(userAgent) && /Safari/i.test(userAgent) && !/Chrome|Chromium|Edg|Firefox/i.test(userAgent)) return "desktop-safari";
  return "desktop-browser";
}

function afficherAideGeolocalisation() {
  const platform = getDevicePlatform();
  const userAgent = navigator.userAgent;
  let steps;

  if (platform === "ios") {
    steps = [
      ["⚙️", "Ouvrez Réglages, puis Confidentialité et sécurité."],
      ["📍", "Touchez Service de localisation, puis Safari (ou le navigateur utilisé)."],
      ["✅", "Autorisez la localisation pendant l’utilisation, puis rechargez cette page."]
    ];
  } else if (platform === "android") {
    steps = [
      ["🔒", "Dans Chrome, touchez l’icône à gauche de l’adresse du site."],
      ["⚙️", "Ouvrez Autorisations du site, puis Localisation."],
      ["✅", "Choisissez Autoriser et rechargez cette page."]
    ];
  } else if (platform === "desktop-safari") {
    steps = [
      ["🧭", "Dans Safari, ouvrez Safari > Réglages > Sites web."],
      ["📍", "Sélectionnez Localisation dans la liste à gauche et repérez ce site."],
      ["✅", "Choisissez Autoriser, puis rechargez cette page."]
    ];
  } else {
    const browser = /Edg\//i.test(userAgent) ? "Edge" : /Firefox\//i.test(userAgent) ? "Firefox" : "Chrome";
    const browserSettings = browser === "Edge" ? "Paramètres > Cookies et autorisations de site > Localisation" :
      browser === "Firefox" ? "Paramètres > Vie privée et sécurité > Permissions > Localisation" :
        "Paramètres > Confidentialité et sécurité > Paramètres des sites > Localisation";
    steps = [
      ["🔒", "Cliquez sur l’icône à gauche de l’adresse de cette page."],
      ["⚙️", `Ouvrez les paramètres du site ou ${browserSettings}, puis Localisation.`],
      ["✅", "Réglez l’accès sur Autoriser et rechargez cette page."]
    ];
  }

  gpsHelpStepsEl.replaceChildren(...steps.map(([icon, text]) => {
    const item = document.createElement("li");
    const iconEl = document.createElement("span");
    iconEl.className = "gps-step-icon";
    iconEl.setAttribute("aria-hidden", "true");
    iconEl.textContent = icon;
    item.append(iconEl, document.createTextNode(text));
    return item;
  }));
  gpsHelpEl.hidden = false;
  gpsHelpEl.focus();
}

manualAddressBtn.addEventListener("click", () => {
  manualMode = true;
  gpsHelpEl.hidden = true;
  afficher("Saisissez votre adresse pour continuer sans localisation automatique.");
  btn.disabled = !adresseEl.value.trim();
  adresseEl.focus();
});

function afficher(texte, classe) {
  statusTextEl.textContent = texte;
  statusEl.className = classe || "";
  statusIconEl.textContent = classe === "err" ? "!" : classe === "ok" ? "✓" : "";
}

function definirFormulaireVerrouille(verrouille) {
  adresseEl.disabled = verrouille;
  document.querySelectorAll('input[name="cueillette"]').forEach((option) => { option.disabled = verrouille; });
  btn.disabled = verrouille;
}

function messageAttenteCueillette(now = new Date()) {
  const jour = now.getDay();
  const debutMinutes = jour === 0 || jour === 6 ? 8 * 60 : 16 * 60;
  const finMinutes = jour === 0 || jour === 6 ? 11 * 60 : 19 * 60;
  const heureMinutes = now.getHours() * 60 + now.getMinutes();

  if (heureMinutes >= debutMinutes && heureMinutes < finMinutes) {
    const finPlage = new Date(now);
    finPlage.setHours(Math.floor(finMinutes / 60), finMinutes % 60, 0, 0);
    const minutesRestantes = Math.ceil((finPlage - now) / 60000);
    const heures = Math.floor(minutesRestantes / 60);
    const minutes = minutesRestantes % 60;
    const delai = heures
      ? `${heures} h${minutes ? ` ${minutes} min` : ""}`
      : `${minutesRestantes} min`;
    return `Nous passerons d’ici la fin de la plage, dans environ ${delai}.`;
  }

  for (let decalage = 0; decalage < 7; decalage++) {
    const prochainJour = new Date(now);
    prochainJour.setDate(now.getDate() + decalage);
    const jourProchain = prochainJour.getDay();
    const ouvertureMinutes = jourProchain === 0 || jourProchain === 6 ? 8 * 60 : 16 * 60;
    const fermetureMinutes = jourProchain === 0 || jourProchain === 6 ? 11 * 60 : 19 * 60;
    const ouverture = new Date(prochainJour);
    ouverture.setHours(Math.floor(ouvertureMinutes / 60), ouvertureMinutes % 60, 0, 0);

    if (ouverture > now) {
      const jourRelatif = decalage === 0 ? "aujourd’hui" : "demain";
      const debut = `${Math.floor(ouvertureMinutes / 60)} h`;
      const fin = `${Math.floor(fermetureMinutes / 60)} h`;
      return `Prochaine plage de cueillette : ${jourRelatif}, de ${debut} à ${fin}.`;
    }
  }
}

function afficherEtatDemande(request, state) {
  const messages = {
    pending: ["Demande reçue !", messageAttenteCueillette()],
    EN_ROUTE: ["🚴‍♀️ On s'en vient !", "Nous sommes en route vers votre adresse."],
    completed: ["🎉 Merci !", "Vos consignes ont été récupérées."]
  };
  const [title, message] = messages[state];
  requestStatusEl.dataset.state = state === "EN_ROUTE" ? "en-route" : state;
  requestStatusTitleEl.textContent = title;
  requestStatusMessageEl.textContent = message;
  requestIdEl.textContent = `Demande ${request.id}`;
  requestStatusEl.hidden = false;
}

function sauvegarderDemande(request) {
  localStorage.setItem("active_request_id", request.id);
  localStorage.setItem("active_request_created_at", String(request.createdAt));
  localStorage.setItem("active_request_status_topic", request.statusTopic);
  localStorage.setItem("active_request_status", request.status);
  localStorage.setItem("active_request_address", request.address);
}

function effacerDemandeSauvegardee() {
  REQUEST_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
}

function reinitialiserApplication() {
  if (activeRequest) {
    resetConfirmDialog.returnValue = "";
    resetConfirmDialog.showModal();
    return;
  }
  appliquerReinitialisation();
}

function appliquerReinitialisation() {
  try {
    APP_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch (_) {
    afficher("Impossible de réinitialiser les données. Le stockage local est inaccessible.", "err");
    return;
  }
  fermerEcouteStatut();
  if (completionTimer) window.clearTimeout(completionTimer);
  window.location.reload();
}

function fermerEcouteStatut() {
  if (statusSource) statusSource.close();
  statusSource = null;
}

function terminerDemande() {
  const request = activeRequest;
  if (!request) return;
  activeRequest = null;
  fermerEcouteStatut();
  try {
    if (request.address) localStorage.setItem(CONFIRMED_ADDRESS_KEY, request.address);
  } catch (_) { /* Le suivi en mémoire reste affiché. */ }
  try { effacerDemandeSauvegardee(); } catch (_) { /* Le suivi en mémoire reste affiché. */ }
  afficherEtatDemande(request, "completed");
  definirFormulaireVerrouille(true);
  completionTimer = window.setTimeout(() => {
    requestStatusEl.hidden = true;
    document.querySelector('input[name="cueillette"]').checked = true;
    definirFormulaireVerrouille(false);
    if (!utiliserAdresseConfirmee()) demanderPosition();
  }, 6000);
}

function recevoirStatutDemande(message) {
  if (!activeRequest || !message || message.event !== "message") return;
  const nextStatus = String(message.message || "").trim();
  if (nextStatus === "EN_ROUTE" && activeRequest.status === "pending") {
    activeRequest.status = nextStatus;
    try { sauvegarderDemande(activeRequest); } catch (_) { /* L'état courant reste disponible jusqu'au rechargement. */ }
    afficherEtatDemande(activeRequest, nextStatus);
  } else if (nextStatus === "COMPLETED") {
    terminerDemande();
  }
}

function ecouterStatutDemande(request) {
  fermerEcouteStatut();
  const streamUrl = `${NTFY_BASE_URL}${encodeURIComponent(request.statusTopic)}/sse?since=all`;
  statusSource = new EventSource(streamUrl);
  statusSource.onmessage = (event) => {
    try { recevoirStatutDemande(JSON.parse(event.data)); } catch (_) { /* Ignorer les événements invalides. */ }
  };
}

function restaurerDemandeActive() {
  try {
    const id = localStorage.getItem("active_request_id");
    if (!id) return false;
    const createdAt = Number(localStorage.getItem("active_request_created_at"));
    const statusTopic = localStorage.getItem("active_request_status_topic");
    const savedStatus = localStorage.getItem("active_request_status");
    const savedAddress = localStorage.getItem("active_request_address") || "";
    const cachedAddress = adresseDepuisCacheLocal();
    const age = Date.now() - createdAt;
    const expectedTopic = new RegExp(`^${NTFY_TOPIC}_s_[a-f0-9]{32}$`);
    if (!Number.isFinite(createdAt) || age < 0 || age > REQUEST_MAX_AGE || !expectedTopic.test(statusTopic || "") || !["pending", "EN_ROUTE"].includes(savedStatus)) {
      effacerDemandeSauvegardee();
      return false;
    }
    const address = savedAddress || cachedAddress || adresseConfirmeeEnregistree();
    activeRequest = { id, createdAt, statusTopic, status: savedStatus, address };
    adresseEl.value = address;
    definirFormulaireVerrouille(true);
    afficher("Demande en cours. Aucune nouvelle localisation GPS n’est nécessaire.", "ok");
    afficherEtatDemande(activeRequest, savedStatus);
    ecouterStatutDemande(activeRequest);
    return true;
  } catch (_) {
    try { effacerDemandeSauvegardee(); } catch (_) { /* localStorage indisponible. */ }
    return false;
  }
}

function creerDemandeActive(address) {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const token = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const statusTopic = `${NTFY_TOPIC}_s_${token}`;
  if (statusTopic.length > 64) throw new Error("Le sujet ntfy est trop long pour créer un canal de suivi.");
  const createdAt = Date.now();
  return {
    id: `REQ-${createdAt.toString(36).toUpperCase()}-${token.slice(0, 6).toUpperCase()}`,
    createdAt,
    statusTopic,
    status: "pending",
    address
  };
}

function distanceMetres(a, b) {
  const radians = (degres) => degres * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const valeur = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(valeur), Math.sqrt(1 - valeur));
}

function positionDansSecteur(pos) {
  let dedans = false;
  for (let i = 0, j = SECTEUR_DESSERVI.length - 1; i < SECTEUR_DESSERVI.length; j = i++) {
    const [latI, lonI] = SECTEUR_DESSERVI[i];
    const [latJ, lonJ] = SECTEUR_DESSERVI[j];
    const croise = (latI > pos.lat) !== (latJ > pos.lat) &&
      pos.lon < ((lonJ - lonI) * (pos.lat - latI)) / (latJ - latI) + lonI;
    if (croise) dedans = !dedans;
  }
  return dedans;
}

function adresseEnCache(pos) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (cache && typeof cache.address === "string" && cache.address.trim() &&
        Number.isFinite(cache.lat) && Number.isFinite(cache.lon) &&
        distanceMetres(pos, cache) <= CACHE_RADIUS_METERS) {
      return cache.address.split(",")[0].trim();
    }
  } catch (_) {
    // Cache absent, invalide ou inaccessible : continuer avec le géocodage.
  }
  return null;
}

function adresseConfirmeeEnregistree() {
  try {
    const address = localStorage.getItem(CONFIRMED_ADDRESS_KEY);
    return address ? address.trim() : "";
  } catch (_) {
    return "";
  }
}

function utiliserAdresseConfirmee() {
  const address = adresseConfirmeeEnregistree();
  if (!address) return false;
  position = null;
  adresse = null;
  adresseEl.value = address;
  adresseModifiee = true;
  manualMode = true;
  zoneWarningEl.hidden = true;
  mapEl.style.display = "none";
  mapLegendEl.hidden = true;
  coordinatesEl.hidden = true;
  afficher("Adresse confirmée enregistrée. Aucune localisation GPS nécessaire.", "ok");
  btn.disabled = false;
  return true;
}

function adresseDepuisCacheLocal() {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY));
    return cache && typeof cache.address === "string" ? cache.address.split(",")[0].trim() : "";
  } catch (_) {
    return "";
  }
}

function afficherCarte(pos) {
  mapEl.style.display = "block";
  if (typeof L === "undefined") {
    mapEl.textContent = "Carte indisponible pour le moment.";
    return;
  }

  if (!sectorMap) {
    sectorMap = L.map(mapEl, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(sectorMap);
    L.polygon(SECTEUR_DESSERVI, {
      color: "#2e7d32",
      fillColor: "#4caf50",
      fillOpacity: 0.35,
      weight: 3
    }).addTo(sectorMap);
    positionMarker = L.circleMarker([pos.lat, pos.lon], {
      radius: 8,
      color: "#fff",
      weight: 2,
      fillColor: "#1677d2",
      fillOpacity: 1
    }).addTo(sectorMap).bindPopup("Votre position estimée");
  } else {
    positionMarker.setLatLng([pos.lat, pos.lon]);
  }

  mapLegendEl.hidden = false;
  sectorMap.fitBounds(L.latLngBounds(SECTEUR_DESSERVI).extend([pos.lat, pos.lon]), {
    padding: [20, 20],
    maxZoom: 15
  });
  sectorMap.invalidateSize();
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=fr`;
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const d = await r.json();
  const details = d.address || {};
  const rue = details.road || details.residential || details.pedestrian || details.footway ||
    details.path || details.cycleway || details.living_street || details.unclassified;
  if (!rue) throw new Error("nom de rue introuvable");
  return [details.house_number, rue].filter(Boolean).join(" ");
}

function demanderPosition() {
  if (enCours) return;
  enCours = true;
  position = null;
  adresse = null;
  const adresseConfirmee = adresseConfirmeeEnregistree() || adresseEl.value.trim();
  adresseEl.value = adresseConfirmee;
  adresseModifiee = Boolean(adresseConfirmee);
  manualMode = false;
  zoneWarningEl.hidden = true;
  mapEl.style.display = "none";
  mapLegendEl.hidden = true;
  coordinatesEl.hidden = true;
  btn.disabled = true;

  if (!("geolocation" in navigator)) {
    afficher("❌ Votre navigateur ne supporte pas la géolocalisation. Utilisez Chrome, Safari, Firefox ou Edge à jour.", "err");
    enCours = false;
    manualMode = Boolean(adresseEl.value.trim());
    btn.disabled = !manualMode;
    return;
  }

  afficher("En attente de l’autorisation et de la position GPS…", "loading");

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      enCours = false;
      gpsHelpEl.hidden = true;
      position = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      const horsSecteur = !positionDansSecteur(position);
      zoneWarningEl.hidden = !horsSecteur;
      afficherCarte(position);
      coordinatesEl.textContent = `Coordonnées reçues : ${position.lat.toFixed(6)}, ${position.lon.toFixed(6)} (précision estimée ±${Math.round(pos.coords.accuracy)} m)`;
      coordinatesEl.hidden = false;

      afficher("Vérification d’une adresse enregistrée…", "loading");
      adresse = adresseEnCache(position);
      if (adresse) {
        if (!adresseModifiee) adresseEl.value = adresse;
        afficher("Merci de refaire affaire avec nous!", "ok");
        btn.disabled = false;
        return;
      }

      afficher("Recherche de l’adresse…", "loading");
      try {
        adresse = await reverseGeocode(position.lat, position.lon);
        if (!adresseModifiee) adresseEl.value = adresse;
        afficher("Vérifier l'adresse, sélectionner une option puis appuyez sur le bouton.", "ok");
      } catch (e) {
        adresse = null;
        afficher("Adresse introuvable (" + e.message + "). Veuillez saisir manuellement.", "err");
      }
      btn.disabled = false;
    },
    (err) => {
      enCours = false;
      const msgs = {
        1: "La localisation automatique est bloquée.",
        2: "❌ Position indisponible. Vérifiez que la localisation / le GPS de l'appareil est activé.",
        3: "⏱️ Délai dépassé. Appuyer sur le bouton pour réessayer."
      };
      manualMode = Boolean(adresseEl.value.trim());
      if (err.code === 1) {
        afficherAideGeolocalisation();
        afficher(msgs[err.code], "err");
        btn.disabled = !manualMode;
        return;
      }
      afficher(msgs[err.code] || "❌ Erreur de géolocalisation.", "err");
      btn.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
  );
}

async function envoyer() {
  if (!position && !manualMode && !utiliserAdresseConfirmee()) { demanderPosition(); return; }
  const adresseFinale = adresseEl.value.trim() || (position
    ? `Coordonnées GPS : ${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}`
    : "");
  if (!adresseFinale) {
    afficher("Saisissez une adresse pour continuer sans localisation.", "err");
    adresseEl.focus();
    return;
  }
  let request;
  try {
    request = creerDemandeActive(adresseFinale);
    sauvegarderDemande(request);
    activeRequest = request;
    definirFormulaireVerrouille(true);
    afficherEtatDemande(request, "pending");
    ecouterStatutDemande(request);
  } catch (e) {
    afficher("Impossible d'activer le suivi de la demande. Vérifiez le stockage local et réessayez.", "err");
    btn.disabled = false;
    return;
  }

  let cacheEnregistre = true;
  if (position && adresseEl.value.trim()) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...position, address: adresseFinale }));
    } catch (_) {
      cacheEnregistre = false;
    }
  }
  const consigneCueillette = document.querySelector('input[name="cueillette"]:checked').value;
  const iconeConsigne = consigneCueillette.startsWith("Sonner svp") ? "🔔" : "🚪";
  const avertissementSecteur = position && !positionDansSecteur(position)
    ? "⚠️ Position à l’extérieur du secteur desservi; service non garanti.\n"
    : "";
  const detailsPosition = position
    ? `${position.lat.toFixed(5)}, ${position.lon.toFixed(5)}\nhttps://www.openstreetmap.org/?mlat=${position.lat}&mlon=${position.lon}#map=17/${position.lat}/${position.lon}`
    : "Localisation non fournie (adresse saisie manuellement).";
  const message =
    `🧺 Un visiteur a cliqué !\n\n` +
    `Demande : ${request.id}\n` +
    `Adresse : ${adresseFinale}\n` +
    avertissementSecteur +
    `Consigne pour la cueillette : ${iconeConsigne}\n` +
    detailsPosition;

  afficher(position && cacheEnregistre
    ? "Adresse enregistrée sur cet appareil. Envoi de la notification…"
    : position
      ? "Envoi de la notification… (le cache local est indisponible)"
      : "Envoi de la demande avec l’adresse saisie…", "loading");
  try {
    const statusUrl = `${NTFY_BASE_URL}${encodeURIComponent(request.statusTopic)}`;
    const r = await fetch(NTFY_BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: NTFY_TOPIC,
        title: "Nouvelle cueillette de consignes",
        tags: ["basket"],
        priority: 4,
        message,
        actions: [
          { action: "http", label: "🚴 En route", url: statusUrl, method: "POST", body: "EN_ROUTE", clear: true },
          { action: "http", label: "✅ Terminé", url: statusUrl, method: "POST", body: "COMPLETED", clear: true }
        ]
      })
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    if (activeRequest === request) {
      afficher(position && cacheEnregistre
        ? "Notification envoyée ! Adresse conservée pour la prochaine demande."
        : "Notification envoyée !", "ok");
    }
  } catch (e) {
    if (activeRequest === request) {
      activeRequest = null;
      fermerEcouteStatut();
      requestStatusEl.hidden = true;
      try { effacerDemandeSauvegardee(); } catch (_) { /* Ignorer si le stockage est inaccessible. */ }
      definirFormulaireVerrouille(false);
    }
    afficher("⚠️ L'envoi a échoué (" + e.message + "). Réessayer avec le bouton.", "err");
  }
}

btn.addEventListener("click", envoyer);
document.getElementById("reset-app").addEventListener("click", reinitialiserApplication);
resetConfirmDialog.addEventListener("close", () => {
  if (resetConfirmDialog.returnValue === "confirm") appliquerReinitialisation();
});
document.addEventListener("DOMContentLoaded", restaurerDemandeActive);
window.addEventListener("load", () => {
  if (!activeRequest && !utiliserAdresseConfirmee()) demanderPosition();
});
