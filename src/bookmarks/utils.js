import { promises as _promises } from 'fs';

const { readFile } = _promises;

export const getCurrentProfileBookmarks = async (pathToBookmarks) => {
  let bookmarks = {};
  try {
    const currentBookmarksFileData = await readFile(pathToBookmarks, { encoding: 'utf-8' });
    bookmarks = JSON.parse(currentBookmarksFileData);
    if (bookmarks.bookmark_bar) {
      return bookmarks;
    }

    return bookmarks.roots || {};
  } catch (error) {
    console.log(error);
  }

  return bookmarks;
};
