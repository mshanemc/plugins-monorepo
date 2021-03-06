/* eslint-disable no-await-in-loop */
import { flags, SfdxCommand } from '@salesforce/command';
import { retry } from '@lifeomic/attempt';
import { sleep } from '@salesforce/kit';
import cli from 'cli-ux';
import { createGzip } from 'zlib';

import * as fs from 'fs-extra';

const byteLimit = 10000000; // per the API docs https://developer.salesforce.com/docs/atlas.en-us.bi_dev_guide_ext_data.meta/bi_dev_guide_ext_data/bi_ext_data_object_externaldatapart.htm
const pollTimeSeconds = 10;
const tempFileName = 'gzippedUpload.csv.gz';

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
        }),
        uploadinterval: flags.integer({
            char: 'd',
            description: 'milliseconds between uploaded chunks...increase this if you get strange errors during file uploads like "write EPIPE"',
            default: 500,
            min: 0
        }),
        serial: flags.boolean({ description: 'chunks are uploaded with no parallelization to prevent locking issues' })
    };

    protected static requiresUsername = true;

    public async run(): Promise<any> {
        const conn = this.org.getConnection();
        this.ux.startSpinner('Creating the job');
        const createUploadResult = (await conn.request({
            method: 'POST',
            url: `${conn.baseUrl()}/sobjects/InsightsExternalData`,
            body: JSON.stringify(await this.getUploadBody())
        })) as any;
        this.ux.stopSpinner();

        this.ux.startSpinner('Compressing the file');
        await zip(this.flags.csvfile, tempFileName);
        this.ux.stopSpinner();

        let counter = 0;
        let completeCounter = 0;
        const progress = cli.progress({
            format: `Chunk and upload ${this.flags.csvfile}${
                this.flags.serial ? '(serial mode)' : ''
            }| {bar} | {value}/{total} Chunks | ETA: {eta_formatted} | Elapsed: {duration_formatted}`,
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591'
        });
        progress.start();

        const uploads = [];

        const stream = fs.createReadStream(tempFileName, {
            highWaterMark: byteLimit,
            encoding: 'base64'
        });
        // eslint-disable-next-line no-restricted-syntax
        for await (const chunk of stream) {
            await sleep(this.flags.uploadinterval);
            counter += 1;
            progress.setTotal(counter);
            const requestObject = {
                method: 'POST',
                url: `${conn.baseUrl()}/sobjects/InsightsExternalDataPart`,
                body: JSON.stringify({
                    DataFile: chunk,
                    InsightsExternalDataId: createUploadResult.id,
                    PartNumber: counter
                })
            };
            if (this.flags.serial) {
                await conn.request(requestObject);
                completeCounter += 1;
                progress.update(completeCounter);
            } else {
                uploads.push(
                    conn
                        .request(requestObject)
                        // eslint-disable-next-line no-loop-func
                        .then(() => {
                            completeCounter += 1;
                            progress.update(completeCounter);
                        })
                );
            }
        }
        // also clean up the compressed file while we're waiting
        uploads.push(fs.remove(tempFileName));

        await Promise.all(uploads).catch(error => {
            this.ux.error(error);
            throw new Error(error);
        });
        progress.stop();

        this.ux.startSpinner('Starting the data processing');
        const processRequestResult = await conn.request({
            method: 'PATCH',
            url: `${conn.baseUrl()}/sobjects/InsightsExternalData/${createUploadResult.id}`,
            body: JSON.stringify({
                Action: 'Process'
            })
        });

        if (this.flags.async) {
            await fs.remove('chunkFolder');
            this.ux.stopSpinner(`job started with id ${createUploadResult.id}.  Not waiting for it because you said --async`);
            return processRequestResult;
        }

        this.ux.setSpinnerStatus('Waiting for job to complete');
        const finalResult = await retry(
            async () => {
                const potentialResult = (await conn.request({
                    method: 'GET',
                    url: `${conn.baseUrl()}/sobjects/InsightsExternalData/${createUploadResult.id}`
                })) as any;
                this.ux.setSpinnerStatus(`Waiting for job to complete [Status = ${potentialResult.Status}]`);
                if (['Completed', 'CompletedWithWarnings', 'Failed'].includes(potentialResult.Status)) {
                    this.ux.setSpinnerStatus(`Waiting for job to complete [Status = ${potentialResult.Status}]`);
                    return potentialResult;
                }
                throw new Error('Still pending');
            },
            {
                maxAttempts: 300,
                delay: 1000 * pollTimeSeconds
            }
        );

        if (finalResult.Status === 'Failed') {
            throw new Error(`Job failed: ${finalResult.statusMessage}`);
        }

        if (finalResult.Status === 'CompletedWithWarnings') {
            this.ux.warn(`${finalResult.Status}: ${finalResult.statusMessage}`);
        }
        // clean up
        await fs.remove('chunkFolder');
        return finalResult;
    }

    private async getUploadBody(): Promise<any> {
        return {
            EdgemartLabel: this.flags.name,
            EdgemartAlias: this.flags.name,
            FileName: 'sfdxPluginUpload',
            Format: 'Csv',
            Operation: this.flags.operation,
            NotificationSent: 'Never',
            EdgemartContainer: this.flags.app,
            MetadataJson: this.flags.metajson ? await fs.readFile(this.flags.metajson, { encoding: 'base64' }) : undefined
        };
    }
}

const zip = (inputFile: string, outputFile: string) => {
    return new Promise((resolve, reject) => {
        const fileContents = fs.createReadStream(inputFile, { encoding: 'utf8' });
        const writeStream = fs.createWriteStream(outputFile, { encoding: 'base64' });
        fileContents
            .pipe(createGzip())
            .pipe(writeStream)
            .on('finish', err => {
                if (err) return reject(err);
                return resolve();
            });
    });
};
