/// <reference types="node" />
import EventEmitter = require('events');
import FtpClient = require('ftp');
import { INewsStory, Status } from './types/inews';
export interface INewsClientConfig {
    hosts: string[];
    host?: string;
    timeout: number;
    reconnectTimeout: number;
    maxReconnectAttempts: number;
    user: string;
    password: string;
    operationTimeout: number;
}
export interface INewsFTPItemBase {
    file: string;
    modified?: Date;
}
export interface INewsFTPStory extends INewsFTPItemBase {
    filetype: 'story';
    identifier: string;
    locator: string;
    storyName: string;
    flags?: {
        floated?: boolean;
    };
}
export interface INewsFTPQueue extends INewsFTPItemBase {
    filetype: 'queue';
}
export type INewsFTPStoryOrQueue = INewsFTPStory | INewsFTPQueue;
export declare class INewsClient extends EventEmitter {
    status: Status;
    on: ((event: 'status', listener: (status: {
        name: string;
        host: string;
    }) => void) => this) & ((event: 'ready', listener: () => void) => this) & ((event: 'error', listener: (err: Error) => void) => this) & ((event: 'close', listener: (hadErr?: boolean) => void) => this) & ((event: 'end', listener: () => void) => this) & ((event: 'disconnected', listener: () => void) => this);
    private config;
    private _currentDir;
    private _ftpConn;
    private _currentHost;
    private _reconnectAttempts;
    /**
     * Will only be defined if a connection is in-progress.
     */
    private _connectionPromise?;
    constructor(config: Partial<INewsClientConfig>);
    connect(): Promise<FtpClient>;
    disconnect(): Promise<boolean>;
    list(directory: string): Promise<INewsFTPStoryOrQueue[]>;
    story(directory: string, file: string): Promise<INewsStory>;
    storyNsml(directory: string, file: string): Promise<string>;
    private _setStatus;
    private _cwd;
    private _get;
    private _listItemIsQueue;
    private _listItemIsFile;
    private _fileFromListItem;
    /**
     * Get the story ID from the fileName (in XXXXXX:YYYYYY:ZZZZZZ, it will return XXXXXX)
     * http://resources.avid.com/SupportFiles/attach/Broadcast/inews-ftp-server.pdf
     * @param fileName
     * @returns {*}
     * @private
     */
    private _storyIdentifierFromFilename;
    /**
     * Get the story locator from the fileName (in XXXXXX:YYYYYY:ZZZZZZ, it will return YYYYYY:ZZZZZZ)
     * http://resources.avid.com/SupportFiles/attach/Broadcast/inews-ftp-server.pdf
     * @param fileName
     * @returns {*}
     * @private
     */
    private _storyLocatorFromFilename;
    private _flagsFromListItem;
    private _dateFromListItem;
    private _queueFromListItem;
    private _fileNameFromListItem;
    private _storyNameFromListItem;
    private _objectMerge;
    private _objectForEach;
}
//# sourceMappingURL=inewsFtp.d.ts.map