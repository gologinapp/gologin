import { spawn } from 'child_process';
import { promises as _promises } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const { access, writeFile, unlink, mkdir } = _promises;

const HOMEDIR = homedir();
const BROWSER_PATH = join(HOMEDIR, '.gologin', 'browser');
const LOCK_FILE_PREFIX = 'download-lock-';

export class BrowserDownloadLockManager {
  constructor() {
    if (BrowserDownloadLockManager.instance) {
      return BrowserDownloadLockManager.instance;
    }

    BrowserDownloadLockManager.instance = this;
    BrowserDownloadLockManager.downloadPromises = new Map();
  }

  static getInstance() {
    if (!BrowserDownloadLockManager.instance) {
      BrowserDownloadLockManager.instance = new BrowserDownloadLockManager();
    }

    return BrowserDownloadLockManager.instance;
  }

  async ensureBrowserDownload(majorVersion, downloadFunction) {
    const lockKey = `${majorVersion}`;

    if (BrowserDownloadLockManager.downloadPromises.has(lockKey)) {
      return BrowserDownloadLockManager.downloadPromises.get(lockKey);
    }

    const lockFilePath = join(BROWSER_PATH, `${LOCK_FILE_PREFIX}${majorVersion}.json`);

    try {
      await mkdir(BROWSER_PATH, { recursive: true });

      const isBrowserExists = await this.checkBrowserExists(majorVersion);
      if (isBrowserExists) {
        return majorVersion;
      }

      const lockPromise = this.acquireLockAndDownload(lockFilePath, majorVersion, downloadFunction);
      BrowserDownloadLockManager.downloadPromises.set(lockKey, lockPromise);

      try {
        const result = await lockPromise;

        return result;
      } finally {
        BrowserDownloadLockManager.downloadPromises.delete(lockKey);
      }
    } catch (error) {
      BrowserDownloadLockManager.downloadPromises.delete(lockKey);
      throw error;
    }
  }

  async acquireLockAndDownload(lockFilePath, majorVersion, downloadFunction) {
    const maxWaitTime = 300000;
    const checkInterval = 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        await this.createLockFile(lockFilePath, majorVersion);

        const isBrowserExists = await this.checkBrowserExists(majorVersion);
        if (isBrowserExists) {
          await this.releaseLock(lockFilePath);

          return majorVersion;
        }

        await downloadFunction();
        await this.releaseLock(lockFilePath);

        return majorVersion;
      } catch (error) {
        if (error.code === 'EEXIST') {
          const lockValid = await this.checkLockValidity(lockFilePath);
          if (!lockValid) {
            console.log(`Lock file ${lockFilePath} is stale, removing it`);
            await this.releaseLock(lockFilePath);
            continue;
          }

          await this.waitForLockRelease(lockFilePath, checkInterval);
          continue;
        }

        await this.releaseLock(lockFilePath);
        throw error;
      }
    }

    throw new Error(`Timeout waiting for browser download lock for version ${majorVersion}`);
  }

  async createLockFile(lockFilePath, majorVersion) {
    const lockData = {
      majorVersion,
      timestamp: Date.now(),
      pid: process.pid,
    };

    await writeFile(lockFilePath, JSON.stringify(lockData), { flag: 'wx' });
  }

  async releaseLock(lockFilePath) {
    try {
      await unlink(lockFilePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Failed to release download lock:', error.message);
      }
    }
  }

  async waitForLockRelease(lockFilePath, checkInterval) {
    return new Promise((resolve) => {
      const checkLock = async () => {
        try {
          await access(lockFilePath);
          setTimeout(checkLock, checkInterval);
        } catch (error) {
          if (error.code === 'ENOENT') {
            resolve();
          } else {
            setTimeout(checkLock, checkInterval);
          }
        }
      };

      checkLock();
    });
  }

  async checkBrowserExists(majorVersion) {
    try {
      await access(join(BROWSER_PATH, `orbita-browser-${majorVersion}`));

      return true;
    } catch {
      return false;
    }
  }

  async isProcessRunning(pid) {
    return new Promise((resolve) => {
      const { platform } = process;
      let command;
      let args;

      if (platform === 'win32') {
        command = 'tasklist';
        args = ['/FI', `PID eq ${pid}`];
      } else {
        command = 'ps';
        args = ['-p', pid.toString()];
      }

      const child = spawn(command, args, { stdio: 'pipe' });

      child.on('error', () => resolve(false));
      child.on('close', (code) => {
        resolve(code === 0);
      });
    });
  }

  async checkLockValidity(lockFilePath) {
    try {
      const lockContent = await _promises.readFile(lockFilePath, 'utf8');
      const lockData = JSON.parse(lockContent);

      const lockAge = Date.now() - lockData.timestamp;
      const maxLockAge = 300000;

      if (lockAge > maxLockAge) {
        return false;
      }

      const isProcessAlive = await this.isProcessRunning(lockData.pid);

      return isProcessAlive;
    } catch (error) {
      return false;
    }
  }

  async cleanupStaleLocks() {
    try {
      const files = await _promises.readdir(BROWSER_PATH);
      const lockFiles = files.filter(file => file.startsWith(LOCK_FILE_PREFIX));

      for (const lockFile of lockFiles) {
        try {
          const lockFilePath = join(BROWSER_PATH, lockFile);
          const isValid = await this.checkLockValidity(lockFilePath);

          if (!isValid) {
            await unlink(lockFilePath);
            console.log(`Cleaned up stale lock file: ${lockFile}`);
          }
        } catch (error) {
          console.warn(`Failed to process lock file ${lockFile}:`, error.message);
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Failed to cleanup stale locks:', error.message);
      }
    }
  }
}

export default BrowserDownloadLockManager;
