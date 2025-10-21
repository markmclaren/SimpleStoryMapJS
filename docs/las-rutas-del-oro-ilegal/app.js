let map;
let storyData;
let fullData; // Store the complete JSON data
let currentSlideIndex = 0;
let currentLanguage = "en"; // Default language
let markers = []; // Track all markers
let lines = []; // Track all line segments
let isAnimating = false; // Prevent multiple animations at once

// Styling constants
const MARKER_RADIUS = 10;
const MARKER_RADIUS_ACTIVE = 12;
const MARKER_COLOR = "#8C4B00";
const MARKER_COLOR_ACTIVE = "#F29F05";
const MARKER_STROKE_WIDTH = 2;
const MARKER_STROKE_WIDTH_ACTIVE = 2;
const MARKER_STROKE_COLOR = "#ffffff";

const LINE_COLOR = "#FFFFFF";
const LINE_COLOR_ACTIVE = "#F29F05";
const LINE_WIDTH = 2;
const LINE_WIDTH_ACTIVE = 2;
const LINE_DASHARRAY = [2, 2];

// Fetch and parse the JSON data
fetch("las-rutas-del-oro-ilegal.json")
  .then((response) => response.json())
  .then((data) => {
    fullData = data;
    storyData = data.storymaps[currentLanguage].storymap.slides;
    initializeMap();
    updateSlide();
    initializeLanguageSelector();
  });

// Define the Sentinel-2 style configuration once, reused for both cases
const sentinel2Style = {
  version: 8,
  sources: {
    "sentinel2-tiles": {
      type: "raster",
      tiles: [
        "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg",
      ],
      minzoom: 0,
      maxzoom: 13,
      scheme: "xyz",
      tileSize: 256,
      attribution:
        '<a href="https://s2maps.eu">Sentinel-2 cloudless - https://s2maps.eu</a> by <a href="https://eox.at">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2024)',
    },
  },
  layers: [
    {
      id: "sentinel2-layer",
      type: "raster",
      source: "sentinel2-tiles",
      layout: { visibility: "visible" },
      paint: {
        "raster-opacity": 1,
        "raster-fade-duration": 0,
      },
    },
  ],
};

function initializeMap() {
  // Find the first slide with valid coordinates
  const firstValidSlide = storyData.find((slide) =>
    isValidLocation(slide.location)
  );

  if (firstValidSlide) {
    map = new maplibregl.Map({
      container: "map",
      style: sentinel2Style,
      center: [
        parseFloat(firstValidSlide.location.lon),
        parseFloat(firstValidSlide.location.lat),
      ],
      zoom: parseFloat(firstValidSlide.location.zoom) || 2,
    });

    // Remove any existing attribution controls and add only one in compact mode
    // This ensures only one attribution bar, regardless of style attribution
    const controls = document.querySelectorAll(".maplibregl-ctrl-attrib");
    controls.forEach((ctrl) => ctrl.remove());
    const attributionControl = new maplibregl.AttributionControl({
      compact: true,
    });
    map.addControl(attributionControl);
    // Force the attribution bar to start closed (collapsed)
    setTimeout(() => {
      const detailsElem = document.querySelector(
        "details.maplibregl-compact-show"
      );
      if (detailsElem && detailsElem.hasAttribute("open")) {
        detailsElem.classList.remove('maplibregl-compact-show');
        detailsElem.removeAttribute("open");
      }
    }, 100);

    // Wait for map to load, then create all lines and markers
    map.on("load", () => {
      createAllLines();
      createAllMarkers();
    });
  } else {
    // If no valid coordinates found, initialize with a default view
    map = new maplibregl.Map({
      container: "map",
      style: sentinel2Style,
      center: [0, 0],
      zoom: 1,
    });
  }
}

function isValidLocation(location) {
  return (
    location &&
    location.lat !== null &&
    location.lat !== undefined &&
    !isNaN(parseFloat(location.lat)) &&
    location.lon !== null &&
    location.lon !== undefined &&
    !isNaN(parseFloat(location.lon))
  );
}

