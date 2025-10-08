import { getElements, renderWaypoints } from "./ui.js";
import { getState, subscribe, updateState, resetState } from "./state.js";
import { renderSummary } from "./summary.js";
import { renderNavigationStatus } from "./navigationUi.js";
import { loadGoogleMapsSdk, requestDirections } from "./api.js";
import {
  initMap,
  renderRoute,
  clearRoute,
  highlightSegment,
  updateUserLocation,
} from "./map.js";
import { buildRoutePlan } from "./routing.js";
import { getGoogleMapsApiKey } from "./config.js";
import { initAutocomplete } from "./autocomplete.js";
import { getRouteColors } from "./palette.js";
import { beginNavigationTracking } from "./navigationTracker.js";
import { calculateNavigationProgress } from "./progress.js";
import { showToast } from "./toast.js";

const config = {
  googleMapsApiKey: getGoogleMapsApiKey(),
};

const TOAST_COOLDOWN_MS = 15_000;
const TOAST_DISTANCE_THRESHOLD_METERS = 30;

let googleMaps;
let mapInstance;
let stopNavigationTracking = null;
let lastHighlightedSegment = null;
let lastToastTimestamp = 0;

async function bootstrap() {
  const elements = getElements();
  assertElements(elements);

  subscribe((latestState) => {
    manageNavigationTracking(latestState);
    const progress = computeProgress(latestState);
    applyNavigationHighlight(latestState, progress);
    maybeAnnounceNextStep(latestState, progress);
    syncUi(elements, latestState, progress);
  });
  syncUi(elements, getState(), null);

  wireEventHandlers(elements);

  if (!config.googleMapsApiKey) {
    document.getElementById("map").textContent = "Google Maps API 키가 설정되지 않았습니다.";
    console.warn("Google Maps API 키를 meta 태그에 설정하세요.");
    return;
  }

  try {
    googleMaps = await loadGoogleMapsSdk({
      apiKey: config.googleMapsApiKey,
      libraries: ["places"],
    });

    mapInstance = initMap(googleMaps, { center: { lat: 37.5665, lng: 126.978 }, zoom: 13 });
    const refreshedElements = getElements();
    initAutocomplete(googleMaps, refreshedElements, {
      onOriginSelect: (place) => handlePlaceSelection("origin", place, refreshedElements.origin),
      onDestinationSelect: (place) => handlePlaceSelection("destination", place, refreshedElements.destination),
      onWaypointSelect: (place) => handleWaypointSelection(place, refreshedElements.waypointInput),
    });
  } catch (error) {
    console.error(error);
    document.getElementById("map").textContent = "지도를 불러오지 못했습니다. API 키를 확인하세요.";
  }
}

function wireEventHandlers({
  form,
  origin,
  destination,
  waypointInput,
  addWaypoint,
  clearButton,
  summaryOutput,
  startNavigation,
  exitNavigation,
}) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const originValue = origin.value.trim();
    const destinationValue = destination.value.trim();
    if (!originValue || !destinationValue) return;

    updateState((draft) => {
      draft.origin = draft.origin ?? { label: originValue, address: originValue };
      draft.destination = draft.destination ?? { label: destinationValue, address: destinationValue };
      resetNavigationDraft(draft);
    });

    calculateRoute();
  });

  addWaypoint.addEventListener("click", () => {
    const value = waypointInput.value.trim();
    if (!value) return;

    updateState((draft) => {
      draft.waypoints = [...draft.waypoints, { label: value, address: value, location: null }];
      resetNavigationDraft(draft);
    });

    waypointInput.value = "";
  });

  waypointInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addWaypoint.click();
    }
  });

  clearButton.addEventListener("click", () => {
    resetState();
    origin.value = "";
    destination.value = "";
    waypointInput.value = "";
    clearRoute();
    updateUserLocation(null);
    lastHighlightedSegment = null;
    setViewMode("planning");
  });

  summaryOutput.addEventListener("click", (event) => {
    const button = event.target.closest("[data-summary-highlight]");
    if (!button) return;
    const index = Number(button.dataset.summaryHighlight);
    if (Number.isFinite(index)) {
      highlightSegment(index, { focus: true });
      lastHighlightedSegment = index;
    }
  });

  startNavigation.addEventListener("click", () => {
    const now = Date.now();
    updateState((draft) => {
      draft.navigation.active = true;
      draft.navigation.startedAt = now;
      draft.navigation.currentPosition = null;
      draft.navigation.lastUpdatedAt = null;
      draft.navigation.error = null;
    });
    setViewMode("navigation");
    showToast({ message: "내비게이션을 시작합니다." });
  });

  exitNavigation.addEventListener("click", () => {
    updateState((draft) => {
      draft.navigation.active = false;
      draft.navigation.currentPosition = null;
      draft.navigation.lastUpdatedAt = null;
    });
    setViewMode("planning");
    showToast({ message: "내비게이션을 종료했습니다." });
  });
}

