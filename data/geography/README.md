# Local city boundaries

`cities.json` contains the U.S. Census Bureau TIGERweb Incorporated Places
polygons for Berkeley, Oakland, San Francisco, Albany and Emeryville. Retrieved
October 24, 2026 from the [January 1, 2026 vintage layer](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/28).
Query: `STATE='06' AND BASENAME IN ('San Francisco','Oakland','Berkeley','Albany','Emeryville')`,
`outFields=BASENAME,GEOID`, `outSR=4326`, `f=geojson`.

The module resolves browser coordinates against these polygons locally. It does
not send a participant's coordinates to Census or a geocoding provider. Points
outside these cities remain unsupported rather than guessing the nearest city.
Browser permission is required, and shared group views expose city counts only.
This source is separate from Eric Wu's venue scraping outputs.
