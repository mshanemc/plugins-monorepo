import { Connection } from '@salesforce/core';
import * as request from 'request-promise-native';

import { file2CV } from '@mshanemc/plugin-helpers/dist/localFile2CV';

const savePhotoForUserOrGroup = async ({ conn, userOrGroupId, filePath, isBanner, isGroup }: PhotoSaveInput) => {
    const options = {
        method: 'POST',
        json: true,
        headers: {
            Authorization: `Bearer ${conn.accessToken}`
        }
    };
    // save the CV
    const photoCV = await file2CV(conn, filePath);

    const savePhotResult = await request({
        ...options,
        uri: `${conn.instanceUrl}/services/data/v${conn.getApiVersion()}/${isGroup ? 'chatter/groups' : 'connect/user-profiles'}/${userOrGroupId}/${
            isBanner ? 'banner-photo' : 'photo'
        }`,
        body: {
            fileId: photoCV.ContentDocumentId
        }
    });
    return savePhotResult;
};

interface PhotoSaveInput {
    conn: Connection;
    userOrGroupId: string;
    filePath: string;
    isBanner?: boolean;
    isGroup?: boolean;
}

export { savePhotoForUserOrGroup };
