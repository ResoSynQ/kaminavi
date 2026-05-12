const START = [34.66210623039245, 135.64012284288287];
const GOAL = [34.66998142636652, 135.6499928373567];
const TOUCH_RADIUS_PX = 15;
const EVENT_DURATION_MS = 3000;

const slider = document.querySelector("#routeSlider");
const progressValue = document.querySelector("#progressValue");
const eventLayer = document.querySelector("#eventLayer");
const dialogue = document.querySelector("#dialogue");
const character = document.querySelector("#character");

const map = L.map("map", {
  zoomControl: false,
  attributionControl: true,
  preferCanvas: true
}).setView(START, 17);

L.control.zoom({ position: "bottomleft" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const playerIcon = L.divIcon({
  className: "",
  html: '<div class="player-marker"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

const eventIcon = L.divIcon({
  className: "",
  html: '<div class="event-pin"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 24]
});

let routeLatLngs = [];
let routeSegments = [];
let routeLength = 0;
let eventData = [];
let playerMarker;
let activeEvent = false;
let queuedEvent = null;
let touchingIds = new Set();
let lastPosition = L.latLng(START);

Promise.all([
  fetch("assets/data/map.geojson").then((response) => response.json()),
  fetch("assets/data/events.json").then((response) => response.json())
]).then(([geojson, events]) => {
  eventData = normalizeEvents(events);
  initializeRoute(geojson);
  initializeEvents(eventData);
  updatePlayer(0, { pan: true });
  requestAnimationFrame(checkEventContact);
});

function initializeRoute(geojson) {
  const lineFeature = geojson.features.find((feature) => feature.geometry.type === "LineString");
  routeLatLngs = lineFeature.geometry.coordinates.map(([lng, lat]) => L.latLng(lat, lng));
  routeLatLngs[0] = L.latLng(START);
  routeLatLngs[routeLatLngs.length - 1] = L.latLng(GOAL);
  routeSegments = buildSegments(routeLatLngs);
  routeLength = routeSegments.reduce((sum, segment) => sum + segment.length, 0);

  L.polyline(routeLatLngs, {
    color: "#ffd84d",
    weight: 12,
    opacity: 0.78
  }).addTo(map);

  L.polyline(routeLatLngs, {
    color: "#f36f45",
    weight: 6,
    opacity: 0.95
  }).addTo(map);

  playerMarker = L.marker(routeLatLngs[0], {
    icon: playerIcon,
    zIndexOffset: 1000
  }).addTo(map);
}

function initializeEvents(events) {
  events.forEach((event) => {
    const latLng = L.latLng(event.latitude, event.longitude);
    L.marker(latLng, {
      icon: eventIcon,
      keyboard: false,
      title: event.placeName || event.category
    }).addTo(map);
  });
}

function normalizeEvents(events) {
  return events.map((event) => {
    if (event.id === 1) {
      return { ...event, latitude: START[0], longitude: START[1] };
    }

    if (event.id === 8) {
      return { ...event, latitude: GOAL[0], longitude: GOAL[1] };
    }

    return event;
  });
}

function buildSegments(points) {
  return points.slice(0, -1).map((from, index) => {
    const to = points[index + 1];
    return {
      from,
      to,
      length: map.distance(from, to)
    };
  });
}

function pointAtProgress(progress) {
  const targetDistance = routeLength * progress;
  let traveled = 0;

  for (const segment of routeSegments) {
    if (traveled + segment.length >= targetDistance) {
      const ratio = segment.length === 0 ? 0 : (targetDistance - traveled) / segment.length;
      return L.latLng(
        segment.from.lat + (segment.to.lat - segment.from.lat) * ratio,
        segment.from.lng + (segment.to.lng - segment.from.lng) * ratio
      );
    }
    traveled += segment.length;
  }

  return routeLatLngs[routeLatLngs.length - 1];
}

function updatePlayer(rawValue, options = {}) {
  const progress = Number(rawValue) / Number(slider.max);
  const latLng = pointAtProgress(progress);
  lastPosition = latLng;
  playerMarker.setLatLng(latLng);
  progressValue.textContent = `${Math.round(progress * 100)}%`;

  if (options.pan) {
    map.setView(latLng, map.getZoom(), { animate: true });
  } else {
    map.panTo(latLng, { animate: true, duration: 0.2 });
  }

  checkEventContact();
}

function checkEventContact() {
  if (!eventData.length || !playerMarker) return;

  const playerPoint = map.latLngToContainerPoint(lastPosition);
  const currentTouching = new Set();

  for (const event of eventData) {
    const eventPoint = map.latLngToContainerPoint([event.latitude, event.longitude]);
    const distance = playerPoint.distanceTo(eventPoint);

    if (distance <= TOUCH_RADIUS_PX) {
      currentTouching.add(event.id);
      if (!touchingIds.has(event.id)) {
        triggerEvent(event);
      }
    }
  }

  touchingIds = currentTouching;
}

function triggerEvent(event) {
  if (activeEvent) {
    queuedEvent = event;
    return;
  }

  activeEvent = true;
  dialogue.textContent = event.text;
  character.src = `assets/characters/${event.image}`;
  character.alt = event.character;
  eventLayer.classList.add("is-visible");

  window.setTimeout(() => {
    eventLayer.classList.remove("is-visible");
    window.setTimeout(() => {
      dialogue.textContent = "";
      character.removeAttribute("src");
      activeEvent = false;
      if (queuedEvent) {
        const nextEvent = queuedEvent;
        queuedEvent = null;
        triggerEvent(nextEvent);
      }
    }, 360);
  }, EVENT_DURATION_MS);
}

slider.addEventListener("input", (event) => {
  updatePlayer(event.target.value);
});

map.on("zoom move resize", () => {
  checkEventContact();
});
