import { TRANSLATIONS, type Lang } from './translations';

/** Lightweight dictionary localisation. English by default, Korean optional. */
export class I18n {
  lang: Lang;
  private listeners: (() => void)[] = [];

  constructor(lang: Lang = 'en') {
    this.lang = lang in TRANSLATIONS ? lang : 'en';
  }

  setLanguage(lang: Lang): void {
    if (!TRANSLATIONS[lang] || lang === this.lang) return;
    this.lang = lang;
    for (const l of this.listeners) l();
  }

  onChange(fn: () => void): void { this.listeners.push(fn); }

  /** `t('ui.play')` or `t('ui.jump', { n: 20 })`. Falls back to English, then to the key. */
  t(path: string, vars?: Record<string, string | number>): string {
    const walk = (lang: Lang): unknown => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], TRANSLATIONS[lang]);
    let v = walk(this.lang);
    if (typeof v !== 'string') v = walk('en');
    let s = typeof v === 'string' ? v : path;
    if (vars) for (const [k, val] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(val));
    return s;
  }
}
