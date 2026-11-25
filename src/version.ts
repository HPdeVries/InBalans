declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILT_AT__: string;

/** Short commit hash of the deployed build (GitHub), e.g. "7daf30b". */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const APP_COMMIT: string = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'dev';
export const APP_BUILT_AT: string = typeof __APP_BUILT_AT__ === 'string' ? __APP_BUILT_AT__ : '';

export const versionTitle = (): string =>
  `Commit ${APP_COMMIT}${APP_BUILT_AT ? `, gebouwd ${new Date(APP_BUILT_AT).toLocaleString('nl-NL')}` : ''}`;
