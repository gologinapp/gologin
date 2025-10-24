import * as Sentry from '@sentry/node';

export const captureGroupedSentryError = (error, context = {}) => {
  if (process.env.DISABLE_TELEMETRY === 'true') {
    return;
  }

  const errorMessage = error?.message || 'Unknown error';
  let fingerprint = ['default'];
  let tags = { errorType: 'unknown' };

  switch (true) {
    case errorMessage.includes('Profile deleted or not found'):
      fingerprint = ['profile-not-found'];
      tags = { errorType: 'profile', category: 'configuration' };
      break;

    case errorMessage.includes('Request timeout after 13000ms'):
    case errorMessage.includes('Proxy Error'):
      fingerprint = ['proxy-error'];
      tags = { errorType: 'proxy', category: 'configuration' };
      break;

    case errorMessage.includes('ENOSPC'):
    case errorMessage.includes('database or disk is full'):
      fingerprint = ['out-of-space'];
      tags = { errorType: 'out-of-space', category: 'filesystem' };
      break;

    case errorMessage.includes('ECONNREFUSED 127.0.0.1:'):
      fingerprint = ['browser-not-found'];
      tags = { errorType: 'browser', category: 'configuration' };
      break;

    case errorMessage.includes('end of central directory record signature not found'):
    case errorMessage.includes('invalid code lengths set'):
    case errorMessage.includes('Command failed: tar xzf'):
      fingerprint = ['archive-error'];
      tags = { errorType: 'archive', category: 'binaries' };
      break;

    case errorMessage.includes('spawn UNKNOWN'):
      fingerprint = ['spawn-error'];
      tags = { errorType: 'spawn', category: 'runtime' };
      break;

    case errorMessage.includes('unable to verify the first certificate'):
    case errorMessage.includes('write EPROTO'):
      fingerprint = ['ssl-error'];
      tags = { errorType: 'ssl', category: 'network' };
      break;

    case errorMessage.includes('You have reached your free API requests limit'):
      fingerprint = ['api-limit-reached'];
      tags = { errorType: 'api', category: 'rate-limit' };
      break;

    default:
      fingerprint = ['uncategorized', errorMessage.substring(0, 50)];
      tags = { errorType: 'uncategorized', category: 'unknown' };
      break;
  }

  Sentry.withScope((scope) => {
    scope.setFingerprint(fingerprint);
    scope.setTags(tags);
    scope.setContext('errorDetails', {
      originalMessage: errorMessage,
      ...context,
    });
    Sentry.captureException(error);
  });
};
