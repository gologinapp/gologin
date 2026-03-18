import { Browser } from 'puppeteer-core/lib/Browser';

import { CreateCustomBrowserValidation, BrowserProxyCreateValidation } from './types/profile-params';

export declare const OPERATING_SYSTEMS: {
  readonly win: 'win';
  readonly lin: 'lin';
  readonly mac: 'mac';
  readonly android: 'android';
};
export type OsType = (typeof OPERATING_SYSTEMS)[keyof typeof OPERATING_SYSTEMS];

type CloudLaunchParams = {
  cloud: true;
  geolocation?: string;
};
type LocalLaunchParams = {
  cloud: false;
  headless: boolean;
};

type ExistingProfileLaunchParams = {
  profileId: string;
};
type NewProfileLaunchParams = {
  proxyGeolocation: string;
};

type LaunchParams =
  | CloudLaunchParams
  | LocalLaunchParams
  | ExistingProfileLaunchParams
  | NewProfileLaunchParams
  | {
    defaultDelay: number;
    os: OsType;
  };

type Cookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expirationDate?: number;
  creationDate?: number;
  hostOnly?: boolean;
  httpOnly?: boolean;
  sameSite?: 'no_restriction' | 'lax' | 'strict';
  secure?: boolean;
  session?: boolean;
  url?: string;
};

type TrafficData = {
  trafficUsedBytes: number;
  trafficLimitBytes: number;
};

type AvailableTrafficData = {
  mobileTrafficData: TrafficData;
  residentialTrafficData: TrafficData;
  dataCenterTrafficData: TrafficData;
};

type ProxyType = 'mobile' | 'resident' | 'dataCenter';

type ProxyResponse = {
  trafficLimitBytes: number;
  trafficUsedBytes: number;
};

type ProfileResponse = {
  id: string;
};

type GologinApiType = {
  launch: (params?: LaunchParams) => Promise<{ browser: Browser }>;
  createProfileWithCustomParams: (options: CreateCustomBrowserValidation) => Promise<string>;
  refreshProfilesFingerprint: (profileIds: string[]) => Promise<any>;
  createProfileRandomFingerprint: (name?: string) => Promise<ProfileResponse>;
  updateUserAgentToLatestBrowser: (profileIds: string[], workspaceId?: string) => Promise<any>;
  changeProfileProxy: (profileId: string, proxyData: BrowserProxyCreateValidation) => Promise<number>;
  getAvailableType: (availableTrafficData: AvailableTrafficData) => ProxyType | 'none';
  addGologinProxyToProfile: (profileId: string, countryCode: string, proxyType?: ProxyType | '') => Promise<ProxyResponse>;
  addCookiesToProfile: (profileId: string, cookies: Cookie[]) => Promise<number>;
  deleteProfile: (profileId: string) => Promise<number>;
  exit: () => Promise<void>;
  createCustom: (params: CreateCustomBrowserValidation) => Promise<string>;
  updateProfileFingerprint: (profileId: string[]) => Promise<void>;
  updateProfileProxy: (profileId: string, proxyData: BrowserProxyCreateValidation) => Promise<void>;
};

type GologinApiParams = {
  token: string;
};

/** Options for the GoLogin class constructor (advanced usage, custom wrappers). */
export type GoLoginOptions = {
  token?: string;
  profile_id?: string;
  password?: string;
  extra_params?: Record<string, unknown>;
  executablePath?: string;
  vncPort?: number;
  tmpdir?: string;
  waitWebsocket?: boolean;
  isCloudHeadless?: boolean;
  skipOrbitaHashChecking?: boolean;
  uploadCookiesToServer?: boolean;
  writeCookiesFromServer?: boolean;
  remote_debugging_port?: number;
  timezone?: string;
  args?: string[];
  restoreLastSession?: boolean;
  browserMajorVersion?: number;
  proxyCheckTimeout?: number;
  proxyCheckAttempts?: number;
  autoUpdateBrowser?: boolean;
  checkBrowserUpdate?: boolean;
};

/** Return type of GoLogin#start() — use wsUrl to connect with Puppeteer. */
export type GoLoginStartResult = {
  status: 'success';
  wsUrl: string;
  resolution?: { width: number; height: number };
};

/**
 * GoLogin class for advanced usage and custom wrappers.
 * Use when you need direct control over the browser lifecycle (e.g. custom launchLocal,
 * multiple instances, or access to wsUrl from start() for Puppeteer).
 *
 * @example
 * import { GoLogin } from 'gologin';
 * const gologin = new GoLogin({ token: 'YOUR_TOKEN', profile_id: 'PROFILE_ID' });
 * const { wsUrl } = await gologin.start();
 * // connect with puppeteer.connect({ browserWSEndpoint: wsUrl })
 * await gologin.stop();
 */
export declare class GoLogin {
  constructor(options?: GoLoginOptions);
  start(): Promise<GoLoginStartResult>;
  stop(): Promise<void>;
  startLocal(): Promise<void>;
  stopLocal(options?: { posting?: boolean }): Promise<void>;
  setProfileId(profile_id: string): Promise<void>;
  getProfile(profile_id?: string): Promise<Record<string, unknown>>;
  quickCreateProfile(name?: string): Promise<{ id: string }>;
  profilePath(): string;
  commitProfile(): Promise<void>;
}

export declare function getDefaultParams(): {
  token: string | undefined;
  profile_id: string | undefined;
  executablePath: string | undefined;
};

export declare function GologinApi(params: GologinApiParams): GologinApiType;

export declare function exitAll(): Promise<void>;
