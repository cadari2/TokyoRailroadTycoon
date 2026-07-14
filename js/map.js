/* =========================================================================
 * map.js — Hex grid math (odd-r offset + cube coords), procedural terrain
 * generation for fictionalized Greater Tokyo, spiral indexing for names.
 *
 * Coordinates: hexes are stored in a flat array indexed by row*MAP_W+col
 * using "odd-r" offset coordinates (pointy-top hexes, odd rows shifted
 * right). Cube coordinates are used for distance and ring/spiral walks.
 * ========================================================================= */
"use strict";

const HEX_DIRS_EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];   // E NE NW W SW SE
const HEX_DIRS_ODD  = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];

function hexIdx(col, row) { return row * CFG.MAP_W + col; }
function inMap(col, row) { return col >= 0 && col < CFG.MAP_W && row >= 0 && row < CFG.MAP_H; }

/** Neighbor index in direction d (0..5), or -1 if off-map. */
function hexNeighbor(col, row, d) {
  const dirs = (row & 1) ? HEX_DIRS_ODD : HEX_DIRS_EVEN;
  const c = col + dirs[d][0], r = row + dirs[d][1];
  return inMap(c, r) ? hexIdx(c, r) : -1;
}
function neighborsOf(idx) {
  const col = idx % CFG.MAP_W, row = (idx / CFG.MAP_W) | 0, out = [];
  for (let d = 0; d < 6; d++) { const n = hexNeighbor(col, row, d); if (n >= 0) out.push(n); }
  return out;
}

/** odd-r offset → cube coords. */
function offsetToCube(col, row) {
  const x = col - ((row - (row & 1)) >> 1);
  const z = row;
  return [x, -x - z, z];
}
function cubeToOffset(x, y, z) {
  const col = x + ((z - (z & 1)) >> 1);
  return [col, z];
}
function hexDist(a, b) {
  const [ax, ay, az] = offsetToCube(a % CFG.MAP_W, (a / CFG.MAP_W) | 0);
  const [bx, by, bz] = offsetToCube(b % CFG.MAP_W, (b / CFG.MAP_W) | 0);
  return (Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(az - bz)) / 2;
}
/** All in-map hex indices within radius r of idx (including itself). */
function hexesWithin(idx, r) {
  const col = idx % CFG.MAP_W, row = (idx / CFG.MAP_W) | 0;
  const [cx, , cz] = offsetToCube(col, row);
  const out = [];
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = Math.max(-r, -dx - r); dz <= Math.min(r, -dx + r); dz++) {
      const [c, rr] = cubeToOffset(cx + dx, 0, cz + dz);
      if (inMap(c, rr)) out.push(hexIdx(c, rr));
    }
  }
  return out;
}

/* ---- Spiral indexing (for hex names) ------------------------------------
 * Index 0 = center. Ring k starts at 3k(k-1)+1, walks 6k hexes CLOCKWISE
 * starting due east of center. On a pointy-top map with +z downward, the
 * clockwise cube direction order starting East is:
 * E(1,-1,0) SE(0,-1,1) SW(-1,0,1) W(-1,1,0) NW(0,1,-1) NE(1,0,-1).
 */
const SPIRAL_DIRS = [[-1, 0, 1], [-1, 1, 0], [0, 1, -1], [1, 0, -1], [1, -1, 0], [0, -1, 1]];

function computeSpiralIndices() {
  const map = new Int32Array(CFG.MAP_W * CFG.MAP_H).fill(-1);
  const [ccx, , ccz] = offsetToCube(CFG.CENTER.col, CFG.CENTER.row);
  const ccy = -ccx - ccz;
  let spiral = 0;
  const place = (x, y, z) => {
    const [c, r] = cubeToOffset(x, y, z);
    if (inMap(c, r)) map[hexIdx(c, r)] = spiral;
    spiral++;
  };
  place(ccx, ccy, ccz);
  const maxRing = CFG.MAP_W + CFG.MAP_H; // covers all corners
  for (let k = 1; k <= maxRing; k++) {
    // start due east of center, k steps out
    let x = ccx + k, y = ccy - k, z = ccz;
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < k; step++) {
        place(x, y, z);
        x += SPIRAL_DIRS[side][0]; y += SPIRAL_DIRS[side][1]; z += SPIRAL_DIRS[side][2];
      }
    }
  }
  return map;
}

/* ---- Area names ----------------------------------------------------------
 * Every hex gets its own real Shōwa-era 町名 (see assignAreaNames, which draws
 * from the ward pools in data/machinames.js). These district anchors give the
 * geographic frame — and the coarse fallback names for the sparse periphery —
 * placed by offset from the CENTER hex (the Imperial Palace) to roughly echo
 * modern Tokyo: Marunouchi/Ginza east & south-east, Kanda/Ueno/Asakusa to
 * the north, the Shibuya–Shinjuku–Ikebukuro arc to the west, Shinagawa and
 * Kamata south toward Kanagawa, Fukagawa/Kasai east toward the bay, with the
 * outer wards and neighboring prefectures around the rim. Terrain is
 * generated independently, so a name need not match its hex's terrain.
 * Offsets are (east+, south+) hexes from CENTER. Many names are Edo-era
 * district names (cf. the kiriezu maps) that survive in modern Tokyo. */
