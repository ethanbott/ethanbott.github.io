require([
        "esri/Map",
        "esri/layers/FeatureLayer",
        "esri/views/MapView",
        "esri/core/promiseUtils",
        "esri/widgets/Legend",
        "esri/widgets/Home",
        "esri/widgets/Fullscreen",
        "esri/widgets/Slider",
        "esri/widgets/Expand"
      ], (Map, FeatureLayer, MapView, promiseUtils, Legend, Home, Fullscreen, Slider, Expand) => {

        (async () => {
          //--------------------------------------------------------------------------
          //
          //  Setup Map and View
          //
          //--------------------------------------------------------------------------

          const layer = window.layer = new FeatureLayer({
            portalItem: {
              id: "359bc19d9bbb4f2ba1b2baec7e13e757"
            },
            outFields: ["PERCENT_GAP"],
            // don't show precincts that didn't record any votes
            definitionExpression: "(P2008_D > 0) AND (P2008_R > 0)",
            title: "Voting precincts",
            opacity: 1,
            renderer: {
              type: "unique-value",
              field: "Majority",
              uniqueValueInfos: [
                {
                  value: "Obama",
                  symbol: {
                    type: "simple-marker",
                    size: 9,
                    color: "rgb(0, 92, 230)",
                    outline: null
                  }
                },
                {
                  value: "McCain",
                  symbol: {
                    type: "simple-marker",
                    size: 9,
                    color: "rgb(255, 20, 20)",
                    outline: null
                  }
                },
                {
                  value: "Tied",
                  symbol: {
                    type: "simple-marker",
                    size: 9,
                    color: "rgb(158, 85, 156)",
                    outline: null
                  }
                }
              ],
              visualVariables: [
                {
                  type: "size",
                  minDataValue: 600,
                  maxDataValue: 4562,
                  minSize: 3,
                  maxSize: 20,
                  valueExpression: "$feature.P2008_D + $feature.P2008_R",
                  valueExpressionTitle: "Turnout",
                  valueUnit: "unknown"
                }
              ]
            }
          });

          const view = new MapView({
            map: new Map({
              basemap: {
                portalItem: {
                  id: "3582b744bba84668b52a16b0b6942544"
                }
              },
              layers: [layer]
            }),
            container: "viewDiv",
            constraints: {
              snapToZoom: false
            },
            extent: {
              xmin: -122.902,
              ymin: 21.848,
              xmax: -75.73,
              ymax: 40.15
            }
          });

          //--------------------------------------------------------------------------
          //
          //  Setup UI
          //
          //--------------------------------------------------------------------------

          view.ui.empty("top-left");

          const applicationDiv = document.getElementById("applicationDiv");
          const sliderValue = document.getElementById("sliderValue");
          const playButton = document.getElementById("playButton");
          const titleDiv = document.getElementById("titleDiv");
          let animation = null;

          const slider = new Slider({
            container: "slider",
            min: 0,
            max: 100,
            values: [50],
            step: 0.25,
            visibleElements: {
              rangeLabels: true
            },
            labelFormatFunction: (value, type) => {
              if (type === "min") {
                return "Contested";
              }
              if (type === "max") {
                return "Landslide";
              }
              return value;
            }
          });

          function inputHandler(event) {
            stopAnimation();
            setGapValue(parseInt(event.value));
          }
          slider.on("thumb-drag", inputHandler);

          playButton.addEventListener("click", () => {
            if (playButton.classList.contains("toggled")) {
              stopAnimation();
            } else {
              startAnimation();
            }
          });

          view.ui.add(titleDiv, "top-left");
          view.ui.add(
            new Expand({
              view: view,
              content: new Legend({
                view: view
              })
            }),
            "top-left"
          );
          view.ui.add(
            new Home({
              view: view
            }),
            "top-left"
          );
          view.ui.add(
            new Fullscreen({
              view: view,
              element: applicationDiv
            }),
            "top-right"
          );

          // When the layerview is available, setup hovering interactivity
          const layerView = await view.whenLayerView(layer);

          setupHoverTooltip(layerView);

          // Starts the application by visualizing a gap of 50% between the two candidates
          setGapValue(0);

          //--------------------------------------------------------------------------
          //
          //  Methods
          //
          //--------------------------------------------------------------------------

          /**
           * Sets the current visualized gap.
           */
          function setGapValue(value) {
            sliderValue.innerHTML =
              "<span style='font-weight:bold; font-size:175%'>" +
              (Math.round(value * 100) / 100).toFixed(2) +
              " %</span> of the votes separate the two candidates";
            slider.viewModel.setValue(0, value);
            layerView.featureEffect = createEffect(value);
          }

          /**
           * Creates a feature effect centered around a gap between the 2 candidates.
           * If the precincts have the specified gap percentage, the drop-shadow
           * effect is applied to make them stand out from the rest. If they
           * fall outside of the specified gap percentage, grayscale, blur
           * and opacity effects are applied to subdue their presence.
           */
          function createEffect(gapValue) {
            gapValue = Math.min(100, Math.max(0, gapValue));

            function roundToTheTenth(value) {
              return Math.round(value * 10) / 10;
            }

            return {
              filter: {
                where: `PERCENT_GAP > ${roundToTheTenth(gapValue - 1)} AND PERCENT_GAP < ${roundToTheTenth(gapValue + 1)}`
              },
              includedEffect: "drop-shadow(0, 2px, 2px, black)",
              excludedEffect: "grayscale(25%) blur(5px) opacity(25%)"
            }
          }

          /**
           * Sets up a moving tooltip that displays
           * a chart with the voter count for each candidate,
           * and the gap between the two.
           */
          function setupHoverTooltip(layerview) {
            let highlight;

            const tooltip = createTooltip();

            const hitTest = promiseUtils.debounce((point) => {
              return view.hitTest(point).then((hit) => {
                const results = hit.results.filter((result) => {
                  return result.graphic.layer === layer;
                });

                if (results.length) {
                  const graphic = results[0].graphic;
                  const screenPoint = hit.screenPoint;

                  return {
                    graphic: graphic,
                    screenPoint: screenPoint,
                    values: {
                      democrat: Math.round(graphic.getAttribute("P2008_D")),
                      republican: Math.round(graphic.getAttribute("P2008_R"))
                    }
                  };
                } else {
                  return null;
                }
              });
            });

            view.on("pointer-move", (event) => {
              hitTest(event).then(
                function (result) {
                  if (highlight) {
                    highlight.remove();
                    highlight = null;
                  }

                  if (!result) {
                    tooltip.hide();
                    view.surface.style.cursor = "auto";
                  } else {
                    highlight = layerview.highlight(result.graphic);
                    tooltip.show(result.screenPoint, result.values);
                    view.surface.style.cursor = "pointer";
                  }
                },
                () => {}
              );
            });

            view.on("click", (event) => {
              hitTest(event)
                .then((result) => {
                  if (!result) {
                    return;
                  }

                  stopAnimation();

                  const dem = result.values.democrat;
                  const rep = result.values.republican;
                  const p_gap = ((Math.max(dem, rep) - Math.min(dem, rep)) / (dem + rep)) * 100;
                  animation = animateTo(p_gap);
                })
                .catch((error) => {
                  if (error.name != "AbortError") {
                    console.error(error);
                  }
                });
            });
          }

          /**
           * Starts the animation that cycle
           * through the gap between the two candidates.
           */
          function startAnimation() {
            stopAnimation();
            animation = animate(slider.values[0]);
            playButton.classList.add("toggled");
          }

          /**
           * Stops the animations
           */
          function stopAnimation() {
            if (!animation) {
              return;
            }

            animation.remove();
            animation = null;
            playButton.classList.remove("toggled");
          }

          /**
           * Animates the visualized gap continously.
           */
          function animate(startValue) {
            let animating = true;
            let value = startValue;
            let direction = 0.1;

            const frame = () => {
              if (!animating) {
                return;
              }

              value += direction;
              if (value > 100) {
                value = 100;
                direction = -direction;
              } else if (value < 0) {
                value = 0;
                direction = -direction;
              }

              setGapValue(value);
              requestAnimationFrame(frame);
            };

            requestAnimationFrame(frame);

            return {
              remove: () => {
                animating = false;
              }
            };
          }

          /**
           * Animates to a gap value.
           */
          function animateTo(targetValue) {
            let animating = true;

            const frame = () => {
              if (!animating) {
                return;
              }

              let value = slider.values[0];

              if (Math.abs(targetValue - value) < 1) {
                animating = false;
                setGapValue(targetValue);
              } else {
                setGapValue(value + (targetValue - value) * 0.25);
                requestAnimationFrame(frame);
              }
            };

            requestAnimationFrame(frame);

            return {
              remove: () => {
                animating = false;
              }
            };
          }

          /**
           * Creates a tooltip to display a chart showing the raw voters count
           * and the gap between the two candidates.
           */
          function createTooltip() {
            const tooltip = document.createElement("div");
            const style = tooltip.style;

            style.opacity = 0;
            tooltip.setAttribute("role", "tooltip");
            tooltip.classList.add("tooltip");

            const content = document.getElementById("tooltipContent");
            content.style.visibility = "visible";
            content.classList.add("esri-widget");
            tooltip.appendChild(content);

            view.container.appendChild(tooltip);

            let x = 0;
            let y = 0;
            let targetX = 0;
            let targetY = 0;
            let visible = false;
            let moveRaFTimer;

            function move() {
              function moveStep() {
                moveRaFTimer = null;
                x += (targetX - x) * 0.5;
                y += (targetY - y) * 0.5;

                if (Math.abs(targetX - x) < 1 && Math.abs(targetY - y) < 1) {
                  x = targetX;
                  y = targetY;
                } else {
                  moveRaFTimer = requestAnimationFrame(moveStep);
                }

                style.transform = "translate3d(" + Math.round(x) + "px," + Math.round(y) + "px, 0)";
              }

              if (!moveRaFTimer) {
                moveRaFTimer = requestAnimationFrame(moveStep);
              }
            }

            let dem;
            let rep;
            let updateRaFTimer;

            function updateContent(values) {
              if (dem === values.democrat && rep === values.republican) {
                return;
              }

              dem = values.democrat;
              rep = values.republican;
              cancelAnimationFrame(updateRaFTimer);

              updateRaFTimer = requestAnimationFrame(() => {
                let p_gap = (Math.max(dem, rep) - Math.min(dem, rep)) / (dem + rep);
                p_gap = Math.round(p_gap * 10000) / 100;
                let p_dem = (dem / (dem + rep)) * 100;
                let p_rep = (rep / (dem + rep)) * 100;

                document.querySelector("#chart .row.democrat .bar").style.width = p_dem + "%";
                document.querySelector("#chart .row.democrat .value > span").innerHTML = dem;

                document.querySelector("#chart .row.republican .bar").style.width = p_rep + "%";
                document.querySelector("#chart .row.republican .value > span").innerHTML = rep;

                document.querySelector("#chart .row.gap .bar").style.width = p_gap + "%";
                document.querySelector("#chart .row.gap .bar").style.marginLeft = Math.min(p_dem, p_rep) + "%";
                document.querySelector("#chart .row.gap .value > span").innerHTML = p_gap + "%";
              });
            }

            return {
              show: (point, values) => {
                if (!visible) {
                  x = point.x;
                  y = point.y;
                }

                targetX = point.x;
                targetY = point.y;
                style.opacity = 1;
                visible = true;

                move();
                updateContent(values);
              },

              hide: () => {
                style.opacity = 0;
                visible = false;
              }
            };
          }
        })();
      });