function syncUi({
  waypointList,
  summaryOutput,
  origin,
  destination,
  startNavigation,
  exitNavigation,
  navigationStatus,
}, latestState, progress) {
  if (latestState.origin?.address) {
    origin.value = latestState.origin.address;
  }
  if (latestState.destination?.address) {
    destination.value = latestState.destination.address;
  }

  renderWaypoints(
    waypointList,
    latestState.waypoints.map((entry) => entry.label),
    {
      onRemove: (index) =>
        updateState((draft) => {
          draft.waypoints = draft.waypoints.filter((_, i) => i !== index);
          resetNavigationDraft(draft);
          setViewMode("planning");
        }),
      onMoveUp: (index) =>
        updateState((draft) => {
          if (index === 0) return;
          const next = [...draft.waypoints];
          [next[index - 1], next[index]] = [next[index], next[index - 1]];
          draft.waypoints = next;
          resetNavigationDraft(draft);
          setViewMode("planning");
        }),
      onMoveDown: (index) =>
        updateState((draft) => {
          const { waypoints } = draft;
          if (index === waypoints.length - 1) return;
          const next = [...waypoints];
          [next[index], next[index + 1]] = [next[index + 1], next[index]];
          draft.waypoints = next;
          resetNavigationDraft(draft);
          setViewMode("planning");
        }),
    }
  );

  startNavigation.disabled = !latestState.routePlan;
  startNavigation.textContent = latestState.navigation.active ? "내비게이션 진행 중" : "내비게이션 시작";
  exitNavigation.hidden = !latestState.navigation.active;

  renderNavigationStatus(navigationStatus, latestState.navigation, latestState.routePlan, progress);
  renderSummary(summaryOutput, latestState.routePlan);
}

async function calculateRoute() {
  const current = getState();
  const stops = buildStopList(current);
  if (!googleMaps || stops.length < 2) return;

  try {
    const segments = [];
    for (let i = 0; i < stops.length - 1; i += 1) {
      const origin = extractDirectionsInput(stops[i]);
      const destination = extractDirectionsInput(stops[i + 1]);
      if (!origin || !destination) {
        throw new Error("경로 계산에 필요한 위치 정보가 부족합니다.");
      }

      const segmentResult = await requestDirections({
        google: googleMaps,
        origin,
        destination,
      });
      segments.push(segmentResult);
    }

    const colors = getRouteColors(segments.length);
    const labeledStops = stops.map((stop, index) => ({
      ...stop,
      markerLabel: markerLabelForIndex(index, stops.length),
    }));

    renderRoute(googleMaps, { segments, stops: labeledStops, colors });
    lastHighlightedSegment = null;

    updateState((draft) => {
      draft.routePlan = buildRoutePlan({ segments, stops: labeledStops, colors });
    });
  } catch (error) {
    console.error(error);
    alert("경로를 불러오지 못했습니다. 다시 시도해주세요.");
  }
}

