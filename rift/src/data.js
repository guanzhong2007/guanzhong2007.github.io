export const SIZE = 22;
export const BALANCE = { actions:3, startEP:2, npcSteps:1, npcStepMs:300 };
export const TERRAINS = {
  grass: { name: '草原', color: '#799868', side: '#4a6550', food: 10, info: '健康区域食物每回合恢复 1。普通陆地。' },
  forest: { name: '森林', color: '#4f7c64', side: '#335244', food: 14, info: '健康区域食物每回合恢复 1。火灾时应尽早撤离。' },
  coast: { name: '海岸', color: '#c0b387', side: '#80775c', food: 6, info: '潮间带有少量食物，可通行。' },
  shallow: { name: '浅水', color: '#71b0ae', side: '#497b83', food: 8, info: '原始细胞可进入。鳃能降低水域通行限制。' },
  lake: { name: '湖泊', color: '#508f9c', side: '#365e78', food: 12, info: '需要鳃或翅膀。水生生物的栖息地。' },
  deep: { name: '深水', color: '#376978', side: '#244453', food: 8, info: '需要鳃或翅膀。无鳃者遭洪水困住时每回合受伤。' },
  highland: { name: '高地', color: '#a4ac80', side: '#72775d', food: 5, info: '沿缓坡可达；陡坡需要腿，崖壁需要攀爬或飞行。' },
  cliff: { name: '岩台', color: '#929b8e', side: '#5a655d', food: 0, info: '岩台可以站立；崖壁是相邻地块间的陡直边缘。' }
};
export const ORGANS = [
  { id: 'mouth', name: '嘴', icon: '◒', level: 0, bio: 3, ep: 1, effect: '每次进食最多获得 4 生物质，攻击 +1。' },
  { id: 'stomach', name: '消化系统', icon: '◔', level: 1, bio: 5, ep: 3, requires: ['mouth'], effect: '替换嘴；进食提高到 6，保留口器攻击。', replaces:'mouth' },
  { id: 'limbs', name: '基础肢体', icon: '⋔', level: 0, bio: 3, ep: 1, effect: '主动疾行：1 次行动沿可通行路线移动最多 2 格。' },
  { id: 'gills', name: '鳃', icon: '≋', level: 1, bio: 5, ep: 3, effect: '进入湖泊与深水，抵御积水区溺水伤害。' },
  { id: 'lungs', name: '保水表皮', icon: '♧', level: 1, bio: 4, ep: 3, effect: '抵御干旱区伤害。' },
  { id: 'legs', name: '腿', icon: 'ϟ', level: 2, bio: 6, ep: 4, requires: ['limbs'], effect: '替换基础肢体；攀登陡坡，保留疾行。', replaces:'limbs' },
  { id: 'shell', name: '甲壳', icon: '⬡', level: 2, bio: 7, ep: 4, effect: '防御 +2；普通移动仍为 1 次行动。' },
  { id: 'teeth', name: '牙齿', icon: '⋀', level: 2, bio: 6, ep: 4, requires: ['mouth'], effect: '攻击 +3；猎物额外留下 2 生物质。' },
  { id: 'eyes', name: '眼睛', icon: '◉', level: 2, bio: 4, ep: 3, effect: '观察半径从 5 增至 9 格。首版属性信息全部可见。' },
  { id: 'wings', name: '翅膀', icon: '⋈', level: 3, bio: 12, ep: 8, effect: '飞越崖壁和水域，每格 1 次行动；不免疫环境伤害。' },
  { id: 'venom', name: '毒腺', icon: '⟡', level: 2, bio: 7, ep: 5, special: true, effect: '攻击附加中毒：接下来 2 次回合结算各损失 1 生命。' },
  { id: 'armor', name: '厚甲', icon: '▣', level: 2, bio: 8, ep: 5, special: true, effect: '防御 +2，无额外移动消耗。' },
  { id: 'regen', name: '再生器官', icon: '✧', level: 2, bio: 8, ep: 5, special: true, effect: '回合开始消耗 1 生物质，恢复 2 生命；满血不消耗。' }
];
ORGANS.push({id:'heat',name:'耐热表皮',icon:'♨',level:0,bio:4,ep:1,effect:'抵御火灾与灼热灾区伤害。'}, {id:'climb',name:'攀爬钩肢',icon:'⌁',level:1,bio:6,ep:2,effect:'攀登垂直崖壁，打开高地近路。'});
export const BODY = [null, { bio: 3, ep: 1 }, { bio: 8, ep: 5 }, { bio: 18, ep: 12 }];
export const SPECIES = {
  bug: { name: '苔斑虫', type: '小型虫类', hp: 2, attack: 1, defense: 0, color: '#e4c375', organs: ['limbs'], drop: 7, tissue: 'limbs', stars: 1, behavior: '接近时缓慢逃跑，每回合最多移动 1 格。', special: '可能掉落再生组织。' },
  grazer: { name: '芽背兽', type: '草食生物', hp: 9, attack: 1, defense: 0, color: '#b4c99a', organs: ['limbs'], drop: 12, tissue: 'stomach', stars: 1, behavior: '安静觅食；受到攻击后逃跑。', special: '不主动攻击。' },
  predator: { name: '毒刺兽', type: '小型捕食者', hp: 8, attack: 2, defense: 0, color: '#d19383', organs: ['limbs'], drop: 16, tissue: 'venom', stars: 3, behavior: '追逐附近较弱生物，畏惧强敌。', special: '攻击有 25% 概率使目标中毒 2 回合。' },
  aquatic: { name: '蓝鳍团', type: '湖泊生物', hp: 6, attack: 2, defense: 0, color: '#95d7e0', organs: ['gills'], drop: 11, tissue: 'gills', stars: 2, behavior: '在水域觅食，受伤时反击。', special: '只能生活在水域，免疫溺水。' },
  armored: { name: '岩甲兽', type: '重甲生物', hp: 12, attack: 2, defense: 2, color: '#b3aca2', organs: ['shell'], drop: 22, tissue: 'armor', stars: 3, behavior: '缓慢游荡；受到攻击后保卫领地。', special: '高防御，可能掉落厚甲组织。' }
};
export const DISASTERS = { flood: { name: '洪水', icon: '≋', color: '#7acbd6' }, drought: { name: '干旱', icon: '☀', color: '#efc17e' }, fire: { name: '森林火灾', icon: '♨', color: '#ee9270' } };
SPECIES.bug.tissues=['limbs','eyes'];
SPECIES.grazer.tissues=['stomach','regen'];
SPECIES.predator.tissues=['venom','teeth'];
export const manhattan = (a, b) => Math.abs(a.x-b.x) + Math.abs(a.y-b.y);
export const key = (x,y) => `${x},${y}`;
export const isWater = terrain => ['shallow','lake','deep'].includes(terrain);
export function random(state) { let t = state.rng += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
export const pick = (state, list) => list[Math.floor(random(state) * list.length)];

