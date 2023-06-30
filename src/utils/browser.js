export const checkAutoLang = (profileData, timezoneCheckResult) => {
  if (!profileData.autoLang) {
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

      const qualityParam = 10-index;
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
