// Handles DOM interactions for forms, waypoint list, and user-triggered events.
const selectors = {
  form: "#route-form",
  origin: "#origin-input",
  destination: "#destination-input",
  waypointInput: "#waypoint-input",
  waypointList: "#waypoint-list",
  addWaypoint: "#add-waypoint",
  clearButton: "#clear-route",
  startNavigation: "#start-navigation",
  exitNavigation: "#exit-navigation",
  summaryOutput: "#summary-output",
  navigationStatus: "#navigation-status",
};

export function getElements() {
  return Object.fromEntries(
    Object.entries(selectors).map(([key, selector]) => [key, document.querySelector(selector)])
  );
}

export function renderWaypoints(listElement, waypoints, { onRemove, onMoveUp, onMoveDown }) {
  listElement.innerHTML = "";

  if (!waypoints.length) {
    const empty = document.createElement("li");
    empty.className = "placeholder";
    empty.textContent = "추가된 경유지가 없습니다.";
    listElement.append(empty);
    return;
  }

  waypoints.forEach((label, index) => {
    const item = document.createElement("li");
    item.className = "waypoint-item";

    const name = document.createElement("span");
    name.className = "waypoint-item__label";
    name.textContent = label;

    const actions = document.createElement("div");
    actions.className = "waypoint-item__actions";

    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.className = "btn btn--ghost";
    upButton.textContent = "▲";
    upButton.disabled = index === 0;
    upButton.addEventListener("click", () => onMoveUp(index));

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.className = "btn btn--ghost";
    downButton.textContent = "▼";
    downButton.disabled = index === waypoints.length - 1;
    downButton.addEventListener("click", () => onMoveDown(index));

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn btn--ghost";
    removeButton.textContent = "삭제";
    removeButton.addEventListener("click", () => onRemove(index));

    actions.append(upButton, downButton, removeButton);
    item.append(name, actions);
    listElement.append(item);
  });
}
