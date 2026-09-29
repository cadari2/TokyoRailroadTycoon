/* =========================================================================
 * art.js — Hand-drawn pixel icon set + title-screen art.
 *
 * Icons are authored as 16×16 character grids (one letter per pixel, mapped
 * through PAL) and rasterised once to data-URL PNGs; installIconStyles()
 * injects one CSS rule per icon (.ico-<name>) so the DOM just uses
 * <i class="ico ico-track"></i>. No image files, no network, works from
 * file://. Also draws the start-screen "box art" banner on a canvas.
 * ========================================================================= */
"use strict";

const PAL = {
  ".": null,
  k: "#241c10",  // ink outline
  w: "#fff8e8",  // white
  l: "#cfd3d6",  // light grey
  s: "#8c949c",  // steel
  S: "#4e565e",  // dark steel
  r: "#d0432c",  // red
  R: "#8a2a1c",  // dark red
  g: "#5aa84a",  // green
  G: "#2d6a30",  // dark green
  b: "#3d84cc",  // blue
  B: "#23507e",  // dark blue
  c: "#7ad4e0",  // cyan / glass
  y: "#f4d24a",  // yellow
  Y: "#d9a53a",  // brass
  o: "#e07a2c",  // orange
  n: "#a06a34",  // brown
  N: "#5c3a18",  // dark brown
  t: "#dcc890",  // tan / paper
  T: "#b09a5c",  // dark tan
  p: "#c0508e",  // magenta
};

/* Each icon: 16 rows × 16 columns. Shorter rows are right-padded, fewer rows
 * are vertically centred, so small glyphs can be authored compactly. */