const TOKYO_AREAS = [
  // -- Imperial Palace & central Chiyoda / Chuo --
  { name: "皇居", romaji: "Kokyo",             dc:   0, dr:   0 },   // Imperial Palace (center)
  { name: "丸の内", romaji: "Marunouchi",       dc:   1, dr:   0 },   // Marunouchi / Tokyo Stn
  { name: "大手町", romaji: "Otemachi",         dc:   1, dr:  -1 },   // Otemachi
  { name: "日本橋", romaji: "Nihonbashi",       dc:   2, dr:  -2 },   // Nihonbashi
  { name: "神田", romaji: "Kanda",             dc:   1, dr:  -3 },   // Kanda
  { name: "秋葉原", romaji: "Akihabara",        dc:   2, dr:  -4 },   // Akihabara
  { name: "京橋", romaji: "Kyobashi",          dc:   2, dr:   1 },   // Kyobashi
  { name: "銀座", romaji: "Ginza",             dc:   2, dr:   2 },   // Ginza
  { name: "日比谷", romaji: "Hibiya",           dc:   0, dr:   2 },   // Hibiya
  { name: "新橋", romaji: "Shimbashi",         dc:   1, dr:   3 },   // Shimbashi
  { name: "築地", romaji: "Tsukiji",           dc:   3, dr:   3 },   // Tsukiji
  { name: "霞が関", romaji: "Kasumigaseki",     dc:  -1, dr:   2 },   // Kasumigaseki
  { name: "永田町", romaji: "Nagatacho",        dc:  -2, dr:   2 },   // Nagatacho
  { name: "九段", romaji: "Kudan",             dc:  -1, dr:  -2 },   // Kudan
  // -- North (Bunkyo / Taito) --
  { name: "本郷", romaji: "Hongo",             dc:   0, dr:  -4 },   // Hongo (Tokyo Univ)
  { name: "湯島", romaji: "Yushima",           dc:   1, dr:  -5 },   // Yushima
  { name: "上野", romaji: "Ueno",              dc:   2, dr:  -6 },   // Ueno
  { name: "浅草", romaji: "Asakusa",           dc:   4, dr:  -7 },   // Asakusa
  { name: "小石川", romaji: "Koishikawa",       dc:  -2, dr:  -4 },   // Koishikawa
  { name: "駒込", romaji: "Komagome",          dc:   0, dr:  -7 },   // Komagome
  { name: "日暮里", romaji: "Nippori",          dc:   2, dr:  -8 },   // Nippori
  { name: "田端", romaji: "Tabata",            dc:   1, dr:  -9 },   // Tabata
  { name: "王子", romaji: "Oji",               dc:   1, dr: -12 },   // Oji
  { name: "赤羽", romaji: "Akabane",           dc:   1, dr: -14 },   // Akabane (edge → Saitama)
  // -- Northeast (Sumida / Adachi / Katsushika) --
  { name: "両国", romaji: "Ryogoku",           dc:   4, dr:  -3 },   // Ryogoku
  { name: "錦糸町", romaji: "Kinshicho",        dc:   5, dr:  -4 },   // Kinshicho
  { name: "押上", romaji: "Oshiage",           dc:   5, dr:  -6 },   // Oshiage (Skytree)
  { name: "千住", romaji: "Senju",             dc:   3, dr:  -9 },   // Kita-Senju
  { name: "亀有", romaji: "Kameari",           dc:   8, dr:  -8 },   // Kameari
  { name: "金町", romaji: "Kanamachi",         dc:  10, dr:  -9 },   // Kanamachi (edge → Chiba)
  { name: "小岩", romaji: "Koiwa",             dc:   9, dr:  -3 },   // Koiwa (edge → Chiba)
  // -- East (Koto / bay) --
  { name: "深川", romaji: "Fukagawa",          dc:   5, dr:   0 },   // Fukagawa
  { name: "木場", romaji: "Kiba",              dc:   6, dr:   1 },   // Kiba
  { name: "豊洲", romaji: "Toyosu",            dc:   6, dr:   3 },   // Toyosu
  { name: "月島", romaji: "Tsukishima",        dc:   4, dr:   4 },   // Tsukishima
  { name: "お台場", romaji: "Odaiba",           dc:   8, dr:   5 },   // Odaiba (bay)
  { name: "葛西", romaji: "Kasai",             dc:  10, dr:   2 },   // Kasai (edge)
  // -- South (Minato / Shinagawa / Ota → Kanagawa) --
  { name: "浜松町", romaji: "Hamamatsucho",     dc:   1, dr:   4 },   // Hamamatsucho
  { name: "三田", romaji: "Mita",              dc:   0, dr:   4 },   // Mita
  { name: "麻布", romaji: "Azabu",             dc:  -2, dr:   4 },   // Azabu
  { name: "六本木", romaji: "Roppongi",         dc:  -2, dr:   3 },   // Roppongi
  { name: "赤坂", romaji: "Akasaka",           dc:  -2, dr:   1 },   // Akasaka
  { name: "高輪", romaji: "Takanawa",          dc:   1, dr:   6 },   // Takanawa
  { name: "品川", romaji: "Shinagawa",         dc:   2, dr:   8 },   // Shinagawa
  { name: "大井", romaji: "Oi",                dc:   3, dr:  10 },   // Oi
  { name: "大森", romaji: "Omori",             dc:   3, dr:  12 },   // Omori
  { name: "蒲田", romaji: "Kamata",            dc:   2, dr:  14 },   // Kamata (edge → Kawasaki)
  { name: "羽田", romaji: "Haneda",            dc:   5, dr:  15 },   // Haneda (airport)
  { name: "川崎", romaji: "Kawasaki",          dc:   1, dr:  17 },   // Kawasaki (edge → Kanagawa)
  // -- South-southwest (Meguro / Shinagawa west) --
  { name: "五反田", romaji: "Gotanda",          dc:   0, dr:   7 },   // Gotanda
  { name: "目黒", romaji: "Meguro",            dc:  -2, dr:   7 },   // Meguro
  { name: "恵比寿", romaji: "Ebisu",            dc:  -3, dr:   5 },   // Ebisu
  { name: "自由が丘", romaji: "Jiyugaoka",       dc:  -5, dr:  10 },   // Jiyugaoka
  { name: "田園調布", romaji: "Den-en-chofu",    dc:  -7, dr:  12 },   // Den-en-chofu (edge)
  // -- Southwest (Shibuya / Setagaya) --
  { name: "渋谷", romaji: "Shibuya",           dc:  -6, dr:   4 },   // Shibuya
  { name: "原宿", romaji: "Harajuku",          dc:  -5, dr:   2 },   // Harajuku
  { name: "青山", romaji: "Aoyama",            dc:  -3, dr:   2 },   // Aoyama
  { name: "代々木", romaji: "Yoyogi",           dc:  -5, dr:   1 },   // Yoyogi
  { name: "下北沢", romaji: "Shimokitazawa",    dc:  -8, dr:   3 },   // Shimokitazawa
  { name: "三軒茶屋", romaji: "Sangenjaya",      dc:  -9, dr:   5 },   // Sangenjaya
  { name: "世田谷", romaji: "Setagaya",         dc: -10, dr:   4 },   // Setagaya
  { name: "二子玉川", romaji: "Futako-Tamagawa", dc: -13, dr:   8 },   // Futako-Tamagawa (edge)
  // -- West (Shinjuku / Nakano / Suginami) --
  { name: "四ツ谷", romaji: "Yotsuya",          dc:  -3, dr:   0 },   // Yotsuya
  { name: "市ヶ谷", romaji: "Ichigaya",         dc:  -3, dr:  -2 },   // Ichigaya
  { name: "新宿", romaji: "Shinjuku",          dc:  -8, dr:  -1 },   // Shinjuku
  { name: "中野", romaji: "Nakano",            dc: -11, dr:  -1 },   // Nakano
  { name: "高円寺", romaji: "Koenji",           dc: -13, dr:  -1 },   // Koenji
  { name: "阿佐ヶ谷", romaji: "Asagaya",         dc: -15, dr:  -1 },   // Asagaya
  { name: "荻窪", romaji: "Ogikubo",           dc: -17, dr:  -1 },   // Ogikubo
  { name: "吉祥寺", romaji: "Kichijoji",        dc: -20, dr:  -2 },   // Kichijoji (edge → Musashino)
  // -- Northwest (Toshima / Nerima / Itabashi) --
  { name: "神楽坂", romaji: "Kagurazaka",       dc:  -2, dr:  -3 },   // Kagurazaka
  { name: "飯田橋", romaji: "Iidabashi",        dc:  -1, dr:  -3 },   // Iidabashi
  { name: "高田馬場", romaji: "Takadanobaba",    dc:  -6, dr:  -3 },   // Takadanobaba
  { name: "目白", romaji: "Mejiro",            dc:  -5, dr:  -4 },   // Mejiro
  { name: "大塚", romaji: "Otsuka",            dc:  -4, dr:  -5 },   // Otsuka
  { name: "巣鴨", romaji: "Sugamo",            dc:  -3, dr:  -6 },   // Sugamo
  { name: "池袋", romaji: "Ikebukuro",         dc:  -6, dr:  -6 },   // Ikebukuro
  { name: "板橋", romaji: "Itabashi",          dc:  -3, dr: -11 },   // Itabashi (edge)
  { name: "練馬", romaji: "Nerima",            dc:  -9, dr:  -9 },   // Nerima
  { name: "石神井", romaji: "Shakujii",         dc: -13, dr:  -8 },   // Shakujii (edge)
  // -- Outer rim: neighboring prefectures & the Tama plain --
  { name: "武蔵野", romaji: "Musashino",        dc: -22, dr:  -3 },   // Musashino (far west)
  { name: "多摩", romaji: "Tama",              dc: -17, dr:   8 },   // Tama (southwest)
  { name: "横浜", romaji: "Yokohama",          dc:  -1, dr:  21 },   // Yokohama (far south, Kanagawa)
  { name: "東京湾", romaji: "Tokyo-wan",        dc:  13, dr:   8 },   // Tokyo Bay (far southeast)
  { name: "千葉", romaji: "Chiba",             dc:  17, dr:  -1 },   // Chiba (far east)
  { name: "松戸", romaji: "Matsudo",           dc:  13, dr: -13 },   // Matsudo (far northeast, Chiba)
  { name: "埼玉", romaji: "Saitama",           dc:  -1, dr: -19 },   // Saitama (far north)
  { name: "所沢", romaji: "Tokorozawa",        dc: -15, dr: -16 },   // Tokorozawa (far northwest, Saitama)
  // -- Outer rim, densified so peripheral hexes get realistic local names --
  // North (Saitama plain)
  { name: "浦和", romaji: "Urawa",             dc:   1, dr: -17 },   // Urawa
  { name: "川口", romaji: "Kawaguchi",         dc:   2, dr: -16 },   // Kawaguchi
  { name: "蕨", romaji: "Warabi",             dc:  -1, dr: -15 },   // Warabi
  { name: "戸田", romaji: "Toda",              dc:  -3, dr: -15 },   // Toda
  { name: "草加", romaji: "Soka",              dc:   5, dr: -16 },   // Soka
  { name: "越谷", romaji: "Koshigaya",         dc:   6, dr: -18 },   // Koshigaya
  { name: "和光", romaji: "Wako",              dc:  -7, dr: -14 },   // Wako
  { name: "朝霞", romaji: "Asaka",             dc:  -9, dr: -13 },   // Asaka
  // Northeast (Chiba border)
  { name: "三郷", romaji: "Misato",            dc:   9, dr: -13 },   // Misato
  { name: "流山", romaji: "Nagareyama",        dc:  11, dr: -15 },   // Nagareyama
  { name: "柏", romaji: "Kashiwa",            dc:  15, dr: -14 },   // Kashiwa
  { name: "我孫子", romaji: "Abiko",            dc:  16, dr: -10 },   // Abiko
  // East (Chiba lowland)
  { name: "市川", romaji: "Ichikawa",          dc:  11, dr:  -1 },   // Ichikawa
  { name: "船橋", romaji: "Funabashi",         dc:  14, dr:  -3 },   // Funabashi
  { name: "習志野", romaji: "Narashino",        dc:  16, dr:   2 },   // Narashino
  { name: "浦安", romaji: "Urayasu",           dc:  11, dr:   3 },   // Urayasu
  { name: "幕張", romaji: "Makuhari",          dc:  15, dr:   5 },   // Makuhari
  // Bay / reclaimed southeast
  { name: "新木場", romaji: "Shinkiba",         dc:   7, dr:   4 },   // Shinkiba
  { name: "舞浜", romaji: "Maihama",           dc:  12, dr:   4 },   // Maihama
  { name: "有明", romaji: "Ariake",            dc:   7, dr:   6 },   // Ariake
  { name: "青海", romaji: "Aomi",              dc:   6, dr:   8 },   // Aomi
  { name: "若洲", romaji: "Wakasu",            dc:  10, dr:   7 },   // Wakasu
  // South (Kanagawa)
  { name: "鶴見", romaji: "Tsurumi",           dc:  -3, dr:  19 },   // Tsurumi
  { name: "新横浜", romaji: "Shin-Yokohama",    dc:  -5, dr:  20 },   // Shin-Yokohama
  { name: "日吉", romaji: "Hiyoshi",           dc:  -5, dr:  17 },   // Hiyoshi
  { name: "武蔵小杉", romaji: "Musashi-Kosugi",  dc:  -6, dr:  15 },   // Musashi-Kosugi
  // Southwest (Tama river / Kawasaki hills)
  { name: "溝の口", romaji: "Mizonokuchi",      dc: -11, dr:  12 },   // Mizonokuchi
  { name: "登戸", romaji: "Noborito",          dc: -13, dr:  11 },   // Noborito
  { name: "稲城", romaji: "Inagi",             dc: -15, dr:  11 },   // Inagi
  { name: "町田", romaji: "Machida",           dc: -16, dr:  13 },   // Machida
  // West (Tama plain)
  { name: "三鷹", romaji: "Mitaka",            dc: -19, dr:   1 },   // Mitaka
  { name: "調布", romaji: "Chofu",             dc: -17, dr:   4 },   // Chofu
  { name: "府中", romaji: "Fuchu",             dc: -20, dr:   5 },   // Fuchu
  { name: "武蔵境", romaji: "Musashi-Sakai",    dc: -21, dr:  -1 },   // Musashi-Sakai
  { name: "小金井", romaji: "Koganei",          dc: -21, dr:  -4 },   // Koganei
  { name: "国分寺", romaji: "Kokubunji",        dc: -23, dr:  -2 },   // Kokubunji
  { name: "立川", romaji: "Tachikawa",         dc: -24, dr:   2 },   // Tachikawa
  // Northwest (Tama north / Saitama border)
  { name: "田無", romaji: "Tanashi",           dc: -18, dr:  -5 },   // Tanashi
  { name: "ひばりヶ丘", romaji: "Hibarigaoka",   dc: -16, dr:  -8 },   // Hibarigaoka
  { name: "東久留米", romaji: "Higashi-Kurume",  dc: -18, dr: -10 },   // Higashi-Kurume
  { name: "清瀬", romaji: "Kiyose",            dc: -16, dr: -12 },   // Kiyose
  { name: "新座", romaji: "Niiza",             dc: -13, dr: -12 },   // Niiza
  // -- Far corners & edges (keep the big peripheral cells from running away) --
  // North edge (deep Saitama)
  { name: "大宮", romaji: "Omiya",             dc:   0, dr: -22 },   // Omiya
  { name: "上尾", romaji: "Ageo",              dc:  -3, dr: -22 },   // Ageo
  { name: "春日部", romaji: "Kasukabe",         dc:   7, dr: -21 },   // Kasukabe
  // Northwest corner (Iruma / Hanno hills)
  { name: "川越", romaji: "Kawagoe",           dc: -10, dr: -21 },   // Kawagoe
  { name: "ふじみ野", romaji: "Fujimino",       dc:  -8, dr: -18 },   // Fujimino
  { name: "入間", romaji: "Iruma",             dc: -18, dr: -18 },   // Iruma
  { name: "狭山", romaji: "Sayama",            dc: -20, dr: -15 },   // Sayama
  { name: "飯能", romaji: "Hanno",             dc: -22, dr: -19 },   // Hanno
  { name: "日高", romaji: "Hidaka",            dc: -22, dr: -22 },   // Hidaka
  // Northeast corner (deep Chiba / Ibaraki border)
  { name: "野田", romaji: "Noda",              dc:  11, dr: -20 },   // Noda
  { name: "守谷", romaji: "Moriya",            dc:  14, dr: -17 },   // Moriya
  { name: "つくば", romaji: "Tsukuba",          dc:  19, dr: -20 },   // Tsukuba (deep NE corner)
  { name: "柏の葉", romaji: "Kashiwanoha",      dc:  18, dr: -16 },   // Kashiwanoha
  { name: "取手", romaji: "Toride",            dc:  18, dr: -14 },   // Toride
  { name: "鎌ヶ谷", romaji: "Kamagaya",         dc:  16, dr:  -7 },   // Kamagaya
  { name: "印西", romaji: "Inzai",             dc:  19, dr:  -6 },   // Inzai
  // East edge (Chiba coast)
  { name: "千葉みなと", romaji: "Chiba-Minato",  dc:  18, dr:   4 },   // Chiba-Minato
  { name: "蘇我", romaji: "Soga",              dc:  20, dr:   8 },   // Soga
  // Southeast corner (across the bay — Boso coast)
  { name: "海ほたる", romaji: "Umihotaru",      dc:  11, dr:  15 },   // Umihotaru
  { name: "袖ヶ浦", romaji: "Sodegaura",        dc:  18, dr:  15 },   // Sodegaura
  { name: "市原", romaji: "Ichihara",          dc:  20, dr:  11 },   // Ichihara
  { name: "木更津", romaji: "Kisarazu",         dc:  14, dr:  19 },   // Kisarazu
  { name: "君津", romaji: "Kimitsu",           dc:  17, dr:  21 },   // Kimitsu
  { name: "富津", romaji: "Futtsu",            dc:  12, dr:  22 },   // Futtsu
  // South edge (Kawasaki waterfront)
  { name: "大師", romaji: "Daishi",            dc:   4, dr:  18 },   // Kawasaki-Daishi
  { name: "扇島", romaji: "Ogishima",          dc:   7, dr:  16 },   // Ogishima
  // Southwest corner (Kanagawa inland)
  { name: "青葉台", romaji: "Aobadai",          dc: -10, dr:  16 },   // Aobadai
  { name: "長津田", romaji: "Nagatsuta",        dc: -12, dr:  18 },   // Nagatsuta
  { name: "大和", romaji: "Yamato",            dc: -15, dr:  20 },   // Yamato
  { name: "相模原", romaji: "Sagamihara",       dc: -19, dr:  16 },   // Sagamihara
  { name: "海老名", romaji: "Ebina",           dc: -18, dr:  21 },   // Ebina
  { name: "厚木", romaji: "Atsugi",            dc: -22, dr:  22 },   // Atsugi
];

