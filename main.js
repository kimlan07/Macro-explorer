const svg = d3.select("#chart");
const container = document.getElementById("chart-container");
const tooltip = d3.select("#tooltip");

const currentDayEl = document.getElementById("current-day");
const currentHourEl = document.getElementById("current-hour");
const sliderHourLabel = document.getElementById("slider-hour-label");
const stationDetailsEl = document.getElementById("station-details");
const narrativeTitleEl = document.getElementById("narrative-title");
const narrativeTextEl = document.getElementById("narrative-text");
const stationProfileSvg = d3.select("#station-profile-chart");
const stationProfileEmptyEl = document.getElementById("station-profile-empty");
const globalTimelineSvg = d3.select("#global-timeline-chart");
const globalTimelineContextEl = document.getElementById("global-timeline-context");
const legendDots = document.querySelectorAll(".legend-dot");
const legendLabelSpans = document.querySelectorAll(".legend-row span");

const hourSlider = document.getElementById("hour-slider");
const playBtn = document.getElementById("play-btn");
const dayButtons = document.querySelectorAll(".day-btn");
const boroughButtons = document.querySelectorAll(".borough-btn");
const resetZoomBtn = document.getElementById("reset-zoom-btn");

const width = container.clientWidth;
const height = container.clientHeight;

svg.attr("viewBox", `0 0 ${width} ${height}`);

const margin = { top: 20, right: 20, bottom: 20, left: 20 };
const innerWidth = width - margin.left - margin.right;
const innerHeight = height - margin.top - margin.bottom;

const g = svg.append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const zoomGroup = g.append("g").attr("class", "zoom-group");
const mapLayer = zoomGroup.append("g").attr("class", "map-layer");
const labelsLayer = zoomGroup.append("g").attr("class", "labels-layer");
const stationsLayer = zoomGroup.append("g").attr("class", "stations-layer");

let currentZoomK = 1;

const zoom = d3.zoom()
  .scaleExtent([1, 8])
  .on("zoom", (event) => {
    zoomGroup.attr("transform", event.transform);
    currentZoomK = event.transform.k;

    if (stationsSelection && rScale) {
      stationsSelection.attr("r", d => rScale(d.ridership) / currentZoomK);
    }
  });

svg.call(zoom);

let currentDay = "Weekday";
let currentHour = 6;
let isPlaying = false;
let playInterval = null;

let allData = [];
let stationMeta = [];
let stationMap = new Map();
let boroughGeojson = null;
let projection = null;
let pathGenerator = null;
let maxRidership = 1;
let rScale = null;
let opacityScale = null;
let stationsSelection = null;
let selectedComplexId = null;
let selectedBorough = "All";
let globalTimelineState = null;

function formatHour(hour) {
  if (hour === null || hour === undefined || Number.isNaN(hour)) {
    return "—";
  }
  const padded = String(hour).padStart(2, "0");
  return `${padded}:00`;
}

function formatRidership(value) {
  return d3.format(",")(Math.round(value || 0));
}

function updateHourLabel() {
  const label = formatHour(currentHour);
  if (currentHourEl) currentHourEl.textContent = label;
  if (sliderHourLabel) sliderHourLabel.textContent = label;
}

function updateDayLabel() {
  if (currentDayEl) currentDayEl.textContent = currentDay;
}