function createAllLines() {
  // Create line segments between consecutive slides that have line: true
  for (let i = 0; i < storyData.length - 1; i++) {
    const currentSlide = storyData[i];
    const nextSlide = storyData[i + 1];

    // Check if current slide has line: true and both slides have valid locations
    if (
      currentSlide.location &&
      currentSlide.location.line === true &&
      isValidLocation(currentSlide.location) &&
      isValidLocation(nextSlide.location)
    ) {
      const lineId = `line-${i}`;
      const sourceId = `line-source-${i}`;

      // Create great circle line using Turf.js
      const startPoint = turf.point([
        parseFloat(currentSlide.location.lon),
        parseFloat(currentSlide.location.lat)
      ]);
      const endPoint = turf.point([
        parseFloat(nextSlide.location.lon),
        parseFloat(nextSlide.location.lat)
      ]);

      // Generate great circle line with appropriate resolution
      const greatCircleLine = turf.greatCircle(startPoint, endPoint, {
        npoints: 100 // Number of points to generate for smooth curve
      });

      // Add source for this great circle line segment
      map.addSource(sourceId, {
        type: "geojson",
        data: greatCircleLine,
      });

      // Add layer for this line segment with simple styling
      map.addLayer({
        id: lineId,
        type: "line",
        source: sourceId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": LINE_COLOR,
          "line-width": LINE_WIDTH,
          "line-dasharray": LINE_DASHARRAY,
        },
      });

      lines.push({ id: lineId, targetSlideIndex: i + 1 });
    }
  }
}

function createAllMarkers() {
  // Create all markers in the inactive layer first
  createInactiveMarkers();

  // Create empty active marker layer
  createActiveMarker();

  // Move the current slide's marker to active layer
  moveMarkerToActive(currentSlideIndex);
}

function createInactiveMarkers() {
  // Collect all valid marker locations
  const inactiveMarkerFeatures = storyData
    .map((slide, index) => {
      if (isValidLocation(slide.location)) {
        return {
          type: "Feature",
          properties: {
            slideIndex: index,
            isActive: false,
            isClickable: true
          },
          geometry: {
            type: "Point",
            coordinates: [
              parseFloat(slide.location.lon),
              parseFloat(slide.location.lat)
            ]
          }
        };
      }
      return null;
    })
    .filter(feature => feature !== null);

  // Add source for inactive markers
  map.addSource("inactive-markers", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: inactiveMarkerFeatures
    }
  });

  // Add circle layer for inactive markers
  map.addLayer({
    id: "inactive-marker-circles",
    type: "circle",
    source: "inactive-markers",
    paint: {
      "circle-radius": MARKER_RADIUS,
      "circle-color": MARKER_COLOR,
      "circle-stroke-width": MARKER_STROKE_WIDTH,
      "circle-stroke-color": MARKER_STROKE_COLOR,
      "circle-opacity": 1
    }
  });

  // Add click event listener to the inactive markers layer
  map.on("click", "inactive-marker-circles", (e) => {
    if (e.features.length > 0) {
      const clickedSlideIndex = e.features[0].properties.slideIndex;
      if (clickedSlideIndex !== currentSlideIndex && !isAnimating) {
        navigateToSlide(clickedSlideIndex);
      }
    }
  });

  // Add hover effects for inactive markers
  map.on("mouseenter", "inactive-marker-circles", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "inactive-marker-circles", () => {
    map.getCanvas().style.cursor = "";
  });
}

function createActiveMarker() {
  // Add source for active marker (initially empty)
  map.addSource("active-marker", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: []
    }
  });

  // Add circle layer for active marker (added last so it renders on top)
  map.addLayer({
    id: "active-marker-circle",
    type: "circle",
    source: "active-marker",
    paint: {
      "circle-radius": MARKER_RADIUS_ACTIVE,
      "circle-color": MARKER_COLOR_ACTIVE,
      "circle-stroke-width": MARKER_STROKE_WIDTH_ACTIVE,
      "circle-stroke-color": MARKER_STROKE_COLOR,
      "circle-opacity": 1
    }
  });

  // Add click event listener to the active marker layer
  map.on("click", "active-marker-circle", (e) => {
    if (e.features.length > 0) {
      const clickedSlideIndex = e.features[0].properties.slideIndex;
      if (clickedSlideIndex !== currentSlideIndex && !isAnimating) {
        navigateToSlide(clickedSlideIndex);
      }
    }
  });

  // Add hover effects for active marker
  map.on("mouseenter", "active-marker-circle", () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", "active-marker-circle", () => {
    map.getCanvas().style.cursor = "";
  });
}

