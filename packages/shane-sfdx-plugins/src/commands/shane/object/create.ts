import { flags } from '@oclif/command';
import { join } from 'path';
import { SfdxCommand, core } from '@salesforce/command';
import fs = require('fs-extra');
import jsToXml = require('js2xmlparser');

import cli from 'cli-ux'

const options = require('../../../shared/js2xmlStandardOptions');

const chalk = require('chalk');

export default class ObjectCreate extends SfdxCommand {

	public static description = 'create an object in local source.  Only __b (big objects) are currently supported';

	public static examples = [
`sfdx shane:object:create
// without any params, the cli is going to ask you questions to generate your object interactively
`,
`sfdx shane:object:create --label "Platypus" --plural "Platypi" --api Platypus__b --directory /my/project/path
// label, plural, api name specified so the tool doesn't have to ask you about them.  Creates in a non-default path
`
	];

	protected static flagsConfig = {
		label: flags.string({ char: 'l', description: 'label for the UI' }),
		api: flags.string({ char: 'a', description: 'api name.  Ends with one of the supported types: [__b]' }),
		plural: flags.string({ char: 'p', description: 'plural label for the UI' }),
		// description: flags.string({ char: 'd', default: 'added from sfdx plugin', description: 'optional description so you can remember why you added this and what it\'s for' }),
		directory: flags.string({ char: 'd', default: 'force-app/main/default', description: 'where to create the folder (if it doesn\'t exist already) and file...defaults to force-app/main/default' })
	};

	// Set this to true if your command requires a project workspace; 'requiresProject' is false by default
	protected static requiresProject = true;

	public async run(): Promise<any> { // tslint:disable-line:no-any

		interface objectConfig {
			"@" : {};
			deploymentStatus: string;
			label: string;
			pluralLabel: string;
			indexes?: {};
		}

		const outputJSON = <objectConfig>{
			'@': {
				xmlns: 'http://soap.sforce.com/2006/04/metadata'
			},
			deploymentStatus: 'Deployed',
			label : '',
			pluralLabel: '',
		};

		// remove trailing slash if someone entered it
		if (this.flags.directory.endsWith('/')) {
			this.flags.directory = this.flags.directory.substring(0, this.flags.directory.length - 1);
		}

		if (!this.flags.label) {
			this.flags.label = await cli.prompt('Label for the object?');
		}

		if (!this.flags.plural) {
			this.flags.plural = await cli.prompt(`Plural label for the object?`);
		}

		if (!this.flags.api) {
			this.flags.api = await cli.prompt(`API name?`);
		}

		//validate that API name
		if (!this.flags.api.endsWith('__b')){
			this.ux.error('API names need to end with one of the supported options:  __b');
			return;
		}

		if (this.flags.api.endsWith('__b')){
			outputJSON.indexes = {
				fullName : `${this.flags.api.replace('__b', '')}Index`,
				label: `${this.flags.label} Index`,
				fields : []
			}
		}

		outputJSON.label = this.flags.label;
		outputJSON.pluralLabel = this.flags.plural;

		const objectsPath = `${this.flags.directory}/objects`;
		const thisObjectFolder = `${this.flags.directory}/objects/${this.flags.api}`;
		const metaFileLocation = `${this.flags.directory}/objects/${this.flags.api}/${this.flags.api}.object-meta.xml`

		if (!fs.existsSync(objectsPath)) {
			fs.mkdirSync(objectsPath);
		}

		if (!fs.existsSync(thisObjectFolder)) {
			fs.mkdirSync(thisObjectFolder);
		} else {
			this.ux.error(`Object already exists: ${thisObjectFolder}`);
			return;
		}

		if (!fs.existsSync(`${objectsPath}/${this.flags.api}/fields`)) {
			fs.mkdirSync(`${objectsPath}/${this.flags.api}/fields`);
		}

		const xml = jsToXml.parse('CustomObject', outputJSON, options);

		fs.writeFileSync(metaFileLocation, xml);

		this.ux.log(chalk.green(`Created ${thisObjectFolder}.  Add fields with TBD command`));
	}
}
