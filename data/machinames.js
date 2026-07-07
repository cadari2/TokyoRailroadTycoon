/* =========================================================================
 * machinames.js — Real historical Tokyo 町名 (machi/chō names) for hex naming.
 *
 * Names in use roughly between the Great Kantō Earthquake reconstruction
 * (1923→) and the 1960s–70s 住居表示 mergers that abolished most of them
 * (e.g. 木挽町, now part of 銀座). Each hex on the board is given its OWN such
 * name (see assignAreaNames in map.js): the nearest ward pool supplies a
 * unique machi, so the map reads like a Shōwa-era kiriezu. No directional
 * prefixes, no 丁目 block numbers — every name is a genuine former place name.
 *
 * Grouped by the old (pre-1947, 35-ku) wards & surrounding towns. `dc/dr` are
 * (east+, south+) hex offsets from CENTER (the Imperial Palace). `n` is the
 * pool of [kanji, romaji] machi for that ward; hexes nearest a ward draw from
 * its pool. Romaji is plain ASCII Hepburn (long vowels not marked).
 * ========================================================================= */
"use strict";

const TOKYO_MACHI = [
  // ===================== Chiyoda (麹町区 / 神田区) =====================
  { c: "Kojimachi", dc: -2, dr: 0, n: [
    ["麹町", "Kojimachi"], ["永田町", "Nagatacho"], ["三年町", "Sannencho"],
    ["隼町", "Hayabusacho"], ["紀尾井町", "Kioicho"], ["平河町", "Hirakawacho"],
    ["元園町", "Motozonocho"], ["飯田町", "Iidamachi"], ["富士見町", "Fujimicho"],
    ["一番町", "Ichibancho"], ["二番町", "Nibancho"], ["三番町", "Sanbancho"],
    ["四番町", "Yonbancho"], ["五番町", "Gobancho"], ["六番町", "Rokubancho"],
    ["土手三番町", "Dotesanbancho"], ["元衛町", "Motoeicho"], ["内山下町", "Uchiyamashitacho"],
    ["八重洲町", "Yaesucho"], ["有楽町", "Yurakucho"], ["数寄屋橋", "Sukiyabashi"],
    ["山下町", "Yamashitacho"], ["内幸町", "Uchisaiwaicho"], ["霞ヶ関", "Kasumigaseki"],
    ["永楽町", "Eirakucho"], ["仲町", "Nakacho"], ["元衞町", "Motoecho"],
  ]},
  { c: "Kanda", dc: 1, dr: -3, n: [
    ["須田町", "Sudacho"], ["鍛冶町", "Kajicho"], ["多町", "Tacho"],
    ["連雀町", "Renjakucho"], ["雉子町", "Kijicho"], ["司町", "Tsukasacho"],
    ["美土代町", "Mitoshirocho"], ["小川町", "Ogawamachi"], ["淡路町", "Awajicho"],
    ["三崎町", "Misakicho"], ["神保町", "Jimbocho"], ["表神保町", "Omotejimbocho"],
    ["猿楽町", "Sarugakucho"], ["駿河台", "Surugadai"], ["錦町", "Nishikicho"],
    ["一ツ橋", "Hitotsubashi"], ["今川小路", "Imagawakoji"], ["松永町", "Matsunagacho"],
    ["佐久間町", "Sakumacho"], ["和泉町", "Izumicho"], ["豊島町", "Toshimacho"],
    ["旅籠町", "Hatagocho"], ["末広町", "Suehirocho"], ["松住町", "Matsuzumicho"],
    ["花房町", "Hanabusacho"], ["相生町", "Aioicho"], ["練塀町", "Neribeicho"],
    ["同朋町", "Dohocho"], ["五軒町", "Gokencho"], ["旭町", "Asahicho"],
    ["山本町", "Yamamotocho"], ["松枝町", "Matsuedacho"], ["岩本町", "Iwamotocho"],
    ["富山町", "Tomiyamacho"], ["東福田町", "Higashifukudacho"], ["北乗物町", "Kitanorimonocho"],
    ["紺屋町", "Konyacho"], ["鍋町", "Nabecho"], ["三河町", "Mikawacho"],
    ["新石町", "Shinkokucho"], ["鎌倉町", "Kamakuracho"], ["玉ヶ池", "Tamagaike"],
  ]},
  // ===================== Chuo (日本橋区 / 京橋区) =====================
  { c: "Nihonbashi", dc: 3, dr: -1, n: [
    ["室町", "Muromachi"], ["本町", "Honcho"], ["通町", "Toricho"],
    ["大伝馬町", "Odenmacho"], ["小伝馬町", "Kodenmacho"], ["通旅籠町", "Torihatagocho"],
    ["通油町", "Toriaburacho"], ["馬喰町", "Bakurocho"], ["横山町", "Yokoyamacho"],
    ["葺屋町", "Fukiyacho"], ["堺町", "Sakaicho"], ["人形町", "Ningyocho"],
    ["蛎殻町", "Kakigaracho"], ["浜町", "Hamacho"], ["久松町", "Hisamatsucho"],
    ["富沢町", "Tomizawacho"], ["田所町", "Tadokorocho"], ["高砂町", "Takasagocho"],
    ["矢ノ倉町", "Yanokuracho"], ["米沢町", "Yonezawacho"], ["薬研堀", "Yagenbori"],
    ["村松町", "Muramatsucho"], ["小網町", "Koamicho"], ["茅場町", "Kayabacho"],
    ["兜町", "Kabutocho"], ["坂本町", "Sakamotocho"], ["箱崎町", "Hakozakicho"],
    ["中洲", "Nakazu"], ["元大坂町", "Motoosakacho"], ["橘町", "Tachibanacho"],
    ["小舟町", "Kobunacho"], ["伊勢町", "Isecho"], ["堀留町", "Horidomecho"],
    ["瀬戸物町", "Setomonocho"], ["本石町", "Honkokucho"], ["品川町", "Shinagawacho"],
    ["駿河町", "Surugacho"], ["西河岸町", "Nishigashicho"], ["呉服町", "Gofukucho"],
    ["小伝馬上町", "Kodenmakamicho"], ["大伝馬塩町", "Odenmashiocho"], ["元浜町", "Motohamacho"],
    ["南茅場町", "Minamikayabacho"], ["北新堀町", "Kitashinboricho"], ["南新堀町", "Minamishinboricho"],
  ]},
  { c: "Kyobashi", dc: 2, dr: 2, n: [
    ["木挽町", "Kobikicho"], ["尾張町", "Owaricho"], ["竹川町", "Takekawacho"],
    ["出雲町", "Izumocho"], ["加賀町", "Kagacho"], ["三十間堀", "Sanjukkenbori"],
    ["南鍋町", "Minaminabecho"], ["滝山町", "Takiyamacho"], ["弓町", "Yumicho"],
    ["日吉町", "Hiyoshicho"], ["采女町", "Unemecho"], ["桶町", "Okecho"],
    ["鈴木町", "Suzukicho"], ["元数寄屋町", "Motosukiyacho"], ["因幡町", "Inabacho"],
    ["畳町", "Tatamicho"], ["弥左衛門町", "Yazaemoncho"], ["新肴町", "Shinsakanacho"],
    ["中橋広小路", "Nakabashihirokoji"], ["具足町", "Gusokucho"], ["本材木町", "Honzaimokucho"],
    ["南伝馬町", "Minamidenmacho"], ["槇町", "Makicho"], ["八丁堀", "Hatchobori"],
    ["越前堀", "Echizenbori"], ["新富町", "Shintomicho"], ["入船町", "Irifunecho"],
    ["湊町", "Minatocho"], ["明石町", "Akashicho"], ["築地", "Tsukiji"],
    ["本湊町", "Honminatocho"], ["鉄砲洲", "Teppozu"], ["銀座", "Ginza"],
    ["京橋", "Kyobashi"], ["水谷町", "Mizutanicho"], ["金六町", "Kinrokucho"],
    ["大鋸町", "Ogacho"], ["太田町", "Otacho"], ["桜橋", "Sakurabashi"],
    ["月島", "Tsukishima"], ["佃島", "Tsukudajima"], ["新佃島", "Shintsukudajima"],
  ]},
  // ===================== Minato (芝区 / 麻布区 / 赤坂区) =====================
  { c: "Shiba", dc: 1, dr: 5, n: [
    ["芝口", "Shibaguchi"], ["宇田川町", "Udagawacho"], ["源助町", "Gensukecho"],
    ["柴井町", "Shibaicho"], ["新銭座", "Shinzeniza"], ["浜松町", "Hamamatsucho"],
    ["金杉", "Kanasugi"], ["田町", "Tamachi"], ["三田", "Mita"],
    ["札ノ辻", "Fudanotsuji"], ["高輪", "Takanawa"], ["白金", "Shirokane"],
    ["白金台町", "Shirokanedaimachi"], ["二本榎", "Nihonenoki"], ["伊皿子", "Isarago"],
    ["車町", "Kurumacho"], ["神明町", "Shinmeicho"], ["愛宕町", "Atagocho"],
    ["桜田町", "Sakuradacho"], ["西久保", "Nishikubo"], ["飯倉", "Iikura"],
    ["三島町", "Mishimacho"], ["新堀町", "Shinboricho"], ["浜崎町", "Hamazakicho"],
    ["露月町", "Rogetsucho"], ["宮本町", "Miyamotocho"], ["栄町", "Sakaecho"],
    ["新網町", "Shinamicho"], ["烏森", "Karasumori"], ["田村町", "Tamuracho"],
  ]},
  { c: "Azabu", dc: -2, dr: 4, n: [
    ["飯倉町", "Iikuracho"], ["狸穴町", "Mamianacho"], ["市兵衛町", "Ichibeicho"],
    ["永坂町", "Nagasakacho"], ["東町", "Azumacho"], ["箪笥町", "Tansumachi"],
    ["新堀町", "Shinboricho"], ["宮村町", "Miyamuracho"], ["本村町", "Honmuracho"],
    ["田島町", "Tajimacho"], ["谷町", "Tanimachi"], ["今井町", "Imaicho"],
    ["龍土町", "Ryudocho"], ["材木町", "Zaimokucho"], ["三河台町", "Mikawadaicho"],
    ["霞町", "Kasumicho"], ["北日ヶ窪町", "Kitahigakubocho"], ["桜田町", "Sakuradacho"],
    ["広尾町", "Hiroocho"], ["盛岡町", "Moriokacho"], ["笄町", "Kogaicho"],
    ["六本木町", "Roppongicho"], ["鳥居坂町", "Toriizakacho"], ["我善坊町", "Gazenbocho"],
  ]},
  { c: "Akasaka", dc: -2, dr: 2, n: [
    ["赤坂", "Akasaka"], ["溜池町", "Tameikecho"], ["田町", "Tamachi"],
    ["新町", "Shinmachi"], ["檜町", "Hinokicho"], ["氷川町", "Hikawacho"],
    ["榎坂町", "Enokizakacho"], ["葵町", "Aoicho"], ["福吉町", "Fukuyoshicho"],
    ["丹後町", "Tangocho"], ["表町", "Omotecho"], ["裏町", "Uracho"],
    ["一ツ木町", "Hitotsugicho"], ["青山", "Aoyama"], ["北青山", "Kitaaoyama"],
    ["高樹町", "Takagicho"], ["南町", "Minamicho"], ["台町", "Daimachi"],
    ["新坂町", "Shinzakacho"], ["山王町", "Sannocho"], ["伝馬町", "Tenmacho"],
  ]},
  // ===================== Shinjuku (四谷区 / 牛込区 / 淀橋区) =====================
  { c: "Yotsuya", dc: -3, dr: -1, n: [
    ["四谷", "Yotsuya"], ["塩町", "Shiomachi"], ["伝馬町", "Tenmacho"],
    ["忍町", "Shinobicho"], ["仲町", "Nakacho"], ["箪笥町", "Tansumachi"],
    ["北伊賀町", "Kitaigacho"], ["南伊賀町", "Minamiigacho"], ["愛住町", "Aizumicho"],
    ["三栄町", "Saneicho"], ["左門町", "Samoncho"], ["須賀町", "Sugacho"],
    ["信濃町", "Shinanomachi"], ["南元町", "Minamimotomachi"], ["大番町", "Obancho"],
    ["内藤新宿", "Naitoshinjuku"], ["旭町", "Asahicho"], ["永住町", "Eijucho"],
    ["坂町", "Sakamachi"], ["本塩町", "Honshiocho"], ["荒木町", "Arakicho"],
    ["市谷", "Ichigaya"], ["片町", "Katamachi"], ["元鮫河橋町", "Motosamegabashicho"],
  ]},
  { c: "Ushigome", dc: -3, dr: -3, n: [
    ["牛込", "Ushigome"], ["神楽坂", "Kagurazaka"], ["矢来町", "Yaraicho"],
    ["改代町", "Kaitaicho"], ["天神町", "Tenjincho"], ["榎町", "Enokicho"],
    ["弁天町", "Bentencho"], ["原町", "Haramachi"], ["早稲田", "Waseda"],
    ["馬場下町", "Babashitacho"], ["喜久井町", "Kikuicho"], ["築土八幡町", "Tsukudohachimancho"],
    ["払方町", "Haraikatamachi"], ["納戸町", "Nandomachi"], ["細工町", "Saikumachi"],
    ["箪笥町", "Tansumachi"], ["岩戸町", "Iwatocho"], ["横寺町", "Yokoteramachi"],
    ["袋町", "Fukuromachi"], ["白銀町", "Shirogamecho"], ["赤城元町", "Akagimotomachi"],
    ["市谷加賀町", "Ichigayakagacho"], ["市谷柳町", "Ichigayayanagicho"], ["若松町", "Wakamatsucho"],
  ]},
  { c: "Yodobashi", dc: -8, dr: -1, n: [
    ["角筈", "Tsunohazu"], ["柏木", "Kashiwagi"], ["淀橋", "Yodobashi"],
    ["十二社", "Junisha"], ["諏訪町", "Suwacho"], ["大久保", "Okubo"],
    ["百人町", "Hyakunincho"], ["戸塚", "Totsuka"], ["諏訪", "Suwa"],
    ["源兵衛", "Genbei"], ["西大久保", "Nishiokubo"], ["東大久保", "Higashiokubo"],
    ["戸山", "Toyama"], ["下落合", "Shimoochiai"], ["上落合", "Kamiochiai"],
    ["葛ヶ谷", "Kuzugaya"], ["小滝橋", "Kotakibashi"], ["成子", "Naruko"],
  ]},
  // ===================== Bunkyo (小石川区 / 本郷区) =====================
  { c: "Koishikawa", dc: -2, dr: -4, n: [
    ["小石川", "Koishikawa"], ["指ヶ谷町", "Sashigayacho"], ["竹早町", "Takehayacho"],
    ["大塚", "Otsuka"], ["小日向", "Kohinata"], ["水道町", "Suidocho"],
    ["関口", "Sekiguchi"], ["音羽", "Otowa"], ["雑司ヶ谷", "Zoshigaya"],
    ["茗荷谷", "Myogadani"], ["林町", "Hayashicho"], ["原町", "Haramachi"],
    ["白山", "Hakusan"], ["柳町", "Yanagicho"], ["氷川下町", "Hikawashitacho"],
    ["大原町", "Oharacho"], ["久堅町", "Hisakatacho"], ["表町", "Omotecho"],
    ["餌差町", "Esashicho"], ["金富町", "Kanatomicho"], ["春日町", "Kasugacho"],
    ["西江戸川町", "Nishiedogawacho"], ["諏訪町", "Suwacho"], ["駕籠町", "Kagocho"],
  ]},
  { c: "Hongo", dc: 0, dr: -4, n: [
    ["本郷", "Hongo"], ["湯島", "Yushima"], ["切通町", "Kiridoshicho"],
    ["真砂町", "Masagocho"], ["丸山新町", "Maruyamashinmachi"], ["菊坂町", "Kikuzakacho"],
    ["森川町", "Morikawacho"], ["弓町", "Yumicho"], ["元町", "Motomachi"],
    ["春木町", "Harukicho"], ["駒込", "Komagome"], ["千駄木", "Sendagi"],
    ["根津", "Nezu"], ["向ヶ岡", "Mukogaoka"], ["追分町", "Oiwakecho"],
    ["蓬莱町", "Horaicho"], ["台町", "Daimachi"], ["曙町", "Akebonocho"],
    ["林町", "Hayashicho"], ["動坂町", "Dozakacho"], ["片町", "Katamachi"],
    ["西片町", "Nishikatamachi"], ["天神町", "Tenjincho"], ["龍岡町", "Tatsuokacho"],
  ]},
  // ===================== Taito (下谷区 / 浅草区) =====================
  { c: "Shitaya", dc: 2, dr: -6, n: [
    ["上野", "Ueno"], ["御徒町", "Okachimachi"], ["長者町", "Chojamachi"],
    ["車坂町", "Kurumazakacho"], ["練塀町", "Neribeicho"], ["竹町", "Takecho"],
    ["仲御徒町", "Nakaokachimachi"], ["西黒門町", "Nishikuromoncho"], ["東黒門町", "Higashikuromoncho"],
    ["広小路", "Hirokoji"], ["池之端", "Ikenohata"], ["茅町", "Kayacho"],
    ["谷中", "Yanaka"], ["上根岸", "Kaminegishi"], ["下根岸", "Shimonegishi"],
    ["金杉", "Kanasugi"], ["坂本", "Sakamoto"], ["龍泉寺町", "Ryusenjicho"],
    ["三ノ輪", "Minowa"], ["入谷町", "Iriyacho"], ["北稲荷町", "Kitainaricho"],
    ["万年町", "Mannencho"], ["山伏町", "Yamabushicho"], ["御成街道", "Onarikaido"],
  ]},
  { c: "Asakusa", dc: 4, dr: -7, n: [
    ["浅草", "Asakusa"], ["象潟", "Kisakata"], ["田原町", "Tawaramachi"],
    ["駒形", "Komagata"], ["並木町", "Namikicho"], ["材木町", "Zaimokucho"],
    ["三間町", "Sangencho"], ["蔵前", "Kuramae"], ["西鳥越町", "Nishitorigoecho"],
    ["鳥越", "Torigoe"], ["三筋町", "Misujicho"], ["小島町", "Kojimacho"],
    ["猿屋町", "Saruyacho"], ["瓦町", "Kawaracho"], ["北馬道町", "Kitaumamichicho"],
    ["聖天町", "Shotencho"], ["山谷", "Sanya"], ["今戸", "Imado"],
    ["橋場", "Hashiba"], ["千束町", "Senzokucho"], ["龍泉寺町", "Ryusenjicho"],
    ["馬道", "Umamichi"], ["花川戸", "Hanakawado"], ["諏訪町", "Suwacho"],
  ]},
  // ===================== Sumida (本所区 / 向島区) =====================
  { c: "Honjo", dc: 5, dr: -4, n: [
    ["本所", "Honjo"], ["緑町", "Midoricho"], ["菊川町", "Kikukawacho"],
    ["林町", "Hayashicho"], ["亀沢町", "Kamezawacho"], ["相生町", "Aioicho"],
    ["徳右衛門町", "Tokuemoncho"], ["北二葉町", "Kitafutabacho"], ["松井町", "Matsuicho"],
    ["番場町", "Bambacho"], ["石原町", "Ishiwaracho"], ["横網町", "Yokoamicho"],
    ["三笠町", "Mikasacho"], ["厩橋", "Umayabashi"], ["花町", "Hanacho"],
    ["錦糸町", "Kinshicho"], ["太平町", "Taiheicho"], ["江東橋", "Kotobashi"],
    ["茅場町", "Kayabacho"], ["柳島町", "Yanagishimacho"], ["業平橋", "Narihirabashi"],
  ]},
  { c: "Mukojima", dc: 5, dr: -6, n: [
    ["向島", "Mukojima"], ["寺島町", "Terajimacho"], ["吾嬬町", "Azumacho"],
    ["請地町", "Ujicho"], ["小梅町", "Koumecho"], ["須崎町", "Suzakicho"],
    ["中ノ郷", "Nakanogo"], ["押上町", "Oshiagecho"], ["隅田町", "Sumidacho"],
    ["玉ノ井", "Tamanoi"], ["京島", "Kyojima"], ["善左衛門", "Zenzaemon"],
    ["秋葉", "Akiba"], ["大畑", "Ohata"], ["地引", "Jibiki"],
  ]},
  // ===================== Koto (深川区 / 城東区) =====================
  { c: "Fukagawa", dc: 5, dr: 0, n: [
    ["深川", "Fukagawa"], ["佐賀町", "Sagacho"], ["福住町", "Fukuzumicho"],
    ["永代", "Eitai"], ["門前仲町", "Monzennakacho"], ["黒江町", "Kuroecho"],
    ["冬木町", "Fuyukicho"], ["木場", "Kiba"], ["平野町", "Hiranocho"],
    ["扇橋", "Ogibashi"], ["猿江", "Sarue"], ["高橋", "Takabashi"],
    ["森下町", "Morishitacho"], ["常盤町", "Tokiwacho"], ["万年町", "Mannencho"],
    ["清住町", "Kiyozumicho"], ["白河", "Shirakawa"], ["三好町", "Miyoshicho"],
    ["越中島", "Etchujima"], ["枝川町", "Edagawacho"], ["古石場", "Furuishiba"],
    ["洲崎", "Susaki"], ["東陽", "Toyo"], ["塩浜", "Shiohama"],
  ]},
  { c: "Joto", dc: 8, dr: 0, n: [
    ["亀戸", "Kameido"], ["大島町", "Ojimacho"], ["砂町", "Sunamachi"],
    ["小名木川", "Onagigawa"], ["北砂町", "Kitasunamachi"], ["南砂町", "Minamisunamachi"],
    ["東砂", "Higashisuna"], ["新砂", "Shinsuna"], ["千田", "Senda"],
    ["石島", "Ishijima"], ["北砂", "Kitasuna"], ["平井", "Hirai"],
  ]},
  // ===================== Shinagawa / Ebara =====================
  { c: "Shinagawa", dc: 2, dr: 8, n: [
    ["品川", "Shinagawa"], ["北品川", "Kitashinagawa"], ["南品川", "Minamishinagawa"],
    ["東品川", "Higashishinagawa"], ["大井", "Oi"], ["大崎", "Osaki"],
    ["御殿山", "Gotenyama"], ["北馬場", "Kitababa"], ["南馬場", "Minamibaba"],
    ["二日五日市町", "Futsukaitsukaichicho"], ["北浜川", "Kitahamakawa"], ["鮫洲", "Samezu"],
    ["立会川", "Tachiaigawa"], ["桐ヶ谷", "Kirigaya"], ["戸越", "Togoshi"],
    ["平塚", "Hiratsuka"], ["小山", "Koyama"], ["荏原", "Ebara"],
    ["中延", "Nakanobu"], ["旗ヶ岡", "Hatagaoka"], ["豊町", "Yutakacho"],
  ]},
  // ===================== Meguro =====================
  { c: "Meguro", dc: -2, dr: 7, n: [
    ["目黒", "Meguro"], ["三田", "Mita"], ["中目黒", "Nakameguro"],
    ["上目黒", "Kamimeguro"], ["下目黒", "Shimomeguro"], ["碑文谷", "Himonya"],
    ["衾", "Fusuma"], ["大岡山", "Ookayama"], ["緑が丘", "Midorigaoka"],
    ["祐天寺", "Yutenji"], ["駒場", "Komaba"], ["柿の木坂", "Kakinokizaka"],
    ["鷹番", "Takaban"], ["清水", "Shimizu"], ["原町", "Haramachi"],
    ["五本木", "Gohongi"], ["月光町", "Gekkocho"], ["三谷", "Sanya"],
  ]},
  // ===================== Ota (大森区 / 蒲田区) =====================
  { c: "Omori", dc: 3, dr: 12, n: [
    ["大森", "Omori"], ["入新井", "Iriarai"], ["新井宿", "Araijuku"],
    ["不入斗", "Iriyamazu"], ["馬込", "Magome"], ["池上", "Ikegami"],
    ["雪ヶ谷", "Yukigaya"], ["調布", "Chofu"], ["田園調布", "Denenchofu"],
    ["蒲田", "Kamata"], ["女塚", "Onazuka"], ["御園", "Misono"],
    ["道塚", "Michizuka"], ["矢口", "Yaguchi"], ["六郷", "Rokugo"],
    ["羽田", "Haneda"], ["糀谷", "Kojiya"], ["大森海岸", "Omorikaigan"],
    ["山王", "Sanno"], ["久が原", "Kugahara"], ["嶺町", "Minemachi"],
  ]},
  // ===================== Shibuya (渋谷区) =====================
  { c: "Shibuya", dc: -6, dr: 4, n: [
    ["渋谷", "Shibuya"], ["宮益", "Miyamasu"], ["道玄坂", "Dogenzaka"],
    ["桜丘", "Sakuragaoka"], ["上智町", "Uechicho"], ["神南", "Jinnan"],
    ["代々木", "Yoyogi"], ["千駄ヶ谷", "Sendagaya"], ["穏田", "Onden"],
    ["原宿", "Harajuku"], ["竹下町", "Takeshitacho"], ["神宮前", "Jingumae"],
    ["広尾", "Hiroo"], ["恵比寿", "Ebisu"], ["豊沢", "Toyosawa"],
    ["伊達町", "Datecho"], ["中通", "Nakadori"], ["美竹町", "Mitakecho"],
    ["大向", "Omukai"], ["上通", "Kamidori"], ["八幡通", "Hachimandori"],
  ]},
  // ===================== Toshima (豊島区) =====================
  { c: "Toshima", dc: -6, dr: -6, n: [
    ["池袋", "Ikebukuro"], ["巣鴨", "Sugamo"], ["駒込", "Komagome"],
    ["雑司ヶ谷", "Zoshigaya"], ["高田", "Takada"], ["長崎", "Nagasaki"],
    ["椎名町", "Shiinamachi"], ["要町", "Kanamecho"], ["上り屋敷", "Agariyashiki"],
    ["西巣鴨", "Nishisugamo"], ["日ノ出町", "Hinodecho"], ["金井窪", "Kanaikubo"],
    ["千早町", "Chihayacho"], ["堀ノ内", "Horinouchi"], ["田端", "Tabata"],
  ]},
  // ===================== Kita (滝野川区 / 王子区) =====================
  { c: "Oji", dc: 0, dr: -9, n: [
    ["王子", "Oji"], ["滝野川", "Takinogawa"], ["田端", "Tabata"],
    ["西ヶ原", "Nishigahara"], ["中里", "Nakazato"], ["上中里", "Kaminakazato"],
    ["飛鳥山", "Asukayama"], ["豊島", "Toshima"], ["堀船", "Horifune"],
    ["神谷", "Kamiya"], ["岩淵", "Iwabuchi"], ["稲付", "Inatsuke"],
    ["赤羽", "Akabane"], ["志茂", "Shimo"], ["十条", "Jujo"],
  ]},
  // ===================== Arakawa (荒川区) =====================
  { c: "Arakawa", dc: 3, dr: -9, n: [
    ["南千住", "Minamisenju"], ["三河島", "Mikawashima"], ["町屋", "Machiya"],
    ["尾久", "Ogu"], ["日暮里", "Nippori"], ["谷中本", "Yanakahon"],
    ["三ノ輪", "Minowa"], ["金杉", "Kanasugi"], ["箕輪", "Minowa"],
    ["小台", "Odai"], ["船方", "Funakata"], ["西尾久", "Nishiogu"],
  ]},
  // ===================== Adachi / Senju (足立区) =====================
  { c: "Senju", dc: 3, dr: -12, n: [
    ["千住", "Senju"], ["北千住", "Kitasenju"], ["小菅", "Kosuge"],
    ["綾瀬", "Ayase"], ["梅田", "Umeda"], ["五反野", "Gotanno"],
    ["西新井", "Nishiarai"], ["興野", "Okino"], ["関原", "Sekibara"],
    ["本木", "Motoki"], ["竹ノ塚", "Takenotsuka"], ["伊興", "Iko"],
    ["保木間", "Hokima"], ["花畑", "Hanahata"], ["舎人", "Toneri"],
  ]},
  // ===================== Katsushika (葛飾区) =====================
  { c: "Katsushika", dc: 8, dr: -8, n: [
    ["亀有", "Kameari"], ["金町", "Kanamachi"], ["柴又", "Shibamata"],
    ["立石", "Tateishi"], ["青砥", "Aoto"], ["堀切", "Horikiri"],
    ["四ツ木", "Yotsugi"], ["新宿", "Niijuku"], ["小菅", "Kosuge"],
    ["奥戸", "Okudo"], ["高砂", "Takasago"], ["水元", "Mizumoto"],
    ["鎌倉", "Kamakura"], ["細田", "Hosoda"], ["白鳥", "Shiratori"],
  ]},
  // ===================== Edogawa (江戸川区) =====================
  { c: "Edogawa", dc: 9, dr: -3, n: [
    ["小岩", "Koiwa"], ["小松川", "Komatsugawa"], ["平井", "Hirai"],
    ["松江", "Matsue"], ["船堀", "Funabori"], ["葛西", "Kasai"],
    ["一之江", "Ichinoe"], ["瑞江", "Mizue"], ["鹿骨", "Shishibone"],
    ["篠崎", "Shinozaki"], ["西小岩", "Nishikoiwa"], ["東小松川", "Higashikomatsugawa"],
    ["下小岩", "Shimokoiwa"], ["逆井", "Sakasai"], ["今井", "Imai"],
  ]},
  // ===================== Itabashi (板橋区) =====================
  { c: "Itabashi", dc: -3, dr: -11, n: [
    ["板橋", "Itabashi"], ["上板橋", "Kamiitabashi"], ["下板橋", "Shimoitabashi"],
    ["志村", "Shimura"], ["前野", "Maeno"], ["蓮根", "Hasune"],
    ["赤塚", "Akatsuka"], ["徳丸", "Tokumaru"], ["成増", "Narimasu"],
    ["小豆沢", "Azusawa"], ["中台", "Nakadai"], ["常盤台", "Tokiwadai"],
    ["双葉町", "Futabacho"], ["大谷口", "Oyaguchi"], ["稲荷台", "Inaridai"],
  ]},
  // ===================== Nakano (中野区) =====================
  { c: "Nakano", dc: -11, dr: -1, n: [
    ["中野", "Nakano"], ["本郷", "Hongo"], ["新井", "Arai"],
    ["上高田", "Kamitakada"], ["江古田", "Egota"], ["沼袋", "Numabukuro"],
    ["野方", "Nogata"], ["鷺宮", "Saginomiya"], ["丸山", "Maruyama"],
    ["上鷺宮", "Kamisaginomiya"], ["大和町", "Yamatocho"], ["雑色", "Zoshiki"],
    ["囲町", "Kakoicho"], ["桃園町", "Momozonocho"], ["打越", "Uchikoshi"],
  ]},
  // ===================== Suginami (杉並区) =====================
  { c: "Suginami", dc: -15, dr: -1, n: [
    ["阿佐ヶ谷", "Asagaya"], ["高円寺", "Koenji"], ["荻窪", "Ogikubo"],
    ["和田堀", "Wadabori"], ["馬橋", "Mabashi"], ["天沼", "Amanuma"],
    ["成宗", "Narimune"], ["井荻", "Iogi"], ["上井草", "Kamiigusa"],
    ["下井草", "Shimoigusa"], ["田端", "Tabata"], ["松庵", "Shoan"],
    ["久我山", "Kugayama"], ["高井戸", "Takaido"], ["永福", "Eifuku"],
  ]},
  // ===================== Setagaya (世田谷区) =====================
  { c: "Setagaya", dc: -10, dr: 4, n: [
    ["世田谷", "Setagaya"], ["三軒茶屋", "Sangenjaya"], ["太子堂", "Taishido"],
    ["若林", "Wakabayashi"], ["代田", "Daita"], ["北沢", "Kitazawa"],
    ["駒沢", "Komazawa"], ["上馬", "Kamiuma"], ["弦巻", "Tsurumaki"],
    ["桜新町", "Sakurashinmachi"], ["用賀", "Yoga"], ["奥沢", "Okusawa"],
    ["玉川", "Tamagawa"], ["瀬田", "Seta"], ["上野毛", "Kaminoge"],
    ["等々力", "Todoroki"], ["松原", "Matsubara"], ["経堂", "Kyodo"],
    ["砧", "Kinuta"], ["池尻", "Ikejiri"], ["豪徳寺", "Gotokuji"],
  ]},
  // ===================== Nerima (練馬区) =====================
  { c: "Nerima", dc: -9, dr: -9, n: [
    ["練馬", "Nerima"], ["上練馬", "Kaminerima"], ["中新井", "Nakaarai"],
    ["田柄", "Tagara"], ["石神井", "Shakujii"], ["上石神井", "Kamishakujii"],
    ["下石神井", "Shimoshakujii"], ["関", "Seki"], ["大泉", "Oizumi"],
    ["豊玉", "Toyotama"], ["貫井", "Nukui"], ["春日町", "Kasugacho"],
    ["谷原", "Yahara"], ["高松", "Takamatsu"], ["土支田", "Doshida"],
  ]},

  // ===================== Suburban Saitama =====================
  { c: "Urawa", dc: 1, dr: -17, n: [
    ["浦和", "Urawa"], ["常盤", "Tokiwa"], ["岸町", "Kishimachi"], ["仲町", "Nakamachi"],
    ["針ヶ谷", "Harigaya"], ["領家", "Ryoke"], ["木崎", "Kizaki"], ["三室", "Mimuro"],
    ["大門", "Daimon"], ["大谷場", "Oyaba"], ["別所", "Bessho"], ["道祖土", "Sairo"],
  ]},
  { c: "Omiya", dc: 0, dr: -22, n: [
    ["大宮", "Omiya"], ["高鼻", "Takahana"], ["寿能", "Juno"], ["土手町", "Dotemachi"],
    ["大成", "Onari"], ["三橋", "Mitsuhashi"], ["日進", "Nisshin"], ["宮原", "Miyahara"],
    ["植竹", "Uetake"], ["堀の内", "Horinouchi"], ["櫛引", "Kushibiki"],
  ]},
  { c: "Kawaguchi", dc: 2, dr: -16, n: [
    ["川口", "Kawaguchi"], ["栄町", "Sakaecho"], ["幸町", "Saiwaicho"], ["青木", "Aoki"],
    ["西川口", "Nishikawaguchi"], ["横曽根", "Yokozone"], ["芝", "Shiba"], ["安行", "Angyo"],
    ["鳩ヶ谷", "Hatogaya"], ["前川", "Maekawa"], ["神根", "Kane"],
  ]},
  { c: "Soka", dc: 5, dr: -16, n: [
    ["草加", "Soka"], ["谷塚", "Yatsuka"], ["松原", "Matsubara"], ["瀬崎", "Sezaki"],
    ["新田", "Shinden"], ["長栄", "Choei"], ["稲荷", "Inari"],
  ]},
  { c: "Koshigaya", dc: 6, dr: -18, n: [
    ["越谷", "Koshigaya"], ["大沢", "Osawa"], ["蒲生", "Gamo"], ["大袋", "Obukuro"],
    ["新方", "Niigata"], ["桜井", "Sakurai"], ["出羽", "Dewa"],
  ]},
  { c: "Wako-Asaka", dc: -8, dr: -14, n: [
    ["和光", "Wako"], ["白子", "Shirako"], ["新倉", "Niikura"], ["下新倉", "Shimoniikura"],
    ["朝霞", "Asaka"], ["膝折", "Hizaori"], ["浜崎", "Hamasaki"], ["溝沼", "Mizonuma"],
    ["根岸", "Negishi"], ["内間木", "Uchimagi"],
  ]},
  // ===================== Suburban Chiba =====================
  { c: "Ichikawa", dc: 11, dr: -1, n: [
    ["市川", "Ichikawa"], ["八幡", "Yawata"], ["真間", "Mama"], ["国府台", "Konodai"],
    ["中山", "Nakayama"], ["菅野", "Sugano"], ["鬼越", "Onigoe"], ["行徳", "Gyotoku"],
    ["南行徳", "Minamigyotoku"], ["妙典", "Myoden"], ["大野", "Ono"], ["曽谷", "Soya"],
  ]},
  { c: "Funabashi", dc: 14, dr: -3, n: [
    ["船橋", "Funabashi"], ["湊町", "Minatocho"], ["海神", "Kaijin"], ["葛飾", "Katsushika"],
    ["法典", "Hoten"], ["塚田", "Tsukada"], ["夏見", "Natsumi"], ["前原", "Maebaru"],
    ["二宮", "Ninomiya"], ["習志野台", "Narashinodai"], ["三山", "Miyama"],
  ]},
  { c: "Narashino", dc: 16, dr: 2, n: [
    ["津田沼", "Tsudanuma"], ["大久保", "Okubo"], ["鷺沼", "Saginuma"], ["谷津", "Yatsu"],
    ["袖ヶ浦", "Sodegaura"], ["久々田", "Kukuta"], ["藤崎", "Fujisaki"],
  ]},
  { c: "Matsudo", dc: 13, dr: -13, n: [
    ["松戸", "Matsudo"], ["小金", "Kogane"], ["馬橋", "Mabashi"], ["八ヶ崎", "Hachigasaki"],
    ["常盤平", "Tokiwadaira"], ["五香", "Goko"], ["六実", "Mutsumi"], ["高塚", "Takatsuka"],
    ["栗ヶ沢", "Kurigasawa"], ["根木内", "Negiuchi"],
  ]},
  { c: "Kashiwa-Nagareyama", dc: 14, dr: -14, n: [
    ["柏", "Kashiwa"], ["豊四季", "Toyoshiki"], ["増尾", "Masuo"], ["布施", "Fuse"],
    ["流山", "Nagareyama"], ["江戸川台", "Edogawadai"], ["南流山", "Minaminagareyama"],
    ["十太夫", "Judayu"], ["駒木", "Komaki"],
  ]},
  { c: "Urayasu", dc: 11, dr: 3, n: [
    ["浦安", "Urayasu"], ["当代島", "Todaijima"], ["猫実", "Nekozane"], ["堀江", "Horie"],
    ["富岡", "Tomioka"], ["北栄", "Kitazakae"], ["今川", "Imagawa"],
  ]},
  // ===================== Suburban Kanagawa =====================
  { c: "Yokohama", dc: -1, dr: 21, n: [
    ["関内", "Kannai"], ["伊勢佐木町", "Isezakicho"], ["野毛", "Noge"], ["山下町", "Yamashitacho"],
    ["本牧", "Honmoku"], ["神奈川", "Kanagawa"], ["子安", "Koyasu"], ["東神奈川", "Higashikanagawa"],
    ["反町", "Tanmachi"], ["六角橋", "Rokkakubashi"], ["白楽", "Hakuraku"], ["磯子", "Isogo"],
  ]},
  { c: "Tsurumi", dc: -3, dr: 19, n: [
    ["鶴見", "Tsurumi"], ["生麦", "Namamugi"], ["潮田", "Ushioda"], ["矢向", "Yako"],
    ["鶴見市場", "Tsurumiichiba"], ["菅沢", "Sugesawa"], ["馬場", "Baba"],
  ]},
  { c: "Kawasaki", dc: 1, dr: 17, n: [
    ["川崎", "Kawasaki"], ["砂子", "Isago"], ["堀之内", "Horinouchi"], ["田島", "Tajima"],
    ["渡田", "Watarida"], ["大師", "Daishi"], ["池上", "Ikegami"], ["観音", "Kannon"],
    ["大島", "Oshima"], ["御幸", "Miyuki"], ["小田", "Oda"],
  ]},
  { c: "Kohoku", dc: -5, dr: 18, n: [
    ["篠原", "Shinohara"], ["大豆戸", "Mamedo"], ["菊名", "Kikuna"], ["大倉山", "Okurayama"],
    ["妙蓮寺", "Myorenji"], ["岸根", "Kishine"], ["日吉", "Hiyoshi"], ["綱島", "Tsunashima"],
  ]},
  { c: "Nakahara", dc: -6, dr: 15, n: [
    ["小杉", "Kosugi"], ["今井", "Imai"], ["上丸子", "Kamimaruko"], ["木月", "Kizuki"],
    ["元住吉", "Motosumiyoshi"], ["苅宿", "Kariyado"], ["新城", "Shinjo"],
  ]},
  // ===================== Tama (west) =====================
  { c: "Mitaka", dc: -19, dr: 1, n: [
    ["三鷹", "Mitaka"], ["上連雀", "Kamirenjaku"], ["下連雀", "Shimorenjaku"], ["井口", "Inokuchi"],
    ["牟礼", "Mure"], ["新川", "Shinkawa"], ["大沢", "Osawa"], ["野崎", "Nozaki"], ["北野", "Kitano"],
  ]},
  { c: "Chofu", dc: -17, dr: 4, n: [
    ["調布", "Chofu"], ["布田", "Fuda"], ["国領", "Kokuryo"], ["染地", "Somechi"],
    ["上石原", "Kamiishiwara"], ["下石原", "Shimoishiwara"], ["飛田給", "Tobitakyu"],
    ["仙川", "Sengawa"], ["柴崎", "Shibasaki"], ["深大寺", "Jindaiji"],
  ]},
  { c: "Fuchu", dc: -20, dr: 5, n: [
    ["府中", "Fuchu"], ["宮町", "Miyamachi"], ["是政", "Koremasa"], ["分倍", "Bubai"],
    ["本宿", "Honjuku"], ["西府", "Nishifu"], ["八幡宿", "Hachimanjuku"], ["押立", "Oshitate"],
    ["新町", "Shinmachi"], ["四谷", "Yotsuya"],
  ]},
  { c: "Koganei-Kokubunji", dc: -22, dr: -3, n: [
    ["小金井", "Koganei"], ["貫井", "Nukui"], ["前原", "Maehara"], ["緑町", "Midoricho"],
    ["国分寺", "Kokubunji"], ["本多", "Honda"], ["恋ヶ窪", "Koigakubo"], ["戸倉", "Tokura"],
    ["西元町", "Nishimotomachi"], ["東元町", "Higashimotomachi"],
  ]},
  { c: "Tachikawa-Kunitachi", dc: -24, dr: 2, n: [
    ["立川", "Tachikawa"], ["柴崎", "Shibasaki"], ["錦町", "Nishikicho"], ["曙町", "Akebonocho"],
    ["砂川", "Sunagawa"], ["国立", "Kunitachi"], ["谷保", "Yaho"], ["青柳", "Aoyagi"],
    ["富士見台", "Fujimidai"],
  ]},
  { c: "Tanashi-Hoya", dc: -18, dr: -5, n: [
    ["田無", "Tanashi"], ["谷戸", "Yato"], ["芝久保", "Shibakubo"], ["向台", "Mukodai"],
    ["保谷", "Hoya"], ["東伏見", "Higashifushimi"], ["泉町", "Izumicho"], ["柳沢", "Yagisawa"],
  ]},
  // ===================== Tama (south) =====================
  { c: "Machida", dc: -16, dr: 13, n: [
    ["町田", "Machida"], ["原町田", "Haramachida"], ["木曽", "Kiso"], ["本町田", "Honmachida"],
    ["成瀬", "Naruse"], ["鶴川", "Tsurukawa"], ["小山", "Oyama"], ["金井", "Kanai"],
    ["玉川学園", "Tamagawagakuen"], ["森野", "Morino"],
  ]},
  { c: "Inagi-Noborito", dc: -14, dr: 11, n: [
    ["稲城", "Inagi"], ["矢野口", "Yanokuchi"], ["押立", "Oshitate"], ["大丸", "Omaru"],
    ["登戸", "Noborito"], ["宿河原", "Shukugawara"], ["中野島", "Nakanoshima"], ["菅", "Suge"],
  ]},
  { c: "Mizonokuchi", dc: -11, dr: 12, n: [
    ["溝口", "Mizonokuchi"], ["二子", "Futako"], ["久地", "Kuji"], ["梶ヶ谷", "Kajigaya"],
    ["高津", "Takatsu"], ["下作延", "Shimosakunobe"], ["末長", "Suenaga"],
  ]},

  // ===================== Outer rim: neighboring-prefecture towns =====================
  // (sparse far edges — old county towns & villages of the 1920s–50s)
  { c: "Omiya-Ageo", dc: 0, dr: -22, n: [
    ["大宮", "Omiya"], ["上尾", "Ageo"], ["原市", "Haraichi"], ["平方", "Hirakata"],
    ["大石", "Oishi"], ["与野", "Yono"], ["大久保", "Okubo"], ["馬宮", "Umamiya"],
  ]},
  { c: "Kasukabe", dc: 7, dr: -21, n: [
    ["粕壁", "Kasukabe"], ["武里", "Takesato"], ["豊春", "Toyoharu"],
    ["幸松", "Yukimatsu"], ["内牧", "Uchimaki"], ["八木崎", "Yagisaki"],
  ]},
  { c: "Kawagoe-Hanno", dc: -16, dr: -19, n: [
    ["川越", "Kawagoe"], ["仙波", "Senba"], ["古谷", "Furuya"], ["飯能", "Hanno"],
    ["原市場", "Haraichiba"], ["高麗", "Koma"], ["豊岡", "Toyooka"], ["金子", "Kaneko"],
    ["宮寺", "Miyadera"], ["元加治", "Motokaji"], ["精明", "Seimei"],
  ]},
  { c: "Sayama-Iruma", dc: -20, dr: -15, n: [
    ["狭山", "Sayama"], ["入間川", "Irumagawa"], ["奥富", "Okutomi"], ["水富", "Mizutomi"],
    ["入間", "Iruma"], ["新座", "Niiza"], ["野火止", "Nobidome"], ["片山", "Katayama"],
  ]},
  { c: "Moriya-Toride", dc: 16, dr: -16, n: [
    ["守谷", "Moriya"], ["取手", "Toride"], ["戸頭", "Togashira"], ["寺原", "Terahara"],
    ["高井", "Takai"], ["小文間", "Omonma"], ["稲戸井", "Inatoi"], ["大野", "Ono"],
  ]},
  { c: "Tsukuba", dc: 19, dr: -20, n: [
    ["谷田部", "Yatabe"], ["桜", "Sakura"], ["大穂", "Oho"], ["豊里", "Toyosato"],
    ["茎崎", "Kukizaki"], ["高野", "Takano"], ["上郷", "Kamigo"], ["島名", "Shimana"],
  ]},
  { c: "Inzai", dc: 19, dr: -6, n: [
    ["印西", "Inzai"], ["木下", "Kioroshi"], ["大森", "Omori"], ["船尾", "Funao"],
    ["平岡", "Hiraoka"], ["別所", "Bessho"], ["鎌ヶ谷", "Kamagaya"], ["白井", "Shiroi"],
  ]},
  { c: "Boso-coast", dc: 16, dr: 16, n: [
    ["木更津", "Kisarazu"], ["君津", "Kimitsu"], ["富津", "Futtsu"], ["袖ヶ浦", "Sodegaura"],
    ["市原", "Ichihara"], ["八幡", "Yawata"], ["長浦", "Nagaura"], ["蔵波", "Kuranami"],
    ["青堀", "Aobori"], ["大貫", "Onuku"], ["五井", "Goi"], ["姉崎", "Anesaki"],
  ]},
  { c: "Chiba-coast", dc: 19, dr: 7, n: [
    ["蘇我", "Soga"], ["千葉", "Chiba"], ["寒川", "Samukawa"], ["登戸", "Nobuto"],
    ["都賀", "Tsuga"], ["浜野", "Hamano"],
  ]},
  { c: "Sagami", dc: -19, dr: 18, n: [
    ["相模原", "Sagamihara"], ["上溝", "Kamimizo"], ["淵野辺", "Fuchinobe"], ["田名", "Tana"],
    ["当麻", "Taima"], ["海老名", "Ebina"], ["国分", "Kokubu"], ["河原口", "Kawaraguchi"],
    ["大和", "Yamato"], ["厚木", "Atsugi"], ["妻田", "Tsumada"], ["林", "Hayashi"],
  ]},
  // ===== v0.5 periphery extensions: pre-war towns & 大字 (village) names =====
  { c: "Hachioji", dc: -25, dr: 8, n: [
    ["八日町", "Yokamachi"], ["元横山", "Motoyokoyama"], ["千人町", "Senninmachi"],
    ["散田", "Sanda"], ["長房", "Nagafusa"], ["高尾", "Takao"], ["小宮", "Komiya"],
    ["大和田", "Owada"], ["北野", "Kitano"], ["打越", "Uchikoshi"], ["片倉", "Katakura"],
    ["由井", "Yui"], ["恩方", "Ongata"], ["加住", "Kasumi"], ["元八王子", "Motohachioji"],
    ["堀之内", "Horinouchi"], ["鑓水", "Yarimizu"], ["下柚木", "Shimoyugi"],
  ]},
  { c: "Hino-Tama", dc: -22, dr: 9, n: [
    ["日野", "Hino"], ["豊田", "Toyoda"], ["百草", "Mogusa"], ["落川", "Ochikawa"],
    ["平山", "Hirayama"], ["南平", "Minamidaira"], ["高幡", "Takahata"], ["万願寺", "Manganji"],
    ["程久保", "Hodokubo"], ["三沢", "Misawa"], ["関戸", "Sekido"], ["連光寺", "Renkoji"],
    ["貝取", "Kaidori"], ["乞田", "Kotta"], ["唐木田", "Karakida"], ["永山", "Nagayama"],
  ]},
  { c: "Ome-Fussa", dc: -24, dr: -10, n: [
    ["青梅", "Ome"], ["河辺", "Kabe"], ["千ヶ瀬", "Chigase"], ["長淵", "Nagabuchi"],
    ["羽村", "Hamura"], ["福生", "Fussa"], ["熊川", "Kumagawa"], ["拝島", "Haijima"],
    ["昭島", "Akishima"], ["中神", "Nakagami"], ["郷地", "Gochi"], ["砂川", "Sunagawa"],
    ["五日市", "Itsukaichi"], ["引田", "Hikida"], ["油平", "Aburadai"], ["平沢", "Hirasawa"],
  ]},
  { c: "Kitatama", dc: -18, dr: -12, n: [
    ["久米川", "Kumegawa"], ["廻田", "Megurita"], ["野口", "Noguchi"], ["秋津", "Akitsu"],
    ["恩多", "Onta"], ["萩山", "Hagiyama"], ["小平", "Kodaira"], ["大沼", "Onuma"],
    ["清瀬", "Kiyose"], ["野塩", "Noshio"], ["竹丘", "Takeoka"], ["久留米", "Kurume"],
    ["前沢", "Maezawa"], ["南沢", "Minamizawa"], ["滝山", "Takiyama"], ["柳窪", "Yanagikubo"],
  ]},
  { c: "Ageo-Konosu", dc: -2, dr: -25, n: [
    ["上尾", "Ageo"], ["桶川", "Okegawa"], ["北本", "Kitamoto"], ["鴻巣", "Konosu"],
    ["吹上", "Fukiage"], ["加納", "Kano"], ["川田谷", "Kawatagaya"], ["原市", "Haraichi"],
    ["平方", "Hirakata"], ["伊奈", "Ina"], ["小室", "Komuro"], ["蓮田", "Hasuda"],
    ["白岡", "Shiraoka"], ["久喜", "Kuki"], ["菖蒲", "Shobu"], ["騎西", "Kisai"],
  ]},
  { c: "Noda-Sekiyado", dc: 10, dr: -23, n: [
    ["野田", "Noda"], ["堤台", "Tsutsumidai"], ["中根", "Nakane"], ["七光台", "Nanakodai"],
    ["川間", "Kawama"], ["関宿", "Sekiyado"], ["木間ケ瀬", "Kimagase"], ["二川", "Futakawa"],
    ["岩井", "Iwai"], ["猿島", "Sashima"], ["水海道", "Mitsukaido"], ["石下", "Ishige"],
    ["藤代", "Fujishiro"], ["龍ケ崎", "Ryugasaki"], ["牛久", "Ushiku"], ["布佐", "Fusa"],
  ]},
  { c: "Sakura-Yachiyo", dc: 22, dr: -3, n: [
    ["佐倉", "Sakura"], ["臼井", "Usui"], ["志津", "Shizu"], ["米本", "Yonamoto"],
    ["実籾", "Mimomi"], ["幕張", "Makuhari"], ["検見川", "Kemigawa"], ["稲毛", "Inage"],
    ["黒砂", "Kurosuna"], ["作草部", "Sakusabe"], ["四街道", "Yotsukaido"], ["物井", "Monoi"],
    ["酒々井", "Shisui"], ["宗吾", "Sogo"], ["公津", "Kozu"], ["三山", "Miyama"],
  ]},
  { c: "Kazusa", dc: 21, dr: 15, n: [
    ["巌根", "Iwane"], ["八幡宿", "Yawatajuku"], ["曽我野", "Sogano"], ["生浜", "Oihama"],
    ["誉田", "Honda"], ["鎌取", "Kamatori"], ["土気", "Toke"], ["大網", "Oami"],
    ["東金", "Togane"], ["茂原", "Mobara"], ["白子", "Shirako"], ["本納", "Honno"],
  ]},
  { c: "Shonan", dc: -8, dr: 24, n: [
    ["鎌倉", "Kamakura"], ["大船", "Ofuna"], ["腰越", "Koshigoe"], ["片瀬", "Katase"],
    ["藤沢", "Fujisawa"], ["辻堂", "Tsujido"], ["茅ヶ崎", "Chigasaki"], ["平塚", "Hiratsuka"],
    ["大磯", "Oiso"], ["逗子", "Zushi"], ["葉山", "Hayama"], ["横須賀", "Yokosuka"],
    ["追浜", "Oppama"], ["田浦", "Taura"], ["久里浜", "Kurihama"], ["六浦", "Mutsuura"],
  ]},
  { c: "Atsugi-Zama", dc: -24, dr: 17, n: [
    ["座間", "Zama"], ["鶴間", "Tsuruma"], ["津久井", "Tsukui"], ["愛川", "Aikawa"],
    ["磯部", "Isobe"], ["下溝", "Shimomizo"], ["麻溝", "Asamizo"], ["新戸", "Shindo"],
    ["依知", "Echi"], ["荻野", "Ogino"], ["飯山", "Iiyama"], ["玉川", "Tamagawa"],
    ["煤ヶ谷", "Susugaya"], ["半原", "Hanbara"], ["田代", "Tashiro"], ["角田", "Sumida"],
  ]},
];

if (typeof window !== "undefined") window.TOKYO_MACHI = TOKYO_MACHI;
