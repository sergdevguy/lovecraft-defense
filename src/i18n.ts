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
