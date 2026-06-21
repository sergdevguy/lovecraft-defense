export type Locale = 'ru' | 'en'

export const locales: readonly Locale[] = ['ru', 'en']

export const localeNames: Record<Locale, string> = {
  ru: 'Русский',
  en: 'English',
}

type Dict = Record<string, string>

const en: Dict = {
  'app.title': 'LOVECRAFT',
  'app.subtitle': 'DEFENSE',
  'menu.note': 'Six cursed routes. Twelve waves each.',

  'btn.start': 'START',
  'btn.levels': 'LEVELS',
  'btn.mainMenu': 'MAIN MENU',
  'btn.menu': 'MENU',
  'btn.resume': 'RESUME',
  'btn.retry': 'RETRY',
  'btn.nextLevel': 'NEXT LEVEL',

  'levelSelect.title': 'SELECT LEVEL',
  'card.waves': '{n} WAVES',
  'card.locked': 'LOCKED',

  'ready.level': 'LEVEL {n}',
  'ready.prompt': 'Press ENTER to begin',
  'ready.hint': 'Place your towers, then press ENTER to send the wave',
  'btn.startWave': 'START WAVE',

  'end.victory': 'VICTORY',
  'end.defeat': 'DEFEAT',
  'end.victoryDetail': 'Wave {n} completed',
  'end.defeatDetail': 'Your sanity has been lost',
  'end.stats': 'Score {score}\nLevel {level}\nSanity {sanity}',

  'pause.title': 'PAUSED',

  'hud.sanity': 'SANITY',
  'hud.coins': 'COINS',
  'hud.wave': 'WAVE',
  'hud.score': 'SCORE',
  'hud.level': 'LEVEL',

  'tower.title': '{name} L{level}',
  'tower.maxLevel': 'MAX LEVEL',
  'tower.upgrade': 'UP {cost}',
  'tower.sell': 'SELL {refund}',
  'tower.lantern': 'LANTERN',
  'tower.obelisk': 'OBELISK',
  'tower.idol': 'IDOL',

  'settings.title': 'SETTINGS',
  'settings.language': 'Language',

  'btn.howToPlay': 'HOW TO PLAY',
  'btn.skip': 'SKIP',
  'btn.next': 'NEXT',
  'btn.done': 'GOT IT',
  'btn.back': 'BACK',

  'monster.cultist': 'Cultist',
  'monster.deepOne': 'Deep One',
  'monster.shoggoth': 'Shoggoth',

  'tutorial.goal': 'Enemies crawl along the road toward the portal. Each one that breaks through drains your Sanity. Sanity hits zero — you lose.',
  'tutorial.placeTower': 'Tap the highlighted slot to build a tower.',
  'tutorial.chooseTower': 'Pick a tower. Lantern — fast, weak shots. Obelisk — a mortar, splash damage. Idol — long range and strong, but slow.',
  'tutorial.startWave': 'Ready? Press ENTER or the button to send the wave.',
  'tutorial.enemies': 'Cultists come first — fast and weak. Later: sturdier Deep Ones and slow Shoggoth tanks.',
  'tutorial.upgrade': 'Tap your tower to upgrade or sell it.',
  'tutorial.controls': 'Pause and time-speed controls sit at the bottom. Defend the portal. Good luck!',

  'help.title': 'HOW TO PLAY',
  'help.goalHeading': 'GOAL',
  'help.towersHeading': 'TOWERS',
  'help.enemiesHeading': 'ENEMIES',
  'help.goalText': 'Stop enemies before they reach the portal. Build towers on slots, send waves, survive all 12 waves of each level.',
  'help.tower.lantern': 'Fast, light single-target shots.',
  'help.tower.obelisk': 'Mortar: heavy lobbed shells, area damage.',
  'help.tower.idol': 'Long-range heavy hits, slow reload.',
  'help.monster.cultist': 'Fast and weak. Comes in crowds.',
  'help.monster.deepOne': 'Medium speed, tougher than a cultist.',
  'help.monster.shoggoth': 'Slow tank. Hits Sanity hard.',
  'help.dmg': 'DMG',
  'help.range': 'Range',
  'help.rate': 'Rate',
  'help.cost': 'Cost',
  'help.splash': 'Splash',
  'help.hp': 'HP',
  'help.speed': 'Speed',
  'help.reward': 'Reward',
  'help.sanity': '−Sanity',

  'fx.upgrade': 'level {n}',
  'fx.wave': 'wave {n}',
  'fx.victory': 'victory',
  'fx.sanity': '-sanity',
  'fx.boom': 'boom -{n}',

  'level.1.name': 'Innsmouth Coast',
  'level.1.subtitle': 'A drowned road under watchful stars',
  'level.2.name': 'Black Reef',
  'level.2.subtitle': 'The tide brings older hunger',
  'level.3.name': 'Miskatonic Gate',
  'level.3.subtitle': 'Ruins breathe beneath the stones',
  'level.4.name': "R'lyeh Shoals",
  'level.4.subtitle': 'Geometry bends toward the deep',
  'level.5.name': 'Elder Causeway',
  'level.5.subtitle': 'No lantern burns without a cost',
  'level.6.name': 'The Sunken Throne',
  'level.6.subtitle': 'The dreamer stirs below',
}

