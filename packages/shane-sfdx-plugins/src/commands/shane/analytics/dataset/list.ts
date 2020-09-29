import { SfdxCommand } from '@salesforce/command';
import { WaveDataSetListResponse } from '../../../../shared/typeDefs';

export default class DatasetList extends SfdxCommand {
    public static description = 'what analytics datasets are in my org?';

    public static examples = ['sfdx shane:analytics:dataset:list'];

    protected static flagsConfig = {};

    protected static requiresUsername = true;

    public async run(): Promise<any> {
        // this.org is guaranteed because requiresUsername=true, as opposed to supportsUsername
        const conn = this.org.getConnection();
        const url = `${conn.baseUrl()}/wave/datasets`;

        const results = ((await conn.request({
            method: 'GET',
            url
        })) as unknown) as WaveDataSetListResponse;

        this.ux.table(results.datasets, ['name', 'id', 'createdBy.name', 'datasetType', 'currentVersionId']);

        return results.datasets;
    }
}
