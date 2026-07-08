/* =========================================================================
 * data/londonnames.js — Place names for the London campaign (Phase 11).
 *
 * Same shape as data/machinames.js, but the names are Latin-script London
 * districts, so each pool entry is a plain string (no kanji/romaji pair).
 * Groups are anchored by (dc, dr) hex offset from the centre (Westminster);
 * dc is east-positive, dr is south-positive. The naming code (js/map.js
 * assignAreaNames) claims the nearest hexes to each anchor and hands out its
 * names by proximity, so the map reads like a Victorian A–Z with every cell
 * a real place. Overflow past a pool gets an English directional prefix
 * (New/North/South/East/West), each combination used at most once.
 * ========================================================================= */
const LONDON_MACHI = [
  // ---- the historic core: City & Westminster (centre) ----
  { c: "Westminster", dc: 0, dr: 0, n: [
    "Whitehall", "St James's", "Victoria", "Pimlico", "Millbank", "Petty France",
    "Broad Sanctuary", "Tothill Fields", "Storey's Gate", "Birdcage Walk", "Horseferry" ] },
  { c: "City", dc: 4, dr: -1, n: [
    "Cheapside", "Cornhill", "Poultry", "Aldgate", "Bishopsgate", "Cripplegate",
    "Farringdon", "Blackfriars", "Ludgate", "Newgate", "Moorgate", "Billingsgate",
    "Cannon Street", "Fenchurch", "Leadenhall", "Mincing Lane", "Threadneedle" ] },
  { c: "Holborn", dc: 2, dr: -2, n: [
    "Holborn", "Bloomsbury", "St Giles", "Seven Dials", "Clerkenwell", "Gray's Inn",
    "Hatton Garden", "Saffron Hill", "Lincoln's Inn", "Chancery Lane", "Red Lion Square" ] },
  { c: "Strand", dc: 2, dr: 0, n: [
    "Strand", "Covent Garden", "Aldwych", "Temple", "Somerset", "Charing Cross",
    "Adelphi", "Savoy", "Drury Lane", "Kingsway" ] },
  { c: "Soho", dc: -1, dr: -1, n: [
    "Soho", "Mayfair", "Marylebone", "Fitzrovia", "Piccadilly", "Regent Street",
    "Golden Square", "Berwick Street", "Carnaby", "Portland Place", "Cavendish" ] },
  // ---- inner north ----
  { c: "Islington", dc: 3, dr: -6, n: [
    "Islington", "Angel", "Barnsbury", "Canonbury", "Highbury", "Pentonville",
    "Holloway", "Finsbury", "Shoreditch", "Hoxton", "Old Street", "St Luke's" ] },
  { c: "Camden", dc: 0, dr: -7, n: [
    "Camden Town", "Kentish Town", "Somers Town", "Euston", "King's Cross", "St Pancras",
    "Chalk Farm", "Primrose Hill", "Agar Town", "Mornington" ] },
  { c: "Hampstead", dc: -3, dr: -12, n: [
    "Hampstead", "Belsize Park", "Gospel Oak", "Highgate", "Archway", "Tufnell Park",
    "Dartmouth Park", "Swiss Cottage", "West Hampstead", "Cricklewood", "Golders Green" ] },
  { c: "Stoke Newington", dc: 6, dr: -9, n: [
    "Stoke Newington", "Dalston", "Stamford Hill", "Clapton", "Hackney", "Homerton",
    "De Beauvoir", "Newington Green", "Manor House", "Finsbury Park" ] },
  // ---- inner west ----
  { c: "Kensington", dc: -6, dr: 0, n: [
    "Kensington", "South Kensington", "Earls Court", "Brompton", "Knightsbridge", "Chelsea",
    "Gloucester Road", "Cromwell Road", "The Boltons", "Redcliffe" ] },
  { c: "Paddington", dc: -5, dr: -3, n: [
    "Paddington", "Bayswater", "Maida Vale", "Little Venice", "Westbourne", "Lancaster Gate",
    "Notting Hill", "Ladbroke Grove", "Kensal", "Queensway" ] },
  { c: "Hammersmith", dc: -12, dr: 1, n: [
    "Hammersmith", "Fulham", "Shepherd's Bush", "Chiswick", "Barons Court", "West Kensington",
    "Parsons Green", "Sands End", "Brook Green", "White City", "Turnham Green" ] },
  { c: "Ealing", dc: -18, dr: -2, n: [
    "Ealing", "Acton", "Hanwell", "Greenford", "Perivale", "Northfields",
    "West Ealing", "South Ealing", "Park Royal", "Gunnersbury" ] },
  { c: "Richmond", dc: -16, dr: 8, n: [
    "Richmond", "Kew", "Twickenham", "Mortlake", "Sheen", "Barnes",
    "St Margarets", "Ham", "Petersham", "Isleworth", "Brentford" ] },
  // ---- inner south ----
  { c: "Lambeth", dc: 1, dr: 3, n: [
    "Lambeth", "Vauxhall", "Kennington", "Waterloo", "The Cut", "Elephant and Castle",
    "Stockwell", "Oval", "Nine Elms", "Albert Embankment" ] },
  { c: "Southwark", dc: 4, dr: 3, n: [
    "Southwark", "Bankside", "Bermondsey", "Borough", "Rotherhithe", "Walworth",
    "Newington", "Long Lane", "Tabard", "Dockhead" ] },
  { c: "Clapham", dc: -2, dr: 9, n: [
    "Clapham", "Battersea", "Brixton", "Balham", "Tooting", "Wandsworth",
    "Streatham", "Herne Hill", "Tulse Hill", "Nine Elms Lane", "Larkhall" ] },
  { c: "Camberwell", dc: 4, dr: 8, n: [
    "Camberwell", "Peckham", "Dulwich", "Nunhead", "East Dulwich", "Denmark Hill",
    "Champion Hill", "Honor Oak", "Forest Hill", "Sydenham" ] },
  { c: "Croydon", dc: 2, dr: 18, n: [
    "Croydon", "Norbury", "Thornton Heath", "Selhurst", "South Norwood", "Addiscombe",
    "Norwood", "Crystal Palace", "Penge", "Anerley", "Beckenham" ] },
  // ---- inner east ----
  { c: "Whitechapel", dc: 7, dr: 0, n: [
    "Whitechapel", "Spitalfields", "Stepney", "Mile End", "Bethnal Green", "Bow",
    "Wapping", "Shadwell", "Limehouse", "Ratcliff", "Poplar", "Mile End Old Town" ] },
  { c: "Isle of Dogs", dc: 9, dr: 3, n: [
    "Isle of Dogs", "Millwall", "Cubitt Town", "Blackwall", "Canning Town", "Bromley-by-Bow",
    "Old Ford", "Fish Island", "Three Mills", "Leamouth" ] },
  { c: "Greenwich", dc: 11, dr: 5, n: [
    "Greenwich", "Deptford", "New Cross", "Blackheath", "Lewisham", "Charlton",
    "Maze Hill", "Westcombe", "Brockley", "Ladywell", "Hither Green" ] },
  { c: "Woolwich", dc: 16, dr: 5, n: [
    "Woolwich", "Plumstead", "Eltham", "Abbey Wood", "Thamesmead", "Shooter's Hill",
    "Kidbrooke", "Well Hall", "Welling", "Bexleyheath" ] },
  { c: "Stratford", dc: 12, dr: -3, n: [
    "Stratford", "West Ham", "Plaistow", "Forest Gate", "Leyton", "Leytonstone",
    "Maryland", "Manor Park", "Upton Park", "Wanstead", "Ilford" ] },
  { c: "Walthamstow", dc: 10, dr: -8, n: [
    "Walthamstow", "Tottenham", "Wood Green", "Bruce Grove", "Seven Sisters", "South Tottenham",
    "Blackhorse", "St James Street", "Bush Hill", "Edmonton" ] },
  // ---- outer ring ----
  { c: "Barnet", dc: 0, dr: -18, n: [
    "Barnet", "Finchley", "Whetstone", "Totteridge", "Mill Hill", "Hendon",
    "Colindale", "Burnt Oak", "East Finchley", "Muswell Hill", "Friern Barnet" ] },
  { c: "Harrow", dc: -14, dr: -12, n: [
    "Harrow", "Wembley", "Kenton", "Pinner", "Stanmore", "Edgware",
    "Sudbury", "Alperton", "Northolt", "Wealdstone", "Rayners Lane" ] },
  { c: "Kingston", dc: -10, dr: 16, n: [
    "Kingston", "Surbiton", "New Malden", "Wimbledon", "Merton", "Morden",
    "Raynes Park", "Motspur Park", "Norbiton", "Chessington", "Tolworth" ] },
  { c: "Bromley", dc: 13, dr: 15, n: [
    "Bromley", "Catford", "Downham", "Grove Park", "Mottingham", "Chislehurst",
    "Sidcup", "Orpington", "Petts Wood", "Bickley", "Sundridge" ] },
  { c: "Enfield", dc: 6, dr: -17, n: [
    "Enfield", "Palmers Green", "Winchmore Hill", "Southgate", "Cockfosters", "Oakwood",
    "Bush Hill Park", "Ponders End", "Freezywater", "Grange Park" ] },
  { c: "Romford", dc: 20, dr: -2, n: [
    "Romford", "Barking", "Dagenham", "Hornchurch", "Upminster", "Rainham",
    "Chadwell Heath", "Goodmayes", "Seven Kings", "Becontree", "Elm Park" ] },
];
if (typeof window !== "undefined") window.LONDON_MACHI = LONDON_MACHI;