function getNarrativeForTime(dayType, hour) {
  const weekend = dayType === "Saturday" || dayType === "Sunday";

  if (hour >= 5 && hour <= 8) {
    return weekend
      ? {
          title: "Morning lift-off",
          text: "Weekend activity starts later, with ridership rising around neighborhood hubs and major destinations."
        }
      : {
          title: "Early morning ramp-up",
          text: "The network is waking up quickly as commute corridors begin to fill and transfer stations gain momentum."
        };
  }

  if (hour >= 9 && hour <= 11) {
    return weekend
      ? {
          title: "Late-morning spread",
          text: "Trips are more dispersed, with steady movement toward shopping areas, parks, and cultural centers."
        }
      : {
          title: "Post-rush transition",
          text: "After the peak commute wave, demand remains strong but begins to distribute more evenly across boroughs."
        };
  }

  if (hour >= 12 && hour <= 15) {
    return {
      title: "Midday balance",
      text: "Ridership settles into a broad, citywide pattern with moderate activity across many stations."
    };
  }

  if (hour >= 16 && hour <= 19) {
    return weekend
      ? {
          title: "Evening build",
          text: "Weekend evening travel strengthens as riders concentrate around entertainment and dining districts."
        }
      : {
          title: "Evening rush intensifies",
          text: "The return commute drives another major surge, with heavier demand through core transfer points."
        };
  }

  if (hour >= 20 && hour <= 23) {
    return {
      title: "Nighttime taper",
      text: "Demand gradually contracts from a citywide pattern to fewer high-activity corridors and hubs."
    };
  }

  return {
    title: "Overnight low",
    text: "Late-night service remains active, but ridership is sparse and concentrated in essential travel paths."
  };
}

function updateNarrativeAnnotation() {
  if (!narrativeTitleEl || !narrativeTextEl) return;
  const narrative = getNarrativeForTime(currentDay, currentHour);
  narrativeTitleEl.textContent = narrative.title;
  narrativeTextEl.textContent = narrative.text;
}

function initializeGlobalTimeline() {
  if (!globalTimelineSvg || globalTimelineSvg.empty()) return;

  const width = 680;
  const height = 130;
  const margin = { top: 8, right: 12, bottom: 24, left: 46 };

  globalTimelineSvg.attr("viewBox", `0 0 ${width} ${height}`);
  globalTimelineSvg.selectAll("*").remove();

  const x = d3.scaleLinear()
    .domain([0, 23])
    .range([margin.left, width - margin.right]);

  const y = d3.scaleLinear()
    .domain([0, 1])
    .range([height - margin.bottom, margin.top]);

  const gridG = globalTimelineSvg.append("g")
    .attr("class", "global-grid")
    .attr("transform", `translate(${margin.left},0)`);

  const xAxisG = globalTimelineSvg.append("g")
    .attr("class", "global-axis")
    .attr("transform", `translate(0,${height - margin.bottom})`);

  const yAxisG = globalTimelineSvg.append("g")
    .attr("class", "global-axis")
    .attr("transform", `translate(${margin.left},0)`);

  const path = globalTimelineSvg.append("path")
    .attr("class", "global-line");

  const hourRule = globalTimelineSvg.append("line")
    .attr("class", "global-hour-rule");

  const hourDot = globalTimelineSvg.append("circle")
    .attr("class", "global-hour-dot")
    .attr("r", 3.6);

  globalTimelineState = { width, height, margin, x, y, gridG, xAxisG, yAxisG, path, hourRule, hourDot };
}

function getGlobalTimelineSeries() {
  const totals = Array.from({ length: 24 }, (_, hour) => ({ hour, ridership: 0 }));

  allData.forEach(d => {
    if (d.day_type !== currentDay) return;
    if (selectedBorough !== "All" && d.borough !== selectedBorough) return;
    totals[d.hour].ridership += d.ridership;
  });

  return totals;
}

function updateGlobalTimeline() {
  if (!globalTimelineState) return;

  const { width, height, margin, x, y, gridG, xAxisG, yAxisG, path, hourRule, hourDot } = globalTimelineState;
  const series = getGlobalTimelineSeries();
  const yMax = d3.max(series, d => d.ridership) || 1;

  y.domain([0, yMax]).nice();

  const line = d3.line()
    .x(d => x(d.hour))
    .y(d => y(d.ridership));

  gridG.call(
    d3.axisLeft(y)
      .ticks(3)
      .tickSize(-(width - margin.left - margin.right))
      .tickFormat("")
  ).call(g => g.select(".domain").remove());

  xAxisG.call(d3.axisBottom(x).ticks(6).tickFormat(d => `${String(Math.round(d)).padStart(2, "0")}:00`));
  yAxisG.call(d3.axisLeft(y).ticks(3).tickFormat(v => d3.format("~s")(v)));

  path.datum(series).attr("d", line);

  const currentPoint = series.find(d => d.hour === currentHour) || { hour: currentHour, ridership: 0 };

  hourRule
    .attr("x1", x(currentHour))
    .attr("x2", x(currentHour))
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom);

  hourDot
    .attr("cx", x(currentPoint.hour))
    .attr("cy", y(currentPoint.ridership));

  if (globalTimelineContextEl) {
    const boroughLabel = selectedBorough === "All" ? "All boroughs" : selectedBorough;
    globalTimelineContextEl.textContent = `${currentDay} · ${boroughLabel}`;
  }
}

