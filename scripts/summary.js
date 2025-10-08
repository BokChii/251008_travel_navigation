// Renders the trip summary panel based on the latest route plan data.
export function renderSummary(container, routePlan) {
  container.innerHTML = "";

  if (!routePlan) {
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder";
    placeholder.textContent = "경로를 계산하면 총 소요 시간과 이동 정보를 확인할 수 있어요.";
    container.append(placeholder);
    return;
  }

  container.append(createHeroCard(routePlan));
  routePlan.segments?.forEach((segment, index) => {
    container.append(createSegmentCard(segment, index));
  });
}

function createHeroCard(routePlan) {
  const { totalDurationText, totalDistanceText, arrivalTimeText } = routePlan;
  const card = document.createElement("article");
  card.className = "summary-card";

  card.innerHTML = `
    <h3>전체 여정 요약</h3>
    <p><strong>총 소요 시간:</strong> ${totalDurationText}</p>
    <p><strong>총 이동 거리:</strong> ${totalDistanceText}</p>
    ${arrivalTimeText ? `<p><strong>예상 도착:</strong> ${arrivalTimeText}</p>` : ""}
  `;

  return card;
}

function createSegmentCard(segment, index) {
  const card = document.createElement("article");
  card.className = "summary-card summary-card--segment";
  card.style.borderLeft = `6px solid ${segment.color}`;

  const header = document.createElement("div");
  header.className = "summary-card__header";

  const colorDot = document.createElement("span");
  colorDot.className = "summary-card__color";
  colorDot.style.backgroundColor = segment.color;

  const title = document.createElement("h3");
  title.textContent = `구간 ${index + 1}`;

  const mapButton = document.createElement("button");
  mapButton.type = "button";
  mapButton.className = "btn btn--ghost btn--small";
  mapButton.dataset.summaryHighlight = index;
  mapButton.textContent = "지도에서 보기";

  header.append(colorDot, title, mapButton);
  card.append(header);

  const routeLine = document.createElement("p");
  routeLine.innerHTML = `<strong>${segment.fromLabel}</strong> → <strong>${segment.toLabel}</strong>`;
  card.append(routeLine);

  card.insertAdjacentHTML(
    "beforeend",
    `
      <p><strong>소요 시간:</strong> ${segment.durationText}</p>
      <p><strong>이동 거리:</strong> ${segment.distanceText}</p>
    `
  );

  if (segment.legs?.length) {
    const list = document.createElement("ul");
    list.className = "summary-card__legs";
    segment.legs.forEach((leg) => {
      const item = document.createElement("li");
      const details = [leg.durationText, leg.distanceText, leg.details]
        .filter(Boolean)
        .join(" · ");
      item.innerHTML = `<strong>${leg.modeLabel}</strong>${details ? ` ${details}` : ""}`;
      list.append(item);
    });
    card.append(list);
  }

  return card;
}
