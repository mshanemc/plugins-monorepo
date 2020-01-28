import { exec, exec2JSON, exec2String } from '../../../../src/shared/execProm';

import fs = require('fs-extra');
import testutils = require('../../../helpers/testutils');

const testProjectName = 'testProjectOrgCreate';

describe('shane:org:create', () => {
    jest.setTimeout(testutils.remoteTimeout * 4); // reauth can really slow things down

    beforeAll(async () => {
        await fs.remove(testProjectName);
        await exec(`sfdx force:project:create -n ${testProjectName}`);
        // console.log('beforeAll done');
    });

    afterEach(async () => {
        await exec('sfdx shane:org:delete', { cwd: testProjectName });
        // console.log('deleted an org');
    });

    it('creates a org with file, not json', async () => {
        const response = await exec2String('sfdx shane:org:create --userprefix shanetest -o jest.test -d 1 -s -f config/project-scratch-def.json', {
            cwd: testProjectName
        });
        expect(response).toContain('Org created with id');
    });

    it('creates a org with file, json', async () => {
        const results = await exec2JSON(
            'sfdx shane:org:create --userprefix shanetest -o jest.test -d 1 -s -f config/project-scratch-def.json --json',
            { cwd: testProjectName }
        );
        expect(results).toEqual(expect.objectContaining({ status: 0 }));
    });

    afterAll(async () => {
        await fs.remove(testProjectName);
    });
});