function updateLineColors() {
  // Update all lines based on current slide
  lines.forEach((line) => {
    if (line.targetSlideIndex === currentSlideIndex) {
      // This line leads to the current slide, make it red
      map.setPaintProperty(line.id, "line-color", LINE_COLOR_ACTIVE);
    } else {
      // All other lines are grey
      map.setPaintProperty(line.id, "line-color", LINE_COLOR);
    }
  });
}

function updateMarkerColors() {
  const previousActiveIndex = getPreviouslyActiveMarkerIndex();

  // If there's a previously active marker that's different from current, move it to inactive
  if (previousActiveIndex !== null && previousActiveIndex !== currentSlideIndex) {
    moveMarkerToInactive(previousActiveIndex);
  }

  // Move current marker to active layer (if it's not already there)
  if (currentSlideIndex !== previousActiveIndex) {
    moveMarkerToActive(currentSlideIndex);
  }
}

function getPreviouslyActiveMarkerIndex() {
  const activeSource = map.getSource("active-marker");
  if (activeSource && activeSource._data && activeSource._data.features.length > 0) {
    return activeSource._data.features[0].properties.slideIndex;
  }
  return null;
}

function moveMarkerToInactive(slideIndex) {
  // Get the marker data from the active layer
  const activeSource = map.getSource("active-marker");
  if (!activeSource || activeSource._data.features.length === 0) return;

  const markerFeature = activeSource._data.features[0];

  // Add to inactive markers
  const inactiveSource = map.getSource("inactive-markers");
  if (inactiveSource) {
    const inactiveData = inactiveSource._data;
    inactiveData.features.push({
      ...markerFeature,
      properties: {
        ...markerFeature.properties,
        isActive: false
      }
    });
    inactiveSource.setData(inactiveData);
  }

  // Clear the active marker
  activeSource.setData({
    type: "FeatureCollection",
    features: []
  });
}

function moveMarkerToActive(slideIndex) {
  // Find the marker in inactive markers and move it to active
  const inactiveSource = map.getSource("inactive-markers");
  if (!inactiveSource) return;

  const inactiveData = inactiveSource._data;
  const markerIndex = inactiveData.features.findIndex(
    feature => feature.properties.slideIndex === slideIndex
  );

  if (markerIndex !== -1) {
    const markerFeature = inactiveData.features[markerIndex];

    // Set up the active marker source with this marker
    const activeSource = map.getSource("active-marker");
    if (activeSource) {
      activeSource.setData({
        type: "FeatureCollection",
        features: [{
          ...markerFeature,
          properties: {
            ...markerFeature.properties,
            isActive: true
          }
        }]
      });
    }

    // Remove from inactive markers
    inactiveData.features.splice(markerIndex, 1);
    inactiveSource.setData(inactiveData);
  }
}

