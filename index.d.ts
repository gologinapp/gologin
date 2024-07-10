import { type Browser } from 'puppeteer-core/lib/Browser';

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

type LaunchFn = (params?: LaunchParams) => Promise<{ browser: Browser }>;

type GologinApiType = {
  launch: LaunchFn;
  exit: (status = 0) => Promise<void>;
  delay: (ms: number) => Promise<void>;
};

type GologinApiParams = {
  token: string;
};

export declare function GologinApi(params: GologinApiParams): GologinApiType;
