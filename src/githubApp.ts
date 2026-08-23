import axios from 'axios';
import { createSign } from 'crypto';

interface GitHubAppCredentials {
    clientId: string;
    installationId: string;
    privateKey: string;
}

interface InstallationAccessTokenResponse {
    token: string;
    expires_at: string;
}

interface CachedInstallationToken {
    token: string;
    expiresAt: number;
}

const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const GITHUB_API_VERSION = '2026-03-10';

let cachedInstallationToken: CachedInstallationToken | null = null;
let installationTokenRequest: Promise<string> | null = null;

const toBase64Url = (value: string | Buffer): string =>
    Buffer.from(value)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

const readGitHubAppCredentials = (): GitHubAppCredentials | null => {
    const clientId = process.env.GITHUB_APP_CLIENT_ID;
    const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    const configuredValues = [clientId, installationId, privateKey];

    if (configuredValues.every(Boolean)) {
        return {
            clientId: clientId as string,
            installationId: installationId as string,
            privateKey: (privateKey as string).replace(/\\n/g, '\n'),
        };
    }

    if (configuredValues.some(Boolean)) {
        throw new Error(
            'GitHub App authentication is incomplete. Configure GITHUB_APP_CLIENT_ID, ' +
                'GITHUB_APP_INSTALLATION_ID, and GITHUB_APP_PRIVATE_KEY together.',
        );
    }

    return null;
};

export const createGitHubAppJwt = (
    clientId: string,
    privateKey: string,
    nowMs: number = Date.now(),
): string => {
    const nowSeconds = Math.floor(nowMs / 1000);
    const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = toBase64Url(
        JSON.stringify({
            iat: nowSeconds - 60,
            exp: nowSeconds + 9 * 60,
            iss: clientId,
        }),
    );
    const unsignedToken = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');

    signer.update(unsignedToken);
    signer.end();

    return `${unsignedToken}.${toBase64Url(signer.sign(privateKey))}`;
};

const requestInstallationToken = async (credentials: GitHubAppCredentials): Promise<string> => {
    const appJwt = createGitHubAppJwt(credentials.clientId, credentials.privateKey);
    const response = await axios.post<InstallationAccessTokenResponse>(
        `https://api.github.com/app/installations/${encodeURIComponent(
            credentials.installationId,
        )}/access_tokens`,
        {},
        {
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${appJwt}`,
                'User-Agent': 'ZedingZhang-github-activity-graph',
                'X-GitHub-Api-Version': GITHUB_API_VERSION,
            },
        },
    );
    const expiresAt = Date.parse(response.data.expires_at);

    if (!response.data.token || Number.isNaN(expiresAt)) {
        throw new Error('GitHub returned an invalid installation access token response.');
    }

    cachedInstallationToken = {
        token: response.data.token,
        expiresAt,
    };

    return response.data.token;
};

const getInstallationToken = async (credentials: GitHubAppCredentials): Promise<string> => {
    if (
        cachedInstallationToken &&
        cachedInstallationToken.expiresAt - Date.now() > TOKEN_REFRESH_WINDOW_MS
    ) {
        return cachedInstallationToken.token;
    }

    if (!installationTokenRequest) {
        installationTokenRequest = requestInstallationToken(credentials).finally(() => {
            installationTokenRequest = null;
        });
    }

    return installationTokenRequest;
};

export const getGitHubApiToken = async (): Promise<string> => {
    const credentials = readGitHubAppCredentials();
    if (!credentials) {
        throw new Error('GitHub App authentication is not configured.');
    }

    return getInstallationToken(credentials);
};
