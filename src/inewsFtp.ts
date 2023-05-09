import EventEmitter = require('events')
import FtpClient = require('ftp')
import parseNsml from './inewsStoryParser'
import { INewsStory, Status } from './types/inews'

export interface INewsClientConfig {
	hosts: string[]
	host?: string
	timeout: number
	reconnectTimeout: number
	maxReconnectAttempts: number
	user: string
	password: string
}

export interface INewsFTPItemBase {
	file: string
	modified?: Date
}

export interface INewsFTPStory extends INewsFTPItemBase {
	filetype: 'story'
	identifier: string
	locator: string
	storyName: string
	flags?: { floated?: boolean }
}

export interface INewsFTPQueue extends INewsFTPItemBase {
	filetype: 'queue'
}

export type INewsFTPStoryOrQueue = INewsFTPStory | INewsFTPQueue

export class INewsClient extends EventEmitter {
	status: Status = 'disconnected'
	on!: ((event: 'status', listener: (status: { name: string; host: string }) => void) => this) &
		((event: 'ready', listener: () => void) => this) &
		((event: 'error', listener: (err: Error) => void) => this) &
		((event: 'close', listener: (hadErr?: boolean) => void) => this) &
		((event: 'end', listener: () => void) => this) &
		((event: 'disconnected', listener: () => void) => this)

	private config: INewsClientConfig
	private _currentDir: null | string | undefined = null
	// The @types package is missing the `connected` property, so we add it here
	private _ftpConn: FtpClient & { connected: boolean } = new FtpClient() as any
	private _currentHost: string | null = null
	private _reconnectAttempts = 0
	/**
	 * Will only be defined if a connection is in-progress.
	 */
	private _connectionPromise?: Promise<FtpClient>

	constructor(config: Partial<INewsClientConfig>) {
		super()

		const configDefault: Partial<INewsClientConfig> = {
			timeout: 60000, // 1 minute
			reconnectTimeout: 5000, // 5 seconds
			maxReconnectAttempts: Infinity,
		}

		this.config = this._objectMerge(configDefault, config) as unknown as INewsClientConfig

		if (!Array.isArray(this.config.hosts) && typeof this.config.host === 'string')
			this.config.hosts = [this.config.host]

		// Capture FTP connection events
		this._objectForEach(
			{ ready: 'connected', error: 'error', close: 'disconnected', end: 'disconnected' },
			(eventStatus: Status, eventName: string | number) => {
				if (typeof eventName === 'number') return
				// Re-emit event
				this._ftpConn.on(eventName, (...args) => {
					this._setStatus(eventStatus) // Emit status
					this.emit(eventName, ...args) // Re-emit event
				})
			}
		)

		// Remove current directory on disconnect
		this.on('disconnected', () => {
			this._currentDir = null
		})
	}

	async connect(): Promise<FtpClient> {
		// If there's a connection in-progress, return that promise.
		if (this._connectionPromise) {
			return this._connectionPromise
		}

		// If we're already connected, return that connection.
		if (this._ftpConn !== null && this._ftpConn.connected) {
			return this._ftpConn
		}

		// Else, connect.
		this._currentDir = null
		this._connectionPromise = new Promise((resolve, reject) => {
			let reconnectAttempts = 0

			const attemptReconnect = async (): Promise<FtpClient> => {
				let promise: Promise<FtpClient>

				if (reconnectAttempts > 0) {
					promise = this.disconnect().then(connect)
				} else {
					promise = connect()
				}

				reconnectAttempts++

				try {
					return promise
				} catch (error) {
					if (!this.config.maxReconnectAttempts || reconnectAttempts >= this.config.maxReconnectAttempts) {
						this._connectionPromise = undefined
						throw error
					}
					if (this.config.reconnectTimeout) {
						await sleep(this.config.reconnectTimeout)
					}
					return attemptReconnect()
				}
			}

			const connect = async (): Promise<FtpClient> => {
				return new Promise((resolve, reject) => {
					let returned = false

					const onReady = () => {
						if (!returned) {
							returned = true
							this._connectionPromise = undefined
							this._currentDir = null
							removeListeners()
							resolve(this._ftpConn)
						}
					}

					const onError = (error: NodeJS.ErrnoException) => {
						if (!returned) {
							returned = true
							this._connectionPromise = undefined
							removeListeners()
							reject(error)
						}
					}

					const onEnd = () => {
						if (!returned) {
							returned = true
							this._connectionPromise = undefined
							removeListeners()
							resolve(this._ftpConn)
						}
					}

					const removeListeners = () => {
						this._ftpConn.removeListener('ready', onReady)
						this._ftpConn.removeListener('error', onError)
						this._ftpConn.removeListener('end', onEnd)
					}

					this._currentHost = this.config.hosts[this._reconnectAttempts++ % this.config.hosts.length] // cycle through servers

					this._setStatus('connecting')

					const ftpConnConfig = {
						host: this._currentHost,
						user: this.config.user,
						password: this.config.password,
					}

					this._ftpConn.once('ready', onReady)
					this._ftpConn.once('error', onError)
					this._ftpConn.once('end', onEnd) // workaround in case error is not emitted on timeout
					this._ftpConn.connect(ftpConnConfig)
				})
			}

			// Kick off the connection attempt.
			attemptReconnect()
				.then((ftpClient) => resolve(ftpClient))
				.catch((error) => reject(error))
		})

		return this._connectionPromise
	}

