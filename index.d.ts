type LaunchFn = async (params?: LaunchParams) => Promise<Browser>;

type GologinApiType = {
  launch: LaunchFn

};

type GologinApiParams = {
  token?: string,
}

export declare function GologinApi(params: GologinApiParams): GologinApiType;

export declare function GologinApi(params: GologinApiParams): GologinApiType;
