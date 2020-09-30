import { flags, SfdxCommand } from '@salesforce/command';

import { QueryResult } from '@mshanemc/plugin-helpers/dist/typeDefs';
import { getExisting } from '@mshanemc/plugin-helpers/dist/getExisting';
import { writeJSONasXML } from '@mshanemc/plugin-helpers/dist/JSONXMLtools';

export default class CertUnHardCode extends SfdxCommand {
    public static description = 'modify local xml files with data from org to work around hardcoded metadata issues';

    protected static flagsConfig = {
        samlfile: flags.filepath({
            char: 'f',
            description: 'full path to the samlssoconfig file.  Will be modified by this process',
            required: true
        }),
        label: flags.string({ char: 'l', description: 'masterLabel of the cert whose Id you need', required: true }),
        verbose: flags.builtin()
    };

    protected static requiresProject = true;

    protected static requiresUsername = true;

    // tslint:disable-next-line: no-any
    public async run(): Promise<any> {
        // convert to json
        const parsed = await getExisting(this.flags.samlfile, 'SamlSsoConfig');

        if (this.flags.verbose && !this.flags.json) {
            this.ux.logJson(parsed);
        }
        const conn = this.org.getConnection();

        // query org using tooling api
        const queryResult = (await conn.tooling.query(`select id from Certificate where MasterLabel='${this.flags.label}'`)) as QueryResult;
        if (this.flags.verbose && !this.flags.json) {
            this.ux.logJson(queryResult);
        }

        await writeJSONasXML({
            path: this.flags.samlfile,
            json: {
                ...parsed,
                requestSigningCertId: queryResult.records[0].Id.substr(0, 15)
            },
            type: 'SamlSsoConfig'
        });
        this.ux.log(`changed requestSigningCertId in ${this.flags.samlfile} to ${queryResult.records[0].Id}`);
    }
}
