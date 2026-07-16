/* =========================================================================
 * data/nycnames.js — Place names for the New York campaign (v0.5.6).
 *
 * Same shape as data/londonnames.js: plain Latin-script strings, grouped by
 * (dc, dr) hex offset from the centre (City Hall); dc is east-positive, dr is
 * south-positive. The naming code (js/map.js assignAreaNames) claims the
 * nearest hexes to each anchor and hands out its names by proximity; overflow
 * past a pool gets an English directional prefix, each combination used at
 * most once. Geography echoes the map script: the Hudson west of centre with
 * the Jersey shore beyond, Brooklyn/Queens east and south-east, the Bronx and
 * Westchester hills north, the harbor to the south.
 * ========================================================================= */
const NYC_MACHI = [
  // ---- Lower Manhattan (centre: City Hall) ----
  { c: "City Hall", dc: 0, dr: 0, n: [
    "Park Row", "Printing House Square", "Five Points", "Chatham Square", "Foley Square",
    "The Bowery", "Chambers Street", "Tribeca", "Worth Street", "Mulberry Bend" ] },
  { c: "Financial District", dc: 0, dr: 3, n: [
    "Wall Street", "Bowling Green", "The Battery", "Hanover Square", "Coenties Slip",
    "Broad Street", "Maiden Lane", "Fulton Ferry", "South Street Seaport", "Whitehall", "Castle Garden" ] },
  { c: "Lower East Side", dc: 3, dr: -1, n: [
    "Lower East Side", "Corlears Hook", "Grand Street", "Delancey", "Orchard Street",
    "Essex Market", "Rutgers Square", "East Broadway", "Two Bridges", "Rivington" ] },
  { c: "SoHo", dc: -1, dr: -2, n: [
    "SoHo", "Little Italy", "NoLIta", "Canal Street", "Greene Street", "Lispenard",
    "Hudson Square", "Chinatown", "Mott Street", "Broome Street" ] },
  { c: "Greenwich Village", dc: -1, dr: -4, n: [
    "Greenwich Village", "Washington Square", "Astor Place", "Cooper Square", "West Village",
    "Sheridan Square", "Gansevoort Market", "St Mark's Place", "NoHo", "Bond Street" ] },
  // ---- Midtown & upper Manhattan (north = -dr) ----
  { c: "Chelsea", dc: -2, dr: -6, n: [
    "Chelsea", "Flatiron", "Madison Square", "Union Square", "Gramercy Park",
    "Stuyvesant Square", "Kips Bay", "Rose Hill", "NoMad", "Ladies' Mile" ] },
  { c: "Midtown", dc: -2, dr: -9, n: [
    "Midtown", "Herald Square", "Murray Hill", "Times Square", "Bryant Park",
    "Turtle Bay", "Tudor City", "Garment District", "Hell's Kitchen", "Grand Central", "Longacre" ] },
  { c: "Upper East Side", dc: -1, dr: -12, n: [
    "Upper East Side", "Lenox Hill", "Yorkville", "Carnegie Hill", "Sutton Place",
    "Beekman Place", "East Sixties", "Gracie Square", "Hunter Square", "Ruppert Yards" ] },
  { c: "Upper West Side", dc: -4, dr: -12, n: [
    "Upper West Side", "Lincoln Square", "San Juan Hill", "Bloomingdale", "Manhattan Valley",
    "Riverside", "Columbus Circle", "Sherman Square", "Stryker's Bay", "West End" ] },
  { c: "Harlem", dc: -3, dr: -15, n: [
    "Harlem", "East Harlem", "Morningside Heights", "Manhattanville", "Hamilton Heights",
    "Sugar Hill", "Strivers' Row", "Mount Morris", "Lenox Avenue", "St Nicholas Heights" ] },
  { c: "Washington Heights", dc: -4, dr: -18, n: [
    "Washington Heights", "Inwood", "Fort George", "Hudson Heights", "Audubon Park",
    "Fort Tryon", "Sherman Creek", "Marble Hill", "Dyckman Street", "Highbridge Heights" ] },
  // ---- The Bronx & Westchester (north hills) ----
  { c: "South Bronx", dc: 0, dr: -17, n: [
    "Mott Haven", "Melrose", "Port Morris", "Hunts Point", "Longwood",
    "Morrisania", "Highbridge", "Concourse", "Crotona Park", "Claremont" ] },
  { c: "Fordham", dc: -1, dr: -20, n: [
    "Fordham", "Belmont", "Tremont", "University Heights", "Kingsbridge",
    "Bedford Park", "Norwood", "Fleetwood", "Mosholu", "Jerome Park" ] },
  { c: "Riverdale", dc: -6, dr: -21, n: [
    "Riverdale", "Spuyten Duyvil", "Fieldston", "Van Cortlandt", "Woodlawn",
    "Yonkers", "Ludlow", "Park Hill", "Getty Square", "Hastings" ] },
  { c: "East Bronx", dc: 4, dr: -19, n: [
    "West Farms", "Soundview", "Castle Hill", "Parkchester", "Westchester Square",
    "Throggs Neck", "Morris Park", "Pelham Bay", "City Island", "Co-op City", "Baychester" ] },
  { c: "Westchester", dc: 2, dr: -23, n: [
    "Mount Vernon", "New Rochelle", "Pelham", "Eastchester", "Bronxville",
    "Tuckahoe", "Scarsdale", "Wakefield", "Williamsbridge", "Nereid" ] },
  // ---- Brooklyn (east & south-east across the East River) ----
  { c: "Brooklyn Heights", dc: 4, dr: 4, n: [
    "Brooklyn Heights", "DUMBO", "Vinegar Hill", "Downtown Brooklyn", "Cobble Hill",
    "Boerum Hill", "Fort Greene", "Clinton Hill", "Navy Yard", "Cadman Plaza", "Atlantic Terminal" ] },
  { c: "Williamsburg", dc: 6, dr: -1, n: [
    "Williamsburg", "Greenpoint", "Bushwick", "East Williamsburg", "Bedford-Stuyvesant",
    "Broadway Junction", "Ridgewood", "Wallabout", "Grand Ferry", "McCarren" ] },
  { c: "Park Slope", dc: 5, dr: 8, n: [
    "Park Slope", "Gowanus", "Carroll Gardens", "Red Hook", "Prospect Heights",
    "Windsor Terrace", "Greenwood", "Sunset Park", "South Slope", "Crown Heights" ] },
  { c: "Flatbush", dc: 8, dr: 10, n: [
    "Flatbush", "Prospect Park South", "Ditmas Park", "Kensington", "Midwood",
    "East Flatbush", "Flatlands", "Marine Park", "Mill Basin", "Canarsie" ] },
  { c: "Bay Ridge", dc: 4, dr: 14, n: [
    "Bay Ridge", "Fort Hamilton", "Dyker Heights", "Bensonhurst", "Bath Beach",
    "New Utrecht", "Borough Park", "Mapleton", "Gravesend", "Ulmer Park" ] },
  { c: "Coney Island", dc: 8, dr: 17, n: [
    "Coney Island", "Brighton Beach", "Sheepshead Bay", "Manhattan Beach", "Sea Gate",
    "West Brighton", "Homecrest", "Gerritsen Beach", "Plumb Beach", "Bergen Beach" ] },
  { c: "East New York", dc: 12, dr: 6, n: [
    "East New York", "Brownsville", "Cypress Hills", "City Line", "New Lots",
    "Ocean Hill", "Highland Park", "Starrett City", "Spring Creek", "Woodhaven" ] },
  // ---- Queens (north-east & east) ----
  { c: "Long Island City", dc: 6, dr: -6, n: [
    "Long Island City", "Astoria", "Hunters Point", "Ravenswood", "Sunnyside",
    "Ditmars", "Steinway", "Queensbridge", "Dutch Kills", "Blissville" ] },
  { c: "Jackson Heights", dc: 9, dr: -8, n: [
    "Jackson Heights", "Woodside", "Elmhurst", "Corona", "East Elmhurst",
    "Maspeth", "Middle Village", "Rego Park", "Glendale", "Newtown" ] },
  { c: "Flushing", dc: 14, dr: -10, n: [
    "Flushing", "College Point", "Whitestone", "Murray Hill (Queens)", "Auburndale",
    "Bayside", "Fresh Meadows", "Kew Gardens Hills", "Utopia", "Douglaston", "Little Neck" ] },
  { c: "Jamaica", dc: 16, dr: -3, n: [
    "Jamaica", "Forest Hills", "Kew Gardens", "Richmond Hill", "Briarwood",
    "Hollis", "St Albans", "Queens Village", "Hillside", "Ozone Park", "South Jamaica" ] },
  { c: "Far Rockaway", dc: 19, dr: 8, n: [
    "Far Rockaway", "Rockaway Beach", "Arverne", "Howard Beach", "Broad Channel",
    "Rosedale", "Laurelton", "Springfield Gardens", "Cambria Heights", "Valley Stream" ] },
  { c: "Nassau", dc: 21, dr: -8, n: [
    "Great Neck", "Manhasset", "Port Washington", "Mineola", "Garden City",
    "Hempstead", "Floral Park", "New Hyde Park", "Westbury", "Hicksville" ] },
  // ---- Jersey shore (west of the Hudson) ----
  { c: "Jersey City", dc: -9, dr: 2, n: [
    "Jersey City", "Paulus Hook", "Exchange Place", "Harsimus", "Communipaw",
    "Bergen Hill", "Greenville", "Lafayette", "The Heights", "Journal Square" ] },
  { c: "Hoboken", dc: -9, dr: -5, n: [
    "Hoboken", "Weehawken", "Union City", "West New York", "Guttenberg",
    "North Bergen", "Secaucus", "Castle Point", "Elysian Fields", "Bull's Ferry" ] },
  { c: "Newark", dc: -14, dr: 1, n: [
    "Newark", "Ironbound", "Kearny", "Harrison", "East Newark",
    "Belleville", "Bloomfield", "Arlington", "Vailsburg", "Branch Brook" ] },
  { c: "Bayonne", dc: -8, dr: 9, n: [
    "Bayonne", "Constable Hook", "Bergen Point", "Port Johnston", "Greenville Yards",
    "Liberty Island", "Ellis Island", "Black Tom", "Caven Point", "Curries Woods" ] },
  { c: "Fort Lee", dc: -10, dr: -13, n: [
    "Fort Lee", "Edgewater", "Cliffside Park", "Fairview", "Ridgefield",
    "Palisades Park", "Leonia", "Englewood", "Coytesville", "Grantwood" ] },
  // ---- Staten Island (south-west across the harbor) ----
  { c: "Staten Island", dc: -4, dr: 16, n: [
    "St George", "Tompkinsville", "Stapleton", "Clifton", "New Brighton",
    "Port Richmond", "West Brighton", "Snug Harbor", "Grymes Hill", "Rosebank", "Todt Hill" ] },
];
if (typeof window !== "undefined") window.NYC_MACHI = NYC_MACHI;
