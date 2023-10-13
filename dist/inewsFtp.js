"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INewsClient = void 0;
const EventEmitter = require("events");
const FtpClient = require("ftp");
const inewsStoryParser_1 = require("./inewsStoryParser");
class INewsClient extends EventEmitter {
    constructor(config) {
        super();
        this.status = 'disconnected';
        this._currentDir = null;
        // The @types package is missing the `connected` property, so we add it here
        this._ftpConn = new FtpClient();
        this._currentHost = null;
        this._reconnectAttempts = 0;
        const configDefault = {
            timeout: 60000,
            reconnectTimeout: 5000,
            maxReconnectAttempts: Infinity,
            operationTimeout: 2500, // 2.5 seconds
        };
        this.config = this._objectMerge(configDefault, config);
        if (!Array.isArray(this.config.hosts) && typeof this.config.host === 'string')
            this.config.hosts = [this.config.host];
        // Capture FTP connection events
        this._objectForEach({ ready: 'connected', error: 'error', close: 'disconnected', end: 'disconnected' }, (eventStatus, eventName) => {
            if (typeof eventName === 'number')
                return;
            // Re-emit event
            this._ftpConn.on(eventName, (...args) => {
                this._setStatus(eventStatus); // Emit status
                this.emit(eventName, ...args); // Re-emit event
            });
        });
        // Remove current directory on disconnect
        this.on('disconnected', () => {
            this._currentDir = null;
        });
    }
    async connect() {
        // If there's a connection in-progress, return that promise.
        if (this._connectionPromise) {
            return await this._connectionPromise;
        }
        // If we're already connected, return that connection.
        if (this._ftpConn !== null && this._ftpConn.connected) {
            return this._ftpConn;
        }
        // Else, connect.
        this._currentDir = null;
        this._connectionPromise = new Promise((resolve, reject) => {
            let reconnectAttempts = 0;
            const attemptReconnect = async () => {
                let promise;
                if (reconnectAttempts > 0) {
                    promise = this.disconnect().then(connect);
                }
                else {
                    promise = connect();
                }
                reconnectAttempts++;
                try {
                    return await promise;
                }
                catch (error) {
                    if (!this.config.maxReconnectAttempts || reconnectAttempts >= this.config.maxReconnectAttempts) {
                        this._connectionPromise = undefined;
                        throw error;
                    }
                    if (this.config.reconnectTimeout) {
                        await sleep(this.config.reconnectTimeout);
                    }
                    return attemptReconnect();
                }
            };
            const connect = async () => {
                return new Promise((resolve, reject) => {
                    let returned = false;
                    const onReady = () => {
                        if (!returned) {
                            returned = true;
                            this._connectionPromise = undefined;
                            this._currentDir = null;
                            // Set the connection to Unicode.
                            // https://resources.avid.com/SupportFiles/attach/Broadcast/iNEWS-v45-AG.pdf
                            this._ftpConn.site('CHARSET=UTF-8', () => {
                                // Do nothing.
                            });
                            // Set the connection to NSML 2 format.
                            // https://resources.avid.com/SupportFiles/attach/Broadcast/iNEWS-v45-AG.pdf
                            this._ftpConn.site('FORMAT=2NSML', () => {
                                // Do nothing.
                            });
                            removeListeners();
                            resolve(this._ftpConn);
                        }
                    };
                    const onError = (error) => {
                        if (!returned) {
                            returned = true;
                            this._connectionPromise = undefined;
                            removeListeners();
                            reject(error);
                        }
                    };
                    const onEnd = () => {
                        if (!returned) {
                            returned = true;
                            this._connectionPromise = undefined;
                            removeListeners();
                            resolve(this._ftpConn);
                        }
                    };
                    const removeListeners = () => {
                        this._ftpConn.removeListener('ready', onReady);
                        this._ftpConn.removeListener('error', onError);
                        this._ftpConn.removeListener('end', onEnd);
                    };
                    this._currentHost = this.config.hosts[this._reconnectAttempts++ % this.config.hosts.length]; // cycle through servers
                    this._setStatus('connecting');
                    const ftpConnConfig = {
                        host: this._currentHost,
                        user: this.config.user,
                        password: this.config.password,
                    };
                    this._ftpConn.once('ready', onReady);
                    this._ftpConn.once('error', onError);
                    this._ftpConn.once('end', onEnd); // workaround in case error is not emitted on timeout
                    this._ftpConn.connect(ftpConnConfig);
                });
            };
            // Kick off the connection attempt.
            attemptReconnect()
                .then((ftpClient) => resolve(ftpClient))
                .catch((error) => reject(error));
        });
        return this._connectionPromise;
    }
    async disconnect() {
        return new Promise((resolve) => {
            if (this._ftpConn.connected) {
                this.once('end', () => {
                    resolve(true);
                });
                this._ftpConn.end();
            }
            else
                resolve(true);
        });
    }
    async list(directory) {
        await this.connect();
        await this._cwd(directory);
        return new Promise((resolve, reject) => {
            let handled = false;
            const createTimeout = () => {
                return setTimeout(() => {
                    if (handled)
                        return;
                    handled = true;
                    clearTimeout(timeout);
                    reject(new Error('Timed out while waiting for file list'));
                }, this.config.operationTimeout);
            };
            const timeout = createTimeout();
            this._ftpConn.list((error, list) => {
                if (error) {
                    if (handled)
                        return;
                    handled = true;
                    clearTimeout(timeout);
                    reject(error);
                }
                else {
                    if (handled)
                        return;
                    handled = true;
                    clearTimeout(timeout);
                    const files = [];
                    if (Array.isArray(list)) {
                        ;
                        list.forEach((listItem) => {
                            // So apparently, if the ftp library can't parse a list item, it just bails out and returns a string.
                            // This is not reflected in the types.
                            if (typeof listItem !== 'string') {
                                throw new Error('FTP list item was not a string!');
                            }
                            const file = this._fileFromListItem(listItem);
                            if (typeof file !== 'undefined')
                                files.push(file);
                        });
                    }
                    resolve(files);
                }
            });
        });
    }
    async story(directory, file) {
        const storyNsml = await this.storyNsml(directory, file);
        return await (0, inewsStoryParser_1.default)(storyNsml);
    }
    async storyNsml(directory, file) {
        await this._cwd(directory);
        return await this._get(file);
    }
    _setStatus(status) {
        if (this.status !== status) {
            this.status = status;
            this.emit('status', { name: this.status, host: this._currentHost });
        }
    }
    async _cwd(requestPath) {
        return new Promise((resolve, reject) => {
            let handled = false;
            const createTimeout = () => {
                return setTimeout(() => {
                    if (handled)
                        return;
                    handled = true;
                    clearTimeout(timeout);
                    reject(new Error('Timed out while changing directories'));
                }, this.config.operationTimeout);
            };
            const timeout = createTimeout();
            if (this._currentDir === requestPath) {
                if (handled)
                    return;
                handled = true;
                clearTimeout(timeout);
                resolve();
            }
            else {
                this._ftpConn.cwd(requestPath, (error, cwdPath) => {
                    if (error) {
                        if (handled)
                            return;
                        handled = true;
                        clearTimeout(timeout);
                        reject(error);
                    }
                    else {
                        if (handled)
                            return;
                        handled = true;
                        clearTimeout(timeout);
                        this._currentDir = cwdPath;
                        resolve();
                    }
                });
            }
        });
    }
    async _get(file) {
        return new Promise((resolve, reject) => {
            let handled = false;
            const createTimeout = () => {
                return setTimeout(() => {
                    if (handled)
                        return;
                    handled = true;
                    clearTimeout(timeout);
                    reject(new Error('Timed out while waiting for data'));
                }, this.config.operationTimeout);
            };
            let timeout = createTimeout();
            this._ftpConn.get(file, (error, stream) => {
                if (error) {
                    if (handled)
                        return;
                    handled = true;
                    clearTimeout(timeout);
                    reject(error);
                }
                else if (stream) {
                    let storyXml = '';
                    stream.setEncoding('utf8');
                    stream.on('error', () => {
                        console.log('STREAM-ERROR 2');
                    });
                    stream.on('data', (chunk) => {
                        if (handled)
                            return;
                        clearTimeout(timeout);
                        timeout = createTimeout();
                        storyXml += chunk;
                    });
                    stream.once('close', () => {
                        if (handled)
                            return;
                        handled = true;
                        clearTimeout(timeout);
                        resolve(storyXml);
                    });
                }
                else {
                    if (handled)
                        return;
                    handled = true;
                    clearTimeout(timeout);
                    reject(new Error('no_stream'));
                }
            });
        });
    }
    _listItemIsQueue(listItem) {
        return listItem.indexOf('d---------') === 0;
    }
    _listItemIsFile(listItem) {
        return this._fileNameFromListItem(listItem) !== undefined;
    }
    _fileFromListItem(listItem) {
        let file = {};
        if (this._listItemIsFile(listItem)) {
            const fileName = this._fileNameFromListItem(listItem);
            if (typeof fileName !== 'undefined') {
                file = { filetype: 'story', file: fileName };
                file['identifier'] = this._storyIdentifierFromFilename(fileName);
                file['locator'] = this._storyLocatorFromFilename(fileName);
                file['storyName'] = this._storyNameFromListItem(listItem);
            }
        }
        else if (this._listItemIsQueue(listItem)) {
            const fileName = this._queueFromListItem(listItem);
            if (typeof fileName !== 'undefined')
                file = { filetype: 'queue', file: fileName };
        }
        if (typeof file !== 'undefined') {
            const fileDate = this._dateFromListItem(listItem);
            if (typeof fileDate !== 'undefined')
                file['modified'] = fileDate;
            if (file['filetype'] === 'story') {
                file['flags'] = this._flagsFromListItem(listItem);
            }
            return file;
        }
        else
            return undefined;
    }
    /**
     * Get the story ID from the fileName (in XXXXXX:YYYYYY:ZZZZZZ, it will return XXXXXX)
     * http://resources.avid.com/SupportFiles/attach/Broadcast/inews-ftp-server.pdf
     * @param fileName
     * @returns {*}
     * @private
     */
    _storyIdentifierFromFilename(fileName) {
        const fileParts = fileName.split(':');
        return fileParts[0];
    }
    /**
     * Get the story locator from the fileName (in XXXXXX:YYYYYY:ZZZZZZ, it will return YYYYYY:ZZZZZZ)
     * http://resources.avid.com/SupportFiles/attach/Broadcast/inews-ftp-server.pdf
     * @param fileName
     * @returns {*}
     * @private
     */
    _storyLocatorFromFilename(fileName) {
        const fileParts = fileName.split(':');
        return fileParts[1] + ':' + fileParts[2];
    }
    _flagsFromListItem(listItem) {
        const flags = {};
        const pattern = /([^\s]+)/i;
        const flagParts = listItem.match(pattern);
        if (flagParts) {
            flags.floated = flagParts[0][1] == 'f';
        }
        return flags;
    }
    _dateFromListItem(listItem) {
        const pattern = / ([A-Za-z]{3,4})[ ]+([0-9]{1,2})[ ]+([0-9]{4}|([0-9]{1,2}):([0-9]{2}))/i;
        const dateParts = listItem.match(pattern);
        if (!dateParts) {
            return undefined;
        }
        try {
            if (typeof dateParts[4] !== 'undefined') {
                const dateNow = new Date();
                const dateModified = new Date(dateParts[1] + ' ' + dateParts[2] + ' ' + dateNow.getFullYear() + ' ' + dateParts[3]);
                if (dateModified.getMonth() > dateNow.getMonth())
                    // change to last year if the date would fall in the future
                    dateModified.setFullYear(dateNow.getFullYear() - 1);
                return dateModified;
            }
            else
                return new Date(dateParts[0]);
        }
        catch (error) {
            return undefined;
        }
    }
    _queueFromListItem(listItem) {
        const pattern = /.([A-Za-z0-9-]*)$/;
        const matchParts = listItem.match(pattern);
        return matchParts === null ? undefined : matchParts[1];
    }
    _fileNameFromListItem(listItem) {
        const pattern = /[A-Z0-9]{8}:[A-Z0-9]{8}:[A-Z0-9]{8}/i;
        const matchParts = listItem.match(pattern);
        return matchParts === null ? undefined : matchParts[0];
    }
    _storyNameFromListItem(listItem) {
        const pattern = /(?:[0-9A-F]{8}:?){3} (.+?)$/;
        const listItemParts = listItem.match(pattern);
        return Array.isArray(listItemParts) && listItemParts.length > 1 ? listItemParts[1] : '';
    }
    _objectMerge(...args) {
        const merged = {};
        this._objectForEach(args, (argument) => {
            for (const attrname in argument) {
                if ({}.hasOwnProperty.call(argument, attrname)) {
                    merged[attrname] = argument[attrname];
                }
            }
        });
        return merged;
    }
    _objectForEach(object, callback) {
        // run function on each property (child) of object
        if (Array.isArray(object)) {
            for (let i = 0; i < object.length; i++) {
                callback(object[i], i, object);
            }
        }
        else {
            for (const property in object) {
                if ({}.hasOwnProperty.call(object, property)) {
                    callback(object[property], property, object);
                }
            }
        }
    }
}
exports.INewsClient = INewsClient;
async function sleep(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, milliseconds);
    });
}
//# sourceMappingURL=inewsFtp.js.map