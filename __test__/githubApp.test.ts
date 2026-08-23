import { generateKeyPairSync, createVerify } from 'crypto';
import { createGitHubAppJwt, getGitHubApiToken } from '../src/githubApp';

const decodeBase64UrlJson = (value: string): Record<string, unknown> =>
    JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;

test('creates a correctly signed GitHub App JWT', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const nowMs = Date.UTC(2026, 7, 23, 12, 0, 0);
    const jwt = createGitHubAppJwt('Iv1.test-client-id', privateKey, nowMs);
    const [header, payload, signature] = jwt.split('.');
    const verifier = createVerify('RSA-SHA256');

    verifier.update(`${header}.${payload}`);
    verifier.end();

    expect(decodeBase64UrlJson(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decodeBase64UrlJson(payload)).toEqual({
        iat: Math.floor(nowMs / 1000) - 60,
        exp: Math.floor(nowMs / 1000) + 9 * 60,
        iss: 'Iv1.test-client-id',
    });
    expect(verifier.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
});

test('requires GitHub App credentials instead of falling back to a legacy PAT', async () => {
    const environmentKeys = [
        'GITHUB_APP_CLIENT_ID',
        'GITHUB_APP_INSTALLATION_ID',
        'GITHUB_APP_PRIVATE_KEY',
        'TOKEN',
    ] as const;
    const previousEnvironment = Object.fromEntries(
        environmentKeys.map((key) => [key, process.env[key]]),
    );

    try {
        delete process.env.GITHUB_APP_CLIENT_ID;
        delete process.env.GITHUB_APP_INSTALLATION_ID;
        delete process.env.GITHUB_APP_PRIVATE_KEY;
        process.env.TOKEN = 'legacy-token-must-not-be-used';

        await expect(getGitHubApiToken()).rejects.toThrow(
            'GitHub App authentication is not configured.',
        );
    } finally {
        for (const key of environmentKeys) {
            const previousValue = previousEnvironment[key];
            if (previousValue === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = previousValue;
            }
        }
    }
});
