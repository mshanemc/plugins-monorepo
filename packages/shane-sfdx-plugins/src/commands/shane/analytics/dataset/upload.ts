import { flags, SfdxCommand } from '@salesforce/command';
import { sleep } from '@salesforce/kit';
import csvSplitStream = require('csv-split-stream');
import fs = require('fs-extra');
import * as readline from 'readline';

// import stream = require('stream');
// import util = require('util');

export default class DatasetDownload extends SfdxCommand {
    public static description = 'upload a dataset from csv';

    public static examples = [
        'sfdx shane:analytics:dataset:upload -n someName -f data/myFile.csv -m myMetaFile.json',
        'sfdx shane:analytics:dataset:upload -n someName -f data/myFile.csv -m myMetaFile.json -a SharedApp  --async'
    ];

    protected static flagsConfig = {
        name: flags.string({ char: 'n', description: 'dataset name--no spaces, should be like an api name', required: true }),
        csvfile: flags.filepath({ char: 'f', description: 'local csv file containing the data', required: true }),
        app: flags.string({ char: 'a', description: 'app name' }),
        metajson: flags.filepath({ char: 'm', description: 'path to json file for describing your upload (highly recommended)' }),
        operation: flags.string({
            char: 'o',
            description:
                'what to do with the dataset if it already exists.  See https://developer.salesforce.com/docs/atlas.en-us.bi_dev_guide_ext_data.meta/bi_dev_guide_ext_data/bi_ext_data_object_externaldata.htm',
            options: ['Append', 'Overwrite', 'Upsert', 'Delete'],
            default: 'Overwrite'
        }),
        async: flags.boolean({
            description:
                'do not wait for successful completion of the dataset upload...just return and hope for the best.  If omitted, will poll the analytics rest API for job processing status until complete'
        })
    };

    protected static requiresUsername = true;

    // tslint:disable-next-line:no-any
    public async run(): Promise<any> {
        const tmpFolder = 'chunkFolder';

        const conn = this.org.getConnection();
        // tslint:disable-next-line:no-any
        const body: any = {
            EdgemartLabel: this.flags.name,
            EdgemartAlias: this.flags.name,
            FileName: 'sfdxPluginUpload',
            Format: 'Csv',
            Operation: this.flags.operation,
            NotificationSent: 'Never'
        };

        if (this.flags.metajson) {
            body.MetadataJson = await fs.readFile(this.flags.metajson, { encoding: 'base64' });
        }

        if (this.flags.app) {
            body.EdgemartContainer = this.flags.app;
        }

        // tslint:disable-next-line:no-any
        const createUploadResult = <any>await conn.request({
            method: 'POST',
            url: `${conn.baseUrl()}/sobjects/InsightsExternalData`,
            body: JSON.stringify(body)
        });

        // this.ux.logJson(createUploadResult);

        // chunking
        const { size } = await fs.stat(this.flags.csvfile);
        const rowCount = <number>await countRows(this.flags.csvfile);
        const chunks = Math.ceil(size / 800000);
        const chunkRows = Math.ceil(rowCount / chunks);
        this.ux.log(`file size is ${size} bytes, ${rowCount} rows, so ${chunks} chunks of ~${chunkRows} rows`);

        await fs.ensureDir(tmpFolder);
        await csvSplitStream.split(fs.createReadStream(this.flags.csvfile), { lineLimit: chunkRows }, index =>
            fs.createWriteStream(`${tmpFolder}/file-${index}.csv`)
        );

        // then add the data
        const files = await fs.readdir(tmpFolder);

        await Promise.all(
            files.map(async (file, index) => {
                // tslint:disable-next-line:no-any
                const result = <any>await conn.request({
                    method: 'POST',
                    url: `${conn.baseUrl()}/sobjects/InsightsExternalDataPart`,
                    body: JSON.stringify({
                        DataFile: await fs.readFile(`${tmpFolder}/${file}`, { encoding: 'base64' }),
                        InsightsExternalDataId: createUploadResult.id,
                        PartNumber: index + 1
                    })
                });
                if (result.success) {
                    this.ux.log(`file ${file} succeeded with id ${result.id}`);
                }
            })
        );

        // then start the job by changing its status
        const processRequestResult = await conn.request({
            method: 'PATCH',
            url: `${conn.baseUrl()}/sobjects/InsightsExternalData/${createUploadResult.id}`,
            body: JSON.stringify({
                Action: 'Process'
            })
        });

        if (this.flags.async) {
            await fs.remove('chunkFolder');
            this.ux.log(`job started with id ${createUploadResult.id}`);
            return processRequestResult;
        }

        // ping for completion
        let complete = false;
        this.ux.startSpinner('Starting the data processing');
        let finalResult;

        while (!complete) {
            await sleep(1000);
            // tslint:disable-next-line:no-any
            const statusCheck = <any>await conn.request({
                method: 'GET',
                url: `${conn.baseUrl()}/sobjects/InsightsExternalData/${createUploadResult.id}`
            });
            if (['Completed', 'CompletedWithWarnings', 'Failed'].includes(statusCheck.Status)) {
                complete = true;
                this.ux.stopSpinner('Done!');
                finalResult = statusCheck;
            }
        }

        // clean up
        await fs.remove('chunkFolder');
        return finalResult;
    }
}

const countRows = csv => {
    return new Promise((resolve, reject) => {
        let rowCount = 0;
        const lineReader = readline.createInterface({
            input: fs.createReadStream(csv)
        });

        lineReader
            .on('line', () => {
                rowCount++;
            })
            .on('close', () => {
                resolve(rowCount);
            });
    });
};