function updateSlide(direction = "none") {
  const slide = storyData[currentSlideIndex];
  const contentWrapper = document.getElementById("content-wrapper");

  // If direction is specified, animate the transition
  if (direction !== "none" && !isAnimating) {
    isAnimating = true;

    // Determine animation classes based on direction
    const outClass =
      direction === "next" ? "slide-out-left" : "slide-out-right";
    const inClass = direction === "next" ? "slide-in-right" : "slide-in-left";

    // Add exit animation
    contentWrapper.classList.add(outClass);

    // Wait for exit animation to complete, then update content and animate in
    setTimeout(() => {
      // Remove exit animation class
      contentWrapper.classList.remove(outClass);

      // Update text content
      document.getElementById("headline").textContent = slide.text.headline;
      document.getElementById("text").innerHTML = slide.text.text;

      // Update media
      updateMedia(slide);

      // Add entrance animation
      contentWrapper.classList.add(inClass);

      // Remove entrance animation class after it completes
      setTimeout(() => {
        contentWrapper.classList.remove(inClass);
        isAnimating = false;
      }, 500);
    }, 500);
  } else {
    // No animation, just update content
    document.getElementById("headline").textContent = slide.text.headline;
    document.getElementById("text").innerHTML = slide.text.text;
    updateMedia(slide);
  }

  // Update map if valid location exists
  if (isValidLocation(slide.location)) {
    map.flyTo({
      center: [parseFloat(slide.location.lon), parseFloat(slide.location.lat)],
      zoom: parseFloat(slide.location.zoom) || map.getZoom(),
      essential: true,
    });
  }

  // Update line colors
  updateLineColors();
  updateMarkerColors();

  // Update progress display
  const progressDiv = document.getElementById("progress");
  if (progressDiv && storyData) {
    progressDiv.textContent = `${currentSlideIndex + 1}/${storyData.length}`;
  }

  // Update button states
  updateButtonStates();
}

function updateMedia(slide) {
  const mediaContainer = document.getElementById("media");
  mediaContainer.innerHTML = "";

  if (slide.media && slide.media.url) {
    if (slide.media.url.includes("youtube.com")) {
      const iframe = document.createElement("iframe");
      iframe.src = slide.media.url.replace("watch?v=", "embed/");
      iframe.width = "100%";
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      mediaContainer.appendChild(iframe);
    } else if (
      slide.media.url.endsWith(".jpg") ||
      slide.media.url.endsWith(".png")
    ) {
      const img = document.createElement("img");
      img.src = slide.media.url;
      img.alt = slide.media.caption || "";
      mediaContainer.appendChild(img);
    }
  }
}

function updateButtonStates() {
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const restartBtn = document.getElementById("restart-btn");

  // Disable previous button on first slide
  if (currentSlideIndex === 0) {
    prevBtn.disabled = true;
    prevBtn.style.opacity = "0.5";
    prevBtn.style.cursor = "not-allowed";
    restartBtn.disabled = true;
    restartBtn.style.opacity = "0.5";
    restartBtn.style.cursor = "not-allowed"; 
  } else {
    prevBtn.disabled = false;
    prevBtn.style.opacity = "1";
    prevBtn.style.cursor = "pointer";
    restartBtn.disabled = false;
    restartBtn.style.opacity = "1";
    restartBtn.style.cursor = "pointer";
  }

  // Disable next button on last slide
  if (currentSlideIndex === storyData.length - 1) {
    nextBtn.disabled = true;
    nextBtn.style.opacity = "0.5";
    nextBtn.style.cursor = "not-allowed";
  } else {
    nextBtn.disabled = false;
    nextBtn.style.opacity = "1";
    nextBtn.style.cursor = "pointer";
  }
}

document.getElementById("prev-btn").addEventListener("click", () => {
  if (currentSlideIndex > 0 && !isAnimating) {
    currentSlideIndex--;
    updateSlide("prev");
  }
});

document.getElementById("next-btn").addEventListener("click", () => {
  if (currentSlideIndex < storyData.length - 1 && !isAnimating) {
    currentSlideIndex++;
    updateSlide("next");
  }
});

document.getElementById("restart-btn").addEventListener("click", () => {
  if (currentSlideIndex > 0 && !isAnimating) {
    currentSlideIndex = 0;

    // Find the first slide with valid coordinates and fly to it
    const firstValidSlide = storyData.find((slide) =>
      isValidLocation(slide.location)
    );

    if (firstValidSlide) {
      map.flyTo({
        center: [
          parseFloat(firstValidSlide.location.lon),
          parseFloat(firstValidSlide.location.lat),
        ],
        zoom: parseFloat(firstValidSlide.location.zoom) || map.getZoom(),
        essential: true,
      });
    }

    updateSlide("none");
  }
});

