/* =========================================================================
 * data/parisnames.js — Place names for the Paris campaign (v0.6).
 *
 * Same shape as data/nycnames.js: plain Latin-script strings, grouped by
 * (dc, dr) hex offset from the centre (Châtelet, by the Louvre); dc is
 * east-positive, dr is south-positive. The naming code (js/map.js
 * assignAreaNames) claims the nearest hexes to each anchor and hands out its
 * names by proximity; overflow past a pool gets a directional prefix, each
 * combination used at most once. Geography echoes the map script: the Seine
 * sweeping west, Montmartre's heights north, the faubourgs ringing the old
 * city, the banlieue beyond.
 * ========================================================================= */
const PARIS_MACHI = [
  // ---- The old centre (Châtelet / the Louvre) ----
  { c: "Châtelet", dc: 0, dr: 0, n: [
    "Châtelet", "Les Halles", "Palais-Royal", "Rue de Rivoli", "Place Vendôme",
    "Bourse", "Sentier", "Montorgueil", "Vivienne", "Saint-Honoré" ] },
  { c: "Le Marais", dc: 3, dr: 0, n: [
    "Le Marais", "Hôtel de Ville", "Place des Vosges", "Saint-Paul", "Temple",
    "Arts-et-Métiers", "Beaubourg", "Archives", "Sainte-Avoye", "Blancs-Manteaux" ] },
  { c: "Île de la Cité", dc: 1, dr: 2, n: [
    "Île de la Cité", "Notre-Dame", "Île Saint-Louis", "Quai des Orfèvres", "Pont Neuf",
    "Conciergerie", "Sainte-Chapelle", "Quai aux Fleurs", "Petit Pont", "Port de l'Arsenal" ] },
  { c: "Quartier Latin", dc: 1, dr: 4, n: [
    "Quartier Latin", "Sorbonne", "Panthéon", "Saint-Michel", "Odéon",
    "Mouffetard", "Jardin des Plantes", "Val-de-Grâce", "Maubert", "Cluny" ] },
  { c: "Saint-Germain", dc: -2, dr: 3, n: [
    "Saint-Germain-des-Prés", "Luxembourg", "Rue de Rennes", "Sèvres-Babylone", "Bac",
    "Croix-Rouge", "Cherche-Midi", "Saint-Sulpice", "Vaugirard", "Notre-Dame-des-Champs" ] },
  { c: "Invalides", dc: -5, dr: 3, n: [
    "Invalides", "École Militaire", "Champ de Mars", "Gros-Caillou", "Saint-Dominique",
    "La Tour-Maubourg", "Varenne", "Solférino", "Orsay", "Rue Cler" ] },
  // ---- West (the beaux quartiers) ----
  { c: "Champs-Élysées", dc: -4, dr: -2, n: [
    "Champs-Élysées", "Rond-Point", "Concorde", "Madeleine", "Faubourg Saint-Honoré",
    "Marigny", "Matignon", "George V", "Alma", "Élysée" ] },
  { c: "Étoile", dc: -7, dr: -3, n: [
    "Étoile", "Kléber", "Victor-Hugo", "Ternes", "Wagram",
    "Friedland", "Iéna", "Trocadéro", "Chaillot", "Monceau" ] },
  { c: "Passy", dc: -9, dr: 1, n: [
    "Passy", "Auteuil", "La Muette", "Ranelagh", "Boulainvilliers",
    "Porte Dauphine", "Bois de Boulogne", "Point-du-Jour", "Exelmans", "Michel-Ange" ] },
  { c: "Neuilly", dc: -12, dr: -4, n: [
    "Neuilly-sur-Seine", "Levallois", "Courbevoie", "Puteaux", "Suresnes",
    "Sablons", "Bagatelle", "Pont de Neuilly", "La Défense", "Bécon" ] },
  { c: "Boulogne", dc: -12, dr: 5, n: [
    "Boulogne-Billancourt", "Sèvres", "Saint-Cloud", "Meudon", "Issy-les-Moulineaux",
    "Billancourt", "Pont de Sèvres", "Bellevue", "Chaville", "Ville-d'Avray" ] },
  // ---- North (Montmartre & the northern faubourgs) ----
  { c: "Opéra", dc: -1, dr: -4, n: [
    "Opéra", "Chaussée-d'Antin", "Grands Boulevards", "Richelieu-Drouot", "Trinité",
    "Saint-Lazare", "Europe", "Havre-Caumartin", "Provence", "Notre-Dame-de-Lorette" ] },
  { c: "Pigalle", dc: 0, dr: -7, n: [
    "Pigalle", "Abbesses", "Blanche", "Anvers", "Rochechouart",
    "Saint-Georges", "Martyrs", "Clichy", "Fontaine", "Bréda" ] },
  { c: "Montmartre", dc: -1, dr: -10, n: [
    "Montmartre", "Sacré-Cœur", "Tertre", "Lamarck", "Caulaincourt",
    "Jules-Joffrin", "Clignancourt", "Marcadet", "Ramey", "Custine" ] },
  { c: "Batignolles", dc: -5, dr: -7, n: [
    "Batignolles", "Épinettes", "Fourche", "Brochant", "Guy-Môquet",
    "La Condamine", "Rome", "Villiers", "Cardinet", "Pont de Levallois" ] },
  { c: "Saint-Denis Nord", dc: 1, dr: -14, n: [
    "Saint-Ouen", "Saint-Denis", "La Plaine", "Aubervilliers", "Pleyel",
    "Carrefour Pleyel", "Porte de Clignancourt", "Les Puces", "La Chapelle Nord", "Stains" ] },
  { c: "La Chapelle", dc: 2, dr: -9, n: [
    "La Chapelle", "Barbès", "Château Rouge", "Goutte d'Or", "Marx-Dormoy",
    "Stalingrad", "La Villette", "Riquet", "Crimée", "Pont de Flandre" ] },
  // ---- East (the working faubourgs) ----
  { c: "République", dc: 4, dr: -3, n: [
    "République", "Oberkampf", "Folie-Méricourt", "Goncourt", "Belleville Bas",
    "Parmentier", "Saint-Ambroise", "Jean-Pierre Timbaud", "Canal Saint-Martin", "Jacques-Bonsergent" ] },
  { c: "Belleville", dc: 6, dr: -7, n: [
    "Belleville", "Ménilmontant", "Pyrénées", "Jourdain", "Télégraphe",
    "Couronnes", "Gambetta", "Père-Lachaise", "Saint-Fargeau", "Amandiers" ] },
  { c: "Bastille", dc: 5, dr: 1, n: [
    "Bastille", "Faubourg Saint-Antoine", "Ledru-Rollin", "Charonne", "Aligre",
    "Chemin Vert", "Roquette", "Voltaire", "Nation", "Faidherbe" ] },
  { c: "Bercy", dc: 7, dr: 4, n: [
    "Bercy", "Gare de Lyon", "Daumesnil", "Reuilly", "Picpus",
    "Quai de la Rapée", "Cour Saint-Émilion", "Dugommier", "Michel-Bizot", "Porte Dorée" ] },
  { c: "Vincennes", dc: 11, dr: -1, n: [
    "Vincennes", "Montreuil", "Bagnolet", "Fontenay-sous-Bois", "Saint-Mandé",
    "Bois de Vincennes", "Croix de Chavaux", "Robespierre", "Les Lilas", "Romainville" ] },
  { c: "Pantin", dc: 8, dr: -11, n: [
    "Pantin", "Le Pré-Saint-Gervais", "Bobigny", "Noisy-le-Sec", "Bondy",
    "Église de Pantin", "Hoche", "Quatre Chemins", "Fort d'Aubervilliers", "Drancy" ] },
  // ---- South (the left-bank faubourgs & banlieue) ----
  { c: "Montparnasse", dc: -3, dr: 7, n: [
    "Montparnasse", "Raspail", "Denfert-Rochereau", "Alésia", "Plaisance",
    "Pernety", "Gaîté", "Edgar-Quinet", "Mouton-Duvernet", "Porte d'Orléans" ] },
  { c: "Gobelins", dc: 3, dr: 7, n: [
    "Les Gobelins", "Place d'Italie", "Butte-aux-Cailles", "Tolbiac", "Glacière",
    "Corvisart", "Campo-Formio", "Nationale", "Olympiades", "Maison Blanche" ] },
  { c: "Ivry", dc: 6, dr: 10, n: [
    "Ivry-sur-Seine", "Vitry-sur-Seine", "Charenton", "Alfortville", "Maisons-Alfort",
    "Port à l'Anglais", "Les Ardoines", "Gare d'Austerlitz Sud", "Chinagora", "Le Kremlin-Bicêtre" ] },
  { c: "Montrouge", dc: -2, dr: 12, n: [
    "Montrouge", "Malakoff", "Vanves", "Châtillon", "Bagneux",
    "Arcueil", "Cachan", "Gentilly", "Fontenay-aux-Roses", "Sceaux" ] },
  { c: "Versailles Road", dc: -9, dr: 10, n: [
    "Clamart", "Le Plessis-Robinson", "Vélizy", "Viroflay", "Versailles-Chantiers",
    "Petit-Clamart", "Bièvres", "Jouy-en-Josas", "Chaville Rive Gauche", "Porchefontaine" ] },
  // ---- Far corners ----
  { c: "Argenteuil", dc: -8, dr: -12, n: [
    "Argenteuil", "Asnières", "Gennevilliers", "Colombes", "Bois-Colombes",
    "La Garenne", "Clichy-la-Garenne", "Villeneuve-la-Garenne", "Épinay", "Sannois" ] },
  { c: "Le Bourget", dc: 6, dr: -16, n: [
    "Le Bourget", "La Courneuve", "Dugny", "Blanc-Mesnil", "Sevran",
    "Livry-Gargan", "Aulnay-sous-Bois", "Villepinte", "Le Raincy", "Gagny" ] },
  { c: "Créteil", dc: 12, dr: 9, n: [
    "Créteil", "Saint-Maur", "Champigny", "Joinville-le-Pont", "Nogent-sur-Marne",
    "Le Perreux", "Bry-sur-Marne", "Chennevières", "Bonneuil", "Sucy" ] },
  { c: "Orly", dc: 2, dr: 16, n: [
    "Orly", "Choisy-le-Roi", "Thiais", "Villejuif", "L'Haÿ-les-Roses",
    "Chevilly-Larue", "Rungis", "Athis-Mons", "Juvisy", "Savigny-sur-Orge" ] },
];
if (typeof window !== "undefined") window.PARIS_MACHI = PARIS_MACHI;