	async disconnect(): Promise<boolean> {
		return new Promise((resolve) => {
			if (this._ftpConn.connected) {
				this.once('end', () => {
					resolve(true)
				})
				this._ftpConn.end()
			} else resolve(true)
		})
	}

	async list(directory: string): Promise<INewsFTPStoryOrQueue[]> {
		await this.connect()
		await this._cwd(directory)

		return new Promise((resolve, reject) => {
			this._ftpConn.list((error, list) => {
				if (error) reject(error)
				else {
					const files: INewsFTPStoryOrQueue[] = []
					if (Array.isArray(list)) {
						;(list as (FtpClient.ListingElement | string)[]).forEach((listItem) => {
							// So apparently, if the ftp library can't parse a list item, it just bails out and returns a string.
							// This is not reflected in the types.
							if (typeof listItem !== 'string') {
								throw new Error('FTP list item was not a string!')
							}
							const file = this._fileFromListItem(listItem)
							if (typeof file !== 'undefined') files.push(file)
						})
					}
					resolve(files)
				}
			})
		})
	}

	async story(directory: string, file: string): Promise<INewsStory> {
		const storyNsml = await this.storyNsml(directory, file)
		return await parseNsml(storyNsml)
	}

	async storyNsml(directory: string, file: string): Promise<string> {
		await this._cwd(directory)
		return await this._get(file)
	}

	private _setStatus(status: Status) {
		if (this.status !== status) {
			this.status = status
			this.emit('status', { name: this.status, host: this._currentHost })
		}
	}

