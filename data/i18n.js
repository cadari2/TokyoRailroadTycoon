/* =========================================================================
 * data/i18n.js — Interface localization (v0.5).
 *
 * A tiny string table with two languages, English (`en`) and Japanese (`ja`),
 * and a `t(key, ...args)` lookup. Keys are stable English-ish identifiers;
 * the value is the displayed text. Missing keys fall back to English, then to
 * the key itself, so a half-translated table never crashes or shows blanks.
 *
 * WHY A .js FILE (not .json): the game runs from file:// (open index.html
 * directly), where browsers refuse to fetch() a local .json. A <script> that
 * assigns window.I18N loads fine either way. Same reasoning as the audio
 * manifest.
 *
 * SCOPE: the persistent interface shell — tabs, sub-tabs, the summary stat
 * tiles, the start screen, the top bar, and the common modal buttons — is
 * fully bilingual. Transient status lines and deep panel prose fall back to
 * English for now; add keys here and swap the literal for t("…") to grow
 * coverage incrementally. Place names are already bilingual on the map itself
 * (e.g. "皇居 (Kokyo)"), so they read in either language without a table.
 *
 * `t()` supports positional {0},{1},… substitution: t("start.welcome", 1872).
 * ========================================================================= */
(function () {
  const I18N = {
    en: {
      "lang.name": "English",
      "lang.toggle": "Language",

      // top bar
      "top.title": "■ TOKYO RAILROAD TYCOON",
      "top.demand": "Demand",
      "top.menu": "☰ Menu",
      "top.pause": "PAUSE",
      "top.resume": "RESUME",
      "top.debug": "DEBUG",

      // tabs
      "tab.Build": "Build",
      "tab.Lines": "Lines",
      "tab.Money": "Assets",
      "tab.Company": "Company",
      "tab.System": "System",
      // sub-tabs
      "sub.Finance": "Finance",
      "sub.Property": "Property",
      "sub.R&D": "R&D",
      "sub.Workforce": "Workforce",
      "sub.Rivals": "Rivals",
      "sub.Settings": "Settings",
      "sub.Log": "Log",

      // summary stat tiles
      "stat.year": "Year",
      "stat.cash": "Cash",
      "stat.networth": "Net worth",
      "stat.netday": "Net / day",

      // common buttons
      "btn.save": "Save",
      "btn.load": "Load",
      "btn.export": "Export file",
      "btn.import": "Import file",
      "btn.confirm": "Confirm",
      "btn.cancel": "Cancel",
      "btn.done": "Done",
      "btn.keep": "Keep",
      "btn.delete": "Delete",
      "btn.close": "Close",

      // start screen
      "start.title": "TOKYO RAILROAD TYCOON",
      "start.subtitle": "1872–2028 — lay track, build stations, and grow a rail empire across Tokyo's history.",
      "start.speed": "Game speed:",
      "start.rivals": "Rival companies:",
      "start.class": "Your house:",
      "start.newgame": "Start new game",
      "start.continue": "Continue saved game",
      "start.loadfile": "Load save file…",
      "start.saved": "A saved game was found.",
      "start.welcome": "Welcome to {0}. Buy land, lay track, and connect the city. (Drag/swipe to pan, wheel/pinch to zoom; ☰ Menu hides the panel.)",
      "start.welcomeback": "Welcome back. Choose Continue or start a new game.",

      // first-run tutorial (auto-shown once; reopen anytime with the ❓ button)
      "top.help": "❓ Help",
      "tutorial.title": "How to Play",
      "tutorial.goal.h": "The core loop",
      "tutorial.goal.p": "Riders pay fares. Fares fund more track and land. More reach finds more demand — and demand grows population, which grows demand again. Everything else in the game serves that loop.",
      "tutorial.start.h": "Getting started",
      "tutorial.start.p": "Open Build, pick a station, and click hexes to lay track between two places with people (housing) and somewhere to go (jobs, shops). Then use Create Line in the Lines panel to put trains into service.",
      "tutorial.demand.h": "Find demand before you build",
      "tutorial.demand.p": "Toggle Demand (top bar) to see where riders already are, even on empty land. Aim your first line there instead of guessing.",
      "tutorial.density.h": "Fewer, better lines",
      "tutorial.density.p": "Track and stations cost upkeep whether anyone rides them or not, and two of your own lines covering the same hexes just split each other's riders. A handful of corridors aimed at real demand will out-earn a grid paved wall-to-wall.",
      "tutorial.more.h": "More as you go",
      "tutorial.more.p": "Short tips like this appear throughout the panels (toggle them off in System ▸ Settings). Reopen this guide anytime with the ❓ button.",
      "tutorial.close": "Let's build",
    },
    ja: {
      "lang.name": "日本語",
      "lang.toggle": "言語",

      // top bar
      "top.title": "■ 東京鉄道王",
      "top.demand": "需要",
      "top.menu": "☰ メニュー",
      "top.pause": "一時停止",
      "top.resume": "再開",
      "top.debug": "デバッグ",

      // tabs
      "tab.Build": "建設",
      "tab.Lines": "路線",
      "tab.Money": "資産",
      "tab.Company": "会社",
      "tab.System": "システム",
      // sub-tabs
      "sub.Finance": "会計",
      "sub.Property": "地所",
      "sub.R&D": "研究",
      "sub.Workforce": "従業員",
      "sub.Rivals": "競合",
      "sub.Settings": "設定",
      "sub.Log": "記録",

      // summary stat tiles
      "stat.year": "年",
      "stat.cash": "現金",
      "stat.networth": "純資産",
      "stat.netday": "日次損益",

      // common buttons
      "btn.save": "保存",
      "btn.load": "読込",
      "btn.export": "書き出し",
      "btn.import": "取り込み",
      "btn.confirm": "決定",
      "btn.cancel": "取消",
      "btn.done": "完了",
      "btn.keep": "残す",
      "btn.delete": "削除",
      "btn.close": "閉じる",

      // start screen
      "start.title": "東京鉄道王",
      "start.subtitle": "1872–2028 — 線路を敷き、駅を建て、東京の歴史を貫く鉄道帝国を築こう。",
      "start.speed": "ゲーム速度：",
      "start.rivals": "競合会社：",
      "start.class": "あなたの家格：",
      "start.newgame": "新規ゲーム開始",
      "start.continue": "セーブから再開",
      "start.loadfile": "セーブファイルを開く…",
      "start.saved": "セーブデータが見つかりました。",
      "start.welcome": "{0}年へようこそ。土地を買い、線路を敷き、街をつなごう。（ドラッグ／スワイプで移動、ホイール／ピンチで拡大縮小、☰メニューでパネルを隠せます）",
      "start.welcomeback": "おかえりなさい。再開するか、新規ゲームを始めてください。",

      // first-run tutorial (auto-shown once; reopen anytime with the ❓ button)
      "top.help": "❓ ヘルプ",
      "tutorial.title": "遊び方",
      "tutorial.goal.h": "基本のループ",
      "tutorial.goal.p": "乗客が運賃を払う。運賃で線路や土地を増やす。路線が伸びれば需要が見つかり、需要が増えれば人口が増え、また需要が増える。ゲームの他の要素は全てこの循環に仕える。",
      "tutorial.start.h": "はじめかた",
      "tutorial.start.p": "「建設」タブを開き、駅を選んでヘクスをクリックし、住宅地と行き先（職場・商業地）を線路でつなごう。つないだら「路線」タブの「路線作成」で列車を走らせる。",
      "tutorial.demand.h": "建設前に需要を確認",
      "tutorial.demand.p": "上部バーの「需要」を切り替えると、更地でもどこに乗客がいるか分かる。勘に頼らず、最初の路線はそこへ。",
      "tutorial.density.h": "本数より質",
      "tutorial.density.p": "線路と駅は使われなくても維持費がかかる。自社の路線同士が同じヘクスを重複してカバーすると、乗客を奪い合うだけだ。全面舗装より、実需要を狙った少数の路線の方が稼げる。",
      "tutorial.more.h": "これから",
      "tutorial.more.p": "こうした短いヒントは各パネルにも表示される（システム▸設定でオフにできる）。この案内は❓ボタンでいつでも再表示できる。",
      "tutorial.close": "さあ建設だ",
    },
  };

  const LS_KEY = "trt_lang";
  let lang = "en";
  try {
    const saved = (typeof localStorage !== "undefined") && localStorage.getItem(LS_KEY);
    if (saved && I18N[saved]) lang = saved;
  } catch (e) { /* storage unavailable — stay on default */ }

  function getLang() { return lang; }
  function setLang(l) {
    if (!I18N[l]) return;
    lang = l;
    try { if (typeof localStorage !== "undefined") localStorage.setItem(LS_KEY, l); } catch (e) { /* ignore */ }
  }
  function languages() { return Object.keys(I18N); }

  /** Look up a key in the active language, English, then the key itself, and
   *  substitute positional {0},{1},… placeholders from any extra arguments. */
  function t(key, ...args) {
    const table = I18N[lang] || I18N.en;
    let s = (key in table) ? table[key] : (key in I18N.en ? I18N.en[key] : key);
    if (args.length) s = s.replace(/\{(\d+)\}/g, (m, i) => (args[+i] !== undefined ? args[+i] : m));
    return s;
  }

  const api = { t, getLang, setLang, languages, I18N };
  if (typeof window !== "undefined") Object.assign(window, api);
  if (typeof globalThis !== "undefined") Object.assign(globalThis, api);
})();
