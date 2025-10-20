let map;
let storyData;
let currentSlideIndex = 0;
let markers = []; // Track all markers
let lines = []; // Track all line segments
let isAnimating = false; // Prevent multiple animations at once

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

      // Initialize the story map functionality once PMTiles map is loaded
      initializeMap();
      updateSlide();
    });

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
      })
    );
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

      // Add source for this line segment
      map.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [
                parseFloat(currentSlide.location.lon),
                parseFloat(currentSlide.location.lat),
              ],
              [
                parseFloat(nextSlide.location.lon),
                parseFloat(nextSlide.location.lat),
              ],
            ],
          },
        },
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
          "line-color": "#888888",
          "line-width": 3,
          "line-dasharray": [3, 2], // More visible dash pattern - 3px dash, 2px gap
        },
      });

      lines.push({ id: lineId, targetSlideIndex: i + 1 });
    }
  }
}

function createAllMarkers() {
  // Create markers for all slides that have valid locations and icons
  storyData.forEach((slide, index) => {
    if (isValidLocation(slide.location) && slide.location.icon) {
      const el = document.createElement("div");
      el.className = "marker";
      el.style.backgroundImage = `url(${slide.location.icon})`;
      el.style.width = "32px";
      el.style.height = "32px";
      el.style.backgroundSize = "contain";
      el.style.backgroundRepeat = "no-repeat";
      el.style.cursor = "pointer";

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([
          parseFloat(slide.location.lon),
          parseFloat(slide.location.lat),
        ])
        .addTo(map);

      markers[index] = marker;
    }
  });
}

function updateLineColors() {
  // Update all lines based on current slide
  lines.forEach((line) => {
    if (line.targetSlideIndex === currentSlideIndex) {
      // This line leads to the current slide, make it red
      map.setPaintProperty(line.id, "line-color", "#ff0000");
    } else {
      // All other lines are grey
      map.setPaintProperty(line.id, "line-color", "#888888");
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

  // Disable previous button on first slide
  if (currentSlideIndex === 0) {
    prevBtn.disabled = true;
    prevBtn.style.opacity = "0.5";
    prevBtn.style.cursor = "not-allowed";
  } else {
    prevBtn.disabled = false;
    prevBtn.style.opacity = "1";
    prevBtn.style.cursor = "pointer";
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