const ICON_GRIDS = {
  loco: [
    "......kkk.......",
    "......ksk.......",
    ".kkkk.ksk.......",
    ".kyykkkkkkkkkk..",
    ".kyykSSSSSSSSk..",
    ".kkkkSSSSSSSSk..",
    ".kRRkSSSSSSSSk..",
    ".kRRkSSSSkSSSk..",
    ".kRRkSSSSkSSSkk.",
    ".kRRkkkkkkkkkkyk",
    ".kRRRRRRRRRRRRkk",
    ".kkkkkkkkkkkkkk.",
    "..kSSk.kSSk.kSk.",
    ".kSwwSkSwwSkSwSk",
    ".kSwwSkSwwSkSwSk",
    "..kkkk.kkkk.kkk.",
  ],
  pause: [
    "................",
    "...kkkk..kkkk...",
    "..kwwwwkkwwwwk..",
    "..kwllwkkwllwk..",
    "..kwllwkkwllwk..",
    "..kwllwkkwllwk..",
    "..kwllwkkwllwk..",
    "..kwllwkkwllwk..",
    "..kwllwkkwllwk..",
    "..kwllwkkwllwk..",
    "..kwllwkkwllwk..",
    "..kwllwkkwllwk..",
    "..kwllwkkwllwk..",
    "..kwwwwkkwwwwk..",
    "...kkkk..kkkk...",
    "................",
  ],
  play: [
    "................",
    "....kk..........",
    "....kgkk........",
    "....kgggkk......",
    "....kggGGgkk....",
    "....kggGGGGgkk..",
    "....kggGGGGGGgk.",
    "....kggGGGGGGGgk",
    "....kggGGGGGGgk.",
    "....kggGGGGgkk..",
    "....kggGGgkk....",
    "....kgggkk......",
    "....kgkk........",
    "....kk..........",
    "................",
    "................",
  ],
  clock: [
    "................",
    ".....kkkkkk.....",
    "...kkwwwwwwkk...",
    "..kwwwwkwwwwwk..",
    ".kwwwwwkwwwwwwk.",
    ".kwwwwwkwwwwwwk.",
    "kwkwwwwkwwwwwkwk",
    "kwwwwwwkkkkwwwwk",
    "kwwwwwwwwwwwwwwk",
    "kwkwwwwwwwwwwkwk",
    ".kwwwwwwwwwwwwk.",
    ".kwwwwwwwwwwwwk.",
    "..kwwwwkwwwwwk..",
    "...kkwwwwwwkk...",
    ".....kkkkkk.....",
    "................",
  ],
  demand: [
    "................",
    ".......kk.......",
    "......kyyk......",
    ".....kyoyyk.....",
    ".....kyooyk.....",
    "....kyooooyk....",
    "....kyoorooyk...",
    "...kyoorrrooyk..",
    "...kyorrrrroyk..",
    "..kyoorrrrrooyk.",
    "..kyoorrrrrooyk.",
    "..kyooorrrooyk..",
    "...kyoooooooyk..",
    "....kyyoooyyk...",
    ".....kkkkkkk....",
    "................",
  ],
  owners: [
    "................",
    "kkkkkkkkkkkkkkkk",
    "kttttttkggggggtk",
    "kttttttkggggggtk",
    "ktrrrrtkggggggtk",
    "ktrrrrtkkkkkkkkk",
    "ktrrrrtkbbbbtttk",
    "kttttttkbbbbtttk",
    "kkkkkkkkbbbbtttk",
    "kyyyyyykbbbbtttk",
    "kyyyyyykkkkkkkkk",
    "kyyyyyyktttttttk",
    "kyyyyyyktttttttk",
    "kyyyyyyktttttttk",
    "kkkkkkkkkkkkkkkk",
    "................",
  ],
  audio: [
    "................",
    "........k.......",
    ".......kk...k...",
    "......kwk..kwk..",
    ".....kwwk.kwk.k.",
    "kkkkkkwwk.kwk.kk",
    "kllllwwwk.kwkkwk",
    "kllllwwwkkkwkkwk",
    "kllllwwwkkkwkkwk",
    "kllllwwwk.kwkkwk",
    "kkkkkkwwk.kwk.kk",
    ".....kwwk.kwk.k.",
    "......kwk..kwk..",
    ".......kk...k...",
    "........k.......",
    "................",
  ],
  mute: [
    "................",
    "........k.......",
    ".......kk.......",
    "......kwk.......",
    ".....kwwk.kk..kk",
    "kkkkkkwwk.krkkrk",
    "kllllwwwk..krrk.",
    "kllllwwwk...rr..",
    "kllllwwwk...rr..",
    "kllllwwwk..krrk.",
    "kkkkkkwwk.krkkrk",
    ".....kwwk.kk..kk",
    "......kwk.......",
    ".......kk.......",
    "........k.......",
    "................",
  ],
  menu: [
    "................",
    "kkkkkkkkkkkkkkkk",
    "kGGGGGGGGGGGGkwk",
    "kGGGGGGGGGGGGkkk",
    "kkkkkkkkkkkkkkkk",
    "ktttttttttttttk.",
    "ktkkkkkkkkkkttk.",
    "ktttttttttttttk.",
    "ktkkkkkkkkkkttk.",
    "ktttttttttttttk.",
    "ktkkkkkkkkkkttk.",
    "ktttttttttttttk.",
    "ktkkkkkkkkkkttk.",
    "ktttttttttttttk.",
    "kkkkkkkkkkkkkkk.",
    "................",
  ],
  close: [
    "................",
    "................",
    "...kk......kk...",
    "..kwwk....kwwk..",
    "..kwwwk..kwwwk..",
    "...kwwwkkwwwk...",
    "....kwwwwwwk....",
    ".....kwwwwk.....",
    ".....kwwwwk.....",
    "....kwwwwwwk....",
    "...kwwwkkwwwk...",
    "..kwwwk..kwwwk..",
    "..kwwk....kwwk..",
    "...kk......kk...",
    "................",
    "................",
  ],
  // ---- side-window tabs ----
  build: [
    "................",
    "......kkkkkk....",
    ".....kSSSSSSk...",
    "....kSllllSSSk..",
    "....kSllllSSSk..",
    "....kSSSSSSSSk..",
    ".....kkkkkkNk...",
    "..........kNNk..",
    ".........kNnNk..",
    "........kNnNk...",
    ".......kNnNk....",
    "......kNnNk.....",
    ".....kNnNk......",
    "....kNNNk.......",
    "....kkkk........",
    "................",
  ],
  lines: [
    "................",
    "....kkkkkkkk....",
    "...kSSSSSSSSk...",
    "..kSSSSSSSSSSk..",
    "..kSkkkkkkkkSk..",
    "..kSkccccccckSk.",
    "..kSkccccccckSk.",
    "..kSkkkkkkkkkSk.",
    "..kSSSSSSSSSSSk.",
    "..kSkkkSSSSkkkSk",
    "..kSkykSSSSkykSk",
    "..kSkkkSSSSkkkSk",
    "..kkkkkkkkkkkkk.",
    "...kSk.....kSk..",
    "...kkk.....kkk..",
    "................",
  ],
  money: [
    "................",
    ".....kkkkkk.....",
    "...kkyyyyyykk...",
    "..kyyYYYYYYyyk..",
    ".kyYYkkkkkkYYyk.",
    ".kyYkyyyyyykYyk.",
    ".kyYkyyYYyykYyk.",
    ".kyYkyyYYyykYyk.",
    ".kyYkyyYYyykYyk.",
    ".kyYkyyYYyykYyk.",
    ".kyYkyyyyyykYyk.",
    ".kyYYkkkkkkYYyk.",
    "..kyyYYYYYYyyk..",
    "...kkyyyyyykk...",
    ".....kkkkkk.....",
    "................",
  ],
  company: [
    "................",
    "......kk........",
    "......krrrk.....",
    "......krrrk.....",
    "......kk........",
    "...kkkkkkkkkk...",
    "..kttttttttttk..",
    "..ktkkttkkttkk..",
    "..ktcktckktctk..",
    "..ktkkttkkttkk..",
    "..ktcktckktctk..",
    "..ktkkttkkttkk..",
    "..ktcktcktkkttk.",
    "..kttttttkNNttk.",
    "..kkkkkkkkkkkkk.",
    "................",
  ],
  system: [
    "................",
    "......kkkk......",
    "...kk.kssk.kk...",
    "..kssk kssk kssk",
    "..kssskkkkkkssk.",
    "...ksssssssssk..",
    "..kkssskkksssk..",
    ".ksssskllksssskk",
    ".ksssskllksssssk",
    "..kkssskkksssk..",
    "...ksssssssssk..",
    "..kssskkkkkkssk.",
    "..kssk.kssk.kssk",
    "...kk..kssk.kk..",
    ".......kkkk.....",
    "................",
  ],
  // ---- build modes ----
  inspect: [
    "................",
    "....kkkkk.......",
    "..kkwwwwwkk.....",
    ".kwwwcccwwwk....",
    ".kwcccccccwk....",
    "kwwccccccccwwk..",
    "kwcccccccccccwk.",
    "kwcccccccccccwk.",
    "kwcccccccccccwk.",
    ".kwcccccccccwk..",
    ".kwwcccccccwwk..",
    "..kkwwwwwwwkkNk.",
    "....kkkkkk..kNNk",
    ".............kNNk",
    "..............kNk",
    "...............k",
  ],
  buyland: [
    "................",
    "..kkkkkkkkkkk...",
    ".kttttttttttk...",
    ".kttyyyyyytttk..",
    ".ktyykkkkkyytk..",
    ".ktykyyyyykytk..",
    ".ktykykkkkkytk..",
    ".ktykyyyyyyytk..",
    ".ktykyykkkkytk..",
    ".ktykyyyyykytk..",
    ".ktyykkkkkyytk..",
    ".kttyyyyyytttk..",
    ".ktttttttttttk..",
    ".kkkkkkkkkkkkk..",
    "..kNNNNNNNNNk...",
    "...kkkkkkkkk....",
  ],
  track: [
    "................",
    "kkkkkkkkkkkkkkkk",
    "kssssssssssssssk",
    "kkkkkkkkkkkkkkkk",
    "..kNNk..kNNk..kN",
    "..kNNk..kNNk..kN",
    "..kNNk..kNNk..kN",
    "kkkkkkkkkkkkkkkk",
    "kssssssssssssssk",
    "kkkkkkkkkkkkkkkk",
    "..kNNk..kNNk..kN",
    "..kNNk..kNNk..kN",
    "..kNNk..kNNk..kN",
    "..kkkk..kkkk..kk",
    "................",
    "................",
  ],
  station: [
    "................",
    ".......kk.......",
    "......kwwk......",
    "......kwkk......",
    "......kwwk......",
    "..kkkkkkkkkkkk..",
    ".kRRRRRRRRRRRRk.",
    "kRRRRRRRRRRRRRRk",
    "kkkkkkkkkkkkkkkk",
    "kttttttttttttttk",
    "ktkkttkNNkttkktk",
    "ktcctkkNNkktcctk",
    "ktkktttNNtttkktk",
    "kttttttNNttttttk",
    "kkkkkkkkkkkkkkkk",
    "ssssssssssssssss",
  ],
  depot: [
    "................",
    "....kkkkkkkk....",
    "..kkSSSSSSSSkk..",
    ".kSSSSSSSSSSSSk.",
    "kSSSSSSSSSSSSSSk",
    "kkkkkkkkkkkkkkkk",
    "kttttkkkkkkttttk",
    "kttttkbbbbkttttk",
    "kttttkbkkbkttttk",
    "kttttkbccbkttttk",
    "kttttkbbbbkttttk",
    "kttttkkkkkkttttk",
    "kttttkSSSSkttttk",
    "kttttkkkkkkttttk",
    "kkkkkkkkkkkkkkkk",
    "................",
  ],
  line: [
    "................",
    "kkk.............",
    "kwkk............",
    "kkkyk...........",
    "..kyyk..........",
    "...kyyk.........",
    "....kyyk..kkk...",
    ".....kyykkwwk...",
    "......kyyywwk...",
    ".......kkkkk....",
    "........kyyk....",
    ".........kyyk...",
    "..........kyykkk",
    "...........kykwk",
    "............kkkk",
    "................",
  ],
  develop: [
    "................",
    "kk..............",
    "kykkkkkkkkkkkk..",
    "kyyyyyyyyyyyyyk.",
    "kykkkkkkkkkkkkk.",
    "kyk.......ksk...",
    "kyk.......ksk...",
    "kyk......kkkkk..",
    "kyk......kttttk.",
    "kyk......ktkktk.",
    "kyk....kkkttttkk",
    "kyk....kttkkkttk",
    "kyk....kttttttkk",
    "kkk....ktkkttktk",
    "kkkk...kttttttkk",
    ".......kkkkkkkk.",
  ],
  demolish: [
    "................",
    "...kkkkkkk......",
    "..kyyyyyyyk.....",
    "..kykkkkyyk.....",
    "..kykccky.kkk...",
    "kkkyyyyyykkyyk..",
    "kyyyyyyyyyyyyk..",
    "kykkkkkkkkkkkkk.",
    "kykyyyyyyyyyyyk.",
    "kykkkkkkkkkkkkk.",
    "kyk.ksssssssssk.",
    "kykkkSkkkkkkkSk.",
    "kyykSkSSSSSSkSk.",
    "kkkkSkSSSSSSkSk.",
    "...kkSSkkkkSSk..",
    "....kkkk..kkk...",
  ],
  // ---- misc ----
  news: [
    "................",
    ".kkkkkkkkkkkkk..",
    ".kwwwwwwwwwwwk..",
    ".kwkkkkkkkkkwk..",
    ".kwkkkkkkkkkwkk.",
    ".kwwwwwwwwwwwkwk",
    ".kwkkkkkwkkkwkwk",
    ".kwkkkkkwwwwwkwk",
    ".kwkkkkkwkkkwkwk",
    ".kwwwwwwwwwwwkwk",
    ".kwkkkkwkkkkwkwk",
    ".kwkkkkwkkkkwkwk",
    ".kwwwwwwwwwwwkwk",
    ".kkkkkkkkkkkkkwk",
    "..kkkkkkkkkkkkk.",
    "................",
  ],
  lock: [
    "................",
    ".....kkkkk......",
    "....kssssssk....",
    "...kssk..kssk...",
    "...kssk..kssk...",
    "...kssk..kssk...",
    ".kkkkkkkkkkkkkk.",
    ".kyyyyyyyyyyyyk.",
    ".kyyyyykkyyyyyk.",
    ".kyyyykkkkyyyyk.",
    ".kyyyyykkyyyyyk.",
    ".kyyyyykkyyyyyk.",
    ".kyyyyyyyyyyyyk.",
    ".kYYYYYYYYYYYYk.",
    ".kkkkkkkkkkkkkk.",
    "................",
  ],
  trophy: [
    "................",
    ".kkkkkkkkkkkkkk.",
    ".kyyyyyyyyyyyyk.",
    "kkkyYYYYYYYYykkk",
    "kykkyyyyyyyykkyk",
    "kyk.kyYYYYyk.kyk",
    "kyk.kyyyyyyk.kyk",
    "kkk.kyYYYYyk.kkk",
    ".....kyyyyk.....",
    "......kyyk......",
    "......kYYk......",
    ".....kkYYkk.....",
    "....kNNNNNNk....",
    "...kNNNNNNNNk...",
    "...kkkkkkkkkk...",
    "................",
  ],
  star: [
    "................",
    ".......kk.......",
    ".......kyk......",
    "......kyyk......",
    "......kyyyk.....",
    "kkkkkkkyyykkkkkk",
    "kyyyyyyyyyyyyyyk",
    ".kyyyyyyyyyyyyk.",
    "..kyyyyyyyyyyk..",
    "...kyyyyyyyyk...",
    "...kyyyyyyyyk...",
    "..kyyyykkyyyyk..",
    "..kyyykk.kkyyyk.",
    ".kyykk.....kkyyk",
    ".kkk.........kkk",
    "................",
  ],
  flag: [
    "................",
    ".kk.............",
    ".kNkkkkkkkkkk...",
    ".kNkrrrrrrrrrk..",
    ".kNkrrrrrrrrrrk.",
    ".kNkrryyyyyrrrk.",
    ".kNkrryyyyyrrrk.",
    ".kNkrrrrrrrrrrk.",
    ".kNkrrrrrrrrrk..",
    ".kNkkkkkkkkkk...",
    ".kNk............",
    ".kNk............",
    ".kNk............",
    ".kNk............",
    ".kkk............",
    "................",
  ],
  save: [
    "................",
    ".kkkkkkkkkkkkk..",
    ".kBkkkkkkkkkBk..",
    ".kBkwwwwwwwkBk..",
    ".kBkwwwwwkwkBk..",
    ".kBkwwwwwkwkBk..",
    ".kBkkkkkkkkkBk..",
    ".kBBBBBBBBBBBk..",
    ".kBBBBBBBBBBBk..",
    ".kBkkkkkkkkkBk..",
    ".kBkllllllllBk..",
    ".kBklkkkkkllBk..",
    ".kBkllllllllBk..",
    ".kkkkkkkkkkkkk..",
    "................",
    "................",
  ],
  load: [
    "................",
    "................",
    ".kkkkkk.........",
    "kyyyyyykkkkkkkk.",
    "kyyyyyyyyyyyyyk.",
    "kyykkkkkkkkkkkkk",
    "kykYYYYYYYYYYYYk",
    "kykYYYYYYYYYYYYk",
    "kykYYYYYYYYYYYYk",
    "kykYYYYYYYYYYYYk",
    "kykYYYYYYYYYYYYk",
    "kykYYYYYYYYYYYYk",
    "kkkkkkkkkkkkkkkk",
    "................",
    "................",
    "................",
  ],
  warn: [
    "................",
    ".......kk.......",
    "......kyyk......",
    "......kyyk......",
    ".....kyyyyk.....",
    ".....kykkyk.....",
    "....kyykkyyk....",
    "....kyykkyyk....",
    "...kyyykkyyyk...",
    "...kyyykkyyyk...",
    "..kyyyyyyyyyyk..",
    "..kyyyykkyyyyk..",
    ".kyyyyykkyyyyyk.",
    ".kyyyyyyyyyyyyk.",
    ".kkkkkkkkkkkkkk.",
    "................",
  ],
  check: [
    "................",
    "................",
    ".............kk.",
    "............kgk.",
    "...........kggk.",
    "..........kggk..",
    ".kk......kggk...",
    ".kgk....kggk....",
    ".kggk..kggk.....",
    "..kggkkggk......",
    "...kggggk.......",
    "....kggk........",
    ".....kk.........",
    "................",
    "................",
    "................",
  ],
  riders: [
    "................",
    "....kk....kk....",
    "...kttk..kttk...",
    "...kttk..kttk...",
    "....kk....kk....",
    "...kbbk..krrk...",
    "..kbbbbkkrrrrk..",
    "..kbbbbkkrrrrk..",
    "..kbkbbkkrrkrk..",
    "..kkkbbkkrrkkk..",
    "....kbbkkrrk....",
    "....kkkkkkkk....",
    "....kNkNkNkNk...",
    "....kNkNkNkNk...",
    "....kkkkkkkk....",
    "................",
  ],
  pop: [
    "................",
    ".......kk.......",
    "......krrk......",
    ".....krrrrk.....",
    "....krrrrrrk....",
    "...krrrrrrrrk...",
    "..krrrrrrrrrrk..",
    ".kkkkkkkkkkkkkk.",
    ".kttttttkkttttk.",
    ".ktkkttttkkkkttk",
    ".ktcctttkNNkttk.",
    ".ktkktttkNNkttk.",
    ".kttttttkNNkttk.",
    ".kkkkkkkkkkkkkk.",
    "gggggggggggggggg",
    "................",
  ],
  calendar: [
    "................",
    "...kk......kk...",
    "kkkSSkkkkkkSSkkk",
    "krrSSrrrrrrSSrrk",
    "krrkkrrrrrrkkrrk",
    "kkkkkkkkkkkkkkkk",
    "kwwwwwwwwwwwwwwk",
    "kwkkwkkwkkwkkwwk",
    "kwwwwwwwwwwwwwwk",
    "kwkkwkkwkkwkkwwk",
    "kwwwwwwwwwwwwwwk",
    "kwkkwkkwrrwkkwwk",
    "kwwwwwwwrrwwwwwk",
    "kwwwwwwwwwwwwwwk",
    "kkkkkkkkkkkkkkkk",
    "................",
  ],
  coin: [
    "................",
    "................",
    ".....kkkkkk.....",
    "....kyyyyyyk....",
    "...kyyYYYYyyk...",
    "..kyYkkkkkkYyk..",
    "..kyYkyyyykYyk..",
    "..kyYkyykykYyk..",
    "..kyYkyyyykYyk..",
    "..kyYkkkkkkYyk..",
    "...kyyYYYYyyk...",
    "....kyyyyyyk....",
    ".....kkkkkk.....",
    "................",
    "................",
    "................",
  ],
  back: [
    "................",
    "................",
    "......kk........",
    ".....kwk........",
    "....kwwk........",
    "...kwwwkkkkkkkk.",
    "..kwwwwwwwwwwwk.",
    ".kwwwwwwwwwwwwk.",
    ".kwwwwwwwwwwwwk.",
    "..kwwwwwwwwwwwk.",
    "...kwwwkkkkkkkk.",
    "....kwwk........",
    ".....kwk........",
    "......kk........",
    "................",
    "................",
  ],
  skip: [
    "................",
    "................",
    ".kk.....kk......",
    ".kgkk...kgkk....",
    ".kgggkk.kgggkk..",
    ".kggGGgkkggGGgk.",
    ".kggGGGgkggGGGgk",
    ".kggGGgkkggGGgk.",
    ".kgggkk.kgggkk..",
    ".kgkk...kgkk....",
    ".kk.....kk......",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  pin: [
    "................",
    "......kkkkk.....",
    "......kyyyk.....",
    ".....kyyyyyk....",
    ".....kyyyyyk....",
    ".....kyyyyyk....",
    "....kkkyyykkk...",
    "...kyyyyyyyyyk..",
    "...kkkkkkkkkkk..",
    "......kSSk......",
    ".......kk.......",
    ".......kk.......",
    ".......k........",
    "................",
    "................",
    "................",
  ],
  lab: [
    "................",
    ".....kkkkkk.....",
    ".....kwwwwk.....",
    "......kwwk......",
    "......kwwk......",
    "......kwwk......",
    "......kwwk......",
    ".....kwwwwk.....",
    "....kwwwwwwk....",
    "...kwwccccwwk...",
    "..kwcccccccwwk..",
    "..kwccwccccwwk..",
    "..kwcccccwccwk..",
    "..kwwccccccwwk..",
    "...kkkkkkkkkk...",
    "................",
  ],
  hand: [
    "................",
    "......kk........",
    ".....ktkk.......",
    ".....kttkkk.....",
    ".....kttkttkk...",
    "..kk.kttkttkttk.",
    ".kttkkttkttkttk.",
    ".kttttttttttttk.",
    ".ktttttttttttttk",
    "..kttttttttttttk",
    "..kttttttttttttk",
    "...kttttttttttk.",
    "....kttttttttk..",
    ".....kkkkkkkk...",
    "................",
    "................",
  ],
};

const Art = { url: {}, installed: false };

/** Rasterise one icon grid into a data URL (cached). Returns "" when no
 *  canvas is available (headless smoke tests). */
function iconDataURL(name) {
  if (Art.url[name] !== undefined) return Art.url[name];
  const grid = ICON_GRIDS[name];
  if (!grid || typeof document === "undefined") return (Art.url[name] = "");
  const cv = document.createElement("canvas");
  if (!cv || typeof cv.toDataURL !== "function") return (Art.url[name] = "");
  cv.width = 16; cv.height = 16;
  const c = cv.getContext("2d");
  const top = Math.floor((16 - grid.length) / 2);
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length && x < 16; x++) {
      const col = PAL[row[x]];
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(x, top + y, 1, 1);
    }
  }
  return (Art.url[name] = cv.toDataURL("image/png"));
}

