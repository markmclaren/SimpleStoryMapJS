let map;
let storyData;
let currentSlideIndex = 0;
let markers = []; // Track all markers
let lines = []; // Track all line segments
let isAnimating = false; // Prevent multiple animations at once

// Fetch and parse the JSON data
fetch("obama.json")
  .then((response) => response.json())
  .then((data) => {
    storyData = data.storymap.slides;
    initializeMap();
    updateSlide();
  });

function initializeMap() {
  // Find the first slide with valid coordinates
  const firstValidSlide = storyData.find((slide) =>
    isValidLocation(slide.location)
  );

  if (firstValidSlide) {
    map = new maplibregl.Map({
      container: "map",
      style: "https://tiles.openfreemap.org/styles/liberty", // replace with your preferred free tile source
      center: [
        parseFloat(firstValidSlide.location.lon),
        parseFloat(firstValidSlide.location.lat),
      ],
      zoom: parseFloat(firstValidSlide.location.zoom) || 2,
    });

    // Wait for map to load, then create all lines and markers
    map.on("load", () => {
      createAllLines();
      createAllMarkers();
    });
  } else {
    // If no valid coordinates found, initialize with a default view
    map = new maplibregl.Map({
      container: "map",
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [0, 0],
      zoom: 1,
    });
  }

  map.addControl(
    new maplibregl.AttributionControl({
      compact: true,
    })
  );
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