let _tokyoAreaCache = null;
/** District centers resolved to absolute hex indices (cached; CENTER-relative).
 *  k/r expose the bare kanji & romaji so per-hex sub-names can be built. */
function tokyoAreas() {
  if (_tokyoAreaCache) return _tokyoAreaCache;
  const cc = CFG.CENTER;
  _tokyoAreaCache = TOKYO_AREAS.map(a => ({
    k: a.name, r: a.romaji,
    name: a.name + " (" + a.romaji + ")",
    idx: hexIdx(clamp(cc.col + a.dc, 0, CFG.MAP_W - 1), clamp(cc.row + a.dr, 0, CFG.MAP_H - 1)),
  }));
  return _tokyoAreaCache;
}

/** Name of the district a hex belongs to: the nearest area center (Voronoi),
 *  laid out to echo modern Tokyo around the Imperial Palace at CENTER. */
function hexAreaName(idx) {
  const areas = tokyoAreas();
  let best = null, bestD = Infinity;
  for (const a of areas) {
    const d = hexDist(idx, a.idx);
    if (d < bestD) { bestD = d; best = a; }
  }
  return best ? best.name : null;
}

/* ---- Unique per-hex naming -------------------------------------------------
 * Every hex gets its OWN real place name, and no two land hexes on the board
 * ever share one. Names come from TOKYO_MACHI (data/machinames.js): pools of
 * genuine pre-war 町名 (e.g. 木挽町) grouped by old ward/gun. Each ward claims
 * the nearest hexes and hands them distinct machi by proximity, so the dense
 * city reads like a pre-1960 kiriezu with no two cells alike. Hexes the pools
 * can't reach (the sparse periphery, once a ward's pool is spent) take a
 * directional/新-prefixed variant of the nearest ward's names as a last resort
 * (新X → 北X → 南X → 東X → 西X), still globally unique. The palace hex is always
 * 皇居. Purely positional → regenerates identically through save/load.
 */