function manageNavigationTracking(state) {
  if (state.navigation.active) {
    if (!stopNavigationTracking) {
      stopNavigationTracking = beginNavigationTracking({
        onPosition: (position) => {
          updateState((draft) => {
            draft.navigation.currentPosition = position;
            draft.navigation.lastUpdatedAt = Date.now();
            draft.navigation.error = null;
          });
          updateUserLocation(position, { centerMap: true });
        },
        onError: (error) => {
          console.error(error);
          updateState((draft) => {
            draft.navigation.error = error.message;
            draft.navigation.active = false;
          });
          showToast({ message: "위치 정보를 가져올 수 없습니다.", type: "warning" });
        },
      });
    }
  } else {
    if (stopNavigationTracking) {
      stopNavigationTracking();
      stopNavigationTracking = null;
    }
    updateUserLocation(null);
    if (state.navigation.currentPosition || state.navigation.lastUpdatedAt) {
      updateState((draft) => {
        draft.navigation.currentPosition = null;
        draft.navigation.lastUpdatedAt = null;
      });
    }
  }
}

function applyNavigationHighlight(state, progress) {
  if (!state.routePlan || !state.routePlan.segments?.length) return;

  if (state.navigation.active && progress) {
    if (progress.closestSegmentIndex !== lastHighlightedSegment) {
      highlightSegment(progress.closestSegmentIndex, { focus: false });
      lastHighlightedSegment = progress.closestSegmentIndex;
    }
  }
}

function maybeAnnounceNextStep(state, progress) {
  if (!state.navigation.active || !progress || !state.routePlan?.segments) return;

  const now = Date.now();
  if (now - lastToastTimestamp < TOAST_COOLDOWN_MS) return;

  const segment = state.routePlan.segments[progress.closestSegmentIndex];
  const leg = segment?.legs?.[progress.closestLegIndex];
  if (!leg) return;

  const distance = progress.distanceToLegMeters ?? 0;
  if (distance > TOAST_DISTANCE_THRESHOLD_METERS) return;

  const message = `다음 안내: ${leg.modeLabel}${leg.details ? ` · ${leg.details}` : ""}`;
  showToast({ message });
  lastToastTimestamp = now;
}

function computeProgress(state) {
  if (!state.routePlan || !state.navigation.currentPosition) return null;
  return calculateNavigationProgress(state.routePlan, state.navigation.currentPosition);
}

function resetNavigationDraft(draft) {
  draft.navigation.active = false;
  draft.navigation.startedAt = null;
  draft.navigation.currentPosition = null;
  draft.navigation.lastUpdatedAt = null;
  draft.navigation.error = null;
  lastToastTimestamp = 0;
}

function setViewMode(view) {
  const layout = document.querySelector(".layout");
  if (!layout) return;
  layout.dataset.view = view;
}

function markerLabelForIndex(index, total) {
  if (index === 0) return "출발";
  if (index === total - 1) return "도착";
  return `경유 ${index}`;
}

function buildStopList(state) {
  const list = [];
  if (state.origin) list.push(state.origin);
  state.waypoints.forEach((wp) => list.push(wp));
  if (state.destination) list.push(state.destination);
  return list;
}

function extractDirectionsInput(entry) {
  if (!entry) return null;
  if (entry.location) return entry.location;
  if (entry.placeId) return { placeId: entry.placeId };
  return entry.address ?? entry.label ?? null;
}

function handlePlaceSelection(key, place, inputElement) {
  inputElement.value = place.address;
  updateState((draft) => {
    draft[key] = { label: place.name ?? place.address, ...place };
    resetNavigationDraft(draft);
  });
}

function handleWaypointSelection(place, inputElement) {
  updateState((draft) => {
    draft.waypoints = [...draft.waypoints, { label: place.name ?? place.address, ...place }];
    resetNavigationDraft(draft);
  });
  inputElement.value = "";
}

function assertElements(elements) {
  Object.entries(elements).forEach(([key, value]) => {
    if (!(value instanceof HTMLElement || value instanceof HTMLFormElement)) {
      throw new Error(`${key} 요소를 찾을 수 없습니다.`);
    }
  });
}

bootstrap();
