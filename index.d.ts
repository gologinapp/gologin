import { Browser } from 'puppeteer-core/lib/Browser';

import { CreateCustomBrowserValidation, BrowserProxyCreateValidation } from './types/profile-params';

export const OPERATING_SYSTEMS = {
  win: 'win',
  lin: 'lin',
  mac: 'mac',
  android: 'android',
} as const;
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

export declare function getDefaultParams(): {
  token: string | undefined;
  profile_id: string | undefined;
  executablePath: string | undefined;
};

export declare function GologinApi(params: GologinApiParams): GologinApiType;

export declare function exitAll(): Promise<void>;
