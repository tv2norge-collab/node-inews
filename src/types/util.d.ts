export interface NodeCallback<T> {
	(err: NodeJS.ErrnoException, result?: null): void
	(err: undefined | null, result: T): void
}