function updateStationDetails(d) {
  stationDetailsEl.innerHTML = `
    <p><strong>${d.station_name}</strong></p>
    <p><span class="muted">Borough:</span> ${d.borough}</p>
    <p><span class="muted">Current ridership:</span> ${formatRidership(d.ridership)}</p>
    <p><span class="muted">Peak hour:</span> ${formatHour(d.peak_hour)}</p>
    <p><span class="muted">Daily total:</span> ${formatRidership(d.daily_total)}</p>
  `;
}

function syncSelectedStationDetails(currentData) {
  if (!selectedComplexId) return;

  const selected = currentData.find(d => d.complex_id === selectedComplexId);
  if (selected) {
    updateStationDetails(selected);
  }
}

function renderStationProfileChart() {
  const chartWidth = 320;
  const chartHeight = 160;
  const chartMargin = { top: 12, right: 12, bottom: 24, left: 42 };
  const profileComplexId = selectedComplexId;
  const dayTypes = ["Weekday", "Saturday", "Sunday"];
  const dayColors = {
    Weekday: "#9bd4ff",
    Saturday: "#7dd3a7",
    Sunday: "#f4b26a"
  };
  const dayDash = {
    Weekday: "0",
    Saturday: "5 3",
    Sunday: "2 3"
  };

  stationProfileSvg.attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`);

  if (!profileComplexId) {
    stationProfileSvg.selectAll("*").remove();
    if (stationProfileEmptyEl) {
      stationProfileEmptyEl.style.display = "flex";
      stationProfileEmptyEl.textContent = "Select a station to compare weekday and weekend profiles.";
    }
    return;
  }

  const rawStationData = allData.filter(d => d.complex_id === profileComplexId);
  if (!rawStationData.length) {
    stationProfileSvg.selectAll("*").remove();
    if (stationProfileEmptyEl) {
      stationProfileEmptyEl.style.display = "flex";
      stationProfileEmptyEl.textContent = "No profile data for this station.";
    }
    return;
  }

  if (stationProfileEmptyEl) stationProfileEmptyEl.style.display = "none";

  const seriesByDay = new Map(
    dayTypes.map(day => {
      const byHour = new Map(
        rawStationData
          .filter(d => d.day_type === day)
          .map(d => [d.hour, d.ridership])
      );

      const series = d3.range(24).map(hour => ({
        hour,
        ridership: byHour.get(hour) || 0
      }));

      return [day, series];
    })
  );

  const allPoints = Array.from(seriesByDay.values()).flat();

  const x = d3.scaleLinear()
    .domain([0, 23])
    .range([chartMargin.left, chartWidth - chartMargin.right]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(allPoints, d => d.ridership) || 1])
    .nice()
    .range([chartHeight - chartMargin.bottom, chartMargin.top]);

  const line = d3.line()
    .x(d => x(d.hour))
    .y(d => y(d.ridership));

  stationProfileSvg.selectAll("*").remove();

  stationProfileSvg.append("g")
    .attr("class", "profile-grid")
    .attr("transform", `translate(${chartMargin.left},0)`)
    .call(
      d3.axisLeft(y)
        .ticks(3)
        .tickSize(-(chartWidth - chartMargin.left - chartMargin.right))
        .tickFormat("")
    )
    .call(g => g.select(".domain").remove());

  stationProfileSvg.append("g")
    .attr("class", "profile-axis")
    .attr("transform", `translate(0,${chartHeight - chartMargin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d => `${String(Math.round(d)).padStart(2, "0")}:00`));

  stationProfileSvg.append("g")
    .attr("class", "profile-axis")
    .attr("transform", `translate(${chartMargin.left},0)`)
    .call(d3.axisLeft(y).ticks(4).tickFormat(v => d3.format("~s")(v)));

  const drawOrder = dayTypes.filter(day => day !== currentDay).concat(currentDay);

  drawOrder.forEach(day => {
    const isActive = day === currentDay;
    stationProfileSvg.append("path")
      .datum(seriesByDay.get(day))
      .attr("class", "profile-line")
      .attr("d", line)
      .attr("stroke", dayColors[day])
      .attr("stroke-width", isActive ? 3.1 : 1.5)
      .attr("stroke-dasharray", isActive ? null : dayDash[day])
      .attr("stroke-linecap", "round")
      .attr("opacity", isActive ? 1 : 0.24);
  });

  const legend = stationProfileSvg.append("g")
    .attr("transform", `translate(${chartMargin.left},${chartMargin.top - 2})`);

  dayTypes.forEach((day, i) => {
    const isActive = day === currentDay;
    const lx = i * 86;

    legend.append("line")
      .attr("x1", lx)
      .attr("x2", lx + 14)
      .attr("y1", 0)
      .attr("y2", 0)
      .attr("stroke", dayColors[day])
      .attr("stroke-width", isActive ? 2.8 : 1.6)
      .attr("stroke-dasharray", isActive ? null : dayDash[day])
      .attr("opacity", isActive ? 1 : 0.5);

    legend.append("text")
      .attr("x", lx + 18)
      .attr("y", 3)
      .attr("fill", isActive ? "#f3f7ff" : "#9fb0d1")
      .attr("font-size", 10)
      .attr("font-weight", isActive ? 700 : 500)
      .text(day);
  });

  stationProfileSvg.append("line")
    .attr("class", "profile-hour-line")
    .attr("x1", x(currentHour))
    .attr("x2", x(currentHour))
    .attr("y1", chartMargin.top)
    .attr("y2", chartHeight - chartMargin.bottom);

  const activeSeries = seriesByDay.get(currentDay) || [];
  const currentPoint = activeSeries.find(d => d.hour === currentHour) || { hour: currentHour, ridership: 0 };

  stationProfileSvg.append("circle")
    .attr("class", "profile-hour-dot")
    .attr("cx", x(currentPoint.hour))
    .attr("cy", y(currentPoint.ridership))
    .attr("r", 3.6);
}

