import { flags, SfdxCommand } from '@salesforce/command';
import { QueryResult } from '../../../../shared/typeDefs';

import userIdLookup = require('../../../../shared/userIdLookup');

export default class UserLightningDebug extends SfdxCommand {
    public static description = 'set the user to debug mode';

    public static examples = [
        `sfdx shane:user:lightning:debug
    // puts the default user in lightning debug mode
    `,
        `sfdx shane:user:lightning:debug -g Sarah -l McLaughlin
    // puts the named user in lightning debug mode
    `
    ];

    protected static flagsConfig = {
        firstname: flags.string({ char: 'g', description: 'first (given) name of the user--keeping -f for file for consistency' }),
        lastname: flags.string({ char: 'l', description: 'last name of the user' })
    };

    protected static requiresUsername = true;

    public async run(): Promise<any> {
        // this.org is guaranteed because requiresUsername=true, as opposed to supportsUsername
        const conn = this.org.getConnection();
        let userId;

        if (this.flags.lastname && this.flags.firstname) {
            const user = await userIdLookup.getUserId(conn, this.flags.lastname, this.flags.firstname);
            userId = user.Id;
        } else {
            const users = (await conn.query(`select id from user where username = '${this.org.getUsername()}'`)) as QueryResult;
            userId = users.records[0].Id;
        }
        const updateResult = await conn.sobject('User').update({
            Id: userId,
            UserPreferencesUserDebugModePref: true
        });

        this.ux.log(`added lightning debug mode on user ${userId}`);
        return updateResult;
    }
}
