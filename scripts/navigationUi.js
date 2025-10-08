export function renderNavigationStatus(container, navigation, routePlan, progress) {
  container.innerHTML = "";

  if (!routePlan) {
    container.append(createPlaceholder("내비게이션을 시작하면 현재 위치와 진행 상황이 표시됩니다."));
    return;
  }

  if (!navigation?.active) {
    container.append(createPlaceholder("계산된 경로로 내비게이션을 시작할 수 있습니다."));
    return;
  }

  const header = document.createElement("h3");
  header.className = "navigation-status__title";
  header.textContent = "내비게이션 진행 중";

  const startTime = navigation.startedAt ? new Date(navigation.startedAt) : null;
  const startedText = startTime ? startTime.toLocaleTimeString() : "방금";

  const info = document.createElement("p");
  info.textContent = `시작 시각: ${startedText}`;

  const status = document.createElement("p");
  status.className = "navigation-status__position";

  if (navigation.error) {
    status.textContent = `위치 정보를 가져올 수 없습니다: ${navigation.error}`;
  } else if (navigation.currentPosition) {
    const position = navigation.currentPosition;
    const lastUpdated = navigation.lastUpdatedAt ? new Date(navigation.lastUpdatedAt) : null;
    const accuracyText = position.accuracy ? `(±${Math.round(position.accuracy)}m)` : "";
    const timeText = lastUpdated ? `업데이트: ${lastUpdated.toLocaleTimeString()}` : "";
    status.textContent = `현재 위치: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)} ${accuracyText} ${timeText}`;
  } else {
    status.textContent = "위치 정보 수신 중...";
  }

  container.append(header, info, status);

  if (progress && routePlan.segments) {
    const segmentIndex = progress.closestSegmentIndex;
    const activeSegment = routePlan.segments[segmentIndex];

    const progressPercent = Math.round((progress.progressRatio ?? 0) * 100);
    const remainingText = formatDistance(progress.remainingMeters);

    const progressWrapper = document.createElement("div");
    progressWrapper.className = "navigation-status__progress";

    const bar = document.createElement("div");
    bar.className = "navigation-status__progress-bar";

    const barFill = document.createElement("div");
    barFill.className = "navigation-status__progress-bar-fill";
    barFill.style.width = `${progressPercent}%`;

    bar.append(barFill);
    progressWrapper.append(bar);

    const progressLabel = document.createElement("p");
    progressLabel.className = "navigation-status__progress-label";
    progressLabel.textContent = `진행률 ${progressPercent}% · 남은 거리 ${remainingText}`;

    container.append(progressWrapper, progressLabel);

    if (activeSegment) {
      const segmentInfo = document.createElement("p");
      segmentInfo.innerHTML = `<strong>현재 구간:</strong> 구간 ${segmentIndex + 1} (${activeSegment.fromLabel} → ${activeSegment.toLabel})`;
      container.append(segmentInfo);

      const leg = activeSegment.legs?.[progress.closestLegIndex];
      if (leg) {
        const legInfo = document.createElement("p");
        const distanceHint = progress.distanceToLegMeters != null
          ? `약 ${formatDistance(progress.distanceToLegMeters)} 이내`
          : "";
        legInfo.innerHTML = `<strong>다음 안내:</strong> ${leg.modeLabel}${leg.details ? ` · ${leg.details}` : ""} ${distanceHint}`;
        container.append(legInfo);
      }
    }
  }
}

function createPlaceholder(text) {
  const p = document.createElement("p");
  p.className = "placeholder";
  p.textContent = text;
  return p;
}

function formatDistance(meters) {
  if (meters == null || Number.isNaN(meters)) return "--";
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${Math.round(meters)}m`;
}
