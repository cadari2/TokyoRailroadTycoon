/* =========================================================================
 * data/melbnames.js — Place names for the Melbourne campaign (v0.5.6).
 *
 * Same shape as data/londonnames.js: plain Latin-script strings, grouped by
 * (dc, dr) hex offset from the centre (Flinders Street); dc is east-positive,
 * dr is south-positive. Geography echoes the map script: Port Phillip Bay
 * fills the south, the Yarra winds in from the east, the basalt plains lie
 * west and the Dandenong hills east; the bayside suburbs arc down the
 * south-east shore.
 * ========================================================================= */
const MELB_MACHI = [
  // ---- the Hoddle grid & inner core (centre: Flinders Street) ----
  { c: "City", dc: 0, dr: 0, n: [
    "Collins Street", "Bourke Street", "Swanston Street", "Elizabeth Street", "Little Collins",
    "Chinatown", "Queen Victoria Market", "Flagstaff", "Treasury", "Spring Street", "Degraves" ] },
  { c: "Southbank", dc: 0, dr: 2, n: [
    "Southbank", "South Wharf", "Fishermans Bend", "South Melbourne", "Albert Park",
    "Emerald Hill", "Montague", "Clarendon Street", "Kings Domain", "Wirraway" ] },
  { c: "Docklands", dc: -3, dr: 0, n: [
    "Docklands", "West Melbourne", "Victoria Harbour", "Batmans Hill", "Yarraville",
    "Spotswood", "Seddon", "Footscray", "Kingsville", "West Footscray" ] },
  { c: "Carlton", dc: 0, dr: -3, n: [
    "Carlton", "Carlton North", "Parkville", "Princes Hill", "Lygon Street",
    "University", "Royal Park", "North Melbourne", "Hotham Hill", "Errol Street" ] },
  { c: "Fitzroy", dc: 2, dr: -3, n: [
    "Fitzroy", "Fitzroy North", "Collingwood", "Clifton Hill", "Abbotsford",
    "Smith Street", "Brunswick Street", "Gertrude Street", "Edinburgh Gardens", "Victoria Park" ] },
  { c: "East Melbourne", dc: 2, dr: -1, n: [
    "East Melbourne", "Jolimont", "Richmond", "Cremorne", "Burnley",
    "Bridge Road", "Swan Street", "Yarra Park", "Punt Road", "Church Street" ] },
  // ---- inner south & bayside arc ----
  { c: "St Kilda", dc: 0, dr: 6, n: [
    "St Kilda", "St Kilda East", "Balaclava", "Elwood", "Ripponlea",
    "Middle Park", "Fitzroy Street", "Acland Street", "Luna Park", "St Kilda Junction" ] },
  { c: "Prahran", dc: 3, dr: 4, n: [
    "Prahran", "Windsor", "South Yarra", "Toorak", "Armadale",
    "Hawksburn", "Chapel Street", "Como", "Kooyong", "Malvern" ] },
  { c: "Brighton", dc: 3, dr: 10, n: [
    "Brighton", "Brighton East", "Middle Brighton", "North Brighton", "Hampton",
    "Sandringham", "Black Rock", "Beaumaris", "Gardenvale", "Elsternwick" ] },
  { c: "Caulfield", dc: 5, dr: 7, n: [
    "Caulfield", "Caulfield North", "Glen Huntly", "Carnegie", "Murrumbeena",
    "Ormond", "McKinnon", "Bentleigh", "Moorabbin", "Highett" ] },
  { c: "Mordialloc", dc: 7, dr: 14, n: [
    "Mordialloc", "Cheltenham", "Mentone", "Parkdale", "Aspendale",
    "Edithvale", "Chelsea", "Bonbeach", "Carrum", "Seaford", "Frankston" ] },
  // ---- inner north ----
  { c: "Brunswick", dc: -1, dr: -7, n: [
    "Brunswick", "Brunswick East", "Brunswick West", "Coburg", "Pascoe Vale",
    "Sydney Road", "Moreland", "Merlynston", "Batman", "Jewell" ] },
  { c: "Northcote", dc: 3, dr: -7, n: [
    "Northcote", "Thornbury", "Preston", "Regent", "Reservoir",
    "Fairfield", "Alphington", "Westgarth", "Croxton", "Bell Street" ] },
  { c: "Essendon", dc: -5, dr: -8, n: [
    "Essendon", "Moonee Ponds", "Ascot Vale", "Flemington", "Kensington",
    "Aberfeldie", "Strathmore", "Glenbervie", "Newmarket", "Travancore" ] },
  { c: "Heidelberg", dc: 7, dr: -10, n: [
    "Heidelberg", "Ivanhoe", "Eaglemont", "Rosanna", "Macleod",
    "Viewbank", "Bulleen", "Banyule", "Watsonia", "Greensborough" ] },
  { c: "Broadmeadows", dc: -3, dr: -14, n: [
    "Broadmeadows", "Glenroy", "Fawkner", "Hadfield", "Oak Park",
    "Jacana", "Dallas", "Campbellfield", "Coolaroo", "Meadow Heights" ] },
  { c: "Epping", dc: 2, dr: -16, n: [
    "Epping", "Thomastown", "Lalor", "Bundoora", "Mill Park",
    "South Morang", "Wollert", "Somerton", "Craigieburn", "Roxburgh Park" ] },
  { c: "Whittlesea", dc: 6, dr: -20, n: [
    "Whittlesea", "Mernda", "Doreen", "Yan Yean", "Eltham",
    "Diamond Creek", "Hurstbridge", "Plenty", "Wattle Glen", "Kangaroo Ground" ] },
  // ---- east (toward the Dandenongs) ----
  { c: "Hawthorn", dc: 5, dr: 1, n: [
    "Hawthorn", "Hawthorn East", "Glenferrie", "Auburn", "Camberwell",
    "Canterbury", "Deepdene", "Balwyn", "Kew", "Kew East" ] },
  { c: "Box Hill", dc: 9, dr: -2, n: [
    "Box Hill", "Surrey Hills", "Mont Albert", "Blackburn", "Nunawading",
    "Mitcham", "Vermont", "Forest Hill", "Burwood", "Laburnum" ] },
  { c: "Glen Waverley", dc: 10, dr: 4, n: [
    "Glen Waverley", "Mount Waverley", "Ashwood", "Chadstone", "Oakleigh",
    "Hughesdale", "Huntingdale", "Clayton", "Notting Hill", "Syndal" ] },
  { c: "Ringwood", dc: 14, dr: -4, n: [
    "Ringwood", "Heathmont", "Croydon", "Bayswater", "Boronia",
    "Wantirna", "Kilsyth", "Mooroolbark", "Lilydale", "Chirnside Park" ] },
  { c: "Dandenong Ranges", dc: 17, dr: 1, n: [
    "Ferntree Gully", "Upper Ferntree Gully", "Upwey", "Tecoma", "Belgrave",
    "Sassafras", "Olinda", "Mount Dandenong", "Kalorama", "Monbulk", "Emerald" ] },
  { c: "Dandenong", dc: 13, dr: 10, n: [
    "Dandenong", "Noble Park", "Springvale", "Keysborough", "Endeavour Hills",
    "Doveton", "Hallam", "Narre Warren", "Berwick", "Cranbourne" ] },
  { c: "Doncaster", dc: 10, dr: -7, n: [
    "Doncaster", "Doncaster East", "Templestowe", "Lower Templestowe", "Warrandyte",
    "Donvale", "Park Orchards", "Wonga Park", "Ringwood North", "Warranwood" ] },
  // ---- west (the basalt plains) ----
  { c: "Williamstown", dc: -6, dr: 5, n: [
    "Williamstown", "Newport", "Altona", "Altona North", "Seaholme",
    "Laverton", "Point Cook", "Sanctuary Lakes", "Brooklyn", "South Kingsville" ] },
  { c: "Sunshine", dc: -9, dr: -3, n: [
    "Sunshine", "Braybrook", "Albion", "Ardeer", "Deer Park",
    "St Albans", "Sunshine North", "Cairnlea", "Maidstone", "Tottenham" ] },
  { c: "Keilor", dc: -10, dr: -10, n: [
    "Keilor", "Keilor East", "Keilor Downs", "Airport West", "Niddrie",
    "Avondale Heights", "Taylors Lakes", "Sydenham", "Delahey", "Kealba" ] },
  { c: "Werribee", dc: -15, dr: 8, n: [
    "Werribee", "Hoppers Crossing", "Tarneit", "Truganina", "Wyndham Vale",
    "Werribee South", "Little River", "Manor Lakes", "Cocoroc", "Quandong" ] },
  { c: "Melton", dc: -17, dr: -7, n: [
    "Melton", "Melton South", "Rockbank", "Caroline Springs", "Burnside",
    "Hillside", "Diggers Rest", "Toolern Vale", "Kurunjang", "Brookfield" ] },
  { c: "Sunbury", dc: -12, dr: -16, n: [
    "Sunbury", "Bulla", "Gisborne", "Riddells Creek", "Clarkefield",
    "Romsey", "Lancefield", "Macedon", "Mount Macedon", "Wildwood" ] },
  // ---- across the bay / far south-east ----
  { c: "Mornington", dc: 3, dr: 20, n: [
    "Mornington", "Mount Eliza", "Mount Martha", "Dromana", "Rosebud",
    "Rye", "Sorrento", "Portsea", "Safety Beach", "McCrae" ] },
  { c: "Geelong", dc: -13, dr: 17, n: [
    "Geelong", "Corio", "Lara", "North Geelong", "Newtown (Geelong)",
    "Belmont", "Highton", "Drysdale", "Queenscliff", "Portarlington" ] },
];
if (typeof window !== "undefined") window.MELB_MACHI = MELB_MACHI;
