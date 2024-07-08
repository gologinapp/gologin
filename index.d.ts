import { type Browser } from 'puppeteer-core/lib/Browser';

export const OSES = {
  win: 'win',
  lin: 'lin',
  mac: 'mac',
  android: 'android',
} as const;
export type OsType = (typeof OSES)[keyof typeof OSES];

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
  profile_id: string;
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

type LaunchFn = (params?: LaunchParams) => Promise<Browser>;

type GologinApiType = {
  launch: LaunchFn;
  exit: (status = 0) => Promise<void>;
  delay: (ms: number) => Promise<void>;
};

type GologinApiParams = {
  token: string;
};

export declare function GologinApi(params: GologinApiParams): GologinApiType;