/** Inject one CSS rule per icon so markup can use <i class="ico ico-name">. */
function installIconStyles() {
  if (Art.installed || typeof document === "undefined" || !document.head) return;
  Art.installed = true;
  const rules = [];
  for (const name in ICON_GRIDS) {
    const url = iconDataURL(name);
    if (url) rules.push(".ico-" + name + "{background-image:url(" + url + ")}");
  }
  const style = document.createElement("style");
  style.textContent = rules.join("\n");
  document.head.appendChild(style);
}

/** <i class="ico ico-name"> */
function iconEl(name) {
  const i = document.createElement("i");
  i.className = "ico ico-" + name;
  return i;
}

/** Button with a pixel icon and an optional text label. */
function iconBtn(icon, label, cls, onClick) {
  const b = document.createElement("button");
  b.className = cls || "ubtn";
  if (icon) b.appendChild(iconEl(icon));
  if (label) {
    const s = document.createElement("span");
    s.className = "tl"; s.textContent = label;
    b.appendChild(s);
  }
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

/** Swap the icon + label of an existing button in place (toolbar toggles). */
function setIconBtn(b, icon, label) {
  if (!b) return;
  b.textContent = "";
  if (icon) b.appendChild(iconEl(icon));
  if (label) {
    const s = document.createElement("span");
    s.className = "tl"; s.textContent = label;
    b.appendChild(s);
  }
}

/* ---- Title-screen banner ---------------------------------------------------
 * A dusk skyline in the spirit of a 90s game box: gradient sky, a low sun,
 * the campaign's landmark silhouette on the horizon, a rooftop skyline with
 * lit windows, and a steam train crossing an embankment in the foreground.
 * Drawn at a small native resolution and CSS-upscaled with pixelated
 * rendering so it reads as chunky pixel art. */
function drawTitleArt(cv, campaign) {
  if (!cv || typeof cv.getContext !== "function") return;
  const W = 380, H = 130;
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  if (!c) return;
  const camp = campaign || "tokyo";
  // sky bands (posterised gradient — no smooth ramps in 256 colours)
  const bands = ["#1c2749", "#3a2e5a", "#7a3a5c", "#b8503f", "#e07a3a", "#f2b04c"];
  for (let i = 0; i < bands.length; i++) {
    c.fillStyle = bands[i];
    c.fillRect(0, Math.round(i * H * 0.11), W, H);
  }
  // sun
  c.fillStyle = "#ffe08a";
  c.beginPath(); c.arc(W * 0.78, H * 0.5, 24, 0, 7); c.fill();
  c.fillStyle = "#fff3c0";
  c.beginPath(); c.arc(W * 0.78, H * 0.5, 18, 0, 7); c.fill();
  // horizon haze
  c.fillStyle = "rgba(255,200,120,0.25)";
  c.fillRect(0, H * 0.55, W, H * 0.12);
  // landmark silhouette per campaign
  c.fillStyle = "#4a2a4a";
  if (camp === "tokyo") {           // Mt Fuji with a snow cap
    c.beginPath(); c.moveTo(W * 0.05, H * 0.7); c.lineTo(W * 0.3, H * 0.28); c.lineTo(W * 0.55, H * 0.7); c.closePath(); c.fill();
    c.fillStyle = "#f4ecff";
    c.beginPath(); c.moveTo(W * 0.245, H * 0.37); c.lineTo(W * 0.3, H * 0.28); c.lineTo(W * 0.355, H * 0.37);
    c.lineTo(W * 0.335, H * 0.4); c.lineTo(W * 0.32, H * 0.37); c.lineTo(W * 0.30, H * 0.41); c.lineTo(W * 0.28, H * 0.375); c.lineTo(W * 0.265, H * 0.40); c.closePath(); c.fill();
  } else if (camp === "london") {   // clock tower + dome
    c.fillRect(W * 0.2, H * 0.3, 14, H * 0.42); c.beginPath(); c.moveTo(W * 0.2 - 2, H * 0.3); c.lineTo(W * 0.2 + 7, H * 0.2); c.lineTo(W * 0.2 + 16, H * 0.3); c.fill();
    c.beginPath(); c.arc(W * 0.42, H * 0.6, 30, Math.PI, 0); c.fill(); c.fillRect(W * 0.42 - 34, H * 0.6, 68, H * 0.12);
  } else if (camp === "nyc") {      // skyscraper cluster
    for (const [x, w, h] of [[0.1, 0.05, 0.5], [0.17, 0.04, 0.42], [0.23, 0.06, 0.62], [0.31, 0.04, 0.48], [0.37, 0.05, 0.36]]) c.fillRect(W * x, H * (0.72 - h), W * w, H * h);
    c.fillRect(W * 0.245, H * 0.06, 4, H * 0.06);
  } else if (camp === "paris") {    // the iron tower
    c.beginPath(); c.moveTo(W * 0.22, H * 0.72); c.quadraticCurveTo(W * 0.27, H * 0.35, W * 0.285, H * 0.12); c.lineTo(W * 0.295, H * 0.12); c.quadraticCurveTo(W * 0.31, H * 0.35, W * 0.36, H * 0.72); c.closePath(); c.fill();
    c.fillRect(W * 0.235, H * 0.5, W * 0.11, 3); c.fillRect(W * 0.262, H * 0.3, W * 0.056, 2);
  } else {                          // low hills + a spire (Melbourne)
    c.beginPath(); c.moveTo(0, H * 0.72); c.quadraticCurveTo(W * 0.2, H * 0.45, W * 0.5, H * 0.72); c.fill();
    c.fillRect(W * 0.3, H * 0.4, 6, H * 0.32);
  }
  // city skyline blocks with lit windows (deterministic) — kept low so the
  // landmark and the sun stay visible above the rooftops
  let x = 0, k = 0;
  while (x < W) {
    const w = 9 + ((k * 37) % 18), h = 8 + ((k * 53) % 22);
    c.fillStyle = k % 3 === 0 ? "#2a2238" : "#1d1a2e";
    c.fillRect(x, H * 0.74 - h, w, h + 8);
    c.fillStyle = "#ffd46a";
    for (let wy = H * 0.74 - h + 3; wy < H * 0.74 - 2; wy += 5) {
      for (let wx = x + 2; wx < x + w - 2; wx += 4) if (((wx * 7 + wy * 13 + k) % 5) < 2) c.fillRect(wx, wy, 2, 2);
    }
    x += w + 1 + (k % 2); k++;
  }
  // embankment + track
  c.fillStyle = "#2f4a2a"; c.fillRect(0, H * 0.79, W, H);
  c.fillStyle = "#5a4a34"; c.fillRect(0, H * 0.86, W, 11);
  c.fillStyle = "#3a2a1c"; for (let tx = 0; tx < W; tx += 6) c.fillRect(tx, H * 0.875, 3, 7);
  c.fillStyle = "#c8c0b0"; c.fillRect(0, H * 0.88, W, 1.5); c.fillRect(0, H * 0.915, W, 1.5);
  // steam train silhouette (loco + 3 coaches), heading right
  const ty = H * 0.88 - 17, tx0 = W * 0.5;
  const ink = "#1a1410";
  c.fillStyle = ink;
  for (let cx = tx0 - 60; cx > tx0 - 60 * 4; cx -= 60) c.fillRect(cx, ty + 1, 56, 15);   // coaches
  c.fillRect(tx0 - 3, ty + 8, 60, 8);                  // loco frame
  c.fillRect(tx0 + 2, ty + 2, 40, 8);                  // boiler
  c.beginPath(); c.arc(tx0 + 42, ty + 6, 4, 0, 7); c.fill();   // smokebox front
  c.fillRect(tx0 - 3, ty - 5, 16, 14);                 // cab
  c.fillRect(tx0 - 5, ty - 6, 20, 2);                  // cab roof
  c.fillRect(tx0 + 34, ty - 6, 5, 9);                  // stack
  c.fillRect(tx0 + 16, ty - 1, 7, 4);                  // steam dome
  c.fillStyle = "#ffe9a0";                             // windows
  for (let cx = tx0 - 60; cx > tx0 - 60 * 4; cx -= 60) for (let wx = cx + 4; wx < cx + 52; wx += 8) c.fillRect(wx, ty + 4, 5, 5);
  c.fillRect(tx0, ty - 2, 5, 5); c.fillRect(tx0 + 7, ty - 2, 4, 5);
  c.fillStyle = "#ff9a3a"; c.fillRect(tx0 + 44, ty + 5, 2, 2);   // headlamp
  c.fillStyle = ink;                                   // wheels
  for (let wx = tx0 - 60 * 3 + 6; wx < tx0 - 4; wx += 12) { c.beginPath(); c.arc(wx, ty + 17, 3, 0, 7); c.fill(); }
  for (const wx of [tx0 + 6, tx0 + 18, tx0 + 30]) { c.beginPath(); c.arc(wx, ty + 16, 4.5, 0, 7); c.fill(); }
  c.fillStyle = "#c8c0b0"; for (const wx of [tx0 + 6, tx0 + 18, tx0 + 30]) { c.beginPath(); c.arc(wx, ty + 16, 1.5, 0, 7); c.fill(); }
  // smoke puffs drifting back
  c.fillStyle = "rgba(240,236,228,0.85)";
  for (const [dx, dy, r] of [[-2, -12, 4], [-11, -18, 5], [-22, -24, 6], [-36, -29, 7], [-52, -33, 7]]) { c.beginPath(); c.arc(tx0 + 36 + dx, ty + dy, r, 0, 7); c.fill(); }
  // dark vignette bands top/bottom for the frame
  c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(0, 0, W, 3); c.fillRect(0, H - 3, W, 3);
}