function showTooltip(event, d) {
  tooltip
    .classed("hidden", false)
    .html(`
      <div class="tooltip-title">${d.station_name}</div>
      <div class="tooltip-row">Borough: ${d.borough}</div>
      <div class="tooltip-row">Ridership: ${formatRidership(d.ridership)}</div>
      <div class="tooltip-row">Peak hour: ${formatHour(d.peak_hour)}</div>
    `);

  const [x, y] = d3.pointer(event, container);
  tooltip
    .style("left", `${x + 14}px`)
    .style("top", `${y + 14}px`);
}

function hideTooltip() {
  tooltip.classed("hidden", true);
}

function buildStationMap(data) {
  stationMap = new Map();
  data.forEach(d => {
    stationMap.set(`${d.complex_id}-${d.day_type}-${d.hour}`, d);
  });
}

function getCurrentHourData() {
  return stationMeta.map(station => {
    const key = `${station.complex_id}-${currentDay}-${currentHour}`;
    const record = stationMap.get(key);

    return {
      ...station,
      ridership: record ? record.ridership : 0,
      peak_hour: record ? record.peak_hour : null,
      daily_total: record ? record.daily_total : 0
    };
  });
}

function createProjection(geojson) {
  const filtered = {
    ...geojson,
    features: geojson.features.filter(f => f.properties.boroname !== "Staten Island")
  };
  projection = d3.geoMercator()
    .fitSize([innerWidth, innerHeight], filtered);

  pathGenerator = d3.geoPath().projection(projection);
}

function addProjectedCoordinates() {
  stationMeta.forEach(d => {
    const [x, y] = projection([d.lon, d.lat]);
    d.x = x;
    d.y = y;
  });
}

