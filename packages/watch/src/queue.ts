interface QueueWaiter<Value> {
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (result: IteratorResult<Value>) => void;
}

export class AsyncQueue<Value>
  implements AsyncIterable<Value>, AsyncIterator<Value>
{
  readonly #values: Value[] = [];
  readonly #waiters: QueueWaiter<Value>[] = [];
  #closed = false;
  #failure: unknown;

  [Symbol.asyncIterator](): AsyncIterator<Value> {
    return this;
  }

  next(): Promise<IteratorResult<Value>> {
    const value = this.#values.shift();
    if (value !== undefined) {
      return Promise.resolve({ done: false, value });
    }
    if (this.#failure !== undefined) {
      const failure = this.#failure;
      this.#failure = undefined;
      return Promise.reject(
        failure instanceof Error
          ? failure
          : new Error('Async queue failed', { cause: failure }),
      );
    }
    if (this.#closed) {
      return Promise.resolve({ done: true, value: undefined });
    }
    return new Promise<IteratorResult<Value>>((resolve, reject) => {
      this.#waiters.push({ reject, resolve });
    });
  }

  push(value: Value): void {
    if (this.#closed) return;
    const waiter = this.#waiters.shift();
    if (waiter === undefined) this.#values.push(value);
    else waiter.resolve({ done: false, value });
  }

  fail(error: unknown): void {
    if (this.#closed) return;
    this.#closed = true;
    const waiter = this.#waiters.shift();
    if (waiter === undefined) this.#failure = error;
    else waiter.reject(error);
    for (const remaining of this.#waiters.splice(0)) {
      remaining.resolve({ done: true, value: undefined });
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter.resolve({ done: true, value: undefined });
    }
  }
}
