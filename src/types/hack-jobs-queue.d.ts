export interface JobsQueue {
	Options: {
		maxSimultaneous: number
	}

	JobContoller: {
		cancel: () => void
		complete: () => void
		restart: () => void
	}
}