const ru: Dict = {
  'app.title': 'ЛАВКРАФТ',
  'app.subtitle': 'ОБОРОНА',
  'menu.note': 'Шесть проклятых троп. По двенадцать волн.',

  'btn.start': 'СТАРТ',
  'btn.levels': 'УРОВНИ',
  'btn.mainMenu': 'ГЛАВНОЕ МЕНЮ',
  'btn.menu': 'МЕНЮ',
  'btn.resume': 'ПРОДОЛЖИТЬ',
  'btn.retry': 'ЗАНОВО',
  'btn.nextLevel': 'ДАЛЕЕ',

  'levelSelect.title': 'ВЫБОР УРОВНЯ',
  'card.waves': '{n} ВОЛН',
  'card.locked': 'ЗАКРЫТО',

  'ready.level': 'УРОВЕНЬ {n}',
  'ready.prompt': 'Нажмите ENTER, чтобы начать',
  'ready.hint': 'Расставьте башни, затем нажмите ENTER для запуска волны',
  'btn.startWave': 'НАЧАТЬ ВОЛНУ',

  'end.victory': 'ПОБЕДА',
  'end.defeat': 'ПОРАЖЕНИЕ',
  'end.victoryDetail': 'Волна {n} пройдена',
  'end.defeatDetail': 'Ваш рассудок потерян',
  'end.stats': 'Счёт {score}\nУровень {level}\nРассудок {sanity}',

  'pause.title': 'ПАУЗА',

  'hud.sanity': 'РАССУДОК',
  'hud.coins': 'МОНЕТЫ',
  'hud.wave': 'ВОЛНА',
  'hud.score': 'СЧЁТ',
  'hud.level': 'УРОВЕНЬ',

  'tower.title': '{name} ур.{level}',
  'tower.maxLevel': 'МАКС. УРОВЕНЬ',
  'tower.upgrade': 'УЛУЧ {cost}',
  'tower.sell': 'ПРОД {refund}',
  'tower.lantern': 'ФОНАРЬ',
  'tower.obelisk': 'ОБЕЛИСК',
  'tower.idol': 'ИДОЛ',

  'settings.title': 'НАСТРОЙКИ',
  'settings.language': 'Язык',

  'btn.howToPlay': 'КАК ИГРАТЬ',
  'btn.skip': 'ПРОПУСТИТЬ',
  'btn.next': 'ДАЛЕЕ',
  'btn.done': 'ПОНЯТНО',
  'btn.back': 'НАЗАД',

  'monster.cultist': 'Культист',
  'monster.deepOne': 'Глубоководный',
  'monster.shoggoth': 'Шоггот',

  'tutorial.goal': 'Враги ползут по тропе к порталу. Каждый прорвавшийся снижает рассудок. Рассудок до нуля — поражение.',
  'tutorial.placeTower': 'Тапни подсвеченный слот, чтобы построить башню.',
  'tutorial.chooseTower': 'Выбери башню. Фонарь — частые слабые залпы. Обелиск — мортира, урон по площади. Идол — дальний и сильный, но редкий.',
  'tutorial.startWave': 'Готов? Жми ENTER или кнопку, чтобы запустить волну.',
  'tutorial.enemies': 'Сначала идут культисты — быстрые и слабые. Дальше — крепкие Глубоководные и медленные Шогготы-танки.',
  'tutorial.upgrade': 'Тапни свою башню, чтобы улучшить или продать её.',
  'tutorial.controls': 'Снизу — пауза и ускорение времени. Защити портал. Удачи!',

  'help.title': 'КАК ИГРАТЬ',
  'help.goalHeading': 'ЦЕЛЬ',
  'help.towersHeading': 'БАШНИ',
  'help.enemiesHeading': 'ВРАГИ',
  'help.goalText': 'Не пропусти врагов к порталу. Строй башни на слотах, запускай волны, переживи все 12 волн каждого уровня.',
  'help.tower.lantern': 'Частые лёгкие залпы по одной цели.',
  'help.tower.obelisk': 'Мортира: тяжёлые навесные снаряды, урон по площади.',
  'help.tower.idol': 'Дальнобойные мощные удары, долгая перезарядка.',
  'help.monster.cultist': 'Быстрый и слабый. Идёт толпой.',
  'help.monster.deepOne': 'Средняя скорость, крепче культиста.',
  'help.monster.shoggoth': 'Медленный танк. Сильно бьёт по рассудку.',
  'help.dmg': 'Урон',
  'help.range': 'Радиус',
  'help.rate': 'Темп',
  'help.cost': 'Цена',
  'help.splash': 'Площадь',
  'help.hp': 'HP',
  'help.speed': 'Скорость',
  'help.reward': 'Награда',
  'help.sanity': '−Рассудок',

  'fx.upgrade': 'уровень {n}',
  'fx.wave': 'волна {n}',
  'fx.victory': 'победа',
  'fx.sanity': '-рассудок',
  'fx.boom': 'взрыв -{n}',

  'level.1.name': 'Побережье Иннсмута',
  'level.1.subtitle': 'Затонувшая дорога под бдительными звёздами',
  'level.2.name': 'Чёрный риф',
  'level.2.subtitle': 'Прилив несёт древний голод',
  'level.3.name': 'Врата Мискатоника',
  'level.3.subtitle': 'Руины дышат под камнями',
  'level.4.name': "Отмели Р'льеха",
  'level.4.subtitle': 'Геометрия гнётся к бездне',
  'level.5.name': 'Древняя дамба',
  'level.5.subtitle': 'Ни один фонарь не горит без платы',
  'level.6.name': 'Затонувший трон',
  'level.6.subtitle': 'Спящий шевелится внизу',
}

const dictionaries: Record<Locale, Dict> = { ru, en }

const storageKey = 'lovecraft-defense.locale'

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored === 'ru' || stored === 'en') {
      return stored
    }
  } catch {
    // localStorage unavailable (private mode / SSR) — fall through to default
  }
  return 'ru'
}

let currentLocale: Locale = readStoredLocale()

const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return currentLocale
}

export function setLocale(locale: Locale): void {
  if (locale === currentLocale) {
    return
  }
  currentLocale = locale
  try {
    localStorage.setItem(storageKey, locale)
  } catch {
    // ignore persistence failures
  }
  for (const listener of listeners) {
    listener()
  }
}

export function onLocaleChange(listener: () => void): void {
  listeners.add(listener)
}

export function t(key: string, params?: Record<string, string | number>): string {
  const dictionary = dictionaries[currentLocale]
  let value = dictionary[key] ?? en[key] ?? key
  if (params) {
    for (const [name, raw] of Object.entries(params)) {
      value = value.split(`{${name}}`).join(String(raw))
    }
  }
  return value
}
