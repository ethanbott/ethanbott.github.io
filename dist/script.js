require(["esri/Map", "esri/views/MapView"], (Map, MapView) => {const map = new Map({
          basemap: "terrain"
        });

        const view = new MapView({
          container: "viewDiv",
          map: map,
          zoom: 13,
          center: [-93.270062, 44.975069] // longitude, latitude
        });
      });