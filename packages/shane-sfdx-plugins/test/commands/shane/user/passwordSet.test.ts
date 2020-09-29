import { exec, exec2JSON } from '../../../../src/shared/execProm';

import fs = require('fs-extra');
import testutils = require('../../../helpers/testutils');

const testProjectName = 'testProjectUserPasswordSet';
const maxBuffer = 1000 * 1024;

const password = 'thePassw0rd';
const expectedMatch = {
    status: 0,
    result: {
        password
    }
};

describe('shane:user:password:set', () => {
    jest.setTimeout(testutils.remoteTimeout);

    if (!process.env.LOCALONLY) {
        beforeAll(async () => {
            await fs.remove(testProjectName);
            await exec(`sfdx force:project:create -n ${testProjectName}`);
            await testutils.orgCreate(testProjectName);
        });

        it('sets the password and verifies via force:org:display', async () => {
            const setResult = await exec2JSON(`sfdx shane:user:password:set -l User -g User -p ${password} --json`, {
                cwd: testProjectName,
                maxBuffer
            });
            expect(setResult).toMatchObject(expectedMatch);

            const displayResult = await exec2JSON('sfdx force:org:display --json', { cwd: testProjectName, maxBuffer });
            expect(displayResult).toMatchObject(expectedMatch);
        });

        afterAll(async () => {
            await testutils.orgDelete(testProjectName);
            await fs.remove(testProjectName);
        });
    }
});