function drawBoroughMap() {
  if (!boroughGeojson || !pathGenerator) return;

  const features = boroughGeojson.features.filter(f => f.properties.boroname !== "Staten Island");

  mapLayer.selectAll("path")
    .data(features)
    .join("path")
    .attr("class", "borough-outline")
    .attr("d", pathGenerator);

  labelsLayer.selectAll("text")
    .data(features)
    .join("text")
    .attr("class", "station-label")
    .attr("x", d => pathGenerator.centroid(d)[0])
    .attr("y", d => pathGenerator.centroid(d)[1])
    .attr("text-anchor", "middle")
    .attr("fill", "rgba(255,255,255,0.32)")
    .attr("font-size", 11)
    .attr("font-weight", 600)
    .text(d => d.properties.boroname || "");
}

function updateLegendScale(maxRidershipValue, radiusScale) {
  const ticks = d3.ticks(0, maxRidershipValue, 5).filter(v => v > 0);

  let legendValues;
  if (ticks.length >= 3) {
    legendValues = [
      ticks[0],
      ticks[Math.floor(ticks.length / 2)],
      ticks[ticks.length - 1]
    ];
  } else {
    legendValues = [maxRidershipValue * 0.3, maxRidershipValue * 0.6, maxRidershipValue];
  }

  const levelLabels = ["Lower", "Medium", "Higher"];

  legendValues.forEach((value, i) => {
    const safeValue = Math.max(1, Math.round(value));
    const diameter = Math.max(6, radiusScale(safeValue) * 2);

    if (legendDots[i]) {
      legendDots[i].style.width = `${diameter}px`;
      legendDots[i].style.height = `${diameter}px`;
    }

    if (legendLabelSpans[i]) {
      legendLabelSpans[i].textContent = `${levelLabels[i]}: ${formatRidership(safeValue)}`;
    }
  });
}

function createScales() {
  maxRidership = d3.max(allData, d => d.ridership) || 1;

  rScale = d3.scaleSqrt()
    .domain([0, maxRidership])
    .range([1.5, 14]);

  opacityScale = d3.scaleLinear()
    .domain([0, maxRidership])
    .range([0.35, 0.95]);

  updateLegendScale(maxRidership, rScale);
}

function renderStations(animate = true) {
  if (!rScale || !opacityScale) return;

  const currentData = getCurrentHourData();
  syncSelectedStationDetails(currentData);

  stationsSelection = stationsLayer.selectAll(".station-circle")
    .data(currentData, d => d.complex_id);

  const joined = stationsSelection.join(
    enter => enter.append("circle")
      .attr("class", "station-circle inactive")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 0)
      .attr("opacity", 0.12)
      .on("mouseenter", function (event, d) {
        showTooltip(event, d);
      })
      .on("mousemove", function (event) {
        const [x, y] = d3.pointer(event, container);
        tooltip.style("left", `${x + 14}px`).style("top", `${y + 14}px`);
      })
      .on("mouseleave", hideTooltip)
      .on("click", function (event, d) {
        event.stopPropagation();
        selectedComplexId = d.complex_id;
        updateStationDetails(d);
        renderStationProfileChart();
        if (stationsSelection) {
          stationsSelection.attr("class", s => stationClass(s));
        }
        zoomToStation(d);
      }),

    update => update,

    exit => exit.remove()
  );

  joined.interrupt();

  joined
    .attr("class", d => stationClass(d))
    .attr("cx", d => d.x)
    .attr("cy", d => d.y);

  if (!animate) {
    joined
      .attr("r", d => rScale(d.ridership) / currentZoomK)
      .attr("opacity", d => opacityScale(d.ridership));
  } else {
    joined
      .transition()
      .duration(isPlaying ? 180 : 250)
      .ease(d3.easeLinear)
      .attr("r", d => rScale(d.ridership) / currentZoomK)
      .attr("opacity", d => opacityScale(d.ridership));
  }

  stationsSelection = joined;
}

function updateVisualization(animate = true) {
  updateDayLabel();
  updateHourLabel();
  updateNarrativeAnnotation();
  renderStations(animate);
  renderStationProfileChart();
  updateGlobalTimeline();
}

