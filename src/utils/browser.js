export const checkAutoLang = (profileData, timezoneCheckResult, autoLang) => {
  if (!autoLang) {
    return checkBrowserLang(profileData);
  }

  let timezoneLang = '';
  const { country: timezoneCountry = '', languages } = timezoneCheckResult || {};
  if (languages) {
    const [firstDetectedLangLocale] = languages.split(',');
    timezoneLang = `${firstDetectedLangLocale}-${timezoneCountry}` || '';

    let resultLangsArr = [];
    const [lang = '', country = ''] = timezoneLang.split('-');
    if (country) {
      resultLangsArr.push([lang, country].join('-'));
    }

    resultLangsArr.push(lang, 'en-US', 'en');
    resultLangsArr = [...new Set(resultLangsArr)];

    const gologinLangsArr = [];
    const result = resultLangsArr.reduce((acc, cur, index) => {
      if (!index) {
        acc += `${cur},`;
        gologinLangsArr.push(cur);

        return acc;
      }

      const qualityParam = 10 - index;
      if (qualityParam > 0) {
        const separator = (resultLangsArr.length - index) < 2 ? '' : ',';
        gologinLangsArr.push(cur);
        acc += `${cur};q=${Number(qualityParam * 0.1).toFixed(1)}${separator}`;
      }

      return acc;
    }, '');

    [profileData.browserLang] = resultLangsArr;
    profileData.languages = gologinLangsArr.join(',');
    profileData.langHeader = result;
    profileData.navigator.language = result;

    return profileData.browserLang;
  }

  return checkBrowserLang(profileData);
};

const checkBrowserLang = (profileData, defaultLocale = 'en-US') => {
  if (profileData.langHeader) {
    return profileData.browserLang;
  }

  profileData.browserLang = defaultLocale;
  profileData.languages = defaultLocale;
  profileData.langHeader = defaultLocale;
  profileData.navigator.language = defaultLocale;

  return defaultLocale;
};

export const getIntlProfileConfig = (profileData, timezoneCheckResult, autoLang) => {
  if (!autoLang) {
    return checkBrowserLang(profileData);
  }

  let timezoneLang = '';
  const { country: timezoneCountry = '', languages } = timezoneCheckResult;
  if (!languages) {
    return checkBrowserLang(profileData);
  }

  const [firstDetectedLangLocale] = languages.split(',');
  // если есть languages, значит есть и timezoneCountry, иначе в languages пришла бы пустая строка
  timezoneLang = `${firstDetectedLangLocale}-${timezoneCountry}` || '';

  let resultLangsArr = [];
  const [lang = '', country = ''] = timezoneLang.split('-');
  if (country) {
    resultLangsArr.push([lang, country].join('-'));
  }

  resultLangsArr.push(lang, 'en-US', 'en');
  resultLangsArr = [...new Set(resultLangsArr)];

  const mainLanguage = getMainLanguage(resultLangsArr);

  return {
    accept_languages: resultLangsArr.join(','),
    selected_languages: resultLangsArr.join(','),
    app_locale: mainLanguage,
    forced_languages: [
      mainLanguage,
    ],
  };
};

const mainLocaleList = ['af', 'am', 'ar', 'as', 'az', 'be', 'bg', 'bn', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en-GB',
  'es-419', 'fr', 'fr-CA', 'gl', 'gu', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'ka', 'kk', 'km', 'kn', 'ko', 'ky', 'lo', 'lt', 'lv',
  'ml', 'mn', 'mr', 'ms', 'my', 'nb', 'ne', 'nl', 'or', 'pa', 'pl', 'pt-BR', 'pt-PT', 'ro', 'ru', 'si', 'sk', 'sl', 'sq', 'sr', 'sr-Latn', 'sv', 'sw',
  'ta', 'te', 'th', 'tr', 'uk', 'ur', 'uz', 'vi', 'zh-CN', 'zh-HK', 'zh-TW', 'zu', 'es', 'en-US', 'mk',
];

const getMainLanguage = (langArr) => {
  for (const lang of langArr) {
    if (mainLocaleList.includes(lang)) {
      return lang;
    }

    const [locale] = lang.split('-');
    if (mainLocaleList.includes(locale)) {
      return locale;
    }
  }

  return '';
};