// Language switching functionality
function initializeLanguageSelector() {
  const languageSelector = document.getElementById("language-selector");
  if (languageSelector) {
    // Populate language options
    Object.keys(fullData.languages).forEach((langCode) => {
      const langInfo = fullData.languages[langCode];
      const option = document.createElement("option");
      option.value = langCode;
      option.textContent = langInfo.name;
      if (langCode === currentLanguage) {
        option.selected = true;
      }
      languageSelector.appendChild(option);
    });

    // Add event listener for language changes
    languageSelector.addEventListener("change", switchLanguage);
    // Set initial button text
    updateNavButtonText();
  }
}

function switchLanguage() {
  const languageSelector = document.getElementById("language-selector");
  const newLanguage = languageSelector.value;

  if (newLanguage !== currentLanguage && fullData.storymaps[newLanguage]) {
    currentLanguage = newLanguage;

    // Store current slide index (try to maintain relative position)
    const currentSlideRatio = currentSlideIndex / storyData.length;

    // Update story data
    storyData = fullData.storymaps[currentLanguage].storymap.slides;

    // Calculate new slide index based on ratio (with fallback to 0)
    const newSlideIndex = Math.min(
      Math.floor(currentSlideRatio * storyData.length),
      storyData.length - 1
    );

    // Remove existing markers and lines
    clearMapElements();

    // Update map with new language data
    createAllLines();
    createAllMarkers();

    // Update current slide
    currentSlideIndex = newSlideIndex;
    updateSlide();

    // Update call-to-action text if it exists
    updateCallToActionText();

    // Update navigation button text
    updateNavButtonText();

    document.getElementsByTagName("title")[0].textContent = fullData.languages[currentLanguage].title;
  }

}

function updateNavButtonText() {
  // Update the Next and Previous button text based on current language
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const langData = fullData.languages[currentLanguage];
  if (prevBtn && langData && langData.prev) {
    prevBtn.textContent = langData.prev;
  }
  if (nextBtn && langData && langData.next) {
    nextBtn.textContent = langData.next;
  }
}

function clearMapElements() {
  // Remove all markers
  markers.forEach((marker) => {
    if (marker) marker.remove();
  });
  markers = [];

  // Remove marker layers and sources
  if (map.getLayer("inactive-marker-circles")) {
    map.removeLayer("inactive-marker-circles");
  }
  if (map.getLayer("active-marker-circle")) {
    map.removeLayer("active-marker-circle");
  }
  if (map.getSource("inactive-markers")) {
    map.removeSource("inactive-markers");
  }
  if (map.getSource("active-marker")) {
    map.removeSource("active-marker");
  }

  // Remove all lines
  lines.forEach((line) => {
    if (map.getLayer(line.id)) {
      map.removeLayer(line.id);
    }
    if (
      map.getSource(line.sourceId || `line-source-${line.targetSlideIndex - 1}`)
    ) {
      map.removeSource(
        line.sourceId || `line-source-${line.targetSlideIndex - 1}`
      );
    }
  });
  lines = [];
}

function updateCallToActionText() {
  // Update the call-to-action button text based on current language
  const callToActionText =
    fullData.storymaps[currentLanguage].storymap.call_to_action_text;
  const callToActionBtn = document.getElementById("call-to-action-btn");
  if (callToActionBtn && callToActionText) {
    callToActionBtn.textContent = callToActionText;
  }
}

// Navigate directly to a specific slide
function navigateToSlide(targetSlideIndex) {
  if (targetSlideIndex < 0 || targetSlideIndex >= storyData.length || isAnimating) {
    return;
  }

  // Set the target slide index and update everything
  currentSlideIndex = targetSlideIndex;
  updateSlide("none");
}

// Keyboard navigation: left/right arrow keys for prev/next
document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    const prevBtn = document.getElementById("prev-btn");
    if (prevBtn && !prevBtn.disabled && currentSlideIndex > 0 && !isAnimating) {
      currentSlideIndex--;
      updateSlide("prev");
    }
  } else if (event.key === "ArrowRight") {
    const nextBtn = document.getElementById("next-btn");
    if (nextBtn && !nextBtn.disabled && currentSlideIndex < storyData.length - 1 && !isAnimating) {
      currentSlideIndex++;
      updateSlide("next");
    }
  }
});