function setActiveDayButton() {
  dayButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.day === currentDay);
  });
}

function startPlayback() {
  isPlaying = true;
  playBtn.textContent = "Pause";

  playInterval = setInterval(() => {
    currentHour = (currentHour + 1) % 24;
    hourSlider.value = currentHour;
    updateVisualization(true);
  }, 1000);
}

function stopPlayback() {
  isPlaying = false;
  playBtn.textContent = "Play";
  clearInterval(playInterval);
}

function resetZoom() {
  svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
}

function zoomToStation(d) {
  const scale = 4;
  const t = d3.zoomIdentity
    .translate(width / 2 - margin.left, height / 2 - margin.top)
    .scale(scale)
    .translate(-d.x, -d.y);
  svg.transition().duration(600).call(zoom.transform, t);
}

function stationClass(d) {
  if (d.complex_id === selectedComplexId) return "station-circle selected";
  if (selectedBorough !== "All" && d.borough !== selectedBorough) return "station-circle inactive";
  return d.ridership > 0 ? "station-circle" : "station-circle inactive";
}

function zoomToBorough(boroughName) {
  if (!boroughGeojson) return;
  if (boroughName === "All") {
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
    return;
  }
  const feature = boroughGeojson.features.find(
    f => (f.properties.boro_name || f.properties.boroname || "").toLowerCase() === boroughName.toLowerCase()
  );
  if (!feature) return;

  const [[x0, y0], [x1, y1]] = pathGenerator.bounds(feature);
  const bw = x1 - x0;
  const bh = y1 - y0;
  const scale = Math.min(8, 0.85 / Math.max(bw / innerWidth, bh / innerHeight));
  const tx = innerWidth / 2 - scale * (x0 + bw / 2) + margin.left;
  const ty = innerHeight / 2 - scale * (y0 + bh / 2) + margin.top;
  svg.transition().duration(700).call(
    zoom.transform,
    d3.zoomIdentity.translate(tx, ty).scale(scale)
  );
}

function setActiveBoroughButton() {
  boroughButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.borough === selectedBorough);
  });
}

Promise.all([
  d3.csv("data/station_hourly.csv", d => ({
    complex_id: d.complex_id,
    station_name: d.station_name,
    borough: d.borough,
    lat: +d.lat,
    lon: +d.lon,
    day_type: d.day_type,
    hour: +d.hour,
    ridership: +d.ridership,
    peak_hour: +d.peak_hour,
    daily_total: +d.daily_total
  })),
  d3.json("data/nyc_boroughs.geojson")
]).then(([data, geojson]) => {
  allData = data;
  boroughGeojson = geojson;

  stationMeta = Array.from(
    d3.rollup(
      data,
      values => ({
        complex_id: values[0].complex_id,
        station_name: values[0].station_name,
        borough: values[0].borough,
        lat: values[0].lat,
        lon: values[0].lon
      }),
      d => d.complex_id
    ).values()
  );

  buildStationMap(allData);
  createProjection(boroughGeojson);
  addProjectedCoordinates();
  createScales();
  initializeGlobalTimeline();
  drawBoroughMap();
  updateVisualization(true);
  setActiveDayButton();

  hourSlider.addEventListener("input", e => {
    currentHour = +e.target.value;
    updateVisualization(false);
  });

  playBtn.addEventListener("click", () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  });

  dayButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      currentDay = btn.dataset.day;
      setActiveDayButton();
      updateVisualization(!isPlaying);
    });
  });

  boroughButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      selectedBorough = btn.dataset.borough;
      setActiveBoroughButton();
      zoomToBorough(selectedBorough);
      renderStations(false);
      updateGlobalTimeline();
    });
  });

  if (resetZoomBtn) {
    resetZoomBtn.addEventListener("click", resetZoom);
  }
}).catch(err => {
  console.error("Failed to load data:", err);

  stationDetailsEl.innerHTML = `
    <p class="muted">
      Failed to load required data files. Make sure both
      <code>data/station_hourly.csv</code> and
      <code>data/nyc_boroughs.geojson</code> exist and that you are running a local server.
    </p>
  `;
});