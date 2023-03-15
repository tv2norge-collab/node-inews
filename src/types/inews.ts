export type UnparsedCue = string[] | null

export interface INewsStory {
	id: string
	identifier: string
	locator: string
	fields: INewsFields
	meta: INewsMetaData
	cues: Array<UnparsedCue | null>
	body?: string
}

export type INewsFields = {
	[fieldName in INewsFieldName]: INewsField
}

export type INewsField = {
	/** Empty tag = empty string (''). Missing tag = undefined. */
	value?: string
	/** Missing tag = undefined. */
	attributes?: INewsFieldAttributes
}

/**
 * All values need to be camelCased.
 */
export enum INewsFieldName {
	Title = 'title',
	ModifyDate = 'modifyDate',
	PageNumber = 'pageNumber',
	TapeTime = 'tapeTime',
	AudioTime = 'audioTime',
	TotalTime = 'totalTime',
	CumeTime = 'cumeTime',
	BackTime = 'backTime',
	Layout = 'layout',
	RunsTime = 'runsTime',
	VideoId = 'videoId',
}

/**
 * Sourced from https://resources.avid.com/SupportFiles/attach/NSMLv2.8Specification.pdf
 */
export interface INewsFieldAttributes {
	uec?: boolean
	urgency?: 1 | 2 | 3
	aready?: string
}

export interface INewsMetaData {
	wire?: 'f' | 'b' | 'u' | 'r' | 'o'
	mail?: 'read' | 'unread'
	locked?: 'pass' | 'user'
	words?: string // number
	rate?: string // number
	break?: string
	mcserror?: string
	hold?: string
	float?: 'float' | undefined
	delete?: string
}

export interface INewsDirItem {
	filetype: 'file' | 'queue'
	file: string
	modified?: Date
}

export interface INewsFile extends INewsDirItem {
	filetype: 'file'
	/* Unique identifier. Sometimes blank (temporarily) */
	identifier: string
	locator: string
	storyName: string
}

export interface INewsQueue extends INewsDirItem {
	filetype: 'queue'
}

export type Status = 'connecting' | 'connected' | 'error' | 'disconnected'