function machiGroups(campaign) {
  const cc = CFG.CENTER;
  const glob = (name) => (typeof globalThis !== "undefined" && globalThis[name]) ||
                         (typeof window !== "undefined" && window[name]) || null;
  const src = (campaign === "london"
    ? (typeof LONDON_MACHI !== "undefined" && LONDON_MACHI) || glob("LONDON_MACHI")
    : (typeof TOKYO_MACHI !== "undefined" && TOKYO_MACHI) || glob("TOKYO_MACHI")) || [];
  return src.map(g => ({
    idx: hexIdx(clamp(cc.col + g.dc, 0, CFG.MAP_W - 1), clamp(cc.row + g.dr, 0, CFG.MAP_H - 1)),
    // Tokyo pools pair [kanji, romaji] → "kanji (romaji)"; London pools are plain strings.
    pool: g.n.map(n => Array.isArray(n) ? n[0] + " (" + n[1] + ")" : n),
  }));
}
/** Returns a UNIQUE name for every hex (indexed by hex id) — v0.5.
 *  Pass 1 hands out the genuine pool names (deduped globally — a few machi
 *  legitimately existed in more than one ward; first ward keeps the name).
 *  Pass 2 covers whatever the pools can't reach with directional/新-prefixed
 *  variants of the NEAREST ward's names (北X, 南X, …) — the plan's
 *  "last resort only, each prefix at most once per name". */
function assignAreaNames(hexes, campaign) {
  const london = campaign === "london";
  const N = hexes.length;
  const names = new Array(N).fill(null);
  const centerIdx = hexIdx(CFG.CENTER.col, CFG.CENTER.row);
  const used = new Set();
  names[centerIdx] = london ? "Westminster (Parliament)" : "皇居 (Kokyo)";
  used.add(names[centerIdx]);

  const groups = machiGroups(campaign);
  if (groups.length) {
    // global dedupe: a name appears once on the whole board
    for (const g of groups) g.pool = g.pool.filter(nm => !used.has(nm) && (used.add(nm), true));
    const cap = groups.map(g => g.pool.length);
    const members = groups.map(() => []);
    // hexes closest to any ward go first, so central wards fill before they spill
    const order = [];
    for (let i = 0; i < N; i++) {
      if (i === centerIdx) continue;
      let bd = Infinity;
      for (const g of groups) { const d = hexDist(i, g.idx); if (d < bd) bd = d; }
      order.push([bd, i]);
    }
    order.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const overflow = [];
    for (const [, i] of order) {
      let best = -1, bd = Infinity;
      for (let g = 0; g < groups.length; g++) {
        if (cap[g] <= 0) continue;
        const d = hexDist(i, groups[g].idx);
        if (d < bd) { bd = d; best = g; }
      }
      if (best >= 0) { members[best].push(i); cap[best]--; }
      else overflow.push(i);
    }
    // within a ward, the closest hexes take the earliest (most central) machi
    for (let g = 0; g < groups.length; g++) {
      const gi = groups[g].idx, pool = groups[g].pool;
      members[g].sort((p, q) =>
        hexDist(p, gi) - hexDist(q, gi) || hexes[p].col - hexes[q].col || hexes[p].row - hexes[q].row);
      for (let k = 0; k < members[g].length; k++) names[members[g][k]] = pool[k];
    }
    // pass 2 — prefixed variants for the overflow (pools exhausted): the
    // nearest ward's names get a directional prefix; each prefix+name
    // combination is used at most once on the board. Tokyo uses 新/北/南…
    // on the "kanji (romaji)" form; London prefixes the plain English name.
    const PREFIXES = london
      ? [["New "], ["North "], ["South "], ["East "], ["West "],
         ["Upper "], ["Lower "], ["Great "], ["Little "], ["Old "]]   // all genuine London forms
      : [["新", "Shin-"], ["北", "Kita-"], ["南", "Minami-"], ["東", "Higashi-"], ["西", "Nishi-"]];
    for (const i of overflow) {
      let g0 = 0, bd = Infinity;
      for (let g = 0; g < groups.length; g++) {
        const d = hexDist(i, groups[g].idx);
        if (d < bd) { bd = d; g0 = g; }
      }
      outer:
      for (let ring = 0; ring < groups.length && !names[i]; ring++) {
        const g = groups[(g0 + ring) % groups.length];
        for (const nm of g.pool) {
          if (london) {
            for (const [pfx] of PREFIXES) {
              const cand = pfx + nm;
              if (used.has(cand)) continue;
              names[i] = cand; used.add(cand); break outer;
            }
          } else {
            const m = /^(.*) \((.*)\)$/.exec(nm);
            if (!m) continue;
            for (const [kp, rp] of PREFIXES) {
              const cand = kp + m[1] + " (" + rp + m[2] + ")";
              if (used.has(cand)) continue;
              names[i] = cand; used.add(cand); break outer;
            }
          }
        }
      }
    }
  }
  // absolute fallback (empty data file): numbered district names, still unique
  const fallbackBase = london ? "London" : "東京 (Tokyo)";
  for (let i = 0; i < N; i++) {
    if (names[i]) continue;
    let base = (london ? null : hexAreaName(i)) || fallbackBase, cand = base, k = 2;
    while (used.has(cand)) cand = base + " " + (k++);
    names[i] = cand; used.add(cand);
  }
  return names;
}

