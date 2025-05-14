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

  /**
   * Format: 'dataCenter:DE'
   */
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
    /**
     * default delay, 250
     */
    defaultDelay: number;

    /**
     * Operating system
     */
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

type GologinApiType = {
  launch: (params?: LaunchParams) => Promise<{ browser: Browser }>;
  exit: (status = 0) => Promise<void>;
  createCustom: (params: CreateCustomBrowserValidation) => Promise<string>;
  updateProfileFingerprint: (profileId: string[]) => Promise<void>;
  updateUserAgentToLatestBrowser: (profileIds: string[], workspaceId?: string) => Promise<void>;
  updateProfileProxy: (profileId: string, proxyData: BrowserProxyCreateValidation) => Promise<void>;
  addCookiesToProfile: (profileId: string, cookies: Cookie[]) => Promise<void>;
};

type GologinApiParams = {
  token: string;
};

export declare function GologinApi(params: GologinApiParams): GologinApiType;
export declare function exitAll(): Promise<void>;
