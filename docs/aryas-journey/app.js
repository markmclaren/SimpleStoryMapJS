let map;
let storyData;
let currentSlideIndex = 0;
let markers = []; // Track all markers
let lines = []; // Track all line segments
let isAnimating = false; // Prevent multiple animations at once

// Styling constants
const MARKER_RADIUS = 10;
const MARKER_RADIUS_ACTIVE = 12;
const MARKER_COLOR = "#888888";
const MARKER_COLOR_ACTIVE = "#ff0000";
const MARKER_STROKE_WIDTH = 2;
const MARKER_STROKE_WIDTH_ACTIVE = 3;
const MARKER_STROKE_COLOR = "#ffffff";

const LINE_COLOR = "#000000";
const LINE_COLOR_ACTIVE = "#ff0000";
const LINE_WIDTH = 2;
const LINE_WIDTH_ACTIVE = 2;
const LINE_DASHARRAY = [2, 2];

// add the PMTiles plugin to the maplibregl global.
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const PMTILES_URL = "aryas-journey.pmtiles";

const p = new pmtiles.PMTiles(PMTILES_URL);

// this is so we share one instance across the JS code and the map renderer
protocol.add(p);

// Fetch and parse the JSON data
fetch("aryas-journey.json")
  .then((response) => response.json())
  .then((data) => {
    storyData = data.storymap.slides;

    // Initialize PMTiles map after story data is loaded
    p.getHeader().then((h) => {
      map = new maplibregl.Map({
        container: "map",
        zoom: h.maxZoom - 2,
        center: [h.centerLon, h.centerLat],
        renderWorldCopies: false,
        minZoom: 0,
        maxZoom: h.maxZoom,
        style: {
          version: 8,
          sources: {
            storymap: {
              type: "raster",
              url: `pmtiles://${PMTILES_URL}`,
            },
          },
          layers: [
            {
              id: "pmtiles-layer",
              source: "storymap",
              type: "raster",
            },
          ],
        },
      });

      // Add attribution control after map is created
      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
        })
      );

      // Initialize the story map functionality once PMTiles map is loaded
      initializeMap();
      updateSlide();
    });
  });
function initializeMap() {
  // Find the first slide with valid coordinates
  const firstValidSlide = storyData.find((slide) =>
    isValidLocation(slide.location)
  );

  if (firstValidSlide) {
    // Update PMTiles map center and zoom to first slide
    map.flyTo({
      center: [
        parseFloat(firstValidSlide.location.lon),
        parseFloat(firstValidSlide.location.lat),
      ],
      zoom: parseFloat(firstValidSlide.location.zoom) || map.getZoom(),
      essential: true,
    });

    // Wait for map to load, then create all lines and markers
    map.on("load", () => {
      createAllLines();
      createAllMarkers();
    });
  }

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
      detailsElem.classList.remove("maplibregl-compact-show");
      detailsElem.removeAttribute("open");
    }
  }, 100);
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

  // Update background styling if specified
  const storyContent = document.getElementById("story-content");

  // Ensure storyContent exists
  if (storyContent) {
    // Make sure the container is positioned so an absolute overlay can be placed inside it
    if (!storyContent.style.position) {
      storyContent.style.position = "relative";
    }

    // Create or reuse an overlay element that will hold the background image
    let imgOverlay = storyContent.querySelector(".story-bg-image-overlay");
    if (!imgOverlay) {
      imgOverlay = document.createElement("div");
      imgOverlay.className = "story-bg-image-overlay";
      Object.assign(imgOverlay.style, {
        position: "absolute",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        pointerEvents: "none",
        zIndex: "0",
        opacity: "1",
        transition: "opacity 0.3s ease, background-image 0.3s ease",
      });
      // Insert at the start so content sits above it
      storyContent.insertBefore(imgOverlay, storyContent.firstChild);
    }

    // Ensure the actual content sits above the overlay
    const contentWrapper = document.getElementById("content-wrapper");
    if (contentWrapper) {
      contentWrapper.style.position = "relative";
      contentWrapper.style.zIndex = "1";
    }

    // Clear any direct backgroundImage set on the container (we use the overlay instead)
    storyContent.style.backgroundImage = "";

    if (slide.background) {
      // Background color remains fully opaque (unless the slide wants a different color)
      if (slide.background.color) {
        storyContent.style.backgroundColor = slide.background.color;
      } else {
        storyContent.style.backgroundColor = "";
      }

      // If a background image is specified, set it on the overlay and apply opacity there
      if (slide.background.url) {
        imgOverlay.style.backgroundImage = `url('${slide.background.url}')`;
        imgOverlay.style.display = "block";
        const opacity =
          slide.background.opacity !== undefined
            ? slide.background.opacity / 100
            : 1;
        imgOverlay.style.opacity = String(opacity);
      } else {
        // No image for this slide -> hide overlay
        imgOverlay.style.display = "none";
        imgOverlay.style.backgroundImage = "";
      }
    } else {
      // No background specified at all -> reset
      imgOverlay.style.display = "none";
      imgOverlay.style.backgroundImage = "";
      storyContent.style.backgroundColor = "";
    }
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
    if (
      nextBtn &&
      !nextBtn.disabled &&
      currentSlideIndex < storyData.length - 1 &&
      !isAnimating
    ) {
      currentSlideIndex++;
      updateSlide("next");
    }
  }
});
