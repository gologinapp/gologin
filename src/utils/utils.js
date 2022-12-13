export const get = (value, path, defaultValue) =>
  String(path).split('.').reduce((acc, v) => {
    try {
      acc = (!!acc[v] && acc[v] !== null) ? acc[v] : defaultValue;
    } catch (e) {
      return defaultValue;
    }

    return acc;
  }, value);

