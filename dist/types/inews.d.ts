export type UnparsedCue = string[] | null;
export interface INewsStory {
    id: string;
    identifier: string;
    locator: string;
    fields: INewsFields;
    meta: INewsMetaData;
    cues: Array<UnparsedCue | null>;
    body?: string;
    attachments: {
        [key: string]: string;
    };
}
export type INewsFields = {
    [fieldName in INewsFieldName]: INewsField | undefined;
};
export type INewsField = {
    /** Empty tag = empty string (''). */
    value: string;
    attributes: INewsFieldAttributes;
};
/**
 * All values need to be camelCased.
 */
export declare enum INewsFieldName {
    Title = "title",
    ModifyDate = "modifyDate",
    PageNumber = "pageNumber",
    TapeTime = "tapeTime",
    AudioTime = "audioTime",
    TotalTime = "totalTime",
    CumeTime = "cumeTime",
    BackTime = "backTime",
    Layout = "layout",
    RunsTime = "runsTime",
    VideoId = "videoId"
}
/**
 * Sourced from https://resources.avid.com/SupportFiles/attach/NSMLv2.8Specification.pdf
 */
export interface INewsFieldAttributes {
    /**
     * "User-Entered Content" means that a value has been entered manually and appears **bold** in iNews.
     * In some studios, it is common to treat user-entered values differently than automatic values.
     */
    uec?: boolean;
    urgency?: 1 | 2 | 3;
    aready?: string;
}
export interface INewsMetaData {
    wire?: 'f' | 'b' | 'u' | 'r' | 'o';
    mail?: 'read' | 'unread';
    locked?: 'pass' | 'user';
    words?: string;
    rate?: string;
    break?: string;
    mcserror?: string;
    hold?: string;
    float?: 'float';
    delete?: string;
}
export type Status = 'connecting' | 'connected' | 'error' | 'disconnected';
//# sourceMappingURL=inews.d.ts.map