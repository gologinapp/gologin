export type GoLoginOptions = {
  token?: string;
  profile_id?: string;
  password?: string;
  extra_params?: string[];
  executablePath?: string;
  vncPort?: number;
  tmpdir?: string;
  waitWebsocket?: boolean;
  isCloudHeadless?: boolean;
  skipOrbitaHashChecking?: boolean;
  uploadCookiesToServer?: boolean;
  writeCookiesFromServer?: boolean;
  remote_debugging_port?: number;
  timezone?: { timezone: string; country?: string; city?: string; ip?: string; ll?: [number, number]; accuracy?: number, stateProv?: string, languages?: string };
  args?: string[];
  restoreLastSession?: boolean;
  browserMajorVersion?: number;
  proxyCheckTimeout?: number;
  proxyCheckAttempts?: number;
  autoUpdateBrowser?: boolean;
  checkBrowserUpdate?: boolean;
  customChromeFrame?: boolean;
};

export type GoLoginStartResult = {
  status: 'success';
  wsUrl: string;
  resolution?: { width: number; height: number };
};

export { GologinApi, getDefaultParams, exitAll } from './api.d.ts';

export declare class GoLogin {
  constructor(options?: GoLoginOptions);
  start(): Promise<GoLoginStartResult>;
  stop(): Promise<void>;
  startLocal(): Promise<{ status: string, wsUrl: string }>;
  stopLocal(options?: { posting?: boolean }): Promise<void>;
  setProfileId(profile_id: string): Promise<void>;
  getProfile(profile_id?: string): Promise<Record<string, unknown>>;
  quickCreateProfile(name?: string): Promise<{ id: string }>;
  profilePath(): string;
  commitProfile(): Promise<void>;
}

export default GoLogin;
