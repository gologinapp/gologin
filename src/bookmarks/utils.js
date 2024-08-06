import { promises as _promises } from 'fs';

const { readFile } = _promises;

export const getCurrentProfileBookmarks = async (pathToBookmarks) => {
  let bookmarks = {};
  try {
    const currentBookmarksFileData = await readFile(pathToBookmarks, { encoding: 'utf-8' });
    bookmarks = JSON.parse(currentBookmarksFileData);
  } catch (error) {
    console.log(error);
  }

  return bookmarks;
};
