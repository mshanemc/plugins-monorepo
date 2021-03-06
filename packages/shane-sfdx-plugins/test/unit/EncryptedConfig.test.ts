import * as fs from 'fs-extra';
import { exec } from '@mshanemc/plugin-helpers/dist/execProm';

import { convertEmailToFilename, ShaneAIConfig } from '../../src/shared/ai/aiConstants';

const testProjectName = 'testProjectEncryptedConfig';

describe('test encryptedConfigAccessHelper', () => {
    beforeAll(async () => {
        await fs.remove(testProjectName);
        await exec(`sfdx force:project:create -n ${testProjectName}`);
    });

    it('creates a config file with retrievable property (roundtrip)', async () => {
        const token = 'abcdefg12345';
        const config = await ShaneAIConfig.create({ filename: convertEmailToFilename('unit.whatever@test.com'), rootFolder: testProjectName });
        expect(await config.exists()).toBe(false);
        await config.setToken({ access_token: token, token_type: 'test', expires_in: 2000 });
        expect(await config.exists()).toBe(true);
        expect(await config.getToken()).toBe(token);
    });

    it('reads from an existing config file with retrievable property (roundtrip)', async () => {
        const token = 'abcdefg12345';
        const config2 = await ShaneAIConfig.create({ filename: convertEmailToFilename('unit.whatever@test.com'), rootFolder: testProjectName });
        expect(await config2.exists()).toBe(true);
        expect(await config2.getToken()).toBe(token);
    });

    it('handles various email/service structures', () => {
        expect(convertEmailToFilename('unit.whatever@test.com').includes('@')).toBe(false);
        expect(
            convertEmailToFilename('unit.whatever@test.com')
                .replace('.json', '')
                .includes('.')
        ).toBe(false);

        const serviceResult = convertEmailToFilename('unit.whatever@test.com', 'aitest');
        expect(serviceResult.includes('@')).toBe(false);
        expect(serviceResult.replace('.json', '').includes('.')).toBe(false);
        expect(serviceResult.startsWith('aitest-')).toBe(true);
    });

    afterAll(async () => {
        await fs.remove(testProjectName);
    });
});
