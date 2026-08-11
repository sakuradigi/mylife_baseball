/* ==========================================================================
   「我的野球人生」 (My Baseball Life) - Core Logic & Roll-First Dice Engine
   Version: EA 0.4 (Multi-Tier Minor Leagues, 30 MLB Teams, 3-Choice Risk/Reward Events)
   ========================================================================== */

(function () {
  'use strict';

  const APP_VERSION = 'EA 0.4';

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
    { id: 'ach_80', icon: '🧢', title: '【名將教頭】', desc: '總教練模式帶隊奪得 3 次總冠軍', titleReward: '稱號：名將教頭' }
  ];

  /* ==========================================================================
     4. 100% 復刻 Image 7/8 互動式事件卡 3 應對選項系統 (Risk/Reward Choice Cards)
     ========================================================================== */
  const INTERACTIVE_EVENTS = [
    {
      title: '守備千球練習',
      desc: '特訓教練在練球後留下你，進行高強度的千球守備特訓！',
      statKey: 'cat',
      outcomes: {
        high: { winP: 0.35, winMsg: '豪賭成功！完成千球特訓，接球大幅提升 +3！', loseMsg: '豪賭失敗... 吃了無數彈跳球信心受挫，接球 -3 | 體力 -2', winStat: 3, loseStat: -3 },
        med: { winP: 0.50, winMsg: '執行順利！掌握守備步伐，接球提升 +2！', loseMsg: '照常執行受小傷，接球 -2', winStat: 2, loseStat: -2 },
        low: { winP: 0.70, winMsg: '穩紮穩打完成基礎訓練，接球微升 +1！', loseMsg: '保守執行微調，無損失。', winStat: 1, loseStat: 0 }
      }
    },
    {
      title: '場外代言邀約',
      desc: '獲得頂級運動品牌拍攝廣告邀約，行程滿檔考驗體能安排。',
      statKey: 'sta',
      outcomes: {
        high: { winP: 0.35, winMsg: '豪賭成功！兼顧代言與鍛鍊，獲得高額報酬與體力提升 +3！', loseMsg: '豪賭失敗... 行程太滿，訓練量明顯掉了！體力 -3', winStat: 3, loseStat: -3 },
        med: { winP: 0.50, winMsg: '照常完成代言拍攝，體力 +2！', loseMsg: '略顯疲態，體力 -2', winStat: 2, loseStat: -2 },
        low: { winP: 0.70, winMsg: '保守調整作息，體力微升 +1！', loseMsg: '順利完成行程。', winStat: 1, loseStat: 0 }
      }
    },
    {
      title: '季中打擊低潮',
      desc: '遭遇連續十打席無安打的打擊低潮，你要如何突破困境？',
      statKey: 'con',
      outcomes: {
        high: { winP: 0.35, winMsg: '豪賭成功！徹底修改打擊機制打出再見全壘打！打擊 +3！', loseMsg: '豪賭失敗... 低潮拖了一個月，豪賭失敗！Contact -3 | 體力 -3', winStat: 3, loseStat: -3 },
        med: { winP: 0.50, winMsg: '照常打擊發揮恢復水準，打擊 +2！', loseMsg: '手感依然受限，Contact -2', winStat: 2, loseStat: -2 },
        low: { winP: 0.70, winMsg: '保守選球保送上壘，打擊 +1！', loseMsg: '平穩過渡低潮。', winStat: 1, loseStat: 0 }
      }
    }
  ];

  function drawChanceCard() {
    if (S.chanceCardDrawnThisPhase) {
      alert('本行動階段已抽過事件卡！請前進下個階段後再行抽取！');
      return;
    }

    S.chanceCardDrawnThisPhase = true;
    const ev = INTERACTIVE_EVENTS[ri(0, INTERACTIVE_EVENTS.length - 1)];

    // 渲染與 Image 7/8 一致的 3 種應對策略卡片 UI
    const choicesPanel = document.getElementById('container-choices');
    choicesPanel.classList.remove('hidden');

    document.getElementById('choices-title').textContent = `◆ 事件卡 | ${ev.title} — 你要怎麼應對？`;
    document.getElementById('choices-desc').textContent = ev.desc;

    document.getElementById('choices-grid').innerHTML = `
      <div class="btn-choice high-risk" data-risk="high">
        <span class="btn-choice-title">🔥 全力一搏</span>
        <span class="btn-choice-sub">成功率 35% | 加成/減益幅度最大 (±3)</span>
      </div>
      <div class="btn-choice med-risk" data-risk="med">
        <span class="btn-choice-title">⚖️ 照常執行</span>
        <span class="btn-choice-sub">成功率 50% | 標準幅度 (±2)</span>
      </div>
      <div class="btn-choice low-risk" data-risk="low">
        <span class="btn-choice-title">🛡️ 保守應對</span>
        <span class="btn-choice-sub">成功率 70% | 加成/減益幅度最小 (±1)</span>
      </div>
    `;

    document.querySelectorAll('.btn-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        const risk = btn.dataset.risk;
        choicesPanel.classList.add('hidden');

        const opt = ev.outcomes[risk];
        const isWin = R() < opt.winP;
        const statGain = isWin ? opt.winStat : opt.loseStat;

        S.ab[ev.statKey] = clamp((S.ab[ev.statKey] || 25) + statGain, 10, S.pot[ev.statKey] || 99);

        if (isWin) {
          addLogCard(`◆ 事件卡 | ${ev.title}`, opt.winMsg, 'good', '事件判定成功');
        } else {
          addLogCard(`◆ 事件卡 | ${ev.title}`, opt.loseMsg, 'bad', '事件判定失敗');
        }

        renderAll();
      });
    });
  }

  const ALL_PROPOSALS = [
    { id: 'p_01', icon: '🏏', name: '特製楓木打擊重棒', desc: '力量+5', price: 150000, stat: { pow: 5 } },
    { id: 'p_02', icon: '🧤', name: '加重練習打擊手套', desc: '打擊+4, 選球+3', price: 120000, stat: { con: 4, eye: 3 } },
    { id: 'p_03', icon: '👟', name: '碳纖維輕量釘鞋', desc: '跑壘+6', price: 140000, stat: { spd: 6 } },
    { id: 'p_04', icon: '🦺', name: '鈦合金防護面罩', desc: '捕手接捕+8', price: 180000, stat: { cat: 8, fld: 4 } },
    { id: 'p_05', icon: '⛩️', name: '神社必勝祈願勝守', desc: '能力+3', price: 100000, stat: { con: 3, pow: 3 } },
    { id: 'p_06', icon: '🧢', name: '家傳幸運縫線球帽', desc: '控球+5', price: 130000, stat: { ctl: 5 } },
    { id: 'p_07', icon: '💪', name: '高科技肌能護臂', desc: '臂力+6', price: 200000, stat: { arm: 6, vel: 2 } },
    { id: 'p_08', icon: '💍', name: '總冠軍運勢金戒', desc: '全能力+2', price: 300000, stat: { con: 2, pow: 2, ctl: 2, vel: 2 } }
  ];

  const CARS_LIST = [
    { id: 'car_01', tier: 1, name: '二手國民小轎車', price: 100000, icon: '🚗', desc: '代步小車' },
    { id: 'car_02', tier: 1, name: '國產舒適休旅車', price: 400000, icon: '🚙', desc: '載裝備方便' },
    { id: 'car_03', tier: 1, name: '日系街頭跑車', price: 800000, icon: '🏎️', desc: '年輕球員熱門首選' },
    { id: 'car_04', tier: 2, name: '德系豪華房車', price: 1500000, icon: '🚘', desc: '展現身價' },
    { id: 'car_05', tier: 5, name: '傳奇狂飆賽車巨獸', price: 100000000, icon: '🏎️', desc: '巨星座駕' }
  ];

  const HOUSES_LIST = [
    { id: 'house_01', tier: 1, name: '球隊青年單身宿舍', price: 0, icon: '🏠', desc: '預設居住' },
    { id: 'house_02', tier: 1, name: '市區單身套房', price: 500000, icon: '🏢', desc: '交通便捷' },
    { id: 'house_03', tier: 2, name: '明星水岸豪宅公寓', price: 6000000, icon: '🏙️', desc: '高樓層河景' },
    { id: 'house_04', tier: 5, name: '傳奇名人堂極致莊園', price: 500000000, icon: '👑', desc: '終極城堡' }
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

    if (unlockedCodex.length >= 15) unlockAchievement('ach_79');
    if (S.origin === 'JP' && S.stage.startsWith('HS')) unlockAchievement('ach_72');
    if (S.origin === 'TW' && S.stage.startsWith('HS')) unlockAchievement('ach_71');
  }

  function calcDicePool() {
    let count = 3;
    if (S.age <= 21) count += 3;
    else if (S.age <= 24) count += 2;
    else if (S.age <= 27) count += 1;

    if (S.archetype === 'GENIUS') count += 2;
    else if (S.archetype === 'POWER' || S.archetype === 'SPEED_DEF') count += 1;

    if (S.diceBonus) count += S.diceBonus;
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

      money: 100000,
      salary: 0,
      contractYears: 3,
      careerSalaryTotal: 0,
      relationship: null,

      maxUnlockedAssetTier: 1,
      ownedAssets: { house: 'house_01', car: null },

      ownedEquipment: [],
      runShopPool: [],

      stats: [], trophies: [], rings: 0,
      careerWAR: 0, careerHits: 0, careerHR: 0, careerWins: 0, careerSO: 0,
      managerStats: { years: 0, wins: 0, losses: 0, titles: 0 }
    };

    applyArchetypeBonus();
    applyInheritedItemBonus();
    initRunShopPool();
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

  function applyInheritedItemBonus() {
    if (!inheritedItem) return;
    const item = ALL_PROPOSALS.find(e => e.id === inheritedItem.id);
    if (item) {
      S.ownedEquipment.push(item);
      for (let k in item.stat) S.ab[k] = (S.ab[k] || 0) + item.stat[k];
      S.traits.push(`🎁 傳承: ${item.name}`);
      unlockAchievement('ach_77');
      unlockAchievement('ach_78');
    }
  }

  function initRunShopPool() {
    const shuffled = ALL_PROPOSALS.slice().sort(() => R() - 0.5);
    S.runShopPool = shuffled.slice(0, ri(18, 22));
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

    document.getElementById('badge-origin').textContent = S.origin === 'JP' ? '🇯🇵 日本出生' : '🇹🇼 台灣出生';
    document.getElementById('badge-team').textContent = S.team;
    document.getElementById('badge-pos').textContent = S.dpos;

    document.getElementById('current-year-display').textContent = `西元 ${S.year} 年`;
    document.getElementById('current-stage-display').textContent = `【${getStageLabel()}】`;
    document.getElementById('chance-card-count').textContent = S.chanceCardDrawnThisPhase ? '0 (本季已抽)' : '1';

    renderTraits();
    renderShop();
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
    permGrid.innerHTML = S.runShopPool.slice(0, 4).map(item => {
      const owned = S.ownedEquipment.some(e => e.id === item.id);
      return `
        <div class="item-card">
          <div class="item-card-header">
            <span class="item-icon">${item.icon}</span>
            <span class="item-name">${item.name}</span>
          </div>
          <div class="item-desc">${item.desc}</div>
          <div class="item-footer">
            <span class="item-price">$${(item.price / 10000).toFixed(0)}萬</span>
            <button class="btn-buy" ${owned || S.money < item.price ? 'disabled' : ''} onclick="window.buyPermanent('${item.id}')">
              ${owned ? '已擁有' : '購買'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    const consGrid = document.getElementById('shop-consumable-grid');
    consGrid.innerHTML = S.runShopPool.slice(4, 12).map(item => `
      <div class="item-card">
        <div class="item-card-header">
          <span class="item-icon">${item.icon}</span>
          <span class="item-name">${item.name}</span>
        </div>
        <div class="item-desc">${item.desc}</div>
        <div class="item-footer">
          <span class="item-price">$${(item.price / 10000).toFixed(1)}萬</span>
          <button class="btn-buy" ${S.money < item.price ? 'disabled' : ''} onclick="window.buyConsumable('${item.id}')">購買</button>
        </div>
      </div>
    `).join('');
  }

  window.buyPermanent = function (id) {
    const item = ALL_PROPOSALS.find(e => e.id === id);
    if (item && S.money >= item.price) {
      S.money -= item.price;
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
    const item = ALL_PROPOSALS.find(c => c.id === id);
    if (item && S.money >= item.price) {
      S.money -= item.price;
      for (let k in item.stat) S.ab[k] = (S.ab[k] || 0) + item.stat[k];
      addLogCard('🛒 購買補給品', `成功使用【${item.name}】獲得能力增強！`, 'good', '購物成功');
      renderAll();
    }
  };

  function renderAssets() {
    const carGrid = document.getElementById('assets-cars-grid');
    carGrid.innerHTML = CARS_LIST.filter(c => c.tier <= S.maxUnlockedAssetTier + 1).map(car => {
      const owned = S.ownedAssets.car === car.id;
      const locked = car.tier > S.maxUnlockedAssetTier;
      return `
        <div class="asset-card">
          <div class="asset-icon">${car.icon}</div>
          <div class="asset-name">${locked ? '🔒 待解鎖座駕' : car.name}</div>
          <div class="asset-desc">${locked ? '購買前一階座駕解鎖' : car.desc}</div>
          <div class="asset-footer">
            <span class="asset-price">$${(car.price / 10000).toFixed(0)}萬</span>
            <button class="btn-buy" ${locked || owned || S.money < car.price ? 'disabled' : ''} onclick="window.buyCar('${car.id}', ${car.tier})">
              ${owned ? '已駕駛' : (locked ? '未解鎖' : '購買')}
            </button>
          </div>
        </div>
      `;
    }).join('');

    const houseGrid = document.getElementById('assets-houses-grid');
    houseGrid.innerHTML = HOUSES_LIST.filter(h => h.tier <= S.maxUnlockedAssetTier + 1).map(house => {
      const owned = S.ownedAssets.house === house.id;
      const locked = house.tier > S.maxUnlockedAssetTier;
      return `
        <div class="asset-card">
          <div class="asset-icon">${house.icon}</div>
          <div class="asset-name">${locked ? '🔒 待解鎖豪宅' : house.name}</div>
          <div class="asset-desc">${locked ? '購買前一階豪宅解鎖' : house.desc}</div>
          <div class="asset-footer">
            <span class="asset-price">${house.price === 0 ? '免費' : `$${(house.price / 10000).toFixed(0)}萬`}</span>
            <button class="btn-buy" ${locked || owned || S.money < house.price ? 'disabled' : ''} onclick="window.buyHouse('${house.id}', ${house.tier})">
              ${owned ? '已入住' : (locked ? '未解鎖' : '入住')}
            </button>
          </div>
        </div>
      `;
    }).join('');
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
    document.getElementById('container-choices').classList.add('hidden');
    S.chanceCardDrawnThisPhase = false;

    if (S.stage.startsWith('HS')) {
      const stat = simSeason();
      if (S.stage === 'HS1') { S.stage = 'HS2'; S.year += 1; S.age += 1; }
      else if (S.stage === 'HS2') { S.stage = 'HS3'; S.year += 1; S.age += 1; }
      else { S.stage = 'DRAFT'; showDraftChoices(); }
      renderAll();
    } else if (S.stage.startsWith('UNI')) {
      const stat = simSeason();
      if (S.stage === 'UNI1') S.stage = 'UNI2';
      else if (S.stage === 'UNI2') S.stage = 'UNI3';
      else if (S.stage === 'UNI3') S.stage = 'UNI4';
      else { S.stage = 'DRAFT'; showDraftChoices(); }
      S.year += 1; S.age += 1;
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
      renderAll();
    }
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
      <div class="legacy-item-card" data-id="${item.id}">
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
          localStorage.setItem('MYYAKYO_INHERITED', JSON.stringify(item));
          alert(`已選擇【${item.name}】作為野球傳承之物！將遺贈給下一位棒球選手！`);
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
      document.getElementById('inherited-item-name').textContent = `🎁 野球的傳承：${inheritedItem.name}`;
      document.getElementById('inherited-story-snippet').textContent = `「這是傳奇前輩留下來的 ${inheritedItem.name}，帶著他的棒球魂繼續奮戰吧！」`;
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