/* Stubborn private landholders (families, a temple, a shrine grove, an old
 * estate) who own a parcel and never sell, no matter the price. */
const HOLDOUT_NAMES = [
  "田中家 (Tanaka-ke)", "佐藤家 (Sato-ke)", "鈴木家 (Suzuki-ke)",
  "高橋家 (Takahashi-ke)", "渡辺家 (Watanabe-ke)", "伊藤家 (Ito-ke)",
  "山本家 (Yamamoto-ke)", "中村家 (Nakamura-ke)", "小林家 (Kobayashi-ke)",
  "加藤家 (Kato-ke)", "吉田家 (Yoshida-ke)", "山田家 (Yamada-ke)",
  "菩提寺 (Bodaiji)", "鎮守の杜 (Chinju no Mori)", "庄屋屋敷 (Shoya Yashiki)",
];

/* London holdouts (v0.5.1): the great estates, parishes and livery interests
 * that famously would not sell to the railway companies. */
const HOLDOUT_NAMES_LONDON = [
  "the Grosvenor Estate", "the Bedford Estate", "the Portman Estate",
  "the Cadogan Estate", "the Dean & Chapter lands", "the Charterhouse",
  "St Bartholomew's Close", "the Worshipful Company of Drapers",
  "the Ashburnham family", "the Thornhill family", "the Gurney family",
  "the Fairclough family", "the Vestry of St Mary's", "the Rectory Glebe",
  "the Old Burial Ground",
];

/* ---- Map generation ------------------------------------------------------ */

/**
 * Generate the 50×50 hex map: terrain (clustered mountains in the west,
 * rivers flowing through valleys to the eastern bay side, swamp near river
 * mouths, moat ring near the center, canals in the old city), plus initial
 * constructions (dense urban core fading to rice fields).
 */
