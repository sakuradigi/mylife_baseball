/* ==========================================================================
   「我的野球人生」 (My Baseball Life) - Core Logic & Roll-First Dice Engine
   Version: EA 0.5 (Dice-Based Event Engine, Consumables, 30 Rarity-Tiered Gear,
   Dual-Currency Economy, Multi-Generation Legacy System, Regional Qualifiers)
   ========================================================================== */

(function () {
  'use strict';

  const APP_VERSION = 'EA 0.5';

  /* ==========================================================================
     1. PRNG (Mulberry32 Engine - 4.2 Billion Seeds)
     ========================================================================== */
  let SEED_STR = new URLSearchParams(location.search).get('seed') || Math.random().toString(36).slice(2, 10);
  let _seedState = 0;

  function seedInit(str) {
    SEED_STR = str;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    _seedState = h >>> 0;
  }

  function R() {
    _seedState |= 0;
    _seedState = (_seedState + 0x6d2b79f5) | 0;
    let t = Math.imul(_seedState ^ (_seedState >>> 15), 1 | _seedState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function ri(min, max) { return Math.floor(R() * (max - min + 1)) + min; }
  function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

  /* ==========================================================================
     2. Web Audio API
     ========================================================================== */
  let audioCtx = null;
  let soundEnabled = true;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playDiceSound() {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;
    try {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(400 + Math.random() * 400, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.start(); osc.stop(audioCtx.currentTime + 0.08);
        }, i * 60);
      }
    } catch (e) { }
  }

  /* 🏟️ 30 支大聯盟名門球隊與二三軍小聯盟梯隊 */
  const CPBL_TEAMS = ['台中象勇', '府城飛獅', '桃園狂猿', '味全赤龍', '新北悍將', '高雄鋼鷹'];
  const NPB_TEAMS = ['東京巨人', '關西猛虎', '濱海星光', '廣島赤鯉', '神宮疾燕', '名古屋青龍', '福岡金鷹', '千葉海鷗', '關西狂牛', '東北鷲王', '西武雄獅', '北海鬥士'];

  const MLB_30_TEAMS = [
    // 美聯 (AL)
    '紐約帝國', '波士頓赤襪', '多倫多藍鳥', '坦帕灣光芒', '巴爾的摩金鶯',
    '芝加哥白襪', '克里夫蘭守護者', '底特律老虎', '堪薩斯皇家', '明尼蘇達雙城',
    '洛城銀河', '休士頓太空王', '西雅圖水手', '奧克蘭運動家', '德州遊騎兵',
    // 國聯 (NL)
    '亞特蘭大勇士', '邁阿密馬林魚', '紐約大都會', '費城費城人', '華盛頓國民',
    '芝加哥幼熊', '辛辛那提紅人', '密爾瓦基釀酒人', '匹茲堡海盜', '聖路易紅雀',
    '洛城湛藍', '聖地牙哥修士', '舊金山巨龍', '亞利桑那響尾蛇', '科羅拉多落磯'
  ];

  const HS_TW_TEAMS = ['平鎮高中', '穀保家商', '高苑工商', '南英商工'];
  const HS_JP_TEAMS = ['大阪桐蔭', '智辯和歌山', '東海大相模', '橫濱高校'];
  const UNI_TW_TEAMS = ['文化大學', '國立體大', '開南大學', '北市大'];
  const UNI_JP_TEAMS = ['明治大學', '早稻田大學', '慶應義塾', '法政大學'];

  /* 多階梯隊定義 (Minor League Ladder) */
  const LEAGUES = {
    HS_TW: { n: '高中棒球(台灣黑豹旗)', par: 30, level: 0 },
    HS_JP: { n: '高中棒球(日本甲子園)', par: 34, level: 0 },
    UNI_TW: { n: '大專棒球聯賽(TW)', par: 38, level: 1 },
    UNI_JP: { n: '全日本大學選手權(JP)', par: 42, level: 1 },

    // CPBL 2階
    CPBL2: { n: '中職二軍', par: 40, level: 2, next: 'CPBL1', prev: null },
    CPBL1: { n: '中職一軍', par: 50, level: 3, next: null, prev: 'CPBL2' },

    // NPB 3階 (含育成三軍)
    NPB_IKUSEI: { n: '日職育成三軍', par: 42, level: 2, next: 'NPB2', prev: null },
    NPB2: { n: '日職二軍', par: 52, level: 3, next: 'NPB1', prev: 'NPB_IKUSEI' },
    NPB1: { n: '日職一軍', par: 62, level: 4, next: null, prev: 'NPB2' },

    // MLB 6階小聯盟
    MiLB_Rook: { n: '美職新人聯盟 (Rook)', par: 44, level: 2, next: 'MiLB_1A', prev: null },
    MiLB_1A: { n: '美職低階 1A (A)', par: 50, level: 3, next: 'MiLB_A_Plus', prev: 'MiLB_Rook' },
    MiLB_A_Plus: { n: '美職高階 1A (A+)', par: 55, level: 4, next: 'MiLB_2A', prev: 'MiLB_1A' },
    MiLB_2A: { n: '美職雙 A (2A)', par: 60, level: 5, next: 'MiLB_3A', prev: 'MiLB_A_Plus' },
    MiLB_3A: { n: '美職三 A (3A)', par: 65, level: 6, next: 'MLB', prev: 'MiLB_2A' },
    MLB: { n: '大聯盟 (MLB)', par: 72, level: 7, next: null, prev: 'MiLB_3A' }
  };

  /* ==========================================================================
     3. 80 種成就與球員稱號資料庫
     ========================================================================== */
  const ACHIEVEMENTS_LIST = [
    { id: 'ach_01', icon: '🏆', title: '【打擊王】', desc: '單季打擊率達到 .350 以上', titleReward: '稱號：打擊機器' },
    { id: 'ach_02', icon: '⚡', title: '【四成男神話】', desc: '單季打擊率達到 .400 神蹟', titleReward: '稱號：四成男' },
    { id: 'ach_03', icon: '🏏', title: '【四十轟巨砲】', desc: '單季擊出 40 支全壘打', titleReward: '稱號：四割砲手' },
    { id: 'ach_04', icon: '💥', title: '【五十轟大刀】', desc: '單季擊出 50 支全壘打', titleReward: '稱號：五十轟王' },
    { id: 'ach_05', icon: '👑', title: '【六十轟神話】', desc: '單季擊出 60 支全壘打傳承王貞治', titleReward: '稱號：傳奇巨砲' },
    { id: 'ach_06', icon: '🎯', title: '【打點收割機】', desc: '單季貢獻 120 分打點', titleReward: '稱號：打點專家' },
    { id: 'ach_07', icon: '🔥', title: '【打點怪物】', desc: '單季貢獻 150 分打點狂潮', titleReward: '稱號：打點怪物' },
    { id: 'ach_08', icon: '🏃', title: '【飛速快腿】', desc: '單季完成 30 次盜壘成功', titleReward: '稱號：快腿快客' },
    { id: 'ach_09', icon: '💨', title: '【神速盜壘王】', desc: '單季完成 50 次盜壘成功', titleReward: '稱號：神速盜王' },
    { id: 'ach_10', icon: '⚾', title: '【勝投王】', desc: '單季獲得 15 勝', titleReward: '稱號：王牌勝投' },
    { id: 'ach_11', icon: '👑', title: '【二十勝巨投】', desc: '單季獲得 20 勝傳奇巨投', titleReward: '稱號：二十勝投手' },
    { id: 'ach_12', icon: '🛡️', title: '【壓制防禦率王】', desc: '單季防禦率低於 2.00', titleReward: '稱號：壓制鎖爆' },
    { id: 'ach_13', icon: '✨', title: '【神鬼防禦率】', desc: '單季防禦率低於 1.50 神鬼極限', titleReward: '稱號：防禦鬼神' },
    { id: 'ach_14', icon: '🔒', title: '【絕望支配者】', desc: '單季 WHIP 低於 0.95', titleReward: '稱號：絕望支配者' },
    { id: 'ach_15', icon: '⚡', title: '【K9收割機】', desc: '單季飆出 200 次奪三振', titleReward: '稱號：三振王' },
    { id: 'ach_16', icon: '🔥', title: '【三振魔神】', desc: '單季飆出 300 次奪三振極限', titleReward: '稱號：三振魔神' },
    { id: 'ach_17', icon: '🛡️', title: '【終結者守護神】', desc: '單季獲得 30 次救援成功', titleReward: '稱號：守護神' },
    { id: 'ach_18', icon: '👑', title: '【神鬼救援】', desc: '單季獲得 45 次救援成功', titleReward: '稱號：關門守護星' },
    { id: 'ach_19', icon: '🦾', title: '【鐵臂鋼投】', desc: '單季完成 10 完投 5 完封', titleReward: '稱號：鐵臂王牌' },
    { id: 'ach_20', icon: '🚀', title: '【統治級打者】', desc: '單季整體攻擊指數 OPS 突破 1.100', titleReward: '稱號：打擊主宰' },
    { id: 'ach_21', icon: '⚾', title: '【千安俱樂部】', desc: '生涯累積擊出 1,000 支安打', titleReward: '稱號：千安打者' },
    { id: 'ach_22', icon: '🏆', title: '【兩千安名宿】', desc: '生涯累積擊出 2,000 支安打', titleReward: '稱號：兩千安名宿' },
    { id: 'ach_23', icon: '👑', title: '【三千安殿堂巨星】', desc: '生涯累積擊出 3,000 支安打', titleReward: '稱號：殿堂巨星' },
    { id: 'ach_24', icon: '🏏', title: '【百轟砲手】', desc: '生涯累積 150 支全壘打', titleReward: '稱號：百轟大砲' },
    { id: 'ach_25', icon: '💥', title: '【三百轟怪力】', desc: '生涯累積 300 支全壘打', titleReward: '稱號：怪力巨砲' },
    { id: 'ach_26', icon: '👑', title: '【五百轟偉大殿堂】', desc: '生涯累積 500 支全壘打', titleReward: '稱號：五百轟傳奇' },
    { id: 'ach_27', icon: '⚾', title: '【五十勝投手】', desc: '投手生涯累積 50 勝', titleReward: '稱號：五十勝投手' },
    { id: 'ach_28', icon: '👑', title: '【百勝王牌】', desc: '投手生涯累積 100 勝', titleReward: '稱號：百勝王牌' },
    { id: 'ach_29', icon: '🌟', title: '【兩百勝傳奇巨投】', desc: '投手生涯累積 200 勝名人堂級', titleReward: '稱號：兩百勝傳奇' },
    { id: 'ach_30', icon: '⚡', title: '【千K投手】', desc: '投手生涯累積 1,000 次三振', titleReward: '稱號：千K高手' },
    { id: 'ach_31', icon: '🔥', title: '【兩千五百K魔神】', desc: '投手生涯累積 2,500 次三振', titleReward: '稱號：奪三振魔神' },
    { id: 'ach_32', icon: '⭐', title: '【明星球員】', desc: '生涯累積 WAR 達到 30 以上', titleReward: '稱號：明星球員' },
    { id: 'ach_33', icon: '👑', title: '【棒球殿堂名人堂】', desc: '生涯累積 WAR 達到 60 以上', titleReward: '稱號：殿堂名人堂' },
    { id: 'ach_34', icon: '✨', title: '【千古第一人】', desc: '生涯累積 WAR 達到 100 歷史峰頂', titleReward: '稱號：棒球之神' },
    { id: 'ach_35', icon: '👕', title: '【背號永久欠番】', desc: '榮獲球團退役背號榮譽', titleReward: '稱號：永久欠番' },
    { id: 'ach_36', icon: '🗿', title: '【球場傳奇雕像】', desc: '主場球場為你建立紀念銅像', titleReward: '稱號：不朽傳奇' },
    { id: 'ach_37', icon: '💨', title: '【黑色閃電】', desc: '生涯累積 200 次盜壘成功', titleReward: '稱號：黑色閃電' },
    { id: 'ach_38', icon: '⚡', title: '【盜壘王傳奇】', desc: '生涯累積 400 次盜壘成功', titleReward: '稱號：盜壘之神' },
    { id: 'ach_39', icon: '💍', title: '【多冠王者】', desc: '生涯累積獲得 3 枚總冠軍戒指', titleReward: '稱號：多冠王者' },
    { id: 'ach_40', icon: '👑', title: '【戒指收集家】', desc: '生涯累積獲得 5 枚總冠軍戒指', titleReward: '稱號：戒指霸主' },

    { id: 'ach_41', icon: '💵', title: '【千萬年薪】', desc: '生涯薪資總計突破 $1,000 萬', titleReward: '稱號：千萬身價' },
    { id: 'ach_42', icon: '💰', title: '【富豪球星】', desc: '生涯薪資總計突破 $5,000 萬', titleReward: '稱號：富豪球星' },
    { id: 'ach_43', icon: '💳', title: '【億萬身價】', desc: '生涯薪資總計突破 $1 億', titleReward: '稱號：億萬男' },
    { id: 'ach_44', icon: '🏦', title: '【大聯盟頂薪合約】', desc: '生涯薪資總計突破 $3 億', titleReward: '稱號：頂薪合約王' },
    { id: 'ach_45', icon: '💎', title: '【黃金傳奇薪資】', desc: '生涯薪資總計突破 $5 億歷史極限', titleReward: '稱號：黃金身價' },
    { id: 'ach_46', icon: '💍', title: '【幸福新婚人夫】', desc: '在職棒生涯期間順利結婚建構幸福家庭', titleReward: '稱號：愛妻家' },
    { id: 'ach_47', icon: '🏰', title: '【頂級豪宅之主】', desc: '入住 Tier 5 名人堂極致莊園', titleReward: '稱號：城堡主人' },
    { id: 'ach_48', icon: '🏎️', title: '【極速超跑狂熱】', desc: '駕駛 Tier 5 傳奇狂飆賽車巨獸', titleReward: '稱號：飆速球星' },
    { id: 'ach_49', icon: '🎒', title: '【資深裝備家】', desc: '擁有 5 件常駐型裝備', titleReward: '稱號：裝備玩家' },
    { id: 'ach_50', icon: '🛡️', title: '【裝備大師】', desc: '擁有 12 件常駐型裝備', titleReward: '稱號：裝備大師' },

    { id: 'ach_51', icon: '⚔️', title: '【二刀流開花】', desc: '雙刀流單季 10 轟且獲得 5 勝', titleReward: '稱號：二刀流開花' },
    { id: 'ach_52', icon: '👑', title: '【大谷翔平神蹟】', desc: '雙刀流單季 20 轟且獲得 10 勝神蹟', titleReward: '稱號：大谷二世' },
    { id: 'ach_53', icon: '👑', title: '【打擊三冠王】', desc: '單季包辦打擊率、全壘打、打點王', titleReward: '稱號：三冠至尊' },
    { id: 'ach_54', icon: '🌟', title: '【年度 MVP】', desc: '獲得職棒年度最佳球員 MVP 大獎', titleReward: '稱號：年度 MVP' },
    { id: 'ach_55', icon: '投', title: '【賽揚降臨】', desc: '獲得職棒年度最佳投手賽揚賞', titleReward: '稱號：賽揚得主' },
    { id: 'ach_56', icon: '👶', title: '【大聯盟新人王】', desc: '獲得大聯盟 RoY 新人王標籤', titleReward: '稱號：超級新人' },
    { id: 'ach_57', icon: '🧤', title: '【金手套防守神童】', desc: '獲得聯盟金手套防守大獎', titleReward: '稱號：金手套神童' },
    { id: 'ach_58', icon: '🏏', title: '【銀棒打擊大獎】', desc: '獲得聯盟最佳九人銀棒大獎', titleReward: '稱號：銀棒強打' },
    { id: 'ach_59', icon: '⭐', title: '【明星賽 MVP】', desc: '在職棒明星賽打出 MVP 高光表現', titleReward: '稱號：明星賽MVP' },
    { id: 'ach_60', icon: '💥', title: '【全壘打大賽霸主】', desc: '奪得明星賽全壘打大賽冠軍', titleReward: '稱號：全壘打王' },

    { id: 'ach_61', icon: '✨', title: '【十年一遇】', desc: '創角幸運觸發 8% 隨機「天才降生」', titleReward: '稱號：十年一遇' },
    { id: 'ach_62', icon: '🎲', title: '【幸運大滿貫】', desc: '春訓擲骰單次出現 3 個 6 點歐皇', titleReward: '稱號：歐皇大滿貫' },
    { id: 'ach_63', icon: '🏋️', title: '【完美自主訓練】', desc: '春訓擲骰獲得全部最高經驗加成', titleReward: '稱號：自主訓狂人' },
    { id: 'ach_64', icon: '🔥', title: '【心臟很大】', desc: '完成 1 次關鍵時刻戰術勝利', titleReward: '稱號：大心臟' },
    { id: 'ach_65', icon: '⚡', title: '【九局下半英雄】', desc: '完成 3 次關鍵時刻戰術勝利', titleReward: '稱號：九局下半英雄' },
    { id: 'ach_66', icon: '🎯', title: '【再見安打專家】', desc: '完成 5 次關鍵時刻戰術勝利', titleReward: '稱號：再見安打王' },
    { id: 'ach_67', icon: '⛩️', title: '【神明保佑】', desc: 'D100 事件擲骰判定 95 點以上高分過關', titleReward: '稱號：天選之子' },
    { id: 'ach_68', icon: '🦾', title: '【鋼鐵不壞之身】', desc: '生涯未受重大傷病順利引退', titleReward: '稱號：鋼鐵人' },
    { id: 'ach_69', icon: '🃏', title: '【幸運星眷顧】', desc: '抽中 5 次大吉幸運機會卡', titleReward: '稱號：幸運星' },
    { id: 'ach_70', icon: '🎒', title: '【萬寶囊】', desc: '背包內擁有滿滿道具', titleReward: '稱號：萬寶囊' },

    { id: 'ach_71', icon: '🇹🇼', title: '【黑豹王者】', desc: '台灣出生高中賽事稱霸黑豹旗', titleReward: '稱號：黑豹王者' },
    { id: 'ach_72', icon: '🇯🇵', title: '【甲子園怪物】', desc: '日本出生殺入阪神甲子園大會', titleReward: '稱號：甲子園怪物' },
    { id: 'ach_73', icon: '🎓', title: '【大專強打王】', desc: '大專聯賽展現統治級主宰力', titleReward: '稱號：大學王牌' },
    { id: 'ach_74', icon: '🇹🇼', title: '【CPBL中職巨星】', desc: '中華職棒生涯打出 1,000 支安打', titleReward: '稱號：CPBL巨星' },
    { id: 'ach_75', icon: '🇯🇵', title: '【NPB日職王牌】', desc: '日本職棒生涯獲得 100 勝', titleReward: '稱號：NPB王牌' },
    { id: 'ach_76', icon: '🇺🇸', title: '【MLB大聯盟超級巨星】', desc: '美職大聯盟生涯 WAR 突破 50', titleReward: '稱號：MLB超級巨星' },
    { id: 'ach_77', icon: '🎁', title: '【傳承始祖】', desc: '首次將裝備轉贈傳承給下一代', titleReward: '稱號：傳承始祖' },
    { id: 'ach_78', icon: '🔥', title: '【野球的血脈】', desc: '攜帶前輩傳承裝備打滿一生', titleReward: '稱號：野球血脈' },
    { id: 'ach_79', icon: '📖', title: '【圖鑑收藏家】', desc: '解鎖 15 件常駐裝備圖鑑', titleReward: '稱號：圖鑑收藏家' },
    { id: 'ach_80', icon: '🧢', title: '【名將教頭】', desc: '總教練模式帶隊奪得 3 次總冠軍', titleReward: '稱號：名將教頭' },

    { id: 'ach_81', icon: '📦', title: '【終極囤貨家】', desc: '背包內同時持有 15 件消耗道具', titleReward: '稱號：終極囤貨家' },
    { id: 'ach_82', icon: '🌟', title: '【傳說收藏家】', desc: '擁有至少 1 件傳說級常駐裝備', titleReward: '稱號：傳說收藏家' },
    { id: 'ach_83', icon: '🔍', title: '【裝備鑑定師】', desc: '同時擁有 3 件以上稀有/傳說級裝備', titleReward: '稱號：裝備鑑定師' },
    { id: 'ach_84', icon: '💰', title: '【零用金富翁】', desc: '零用金累積達到 $50 萬', titleReward: '稱號：零用金富翁' },
    { id: 'ach_85', icon: '🏎️', title: '【賽道狂人】', desc: '擁有 Tier 4 以上高階座駕', titleReward: '稱號：賽道狂人' },
    { id: 'ach_86', icon: '🧬', title: '【血脈相承】', desc: '攜帶第 3 代以上傳承裝備開局', titleReward: '稱號：血脈相承' },
    { id: 'ach_87', icon: '👨‍👩‍👦', title: '【野球世家】', desc: '攜帶第 5 代以上傳承裝備開局', titleReward: '稱號：野球世家' }
  ];

  /* ==========================================================================
     4. 骰子判定引擎：15 種互動事件卡 (3 應對選項) + 10 種機會卡 (Omikuji Chance Cards)
     ========================================================================== */

  // 共用風險判定表：3 種應對策略各自對應 1 顆骰子的結果分佈，取代舊版隱形 35/50/70% 機率
  const RISK_ROLL_TABLE = {
    high: {
      label: '🔥 全力一搏', sub: '擲 1 顆骰子 | 高風險高報酬 (最大 ±4)',
      rolls: [
        { min: 1, max: 2, success: false, mag: -3, tag: '豪賭慘敗' },
        { min: 3, max: 3, success: false, mag: -1, tag: '豪賭小失手' },
        { min: 4, max: 5, success: true, mag: 2, tag: '豪賭成功' },
        { min: 6, max: 6, success: true, mag: 4, tag: '豪賭大成功！' }
      ]
    },
    med: {
      label: '⚖️ 照常執行', sub: '擲 1 顆骰子 | 標準風險 (±2~3)',
      rolls: [
        { min: 1, max: 1, success: false, mag: -2, tag: '執行失常' },
        { min: 2, max: 5, success: true, mag: 2, tag: '穩定發揮' },
        { min: 6, max: 6, success: true, mag: 3, tag: '超水準演出' }
      ]
    },
    low: {
      label: '🛡️ 保守應對', sub: '擲 1 顆骰子 | 低風險低報酬 (0~+1)',
      rolls: [
        { min: 1, max: 1, success: true, mag: 0, tag: '安全過關' },
        { min: 2, max: 6, success: true, mag: 1, tag: '穩紮穩打' }
      ]
    }
  };

  function rollRiskTier(tier) {
    let roll = ri(1, 6);
    if (S.activeBuffs && S.activeBuffs.some(b => b.type === 'luck' && b.remainingPhases > 0)) {
      roll = clamp(roll + 1, 1, 6);
    }
    const table = RISK_ROLL_TABLE[tier].rolls;
    const found = table.find(r => roll >= r.min && roll <= r.max) || table[table.length - 1];
    return { roll, success: found.success, mag: found.mag, tag: found.tag };
  }

  // 15 種互動事件卡，依人生階段/主題分 5 大類，各 3 種，避免同質化重複
  const INTERACTIVE_EVENTS = [
    // 甲子園/高校 (限高中階段)
    { id: 'ev01', title: '守備千球練習', desc: '特訓教練在練球後留下你，進行高強度的千球守備特訓！', statKey: 'cat', stages: ['HS1', 'HS2', 'HS3'], win: '完成千球特訓，接球技巧大幅提升！', lose: '吃了無數彈跳球信心受挫，接球節奏亂了套。' },
    { id: 'ev02', title: '甲子園熱身賽緊張感', desc: '全國矚目的甲子園熱身賽即將開打，看台座無虛席，你的選球判斷力受到極大考驗。', statKey: 'eye', stages: ['HS1', 'HS2', 'HS3'], win: '頂住壓力冷靜選球，選球眼大幅精進！', lose: '太過緊張頻頻出棒誤判，選球眼略有退步。' },
    { id: 'ev03', title: '校內打擊對抗賽', desc: '校隊內部舉辦打擊對抗賽，教練在一旁緊盯每個人的打擊機制。', statKey: 'con', stages: ['HS1', 'HS2', 'HS3'], win: '打擊機制修正成功，Contact 明顯進步！', lose: '對抗賽手感不佳，Contact 略微下滑。' },

    // 大學 (限大學階段)
    { id: 'ev04', title: '大學選手權資格賽', desc: '全國大學選手權資格賽開打，強度直逼職業等級的投手考驗你的長打力。', statKey: 'pow', stages: ['UNI1', 'UNI2', 'UNI3', 'UNI4'], win: '扛起球隊攻擊火力，力量大幅躍進！', lose: '面對高強度投手屢屢揮空，力量略微受挫。' },
    { id: 'ev05', title: '學長學弟制震撼教育', desc: '學長學弟制文化下的震撼教育與魔鬼特訓考驗著你的體能底線。', statKey: 'sta', stages: ['UNI1', 'UNI2', 'UNI3', 'UNI4'], win: '咬牙撐過震撼教育，體力大幅強化！', lose: '操練過度身體疲憊，體力明顯下滑。' },
    { id: 'ev06', title: '職業球探校園觀察會', desc: '職業球探悄悄蒞臨校園觀察會，你能否在鎂光燈下秀出最強臂力？', statKey: 'arm', stages: ['UNI1', 'UNI2', 'UNI3', 'UNI4'], win: '一次精準長傳驚豔全場球探，臂力大幅提升！', lose: '緊張之下傳球失準，臂力表現不如預期。' },

    // 選秀/職業 (限選秀與職棒階段)
    { id: 'ev07', title: '選秀前夕魔鬼體測', desc: '選秀會前的球團魔鬼體測，60碼衝刺成績將直接影響你的順位。', statKey: 'spd', stages: ['DRAFT', 'PRO'], win: '衝刺成績驚豔全場球探，跑壘天賦大爆發！', lose: '體測發揮失常，速度數據不甚理想。' },
    { id: 'ev08', title: '開幕戰先發大賽', desc: '球團宣布你將擔任開幕戰先發，全隊士氣與你的控球穩定度息息相關。', statKey: 'ctl', stages: ['DRAFT', 'PRO'], win: '開幕戰完美掌控好球帶，控球明顯進步！', lose: '開幕戰壓力爆棚頻頻暴投，控球略微失準。' },
    { id: 'ev09', title: '交易謠言風暴', desc: '球團高層傳出交易你的謠言，媒體與球迷議論紛紛，考驗你的心理素質。', statKey: 'sta', stages: ['DRAFT', 'PRO'], win: '頂住壓力專注比賽，心志更加堅韌、體力提升！', lose: '心神不寧影響訓練節奏，體力略微下滑。' },

    // 傷病與心理素質 (不限階段)
    { id: 'ev10', title: '季中打擊低潮', desc: '遭遇連續十打席無安打的打擊低潮，你要如何突破困境？', statKey: 'con', win: '徹底修改打擊機制，Contact 大幅提升！', lose: '低潮拖了一個月，Contact 明顯受挫。' },
    { id: 'ev11', title: '肩肘傷病警訊', desc: '隊醫檢查發現你的肩肘部位出現輕微發炎警訊，是否要調整訓練強度？', statKey: 'arm', win: '及早妥善治療康復，臂力狀態全面提升！', lose: '勉強硬撐留下後遺症，臂力明顯下滑。' },
    { id: 'ev12', title: '賽前失眠焦慮症', desc: '重要賽事前夜輾轉難眠，隔天賽場上的判斷力備受考驗。', statKey: 'eye', win: '調適心情穩住陣腳，選球判斷更加銳利！', lose: '精神不濟影響臨場反應，選球眼略微下滑。' },

    // 生活與家庭 (不限階段)
    { id: 'ev13', title: '場外代言邀約', desc: '獲得頂級運動品牌拍攝廣告邀約，行程滿檔考驗體能安排。', statKey: 'sta', win: '兼顧代言與鍛鍊，體力管理大幅提升！', lose: '行程太滿訓練量掉了，體力明顯下滑。' },
    { id: 'ev14', title: '家人健康突發狀況', desc: '家人突然傳來健康狀況不佳的消息，你必須在訓練與家庭之間做出取捨。', statKey: 'sta', win: '妥善安排時間兼顧家人與訓練，心境更加成熟、體力提升！', lose: '心力交瘁訓練效率低落，體力明顯下滑。' },
    { id: 'ev15', title: '追星私生飯騷擾風波', desc: '成名之後私生活備受關注，過度熱情的粉絲行為讓你心神不寧。', statKey: 'eye', win: '妥善處理危機維持專注，選球眼不減反增！', lose: '生活大受干擾影響專注力，選球眼略微下滑。' }
  ];

  // 10 種機會卡 (神社籤詩)：抽到即自動開獎，強化能力或暫時提升骰子/運氣
  const CHANCE_CARDS = [
    { id: 'cc01', icon: '⛩️', title: '大吉籤 · 必勝祈願', desc: '參拜神社抽到大吉籤，運勢爆棚！', effect: { type: 'stat', key: 'con', amount: 3 }, isDaikichi: true },
    { id: 'cc02', icon: '⛩️', title: '大吉籤 · 金運亨通', desc: '大吉籤上寫著金運亨通，全身充滿自信！', effect: { type: 'stat', key: 'pow', amount: 3 }, isDaikichi: true },
    { id: 'cc03', icon: '🎋', title: '中吉籤 · 心想事成', desc: '中吉籤帶來一股踏實的安心感。', effect: { type: 'stat', key: 'eye', amount: 2 } },
    { id: 'cc04', icon: '🎋', title: '中吉籤 · 旅途平安', desc: '中吉籤祝福你接下來的賽季旅途平安。', effect: { type: 'stat', key: 'spd', amount: 2 } },
    { id: 'cc05', icon: '🍀', title: '幸運四葉草', desc: '在球場邊撿到一株罕見的四葉幸運草！', effect: { type: 'luck', duration: 3 } },
    { id: 'cc06', icon: '🥇', title: '教練私下開小灶', desc: '教練看好你的潛力，私下多加了幾堂特訓課！', effect: { type: 'dice', amount: 1, duration: 2 } },
    { id: 'cc07', icon: '🌙', title: '一夜好眠', desc: '難得睡了一個扎實的好覺，隔天精神格外飽滿！', effect: { type: 'stat', key: 'sta', amount: 2 } },
    { id: 'cc08', icon: '📿', title: '隊友的加油手鍊', desc: '隊友悄悄送你一條手作加油手鍊，暖到心坎裡。', effect: { type: 'luck', duration: 2 } },
    { id: 'cc09', icon: '🎯', title: '小吉籤 · 平穩安泰', desc: '小吉籤提醒你穩紮穩打最重要。', effect: { type: 'stat', key: 'fld', amount: 1 } },
    { id: 'cc10', icon: '🌾', title: '末吉籤 · 塞翁失馬', desc: '末吉籤說著塞翁失馬焉知非福，你決定換個心態面對。', effect: { type: 'stat', key: 'ctl', amount: 1 } }
  ];

  // 本季事件：每次進入新階段自動排入 2-3 件強制事件，直接呈現在版面最上方
  function queueMandatoryEvents() {
    const pool = INTERACTIVE_EVENTS.filter(e => !e.stages || e.stages.includes(S.stage));
    const list = (pool.length ? pool : INTERACTIVE_EVENTS).slice().sort(() => R() - 0.5);
    const count = Math.min(list.length, ri(2, 3));
    S.pendingEvents = list.slice(0, count).map(ev => ({ ev, resolved: false, resultGood: null, resultText: '' }));
    S.chanceCardDrawnThisPhase = false;
  }

  function renderMandatoryEvents() {
    const container = document.getElementById('mandatory-events-list');
    if (!container) return;

    if (!S.pendingEvents || !S.pendingEvents.length) {
      container.innerHTML = `<span class="text-muted text-sm">本季暫無事件。</span>`;
      return;
    }

    container.innerHTML = S.pendingEvents.map((pe, idx) => {
      if (pe.resolved) {
        return `
          <div class="event-card-block resolved">
            <div class="event-card-header">
              <span class="event-card-title">✅ ${pe.ev.title}</span>
              <span class="event-result-tag ${pe.resultGood ? 'good' : 'bad'}">${pe.resultText}</span>
            </div>
          </div>
        `;
      }
      return `
        <div class="event-card-block">
          <div class="event-card-header">
            <span class="event-card-title">◆ ${pe.ev.title}</span>
          </div>
          <p class="event-card-desc">${pe.ev.desc}</p>
          <div class="choices-btn-group event-choices-grid">
            ${['high', 'med', 'low'].map(tier => `
              <div class="btn-choice ${tier === 'high' ? 'high-risk' : tier === 'med' ? 'med-risk' : 'low-risk'}" data-risk="${tier}" data-idx="${idx}">
                <span class="btn-choice-title">${RISK_ROLL_TABLE[tier].label}</span>
                <span class="btn-choice-sub">${RISK_ROLL_TABLE[tier].sub}</span>
              </div>
            `).join('')}
          </div>
          <div class="dice-roll-reveal hidden" data-reveal-idx="${idx}"></div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled')) return;
        const idx = parseInt(btn.dataset.idx, 10);
        const pe = S.pendingEvents[idx];
        if (!pe || pe.resolved) return;

        container.querySelectorAll(`.btn-choice[data-idx="${idx}"]`).forEach(b => b.classList.add('disabled'));
        const reveal = container.querySelector(`.dice-roll-reveal[data-reveal-idx="${idx}"]`);

        animateDiceRoll(reveal, btn.dataset.risk, (result) => {
          S.ab[pe.ev.statKey] = clamp((S.ab[pe.ev.statKey] || 25) + result.mag, 10, S.pot[pe.ev.statKey] || 99);

          const msg = result.success ? pe.ev.win : pe.ev.lose;
          addLogCard(`◆ 事件卡 | ${pe.ev.title}`, `${msg}（🎲 擲出 ${result.roll} 點・${result.tag}）`, result.success ? 'good' : 'bad', '事件判定');

          pe.resolved = true;
          pe.resultGood = result.success;
          pe.resultText = `${result.tag}（${result.roll}點）`;
          renderAll();
        });
      });
    });
  }

  function drawChanceCard() {
    if (S.chanceCardDrawnThisPhase) {
      alert('本季機會卡已經抽取過了！請前進下個階段後再行抽取！');
      return;
    }

    S.chanceCardDrawnThisPhase = true;
    resolveChanceCard(CHANCE_CARDS[ri(0, CHANCE_CARDS.length - 1)]);
    renderAll();
  }

  function animateDiceRoll(revealEl, tier, callback) {
    playDiceSound();
    revealEl.classList.remove('hidden');

    let ticks = 0;
    const maxTicks = 8;
    const interval = setInterval(() => {
      ticks++;
      revealEl.innerHTML = `<div class="ref-dice-card rolling">${ri(1, 6)}</div>`;
      if (ticks >= maxTicks) {
        clearInterval(interval);
        const result = rollRiskTier(tier);
        revealEl.innerHTML = `
          <div class="ref-dice-card ${result.success ? 'selected' : ''}">${result.roll}</div>
          <div class="dice-result-tag ${result.success ? 'good' : 'bad'}">${result.tag}</div>
        `;
        setTimeout(() => callback(result), 700);
      }
    }, 80);
  }

  function resolveChanceCard(card) {
    let logMsg = card.desc;
    const eff = card.effect;

    if (eff.type === 'stat') {
      S.ab[eff.key] = clamp((S.ab[eff.key] || 25) + eff.amount, 10, S.pot[eff.key] || 99);
      logMsg += ` ${eff.key.toUpperCase()} ${eff.amount > 0 ? '+' : ''}${eff.amount}！`;
    } else if (eff.type === 'dice') {
      S.activeBuffs.push({ type: 'dice', amount: eff.amount, remainingPhases: eff.duration });
      logMsg += ` 接下來 ${eff.duration} 個階段，訓練骰子 +${eff.amount} 顆！`;
    } else if (eff.type === 'luck') {
      S.activeBuffs.push({ type: 'luck', amount: 1, remainingPhases: eff.duration });
      logMsg += ` 接下來 ${eff.duration} 個階段，事件判定運氣上升！`;
    }

    if (card.isDaikichi) {
      S.daikichiCount = (S.daikichiCount || 0) + 1;
      if (S.daikichiCount >= 5) unlockAchievement('ach_69');
    }

    addLogCard(`🃏 機會卡 | ${card.icon} ${card.title}`, logMsg, 'gold', '機會降臨');
    checkAchievements();
  }

  function tickBuffs() {
    if (!S.activeBuffs || !S.activeBuffs.length) return;
    const stillActive = [];
    const expiredMsgs = [];
    S.activeBuffs.forEach(b => {
      b.remainingPhases -= 1;
      if (b.remainingPhases > 0) stillActive.push(b);
      else expiredMsgs.push(b.type === 'dice' ? `🎲 訓練骰子 +${b.amount} 效果已到期。` : `🍀 幸運加成效果已到期。`);
    });
    S.activeBuffs = stillActive;
    if (expiredMsgs.length) addLogCard('⏳ 暫時效果到期', expiredMsgs.join('<br>'), 'info', '效果結束');
  }

  // 30 種常駐裝備：common(15) / rare(10) / legendary(5)
  const ALL_PROPOSALS = [
    // Common (15)
    { id: 'p_02', icon: '🧤', name: '加重練習打擊手套', desc: '打擊+4, 選球+3', price: 120000, rarity: 'common', stat: { con: 4, eye: 3 } },
    { id: 'p_03', icon: '👟', name: '碳纖維輕量釘鞋', desc: '跑壘+6', price: 140000, rarity: 'common', stat: { spd: 6 } },
    { id: 'p_05', icon: '⛩️', name: '神社必勝祈願勝守', desc: '能力+3', price: 100000, rarity: 'common', stat: { con: 3, pow: 3 } },
    { id: 'p_06', icon: '🧢', name: '家傳幸運縫線球帽', desc: '控球+5', price: 130000, rarity: 'common', stat: { ctl: 5 } },
    { id: 'p_09', icon: '🥎', name: '加重訓練球', desc: '體力+4', price: 85000, rarity: 'common', stat: { sta: 4 } },
    { id: 'p_10', icon: '🎽', name: '透氣機能訓練服', desc: '體力+3, 跑壘+2', price: 90000, rarity: 'common', stat: { sta: 3, spd: 2 } },
    { id: 'p_11', icon: '🧦', name: '抗疲勞機能襪', desc: '體力+3', price: 70000, rarity: 'common', stat: { sta: 3 } },
    { id: 'p_12', icon: '🥊', name: '反應速度訓練器', desc: '選球+5', price: 110000, rarity: 'common', stat: { eye: 5 } },
    { id: 'p_13', icon: '🏐', name: '守備反應錐訓練組', desc: '守備+5', price: 115000, rarity: 'common', stat: { fld: 5 } },
    { id: 'p_14', icon: '🎿', name: '敏捷梯訓練組', desc: '跑壘+5', price: 100000, rarity: 'common', stat: { spd: 5 } },
    { id: 'p_15', icon: '🧢', name: '遮陽戰術球帽', desc: '選球+3, 守備+2', price: 95000, rarity: 'common', stat: { eye: 3, fld: 2 } },
    { id: 'p_16', icon: '🥋', name: '核心肌群訓練帶', desc: '力量+4', price: 105000, rarity: 'common', stat: { pow: 4 } },
    { id: 'p_17', icon: '🦵', name: '下肢爆發力訓練器', desc: '跑壘+4, 力量+2', price: 125000, rarity: 'common', stat: { spd: 4, pow: 2 } },
    { id: 'p_18', icon: '🧤', name: '捕手練習接球網', desc: '接球+5', price: 110000, rarity: 'common', stat: { cat: 5 } },
    { id: 'p_19', icon: '⚾', name: '高級縫線比賽用球組', desc: '打擊+3, 力量+2', price: 120000, rarity: 'common', stat: { con: 3, pow: 2 } },

    // Rare (10)
    { id: 'p_01', icon: '🏏', name: '特製楓木打擊重棒', desc: '力量+5', price: 150000, rarity: 'rare', stat: { pow: 5 } },
    { id: 'p_04', icon: '🦺', name: '鈦合金防護面罩', desc: '捕手接捕+8', price: 180000, rarity: 'rare', stat: { cat: 8, fld: 4 } },
    { id: 'p_07', icon: '💪', name: '高科技肌能護臂', desc: '臂力+6', price: 200000, rarity: 'rare', stat: { arm: 6, vel: 2 } },
    { id: 'p_20', icon: '🎯', name: '職業級控球訓練機', desc: '控球+7', price: 170000, rarity: 'rare', stat: { ctl: 7 } },
    { id: 'p_21', icon: '🔥', name: '加壓爆發力護膝', desc: '跑壘+6, 力量+3', price: 190000, rarity: 'rare', stat: { spd: 6, pow: 3 } },
    { id: 'p_22', icon: '🛡️', name: '全罩式強化護具組', desc: '守備+6, 臂力+4', price: 200000, rarity: 'rare', stat: { fld: 6, arm: 4 } },
    { id: 'p_23', icon: '💨', name: '高階變化球指叉訓練器', desc: '變化球+7', price: 175000, rarity: 'rare', stat: { brk: 7 } },
    { id: 'p_24', icon: '🧬', name: '運動科學體能評估', desc: '全能力+1', price: 220000, rarity: 'rare', stat: { con: 1, pow: 1, spd: 1, arm: 1, fld: 1, cat: 1, eye: 1, ctl: 1, brk: 1, sta: 1 } },
    { id: 'p_25', icon: '🏹', name: '精密打擊軌跡分析儀', desc: '打擊+6, 選球+3', price: 210000, rarity: 'rare', stat: { con: 6, eye: 3 } },
    { id: 'p_26', icon: '⚡', name: '職業級投球機', desc: '球速+4, 控球+3', price: 230000, rarity: 'rare', stat: { vel: 4, ctl: 3 } },

    // Legendary (5)
    { id: 'p_08', icon: '💍', name: '總冠軍運勢金戒', desc: '全能力+2', price: 300000, rarity: 'legendary', stat: { con: 2, pow: 2, ctl: 2, vel: 2 } },
    { id: 'p_27', icon: '👑', name: '傳奇球星簽名球棒', desc: '打擊+6, 力量+6', price: 320000, rarity: 'legendary', stat: { con: 6, pow: 6 } },
    { id: 'p_28', icon: '🌟', name: '名人堂等級訓練基地會員證', desc: '全能力+3', price: 420000, rarity: 'legendary', stat: { con: 3, pow: 3, spd: 3, arm: 3, fld: 3, cat: 3, eye: 3, ctl: 3, brk: 3, sta: 3 } },
    { id: 'p_29', icon: '🐉', name: '龍魂附體御守', desc: '打擊+4, 力量+4, 球速+3, 控球+3', price: 380000, rarity: 'legendary', stat: { con: 4, pow: 4, vel: 3, ctl: 3 } },
    { id: 'p_30', icon: '💎', name: '鑽石級運動經紀合約', desc: '體力+8, 全能力+2', price: 500000, rarity: 'legendary', stat: { con: 2, pow: 2, spd: 2, arm: 2, fld: 2, cat: 2, eye: 2, ctl: 2, brk: 2, sta: 8 } }
  ];

  // 40 種一次性消耗道具：回體力、暫時骰子加成、暫時運氣加成 三大類
  const CONSUMABLES = [
    // 💪 回復體力類 (14 種)
    { id: 'c01', icon: '🥤', name: '運動飲料', desc: '體力 +2', price: 2000, rarity: 'common', effect: { type: 'heal_sta', amount: 2 } },
    { id: 'c02', icon: '🍫', name: '能量補給棒', desc: '體力 +3', price: 3000, rarity: 'common', effect: { type: 'heal_sta', amount: 3 } },
    { id: 'c03', icon: '🧊', name: '冰浴恢復包', desc: '體力 +4', price: 4500, rarity: 'common', effect: { type: 'heal_sta', amount: 4 } },
    { id: 'c04', icon: '💆', name: '專業按摩券', desc: '體力 +5', price: 6000, rarity: 'common', effect: { type: 'heal_sta', amount: 5 } },
    { id: 'c05', icon: '🧘', name: '瑜珈舒緩課', desc: '體力 +3', price: 3500, rarity: 'common', effect: { type: 'heal_sta', amount: 3 } },
    { id: 'c06', icon: '🩹', name: '運動貼布組', desc: '體力 +2', price: 2000, rarity: 'common', effect: { type: 'heal_sta', amount: 2 } },
    { id: 'c07', icon: '🍵', name: '特調中藥茶飲', desc: '體力 +4', price: 5000, rarity: 'common', effect: { type: 'heal_sta', amount: 4 } },
    { id: 'c08', icon: '🧪', name: '電解質補充液', desc: '體力 +3', price: 3200, rarity: 'common', effect: { type: 'heal_sta', amount: 3 } },
    { id: 'c09', icon: '🥗', name: '高蛋白餐盒', desc: '體力 +4', price: 4000, rarity: 'common', effect: { type: 'heal_sta', amount: 4 } },
    { id: 'c10', icon: '🍜', name: '深夜滋補湯品', desc: '體力 +5', price: 5500, rarity: 'rare', effect: { type: 'heal_sta', amount: 5 } },
    { id: 'c11', icon: '🛁', name: '溫泉恢復之旅', desc: '體力 +7', price: 12000, rarity: 'rare', effect: { type: 'heal_sta', amount: 7 } },
    { id: 'c12', icon: '🧉', name: '秘傳能量飲', desc: '體力 +8', price: 16000, rarity: 'rare', effect: { type: 'heal_sta', amount: 8 } },
    { id: 'c13', icon: '🩺', name: '隊醫特別調理', desc: '體力 +10', price: 24000, rarity: 'legendary', effect: { type: 'heal_sta', amount: 10 } },
    { id: 'c14', icon: '🍡', name: '傳說級體力丸', desc: '體力 +12', price: 32000, rarity: 'legendary', effect: { type: 'heal_sta', amount: 12 } },

    // 🎲 暫時骰子加成類 (13 種)
    { id: 'c15', icon: '📋', name: '個人訓練菜單', desc: '接下來 1 個階段訓練骰子 +1', price: 8000, rarity: 'common', effect: { type: 'dice_bonus', amount: 1, duration: 1 } },
    { id: 'c16', icon: '🎯', name: '精準打擊教材', desc: '接下來 1 個階段訓練骰子 +1', price: 9000, rarity: 'common', effect: { type: 'dice_bonus', amount: 1, duration: 1 } },
    { id: 'c17', icon: '🥇', name: '短期集訓營', desc: '接下來 2 個階段訓練骰子 +1', price: 14000, rarity: 'common', effect: { type: 'dice_bonus', amount: 1, duration: 2 } },
    { id: 'c18', icon: '📈', name: '數據分析報告', desc: '接下來 2 個階段訓練骰子 +1', price: 15000, rarity: 'common', effect: { type: 'dice_bonus', amount: 1, duration: 2 } },
    { id: 'c19', icon: '🧠', name: '心智訓練課程', desc: '接下來 1 個階段訓練骰子 +1', price: 8500, rarity: 'common', effect: { type: 'dice_bonus', amount: 1, duration: 1 } },
    { id: 'c20', icon: '🔬', name: '生物力學檢測', desc: '接下來 2 個階段訓練骰子 +1', price: 16000, rarity: 'rare', effect: { type: 'dice_bonus', amount: 1, duration: 2 } },
    { id: 'c21', icon: '🕶️', name: '職業球探建議書', desc: '接下來 1 個階段訓練骰子 +2', price: 18000, rarity: 'rare', effect: { type: 'dice_bonus', amount: 2, duration: 1 } },
    { id: 'c22', icon: '⏱️', name: '高強度間歇特訓', desc: '接下來 1 個階段訓練骰子 +2', price: 19000, rarity: 'rare', effect: { type: 'dice_bonus', amount: 2, duration: 1 } },
    { id: 'c23', icon: '📔', name: '前輩秘傳筆記', desc: '接下來 2 個階段訓練骰子 +2', price: 26000, rarity: 'rare', effect: { type: 'dice_bonus', amount: 2, duration: 2 } },
    { id: 'c24', icon: '🎓', name: '名教頭一對一指導', desc: '接下來 2 個階段訓練骰子 +2', price: 28000, rarity: 'legendary', effect: { type: 'dice_bonus', amount: 2, duration: 2 } },
    { id: 'c25', icon: '🏅', name: '國家隊選訓營邀請', desc: '接下來 1 個階段訓練骰子 +3', price: 30000, rarity: 'legendary', effect: { type: 'dice_bonus', amount: 3, duration: 1 } },
    { id: 'c26', icon: '🛠️', name: '客製化訓練器材', desc: '接下來 3 個階段訓練骰子 +1', price: 20000, rarity: 'rare', effect: { type: 'dice_bonus', amount: 1, duration: 3 } },
    { id: 'c27', icon: '📡', name: '即時數據回饋系統', desc: '接下來 3 個階段訓練骰子 +2', price: 34000, rarity: 'legendary', effect: { type: 'dice_bonus', amount: 2, duration: 3 } },

    // 🍀 暫時運氣加成類 (13 種)
    { id: 'c28', icon: '🍀', name: '幸運四葉草徽章', desc: '接下來 1 個階段事件判定運氣上升', price: 5000, rarity: 'common', effect: { type: 'temp_luck', duration: 1 } },
    { id: 'c29', icon: '🔮', name: '占卜師的祝福', desc: '接下來 1 個階段事件判定運氣上升', price: 6000, rarity: 'common', effect: { type: 'temp_luck', duration: 1 } },
    { id: 'c30', icon: '🧿', name: '藍眼護身符', desc: '接下來 2 個階段事件判定運氣上升', price: 10000, rarity: 'common', effect: { type: 'temp_luck', duration: 2 } },
    { id: 'c31', icon: '💍', name: '幸運訂婚戒仿製品', desc: '接下來 1 個階段事件判定運氣上升', price: 7000, rarity: 'common', effect: { type: 'temp_luck', duration: 1 } },
    { id: 'c32', icon: '📿', name: '開運念珠手鍊', desc: '接下來 2 個階段事件判定運氣上升', price: 11000, rarity: 'common', effect: { type: 'temp_luck', duration: 2 } },
    { id: 'c33', icon: '🪬', name: '法蒂瑪之手吊飾', desc: '接下來 2 個階段事件判定運氣上升', price: 12000, rarity: 'rare', effect: { type: 'temp_luck', duration: 2 } },
    { id: 'c34', icon: '🎋', name: '七夕祈願竹枝', desc: '接下來 1 個階段事件判定運氣上升', price: 6500, rarity: 'common', effect: { type: 'temp_luck', duration: 1 } },
    { id: 'c35', icon: '🧸', name: '幸運吉祥物娃娃', desc: '接下來 1 個階段事件判定運氣上升', price: 5500, rarity: 'common', effect: { type: 'temp_luck', duration: 1 } },
    { id: 'c36', icon: '🕯️', name: '必勝祈願蠟燭', desc: '接下來 2 個階段事件判定運氣上升', price: 13000, rarity: 'rare', effect: { type: 'temp_luck', duration: 2 } },
    { id: 'c37', icon: '🌟', name: '流星許願瓶', desc: '接下來 3 個階段事件判定運氣上升', price: 20000, rarity: 'rare', effect: { type: 'temp_luck', duration: 3 } },
    { id: 'c38', icon: '🧲', name: '好運磁場手環', desc: '接下來 2 個階段事件判定運氣上升', price: 12500, rarity: 'rare', effect: { type: 'temp_luck', duration: 2 } },
    { id: 'c39', icon: '🎐', name: '開運風鈴', desc: '接下來 1 個階段事件判定運氣上升', price: 7500, rarity: 'common', effect: { type: 'temp_luck', duration: 1 } },
    { id: 'c40', icon: '🀄', name: '職業級好手氣加持', desc: '接下來 4 個階段事件判定運氣上升', price: 28000, rarity: 'legendary', effect: { type: 'temp_luck', duration: 4 } }
  ];

  // 15 款跑車，5 大 tier 各 3 款，逐階解鎖
  const CARS_LIST = [
    { id: 'car_01', tier: 1, name: '二手國民小轎車', price: 100000, icon: '🚗', desc: '代步小車' },
    { id: 'car_02', tier: 1, name: '國產舒適休旅車', price: 400000, icon: '🚙', desc: '載裝備方便' },
    { id: 'car_03', tier: 1, name: '日系街頭跑車', price: 800000, icon: '🏎️', desc: '年輕球員熱門首選' },

    { id: 'car_04', tier: 2, name: '德系豪華房車', price: 1500000, icon: '🚘', desc: '展現身價' },
    { id: 'car_05', tier: 2, name: '美式全尺寸休旅車', price: 1800000, icon: '🚐', desc: '家庭出遊首選' },
    { id: 'car_06', tier: 2, name: '日系性能鋼砲', price: 2400000, icon: '🚗', desc: '街頭性能話題' },

    { id: 'car_07', tier: 3, name: '義式敞篷跑車', price: 4500000, icon: '🏎️', desc: '職業選手代步款' },
    { id: 'car_08', tier: 3, name: '德系性能轎跑', price: 6000000, icon: '🚘', desc: '賽道與街道兼備' },
    { id: 'car_09', tier: 3, name: '全電動豪華轎車', price: 8500000, icon: '🔋', desc: '環保與科技結合' },

    { id: 'car_10', tier: 4, name: '英倫手工訂製轎車', price: 15000000, icon: '🎩', desc: '尊爵不凡' },
    { id: 'car_11', tier: 4, name: '義式超跑經典款', price: 22000000, icon: '🏎️', desc: '明星球員標配' },
    { id: 'car_12', tier: 4, name: '限量聯名塗裝跑車', price: 32000000, icon: '🎨', desc: '全球限量收藏款' },

    { id: 'car_13', tier: 5, name: '頂級競速超跑', price: 50000000, icon: '🏁', desc: '賽道王者之選' },
    { id: 'car_14', tier: 5, name: '私人訂製黃金內裝跑車', price: 75000000, icon: '✨', desc: '頂級奢華座駕' },
    { id: 'car_15', tier: 5, name: '傳奇狂飆賽車巨獸', price: 100000000, icon: '🏎️', desc: '巨星座駕' }
  ];

  // 15 款房產，5 大 tier 各 3 款，逐階解鎖
  const HOUSES_LIST = [
    { id: 'house_01', tier: 1, name: '球隊青年單身宿舍', price: 0, icon: '🏠', desc: '預設居住' },
    { id: 'house_02', tier: 1, name: '市區單身套房', price: 500000, icon: '🏢', desc: '交通便捷' },
    { id: 'house_03', tier: 1, name: '近郊兩房公寓', price: 800000, icon: '🏘️', desc: '空間更寬敞' },

    { id: 'house_04', tier: 2, name: '市中心景觀電梯大樓', price: 3500000, icon: '🏢', desc: '生活機能完善' },
    { id: 'house_05', tier: 2, name: '近郊獨棟別墅', price: 5000000, icon: '🏡', desc: '附庭院車庫' },
    { id: 'house_06', tier: 2, name: '明星水岸豪宅公寓', price: 6000000, icon: '🏙️', desc: '高樓層河景' },

    { id: 'house_07', tier: 3, name: '山景渡假別墅', price: 10000000, icon: '⛰️', desc: '私人渡假天堂' },
    { id: 'house_08', tier: 3, name: '濱海景觀豪宅', price: 16000000, icon: '🌊', desc: '無敵海景第一排' },
    { id: 'house_09', tier: 3, name: '都心頂樓複式豪宅', price: 22000000, icon: '🏙️', desc: '城市天際線美景' },

    { id: 'house_10', tier: 4, name: '私人島嶼度假莊園', price: 40000000, icon: '🏝️', desc: '專屬渡假天堂' },
    { id: 'house_11', tier: 4, name: '古堡風格莊園別墅', price: 60000000, icon: '🏰', desc: '歐風城堡尊榮' },
    { id: 'house_12', tier: 4, name: '頂級社區豪華別墅群', price: 85000000, icon: '🏛️', desc: '名流聚集地' },

    { id: 'house_13', tier: 5, name: '摩天大樓頂層天空別墅', price: 150000000, icon: '🌆', desc: '俯瞰整座城市' },
    { id: 'house_14', tier: 5, name: '私人山頭度假王國', price: 280000000, icon: '🏔️', desc: '專屬領地莊園' },
    { id: 'house_15', tier: 5, name: '傳奇名人堂極致莊園', price: 500000000, icon: '👑', desc: '終極城堡' }
  ];

  let S = {};
  let unlockedCodex = JSON.parse(localStorage.getItem('MYYAKYO_CODEX') || '[]');
  let unlockedAchievements = JSON.parse(localStorage.getItem('MYYAKYO_ACHIEVEMENTS') || '[]');
  let inheritedItem = JSON.parse(localStorage.getItem('MYYAKYO_INHERITED') || 'null');

  function saveCodex(itemId) {
    if (!unlockedCodex.includes(itemId)) {
      unlockedCodex.push(itemId);
      localStorage.setItem('MYYAKYO_CODEX', JSON.stringify(unlockedCodex));
    }
  }

  function unlockAchievement(achId) {
    if (!unlockedAchievements.includes(achId)) {
      unlockedAchievements.push(achId);
      localStorage.setItem('MYYAKYO_ACHIEVEMENTS', JSON.stringify(unlockedAchievements));
      const ach = ACHIEVEMENTS_LIST.find(a => a.id === achId);
      if (ach) {
        addLogCard(`🏆 成就解鎖！【${ach.title}】`, `達成條件解鎖：${ach.desc}！（獲得${ach.titleReward}）`, 'gold', '成就解鎖');
      }
    }
  }

  function checkAchievements() {
    if (!S.name) return;
    if (S.isGeniusBirth) unlockAchievement('ach_61');
    if (S.careerHits >= 1000) unlockAchievement('ach_21');
    if (S.careerHits >= 2000) unlockAchievement('ach_22');
    if (S.careerHits >= 3000) unlockAchievement('ach_23');

    if (S.careerHR >= 150) unlockAchievement('ach_24');
    if (S.careerHR >= 300) unlockAchievement('ach_25');
    if (S.careerHR >= 500) unlockAchievement('ach_26');

    if (S.careerWins >= 50) unlockAchievement('ach_27');
    if (S.careerWins >= 100) unlockAchievement('ach_28');
    if (S.careerWins >= 200) unlockAchievement('ach_29');

    if (S.careerSO >= 1000) unlockAchievement('ach_30');
    if (S.careerSO >= 2500) unlockAchievement('ach_31');

    if (S.careerWAR >= 30) unlockAchievement('ach_32');
    if (S.careerWAR >= 60) unlockAchievement('ach_33');
    if (S.careerWAR >= 100) unlockAchievement('ach_34');

    if (S.rings >= 3) unlockAchievement('ach_39');
    if (S.rings >= 5) unlockAchievement('ach_40');

    if (S.careerSalaryTotal >= 10000000) unlockAchievement('ach_41');
    if (S.careerSalaryTotal >= 50000000) unlockAchievement('ach_42');
    if (S.careerSalaryTotal >= 100000000) unlockAchievement('ach_43');
    if (S.careerSalaryTotal >= 300000000) unlockAchievement('ach_44');
    if (S.careerSalaryTotal >= 500000000) unlockAchievement('ach_45');

    if (S.ownedEquipment.length >= 5) unlockAchievement('ach_49');
    if (S.ownedEquipment.length >= 12) unlockAchievement('ach_50');

    if (S.inventory && S.inventory.reduce((a, b) => a + b.qty, 0) >= 8) unlockAchievement('ach_70');

    if (unlockedCodex.length >= 15) unlockAchievement('ach_79');
    if (S.origin === 'JP' && S.qualifiedForNationals) unlockAchievement('ach_72');
    if (S.origin === 'TW' && S.qualifiedForNationals) unlockAchievement('ach_71');

    // Phase 2-5 新系統勾稽
    const consQty = S.inventory ? S.inventory.reduce((a, b) => a + b.qty, 0) : 0;
    if (consQty >= 15) unlockAchievement('ach_81');
    const ownedRarities = S.ownedEquipment.map(e => e.rarity);
    if (ownedRarities.includes('legendary')) unlockAchievement('ach_82');
    if (ownedRarities.filter(r => r === 'rare' || r === 'legendary').length >= 3) unlockAchievement('ach_83');
    if (S.pocket >= 500000) unlockAchievement('ach_84');
    if (S.ownedAssets.car && CARS_LIST.find(c => c.id === S.ownedAssets.car)?.tier >= 4) unlockAchievement('ach_85');
    if (inheritedItem && inheritedItem.generation >= 3) unlockAchievement('ach_86');
    if (inheritedItem && inheritedItem.generation >= 5) unlockAchievement('ach_87');
  }

  function calcDicePool() {
    let count = 3;
    if (S.age <= 21) count += 3;
    else if (S.age <= 24) count += 2;
    else if (S.age <= 27) count += 1;

    if (S.archetype === 'GENIUS') count += 2;
    else if (S.archetype === 'POWER' || S.archetype === 'SPEED_DEF') count += 1;

    if (S.diceBonus) count += S.diceBonus;
    if (S.activeBuffs) {
      S.activeBuffs.forEach(b => { if (b.type === 'dice' && b.remainingPhases > 0) count += b.amount; });
    }
    return clamp(count, 2, 8);
  }

  function triggerInitialDiceRoll() {
    playDiceSound();

    const numDice = calcDicePool();
    S.currentDicePool = [];
    S.assignedDiceMap = {};
    S.selectedDieId = null;

    for (let i = 0; i < numDice; i++) {
      S.currentDicePool.push({ id: `d_${i}`, val: ri(1, 6), assignedTo: null });
    }

    document.getElementById('btn-trigger-roll-dice').classList.add('hidden');
    document.getElementById('ref-alloc-box').classList.remove('hidden');

    renderRefAllocUI();
  }

  function renderRefAllocUI() {
    const diceContainer = document.getElementById('ref-dice-pool-container');
    diceContainer.innerHTML = S.currentDicePool.map(d => `
      <div class="ref-dice-card ${d.id === S.selectedDieId ? 'selected' : ''} ${d.assignedTo ? 'used' : ''}" data-id="${d.id}">
        ${d.val}
      </div>
    `).join('');

    diceContainer.querySelectorAll('.ref-dice-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const dieObj = S.currentDicePool.find(d => d.id === id);
        if (dieObj && !dieObj.assignedTo) {
          S.selectedDieId = (S.selectedDieId === id) ? null : id;
          renderRefAllocUI();
        }
      });
    });

    const statContainer = document.getElementById('ref-stat-list-container');
    const config = S.position === 'PITCHER'
      ? [
        { key: 'sta', label: '體力' },
        { key: 'vel', label: '球速 (km/h)', maxVal: 165 },
        { key: 'ctl', label: '控球' },
        { key: 'brk', label: '變化球' }
      ]
      : [
        { key: 'sta', label: '體力' },
        { key: 'con', label: 'Contact (打擊)' },
        { key: 'pow', label: '力量' },
        { key: 'spd', label: '速度' },
        { key: 'eye', label: '選球' },
        { key: 'fld', label: '守備範圍' },
        { key: 'cat', label: '接球' },
        { key: 'arm', label: '臂力' }
      ];

    statContainer.innerHTML = config.map(c => {
      const assignedDice = (S.assignedDiceMap[c.key] || []);
      const totalGain = assignedDice.reduce((a, b) => a + b, 0);
      const curVal = S.ab[c.key] || 25;
      const ceiling = S.pot[c.key] || 75;
      const maxRange = c.key === 'vel' ? 165 : 99;

      const curWidth = Math.min(100, (curVal / maxRange) * 100);
      const previewWidth = Math.min(100, ((curVal + totalGain) / maxRange) * 100);
      const ceilingWidth = Math.min(100, (ceiling / maxRange) * 100);

      return `
        <div class="ref-stat-row" data-key="${c.key}">
          <div class="ref-stat-label">${c.label}</div>
          <div class="ref-progress-track">
            <div class="ref-progress-fill" style="width: ${curWidth}%;"></div>
            ${totalGain > 0 ? `<div class="ref-progress-preview" style="left: ${curWidth}%; width: ${previewWidth - curWidth}%;"></div>` : ''}
            <div class="ref-ceiling-line" style="left: ${ceilingWidth}%;" title="天賦上限: ${ceiling}"></div>
          </div>
          <div class="ref-stat-val">
            <strong>${curVal + totalGain}</strong>/${ceiling}
          </div>
        </div>
      `;
    }).join('');

    statContainer.querySelectorAll('.ref-stat-row').forEach(row => {
      row.addEventListener('click', () => {
        const k = row.dataset.key;
        let dieToAssign = null;

        if (S.selectedDieId) {
          dieToAssign = S.currentDicePool.find(d => d.id === S.selectedDieId && !d.assignedTo);
        } else {
          dieToAssign = S.currentDicePool.find(d => !d.assignedTo);
        }

        if (dieToAssign) {
          dieToAssign.assignedTo = k;
          if (!S.assignedDiceMap[k]) S.assignedDiceMap[k] = [];
          S.assignedDiceMap[k].push(dieToAssign.val);
          S.selectedDieId = null;
          renderRefAllocUI();
        }
      });
    });
  }

  function resetDiceAllocations() {
    if (!S.currentDicePool) return;
    S.currentDicePool.forEach(d => d.assignedTo = null);
    S.assignedDiceMap = {};
    S.selectedDieId = null;
    renderRefAllocUI();
  }

  function confirmDiceAllocation() {
    let unassigned = S.currentDicePool.filter(d => !d.assignedTo);
    if (unassigned.length > 0) {
      if (!confirm(`您還有 ${unassigned.length} 顆骰子尚未分配，是否直接確認完成訓練？`)) return;
    }

    let logResults = [];
    let allRolls = S.currentDicePool.map(d => d.val);

    for (let k in S.assignedDiceMap) {
      const vals = S.assignedDiceMap[k];
      if (vals.length > 0) {
        const gainSum = vals.reduce((a, b) => a + b, 0);
        const ceiling = S.pot[k] || 99;
        S.ab[k] = Math.min(ceiling, S.ab[k] + gainSum);
        logResults.push(`🎲 ${k.toUpperCase()}: 分配 [${vals.join(', ')}] 提升 +${gainSum} (現值:${S.ab[k]})`);
      }
    }

    checkDiceComboAwakening(allRolls);

    document.getElementById('btn-trigger-roll-dice').classList.remove('hidden');
    document.getElementById('ref-alloc-box').classList.add('hidden');

    addLogCard('🏋️ 春訓自主訓練完成！', logResults.length > 0 ? logResults.join('<br>') : '未進行屬性分配。', 'good', '春訓結果');
    renderAll();
    nextPhase();
  }

  function addAwakenedTrait(traitName, logMsg) {
    if (!S.awakenedTraits) S.awakenedTraits = [];
    if (!S.awakenedTraits.includes(traitName)) {
      S.awakenedTraits.push(traitName);
      S.traits.push(traitName);
      addLogCard(`⚡ 隱藏宿命覺醒！【${traitName}】`, logMsg, 'gold', '天賦覺醒');
    }
  }

  function checkDiceComboAwakening(rolls) {
    if (!S.diceStats) S.diceStats = { ones: 0, fives: 0, sixes: 0, totalCount: 0 };
    const ds = S.diceStats;

    let currentSixes = 0;
    let currentFives = 0;
    let currentOnes = 0;
    let countMap = {};

    rolls.forEach(r => {
      ds.totalCount++;
      countMap[r] = (countMap[r] || 0) + 1;
      if (r === 6) { ds.sixes++; currentSixes++; }
      if (r === 5) { ds.fives++; currentFives++; }
      if (r === 1) { ds.ones++; currentOnes++; }
    });

    if (currentSixes >= 4 && S.age <= 23) {
      addAwakenedTrait('👑 天才覺醒', '在23歲前驚天骰出 4 個 6 點！訓練骰子永久 +2，全天花板上限 +10！');
      S.diceBonus += 2;
      for (let k in S.pot) S.pot[k] += 10;
    }

    if (currentSixes >= 2 && S.age <= 20) {
      addAwakenedTrait('🌟 少年奇才', '少年時期展現驚人閃光！打擊與力量上限提升！');
      S.ab.con += 4; S.ab.pow += 4;
    }

    if (ds.ones >= 8) {
      addAwakenedTrait('🌋 逆境狂獅', '累積磨練 8 個 1 點逆境重生！關鍵時刻戰術能力暴增 +15！');
    }

    if (ds.ones >= 15) {
      addAwakenedTrait('🛡️ 鋼鐵不屈', '經歷 15 次低谷淬鍊，獲得鋼鐵不壞之身！');
    }

    if (ds.fives >= 20) {
      addAwakenedTrait('🏎️ 賽道跑車', '累積 20 個 5 點，跑壘天賦大爆發！跑壘+10！');
      S.ab.spd = Math.min(99, S.ab.spd + 10);
    }

    if (ds.sixes >= 30) {
      addAwakenedTrait('✨ 神明眷顧', '生涯累積 30 個 6 點，獲得神明眷顧之體質！');
    }

    const sorted = rolls.slice().sort((a, b) => a - b);
    const isStraight = sorted.length >= 5 && sorted.every((val, i) => i === 0 || val === sorted[i - 1] + 1);
    if (isStraight) {
      addAwakenedTrait('🌈 七彩怪胎', '擲出極其罕見的大順子！全能力上限解鎖至 99 滿分！');
      for (let k in S.pot) S.pot[k] = 99;
    }

    for (let num in countMap) {
      if (countMap[num] >= 3) {
        addAwakenedTrait('🎯 專注發狂', `單次擲出 3 顆以上的 ${num} 點同號豹子！能力大躍進！`);
        S.ab.con += 3; S.ab.pow += 3;
        break;
      }
    }
  }

  function resetState(name, origin, position, subpos, archetypeChoice, seed) {
    seedInit(seed || Math.random().toString(36).slice(2, 10));

    const isGeniusRoll = R() < 0.08;
    const finalArchetype = isGeniusRoll ? 'GENIUS' : archetypeChoice;

    S = {
      name: name || '佐藤大樹',
      origin: origin || 'JP',
      position: position,
      subpos: subpos || 'IF',
      dpos: position === 'PITCHER' ? 'P' : (subpos === 'C' ? 'C' : (subpos === 'IF' ? 'SS' : 'CF')),
      role: position === 'PITCHER' ? 'SP' : (position === 'TWOWAY' ? 'SP/DH' : 'DH'),
      archetype: finalArchetype,
      isGeniusBirth: isGeniusRoll,

      age: 16,
      year: 2026,
      stage: 'HS1',
      leagueKey: origin === 'JP' ? 'HS_JP' : 'HS_TW',
      team: origin === 'JP' ? HS_JP_TEAMS[ri(0, HS_JP_TEAMS.length - 1)] : HS_TW_TEAMS[ri(0, HS_TW_TEAMS.length - 1)],

      ab: { con: 30, pow: 28, spd: 32, arm: 30, fld: 30, cat: 25, eye: 28, vel: 132, ctl: 28, brk: 26, sta: 35 },
      pot: { con: 82, pow: 80, spd: 78, arm: 76, fld: 78, cat: 70, eye: 80, vel: 156, ctl: 80, brk: 82, sta: 85 },

      traits: [],
      awakenedTraits: [],
      diceStats: { ones: 0, fives: 0, sixes: 0, totalCount: 0 },
      currentDicePool: [],
      assignedDiceMap: {},
      selectedDieId: null,
      diceBonus: 0,
      chanceCardDrawnThisPhase: false,
      activeBuffs: [],
      daikichiCount: 0,
      qualifiedForNationals: false,

      money: 100000,
      pocket: 20000,
      salary: 0,
      contractYears: 3,
      careerSalaryTotal: 0,
      relationship: null,

      maxUnlockedAssetTier: 1,
      ownedAssets: { house: 'house_01', car: null },

      ownedEquipment: [],
      runShopPool: [],
      runConsumablePool: [],
      inventory: [],
      pendingEvents: [],

      stats: [], trophies: [], rings: 0,
      careerWAR: 0, careerHits: 0, careerHR: 0, careerWins: 0, careerSO: 0,
      managerStats: { years: 0, wins: 0, losses: 0, titles: 0 }
    };

    applyArchetypeBonus();
    applyInheritedItemBonus();
    initRunShopPool();
    queueMandatoryEvents();
    checkAchievements();
  }

  function applyArchetypeBonus() {
    const a = S.ab;
    if (S.isGeniusBirth) {
      a.con += 8; a.pow += 8; a.vel += 5; a.brk += 5;
      S.traits.push('👑 天才降生 (8%幸運)');
    } else if (S.archetype === 'POWER') {
      a.pow += 8; a.con += 3; a.vel += 5; S.traits.push('💥 怪力無雙');
    } else if (S.archetype === 'SPEED_DEF') {
      a.spd += 8; a.fld += 6; a.ctl += 6; S.traits.push('⚡ 疾風雷射肩');
    } else {
      a.con += 4; a.pow += 4; a.spd += 4; a.ctl += 4; S.traits.push('⚖️ 全能基石');
    }

    if (S.position === 'TWOWAY') S.traits.push('⚔️ 大谷雙刀流');
  }

  // 野球的傳承：依裝備稀有度隨機挑選一段傳承劇情
  const LEGACY_STORY_TEMPLATES = {
    common: [
      '這是由 {name} 使用過的 {item}，帶著簡單卻真摯的祝福傳到你手中。',
      '退休整理球具室時，隊友留下這件 {item}，並附上一張紙條：「交給下一個相信自己的人。」',
      '{name} 引退前隨手把 {item} 留在置物櫃，成為你野球生涯的起點。'
    ],
    rare: [
      '{name} 引退那天特地把 {item} 交到你手上，說著：「這是我最信賴的夥伴，換你了。」',
      '你曾是 {name} 的後援球僮，他將視若珍寶的 {item} 當作傳承禮物送給你。',
      '球隊解散前的最後一次聚餐，{name} 鄭重地把 {item} 交給了你，象徵棒球魂的延續。'
    ],
    legendary: [
      '傳說中，{name} 曾用 {item} 寫下無數傳奇。如今，這件傳家寶正式傳承到你的手中——野球的血脈，仍在延續。',
      '在名人堂的展示櫃前，{name} 親自取下珍藏多年的 {item}，交給你說：「輪到你創造屬於自己的傳奇了。」',
      '族譜般的傳承儀式上，{name} 家族世代相傳的 {item} 終於交棒到你手中，承載著跨世代的野球信仰。'
    ]
  };

  function pickLegacyStory(item, fromName) {
    const pool = LEGACY_STORY_TEMPLATES[item.rarity] || LEGACY_STORY_TEMPLATES.common;
    const template = pool[ri(0, pool.length - 1)];
    return template.replace('{name}', fromName).replace('{item}', item.name);
  }

  function applyInheritedItemBonus() {
    if (!inheritedItem) return;
    const item = ALL_PROPOSALS.find(e => e.id === inheritedItem.id);
    if (item) {
      S.ownedEquipment.push(item);
      for (let k in item.stat) S.ab[k] = (S.ab[k] || 0) + item.stat[k];
      S.traits.push(`🎁 傳承(第${inheritedItem.generation || 1}代): ${item.name}`);
      unlockAchievement('ach_77');
      unlockAchievement('ach_78');
    }
  }

  function initRunShopPool() {
    // 常駐裝備刻意稀有：每局只隨機開出 1-3 種，讓收集與世代傳承有意義
    const shuffled = ALL_PROPOSALS.slice().sort(() => R() - 0.5);
    S.runShopPool = shuffled.slice(0, ri(1, 3));

    const shuffledCons = CONSUMABLES.slice().sort(() => R() - 0.5);
    S.runConsumablePool = shuffledCons.slice(0, 12);
  }

  function calcOVR() {
    const a = S.ab;
    if (S.position === 'PITCHER') return Math.round(((a.vel - 120) * 0.8 + a.ctl * 1.2 + a.brk * 1.1 + a.sta * 0.5) / 3.2);
    if (S.position === 'TWOWAY') return Math.round((((a.con + a.pow + a.eye) / 3) + (((a.vel - 120) + a.ctl + a.brk) / 3)) / 2);
    return Math.round((a.con * 1.3 + a.pow * 1.2 + a.eye * 1.0 + a.spd * 0.7 + a.fld * 0.8) / 5);
  }

  /* 🪜 多階梯隊升降演算法 (Promotion / Relegation Engine) */
  function evaluatePromotionOrRelegation(s) {
    if (S.stage !== 'PRO') return;
    const curLeague = LEAGUES[S.leagueKey];
    if (!curLeague) return;

    const ovr = calcOVR();

    // 晉升判定：評分超出現有層級門檻 6 分以上且 WAR 優秀
    if (curLeague.next && ovr >= curLeague.par + 5) {
      const nextLeagueKey = curLeague.next;
      S.leagueKey = nextLeagueKey;
      addLogCard('★ 梯隊晉升通知！', `表現極度亮眼！獲得球團肯定，晉升至【${LEAGUES[nextLeagueKey].n}】戰場！`, 'gold', '梯隊升級');
    }
    // 降級判定：評分低於現有層級門檻 8 分以上且表現持續沉淪
    else if (curLeague.prev && ovr < curLeague.par - 8) {
      const prevLeagueKey = curLeague.prev;
      S.leagueKey = prevLeagueKey;
      addLogCard('⚠️ 梯隊下放通知！', `近況低迷，教練團將你下放至【${LEAGUES[prevLeagueKey].n}】調整心態。`, 'bad', '梯隊降級');
    }
  }

  function simSeason() {
    const L = LEAGUES[S.leagueKey] || LEAGUES.HS_TW;
    const a = S.ab;
    const diff = calcOVR() - L.par;
    const isPro = S.stage === 'PRO';
    const isCollege = S.stage.startsWith('UNI');

    if (S.age >= 30) {
      a.sta = Math.max(10, a.sta - 1);
      a.spd = Math.max(10, a.spd - 1);
      if (a.vel > 130) a.vel -= 1;
    }

    let s = {
      year: S.year, age: S.age, league: L.n, team: S.team,
      isBatter: S.position === 'BATTER' || S.position === 'TWOWAY',
      isPitcher: S.position === 'PITCHER' || S.position === 'TWOWAY',

      G: 0, PA: 0, AB: 0, H: 0, HR: 0, RBI: 0, BB: 0, SB: 0, E: 0,
      AVG: 0, OBP: 0, SLG: 0, OPS: 0, batWAR: 0,

      pG: 0, W: 0, L: 0, ERA: 0, WHIP: 0, IP: 0, SO: 0, CG: 0, SHO: 0, pitWAR: 0,

      teamW: 0, teamL: 0, rank: ri(1, 4), isChampion: false,
      contractRemaining: S.contractYears
    };

    if (!isPro) {
      const totalTourneyGames = isCollege ? ri(14, 22) : ri(6, 14);
      s.teamW = Math.round(totalTourneyGames * 0.65); s.teamL = totalTourneyGames - s.teamW;
      s.isChampion = s.teamL <= 1;

      if (s.isBatter) {
        s.G = totalTourneyGames; s.PA = Math.round(s.G * 4.0); s.AB = Math.round(s.PA * 0.88); s.BB = Math.round(s.PA * 0.10);
        s.H = Math.round(s.AB * clamp(0.280 + diff * 0.005 + (a.con - 40) * 0.003, 0.200, 0.450));
        s.AVG = +(s.H / Math.max(1, s.AB)).toFixed(3);
        s.OBP = +((s.H + s.BB) / Math.max(1, s.PA)).toFixed(3);
        s.HR = Math.round(s.AB * clamp(0.03 + (a.pow - 30) * 0.003, 0.0, 0.15));
        s.SLG = +(s.AVG + 0.18).toFixed(3); s.OPS = +(s.OBP + s.SLG).toFixed(3);
        s.RBI = Math.round(s.HR * 1.6 + s.H * 0.3); s.SB = ri(1, 8); s.E = ri(0, 3);
        s.batWAR = +((s.OPS - 0.700) * 1.5).toFixed(1);
      }

      if (s.isPitcher) {
        s.pG = totalTourneyGames; s.IP = +(s.pG * 5.0).toFixed(1);
        s.W = Math.round(s.pG * 0.6); s.L = Math.max(0, s.pG - s.W);
        s.ERA = +clamp(3.20 - diff * 0.08, 0.80, 5.50).toFixed(2);
        s.WHIP = +(1.15 - diff * 0.01).toFixed(2); s.SO = Math.round(s.IP * 1.1);
        s.pitWAR = +((4.00 - s.ERA) * 0.8).toFixed(1);
      }

      s.honors = s.isChampion ? (isCollege ? '大專聯賽冠軍 🏆' : '甲子園全國制霸 🏆') : '八強複賽';
    } else {
      s.teamW = ri(65, 88); s.teamL = ri(50, 70);
      s.isChampion = s.rank === 1 && R() < 0.6;
      if (s.isChampion) {
        S.rings += 1;
        unlockAchievement('ach_39');
        s.honors = '總冠軍 🏆';
      } else { s.honors = '-'; }

      if (s.isBatter) {
        s.G = Math.round(clamp(120 * (0.75 + diff * 0.015 + R() * 0.1), 30, 125));
        s.PA = Math.round(s.G * 3.8); s.AB = Math.round(s.PA * 0.88); s.BB = Math.round(s.PA * 0.10);
        s.H = Math.round(s.AB * clamp(0.250 + diff * 0.004 + (a.con - 40) * 0.002, 0.180, 0.390));
        s.AVG = +(s.H / Math.max(1, s.AB)).toFixed(3);
        s.OBP = +((s.H + s.BB) / Math.max(1, s.PA)).toFixed(3);

        s.HR = Math.round(s.AB * clamp(0.02 + (a.pow - 30) * 0.0025, 0.005, 0.11));
        const doubles = Math.round(s.H * 0.2); const triples = Math.round(s.H * 0.03);
        const singles = Math.max(0, s.H - s.HR - doubles - triples);
        const totalBases = singles + doubles * 2 + triples * 3 + s.HR * 4;
        s.SLG = +(totalBases / Math.max(1, s.AB)).toFixed(3);
        s.OPS = +(s.OBP + s.SLG).toFixed(3);

        s.RBI = Math.round(s.HR * 1.8 + s.H * 0.25 + ri(0, 10));
        s.SB = Math.round((a.spd / 100) * ri(5, 30)); s.E = Math.max(0, ri(1, 12) - Math.round(a.fld / 15));
        s.batWAR = +((s.OPS - 0.700) * 8).toFixed(1);
        S.careerHits += s.H; S.careerHR += s.HR;
      }

      if (s.isPitcher) {
        s.pG = 25; s.IP = +(s.pG * clamp(5.5 + diff * 0.04, 4.5, 7.1)).toFixed(1);
        s.W = Math.round(s.pG * 0.55); s.L = Math.max(0, s.pG - s.W);
        s.ERA = +clamp(4.20 - diff * 0.08, 1.20, 7.50).toFixed(2);
        s.WHIP = +(1.35 - diff * 0.012).toFixed(2);
        s.SO = Math.round((s.IP / 9) * clamp(6.5 + (a.vel - 135) * 0.15, 4.0, 13.5));
        s.CG = Math.round(s.pG * 0.15); s.SHO = Math.round(s.CG * 0.4);

        s.pitWAR = +((4.50 - s.ERA) * (s.IP / 40)).toFixed(1);
        S.careerWins += s.W; S.careerSO += s.SO;
      }

      if (S.salary > 0) {
        S.money += Math.round(S.salary * 0.3);
        S.careerSalaryTotal += S.salary;
        S.contractYears = Math.max(1, S.contractYears - 1);
        if (S.contractYears === 1) {
          S.contractYears = ri(2, 4);
          S.salary = Math.round(S.salary * clamp(1 + s.batWAR * 0.08, 0.9, 1.5));
          addLogCard('💳 自由球員續約', `表現優異！球團與你簽下 ${S.contractYears} 年複數年合約，年薪調整至 $${(S.salary / 10000).toFixed(0)}萬！`, 'gold', '合約簽署');
        }
      }

      evaluatePromotionOrRelegation(s);
    }

    S.pocket = (S.pocket || 0) + (isPro && S.salary > 0 ? Math.round(S.salary * 0.05) : 15000);

    const yearWAR = +((s.batWAR || 0) + (s.pitWAR || 0)).toFixed(1);
    S.careerWAR = +(S.careerWAR + yearWAR).toFixed(1);
    S.stats.push(s);

    checkAchievements();
    renderSeasonSettlementBox(s);
    renderCareerStatsTable();
    return s;
  }

  function renderSeasonSettlementBox(s) {
    const box = document.getElementById('season-settlement-display-box');
    if (!box) return;

    box.classList.remove('hidden');
    const isBatter = s.isBatter;

    box.innerHTML = `
      <div class="settlement-block">
        <div class="settlement-label">◆ 體力與健康回報</div>
        <p class="text-sm">本季平安出賽。(受傷機率 ${ri(12, 35)}%)</p>
      </div>

      <div class="settlement-block">
        <div class="settlement-label">◆ 球季數據</div>
        <span class="settlement-team-badge">${s.team} (${s.league})</span>
        <div class="settlement-box-text">
          ${isBatter
        ? `出賽 ${s.G} | 打席 ${s.PA} | 打擊率 .${(s.AVG * 1000).toFixed(0).padStart(3, '0')} | 上壘率 .${(s.OBP * 1000).toFixed(0).padStart(3, '0')} | 長打率 .${(s.SLG * 1000).toFixed(0).padStart(3, '0')} | OPS .${(s.OPS * 1000).toFixed(0).padStart(3, '0')} | 安打 ${s.H} | 全壘打 ${s.HR} | 打點 ${s.RBI} | 保送 ${s.BB} | 盜壘 ${s.SB} | 守備 ${s.E}`
        : `出賽 ${s.pG} | 勝 ${s.W} | 敗 ${s.L} | 防禦率 ${s.ERA.toFixed(2)} | WHIP ${s.WHIP.toFixed(2)} | 投球局數 ${s.IP} | 奪三振 ${s.SO} | 完投 ${s.CG} | 完封 ${s.SHO}`}
        </div>
      </div>

      <div class="settlement-block">
        <div class="settlement-label">◆ 季末結算與戰績</div>
        <p class="text-sm">${S.salary > 0 ? `本年度薪資：<strong class="hl-gold">$${(S.salary / 10000).toFixed(0)}萬</strong> (生涯累計 $${(S.careerSalaryTotal / 10000).toFixed(0)}萬) | 合約剩餘 ${S.contractYears} 年` : '業餘盃賽經驗積累'}</p>
        <p class="text-sm mt-1">球隊戰績 ${s.teamW}勝${s.teamL}敗 (${s.rank > 0 ? `排名 ${s.rank}` : '盃賽'}) ${s.isChampion ? '| 榮獲總冠軍 🏆' : ''}</p>
      </div>

      <div class="settlement-block">
        <div class="settlement-label">◆ 升降級與升遷通知</div>
        <p class="text-sm hl-green">表現獲得肯定，穩居 ${s.league} 主要戰力！</p>
      </div>
    `;
  }

  function renderCareerStatsTable() {
    const tbody = document.getElementById('career-stats-tbody');
    if (!tbody || !S.stats) return;

    if (S.stats.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-muted">尚無賽季數據。</td></tr>`;
      return;
    }

    tbody.innerHTML = S.stats.map(s => `
      <tr>
        <td>${s.year}</td>
        <td>${s.age}歲</td>
        <td>${s.team} (${s.league})</td>
        <td>${s.G || s.pG}</td>
        <td>${s.isBatter ? '.' + (s.AVG * 1000).toFixed(0).padStart(3, '0') : `${s.W}勝${s.L}敗`}</td>
        <td>${s.isBatter ? '.' + (s.OPS * 1000).toFixed(0).padStart(3, '0') : s.ERA.toFixed(2)}</td>
        <td><strong class="hl-gold">${s.batWAR || s.pitWAR}</strong></td>
        <td>${s.teamW}勝${s.teamL}敗</td>
        <td>${s.honors || '-'}</td>
      </tr>
    `).join('');
  }

  function renderAll() {
    document.getElementById('current-seed-code').textContent = SEED_STR;
    document.getElementById('player-name-display').textContent = S.name;
    document.getElementById('stat-age').textContent = `${S.age} 歲`;
    document.getElementById('stat-league').textContent = `${S.team} (${LEAGUES[S.leagueKey].n})`;
    document.getElementById('stat-ovr').textContent = calcOVR();
    document.getElementById('stat-money').textContent = `$${(S.money / 10000).toFixed(1)}萬`;
    document.getElementById('stat-pocket').textContent = `$${(S.pocket / 10000).toFixed(1)}萬`;

    document.getElementById('badge-origin').textContent = S.origin === 'JP' ? '🇯🇵 日本出生' : '🇹🇼 台灣出生';
    document.getElementById('badge-team').textContent = S.team;
    document.getElementById('badge-pos').textContent = S.dpos;

    document.getElementById('current-year-display').textContent = `西元 ${S.year} 年`;
    document.getElementById('current-stage-display').textContent = `【${getStageLabel()}】`;

    const chanceBtn = document.getElementById('btn-draw-chance-card');
    chanceBtn.disabled = S.chanceCardDrawnThisPhase;
    chanceBtn.textContent = S.chanceCardDrawnThisPhase ? '🃏 本季機會卡已抽取' : '🃏 抽機會卡（可自由選擇）';

    renderTraits();
    renderMandatoryEvents();
    renderShop();
    renderInventory();
    renderAssets();
    renderCodex();
    renderAchievements();
    renderCareerStatsTable();
    renderRadarChart();
  }

  function getStageLabel() {
    if (S.stage === 'HS1') return S.origin === 'JP' ? '高一 (地區預選大會)' : '高一 (木棒聯賽)';
    if (S.stage === 'HS2') return S.origin === 'JP' ? '高二 (阪神甲子園大會)' : '高二 (黑豹旗)';
    if (S.stage === 'HS3') return S.origin === 'JP' ? '高三 (夏季甲子園決戰)' : '高三 (玉山盃與選秀抉擇)';
    if (S.stage.startsWith('UNI')) return `大學棒球 (${S.stage.replace('UNI', '大')}階段)`;
    if (S.stage === 'DRAFT') return '職棒選秀指名';
    if (S.stage === 'PRO') return `職棒階段 - ${LEAGUES[S.leagueKey].n}`;
    if (S.stage === 'RETIRED') return '退役名人堂';
    return '棒球生涯';
  }

  function renderTraits() {
    document.getElementById('traits-list').innerHTML = S.traits.map(t => `<span class="trait-tag trait-good">${t}</span>`).join('');
  }

  function renderShop() {
    const permGrid = document.getElementById('shop-permanent-grid');
    permGrid.innerHTML = S.runShopPool.map(item => {
      const owned = S.ownedEquipment.some(e => e.id === item.id);
      return `
        <div class="item-card rarity-${item.rarity}">
          <div class="item-card-header">
            <span class="item-icon">${item.icon}</span>
            <span class="item-name">${item.name}</span>
          </div>
          <div class="item-desc">${item.desc}</div>
          <div class="item-footer">
            <span class="item-price">$${(item.price / 10000).toFixed(0)}萬</span>
            <button class="btn-buy" ${owned || S.pocket < item.price ? 'disabled' : ''} onclick="window.buyPermanent('${item.id}')">
              ${owned ? '已擁有' : '購買'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    const consGrid = document.getElementById('shop-consumable-grid');
    consGrid.innerHTML = S.runConsumablePool.map(item => `
      <div class="item-card rarity-${item.rarity}">
        <div class="item-card-header">
          <span class="item-icon">${item.icon}</span>
          <span class="item-name">${item.name}</span>
        </div>
        <div class="item-desc">${item.desc}</div>
        <div class="item-footer">
          <span class="item-price">$${(item.price / 10000).toFixed(1)}萬</span>
          <button class="btn-buy" ${S.pocket < item.price ? 'disabled' : ''} onclick="window.buyConsumable('${item.id}')">購買</button>
        </div>
      </div>
    `).join('');
  }

  function renderInventory() {
    const list = document.getElementById('inventory-list');
    if (!S.inventory.length) {
      list.innerHTML = `<span class="text-muted text-sm">背包空空如也。</span>`;
      return;
    }
    list.innerHTML = S.inventory.map(inv => {
      const item = CONSUMABLES.find(c => c.id === inv.id);
      if (!item) return '';
      return `
        <div class="inventory-item-card">
          <span class="item-icon">${item.icon}</span>
          <span class="item-name">${item.name} <span class="inv-qty">x${inv.qty}</span></span>
          <span class="item-desc">${item.desc}</span>
          <button class="btn-buy btn-use" onclick="window.useItem('${item.id}')">使用</button>
        </div>
      `;
    }).join('');
  }

  window.buyPermanent = function (id) {
    const item = ALL_PROPOSALS.find(e => e.id === id);
    if (item && S.pocket >= item.price) {
      S.pocket -= item.price;
      S.ownedEquipment.push(item);
      saveCodex(item.id);
      for (let k in item.stat) S.ab[k] = (S.ab[k] || 0) + item.stat[k];
      S.traits.push(`🛡️ 裝備: ${item.name}`);
      addLogCard('🛒 購買常駐裝備', `解鎖【${item.name}】！能力永久提升！`, 'gold', '購物成功');
      checkAchievements();
      renderAll();
    }
  };

  window.buyConsumable = function (id) {
    const item = CONSUMABLES.find(c => c.id === id);
    if (item && S.pocket >= item.price) {
      S.pocket -= item.price;
      const existing = S.inventory.find(inv => inv.id === id);
      if (existing) existing.qty += 1;
      else S.inventory.push({ id: item.id, qty: 1 });
      addLogCard('🛒 購買補給品', `購入【${item.name}】，已收入背包！`, 'good', '購物成功');
      checkAchievements();
      renderAll();
    }
  };

  window.useItem = function (id) {
    const invEntry = S.inventory.find(inv => inv.id === id);
    const item = CONSUMABLES.find(c => c.id === id);
    if (!invEntry || !item) return;

    const eff = item.effect;
    let msg = '';
    if (eff.type === 'heal_sta') {
      S.ab.sta = clamp((S.ab.sta || 25) + eff.amount, 10, S.pot.sta || 99);
      msg = `體力恢復 +${eff.amount}！`;
    } else if (eff.type === 'dice_bonus') {
      S.activeBuffs.push({ type: 'dice', amount: eff.amount, remainingPhases: eff.duration });
      msg = `接下來 ${eff.duration} 個階段，訓練骰子 +${eff.amount} 顆！`;
    } else if (eff.type === 'temp_luck') {
      S.activeBuffs.push({ type: 'luck', amount: 1, remainingPhases: eff.duration });
      msg = `接下來 ${eff.duration} 個階段，事件判定運氣上升！`;
    }

    invEntry.qty -= 1;
    if (invEntry.qty <= 0) S.inventory = S.inventory.filter(inv => inv.id !== id);

    addLogCard(`🎒 使用道具 | ${item.icon} ${item.name}`, msg, 'good', '道具使用');
    renderAll();
  };

  const ASSET_TIER_LABELS = { 1: '新秀等級', 2: '小有成就', 3: '明星等級', 4: '巨星等級', 5: '傳奇殿堂' };

  function renderAssetTierGroups(list, ownedId, buyFnName, ownedLabel) {
    const visible = list.filter(item => item.tier <= S.maxUnlockedAssetTier + 1);
    const tiers = [...new Set(visible.map(i => i.tier))];

    return tiers.map(tier => {
      const cards = visible.filter(i => i.tier === tier).map(item => {
        const owned = ownedId === item.id;
        const locked = item.tier > S.maxUnlockedAssetTier;
        const affordable = S.money >= item.price;
        return `
          <div class="asset-card ${locked ? 'locked' : ''} ${owned ? 'owned' : ''}">
            ${locked ? '<span class="asset-lock-badge">🔒</span>' : ''}
            <div class="asset-icon">${item.icon}</div>
            <div class="asset-name">${item.name}</div>
            <div class="asset-desc">${item.desc}</div>
            <div class="asset-footer">
              <span class="asset-price">${item.price === 0 ? '免費' : `$${(item.price / 10000).toFixed(0)}萬`}</span>
              <button class="btn-buy" ${locked || owned || !affordable ? 'disabled' : ''} onclick="window.${buyFnName}('${item.id}', ${item.tier})">
                ${owned ? ownedLabel : (locked ? '尚未解鎖' : '購買')}
              </button>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="asset-tier-group">
          <div class="asset-tier-header">Tier ${tier} · ${ASSET_TIER_LABELS[tier] || ''}</div>
          <div class="assets-grid">${cards}</div>
        </div>
      `;
    }).join('');
  }

  function renderAssets() {
    document.getElementById('assets-cars-grid').innerHTML = renderAssetTierGroups(CARS_LIST, S.ownedAssets.car, 'buyCar', '已駕駛');
    document.getElementById('assets-houses-grid').innerHTML = renderAssetTierGroups(HOUSES_LIST, S.ownedAssets.house, 'buyHouse', '已入住');
  }

  window.buyCar = function (id, tier) {
    const car = CARS_LIST.find(c => c.id === id);
    if (car && S.money >= car.price) {
      S.money -= car.price;
      S.ownedAssets.car = car.id;
      if (tier >= S.maxUnlockedAssetTier) S.maxUnlockedAssetTier = tier + 1;
      if (tier === 5) unlockAchievement('ach_48');
      addLogCard('🏎️ 豪車交車', `成功購買【${car.name}】！解鎖更佳跑車！`, 'gold', '資產解鎖');
      renderAll();
    }
  };

  window.buyHouse = function (id, tier) {
    const house = HOUSES_LIST.find(h => h.id === id);
    if (house && S.money >= house.price) {
      S.money -= house.price;
      S.ownedAssets.house = house.id;
      if (tier >= S.maxUnlockedAssetTier) S.maxUnlockedAssetTier = tier + 1;
      if (tier === 5) unlockAchievement('ach_47');
      addLogCard('🏰 豪宅入住', `入住【${house.name}】！解鎖下一階極致莊園！`, 'gold', '資產解鎖');
      renderAll();
    }
  };

  function renderCodex() {
    const grid = document.getElementById('codex-grid');
    grid.innerHTML = ALL_PROPOSALS.map(item => {
      const unlocked = unlockedCodex.includes(item.id);
      return `
        <div class="codex-card ${unlocked ? 'unlocked' : ''}">
          <div class="item-icon">${item.icon}</div>
          <div class="item-name">${unlocked ? item.name : '??? (未解鎖)'}</div>
          <div class="item-desc">${unlocked ? item.desc : '於商店購買後解鎖圖鑑與繼承'}</div>
        </div>
      `;
    }).join('');
  }

  function renderAchievements() {
    const grid = document.getElementById('achievements-grid');
    grid.innerHTML = ACHIEVEMENTS_LIST.map(ach => {
      const unlocked = unlockedAchievements.includes(ach.id);
      return `
        <div class="achievement-card ${unlocked ? 'unlocked' : ''}">
          <div class="achieve-header">
            <span class="achieve-icon">${ach.icon}</span>
            <span class="achieve-title">${ach.title}</span>
          </div>
          <div class="achieve-desc">${ach.desc}</div>
          <span class="achieve-reward-tag">${unlocked ? '✅ ' + ach.titleReward : '🔒 解鎖後獲得稱號'}</span>
        </div>
      `;
    }).join('');
  }

  function renderRadarChart() {
    const ctx = document.getElementById('attributes-radar-chart').getContext('2d');
    const a = S.ab;
    const labels = ['打擊', '力量', '選球', '跑壘', '守備', '控球/球速'];
    const data = [a.con, a.pow, a.eye, a.spd, a.fld, a.ctl || Math.round((a.vel - 120) * 1.5)];

    if (window.radarChartInstance) window.radarChartInstance.destroy();
    window.radarChartInstance = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: 'rgba(42, 157, 143, 0.25)',
          borderColor: '#2a9d8f',
          borderWidth: 2,
          pointBackgroundColor: '#f4a261'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { r: { suggestedMin: 10, suggestedMax: 90, ticks: { display: false } } },
        plugins: { legend: { display: false } }
      }
    });
  }

  function addLogCard(title, text, type = 'info', tag = '日誌') {
    const feed = document.getElementById('narrative-log-feed');
    if (!feed) return;
    const card = document.createElement('div');
    card.className = `log-card ${type}`;
    card.innerHTML = `
      <div class="log-card-header">
        <span class="log-card-title">${title}</span>
        <span class="log-card-tag">${tag}</span>
      </div>
      <div class="log-card-body">${text}</div>
    `;
    feed.insertBefore(card, feed.firstChild);
  }

  function nextPhase() {
    if (S.stage === 'RETIRED') { showRetirementScreen(); return; }

    const unresolvedCount = (S.pendingEvents || []).filter(pe => !pe.resolved).length;
    if (unresolvedCount > 0 && !confirm(`本季還有 ${unresolvedCount} 件事件尚未處理，確定要跳過並前進下一階段嗎？`)) return;

    document.getElementById('container-choices').classList.add('hidden');
    S.chanceCardDrawnThisPhase = false;
    tickBuffs();

    if (S.stage.startsWith('HS')) {
      const stat = simSeason();
      if (S.stage === 'HS1') { showRegionalQualifierEvent(); }
      else if (S.stage === 'HS2') { S.stage = 'HS3'; S.year += 1; S.age += 1; queueMandatoryEvents(); }
      else { S.stage = 'DRAFT'; showDraftChoices(); }
      renderAll();
    } else if (S.stage.startsWith('UNI')) {
      const stat = simSeason();
      const goingToDraft = (S.stage === 'UNI4');
      if (S.stage === 'UNI1') S.stage = 'UNI2';
      else if (S.stage === 'UNI2') S.stage = 'UNI3';
      else if (S.stage === 'UNI3') S.stage = 'UNI4';
      else { S.stage = 'DRAFT'; showDraftChoices(); }
      S.year += 1; S.age += 1;
      if (!goingToDraft) queueMandatoryEvents();
      renderAll();
    } else if (S.stage === 'PRO') {
      const stat = simSeason();

      if (S.age >= 34) {
        if (confirm(`【老將退役抉擇】您今年已 ${S.age} 歲，身體素質逐漸下滑，是否決定宣佈正式引退，脫下戰袍開啟第二人生？`)) {
          S.stage = 'RETIRED';
          renderAll();
          showRetirementScreen();
          return;
        }
      }

      if (S.age >= 42) {
        S.stage = 'RETIRED';
        renderAll();
        showRetirementScreen();
        return;
      }

      S.year += 1; S.age += 1;
      queueMandatoryEvents();
      renderAll();
    }
  }

  // 出生地分岔：高一結束後的地區資格賽，決定能否晉級甲子園/黑豹旗全國大賽
  function showRegionalQualifierEvent() {
    const choicesPanel = document.getElementById('container-choices');
    choicesPanel.classList.remove('hidden');

    const reveal = document.getElementById('dice-roll-reveal');
    reveal.classList.add('hidden');
    reveal.innerHTML = '';

    const label = S.origin === 'JP' ? '地區預選資格賽' : '黑豹旗資格甄選賽';
    const target = S.origin === 'JP' ? '阪神甲子園大會' : '黑豹旗全國大賽';

    document.getElementById('choices-title').textContent = `◆ ${label} — 你要如何備戰？`;
    document.getElementById('choices-desc').textContent = `這是晉級【${target}】的關鍵資格賽，你的應對策略將決定能否踏上全國舞台！`;

    document.getElementById('choices-grid').innerHTML = ['high', 'med', 'low'].map(tier => `
      <div class="btn-choice ${tier === 'high' ? 'high-risk' : tier === 'med' ? 'med-risk' : 'low-risk'}" data-risk="${tier}">
        <span class="btn-choice-title">${RISK_ROLL_TABLE[tier].label}</span>
        <span class="btn-choice-sub">${RISK_ROLL_TABLE[tier].sub}</span>
      </div>
    `).join('');

    document.querySelectorAll('#choices-grid .btn-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled')) return;
        document.querySelectorAll('#choices-grid .btn-choice').forEach(b => b.classList.add('disabled'));
        animateDiceRoll(reveal, btn.dataset.risk, (result) => {
          document.getElementById('container-choices').classList.add('hidden');

          S.qualifiedForNationals = result.success;
          S.ab.sta = clamp((S.ab.sta || 25) + result.mag, 10, S.pot.sta || 99);

          if (result.success) {
            addLogCard(`◆ ${label}`, `🎉 成功晉級！你的球隊將踏上【${target}】的全國舞台！（🎲 擲出 ${result.roll} 點・${result.tag}）`, 'good', '資格賽');
          } else {
            addLogCard(`◆ ${label}`, `😢 資格賽失利，無緣挑戰【${target}】，但這段經歷成為你邁向下個舞台的養分。（🎲 擲出 ${result.roll} 點・${result.tag}）`, 'bad', '資格賽');
          }

          S.stage = 'HS2'; S.year += 1; S.age += 1;
          queueMandatoryEvents();
          checkAchievements();
          renderAll();
        });
      });
    });
  }

  function showDraftChoices() {
    const choicesPanel = document.getElementById('container-choices');
    choicesPanel.classList.remove('hidden');

    const ovr = calcOVR();
    const canGoMLB = ovr >= 60 || S.isGeniusBirth;

    document.getElementById('choices-title').textContent = '🎓 棒球生涯重大路徑抉擇';
    document.getElementById('choices-desc').textContent = '請選擇你接下來的棒球之路（投入職棒選秀或升學大學）：';

    let html = '';

    if (S.stage === 'DRAFT' && S.age <= 19) {
      html += `
        <div class="btn-choice med-risk" data-choice="COLLEGE">
          <span class="btn-choice-title">🎓 升學大學棒球隊 (${S.origin === 'JP' ? '全日本大學聯賽' : '大專棒球聯賽'})</span>
          <span class="btn-choice-sub">經歷 4 年大學聯賽養成磨練，22 歲以強棒之姿再戰選秀</span>
        </div>
      `;
    }

    if (S.origin === 'TW') {
      html += `
        <div class="btn-choice med-risk" data-choice="CPBL">
          <span class="btn-choice-title">🇹🇼 投入中華職棒選秀 (CPBL二軍起步)</span>
          <span class="btn-choice-sub">加盟中職名門球隊，努力升上一軍爭奪新人王</span>
        </div>
      `;
      if (canGoMLB) {
        html += `
          <div class="btn-choice high-risk" data-choice="MLB">
            <span class="btn-choice-title">🇺🇸 旅美簽約大聯盟 (小聯盟 1A/2A 起步)</span>
            <span class="btn-choice-sub">獲得大聯盟球探高度關注！挑戰最高殿堂小聯盟梯隊</span>
          </div>
        `;
      }
    } else {
      html += `
        <div class="btn-choice med-risk" data-choice="NPB">
          <span class="btn-choice-title">🇯🇵 投入日本職棒選秀 (NPB二軍起步)</span>
          <span class="btn-choice-sub">加盟日職名門球隊，挑戰二軍與日職一軍</span>
        </div>
      `;
      if (canGoMLB) {
        html += `
          <div class="btn-choice high-risk" data-choice="MLB">
            <span class="btn-choice-title">🇺🇸 旅美簽約大聯盟 (小聯盟 1A/2A 起步)</span>
            <span class="btn-choice-sub">大聯盟球探高額簽約金邀請！衝擊世界大賽</span>
          </div>
        `;
      }
    }

    document.getElementById('choices-grid').innerHTML = html;

    document.querySelectorAll('.btn-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        const choice = btn.dataset.choice;
        choicesPanel.classList.add('hidden');

        if (choice === 'COLLEGE') {
          S.stage = 'UNI1';
          S.leagueKey = S.origin === 'JP' ? 'UNI_JP' : 'UNI_TW';
          S.team = S.origin === 'JP' ? UNI_JP_TEAMS[ri(0, UNI_JP_TEAMS.length - 1)] : UNI_TW_TEAMS[ri(0, UNI_TW_TEAMS.length - 1)];
          addLogCard('🎓 大學升學成功', `考取【${S.team}】！展開 4 年大學棒球聯賽養成！`, 'gold', '大學升學');
        } else if (choice === 'CPBL') {
          S.leagueKey = 'CPBL2'; S.team = CPBL_TEAMS[ri(0, CPBL_TEAMS.length - 1)]; S.salary = 1800000;
          S.stage = 'PRO'; S.year += 1; S.age += 1;
        } else if (choice === 'NPB') {
          S.leagueKey = 'NPB2'; S.team = NPB_TEAMS[ri(0, NPB_TEAMS.length - 1)]; S.salary = 6000000;
          S.stage = 'PRO'; S.year += 1; S.age += 1;
        } else {
          S.leagueKey = 'MiLB_1A'; S.team = MLB_30_TEAMS[ri(0, MLB_30_TEAMS.length - 1)]; S.salary = 3000000;
          S.stage = 'PRO'; S.year += 1; S.age += 1;
        }

        queueMandatoryEvents();
        renderAll();
      });
    });
  }

  function showRetirementScreen() {
    document.getElementById('screen-dashboard').classList.remove('active');
    document.getElementById('screen-retirement').classList.add('active');

    document.getElementById('hof-player-name').textContent = S.name;
    document.getElementById('hof-player-meta').textContent = `${S.dpos} · 生涯 ${S.stats.length} 年 · ${S.team}`;
    document.getElementById('hof-stat-war').textContent = S.careerWAR;
    document.getElementById('hof-stat-primary').textContent = S.careerHits > 0 ? `${S.careerHits}安` : `${S.careerWins}勝`;
    document.getElementById('hof-stat-secondary').textContent = S.careerHR > 0 ? `${S.careerHR}轟` : `${S.careerSO}K`;
    document.getElementById('hof-stat-rings').textContent = `${S.rings} 💍`;
    document.getElementById('hof-seed-code').textContent = SEED_STR;

    const legacyGrid = document.getElementById('legacy-item-options');
    if (!S.ownedEquipment.length) {
      legacyGrid.innerHTML = `<span class="text-muted text-sm">本局未購買任何常駐裝備，無可繼承物品。</span>`;
      return;
    }

    legacyGrid.innerHTML = S.ownedEquipment.map(item => `
      <div class="legacy-item-card rarity-${item.rarity}" data-id="${item.id}">
        <div class="item-icon">${item.icon}</div>
        <div class="item-name">${item.name}</div>
        <div class="item-desc">${item.desc}</div>
      </div>
    `).join('');

    legacyGrid.querySelectorAll('.legacy-item-card').forEach(card => {
      card.addEventListener('click', () => {
        legacyGrid.querySelectorAll('.legacy-item-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const id = card.dataset.id;
        const item = ALL_PROPOSALS.find(e => e.id === id);
        if (item) {
          const generation = (inheritedItem && inheritedItem.generation) ? inheritedItem.generation + 1 : 1;
          const story = pickLegacyStory(item, S.name);
          localStorage.setItem('MYYAKYO_INHERITED', JSON.stringify({ id: item.id, generation, story, fromName: S.name }));
          alert(`已選擇【${item.name}】作為野球傳承之物！將以「第 ${generation} 代傳承」的身分遺贈給下一位棒球選手！`);
        }
      });
    });
  }

  function initApp() {
    console.log(`[My Baseball Life] Running version: ${APP_VERSION}`);
    document.getElementById('app-version-tag').textContent = APP_VERSION;
    document.getElementById('footer-version-tag').textContent = APP_VERSION;

    if (inheritedItem) {
      const banner = document.getElementById('inherited-legacy-banner');
      banner.classList.remove('hidden');
      const legacyItemDef = ALL_PROPOSALS.find(e => e.id === inheritedItem.id) || inheritedItem;
      const genLabel = inheritedItem.generation ? `【第 ${inheritedItem.generation} 代傳承】` : '';
      document.getElementById('inherited-item-name').textContent = `🎁 ${genLabel} 野球的傳承：${legacyItemDef.name}`;
      document.getElementById('inherited-story-snippet').textContent = inheritedItem.story || `「這是傳奇前輩留下來的 ${legacyItemDef.name}，帶著他的棒球魂繼續奮戰吧！」`;
    }

    document.getElementById('select-theme-switcher').addEventListener('change', (e) => {
      document.body.className = e.target.value;
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });

    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.modtab).classList.add('active');
      });
    });

    document.querySelectorAll('.archetype-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.archetype-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });

    document.getElementById('btn-start-game').addEventListener('click', () => {
      const name = document.getElementById('input-name').value.trim() || '佐藤大樹';
      const origin = document.getElementById('select-origin').value;
      const pos = document.getElementById('select-position').value;
      const subpos = document.getElementById('select-subpos').value;
      const seed = document.getElementById('input-custom-seed').value.trim();
      const archChoice = document.querySelector('.archetype-card.selected').dataset.type;

      resetState(name, origin, pos, subpos, archChoice, seed);

      document.getElementById('screen-creation').classList.remove('active');
      document.getElementById('screen-dashboard').classList.add('active');

      renderAll();

      if (S.isGeniusBirth) {
        addLogCard('✨ 驚天降生！【👑 十年一遇天才】', `老天賜予了你驚人的棒球天賦！每季訓練獲得額外 +2 顆骰子，屬性天花板極高！`, 'gold', '天才降生');
      } else {
        addLogCard('🌟 《我的野球人生》傳奇啟航', `${S.name} 降生於【${S.origin === 'JP' ? '日本' : '台灣'}】，踏入【${S.team}】，開啟了他的棒球生涯！`, 'gold', '開場');
      }
    });

    document.getElementById('btn-trigger-roll-dice').addEventListener('click', triggerInitialDiceRoll);
    document.getElementById('btn-reset-alloc').addEventListener('click', resetDiceAllocations);
    document.getElementById('btn-confirm-dice-alloc').addEventListener('click', confirmDiceAllocation);

    document.getElementById('btn-next-phase').addEventListener('click', nextPhase);
    document.getElementById('btn-draw-chance-card').addEventListener('click', drawChanceCard);

    document.getElementById('btn-open-codex').addEventListener('click', () => {
      renderCodex();
      renderAchievements();
      document.getElementById('modal-codex').classList.remove('hidden');
    });
    document.getElementById('btn-close-codex').addEventListener('click', () => {
      document.getElementById('modal-codex').classList.add('hidden');
    });

    document.getElementById('btn-toggle-sound').addEventListener('click', (e) => {
      soundEnabled = !soundEnabled;
      e.target.textContent = soundEnabled ? '🔊' : '🔇';
    });
    document.getElementById('btn-copy-seed').addEventListener('click', () => {
      navigator.clipboard.writeText(SEED_STR).then(() => alert(`已複製種子碼: ${SEED_STR}`));
    });
    document.getElementById('btn-new-seed').addEventListener('click', () => {
      location.search = `?seed=${Math.random().toString(36).slice(2, 10)}`;
    });
    document.getElementById('btn-clear-log').addEventListener('click', () => {
      document.getElementById('narrative-log-feed').innerHTML = '';
    });
    document.getElementById('btn-restart-game').addEventListener('click', () => {
      location.reload();
    });
  }

  document.addEventListener('DOMContentLoaded', initApp);

})();