	private async _cwd(requestPath: string): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this._currentDir === requestPath)
				// already in this directory
				resolve()
			else {
				this._ftpConn.cwd(requestPath, (error, cwdPath) => {
					if (error) {
						reject(error)
					} else {
						this._currentDir = cwdPath
						resolve()
					}
				})
			}
		})
	}

	private async _get(file: string): Promise<string> {
		return new Promise((resolve, reject) => {
			this._ftpConn.get(file, (error, stream) => {
				if (error) reject(error)
				else if (stream) {
					let storyXml = ''

					stream.setEncoding('utf8')

					stream.on('error', () => {
						console.log('STREAM-ERROR 2')
					})

					stream.on('data', (chunk) => {
						storyXml += chunk
					})
					stream.once('close', () => {
						resolve(storyXml)
					})
				} else reject(new Error('no_stream'))
			})
		})
	}

	private _listItemIsQueue(listItem: string) {
		return listItem.indexOf('d---------') === 0
	}

	private _listItemIsFile(listItem: string) {
		return this._fileNameFromListItem(listItem) !== undefined
	}

	private _fileFromListItem(listItem: string): INewsFTPStoryOrQueue | undefined {
		let file: Partial<INewsFTPStoryOrQueue> = {}
		if (this._listItemIsFile(listItem)) {
			const fileName = this._fileNameFromListItem(listItem)
			if (typeof fileName !== 'undefined') {
				file = { filetype: 'story', file: fileName }
				file['identifier'] = this._storyIdentifierFromFilename(fileName)
				file['locator'] = this._storyLocatorFromFilename(fileName)
				file['storyName'] = this._storyNameFromListItem(listItem)
			}
		} else if (this._listItemIsQueue(listItem)) {
			const fileName = this._queueFromListItem(listItem)
			if (typeof fileName !== 'undefined') file = { filetype: 'queue', file: fileName }
		}

		if (typeof file !== 'undefined') {
			const fileDate = this._dateFromListItem(listItem)
			if (typeof fileDate !== 'undefined') file['modified'] = fileDate

			if (file['filetype'] === 'story') {
				file['flags'] = this._flagsFromListItem(listItem)
			}

			return file as INewsFTPStory
		} else return undefined
	}

	/**
	 * Get the story ID from the fileName (in XXXXXX:YYYYYY:ZZZZZZ, it will return XXXXXX)
	 * http://resources.avid.com/SupportFiles/attach/Broadcast/inews-ftp-server.pdf
	 * @param fileName
	 * @returns {*}
	 * @private
	 */
	private _storyIdentifierFromFilename(fileName: string) {
		const fileParts = fileName.split(':')
		return fileParts[0]
	}

	/**
	 * Get the story locator from the fileName (in XXXXXX:YYYYYY:ZZZZZZ, it will return YYYYYY:ZZZZZZ)
	 * http://resources.avid.com/SupportFiles/attach/Broadcast/inews-ftp-server.pdf
	 * @param fileName
	 * @returns {*}
	 * @private
	 */
	private _storyLocatorFromFilename(fileName: string) {
		const fileParts = fileName.split(':')
		return fileParts[1] + ':' + fileParts[2]
	}

	private _flagsFromListItem(listItem: string): { floated?: boolean } {
		const flags: { floated?: boolean } = {}
		const pattern = /([^\s]+)/i
		const flagParts = listItem.match(pattern)

		if (flagParts) {
			flags.floated = flagParts[0][1] == 'f'
		}

		return flags
	}

	private _dateFromListItem(listItem: string) {
		const pattern = / ([A-Za-z]{3,4})[ ]+([0-9]{1,2})[ ]+([0-9]{4}|([0-9]{1,2}):([0-9]{2}))/i
		const dateParts = listItem.match(pattern)

		if (!dateParts) {
			return undefined
		}

		try {
			if (typeof dateParts[4] !== 'undefined') {
				const dateNow = new Date()
				const dateModified = new Date(
					dateParts[1] + ' ' + dateParts[2] + ' ' + dateNow.getFullYear() + ' ' + dateParts[3]
				)
				if (dateModified.getMonth() > dateNow.getMonth())
					// change to last year if the date would fall in the future
					dateModified.setFullYear(dateNow.getFullYear() - 1)
				return dateModified
			} else return new Date(dateParts[0])
		} catch (error) {
			return undefined
		}
	}

	private _queueFromListItem(listItem: string) {
		const pattern = /.([A-Za-z0-9-]*)$/
		const matchParts = listItem.match(pattern)
		return matchParts === null ? undefined : matchParts[1]
	}

	private _fileNameFromListItem(listItem: string) {
		const pattern = /[A-Z0-9]{8}:[A-Z0-9]{8}:[A-Z0-9]{8}/i
		const matchParts = listItem.match(pattern)
		return matchParts === null ? undefined : matchParts[0]
	}

	private _storyNameFromListItem(listItem: string) {
		const pattern = /(?:[0-9A-F]{8}:?){3} (.+?)$/
		const listItemParts = listItem.match(pattern)
		return Array.isArray(listItemParts) && listItemParts.length > 1 ? listItemParts[1] : ''
	}

	private _objectMerge(...args: Record<string, unknown>[]): Record<string, unknown> {
		const merged: Record<string, unknown> = {}
		this._objectForEach(args, (argument: Record<string, unknown>) => {
			for (const attrname in argument) {
				if ({}.hasOwnProperty.call(argument, attrname)) {
					merged[attrname] = argument[attrname]
				}
			}
		})
		return merged
	}

	private _objectForEach<T extends Record<string, unknown>[] | Record<string, unknown>>(
		object: T,
		callback: (value: any, key: number | string, parentObject: T) => void
	) {
		// run function on each property (child) of object
		if (Array.isArray(object)) {
			for (let i = 0; i < object.length; i++) {
				callback(object[i], i, object)
			}
		} else {
			for (const property in object) {
				if ({}.hasOwnProperty.call(object, property)) {
					callback(object[property], property, object)
				}
			}
		}
	}
}

async function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve()
		}, milliseconds)
	})
}