function generateMap(seed, campaign) {
  campaign = campaign || "tokyo";
  const noise = makeNoise(seed);
  const rng = makeRng(seed ^ 0x9e3779b9);
  const W = CFG.MAP_W, H = CFG.MAP_H;
  const hexes = new Array(W * H);
  const centerIdx = hexIdx(CFG.CENTER.col, CFG.CENTER.row);

  // 1) Elevation: noise + westward ridge bias (mountains cluster west/northwest)
  const elev = new Float32Array(W * H);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const n = noise(c * 0.16, r * 0.16);
      const westBias = clamp((14 - c) / 14, 0, 1) * 0.45 + clamp((10 - r) / 10, 0, 1) * 0.2;
      elev[hexIdx(c, r)] = n * 0.8 + westBias;
    }
  }

  // London (v0.5.3) is a lowland river basin: no mountains (the highest
  // ground caps at rolling hills — Hampstead, not the Chichibu range) and no
  // eastern swamp belt (the only marsh is a thin tidal fringe along the
  // Thames, added after the river is dug).
  const london = campaign === "london";
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const i = hexIdx(c, r);
      const e = elev[i];
      let terrain = "grass";
      if (e > 0.92) terrain = london ? "hill" : "mountain";
      else if (e > 0.72) terrain = "hill";
      else if (!london && e < 0.30 && c > W * 0.6 && noise(c * 0.3 + 7, r * 0.3) > 0.395) terrain = "swamp"; // eastern lowlands (≈2× swamp frequency)
      hexes[i] = {
        col: c, row: r, terrain, cons: null, dev: 0, kaido: null,
        owner: -1, holdout: null, value: 0, track: null, stations: [],
        spiral: -1, name: null, repair: 0, landmark: null,
      };
    }
  }
  // Palace / Parliament grounds (center + immediate ring) stay static grass in
  // every seed — never mountain/hill/swamp, regardless of elevation.
  for (const i of hexesWithin(centerIdx, 1)) hexes[i].terrain = "grass";

  // ---- Road walker (shared by both campaigns) ------------------------------
  // Government highway corridors: the kaidō radiating from Nihonbashi in
  // Tokyo, the historic turnpikes out of the City/Southwark in London
  // (v0.5.1). Fixed hexes for the whole game; per-seed angle jitter + per-step
  // wobble keep seeds distinct. Roads ford rivers, skirt around mountains and
  // open water, and stop at the map edge or coast. Land under them is
  // government-held (owner -3).
  const axialPos = i => {
    const c = i % W, r = (i / W) | 0;
    return { x: c + (r % 2 ? 0.5 : 0), y: r * 0.866 };
  };
  const walkKaido = (route, startIdx, baseAngle) => {
    const K = CFG.KAIDO;
    const ang0 = baseAngle + (rnd(rng) * 2 - 1) * K.angleJitter;
    const path = [];
    let cur = startIdx, guard = 0;
    // branching off an already-roaded hex (Nihonbashi, Senju, Southwark) marks
    // it a junction so the renderer may join the two routes there — ONLY there
    if (hexes[startIdx].kaido) hexes[startIdx].kaido.junction = true;
    while (guard++ < 60) {
      const h = hexes[cur];
      if (!h.kaido) {
        h.kaido = { route, state: "dirt" };
        if (h.owner === -1) h.owner = -3;                // government road land
        path.push(cur);
      }
      const ang = (ang0 + (rnd(rng) * 2 - 1) * K.wobble) * Math.PI / 180;
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      const p = axialPos(cur);
      let next = -1, best = -Infinity;
      for (const nb of neighborsOf(cur)) {
        const hn = hexes[nb];
        if (hn.kaido || hn.terrain === "sea" || hn.terrain === "lake") continue;
        if (hexDist(nb, centerIdx) <= 1) continue;       // never through the palace
        // roads never run alongside another road (their own wobble or a
        // different route): once clear of the junction, a step may only touch
        // the hex it came from, so corridors stay one hex wide and two routes
        // never ladder along each other. The check is waived right at the
        // start hex — a branch (Ōshū off the Nikkō road at Senju) must be
        // allowed to step away from its parent road first.
        if (hexDist(cur, startIdx) > 1 &&
            neighborsOf(nb).some(k => hexes[k].kaido && k !== cur)) continue;
        const q = axialPos(nb);
        const dx = q.x - p.x, dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        let score = (dx * dir.x + dy * dir.y) / len;
        if (hn.terrain === "mountain") score -= 0.9;     // skirt the high country
        else if (hn.terrain === "hill") score -= 0.25;
        if (score > best) { best = score; next = nb; }
      }
      if (next < 0) break;                               // boxed in: corridor ends
      const nc = next % W, nr = (next / W) | 0;
      cur = next;
      if (nc <= 0 || nc >= W - 1 || nr <= 0 || nr >= H - 1) {  // reached the map edge
        const eh = hexes[cur];
        if (!eh.kaido) { eh.kaido = { route, state: "dirt" }; if (eh.owner === -1) eh.owner = -3; path.push(cur); }
        break;
      }
    }
    return path;
  };

  // ---- River walker (shared by both campaigns, v0.5.1) ---------------------
  // Walk one channel from `start`, adding every wetted hex to `own` (the
  // whole river's hex set, shared across rescue digs). scoreOf ranks candidate
  // steps (lower = better). Two hard invariants are enforced per step:
  //   · WIDTH — a step may never close a triangle of mutually-adjacent river
  //     hexes (that is exactly a channel 2 hexes wide);
  //   · DRAINAGE — the walk only returns true when the channel reached open
  //     water (the sea by default, or the custom `doneAt` goal — London's
  //     Thames drains off the east map edge, since London has no sea) or
  //     merged into a DIFFERENT channel (which, inductively, reaches it).
  // A brush against its own earlier course is just an oxbow and the walk
  // continues through it.
  const walkChannel = (start, own, scoreOf, doneAt) => {
    let cur = start, guard = 0;
    while (guard++ < 400) {
      own.add(cur);
      hexes[cur].terrain = "river";
      if (doneAt ? doneAt(cur) : neighborsOf(cur).some(nb => hexes[nb].terrain === "sea")) return true;
      let next = -1, best = Infinity;                    // continue the channel
      let join = -1, joinBest = Infinity;                // merge into another channel
      for (const nb of neighborsOf(cur)) {
        if (hexDist(nb, centerIdx) <= 1) continue;                    // the palace stays dry
        if (hexes[nb].terrain === "river") continue;                  // never re-enter a channel
        // width invariant (also forbids folding back against the previous
        // step: cur and prev are adjacent, so a hex beside both is a triangle)
        const rnbs = neighborsOf(nb).filter(k => hexes[k].terrain === "river");   // includes cur
        let okWidth = true;
        for (let a = 0; a < rnbs.length && okWidth; a++) {
          for (let b = a + 1; b < rnbs.length; b++) {
            if (neighborsOf(rnbs[a]).includes(rnbs[b])) { okWidth = false; break; }
          }
        }
        if (!okWidth) continue;
        const s = scoreOf(nb);
        if (rnbs.some(k => k !== cur && !own.has(k))) {  // beside a FOREIGN channel: a confluence
          if (s < joinBest) { joinBest = s; join = nb; }
        } else if (s < best) { best = s; next = nb; }
      }
      // rivers merge when they meet: take the confluence unless continuing
      // scores strictly better (the other channel is already sea-bound)
      if (join >= 0 && (next < 0 || joinBest <= best)) {
        hexes[join].terrain = "river";
        return true;
      }
      if (next >= 0) { cur = next; continue; }
      return false;                                      // boxed in (often by its own coils)
    }
    return false;
  };

  if (campaign === "london") {
    // ---- London (Phase 11, reshaped v0.5.3): the Thames west→east across
    //      the whole map; no sea at all (London is far inland — the estuary
    //      is beyond the map edge), no Tokyo bay, no radial rivers.
    //      Westminster sits on the north bank (the centre stays dry). The
    //      river is WALKED west→east with the shared width-safe channel
    //      walker, succeeding when it reaches the EAST MAP EDGE (its custom
    //      drainage goal) — so the Thames is hex-connected end to end and
    //      never widens past one hex.
    const bandLo = CFG.CENTER.row + 1, bandHi = CFG.CENTER.row + 5;
    const rowPath = {};                                 // target row per column (guides the walk)
    let tr = CFG.CENTER.row + 2;
    for (let c = 0; c < W; c++) {
      tr = clamp(tr + rndInt(rng, -1, 1), bandLo, bandHi);
      // near Westminster the river keeps two rows clear of the centre hex
      if (Math.abs(c - CFG.CENTER.col) <= 2) tr = Math.max(tr, CFG.CENTER.row + 2);
      rowPath[c] = tr;
    }
    // the Thames: hard-eastward drive, hugging the target row band; done when
    // it touches the east edge (col W-1) — the map's only drainage
    walkChannel(hexIdx(0, rowPath[0]), new Set(), nb => {
      const nc = nb % W, nr = (nb / W) | 0;
      return -nc * 10 + Math.abs(nr - rowPath[nc]) * 6 + rnd(rng);
    }, cur => cur % W === W - 1);
    // a thin tidal marsh fringe downstream (Isle of Dogs, Plumstead levels) —
    // deliberately FAR sparser than Tokyo's delta swamps
    for (let i = 0; i < hexes.length; i++) {
      if (hexes[i].terrain !== "grass") continue;
      const c = i % W;
      if (c < W * 0.55) continue;
      if (neighborsOf(i).some(nb => hexes[nb].terrain === "river") &&
          rnd(rng) < 0.10) hexes[i].terrain = "swamp";
    }
    // ---- London roads (v0.5.1): the historic turnpikes, same corridor
    //      mechanics as the Tokyo kaidō. The three north-bank roads radiate
    //      from the City (roads out of London are Roman — they leave from the
    //      old walled city, not Westminster); the Dover and Portsmouth roads
    //      branch from Southwark on the south bank, the far side of London
    //      Bridge, so no road has to ford the Thames.
    const cityIdx = hexIdx(clamp(CFG.CENTER.col + 3, 1, W - 2), clamp(CFG.CENTER.row - 1, 1, H - 2));
    walkKaido("gnr", cityIdx, CFG.KAIDO.ROUTES.gnr.angle);
    walkKaido("watling", cityIdx, CFG.KAIDO.ROUTES.watling.angle);
    walkKaido("bath", cityIdx, CFG.KAIDO.ROUTES.bath.angle);
    // Southwark: the first dry hex south of the river at the bridge column.
    // The river hexes crossed on the way down ARE London Bridge (v0.5.3) —
    // the fixed crossing that ties the north-bank roads (out of the City) to
    // the south-bank Dover/Portsmouth roads. Marked as a cosmetic landmark;
    // the renderer draws the stone arches across the water.
    let southwark = -1;
    {
      const c = clamp(CFG.CENTER.col + 2, 1, W - 2);
      let pastRiver = false;
      for (let r = CFG.CENTER.row + 1; r < H - 1; r++) {
        const i = hexIdx(c, r), t = hexes[i].terrain;
        if (t === "river" || t === "sea") { pastRiver = true; hexes[i].landmark = "london_bridge"; continue; }
        if (pastRiver) { southwark = hexIdx(c, r); break; }
      }
      if (southwark < 0) southwark = hexIdx(c, clamp(CFG.CENTER.row + 6, 1, H - 2));
    }
    if (southwark >= 0) {
      walkKaido("dover", southwark, CFG.KAIDO.ROUTES.dover.angle);
      walkKaido("portsmouth", southwark, CFG.KAIDO.ROUTES.portsmouth.angle);
    }
    // Tower Bridge (v0.5.3): the great bascule bridge on the river beside the
    // Parliament area — the Thames hex nearest Westminster that isn't already
    // London Bridge gets the twin-tower sprite.
    {
      let best = -1, bd = Infinity;
      for (let i = 0; i < hexes.length; i++) {
        if (hexes[i].terrain !== "river" || hexes[i].landmark) continue;
        const d = hexDist(i, centerIdx);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) hexes[best].landmark = "tower_bridge";
    }
  } else {

  // 2) Tokyo Bay (v0.5): open SEA in the southeast. An elevation-biased blob
  //    around a jittered bay heart — the heart is always sea, so every seed
  //    has a bay; the coastline follows the lowlands. The old city (within 8
  //    of the palace) never floods.
  const bayC = hexIdx(clamp(CFG.CENTER.col + 14 + rndInt(rng, -2, 2), 0, W - 1),
                      clamp(CFG.CENTER.row + 9 + rndInt(rng, -2, 2), 0, H - 1));
  for (let i = 0; i < hexes.length; i++) {
    if (hexDist(i, centerIdx) <= 8) continue;
    const d = hexDist(i, bayC);
    if (d <= 4 || (d <= 10 && elev[i] < 0.55 - 0.035 * d)) hexes[i].terrain = "sea";
  }
  // 2b) v0.5.1 invariant: the sea is OPEN sea — it must reach the map edge on
  //     at least one hex. If the bay blob came out landlocked, open a strait
  //     from the bay heart to the nearest edge through the lowest ground.
  const edgeDist = i => { const c = i % W, r = (i / W) | 0; return Math.min(c, W - 1 - c, r, H - 1 - r); };
  if (!hexes.some((h, i) => h.terrain === "sea" && edgeDist(i) === 0)) {
    let cur = bayC, guard = 0;
    while (edgeDist(cur) > 0 && guard++ < 100) {
      let next = -1, best = Infinity;
      for (const nb of neighborsOf(cur)) {
        if (hexDist(nb, centerIdx) <= 8) continue;      // never flood the old city
        const s = edgeDist(nb) * 10 + elev[nb];         // straight out, favouring low ground
        if (s < best) { best = s; next = nb; }
      }
      if (next < 0) break;
      cur = next;
      hexes[cur].terrain = "sea";
      for (const nb of neighborsOf(cur)) {              // a strait, not a thread
        if (hexDist(nb, centerIdx) > 8 && elev[nb] < 0.72) hexes[nb].terrain = "sea";
      }
    }
  }

  // 3) Rivers (v0.5.1 invariants): source high in the west (mountain
  //    country), walked downhill with a slight bayward pull by the shared
  //    width-safe channel walker. Every river ends in open water — it reaches
  //    the sea or JOINS an earlier river that does (a confluence) — and no
  //    channel is ever more than one hex wide. Palace ring stays dry; gorges
  //    still cut through mountains.
  const riverOk = i => hexDist(i, centerIdx) > 1 &&
    hexes[i].terrain !== "sea" && hexes[i].terrain !== "river" &&
    !neighborsOf(i).some(nb => hexes[nb].terrain === "river");   // a source never spawns against a channel
  const riverCount = 3 + rndInt(rng, 0, 1);
  for (let n = 0; n < riverCount; n++) {
    // pick a high source in the western half
    let best = -1, bestE = -1;
    for (let t = 0; t < 60; t++) {
      const c = rndInt(rng, 2, (W / 2) | 0), r = rndInt(rng, 2, H - 3);
      const i = hexIdx(c, r);
      if (!riverOk(i)) continue;
      if (elev[i] > bestE) { bestE = elev[i]; best = i; }
    }
    if (best < 0) continue;
    const own = new Set();
    let ok = walkChannel(best, own, nb => elev[nb] + hexDist(nb, bayC) * 0.006 + rnd(rng) * 0.05);
    // A meandering channel can coil up and box itself in. Rescue: restart the
    // dig from the channel hex CLOSEST to the bay (its outer face is open in
    // that direction) and head straight for the water; a few retries walk the
    // rescue point back up the channel if even that tip is blocked.
    const tried = new Set();
    for (let t = 0; !ok && t < 12; t++) {
      let from = -1, bd = Infinity;
      for (const i of own) {
        if (tried.has(i)) continue;
        const d = hexDist(i, bayC);
        if (d < bd) { bd = d; from = i; }
      }
      if (from < 0) break;
      tried.add(from);
      ok = walkChannel(from, own, nb => hexDist(nb, bayC));
    }
    // a channel that STILL couldn't reach open water dries back up — the
    // sea-connection invariant is absolute
    if (!ok) for (const i of own) hexes[i].terrain = "grass";
  }
  // safety net: a channel that STILL couldn't reach open water (boxed in by
  // the palace ring, other channels and the map edge at once — vanishingly
  // rare) is reverted to dry land rather than left as an orphan river
  {
    const seen = new Set();
    for (let i = 0; i < hexes.length; i++) {
      if (hexes[i].terrain !== "river" || seen.has(i)) continue;
      const comp = [i]; seen.add(i);
      let wet = false;
      for (let q = 0; q < comp.length; q++) {
        for (const nb of neighborsOf(comp[q])) {
          if (hexes[nb].terrain === "sea") wet = true;
          if (hexes[nb].terrain === "river" && !seen.has(nb)) { seen.add(nb); comp.push(nb); }
        }
      }
      if (!wet) for (const j of comp) hexes[j].terrain = "grass";
    }
  }

  // 3b) Lakes: 0–2 in inland basins, well away from the bay and the old city.
  const lakeCount = rndInt(rng, 0, 2);
  for (let n = 0; n < lakeCount; n++) {
    for (let t = 0; t < 40; t++) {
      const i = hexIdx(rndInt(rng, 3, (W * 0.6) | 0), rndInt(rng, 3, H - 4));
      if (hexes[i].terrain !== "grass" || elev[i] > 0.55) continue;
      if (hexDist(i, bayC) < 16 || hexDist(i, centerIdx) < 7) continue;
      hexes[i].terrain = "lake";
      for (const nb of hexesWithin(i, 1)) {
        if (hexes[nb].terrain === "grass" && hexDist(nb, centerIdx) > 6 && rnd(rng) < 0.65)
          hexes[nb].terrain = "lake";
      }
      break;
    }
  }

  // 3c) Coastal & lakeshore marsh: low ground touching open water tends to swamp
  //     (river-mouth marshes come free — the eastern-lowland swamp belt above).
  for (let i = 0; i < hexes.length; i++) {
    if (hexes[i].terrain !== "grass" || elev[i] > 0.5) continue;
    if (hexDist(i, centerIdx) <= 2) continue;
    if (neighborsOf(i).some(nb => hexes[nb].terrain === "sea" || hexes[nb].terrain === "lake") &&
        rnd(rng) < 0.3) hexes[i].terrain = "swamp";
  }

  // 3) Moat: partial ring at radius 2 around the center (castle moat).
  for (const i of hexesWithin(centerIdx, 2)) {
    if (hexDist(i, centerIdx) === 2 && rnd(rng) < 0.7 && hexes[i].terrain === "grass") {
      hexes[i].terrain = "moat";
    }
  }
  // 4) Canals: short segments near center, east side (old merchant city).
  for (let n = 0; n < 5; n++) {
    let i = hexIdx(CFG.CENTER.col + rndInt(rng, 1, 8), CFG.CENTER.row + rndInt(rng, -6, 6));
    for (let s = 0; s < rndInt(rng, 2, 5); s++) {
      if (hexes[i] && hexes[i].terrain === "grass" && hexDist(i, centerIdx) > 1) hexes[i].terrain = "canal";
      const nb = neighborsOf(i); if (!nb.length) break;
      i = rndPick(rng, nb);
    }
  }

  // 4b) Kaidō corridors (v0.5): four named government highways radiating from
  //     Nihonbashi (just east of the palace ring), laid by the shared road
  //     walker above. The Ōshū Kaidō historically split from the Nikkō road
  //     at Senju, so it starts a few hexes up the Nikkō path rather than at
  //     Nihonbashi.
  // Nihonbashi: two hexes east of the palace center (outside the moat ring)
  const nihonbashi = hexIdx(clamp(CFG.CENTER.col + 2, 0, W - 1), CFG.CENTER.row);
  walkKaido("tokaido", nihonbashi, CFG.KAIDO.ROUTES.tokaido.angle);
  walkKaido("koshu", nihonbashi, CFG.KAIDO.ROUTES.koshu.angle);
  const nikkoPath = walkKaido("nikko", nihonbashi, CFG.KAIDO.ROUTES.nikko.angle);
  const senju = nikkoPath[Math.min(5, Math.max(0, nikkoPath.length - 1))] ?? nihonbashi;
  walkKaido("oshu", senju, CFG.KAIDO.ROUTES.oshu.angle);
  }  // end Tokyo-only water & kaidō

  // 5) Initial constructions: dense core, satellite towns, rice in plains.
  const towns = [centerIdx];
  // Anchor a village cluster toward every edge and corner so settlements dot
  // the whole map — not just the center. Fractional map positions, jittered
  // and clamped; terrain still decides how much actually develops (the
  // mountainous northwest naturally stays sparser).
  const anchorFracs = [
    [0.50, 0.10], [0.50, 0.90], [0.10, 0.50], [0.90, 0.50],   // N, S, W, E edges
    [0.16, 0.16], [0.84, 0.16], [0.16, 0.84], [0.84, 0.84],   // NW, NE, SW, SE corners
  ];
  // v0.5: towns never anchor on water — an anchor that lands in the bay, a
  // lake or a river is walked (BFS) to the nearest dry buildable hex.
  const nearestDryLand = (start) => {
    const wet = t => t === "sea" || t === "lake" || t === "river" || t === "moat" || t === "canal";
    if (!wet(hexes[start].terrain)) return start;
    const seen = new Set([start]);
    let frontier = [start];
    for (let depth = 0; depth < 25 && frontier.length; depth++) {
      const next = [];
      for (const cur of frontier) for (const nb of neighborsOf(cur)) {
        if (seen.has(nb)) continue;
        if (!wet(hexes[nb].terrain)) return nb;
        seen.add(nb); next.push(nb);
      }
      frontier = next;
    }
    return start;
  };
  for (const [fx, fy] of anchorFracs) {
    const c = clamp(Math.round(fx * (W - 1) + rndInt(rng, -3, 3)), 2, W - 3);
    const r = clamp(Math.round(fy * (H - 1) + rndInt(rng, -3, 3)), 2, H - 3);
    towns.push(nearestDryLand(hexIdx(c, r)));
  }
  // Plus random inner satellites for organic variety.
  for (let n = 0; n < 7; n++) {
    const ang = rnd(rng) * Math.PI * 2, d = rndInt(rng, 8, 19);
    const c = clamp(Math.round(CFG.CENTER.col + Math.cos(ang) * d), 2, W - 3);
    const r = clamp(Math.round(CFG.CENTER.row + Math.sin(ang) * d * 0.9), 2, H - 3);
    towns.push(nearestDryLand(hexIdx(c, r)));
  }
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const i = hexIdx(c, r), h = hexes[i];
      if (h.terrain !== "grass" && h.terrain !== "hill") continue;
      if (h.kaido) continue;                    // the road itself stays clear
      let urban = 0;
      for (let t = 0; t < towns.length; t++) {
        const d = hexDist(i, towns[t]);
        const w = t === 0 ? 7.5 : 3.8;          // center town much bigger
        urban = Math.max(urban, Math.exp(-d / w));
      }
      // roadside pull: post-town strips grow along the kaidō (small but real)
      if (neighborsOf(i).some(nb => hexes[nb].kaido)) urban = Math.max(urban, 0.28);
      const roll = rnd(rng);
      if (urban > 0.45 && roll < urban * 1.25) {
        h.cons = roll < 0.16 ? "shop" : roll < 0.22 ? "school" : roll < 0.26 ? "civic" : "house";
        h.dev = urban > 0.85 ? 3 : urban > 0.6 ? 2 : 1;
      } else if (urban > 0.25 && roll < urban * 1.1) {
        h.cons = roll < 0.12 ? "shop" : "house"; h.dev = 1;
      } else if (h.terrain === "grass" && roll < 0.55) {
        h.cons = "rice"; h.dev = 1;
      }
    }
  }
  // (v0.5: the old 5 random road spokes are gone — the named kaidō corridors
  //  above are the highways now; "road" stays in CONS only as a legacy key.)

  // 5b) Private holdouts: a scattering of homes/shops held by stubborn
  //     individuals who never sell at any price (owner = -2). They cannot be
  //     bought, so they block land acquisition and force track to detour.
  //     Kept clear of the immediate center so the opening isn't walled in.
  for (let i = 0; i < hexes.length; i++) {
    const h = hexes[i];
    if (h.cons !== "house" && h.cons !== "apartment" && h.cons !== "shop") continue;
    if (hexDist(i, centerIdx) <= 3) continue;
    if (rnd(rng) < CFG.LAND.holdoutFrac) {
      h.owner = -2;
      h.holdout = rndPick(rng, campaign === "london" ? HOLDOUT_NAMES_LONDON : HOLDOUT_NAMES);
    }
  }

  // 5c) London royal land (Phase 11, re-titled v0.5.3): the Crown parcels
  //     that never come up for sale — reuses the palace/holdout mechanic
  //     (owner = -2), held by the House of Windsor / the Crown Estate. The
  //     centre is Parliament (its own sprite); Buckingham Palace (castle
  //     sprite) and its royal parks sit a few hexes west; the Tower of London
  //     (castle sprite) guards the river east of the City. Kept clear of any
  //     construction so they read as open ground under the landmark art.
  if (campaign === "london") {
    const buckingham = hexIdx(clamp(CFG.CENTER.col - 3, 0, W - 1), CFG.CENTER.row);
    // Tower of London: the first dry north-bank hex a few columns east of the
    // City, scanned upward from the river so it sits right on the waterfront
    let towerOfLondon = -1;
    {
      const c = clamp(CFG.CENTER.col + 5, 1, W - 2);
      for (let r = CFG.CENTER.row + 4; r >= 1; r--) {
        const t = hexes[hexIdx(c, r)].terrain;
        if (t === "river" || t === "sea") { towerOfLondon = hexIdx(c, r - 1); break; }
      }
      if (towerOfLondon < 0 || CFG.TERRAIN[hexes[towerOfLondon].terrain].water) {
        towerOfLondon = hexIdx(c, clamp(CFG.CENTER.row + 1, 1, H - 2));
      }
    }
    const publics = [
      [centerIdx, "The Crown (Palace of Westminster)", "parliament"],
      [buckingham, "House of Windsor (Buckingham Palace)", "castle"],
      [towerOfLondon, "The Crown (Tower of London)", "castle"],
    ];
    for (const [i, label, mark] of publics) {
      const h = hexes[i];
      h.terrain = "grass"; h.cons = null; h.dev = 0; h.track = null;
      h.kaido = null;                        // no turnpike through the palace forecourt
      h.owner = -2; h.holdout = label; h.landmark = mark;
    }
    // royal parks: the ring around Buckingham stays open grass (St James's/Green Park)
    for (const i of hexesWithin(buckingham, 1)) {
      if (hexes[i].terrain === "sea" || hexes[i].terrain === "river") continue;
      hexes[i].terrain = "grass"; hexes[i].cons = null; hexes[i].dev = 0;
    }
  } else {
    // Tokyo (v0.5.3): the Kokyo itself gets the Imperial Palace sprite —
    // stone ramparts and the green-roofed palace over the static center hex.
    hexes[centerIdx].landmark = "imperial_palace";
  }

  // 6) Spiral indices + names. Each hex gets its own real place name
  //    (assignAreaNames — Shōwa-era 町名 for Tokyo, Victorian districts for
  //    London); an optional window.HEX_NAMES table can override by spiral index.
  const spiral = computeSpiralIndices();
  const override = (typeof window !== "undefined" && window.HEX_NAMES) || {};
  const autoNames = assignAreaNames(hexes, campaign);
  for (let i = 0; i < hexes.length; i++) {
    hexes[i].spiral = spiral[i];
    hexes[i].name = override[spiral[i]] || autoNames[i];
  }
  return hexes;
}

/** Population a hex contributes (residents). */
function hexPop(h) {
  if (!h.cons || h.track) return 0;            // rail hexes generate nothing themselves
  return (CFG.CONS[h.cons].pop || 0) * Math.max(1, h.dev);
}
/** Attraction (jobs/shops/schools) a hex contributes. */
function hexAtt(h) {
  if (!h.cons || h.track) return 0;
  return (CFG.CONS[h.cons].att || 0) * Math.max(1, h.dev);
}
