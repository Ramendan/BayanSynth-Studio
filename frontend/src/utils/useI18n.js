import { useAtomValue } from 'jotai';
import { settingsAtom } from '../store/atoms';

export function useI18n() {
  const settings = useAtomValue(settingsAtom);
  const lang = settings.language === 'ar' ? 'ar' : 'en';
  const isArabic = lang === 'ar';

  const t = (en, ar) => (isArabic ? (ar || en) : en);

  const number = (value) => {
    if (typeof value !== 'number') return value;
    return isArabic ? value.toLocaleString('ar-EG') : value.toLocaleString('en-US');
  };

  const plural = (count, enSingular, enPlural, arWord) => {
    if (isArabic) {
      return `${number(count)} ${arWord}`;
    }
    return `${count} ${count === 1 ? enSingular : enPlural}`;
  };

  return { lang, isArabic, t, number, plural };
}
