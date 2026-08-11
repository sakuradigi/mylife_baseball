/* ==========================================================================
   「我的野球人生」 (My Baseball Life) - Core Logic & Mechanics
   ========================================================================== */

(function () {
  'use strict';

  /* ==========================================================================
     1. PRNG (Mulberry32)
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

  function playHitSound() {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(); osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) { }
  }

  function playCheerSound() {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;
    try {
      const bufferSize = audioCtx.sampleRate * 0.3;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      noise.connect(gain); gain.connect(audioCtx.destination);
      noise.start();
    } catch (e) { }
  }

  /* ==========================================================================
     3. 隨機事件庫 (Mid-Season & Training Narrative Events)
     ========================================================================== */
  const NARRATIVE_EVENTS = [
    { name: '打擊機特訓', stat: 'con', succText: '手感火燙，擊球點完全咬中！打擊+2', failText: '越打越糊，打擊姿勢有點跑掉。打擊-1' },
    { name: '重量訓練週期', stat: 'pow', succText: '深蹲破 PR，全身充滿爆發力量！力量+2, 體力+1', failText: '操之過急，肌肉緊繃休養了一週。體力-1' },
    { name: '牛棚加練球種', stat: 'brk', succText: '找到了球種新的握法，尾勁明顯提升！變化球+2', failText: '越投越歪，投球機制有些亂掉。控球-1' },
    { name: '長傳接訓練', stat: 'arm', succText: '雷射肩養成中，外野長傳精準到位！臂力+2', failText: '肩膀有些緊繃，教練喊停叫你休養。臂力-1' },
    { name: '影像分析課', stat: 'eye', succText: '看穿投打習性，選球判斷力大增！選球+2', failText: '資訊過載，站上打擊區反而想太多。選球-1' },
    { name: '跑壘特訓', stat: 'spd', succText: '起跑瞬間判斷神速，盜壘時機抓極準！跑壘+2', failText: '拉傷大腿後側，休養了兩週。跑壘-1' },
    { name: '啦啦隊約會傳聞', stat: 'con', succText: '感情甜蜜，場上表現更加英勇！全能力+1', failText: '被狗仔隊拍到登上週刊封面，心情大受影響。選球-1' },
    { name: '教練深夜談話', stat: 'eye', succText: '教練點出你的關鍵缺點，心智成熟大躍進！天花板上限提升！', failText: '講話過於直接，壓力過大感到沮喪。' },
    { name: '隊友宿敵對決', stat: 'pow', succText: '在隊內分組賽擊出再見全壘打！力量+2', failText: '遭到對方三振，激起了強烈的勝負欲！' },
    { name: '商業廣告拍攝', stat: 'money', succText: '代言休旅車廣告獲得豐厚報酬！零用金+30萬', failText: '拍攝耽誤了自主訓練時間。' }
  ];

  /* ==========================================================================
     4. 靜態資料庫 (Teams, Leagues, Equipment, Assets, Chance Cards)
     ========================================================================== */
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
    { id: 'p_01', icon: '🏏', name: '特製楓木打擊重棒', desc: '力量+5, 全壘打率提升', price: 150000, stat: { pow: 5 } },
    { id: 'p_02', icon: '🧤', name: '加重練習打擊手套', desc: '打擊+4, 選球+3', price: 120000, stat: { con: 4, eye: 3 } },
    { id: 'p_03', icon: '👟', name: '碳纖維輕量釘鞋', desc: '跑壘+6, 盜壘成功率大增', price: 140000, stat: { spd: 6 } },
    { id: 'p_04', icon: '🦺', name: '鈦合金防護面罩', desc: '捕手接捕+8, 傷病風險-30%', price: 180000, stat: { cat: 8, fld: 4 } },
    { id: 'p_05', icon: '⛩️', name: '神社必勝祈願勝守', desc: '運氣大爆發, 關鍵時刻能力+5', price: 100000, stat: { con: 3, pow: 3 } },
    { id: 'p_06', icon: '🧢', name: '家傳幸運縫線球帽', desc: '控球+5, 精神抗壓高', price: 130000, stat: { ctl: 5 } },
    { id: 'p_07', icon: '💪', name: '高科技肌能護臂', desc: '臂力+6, 球速+2km/h', price: 200000, stat: { arm: 6, vel: 2 } },
    { id: 'p_08', icon: '💍', name: '總冠軍運勢金戒', desc: '全能力+2', price: 300000, stat: { con: 2, pow: 2, ctl: 2, vel: 2 } },
    { id: 'p_09', icon: '🕶️', name: '戰術防眩光太陽眼鏡', desc: '選球+6, 守備範圍+4', price: 110000, stat: { eye: 6, fld: 4 } },
    { id: 'p_10', icon: '🧂', name: '王牌專用止滑粉盒', desc: '變化球+6, 控球+3', price: 160000, stat: { brk: 6, ctl: 3 } },
    { id: 'p_11', icon: '🏕️', name: '甲子園紀念白土香囊', desc: '體力+8', price: 220000, stat: { sta: 8 } },
    { id: 'p_12', icon: '⚡', name: '雷射肩強投訓練彈繩', desc: '臂力+8', price: 170000, stat: { arm: 8 } },
    { id: 'p_13', icon: '🎯', name: '九宮格精準控球目標', desc: '控球+7', price: 190000, stat: { ctl: 7 } },
    { id: 'p_14', icon: '🔥', name: '剛速球火球訓練重球', desc: '球速+3km/h', price: 250000, stat: { vel: 3 } },
    { id: 'p_15', icon: '🧘', name: '靜心冥想防壓耳罩', desc: '選球+7', price: 140000, stat: { eye: 7 } },
    { id: 'p_16', icon: '🥊', name: '爆發力握力訓練器', desc: '打擊+5, 力量+3', price: 130000, stat: { con: 5, pow: 3 } },
    { id: 'p_17', icon: '🩹', name: '運動水療保健劑', desc: '體力+5', price: 150000, stat: { sta: 5 } },
    { id: 'p_18', icon: '📊', name: '大聯盟級影像分析軟體', desc: '選球+8, 變化球+4', price: 350000, stat: { eye: 8, brk: 4 } },
    { id: 'p_19', icon: '🛡️', name: '護肘打擊保護甲', desc: '防護打擊', price: 120000, stat: { con: 3 } },
    { id: 'p_20', icon: '👟', name: '人工草皮特製抓地鞋', desc: '守備+6, 跑壘+3', price: 160000, stat: { fld: 6, spd: 3 } },
    { id: 'p_21', icon: '🏅', name: '國家隊MVP紀念項鍊', desc: '全能力+3', price: 400000, stat: { con: 3, pow: 3, ctl: 3 } },
    { id: 'p_22', icon: '🧊', name: '低溫冰敷急速復原儀', desc: '體力+10', price: 300000, stat: { sta: 10 } },
    { id: 'p_23', icon: '📖', name: '名將傳奇投打秘笈', desc: '打擊+6, 力量+6', price: 450000, stat: { con: 6, pow: 6 } },
    { id: 'p_24', icon: '🥎', name: '魔球變轉角度測量儀', desc: '變化球+8', price: 280000, stat: { brk: 8 } },
    { id: 'p_25', icon: '🏋️', name: '私人加壓重訓深蹲架', desc: '力量+7, 體力+4', price: 320000, stat: { pow: 7, sta: 4 } }
  ];

  // 階梯式解鎖資產 (Progressive Cars & Houses)
  const CARS_LIST = [
    { id: 'car_01', tier: 1, name: '二手國民小轎車', price: 100000, icon: '🚗', desc: '入門代步小車' },
    { id: 'car_02', tier: 1, name: '國產舒適休旅車', price: 400000, icon: '🚙', desc: '空間寬敞，載裝備方便' },
    { id: 'car_03', tier: 1, name: '日系街頭跑車', price: 800000, icon: '🏎️', desc: '年輕球員熱門首選' },
    { id: 'car_04', tier: 2, name: '德系豪華房車', price: 1500000, icon: '🚘', desc: '展現職棒主力身價' },
    { id: 'car_05', tier: 2, name: '美式肌肉跑車', price: 2500000, icon: '🏎️', desc: '霸氣引擎轟鳴聲' },
    { id: 'car_06', tier: 3, name: '英倫敞篷跑車', price: 7000000, icon: '🏎️', desc: '兜風吸引媒體目光' },
    { id: 'car_07', tier: 3, name: '義式紅雙座超跑', price: 12000000, icon: '🏎️', desc: '頂級夢幻超跑' },
    { id: 'car_08', tier: 4, name: '德系極速賽道超跑', price: 20000000, icon: '🏎️', desc: '極速破300km/h' },
    { id: 'car_09', tier: 5, name: '傳奇狂飆賽車巨獸', price: 100000000, icon: '🏎️', desc: '巨星至尊座駕' }
  ];

  const HOUSES_LIST = [
    { id: 'house_01', tier: 1, name: '球隊青年單身宿舍', price: 0, icon: '🏠', desc: '預設居住' },
    { id: 'house_02', tier: 1, name: '市區單身套房', price: 500000, icon: '🏢', desc: '交通便捷' },
    { id: 'house_03', tier: 1, name: '捷運景觀大樓公寓', price: 1200000, icon: '🏢', desc: '採光佳' },
    { id: 'house_04', tier: 2, name: '明星水岸豪宅公寓', price: 6000000, icon: '🏙️', desc: '高樓層河景' },
    { id: 'house_05', tier: 2, name: '綠意獨立別墅', price: 12000000, icon: '🏡', desc: '私人庭院' },
    { id: 'house_06', tier: 3, name: '東京六本木高層豪宅', price: 45000000, icon: '🏙️', desc: '日職巨星象徵' },
    { id: 'house_07', tier: 4, name: '紐約曼哈頓頂層豪宅', price: 150000000, icon: '🏙️', desc: '鳥瞰中央公園' },
    { id: 'house_08', tier: 5, name: '傳奇名人堂極致莊園', price: 500000000, icon: '👑', desc: '終極榮耀城堡' }
  ];

  const CHANCE_CARDS = [
    { name: '天道酬勤', desc: '本季 AP 配點額外 +5 點！', effect: (S) => { S.ap += 5; } },
    { name: '球探關注', desc: '評價大幅提升，合約金增加！', effect: (S) => { S.salary = Math.round(S.salary * 1.2); } },
    { name: '超常發揮', desc: '本季打率/防禦率大幅提升！', effect: (S) => { S.ab.con += 3; S.ab.ctl += 3; } },
    { name: '骰子爆發', desc: '配點效果雙倍爆發！', effect: (S) => { S.ap += 3; } },
    { name: '貴人相助', desc: '前輩親自指導，全屬性+2！', effect: (S) => { for (let k in S.ab) S.ab[k] += 2; } },
    { name: '贊助商加碼', desc: '獲得廣告代言，零用金+30萬！', effect: (S) => { S.money += 300000; } }
  ];

  /* ==========================================================================
     5. 全局狀態 S
     ========================================================================== */
  let S = {};
  let unlockedCodex = JSON.parse(localStorage.getItem('MYYAKYO_CODEX') || '[]');
  let inheritedItem = JSON.parse(localStorage.getItem('MYYAKYO_INHERITED') || 'null');

  function saveCodex(itemId) {
    if (!unlockedCodex.includes(itemId)) {
      unlockedCodex.push(itemId);
      localStorage.setItem('MYYAKYO_CODEX', JSON.stringify(unlockedCodex));
    }
  }

  function resetState(name, origin, position, subpos, archetype, seed) {
    seedInit(seed || Math.random().toString(36).slice(2, 10));

    S = {
      name: name || '佐藤大樹',
      origin: origin || 'JP',
      position: position,
      subpos: subpos || 'IF',
      dpos: position === 'PITCHER' ? 'P' : (subpos === 'C' ? 'C' : (subpos === 'IF' ? 'SS' : 'CF')),
      role: position === 'PITCHER' ? 'SP' : (position === 'TWOWAY' ? 'SP/DH' : 'DH'),
      archetype: archetype,

      age: 16,
      year: 2026,
      stage: 'HS1',
      leagueKey: origin === 'JP' ? 'HS_JP' : 'HS_TW',
      team: origin === 'JP' ? '大阪桐蔭高校' : '平鎮高中',

      // 當前屬性 (Current)
      ab: { con: 30, pow: 28, spd: 32, arm: 30, fld: 30, cat: 25, eye: 28, vel: 132, ctl: 28, brk: 26, sta: 35 },
      
      // 天花板上限 (Potential Ceilings - OOTP style)
      pot: { con: 82, pow: 80, spd: 78, arm: 76, fld: 78, cat: 70, eye: 80, vel: 156, ctl: 80, brk: 82, sta: 85 },

      traits: [],
      ap: 10,
      chanceCardDrawnThisPhase: false, // 每次行動限抽 1 次

      money: 100000,
      salary: 0,
      maxUnlockedAssetTier: 1, // 資產階梯解鎖等級 (Tier 1 -> Tier 2 -> ...)
      ownedAssets: { house: 'house_01', car: null },

      ownedEquipment: [],
      runShopPool: [], // 20幾種道具隨機池

      stats: [],
      trophies: [],
      rings: 0,
      careerWAR: 0, careerHits: 0, careerHR: 0, careerWins: 0, careerSO: 0,
      managerStats: { years: 0, wins: 0, losses: 0, titles: 0 }
    };

    applyArchetypeBonus();
    applyInheritedItemBonus();
    initRunShopPool();
  }

  function applyArchetypeBonus() {
    const a = S.ab;
    if (S.archetype === 'POWER') { a.pow += 8; a.con += 3; a.vel += 5; S.traits.push('💥 怪力無雙'); }
    else if (S.archetype === 'SPEED_DEF') { a.spd += 8; a.fld += 6; a.ctl += 6; S.traits.push('⚡ 疾風雷射肩'); }
    else if (S.archetype === 'GENIUS') { a.con += 6; a.pow += 6; a.vel += 4; a.brk += 4; S.traits.push('👑 十年一遇天才'); }
    else { a.con += 4; a.pow += 4; a.spd += 4; a.ctl += 4; S.traits.push('⚖️ 全能基石'); }

    if (S.position === 'TWOWAY') S.traits.push('⚔️ 大谷雙刀流');
  }

  function applyInheritedItemBonus() {
    if (!inheritedItem) return;
    const item = ALL_PROPOSALS.find(e => e.id === inheritedItem.id);
    if (item) {
      S.ownedEquipment.push(item);
      for (let k in item.stat) S.ab[k] = (S.ab[k] || 0) + item.stat[k];
      S.traits.push(`🎁 傳承: ${item.name}`);
    }
  }

  // 每次開局隨機洗牌 20~24 種道具池
  function initRunShopPool() {
    const shuffled = ALL_PROPOSALS.slice().sort(() => R() - 0.5);
    S.runShopPool = shuffled.slice(0, ri(18, 22));
  }

  /* ==========================================================================
     6. 模擬與計算 (Sim Engine)
     ========================================================================== */
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
    }

    if (s.isPitcher) {
      s.pG = 25; s.IP = +(s.pG * clamp(5.5 + diff * 0.04, 4.5, 7.1)).toFixed(1);
      s.W = Math.round(s.pG * 0.55); s.L = Math.max(0, s.pG - s.W);
      s.ERA = +clamp(4.20 - diff * 0.08, 1.20, 7.50).toFixed(2);
      s.WHIP = +(1.35 - diff * 0.012).toFixed(2);
      s.SO = Math.round((s.IP / 9) * clamp(6.5 + (a.vel - 135) * 0.15, 4.0, 13.5));
      s.pitWAR = +((4.50 - s.ERA) * (s.IP / 40)).toFixed(1);
      S.careerWins += s.W; S.careerSO += s.SO;
    }

    const yearWAR = +((s.batWAR || 0) + (s.pitWAR || 0)).toFixed(1);
    S.careerWAR = +(S.careerWAR + yearWAR).toFixed(1);
    S.stats.push(s);

    if (S.salary > 0) S.money += Math.round(S.salary * 0.3);

    // 觸發 1~2 次季中隨機事件
    triggerRandomEvent();

    return s;
  }

  function triggerRandomEvent() {
    const ev = NARRATIVE_EVENTS[ri(0, NARRATIVE_EVENTS.length - 1)];
    const succ = R() < 0.6;
    if (succ) {
      if (ev.stat !== 'money' && S.ab[ev.stat]) S.ab[ev.stat] += 2;
      addLogCard(`✨ 季中隨機事件【${ev.name}】`, ev.succText, 'good', '訓練事件');
    } else {
      addLogCard(`⚠️ 季中隨機事件【${ev.name}】`, ev.failText, 'bad', '訓練事件');
    }
  }

  /* ==========================================================================
     7. UI Renderers (Theme, Progress Bars, Shop, Assets, Codex)
     ========================================================================== */
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
    renderAllocBars();
    renderShop();
    renderAssets();
    renderCodex();
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

  // 屬性配點與天花板進度條 (Progress Bars with Ceilings)
  function renderAllocBars() {
    const container = document.getElementById('alloc-bars-container');
    const a = S.ab;
    const pot = S.pot;

    const config = S.position === 'PITCHER'
      ? [{ key: 'vel', label: '球速 (km/h)', max: 165 }, { key: 'ctl', label: '控球', max: 99 }, { key: 'brk', label: '變化球', max: 99 }, { key: 'sta', label: '體力', max: 99 }]
      : [{ key: 'con', label: '打擊', max: 99 }, { key: 'pow', label: '力量', max: 99 }, { key: 'eye', label: '選球', max: 99 }, { key: 'spd', label: '跑壘', max: 99 }, { key: 'fld', label: '守備', max: 99 }];

    container.innerHTML = config.map(c => {
      const val = a[c.key];
      const ceiling = pot[c.key] || 80;
      const curPct = Math.min(100, (val / c.max) * 100);
      const ceilPct = Math.min(100, (ceiling / c.max) * 100);

      return `
        <div class="alloc-bar-row">
          <div class="alloc-bar-header">
            <span class="alloc-bar-name">${c.label}</span>
            <div>
              <span class="alloc-bar-num">${val}</span>
              <span class="alloc-bar-ceiling">(天花板: ${ceiling})</span>
            </div>
          </div>
          <div class="bar-track-outer">
            <div class="bar-fill-current" style="width: ${curPct}%"></div>
            <div class="bar-ceiling-marker" style="left: ${ceilPct}%" title="潛力上限: ${ceiling}"></div>
          </div>
          <div class="alloc-controls mt-2">
            <button class="btn-alloc-step btn-minus" data-key="${c.key}">-</button>
            <button class="btn-alloc-step btn-plus" data-key="${c.key}">+</button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.key;
        if (S.ap > 0 && a[k] < (pot[k] || 99)) {
          S.ap--;
          a[k]++;
          document.getElementById('alloc-ap-count').textContent = S.ap;
          renderAllocBars();
        }
      });
    });

    container.querySelectorAll('.btn-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.key;
        if (a[k] > 20) {
          S.ap++;
          a[k]--;
          document.getElementById('alloc-ap-count').textContent = S.ap;
          renderAllocBars();
        }
      });
    });
  }

  function renderShop() {
    const permGrid = document.getElementById('shop-permanent-grid');
    permGrid.innerHTML = S.runShopPool.slice(0, 4).map(item => {
      const owned = S.ownedEquipment.some(e => e.id === item.id);
      return `
        <div class="item-card">
          <div class="item-icon">${item.icon}</div>
          <div class="item-name">${item.name}</div>
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
        <div class="item-icon">${item.icon}</div>
        <div class="item-name">${item.name}</div>
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
      renderAll();
    }
  };

  window.buyConsumable = function (id) {
    const item = ALL_PROPOSALS.find(c => c.id === id);
    if (item && S.money >= item.price) {
      S.money -= item.price;
      for (let k in item.stat) S.ab[k] = (S.ab[k] || 0) + item.stat[k];
      addLogCard('🛒 購買補給品', `成功使用【${item.name}】獲得即時能力增強！`, 'good', '購物成功');
      renderAll();
    }
  };

  // 階梯式解鎖資產渲染
  function renderAssets() {
    const carGrid = document.getElementById('assets-cars-grid');
    carGrid.innerHTML = CARS_LIST.filter(c => c.tier <= S.maxUnlockedAssetTier + 1).map(car => {
      const owned = S.ownedAssets.car === car.id;
      const locked = car.tier > S.maxUnlockedAssetTier;
      return `
        <div class="asset-card">
          <div class="asset-icon">${car.icon}</div>
          <div class="asset-name">${locked ? '🔒 待解鎖座駕' : car.name}</div>
          <div class="asset-desc">${locked ? '購買前一階座駕以解鎖此款高級跑車' : car.desc}</div>
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
          <div class="asset-desc">${locked ? '購買前一階豪宅以解鎖頂級莊園' : house.desc}</div>
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
      addLogCard('🏎️ 豪車交車', `成功購買【${car.name}】！解鎖更高階豪華超跑！`, 'gold', '資產解鎖');
      renderAll();
    }
  };

  window.buyHouse = function (id, tier) {
    const house = HOUSES_LIST.find(h => h.id === id);
    if (house && S.money >= house.price) {
      S.money -= house.price;
      S.ownedAssets.house = house.id;
      if (tier >= S.maxUnlockedAssetTier) S.maxUnlockedAssetTier = tier + 1;
      addLogCard('🏰 豪宅入住', `入住【${house.name}】！解鎖下一階奢華莊園！`, 'gold', '資產解鎖');
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

  /* ==========================================================================
     8. 流程推進與機會卡限制
     ========================================================================== */
  function nextPhase() {
    if (S.stage === 'RETIRED') { showRetirementScreen(); return; }
    document.getElementById('container-choices').classList.add('hidden');
    S.chanceCardDrawnThisPhase = false; // 重置每季限抽1次限制

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

  function drawChanceCard() {
    if (S.chanceCardDrawnThisPhase) {
      alert('本行動階段已抽過機會卡！請前進下個階段後再行抽取！');
      return;
    }
    S.chanceCardDrawnThisPhase = true;
    const card = CHANCE_CARDS[ri(0, CHANCE_CARDS.length - 1)];
    card.effect(S);
    addLogCard(`🃏 抽中機會卡【${card.name}】`, card.desc, 'gold', '機會卡');
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

  /* ==========================================================================
     9. 初始化
     ========================================================================== */
  function initApp() {
    if (inheritedItem) {
      const banner = document.getElementById('inherited-legacy-banner');
      banner.classList.remove('hidden');
      document.getElementById('inherited-item-name').textContent = `🎁 野球的傳承：${inheritedItem.name}`;
      document.getElementById('inherited-story-snippet').textContent = `「這是傳奇前輩留下來的 ${inheritedItem.name}，帶著他的棒球魂繼續奮戰吧！」`;
    }

    // 主題切換器
    document.getElementById('select-theme-switcher').addEventListener('change', (e) => {
      document.body.className = e.target.value;
    });

    // 頁籤切換
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });

    // 天賦選擇
    document.querySelectorAll('.archetype-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.archetype-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });

    // 開始遊戲
    document.getElementById('btn-start-game').addEventListener('click', () => {
      const name = document.getElementById('input-name').value.trim() || '佐藤大樹';
      const origin = document.getElementById('select-origin').value;
      const pos = document.getElementById('select-position').value;
      const subpos = document.getElementById('select-subpos').value;
      const seed = document.getElementById('input-custom-seed').value.trim();
      const arch = document.querySelector('.archetype-card.selected').dataset.type;

      resetState(name, origin, pos, subpos, arch, seed);

      document.getElementById('screen-creation').classList.remove('active');
      document.getElementById('screen-dashboard').classList.add('active');

      renderAll();
      addLogCard('🌟 《我的野球人生》傳奇啟航', `${S.name} 降生於【${S.origin === 'JP' ? '日本' : '台灣'}】，踏入【${S.team}】，開啟了他的棒球生涯！`, 'gold', '開場');
    });

    document.getElementById('btn-next-phase').addEventListener('click', nextPhase);
    document.getElementById('btn-draw-chance-card').addEventListener('click', drawChanceCard);
    document.getElementById('btn-confirm-alloc').addEventListener('click', nextPhase);

    document.getElementById('btn-open-codex').addEventListener('click', () => {
      renderCodex();
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
