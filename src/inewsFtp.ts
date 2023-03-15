import EventEmitter = require('events')
import FtpClient = require('ftp')
import JobsQueue = require('jobs-queue')
import parseNsml from './inewsStoryParser'
import { NodeCallback } from './types/util'
import { INewsStory, Status } from './types/inews'

// HACK (alvancamp 2023/03/13): This was the only way I could figure out to make these types work.
import { JobsQueue as HackJobsQueue } from './types/hack-jobs-queue'

export type INewsClientConfig = {
	hosts: string[]
	host?: string
	timeout: number
	reconnectTimeout: number
	maxOperations: number
	maxOperationAttempts: number
	reconnectAttempts?: number
	user: string
	password: string
}

export type INewsFTPFile = {
	file: string
	modified?: Date
	flags?: { floated?: boolean }
} & (
	| {
			filetype: 'file'
			identifier: string
			locator: string
			storyName: string
	  }
	| {
			filetype: 'queue'
	  }
)

type Operation<T> = (jobCompleteCallback: NodeCallback<T>) => void
type ErrorCallback = (
	error: NodeJS.ErrnoException,
	operationContinue: (continueError?: NodeJS.ErrnoException | null | undefined) => void
) => void

export class INewsClient extends EventEmitter {
	status: Status = 'disconnected'
	on!: ((event: 'status', listener: (status: { name: string; host: string }) => void) => this) &
		((event: 'ready', listener: () => void) => this) &
		((event: 'error', listener: (err: Error) => void) => this) &
		((event: 'close', listener: (hadErr?: boolean) => void) => this) &
		((event: 'end', listener: () => void) => this) &
		((event: 'disconnected', listener: () => void) => this)
	_queue = JobsQueue()

	private config: INewsClientConfig
	private _lastDirectory: null | string | number = null
	private _currentDir: null | string | undefined = null
	// The @types package is missing the `connected` property, so we add it here
	private _ftpConn: FtpClient & { connected: boolean } = new FtpClient() as any
	private _currentHost: string | null = null
	private _reconnectAttempts = 0
	private _connectionInProgress = false
	private _connectionCallbacks: Array<NodeCallback<FtpClient>> = []

