/* ==========================================================================
   「我的野球人生」 (My Baseball Life) - Core Logic & Roll-First Dice Engine
   Version: EA 0.2
   ========================================================================== */

(function () {
  'use strict';

  const APP_VERSION = 'EA 0.2';

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
    { id: 'ach_46', icon: '📈', title: '【理財大師】', desc: '個人零用金積蓄突破 $5,000 萬', titleReward: '稱號：理財大師' },
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
    { id: 'ach_73', icon: '⛩️', title: '【甲子園全國制霸】', desc: '率領學校勇奪甲子園全國總冠軍', titleReward: '稱號：全國制霸' },
    { id: 'ach_74', icon: '🇹🇼', title: '【CPBL中職巨星】', desc: '中華職棒生涯打出 1,000 支安打', titleReward: '稱號：CPBL巨星' },
    { id: 'ach_75', icon: '🇯🇵', title: '【NPB日職王牌】', desc: '日本職棒生涯獲得 100 勝', titleReward: '稱號：NPB王牌' },
    { id: 'ach_76', icon: '🇺🇸', title: '【MLB大聯盟超級巨星】', desc: '美職大聯盟生涯 WAR 突破 50', titleReward: '稱號：MLB超級巨星' },
    { id: 'ach_77', icon: '🎁', title: '【傳承始祖】', desc: '首次將裝備轉贈傳承給下一代', titleReward: '稱號：傳承始祖' },
    { id: 'ach_78', icon: '🔥', title: '【野球的血脈】', desc: '攜帶前輩傳承裝備打滿一生', titleReward: '稱號：野球血脈' },
    { id: 'ach_79', icon: '📖', title: '【圖鑑收藏家】', desc: '解鎖 15 件常駐裝備圖鑑', titleReward: '稱號：圖鑑收藏家' },
    { id: 'ach_80', icon: '🧢', title: '【名將教頭】', desc: '總教練模式帶隊奪得 3 次總冠軍', titleReward: '稱號：名將教頭' }
  ];

  /* ==========================================================================
     4. 豐富機會卡資料庫 (15+ 多樣化隨機事件)
     ========================================================================== */
  const CHANCE_CARDS = [
    { name: '天道酬勤', icon: '🏋️', desc: '自主訓練發狂！本季訓練額外 +2 顆骰子加成！', type: 'good', effect: (S) => { S.diceBonus += 2; } },
    { name: '球探重用', icon: '👁️', desc: '大聯盟高級球探親臨觀戰，年薪合約大增 +20%！', type: 'gold', effect: (S) => { S.salary = Math.round((S.salary || 3000000) * 1.2); } },
    { name: '狀態極佳', icon: '🔥', desc: '打擊與控球感覺極佳，打擊與控球直升 +4！', type: 'good', effect: (S) => { S.ab.con += 4; S.ab.ctl += 4; } },
    { name: '前輩指點', icon: '前', desc: '獲得隊友傳奇前輩親自指點，全屬性+2！', type: 'gold', effect: (S) => { for (let k in S.ab) S.ab[k] += 2; } },
    { name: '代言合約', icon: '💰', desc: '接下高檔體育品牌代言，零用金大增 +$50萬！', type: 'gold', effect: (S) => { S.money += 500000; } },
    { name: '舊傷復發', icon: '🩹', desc: '輕微拉傷！本季跑壘與體力暫時 -2，幸無大礙。', type: 'bad', effect: (S) => { S.ab.spd = Math.max(10, S.ab.spd - 2); S.ab.sta = Math.max(10, S.ab.sta - 2); } },
    { name: '神器撿拾', icon: '🎁', desc: '在球場休息室撿到前輩遺留的幸運手套！守備+5！', type: 'good', effect: (S) => { S.ab.fld += 5; } },
    { name: '特製補給', icon: '🧪', desc: '飲用名醫調配的高效氨基酸，球速+2km/h，選球+3！', type: 'good', effect: (S) => { S.ab.vel += 2; S.ab.eye += 3; } },
    { name: '宿敵嗆聲', icon: '🔥', desc: '與死敵宿敵在球場對峙激發鬥志！力量上限突破+5！', type: 'gold', effect: (S) => { S.pot.pow += 5; } },
    { name: '球隊旅遊', icon: '🏖️', desc: '參加球隊沖繩移地訓練，身心大放鬆！體力+6！', type: 'good', effect: (S) => { S.ab.sta += 6; } },
    { name: '打擊特訓', icon: '🏏', desc: '特訓教練一對一修改打擊姿勢！力量+4，打擊+3！', type: 'good', effect: (S) => { S.ab.pow += 4; S.ab.con += 3; } },
    { name: '球迷熱情', icon: '❤️', desc: '收到後援會球迷送來的溫暖禮物，心態大幅穩定！', type: 'good', effect: (S) => { S.ab.eye += 4; } }
  ];

  const CPBL_TEAMS = ['台中猛瑪', '府城雄獅', '桃園金剛', '新北騎士', '台北恐龍', '高雄神鵰'];
  const NPB_TEAMS = ['東京大人', '阪神猛虎', '橫濱海星', '廣島紅鯉', '神宮飛燕', '福岡猛禽', '千葉海潮', '歐力士猛牛'];
  const MLB_TEAMS = ['洛城藍電', '聖港修士', '灣區巨浪', '紐約帝國', '波士頓襪王', '亞城戰斧', '風城幼熊', '天使之城'];

  const LEAGUES = {
    HS_TW: { n: '高中棒球(台灣黑豹旗)', par: 30, min: 20 },
    HS_JP: { n: '高中棒球(日本甲子園)', par: 34, min: 22 },
    CPBL2: { n: '中職二軍', par: 36, min: 30, org: 'CPBL' },
    CPBL1: { n: '中職一軍', par: 46, min: 42, org: 'CPBL' },
    NPB2: { n: '日職二軍', par: 48, min: 44, org: 'NPB' },
    NPB1: { n: '日職一軍', par: 56, min: 52, org: 'NPB' },
    MiLB: { n: '美職小聯盟(3A)', par: 55, min: 50, org: 'MLB' },
    MLB: { n: '大聯盟(MLB)', par: 64, min: 60, org: 'MLB' }
  };

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

  /* ==========================================================================
     5. 全局狀態 S & 成就持久化
     ========================================================================== */
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

  /* ==========================================================================
     6. 📊 經典能力值長條圖 (Progress Bars) 與橫向極簡骰子列
     ========================================================================== */
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

    for (let i = 0; i < numDice; i++) {
      S.currentDicePool.push({ id: `d_${i}`, val: ri(1, 6), assignedTo: null });
    }

    document.getElementById('btn-trigger-roll-dice').classList.add('hidden');
    document.getElementById('dice-pool-wrapper').classList.remove('hidden');
    document.getElementById('dice-alloc-container').classList.remove('hidden');
    document.getElementById('dice-confirm-box').classList.remove('hidden');

    renderDicePoolAndAlloc();
  }

  function renderDicePoolAndAlloc() {
    // 1. 渲染單行橫向極簡骰子列 (Horizontal Dice Bar)
    const poolContainer = document.getElementById('dice-blocks-pool');
    poolContainer.innerHTML = S.currentDicePool.map(d => `
      <div class="dice-badge-sm ${d.assignedTo ? 'used' : ''}" data-id="${d.id}">
        🎲${d.val}
      </div>
    `).join('');

    // 2. 渲染經典能力值長條圖 (Attribute Progress Bars)
    const allocGrid = document.getElementById('dice-alloc-container');
    const config = S.position === 'PITCHER'
      ? [{ key: 'vel', label: '球速 (km/h)', maxVal: 165 }, { key: 'ctl', label: '控球', maxVal: 99 }, { key: 'brk', label: '變化球', maxVal: 99 }, { key: 'sta', label: '體力', maxVal: 99 }]
      : [{ key: 'con', label: '打擊', maxVal: 99 }, { key: 'pow', label: '力量', maxVal: 99 }, { key: 'eye', label: '選球', maxVal: 99 }, { key: 'spd', label: '跑壘', maxVal: 99 }, { key: 'fld', label: '守備', maxVal: 99 }];

    allocGrid.innerHTML = config.map(c => {
      const assignedDice = (S.assignedDiceMap[c.key] || []);
      const totalGain = assignedDice.reduce((a, b) => a + b, 0);
      const curVal = S.ab[c.key];
      const ceiling = S.pot[c.key] || 99;
      const maxRange = c.key === 'vel' ? 165 : 99;

      const curWidth = Math.min(100, (curVal / maxRange) * 100);
      const previewWidth = Math.min(100, ((curVal + totalGain) / maxRange) * 100);
      const ceilingWidth = Math.min(100, (ceiling / maxRange) * 100);

      return `
        <div class="stat-bar-row">
          <div class="stat-bar-info">
            <span class="stat-name">${c.label}</span>
            <span class="stat-val-text">${curVal} ${totalGain > 0 ? `<span class="hl-green">(+${totalGain})</span>` : ''} / ${ceiling}</span>
          </div>

          <div class="stat-bar-track">
            <div class="stat-bar-fill-current" style="width: ${curWidth}%;"></div>
            ${totalGain > 0 ? `<div class="stat-bar-fill-preview" style="left: ${curWidth}%; width: ${previewWidth - curWidth}%;"></div>` : ''}
            <div class="stat-bar-ceiling-line" style="left: ${ceilingWidth}%;" title="天賦上限: ${ceiling}"></div>
          </div>

          <div class="stat-controls">
            <button class="btn-dice-step btn-minus-dice" data-key="${c.key}">-</button>
            <span class="dice-assigned-count">${assignedDice.length}</span>
            <button class="btn-dice-step btn-plus-dice" data-key="${c.key}">+</button>
          </div>
        </div>
      `;
    }).join('');

    allocGrid.querySelectorAll('.btn-plus-dice').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.key;
        const availableDie = S.currentDicePool.find(d => !d.assignedTo);
        if (availableDie) {
          availableDie.assignedTo = k;
          if (!S.assignedDiceMap[k]) S.assignedDiceMap[k] = [];
          S.assignedDiceMap[k].push(availableDie.val);
          renderDicePoolAndAlloc();
        }
      });
    });

    allocGrid.querySelectorAll('.btn-minus-dice').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.key;
        if (S.assignedDiceMap[k] && S.assignedDiceMap[k].length > 0) {
          const removedVal = S.assignedDiceMap[k].pop();
          const dieObj = S.currentDicePool.find(d => d.assignedTo === k && d.val === removedVal);
          if (dieObj) dieObj.assignedTo = null;
          renderDicePoolAndAlloc();
        }
      });
    });
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
    document.getElementById('dice-pool-wrapper').classList.add('hidden');
    document.getElementById('dice-alloc-container').classList.add('hidden');
    document.getElementById('dice-confirm-box').classList.add('hidden');

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
      team: origin === 'JP' ? '大阪桐蔭高校' : '平鎮高中',

      ab: { con: 30, pow: 28, spd: 32, arm: 30, fld: 30, cat: 25, eye: 28, vel: 132, ctl: 28, brk: 26, sta: 35 },
      pot: { con: 82, pow: 80, spd: 78, arm: 76, fld: 78, cat: 70, eye: 80, vel: 156, ctl: 80, brk: 82, sta: 85 },

      traits: [],
      awakenedTraits: [],
      diceStats: { ones: 0, fives: 0, sixes: 0, totalCount: 0 },
      currentDicePool: [],
      assignedDiceMap: {},
      diceBonus: 0,
      chanceCardDrawnThisPhase: false,

      money: 100000,
      salary: 0,
      careerSalaryTotal: 0,
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

  function simSeason() {
    const L = LEAGUES[S.leagueKey] || LEAGUES.HS_TW;
    const a = S.ab;
    const diff = calcOVR() - L.par;

    let s = {
      year: S.year, league: L.n, team: S.team,
      isBatter: S.position === 'BATTER' || S.position === 'TWOWAY',
      isPitcher: S.position === 'PITCHER' || S.position === 'TWOWAY',
      G: 0, PA: 0, AB: 0, H: 0, HR: 0, RBI: 0, SB: 0, AVG: 0, OPS: 0, batWAR: 0,
      pG: 0, IP: 0, W: 0, L: 0, SV: 0, SO: 0, ERA: 0, WHIP: 0, pitWAR: 0
    };

    if (s.isBatter) {
      const gMax = S.leagueKey.startsWith('HS') ? 30 : 130;
      s.G = Math.round(clamp(gMax * (0.75 + diff * 0.015 + R() * 0.1), 10, gMax));
      s.PA = Math.round(s.G * 3.8); s.AB = Math.round(s.PA * 0.88);
      s.H = Math.round(s.AB * clamp(0.250 + diff * 0.004 + (a.con - 40) * 0.002, 0.180, 0.390));
      s.AVG = +(s.H / Math.max(1, s.AB)).toFixed(3);
      s.HR = Math.round(s.AB * clamp(0.02 + (a.pow - 30) * 0.0025, 0.005, 0.11));
      s.RBI = Math.round(s.HR * 1.8 + s.H * 0.25 + ri(0, 10));
      s.OPS = +(s.AVG + 0.12).toFixed(3);
      s.batWAR = +((s.OPS - 0.700) * 8).toFixed(1);
      S.careerHits += s.H; S.careerHR += s.HR;

      if (s.AVG >= 0.350) unlockAchievement('ach_01');
      if (s.AVG >= 0.400) unlockAchievement('ach_02');
      if (s.HR >= 40) unlockAchievement('ach_03');
      if (s.HR >= 50) unlockAchievement('ach_04');
      if (s.HR >= 60) unlockAchievement('ach_05');
      if (s.RBI >= 120) unlockAchievement('ach_06');
      if (s.RBI >= 150) unlockAchievement('ach_07');
    }

    if (s.isPitcher) {
      s.pG = 25; s.IP = +(s.pG * clamp(5.5 + diff * 0.04, 4.5, 7.1)).toFixed(1);
      s.W = Math.round(s.pG * 0.55); s.L = Math.max(0, s.pG - s.W);
      s.ERA = +clamp(4.20 - diff * 0.08, 1.20, 7.50).toFixed(2);
      s.WHIP = +(1.35 - diff * 0.012).toFixed(2);
      s.SO = Math.round((s.IP / 9) * clamp(6.5 + (a.vel - 135) * 0.15, 4.0, 13.5));
      s.pitWAR = +((4.50 - s.ERA) * (s.IP / 40)).toFixed(1);
      S.careerWins += s.W; S.careerSO += s.SO;

      if (s.W >= 15) unlockAchievement('ach_10');
      if (s.W >= 20) unlockAchievement('ach_11');
      if (s.ERA <= 2.00) unlockAchievement('ach_12');
      if (s.ERA <= 1.50) unlockAchievement('ach_13');
      if (s.WHIP <= 0.95) unlockAchievement('ach_14');
      if (s.SO >= 200) unlockAchievement('ach_15');
      if (s.SO >= 300) unlockAchievement('ach_16');
    }

    const yearWAR = +((s.batWAR || 0) + (s.pitWAR || 0)).toFixed(1);
    S.careerWAR = +(S.careerWAR + yearWAR).toFixed(1);
    S.stats.push(s);

    if (S.salary > 0) {
      S.money += Math.round(S.salary * 0.3);
      S.careerSalaryTotal += S.salary;
    }

    checkAchievements();
    return s;
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
    renderRadarChart();
  }

  function getStageLabel() {
    if (S.stage === 'HS1') return S.origin === 'JP' ? '高一 (地區預選大會)' : '高一 (木棒聯賽)';
    if (S.stage === 'HS2') return S.origin === 'JP' ? '高二 (阪神甲子園大會)' : '高二 (黑豹旗)';
    if (S.stage === 'HS3') return S.origin === 'JP' ? '高三 (夏季甲子園決戰)' : '高三 (玉山盃與選秀)';
    if (S.stage === 'DRAFT') return '職棒選秀指名';
    if (S.stage === 'PRO') return `職棒階段 - ${LEAGUES[S.leagueKey].n}`;
    if (S.stage === 'RETIRED') return '退役名人堂';
    return '棒球生涯';
  }

  function renderTraits() {
    document.getElementById('traits-list').innerHTML = S.traits.map(t => `<span class="trait-tag trait-good">${t}</span>`).join('');
  }

  /* 🛒 恢復 Version 1 精簡經典商店渲染 */
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
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          borderColor: '#3b82f6',
          borderWidth: 2,
          pointBackgroundColor: '#f5d130'
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
      addLogCard(`⚾ ${S.year} 年 ${getStageLabel()} 賽季結算`, `打率 <b class="hl-gold">${stat.AVG || '---'}</b> | 防禦率 <b class="hl-gold">${stat.ERA || '---'}</b>`, 'good', '賽季成績');

      if (S.stage === 'HS1') { S.stage = 'HS2'; S.year += 1; S.age += 1; }
      else if (S.stage === 'HS2') { S.stage = 'HS3'; S.year += 1; S.age += 1; }
      else { S.stage = 'DRAFT'; showDraftChoices(); }
      renderAll();
    } else if (S.stage === 'PRO') {
      const stat = simSeason();
      addLogCard(`⚾ ${S.year} 年 ${LEAGUES[S.leagueKey].n} 賽季成績`, `打率 <b class="hl-gold">${stat.AVG || '---'}</b> | WAR <b class="hl-gold">${stat.batWAR || stat.pitWAR}</b>`, 'good', '職棒成績');

      if (S.age >= 38) {
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
    document.getElementById('choices-title').textContent = '🎓 畢業選秀指名抉擇';
    document.getElementById('choices-desc').textContent = '職棒球探向你拋出橄欖枝，請選擇你的職業舞台：';

    document.getElementById('choices-grid').innerHTML = `
      <div class="btn-choice" data-choice="CPBL">
        <span class="btn-choice-title">🇹🇼 加盟中華職棒 (CPBL)</span>
        <span class="btn-choice-sub">第一輪熱指名，爭奪 CPBL 新人王</span>
      </div>
      <div class="btn-choice" data-choice="NPB">
        <span class="btn-choice-title">🇯🇵 加盟日本職棒 (NPB)</span>
        <span class="btn-choice-sub">加盟日職名門球隊，挑戰頂尖職棒戰場</span>
      </div>
      <div class="btn-choice" data-choice="MLB">
        <span class="btn-choice-title">🇺🇸 挑戰美職大聯盟 (MiLB/MLB)</span>
        <span class="btn-choice-sub">高額簽約金旅美，直指世界大賽</span>
      </div>
    `;

    document.querySelectorAll('.btn-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        const choice = btn.dataset.choice;
        choicesPanel.classList.add('hidden');

        if (choice === 'CPBL') { S.leagueKey = 'CPBL1'; S.team = CPBL_TEAMS[ri(0, CPBL_TEAMS.length - 1)]; S.salary = 3600000; }
        else if (choice === 'NPB') { S.leagueKey = 'NPB1'; S.team = NPB_TEAMS[ri(0, NPB_TEAMS.length - 1)]; S.salary = 18000000; }
        else { S.leagueKey = 'MiLB'; S.team = MLB_TEAMS[ri(0, MLB_TEAMS.length - 1)]; S.salary = 6000000; }

        S.stage = 'PRO'; S.year += 1; S.age += 1;
        renderAll();
      });
    });
  }

  /* 🃏 機會卡：廢除彈窗！完全內嵌於即時日誌中 (Zero Modals, Direct Log Stream) */
  function drawChanceCard() {
    if (S.chanceCardDrawnThisPhase) {
      alert('本行動階段已抽過機會卡！請前進下個階段後再行抽取！');
      return;
    }
    S.chanceCardDrawnThisPhase = true;
    const card = CHANCE_CARDS[ri(0, CHANCE_CARDS.length - 1)];
    card.effect(S);

    // 直接流暢寫入日誌串流，零彈窗干擾！
    addLogCard(`🃏 抽中機會卡【${card.icon} ${card.name}】`, card.desc, card.type || 'gold', '機會卡事件');
    renderAll();
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
