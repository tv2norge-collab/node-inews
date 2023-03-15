declare module 'jobs-queue' {
	interface JobsQueue {
		Options: {
			maxSimultaneous: number
		}

		JobContoller: {
			cancel: () => void
			complete: () => void
			restart: () => void
		}
	}

	class JobsQueue {
		constructor(options?: JobsQueue['Options'])

		queued: number
		queuedJobList: { list: object }
		inprogressJobList: { list: object }

		enqueue(callback: (...args: any[]) => void, options?: JobsQueue['Options']): JobsQueue['JobContoller']
	}

	const exportFn: (options?: JobsQueue['Options']) => JobsQueue

	export = exportFn
}