	constructor(config: Partial<INewsClientConfig>) {
		super()

		const configDefault: Partial<INewsClientConfig> = {
			timeout: 60000, // 1 minute
			reconnectTimeout: 5000, // 5 seconds
			maxOperations: 5,
			maxOperationAttempts: 5,
		}

		this.config = this._objectMerge(configDefault, config) as INewsClientConfig

		if (!Array.isArray(this.config.hosts) && typeof this.config.host === 'string')
			this.config.hosts = [this.config.host]

		// Capture FTP connection events
		this._objectForEach(
			{ ready: 'connected', error: 'error', close: 'disconnected', end: 'disconnected' },
			(eventStatus: Status, eventName: string) => {
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

	connect(callback: NodeCallback<FtpClient>, forceDisconnect?: boolean): void {
		let reconnectAttempts = 0

		const attemptReconnect = () => {
			if (forceDisconnect || reconnectAttempts > 0) {
				this.disconnect(() => {
					connect(connectResult)
				})
			} else connect(connectResult)
		}

		const connect = (connectResult: NodeCallback<FtpClient>) => {
			let returned = false

			const onReady = () => {
				if (!returned) {
					returned = true
					this._currentDir = null
					removeListeners()
					connectResult(null, this._ftpConn)
				}
			}

			const onError = (error: NodeJS.ErrnoException) => {
				if (!returned) {
					returned = true
					removeListeners()
					connectResult(error)
				}
			}

			const onEnd = () => {
				if (!returned) {
					returned = true
					removeListeners()
					connectResult(null, this._ftpConn)
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
		}

		const callbackSafe: NodeCallback<FtpClient> = (error, response) => {
			this._connectionInProgress = false
			while (this._connectionCallbacks.length) {
				const connectionCallback = this._connectionCallbacks.shift()
				if (typeof connectionCallback == 'function') {
					if (error) {
						connectionCallback(error)
					} else {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						connectionCallback(error, response!)
					}
				}
			}
		}

		const connectResult: NodeCallback<FtpClient> = (error, ftpConn) => {
			reconnectAttempts++

			if (
				error &&
				(typeof this.config.reconnectAttempts !== 'number' ||
					this.config.reconnectAttempts < 0 ||
					reconnectAttempts < this.config.reconnectAttempts)
			) {
				if (typeof this.config.reconnectTimeout != 'number' || this.config.reconnectTimeout <= 0) attemptReconnect()
				else setTimeout(attemptReconnect, this.config.reconnectTimeout)
			} else {
				if (error) {
					callbackSafe(error)
				} else {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					callbackSafe(null, ftpConn!)
				}
			}
		}

		if (typeof callback === 'function') this._connectionCallbacks.push(callback)

		forceDisconnect = typeof forceDisconnect === 'boolean' ? forceDisconnect : false

		if (this._ftpConn !== null && this._ftpConn.connected && !forceDisconnect) {
			callbackSafe(null, this._ftpConn)
		} else if (!this._connectionInProgress) {
			this._connectionInProgress = true
			this._currentDir = null

			attemptReconnect()
		}
	}

	disconnect(callback: NodeCallback<boolean>): void {
		if (this._ftpConn.connected) {
			this.once('end', () => {
				callbackSafe(null, true)
			})
			this._ftpConn.end()
		} else callback(null, true)

		const callbackSafe: NodeCallback<boolean> = (error, success) => {
			if (typeof callback == 'function') {
				if (error) {
					callback(error)
				} else {
					callback(null, Boolean(success))
				}
			}
		}
	}

	list(directory: string, callback: NodeCallback<INewsFTPFile[]>): HackJobsQueue['JobContoller'] {
		const maxOperations = this._lastDirectory == directory ? this.config.maxOperations : 1
		this._lastDirectory = directory

		const callbackSafe: NodeCallback<INewsFTPFile[]> = (error, result) => {
			if (typeof callback === 'function') {
				if (error) {
					callback(error)
				} else {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					callback(null, result!)
				}
			}
		}

		// Return job controller
		return this._connectedEnqueue(
			(jobComplete) => {
				this.connect((error) => {
					if (error) jobComplete(error, null)
					else {
						this._cwd(directory, (error) => {
							if (error) jobComplete(error, null)
							else {
								this._ftpConn.list((error, list) => {
									if (error) jobComplete(error, null)
									else {
										const files: INewsFTPFile[] = []
										if (Array.isArray(list)) {
											;(list as Array<FtpClient.ListingElement | string>).forEach((listItem) => {
												// So apparently, if the ftp library can't parse a list item, it just bails out and returns a string.
												// This is not reflected in the types.
												if (typeof listItem !== 'string') {
													throw new Error('FTP list item was not a string!')
												}
												const file = this._fileFromListItem(listItem)
												if (typeof file !== 'undefined') files.push(file)
											})
										}
										jobComplete(null, files)
									}
								})
							}
						})
					}
				})
			},
			{ maxSimultaneous: maxOperations },
			callbackSafe
		)
	}

	story(directory: string, file: string, callback: NodeCallback<INewsStory>): HackJobsQueue['JobContoller'] {
		// Return job controller
		return this.storyNsml(directory, file, (error, storyNsml) => {
			if (error) {
				callback(error)
			} else {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				parseNsml(storyNsml!, callback)
			}
		})
	}

	private _connectedEnqueue<T>(
		operation: Operation<T>,
		options: HackJobsQueue['Options'],
		callback: NodeCallback<T>
	): HackJobsQueue['JobContoller'] {
		// Calculate max operations

		const jobController = this.enqueue<T>(
			operation,
			this.config.maxOperationAttempts,
			this.config.timeout,
			(_error, operationContinue) => {
				// On failure
				// If disconnected, wait for ready, then restart
				operationContinue()
			},
			(error, result) => {
				if (error) {
					callback(error)
				} else {
					callback(null, result as any)
				}
			},
			options
		)

		return jobController
	}

	storyNsml(directory: string, file: string, callback: NodeCallback<string>): HackJobsQueue['JobContoller'] {
		const maxOperations = this._lastDirectory == directory ? this.config.maxOperations : 1
		this._lastDirectory = directory

		const callbackSafe: NodeCallback<string> = (error, result) => {
			if (typeof callback === 'function') {
				if (error) {
					callback(error)
				} else {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					callback(null, result!)
				}
			}
		}

		// Return job controller
		return this._connectedEnqueue(
			(jobComplete) => {
				this.connect((error) => {
					if (error) jobComplete(error, null)
					else {
						this._cwd(directory, (error) => {
							if (error) jobComplete(error, null)
							else this._get(file, jobComplete)
						})
					}
				})
			},
			{ maxSimultaneous: maxOperations },
			callbackSafe
		)
	}

	queueLength(): number {
		return this._queue.queued
	}

	private _setStatus(status: Status) {
		if (this.status !== status) {
			this.status = status
			this.emit('status', { name: this.status, host: this._currentHost })
		}
	}

	private _cwd(requestPath: string, cwdComplete: NodeCallback<string | undefined>) {
		if (this._currentDir === requestPath)
			// already in this directory
			cwdComplete(null, requestPath)
		else {
			this._ftpConn.cwd(requestPath, (error, cwdPath) => {
				if (error) {
					cwdComplete(error)
				} else {
					this._currentDir = cwdPath
					cwdComplete(error, cwdPath)
				}
			})
		}
	}

	private _get(file: string, getComplete: NodeCallback<string>): void {
		this._ftpConn.get(file, (error, stream) => {
			if (error) getComplete(error, null)
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
					getComplete(null, storyXml)
				})
			} else getComplete(new Error('no_stream'), null)
		})
	}

	private _listItemIsQueue(listItem: string) {
		return listItem.indexOf('d---------') === 0
	}

	private _listItemIsFile(listItem: string) {
		return this._fileNameFromListItem(listItem) !== undefined
	}

	private _fileFromListItem(listItem: string): INewsFTPFile | undefined {
		let file: Partial<INewsFTPFile> = {}
		if (this._listItemIsFile(listItem)) {
			const fileName = this._fileNameFromListItem(listItem)
			if (typeof fileName !== 'undefined') {
				file = { filetype: 'file', file: fileName }
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

			file['flags'] = this._flagsFromListItem(listItem)

			return file as INewsFTPFile
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

	enqueue<T>(
		operation: Operation<T>,
		maxOperationAttempts: number,
		operationTimeout: number,
		errorCallback: ErrorCallback,
		finalCallback?: NodeCallback<T>,
		options?: HackJobsQueue['Options']
	): HackJobsQueue['JobContoller'] {
		let operationComplete = false

		const jobOperation = (next: () => void) => {
			this._attemptOperation(timedOperation, maxOperationAttempts, errorCallback, (error, result) => {
				if (error) {
					callbackSafe(error)
				} else {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					callbackSafe(null, result!)
				}
				next()
			})
		}

		const timedOperation = (callback: NodeCallback<T>) => {
			this._timedOperation<Operation<T>, T>(operation, operationTimeout, (error, result) => {
				if (!operationComplete) {
					// Only continue if not canceled
					if (error) {
						callback(error)
					} else {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						callback(null, result!)
					}
				}
			})
		}

		const callbackSafe: NodeCallback<T> = (error, result) => {
			if (!operationComplete) {
				operationComplete = true
				if (typeof finalCallback === 'function') {
					if (error) {
						finalCallback(error)
					} else {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						finalCallback(null, result!)
					}
				}
			}
		}

		const jobController = this._queue.enqueue(jobOperation, options)

		return {
			cancel: () => {
				operationComplete = true
				jobController.cancel()
			},
			complete: () => {
				operationComplete = true
				jobController.complete()
			},
			restart: () => {
				jobController.restart()
			},
		}
	}

	private _attemptOperation<T>(
		operation: Operation<T>,
		maxAttempts: number,
		errorCallback: ErrorCallback,
		finalCallback?: NodeCallback<T>
	) {
		let currentAttempt = 0

		const attemptOperation = () => {
			currentAttempt++
			const operationAttempt = currentAttempt
			operation((error, result) => {
				if (error && (typeof maxAttempts !== 'number' || maxAttempts < 0 || currentAttempt < maxAttempts)) {
					errorCallback(error, (continueError) => {
						if (continueError) callbackSafe(operationAttempt, continueError, result)
						else attemptOperation()
					})
				} else callbackSafe(operationAttempt, error, result)
			})
		}

		const callbackSafe = (
			operationAttempt: number,
			error: NodeJS.ErrnoException | null | undefined,
			result: T | null | undefined
		) => {
			if (operationAttempt === currentAttempt) {
				if (typeof finalCallback === 'function') {
					if (error) {
						finalCallback(error)
					} else {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						finalCallback(null, result!)
					}
				}
			}
		}

		attemptOperation()
	}

	private _timedOperation<T extends Operation<U>, U>(operation: T, timeout: number, callback: NodeCallback<U>) {
		const operationTimeout = setTimeout(() => {
			callback(new Error('operation_timeout'), null)
		}, timeout)

		operation((...args: any[]) => {
			clearTimeout(operationTimeout)
			callback(args[0], args[1])
		})
	}

	private _objectMerge(...args: Array<Record<string, unknown>>) {
		const merged = {}
		this._objectForEach(args, (argument: Record<string, unknown>) => {
			for (const attrname in argument) {
				if ({}.hasOwnProperty.call(argument, attrname)) (merged as any)[attrname] = argument[attrname]
			}
		})
		return merged
	}

	private _objectForEach(
		object: Array<Record<string, unknown>> | Record<string, unknown>,
		callback: (value: any, key: string, parentObject: Array<Record<string, unknown>> | Record<string, unknown>) => void
	) {
		// run function on each property (child) of object
		for (const property in object) {
			// pull keys before looping through?
			if ({}.hasOwnProperty.call(object, property)) callback((object as any)[property], property, object)
		}
	}
}
