export type OS = 'lin' | 'mac' | 'win' | 'android';
export type T_OS_SPEC = 'M1' | 'M2' | 'M3' | 'M3' | 'win11' | '';

export type IBookmarkFoldersObj = {
  [key: string]: {
    name: string;
    children: Array<{
      name: string;
      url: string;
    }>;
  };
}

export type NavigatorModel = {
  userAgent: string;
  resolution: string;
  language: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  maxTouchPoints?: number;
}

export type TimezoneModel = {
  enabled: boolean;
  fillBasedOnIp: boolean;
  timezone: string;
}

export type GeolocationModel = {
  mode: 'prompt' | 'block' | 'allow';
  enabled: boolean;
  customize: boolean;
  fillBasedOnIp: boolean;
  latitude: number;
  longitude: number;
  accuracy: number;
}

export type AudioContextModel = {
  enable: boolean;
  noiseValue: number;
}

export type CanvasModel = {
  mode: 'off' | 'noise';
  noise?: number;
}

export type FontsModel = {
  enableMasking: boolean;
  enableDOMRect: boolean;
  families: string[];
}

export type MediaDevicesModel = {
  enableMasking: boolean;
  videoInputs: number;
  audioInputs: number;
  audioOutputs: number;
}

export type WebRTCModel = {
  mode: 'real' | 'public';
  enabled: boolean;
  customize: boolean;
  localIpMasking: boolean;
  fillBasedOnIp: boolean;
  publicIp: string;
  localIps: string[];
}

export type WebGlModel = {
  mode: 'off' | 'noise';
  getClientRectsNoise: number;
  noise?: number;
}

export type ClientRectsModel = {
  mode: 'off' | 'noise';
  noise: number;
}

export type WebGlMetadataModel {
  mode: 'off' | 'mask';
  vendor: string;
  renderer: string;
}

export type BrowserProxyCreateValidation {
  mode: 'http' | 'https' | 'socks4' | 'socks5' | 'geolocation' | 'none' | 'tor' | 'gologin';
  host: string;
  port: number;
  username?: string;
  password?: string;
  changeIpUrl?: string;
  autoProxyRegion?: string;
  torProxyRegion?: string;
}

export declare class CreateCustomBrowserValidation {
  name?: string;
  notes?: string;
  autoLang?: boolean;
  lockEnabled?: boolean;
  folderName?: string;
  bookmarks?: IBookmarkFoldersObj;
  os: OS;
  osSpec?: T_OS_SPEC;
  devicePixelRatio?: number;
  navigator?: NavigatorModel;
  proxy?: BrowserProxyCreateValidation;
  dns?: string;
  timezone?: TimezoneModel;
  geolocation?: GeolocationModel;
  audioContext?: AudioContextModel;
  canvas?: CanvasModel;
  fonts?: FontsModel;
  mediaDevices?: MediaDevicesModel;
  webRTC?: WebRTCModel;
  webGL?: WebGlModel;
  clientRects?: ClientRectsModel;
  webGLMetadata?: WebGlMetadataModel;
  chromeExtensions?: string[];
  userChromeExtensions?: string[];
  folders?: string[];
}