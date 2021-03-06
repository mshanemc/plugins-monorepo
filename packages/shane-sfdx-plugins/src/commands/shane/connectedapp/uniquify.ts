import { flags, SfdxCommand } from '@salesforce/command';
import chalk from 'chalk';

import { writeJSONasXML } from '@mshanemc/plugin-helpers/dist/JSONXMLtools';
import * as fs from 'fs-extra';
import { getExisting } from '@mshanemc/plugin-helpers/dist/getExisting';

export default class ConnectedAppUniquify extends SfdxCommand {
    public static description = 'modify a clientId/consumerKey on a local connected app to guaranatee uniqueness';

    public static examples = [
        `sfdx shane:connectedapp:uniquify -a force-app/main/default/connectedApps/myConnectedApp.connectedApp-meta.xml -p 5h4n3
// update the consumerKey of myConnectedApp to be unique, but start with 5h4n3
`
    ];

    protected static flagsConfig = {
        prefix: flags.string({ char: 'p', required: true, description: "add a prefix to the connected app's consumerKey" }),
        app: flags.filepath({ char: 'a', required: true, description: 'full path to your connected app locally' })
    };

    protected static requiresProject = true;

    public async run(): Promise<any> {
        if (!(await fs.pathExists(this.flags.app))) {
            throw new Error(`file not found: ${this.flags.app}`);
        }
        const consumerKey = `${this.flags.prefix}x${new Date().getTime()}`;
        const existing = await getExisting(this.flags.app, 'ConnectedApp');
        existing.oauthConfig.consumerKey = consumerKey;

        await writeJSONasXML({
            type: 'ConnectedApp',
            path: this.flags.app,
            json: existing
        });

        this.ux.log(`${chalk.green('Connected app updated locally')}.  Consumer Key is now ${consumerKey}`);
    }
}
